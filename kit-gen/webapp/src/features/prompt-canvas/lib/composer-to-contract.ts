import {
  contractSchema,
  slugify,
  type Component,
  type Contract,
  type Sheet,
} from "@/lib/types/contract";
import {
  CHARACTER_ID,
  DEFAULT_SHEET_LIMITS,
  HINT_BG,
  HINT_POSE,
  HINT_SQUARE,
  MAIN_VARIANT_ID,
  POSE_NOTE,
  buildVariantStyle,
  mergeElementSkel,
  poseSpecFor,
  resolveElementSpec,
  type SheetLimits,
} from "@/features/kit-core/lib/kitset-to-contract";
import type { StyleAxes } from "@/features/kit-core/lib/model";
import { STYLE_AXIS_IDS } from "@/features/kit-form/lib/form-model";
import { describeBrandColors } from "@/features/prompt-lab/lib/brand-colors";
import { INHERIT, phraseOf, type PillKind } from "@/features/prompt-lab/lib/pill-registry";
import { getPresets, type PresetBundle } from "@/features/prompt-lab/lib/presets-store";
import { NODE } from "@/features/prompt-lab/lib/schema";
import { SQUARE_CANVAS_PX, skelSizeOf } from "@/features/prompt-lab/lib/cell-size";
import { SCAFFOLDS } from "@/features/prompt-lab/lib/doc-templates";
import { freeText, makeContext, serializeDoc, tidy, type PromptDocNode } from "@/features/prompt-lab/lib/serialize";
import { contextFreeText } from "@/features/prompt-lab/lib/serialize-composer";
import type { Block, ComposerState, DocBlock, UiKitBlock } from "@/features/prompt-lab/lib/composer-model";
import { readPillImage, type PillImage } from "./pill-image";
import type { ComposerDoc } from "./composer-doc";

/**
 * composer-to-contract.ts — TÀI LIỆU COMPOSER → `Contract` mà `gen.sh` ăn được.
 *
 * ╔══ ĐÂY LÀ CHỖ NỐI ĐÃ ĐƯỢC HẸN TRƯỚC ══════════════════════════════════════╗
 * ║ `serialize-composer.ts` của lab tự ghi ở đầu file: "nếu mai này nối vào    ║
 * ║ KitGen thật thì chỗ nối nằm ĐÚNG Ở ĐÂY — đổi hàm này thành                 ║
 * ║ `composerToContract()` là xong". File này là cái hẹn đó, và nó ĐỨNG CẠNH   ║
 * ║ chứ không thay: `serializeComposer()` vẫn sinh prompt để dán tay vào       ║
 * ║ ChatGPT, hàm này sinh contract để máy tự vẽ. Hai đích khác nhau, cùng một  ║
 * ║ nguồn — nên chúng KHÔNG được có hai cách đọc tài liệu khác nhau, và đó là  ║
 * ║ lý do cả hai đi qua `serializeDoc()`/`phraseOf()` chứ không tự duyệt cây.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ HAI CHẾ ĐỘ CỦA BLOCK ĐI VÀO HAI TRƯỜNG KHÁC NHAU ══════════════════════
 *  · `template` ⇒ pill được dịch thành MÔ TẢ Ô (`components[].spec`), còn chữ
 *    người dùng gõ THÊM ngoài khung template thành `sheet.directive` — đúng
 *    nghĩa "một dòng chỉ đạo chèn vào prompt" mà `gen.sh:760` đọc.
 *  · `free` ⇒ cả câu thành `sheet.promptOverride`, thứ `gen.sh:973` dùng để
 *    THAY TRỌN prompt của tấm. Người dùng đã chọn phá khuôn thì contract không
 *    được lén dựng lại cái khuôn ấy quanh chữ của họ.
 *
 * ══ VÌ SAO CHẾ ĐỘ TEMPLATE KHÔNG NHÉT NGUYÊN CÂU VÀO `spec` ═══════════════
 * Vì câu ấy có SCAFFOLDING TIẾNG VIỆT ("Vẽ cảnh nền …, không khí …"). Với một
 * prompt dán vào ChatGPT thì tiếng Việt vô hại; với `spec` của một ô trong
 * spritesheet — nơi mọi mô tả khác trong contract đều là tiếng Anh và câu này bị
 * ghép vào giữa một prompt tiếng Anh — thì nó là nhiễu. Ở chế độ template mọi
 * thông tin nằm trong PILL, nên dịch từ pill là ĐỦ, không mất gì.
 * Pill lạ (người dùng gõ `/` chèn thêm) KHÔNG bị thả rơi: xem `leftover` bên dưới.
 */

