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
  HINT_LANDSCAPE,
  HINT_POSE,
  MAIN_VARIANT_ID,
  POSE_NOTE,
  buildVariantStyle,
  poseSpecFor,
  resolveElementSpec,
  type SheetLimits,
} from "@/features/workflow-v4/lib/kitset-to-contract";
import type { StyleAxes } from "@/features/workflow-v4/lib/model";
import { STYLE_AXIS_IDS } from "@/features/kit-form/lib/form-model";
import { describeBrandColors } from "@/features/prompt-lab/lib/brand-colors";
import { INHERIT, phraseOf, type PillKind } from "@/features/prompt-lab/lib/pill-registry";
import { getPresets, type PresetBundle } from "@/features/prompt-lab/lib/presets-store";
import { NODE } from "@/features/prompt-lab/lib/schema";
import { SCAFFOLDS } from "@/features/prompt-lab/lib/doc-templates";
import { freeText, makeContext, serializeDoc, tidy, type PromptDocNode } from "@/features/prompt-lab/lib/serialize";
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
 * Skeleton mặc định của một ô UI kit.
 *
 * ⚠️ NÓI THẲNG GIỚI HẠN: danh mục element của composer (`presets-store.ts`) chỉ có
 * chữ (`vi`/`en`), KHÔNG có hình học — nó là danh mục do người dùng tự sửa, không
 * phải `element-lib.json`. Nên mọi ô ra cùng một khung `rrect` cỡ vừa. Đây là một
 * MẶC ĐỊNH TRUNG TÍNH, không phải một phép đo: nó chỉ quyết định ô skeleton vẽ ra
 * to bằng nào, còn hình thù thật do máy vẽ quyết theo `spec`. Khi danh mục có thêm
 * hình học (wave sau), thay đúng chỗ này.
 */
const CELL_SKEL = { shape: "rrect" as const, w: 0.8, h: 0.6 };

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

/** Một block Bộ UI → một hoặc nhiều tấm, mỗi tấm ≤ trần ô. */
function uiKitSheets(block: UiKitBlock, startIndex: number, presets: PresetBundle, limit: number): Sheet[] {
  if (block.cells.length === 0) return [];
  return chunkBySize(block.cells, limit).map((chunk, i) => {
    const grid = squareGrid(chunk.length);
    const cells: Component[] = chunk.map((cell, k) => {
      const element = presets.elements.find((preset) => preset.id === cell.elementId);
      /* Phong cách của ô: rỗng = theo phong cách chung — CÙNG luật với pill
         `style` và với `cellLine()` của bộ serialize. Ba nơi phải nói một điều. */
      const style = cell.styleId ? phraseOf("style", cell.styleId, presets) : "";
      const decor = phraseOf("decor", cell.decor, presets);
      const text = [element?.en ?? cell.elementId, style, decor].filter(Boolean).join(", ");
      /* `resolveElementSpec` là nơi DUY NHẤT biết cách nối chất liệu (và mức kính)
         vào mô tả một ô — dùng lại thay vì chép luật nối chuỗi sang đây. */
      const spec = tidy([resolveElementSpec({ spec: text, skel: CELL_SKEL }, { material: cell.materialId }), cell.note.trim()].filter(Boolean).join(", "));
      return {
        file: `${String(k + 1).padStart(2, "0")}-${slugify(cell.elementId) || "o"}`,
        vi: element?.vi ?? cell.elementId,
        spec,
        skel: { ...CELL_SKEL },
      };
    });
    return {
      id: seriesId("ui", startIndex + i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
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

export function composerToContract(input: ComposerDoc | ComposerState, opts: ComposerContractOptions = {}): Contract {
  const state = stateOf(input);
  const presets = opts.presets ?? getPresets();
  const styleEN = phraseOf("style", state.styleId, presets);
  const themeEN = phraseOf("theme", state.themeValue, presets);

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
  const stylePrompt = [styleEN, themeEN, describeBrandColors(state.brandColors)].filter(Boolean).join(", ");

  return contractSchema.parse({
    schemaVersion: 4,
    sheets,
    variants: [
      {
        id: MAIN_VARIANT_ID,
        vi: (opts.kitName ?? "").trim() || "Phong cách chính",
        style: buildVariantStyle({
          stylePrompt,
          styleAxes: opts.styleAxes ?? defaultStyleAxes(),
          styleAvoid: opts.styleAvoid ?? "",
        }),
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