/* ══════════════════════════════════════════════════════════════════════════
   1. Hằng số riêng của bộ dịch này
   ══════════════════════════════════════════════════════════════════════════ */

/** Trần ô mỗi tấm — cùng luật với `buildKitsetContract` (lưới vuông 4×4). */
const MAX_CELLS_SQUARE = 16;

/**
 * Skeleton mặc định của một ô UI kit — dùng khi dòng KHÔNG chọn cỡ.
 *
 * ⚠️ NÓI THẲNG GIỚI HẠN: danh mục element của composer (`presets-store.ts`) chỉ có
 * chữ (`vi`/`en`), KHÔNG có hình học — nó là danh mục do người dùng tự sửa, không
 * phải `element-lib.json`. Nên mọi ô ra cùng một khung `rrect` cỡ vừa. Đây là một
 * MẶC ĐỊNH TRUNG TÍNH, không phải một phép đo: nó chỉ quyết định ô skeleton vẽ ra
 * to bằng nào, còn hình thù thật do máy vẽ quyết theo `spec`.
 *
 * Từ 08/2026 dòng element CÓ pill cỡ (`UiCell.sizeId`), và cỡ ấy đè lên đây —
 * xem `cell-size.ts`. Giữ nguyên hằng này làm ĐƯỜNG LÙI chứ không bỏ: mọi dòng
 * của mọi dự án đang có đều chưa chọn cỡ, và một lượt sửa không được đổi kích
 * thước những thứ người dùng đã vẽ xong.
 */
const CELL_SKEL = { shape: "rrect" as const, w: 0.8, h: 0.6 };

/**
 * KHỔ CANVAS CỦA TẤM BỘ UI — vuông.
 *
 * ╔══ VÌ SAO LƯỚI UI PHẢI VUÔNG ═════════════════════════════════════════════╗
 * ║ Chủ sản phẩm: *«canvas lưới UI 1:1»*. Lý do hình học: `squareGrid` xếp ô   ║
 * ║ thành n×n, nên trên canvas ngang 1536×1024 mỗi ô ra 3:2 — và một cái nút   ║
 * ║ hay một huy hiệu thì không phải hình 3:2. Máy vẽ được giao một ô dẹt sẽ vẽ ║
 * ║ món đồ dẹt theo, rồi `slice.py` cắt đúng cái dẹt ấy ra file.               ║
 * ║ Canvas vuông + lưới n×n ⇒ ô 1:1, và món đồ được vẽ đúng tỉ lệ của nó.      ║
 * ║                                                                            ║
 * ║ `orient` VẪN ĐƯỢC GHI (`landscape`) bên cạnh: contract đời trước chỉ biết  ║
 * ║ `orient`, và bỏ nó đi là mọi bản engine chưa cập nhật đọc tấm này thành    ║
 * ║ mặc định của chúng. Có cả hai thì `canvas` thắng — xem `sheetSchema`.      ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
const UI_CANVAS = "square" as const;

/** Khung xương ô dáng — số của `styles.json` thật, giống hệt `buildKitsetContract`. */
const POSE_SKEL = { shape: "pose" as const, w: 0.3, h: 0.85 };

/** Dáng dùng khi block Nhân vật không có pill dáng nào. `POSE_SPEC` có mục cho nó. */
const DEFAULT_POSE = "idle";

/**
 * Nấc giữa của 8 trục phong cách.
 *
 * Composer CHƯA có thanh trượt trục nào — nó tả phong cách bằng câu chữ. Nhưng
 * `buildVariantStyle()` (dùng chung với workflow) đòi đủ 8 trục, nên chỗ này trả
 * về đúng bản mặc định của một dự án workflow mới (`normalizeStyleAxes(null)`).
 * KHÔNG import `normalizeStyleAxes` từ `model.ts`: file đó dựng cả store zustand
 * ở tầng module, kéo nó vào một bộ dịch thuần là kéo cả UI vào ca test.
 */
const AXIS_MID = 4;

function defaultStyleAxes(): StyleAxes {
  return Object.fromEntries(STYLE_AXIS_IDS.map((id) => [id, AXIS_MID])) as StyleAxes;
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Đọc một tài liệu TipTap: pill nào, ảnh nào
   ══════════════════════════════════════════════════════════════════════════ */

interface PillHit {
  kind: PillKind;
  value: string;
}

interface DocScan {
  /** Mọi pill chọn-một, THEO THỨ TỰ trong câu. */
  pills: PillHit[];
  /** Mọi ảnh đã tải lên xong. Ảnh đang tải dở chưa có `path` ⇒ không lọt vào đây. */
  images: PillImage[];
}

/**
 * Duyệt cây tài liệu, nhặt pill và ảnh.
 *
 * Nhánh `default` đi TIẾP vào ruột node lạ, cùng lý do với `walkInline()` của
 * `serialize.ts`: một mark bọc quanh pill (hoặc một node của đời code sau) mà bị
 * bỏ qua thì cái pill bên trong biến mất khỏi contract — im lặng, không lỗi.
 */
function scanDoc(node: PromptDocNode | null | undefined, out: DocScan = { pills: [], images: [] }): DocScan {
  if (!node) return out;
  if (node.type === NODE.optionPill) {
    const kind = typeof node.attrs?.["kind"] === "string" ? (node.attrs["kind"] as PillKind) : null;
    const value = typeof node.attrs?.["value"] === "string" ? (node.attrs["value"] as string) : "";
    if (kind) out.pills.push({ kind, value });
    return out;
  }
  if (node.type === NODE.imagePill) {
    const image = readPillImage(node.attrs);
    if (image.path) out.images.push(image);
    return out;
  }
  for (const child of node.content ?? []) scanDoc(child, out);
  return out;
}

/** Lấy RA (và bỏ khỏi danh sách) pill đầu tiên của một kind — xem `leftover`. */
function take(scan: DocScan, kind: PillKind): string {
  const at = scan.pills.findIndex((p) => p.kind === kind);
  if (at === -1) return "";
  const [hit] = scan.pills.splice(at, 1);
  return hit?.value ?? "";
}

/**
 * Cụm tiếng Anh của những pill CHƯA ĐƯỢC DÙNG.
 *
 * Người dùng gõ `/` chèn được pill chất liệu vào giữa câu Cảnh nền. Bộ dịch
 * không biết trước điều đó, và "không biết" tuyệt đối không được thành "bỏ đi":
 * pill họ chèn vào là một yêu cầu họ gõ ra, thấy trên màn, và mong nó tới máy vẽ.
 * Pill để trống (giá trị kế thừa) ra chuỗi rỗng nên tự rụng — đúng ý, vì cái
 * chung đã nằm ở `variant.style` rồi.
 */
function leftover(scan: DocScan, presets: PresetBundle): string[] {
  return scan.pills.map((p) => phraseOf(p.kind, p.value, presets)).filter((text) => text !== "");
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Lưới + ô trống — cùng quy ước với `buildKitsetContract`
   ══════════════════════════════════════════════════════════════════════════ */

/** Lưới vuông ⇒ ô thừa hưởng tỷ lệ canvas 3:2 (kitset-to-contract.ts:387). */
function squareGrid(n: number): { cols: number; rows: number } {
  const side = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  return { cols: side, rows: side };
}

/**
 * Ô trống. Tên `_empty-N` là BẮT BUỘC chứ không phải trang trí: `file` rỗng lặp
 * lại từ ô trống thứ hai là vi phạm V-02 (tên trùng trong tấm) và
 * `contractSchema.parse` sẽ ném. Đúng quy ước của `styles.json` thật.
 */
function emptyCell(n: number): Component {
  return { file: `_empty-${n}`, vi: "", spec: "", skel: { shape: "empty" } };
}

function padTo(cells: Component[], capacity: number): Component[] {
  const out = [...cells];
  for (let i = out.length; i < capacity; i += 1) out.push(emptyCell(i - cells.length + 1));
  return out;
}

/** `nen`, `nen2`, `nen3`… — đúng quy ước `styles.json` (KHÔNG phải `nen-2`). */
function seriesId(base: string, index: number): string {
  return index === 0 ? base : `${base}${index + 1}`;
}

function chunkBySize<T>(items: readonly T[], max: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += max) out.push(items.slice(i, i + max));
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Hàm chính
   ══════════════════════════════════════════════════════════════════════════ */

export interface ComposerContractOptions {
  /** Danh mục element/phong cách. Mặc định kho của người dùng. */
  presets?: PresetBundle;
  /** Tên bộ kit — chỉ đi vào `variant.vi`, KHÔNG đi vào id (xem `MAIN_VARIANT_ID`). */
  kitName?: string;
  /** 8 trục phong cách nếu màn có chúng; thiếu ⇒ nấc giữa (xem `AXIS_MID`). */
  styleAxes?: StyleAxes | null;
  /** "Điều không muốn" — đi vào `avoid: …` cuối `variant.style`. */
  styleAvoid?: string;
  /** Ngưỡng cắt của `slice.py`. Mặc định giống bản nháp workflow. */
  sliceThreshold?: number;
  /** Trần ô mỗi tấm. Chỉ `small` có nghĩa ở đây (block UI kit). */
  limits?: Partial<SheetLimits>;
}

const DEFAULT_SLICE_THRESHOLD = 120;

/** Nhận cả tài liệu đã lưu lẫn trạng thái trần — nơi gọi không phải bóc vỏ. */
function stateOf(input: ComposerDoc | ComposerState): ComposerState {
  return "composer" in input ? input.composer : input;
}

/**
 * Một block Cảnh nền → một tấm 1×1.
 *
 * MỖI CẢNH NỀN MỘT TẤM RIÊNG, không gộp — đây là `DEFAULT_SHEET_LIMITS.background = 1`
 * và lý do đầy đủ (đo trên dự án thật: gộp 2 nền ⇒ ô 764×1024 thay vì 1024×1536)
 * nằm ở khối chú thích của chính hằng số ấy. Ở đây quan hệ còn thẳng hơn: một
 * block = một cảnh người dùng viết ra, nên một block = một tấm.
 */
function backgroundSheet(block: DocBlock, index: number, presets: PresetBundle, styleEN: string, themeEN: string): Sheet | null {
  const scan = scanDoc(block.doc as PromptDocNode);
  const ctx = makeContext({ styleEN, themeEN, presets, imageCounter: { count: 0 } });
  const line = serializeDoc(block.doc as PromptDocNode, ctx);
  if (block.mode === "free" && !line) return null;

  const scene = phraseOf("scene", take(scan, "scene"), presets);
  const mood = phraseOf("mood", take(scan, "mood"), presets);
  const spec = tidy([scene || "a game screen background", mood, ...leftover(scan, presets)].filter(Boolean).join(", "));
  if (block.mode !== "free" && !scene && !mood && scan.pills.length === 0 && !line) return null;

  const note = block.mode === "free" ? "" : freeText(block.doc as PromptDocNode, SCAFFOLDS.background);
  const ref = scan.images[0]?.path ?? "";

  return {
    id: seriesId("nen", index),
    /* Nền là ô DUY NHẤT phủ kín màn hình ⇒ tấm dọc 1×1, đúng `bg-home`/`bg-play`
       của `styles.json`. */
    orient: "portrait",
    grid: { cols: 1, rows: 1 },
    cell_hint: HINT_BG,
    ...(ref ? { ref } : {}),
    ...(block.mode === "free" ? { promptOverride: line } : note ? { directive: note } : {}),
    components: [{ file: "01-nen", vi: "Cảnh nền", spec: block.mode === "free" ? line : spec, skel: { shape: "full", w: 1, h: 1 } }],
  };
}

/**
 * Một block Nhân vật → một tấm dáng 1×1.
 *
 * `poseSpecFor()` chứ không phải cụm chữ của pill: pill trả `"a idle pose"` (id
 * ghép máy móc), còn `POSE_SPEC` là câu đã chạy thật trong `styles.json`
 * ("standing still in a neutral relaxed idle pose, facing the viewer") và nó biết
 * cách NHÉT NÉT MẶT vào đúng chỗ thay vì nối thêm một mệnh đề đá nhau.
 */
function mascotSheet(block: DocBlock, index: number, presets: PresetBundle, styleEN: string, themeEN: string): { sheet: Sheet; pose: string; ref: string } | null {
  const scan = scanDoc(block.doc as PromptDocNode);
  const ctx = makeContext({ styleEN, themeEN, presets, imageCounter: { count: 0 } });
  const line = serializeDoc(block.doc as PromptDocNode, ctx);
  if (block.mode === "free" && !line) return null;

  const pose = take(scan, "pose") || DEFAULT_POSE;
  const expression = phraseOf("expression", take(scan, "expression"), presets);
  /* Trang phục để trống = theo theme chung — cùng luật `INHERIT` của pill, và
     `themeEN` chính là thứ pill ấy kế thừa khi serialize. */
  const outfitValue = take(scan, "outfit");
  const outfit = outfitValue === INHERIT ? themeEN : phraseOf("outfit", outfitValue, presets);
  const ref = scan.images[0]?.path ?? "";

  /* Có ảnh mẫu thì SUBJECT là chính tấm ảnh ấy (kèm `note` POSE_NOTE ở tấm);
     không có thì phải tả bằng chữ, nếu không máy vẽ tự bịa ra một con khác nhau
     ở mỗi lượt. */
  const base = ref ? "the SAME character from the reference photo" : "the same original mascot character";
  const subject = outfit ? `${base} wearing ${outfit}` : base;
  const spec = tidy([subject, poseSpecFor(pose, expression), ...leftover(scan, presets), "full body"].filter(Boolean).join(", "));

  const note = block.mode === "free" ? "" : freeText(block.doc as PromptDocNode, SCAFFOLDS.mascot);

  return {
    pose,
    ref,
    sheet: {
      id: seriesId("nhan-vat", index),
      orient: "landscape",
      grid: { cols: 1, rows: 1 },
      cell_hint: HINT_POSE,
      ...(ref ? { ref, note: POSE_NOTE } : {}),
      ...(block.mode === "free" ? { promptOverride: line } : note ? { directive: note } : {}),
      components: [
        {
          /* Tên ô KHÔNG mang tiền tố `pose-` như `styles.json`: agent
             (`validate.mjs:63`) chỉ miễn luật tên file cho `shape:"empty"`, nên
             `pose-…` là contract client cho qua mà server từ chối ghi. Bài học đã
             trả giá một lần ở `buildKitsetContract`, không trả lại lần hai. */
          file: "01-nhan-vat",
          vi: "Nhân vật",
          spec: block.mode === "free" ? line : spec,
          skel: { ...POSE_SKEL, pose },
        },
      ],
    },
  };
}

/**
 * Một block Bộ UI → một hoặc nhiều tấm, mỗi tấm ≤ trần ô.
 *
 * ══ CHẾ ĐỘ TỰ DO CỦA DÒNG ĐI VÀO `spec`, KHÔNG VÀO `directive` ═════════════
 * Đây là một lựa chọn có hai đường và chỉ một đường đúng. `sheet.directive` là
 * MỘT dòng chỉ đạo cho CẢ TẤM (`gen.sh:760`), mà một tấm UI kit chứa tới 16 ô
 * của 16 element khác nhau — nhét câu tự do của dòng #3 vào đó là bảo máy vẽ áp
 * nó cho cả 15 ô còn lại. `components[].spec` mới là "ô này vẽ cái gì", và một
 * dòng element CHÍNH LÀ một ô. Nên: câu tự do của dòng → `spec` của đúng ô ấy.
 *
 * (Hai block có câu chữ thì ngược lại — ở đó cả block chỉ sinh MỘT ô phủ kín
 * tấm, nên `promptOverride` cấp tấm mới là chỗ đúng. Xem khối chú thích đầu file.)
 */
function uiKitSheets(block: UiKitBlock, startIndex: number, presets: PresetBundle, limit: number): Sheet[] {
  if (block.cells.length === 0) return [];
  /* Ngữ cảnh RỖNG có chủ ý: pill `style`/`outfit` để trống nghĩa là "theo cái
     chung", và cái chung đã nằm ở `variant.style` — nơi `gen.sh` chèn nó vào MỌI
     tấm. Trả về `ctx.styleEN` ở đây là nhắc lại phong cách trong từng ô, đúng
     thứ mà `composerToContract` tự cấm ở dòng dựng `stylePrompt`. */
  const freeCtx = makeContext({ styleEN: "", themeEN: "", presets, imageCounter: { count: 0 } });

  return chunkBySize(block.cells, limit).map((chunk, i) => {
    const grid = squareGrid(chunk.length);
    /* Ô vuông ⇒ một cạnh là đủ. Chia theo LƯỚI THẬT của tấm này, không theo ô
       tham chiếu 4×4: một tấm 4 món có lưới 2×2 ⇒ ô 627px, và cỡ "S · 112px"
       phải vẫn ra 112 pixel thật ở đó. Xem `skelSizeOf`. */
    const cellPx = SQUARE_CANVAS_PX / grid.cols;
    const cells: Component[] = chunk.map((cell, k) => {
      const element = presets.elements.find((preset) => preset.id === cell.elementId);
      /* Phong cách của ô: rỗng = theo phong cách chung — CÙNG luật với pill
         `style` và với `cellLine()` của bộ serialize. Ba nơi phải nói một điều. */
      const style = cell.styleId ? phraseOf("style", cell.styleId, presets) : "";
      const decor = phraseOf("decor", cell.decor, presets);
      /* DANH TỪ ĐỨNG ĐẦU, rồi mới tới phong cách và mức viền. `element.en` nay là
         một danh từ thuần ("popover"), không còn là câu mô tả có sẵn thuộc tính —
         xem `ElementPreset.en`. Nhờ vậy thứ tự này đọc ra đúng một câu tiếng Anh:
         "popover, chunky cartoon style, a thick beveled frame…". */
      const text = [element?.en ?? cell.elementId, style, decor].filter(Boolean).join(", ");
      /* `resolveElementSpec` là nơi DUY NHẤT biết cách nối đục nền (và mức kính)
         vào mô tả một ô — dùng lại thay vì chép luật nối chuỗi sang đây. */
      const glaze = { glaze: cell.glazeId };
      const templateSpec = tidy([resolveElementSpec({ spec: text, skel: CELL_SKEL }, glaze), cell.note.trim()].filter(Boolean).join(", "));
      /* Câu tự do RỖNG (người dùng xoá sạch dòng) ⇒ rơi về khuôn, KHÔNG ra ô
         không mô tả gì. Bỏ hẳn ô đi thì lưới tụt một bậc và mọi ô sau nhảy chỗ —
         một dòng bị xoá chữ không được kéo theo cả tấm đổi bố cục. */
      const freeSpec = block.mode === "free" ? tidy(serializeDoc(cell.doc as PromptDocNode, freeCtx)) : "";
      const spec = freeSpec || templateSpec;
      /* CÁCH TÁCH đi cùng đục nền — `mergeElementSkel` là nơi biết luật ấy. Ở chế
         độ TỰ DO cũng vậy: người dùng viết lại CÂU CHỮ, không viết lại cách slicer
         cắt ô, nên `matte` vẫn phải theo pill họ bấm.
         CỠ đè lên `w`/`h` sau cùng; không chọn cỡ ⇒ giữ nguyên khung mặc định. */
      const size = skelSizeOf(cell.sizeId, cellPx);
      const skel = mergeElementSkel(CELL_SKEL, { ...glaze, ...(size ?? {}) });
      return {
        file: `${String(k + 1).padStart(2, "0")}-${slugify(cell.elementId) || "o"}`,
        vi: element?.vi ?? cell.elementId,
        spec,
        skel: { ...skel },
      };
    });
    return {
      id: seriesId("ui", startIndex + i),
      /* `orient` giữ lại cho engine đời cũ; `canvas` mới là thứ quyết định — xem
         khối chú thích của `UI_CANVAS`. */
      orient: "landscape",
      canvas: UI_CANVAS,
      grid,
      cell_hint: HINT_SQUARE,
      components: padTo(cells, grid.cols * grid.rows),
    };
  });
}

/**
 * `ComposerDoc` → `Contract`. Ném `ZodError` khi sinh ra thứ không hợp lệ.
 *
 * Ném là CÓ CHỦ Ý, giống `buildKitsetContract`: thà đỏ ở client còn hơn để
 * `gen.sh` (`assert len(comps) == cols*rows`) nổ giữa chừng sau khi đã tiêu lượt.
 */
/**
 * TẤM CỦA TỪNG BLOCK — bước trung gian mà cả contract lẫn màn hình cùng đọc.
 *
 * ╔══ VÌ SAO PHẢI CÓ, THAY VÌ ĐỂ MÀN TỰ ĐOÁN ID TẤM ═════════════════════════╗
 * ║ Màn thật cần trả lời hai câu cho TỪNG THẺ trên trang: "bấm Gen thì vẽ     ║
 * ║ những job nào" và "xem prompt của thẻ này là xem prompt tấm nào". Cả hai   ║
 * ║ đều là ánh xạ block → id tấm, mà id tấm KHÔNG suy được từ vị trí block:   ║
 * ║ block rỗng không sinh tấm nào (nên không tiêu một số thứ tự nào), còn một ║
 * ║ block UI kit 20 ô sinh HAI tấm. Đoán lại luật ấy ở màn là chép luật —      ║
 * ║ và ngày nào đó hai bản luật lệch nhau thì nút Gen vẽ nhầm tấm của người    ║
 * ║ hàng xóm, im lặng, sau khi đã tiêu quota.                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface BlockSheets {
  blockId: string;
  kind: Block["kind"];
  /** Tấm block này sinh ra, THEO THỨ TỰ. Rỗng ⇒ block chưa có gì để vẽ. */
  sheets: Sheet[];
  /** Dáng của block Nhân vật; rỗng với block khác. */
  pose: string;
  /** Ảnh mẫu của block Nhân vật (`refs/…`); rỗng khi không có. */
  ref: string;
}

/** Duyệt các block đúng MỘT lần, đúng MỘT bộ luật — nguồn của cả hai hàm dưới. */
export function composerBlockSheets(
  input: ComposerDoc | ComposerState,
  opts: ComposerContractOptions = {},
): BlockSheets[] {
  const state = stateOf(input);
  const presets = opts.presets ?? getPresets();
  const styleEN = phraseOf("style", state.styleId, presets);
  const themeEN = phraseOf("theme", state.themeValue, presets);

  /* Đếm RIÊNG theo loại: thứ tự tấm bám thứ tự block trên màn (người dùng nhìn
     thấy), còn hậu tố `2`, `3` bám số tấm CÙNG LOẠI. */
  const seen = { background: 0, mascot: 0, uikit: 0 };
  const limitSmall = Math.min(
    Number.isInteger(opts.limits?.small) && Number(opts.limits?.small) > 0
      ? Number(opts.limits?.small)
      : DEFAULT_SHEET_LIMITS.small,
    MAX_CELLS_SQUARE,
  );

  const out: BlockSheets[] = [];
  for (const block of state.blocks as Block[]) {
    if (block.kind === "uikit") {
      const made = uiKitSheets(block, seen.uikit, presets, limitSmall);
      seen.uikit += made.length;
      out.push({ blockId: block.id, kind: "uikit", sheets: made, pose: "", ref: "" });
      continue;
    }
    if (block.kind === "background") {
      const sheet = backgroundSheet(block, seen.background, presets, styleEN, themeEN);
      if (sheet) seen.background += 1;
      out.push({ blockId: block.id, kind: "background", sheets: sheet ? [sheet] : [], pose: "", ref: "" });
      continue;
    }
    const made = mascotSheet(block, seen.mascot, presets, styleEN, themeEN);
    if (made) seen.mascot += 1;
    out.push({
      blockId: block.id,
      kind: "mascot",
      sheets: made ? [made.sheet] : [],
      pose: made?.pose ?? "",
      ref: made?.ref ?? "",
    });
  }
  return out;
}

/**
 * PROMPT TỔNG PHONG CÁCH — chính chuỗi đi vào `variant.style`.
 *
 * ╔══ VÌ SAO NÓ PHẢI XUẤT RA CHO MÀN HÌNH ĐỌC ═══════════════════════════════╗
 * ║ Chủ sản phẩm: *"prompt này phải copy cả prompt của phong cách — có prompt  ║
 * ║ tổng"*. `gen.sh` chèn câu này vào ĐẦU prompt của MỌI tấm, nên nó là câu có ║
 * ║ sức nặng nhất trong cả bộ kit — và cho tới lượt này nó là câu người dùng   ║
 * ║ KHÔNG nhìn thấy ở đâu cả: tab Prompt chỉ hiện prompt của tấm, còn khối     ║
 * ║ Ngữ cảnh chung thì hiện các pill chứ không hiện chuỗi ghép ra.             ║
 * ║                                                                            ║
 * ║ Xuất ra ở ĐÂY chứ không dựng lại ở màn: đây là nơi `composerToContract`     ║
 * ║ dựng nó, và hai bản ghép là hai câu sẽ lệch nhau sau đúng một lượt sửa —   ║
 * ║ mà lệch ở đây nghĩa là thứ người dùng ĐỌC không phải thứ máy vẽ NHẬN.      ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
export function composerStyleLine(
  input: ComposerDoc | ComposerState,
  opts: ComposerContractOptions = {},
): string {
  const state = stateOf(input);
  const presets = opts.presets ?? getPresets();
  const stylePrompt =
    contextFreeText(state, presets) ||
    [
      phraseOf("style", state.styleId, presets),
      phraseOf("theme", state.themeValue, presets),
      describeBrandColors(state.brandColors),
    ]
      .filter(Boolean)
      .join(", ");
  return buildVariantStyle({
    stylePrompt,
    styleAxes: opts.styleAxes ?? defaultStyleAxes(),
    styleAvoid: opts.styleAvoid ?? "",
  });
}

export function composerToContract(input: ComposerDoc | ComposerState, opts: ComposerContractOptions = {}): Contract {
  const state = stateOf(input);
  const presets = opts.presets ?? getPresets();

  const sheets: Sheet[] = [];
  const poses: string[] = [];
  let characterRef = "";

  for (const made of composerBlockSheets(input, opts)) {
    sheets.push(...made.sheets);
    if (made.kind !== "mascot" || made.sheets.length === 0) continue;
    if (made.pose && !poses.includes(made.pose)) poses.push(made.pose);
    if (!characterRef && made.ref) characterRef = made.ref;
  }

  /* Câu theme tổng + phong cách + bộ màu = MỘT mệnh đề mô tả cả bộ kit, đặt ở
     `variant.style` — nơi `gen.sh` chèn nó vào MỌI tấm. Nhắc lại ở từng ô là dạy
     máy vẽ rằng mỗi element có bảng màu riêng, ngược hẳn ý "một bộ nhận diện"
     (cùng lập luận với `serializeComposer`). */
  /**
   * ══ CHẾ ĐỘ TỰ DO: THAY `stylePrompt`, KHÔNG THAY `buildVariantStyle` ═══════
   * `buildVariantStyle` = `stylePrompt` + 7 trục ngữ nghĩa (`styleAxes`) + mệnh
   * đề `avoid:`. Ba phần ấy đến từ BA CHỖ KHÁC NHAU trên màn hình, và câu tự do
   * chỉ là bản viết lại của phần ĐẦU — người dùng không có ô nào để diễn đạt
   * trục ngữ nghĩa hay điều-không-muốn bằng văn xuôi. Nên thay cả cụm
   * `buildVariantStyle` bằng câu tự do là lặng lẽ vứt hai thiết lập mà họ đã đặt
   * ở chỗ khác và vẫn đang thấy trên màn.
   * Thay đúng `stylePrompt` là phép đổi 1-1: cùng vai trò, cùng chỗ trong câu.
   *
   * Câu tự do RỖNG ⇒ lùi về bản ghép. Một `variant.style` mất mệnh đề mô tả bộ
   * kit là bộ kit không còn phong cách nào cả — im lặng gửi đi vẽ như thế thì
   * tốn lượt mà ra ảnh không ai nhận ra.
   */
  return contractSchema.parse({
    schemaVersion: 4,
    sheets,
    variants: [
      {
        id: MAIN_VARIANT_ID,
        vi: (opts.kitName ?? "").trim() || "Phong cách chính",
        /* MỘT chỗ dựng câu này, và tab Prompt đọc CHÍNH nó — xem `composerStyleLine`. */
        style: composerStyleLine(state, { ...opts, presets }),
        styleMode: "prompt",
        brand: {
          /* Composer tả màu bằng CHỮ trong `style` (xem `describeBrandColors`), nhưng
             hex vẫn phải nằm ở `brand` — `gen.sh` chèn dòng palette từ đây, và đó là
             chỗ duy nhất con số thương hiệu đi tới máy vẽ nguyên vẹn. */
          mode: "colors",
          primary: state.brandColors[0] ?? "",
          secondary: state.brandColors[1] ?? "",
          refs: [],
        },
        ...(poses.length > 0
          ? { characters: [{ id: CHARACTER_ID, vi: "Nhân vật", ref: characterRef || null, poses }] }
          : {}),
        inspo: [],
      },
    ],
    characterPoses: poses,
    slice: { threshold: opts.sliceThreshold ?? DEFAULT_SLICE_THRESHOLD },
  });
}

/**
 * Contract đầy đủ → contract CHỈ CÒN mấy tấm được nêu tên.
 *
 * ╔══ DÙNG Ở ĐÂU, VÀ VÌ SAO KHÔNG ĐỘNG VÀO `variants` ═══════════════════════╗
 * ║ Tab "Prompt" của một thẻ hỏi `POST /prompt-preview` — mà endpoint ấy CHẠY  ║
 * ║ ENGINE THẬT và GHI ĐÈ `prompts/` của dự án. Gửi cả contract để rồi vứt đi  ║
 * ║ 9/10 kết quả là bắt máy dựng 10 prompt cho một cái người ta muốn xem, mỗi  ║
 * ║ lần mở một tab.                                                           ║
 * ║                                                                          ║
 * ║ `variants`, `characterPoses`, `slice` GIỮ NGUYÊN có chủ ý: prompt của một  ║
 * ║ tấm được dựng TRONG ngữ cảnh phong cách + bộ màu + dáng của cả bộ kit.    ║
 * ║ Cắt bớt chúng là xem trước một prompt KHÁC với prompt sẽ chạy thật — đúng  ║
 * ║ cái lời hứa mà cửa xem trước tồn tại để giữ.                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function narrowContractToSheets(contract: Contract, sheetIds: readonly string[]): Contract {
  const keep = new Set(sheetIds);
  return contractSchema.parse({ ...contract, sheets: contract.sheets.filter((sheet) => keep.has(sheet.id)) });
}
