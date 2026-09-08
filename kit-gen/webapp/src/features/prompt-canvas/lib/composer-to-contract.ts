import {
  contractSchema,
  slugify,
  type Component,
  type Contract,
  type Sheet,
  type Skel,
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
import { STYLE_AXIS_IDS } from "@/features/kit-core/lib/form-model";
import { subjectAxisLine } from "@/features/kit-core/lib/style-phrases";
import { INHERIT, labelOf, phraseOf, type PillKind } from "@/features/prompt-lab/lib/pill-registry";
import { getPresets, hasDecorPlacement, type ElementPreset, type PresetBundle } from "@/features/prompt-lab/lib/presets-store";
import { NODE } from "@/features/prompt-lab/lib/schema";
import {
  CUSTOM_ELEMENT_SKEL, SQUARE_CANVAS_PX, defaultSizePx, sizePx, type SizePx,
} from "@/features/prompt-lab/lib/cell-size";
import { drawBox } from "@/features/kit-core/lib/geometry";
import { SCAFFOLDS } from "@/features/prompt-lab/lib/doc-templates";
import { freeText, makeContext, serializeDoc, tidy, type PromptDocNode } from "@/features/prompt-lab/lib/serialize";
import { contextFreeText, contextOutfitEN, contextStyleEN, contextThemeEN } from "@/features/prompt-lab/lib/serialize-composer";
import type {
  Block,
  ComposerState,
  ContextRef,
  DocBlock,
  MascotBlock,
  MascotPose,
  UiKitBlock,
} from "@/features/prompt-lab/lib/composer-model";
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
 * HÌNH DẠNG CỦA MỘT Ô = hình dạng của LOẠI ELEMENT trong ô đó.
 *
 * ╔══ CÁI BỊ SỬA, VÀ VÌ SAO NÓ KHÔNG PHẢI CHUYỆN NHỎ ═══════════════════════╗
 * ║ Tới 07/09/2026 hàm này trả về MỘT khung `rrect` 0.8×0.6 cho MỌI ô, vì     ║
 * ║ danh mục element của composer chỉ có chữ (`vi`/`en`), không có hình học.  ║
 * ║ Hậu quả đo được trên tấm Bộ UI thật (dự án `test`): prompt hứa cùng một   ║
 * ║ hộp `251x188` cho «health bar» và «avatar frame». Model vẽ đúng hình của  ║
 * ║ chúng — lõi 370×97 và 303×263 — nên cả hai lệch khỏi lời hứa, QA gắn cờ,  ║
 * ║ và ô dán ra Figma sai cỡ. Ta đã đòi một thứ không hợp hình dạng element.  ║
 * ║                                                                          ║
 * ║ Nay `ElementPreset.skel` khai hình dạng thật của từng loại, và ba thứ     ║
 * ║ dưới đây đi ĐÚNG vào contract để engine biết: `shape` (gen.sh in toạ độ   ║
 * ║ safe zone, slice.py nắn lõi về hộp ấy), `slice9` (manifest ghi inset      ║
 * ║ 9-slice), `free` (dao cắt bám lõi).                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Hai tầng, tầng sau đè tầng trước:
 *  ① `skel` của loại element — `shape`, `slice9`, `free` và tỉ lệ gốc;
 *  ② `size` — HỘP VẼ tính bằng PIXEL, chia lại theo ô thật của tấm này.
 *
 * Đục nền KHÔNG có mặt ở đây nữa: nó chỉ còn là CHỮ (`resolveElementSpec`), không
 * còn cờ `skel.matte` nào đi kèm — xem khối đầu `kit-core/lib/glaze.ts`.
 *
 * ⚠️ TẦNG ② KHÔNG CÒN LÀ CỠ NGƯỜI DÙNG CHỌN. Cỡ chọn ở pill «Cỡ» là cỡ ĐẦU RA
 * (`component.out`) — cỡ element phải có khi rời khỏi app. Hộp vẽ thì luôn là hộp
 * LỚN NHẤT vừa lề của ô mà giữ đúng tỉ lệ ấy (`drawBox`), để máy vẽ ăn trọn độ
 * phân giải của ảnh sinh; co về cỡ thật là việc của code lúc xuất.
 *
 * Tầng ② LUÔN có mặt. Bỏ trống nó thì `w`/`h` của ① được đọc như phân số của Ô
 * THẬT — mà ô thật to nhỏ theo lưới, nên cùng một cái nút ra 245px trên lưới 4×4
 * và 489px trên lưới 2×2. Một con số trên màn mà contract không giữ là con số tệ
 * hơn không có.
 *
 * Element người dùng TỰ ĐẶT TÊN không có ①, và rơi về `CUSTOM_ELEMENT_SKEL`
 * (`rrect` 0.8×0.6 — đúng khung trung tính cũ): một cái tên tự gõ không nói được
 * hình dạng nào, nên ở đó thật sự không có gì tốt hơn.
 */
function cellSkel(element: ElementPreset | undefined, size: SizePx | null): Skel {
  const base = element?.skel ?? CUSTOM_ELEMENT_SKEL;
  /* Vẫn đi qua `mergeElementSkel` dù chỉ còn `w`/`h` để trộn: đó cũng là cửa lược
     bỏ `skel.matte` của preset ĐỜI CŨ mà người dùng đã lưu vào thư viện riêng. */
  return mergeElementSkel(base, { ...(size ?? {}) });
}

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

/**
 * Khung xương ô dáng — số của `styles.json` thật, giống hệt `buildKitsetContract`.
 *
 * `shape: "pose"` là TÍN HIỆU NHẬN DIỆN mà `gen.sh` đọc để biết tấm này là tấm
 * nhân vật (xem `mascot_sheet` ở đó). Đổi chuỗi này là làm câm cả nhánh ấy.
 */
const POSE_SKEL = { shape: "pose" as const, w: 0.3, h: 0.85 };

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
  /** Chữ người dùng tự gõ cho pill này — có chữ thì nó THẮNG `value`. */
  custom: string;
}

/**
 * Cụm chữ mà một pill đóng góp vào prompt.
 *
 * Một hàm chứ không phải `hit.custom || phraseOf(...)` rải khắp file: đây là chỗ
 * DUY NHẤT trong bộ dịch biết luật "chữ tự gõ thắng preset", và bốn chỗ đọc pill
 * bên dưới (`scene`, `layout`, `outfit`, `leftover`) đi qua nó. Bỏ sót một chỗ
 * nghĩa là chữ người dùng gõ ra biến mất khỏi ĐÚNG một loại tấm — kiểu hỏng chỉ
 * lộ ra khi ai đó đối chiếu hai tấm cạnh nhau.
 */
function hitPhrase(hit: PillHit | null, presets: PresetBundle): string {
  if (!hit) return "";
  const custom = hit.custom.trim();
  return custom || phraseOf(hit.kind, hit.value, presets);
}

/**
 * Một tấm ảnh trong câu, KÈM loại pill đã mang nó.
 *
 * `kind` là thứ quyết định ảnh đi vào ô nào của contract, và nó phải đi cùng
 * tấm ảnh chứ không suy từ thứ tự: thẻ Background nay có tới hai ảnh mang hai
 * vai trò ngược nhau — ảnh CẢNH (`sheet.ref`, "vẽ ra cái này") và bản PHÁC BỐ
 * CỤC (`sheet.layoutRef`, "chỉ chép chỗ đặt, đừng chép nét"). Lẫn hai tấm ấy là
 * máy vẽ chép nét nguệch ngoạc của bản phác thành tấm nền thành phẩm.
 */
type ScanImage = PillImage & { kind: PillKind | "" };

interface DocScan {
  /** Mọi pill chọn-một, THEO THỨ TỰ trong câu. */
  pills: PillHit[];
  /** Mọi ảnh đã tải lên xong. Ảnh đang tải dở chưa có `path` ⇒ không lọt vào đây. */
  images: ScanImage[];
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
    const custom = typeof node.attrs?.["custom"] === "string" ? (node.attrs["custom"] as string) : "";
    if (kind) out.pills.push({ kind, value, custom });
    /* Pill chọn-một cũng MANG ẢNH từ 09/2026 (theme · phong cách · nhân vật —
       xem attr `path` ở `extensions/OptionPill.tsx`). Quên nhánh này thì tấm ảnh
       nhân vật người dùng vừa tải lên không bao giờ thành `sheet.ref`, và cả tấm
       dáng được vẽ bằng chữ suông trong khi ảnh nằm im trên đĩa. */
    const pillImage = readPillImage(node.attrs);
    if (pillImage.path) out.images.push({ ...pillImage, kind: kind ?? "" });
    return out;
  }
  if (node.type === NODE.imagePill) {
    /* Node ảnh RỜI của bản nháp đời trước — không có `kind` nào để khai, và đó là
       CHÍNH XÁC lý do nó bị khai tử (xem `foldBackgroundLayout`). Vai trò rỗng ⇒
       nó được xử như ảnh của thẻ, đúng chỗ nó vẫn luôn đi tới. */
    const image = readPillImage(node.attrs);
    if (image.path) out.images.push({ ...image, kind: "" });
    return out;
  }
  for (const child of node.content ?? []) scanDoc(child, out);
  return out;
}

/** Lấy RA (và bỏ khỏi danh sách) pill đầu tiên của một kind — xem `leftover`. */
function take(scan: DocScan, kind: PillKind): PillHit | null {
  const at = scan.pills.findIndex((p) => p.kind === kind);
  if (at === -1) return null;
  return scan.pills.splice(at, 1)[0] ?? null;
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
  return scan.pills.map((p) => hitPhrase(p, presets)).filter((text) => text !== "");
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
 * Đường dẫn ảnh của câu ngữ cảnh, lọc theo vai trò và KHỬ TRÙNG LẶP.
 *
 * Khử trùng ở đây chứ không ở `gen.sh`: engine cũng khử (một tệp có thể vừa là
 * `sheet.ref` vừa là ảnh brand), nhưng một mảng có hai lần cùng một tệp là một
 * contract nói dối về việc nó đính bao nhiêu ảnh — và người đọc contract (tab
 * Prompt, log) đọc trước khi engine kịp dọn.
 */
function refPathsOf(state: ComposerState, ...roles: ContextRef["role"][]): string[] {
  const out: string[] = [];
  for (const ref of state.contextRefs ?? []) {
    if (!ref.path || !roles.includes(ref.role)) continue;
    if (!out.includes(ref.path)) out.push(ref.path);
  }
  return out;
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

  const scene = hitPhrase(take(scan, "scene"), presets);
  /* BỐ CỤC đứng SAU khung cảnh trong `spec`: cảnh là "vẽ cái gì", bố cục là "xếp
     vào đâu" — đọc theo đúng thứ tự người ta dựng một tấm nền. Cùng thứ tự với câu
     trên màn, nên prompt đọc ra giống câu đang nhìn.
     Ô «không khí» đã bị bỏ (xem `SCAFFOLD_BACKGROUND`); một pill `mood` còn sót
     trong câu tự do của dự án cũ vẫn đi qua `leftover`, nhưng `pillOptions("mood")`
     trả rỗng nên nó không góp chữ nào — rụng, đúng như đã hẹn. */
  const layout = hitPhrase(take(scan, "layout"), presets);
  const spec = tidy(
    [scene || "a game screen background", layout, ...leftover(scan, presets)].filter(Boolean).join(", "),
  );
  if (block.mode !== "free" && !scene && !layout && scan.pills.length === 0 && !line) return null;

  /* Chữ gõ THÊM ngoài khuôn + ô ghi chú của thẻ — cả hai đều là "lời người thiết kế
     nói cho tấm này", nên cả hai vào `directive`. Ở chế độ tự do câu chữ đã thành
     `promptOverride`, nên chỉ còn ô ghi chú; và nó VẪN đi (xem `DocBlock.note`). */
  const extra = block.mode === "free" ? "" : freeText(block.doc as PromptDocNode, SCAFFOLDS.background);
  const directive = [block.note.trim(), extra].filter(Boolean).join(" — ");
  /* Ảnh của pill BỐ CỤC đi ra `layoutRef`, KHÔNG BAO GIỜ ra `ref`: `gen.sh` tả hai
     trường ấy bằng hai câu ngược nhau, và một bản phác nằm ở `ref` là lệnh "vẽ lại
     bản phác này cho đẹp". Mọi ảnh còn lại của thẻ vẫn là ảnh CẢNH như cũ. */
  const layoutRef = scan.images.find((image) => image.kind === "layout")?.path ?? "";
  const ref = scan.images.find((image) => image.kind !== "layout")?.path ?? "";

  return {
    id: seriesId("nen", index),
    /* Nền là ô DUY NHẤT phủ kín màn hình ⇒ tấm dọc 1×1, đúng `bg-home`/`bg-play`
       của `styles.json`. */
    orient: "portrait",
    grid: { cols: 1, rows: 1 },
    cell_hint: HINT_BG,
    ...(ref ? { ref } : {}),
    ...(layoutRef ? { layoutRef } : {}),
    ...(block.mode === "free" ? { promptOverride: line } : {}),
    ...(directive ? { directive } : {}),
    components: [{ file: "01-nen", vi: "Background", spec: block.mode === "free" ? line : spec, skel: { shape: "full", w: 1, h: 1 } }],
  };
}

/**
 * KẾ HOẠCH TẤM của một thẻ Nhân vật: dòng nào vào tấm nào, tấm ấy lưới bao nhiêu.
 *
 * ╔══ VÌ SAO TÁCH RA THÀNH MỘT HÀM CÔNG KHAI ════════════════════════════════╗
 * ║ Hai nơi cần ĐÚNG cùng một phép chia: bộ dịch này (dựng `components[]`) và  ║
 * ║ `ensurePoseRefs()` (ghép ảnh manơcanh theo đúng lưới ấy). Lệch một nhịp    ║
 * ║ chia là ô thứ k của tấm ảnh dáng không còn nằm chồng lên ô thứ k của tấm   ║
 * ║ sắp vẽ — và lúc đó ảnh tham chiếu dạy máy vẽ một bố cục SAI, im lặng.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface MascotSheetPlan {
  /** Dòng của tấm này, THEO THỨ TỰ ô. */
  poses: MascotPose[];
  grid: { cols: number; rows: number };
}

export function mascotSheetPlan(block: MascotBlock, opts: ComposerContractOptions = {}): MascotSheetPlan[] {
  return chunkBySize(block.poses, cellLimit(opts)).map((chunk) => ({
    poses: chunk,
    grid: squareGrid(chunk.length),
  }));
}

/**
 * VÂN TAY của kế hoạch tấm — "tấm ảnh dáng đã ghép có còn tả đúng thẻ này không".
 *
 * Gồm cả lưới lẫn cặp (dáng, góc) của từng ô theo thứ tự: đổi thứ tự dòng cũng
 * làm ảnh cũ sai chỗ y như đổi dáng, nên nó phải nằm trong vân tay.
 */
export function poseSheetKey(block: MascotBlock, opts: ComposerContractOptions = {}): string {
  return mascotSheetPlan(block, opts)
    .map((plan) => `${plan.grid.cols}x${plan.grid.rows}:${plan.poses.map((p) => `${p.pose}|${p.view}`).join(",")}`)
    .join(";");
}

/**
 * Một thẻ Nhân vật → một hoặc nhiều tấm sprite sheet dáng.
 *
 * ══ CÂU ĐẦU THẺ CHO CẢ TẤM, DÒNG CHO TỪNG Ô ═══════════════════════════════
 * Câu đầu thẻ nói DANH TÍNH (ảnh nhân vật + trang phục) nên nó được ghép vào
 * `spec` của MỌI ô: mỗi ô phải tự đứng được như một mô tả trọn vẹn — `gen.sh`
 * không hứa với model rằng các ô đọc chung một chủ ngữ nào cả.
 *
 * ══ CHẾ ĐỘ TỰ DO ĐI VÀO `directive`, KHÔNG VÀO `promptOverride` ════════════
 * Đây là chỗ đổi so với thẻ Nhân vật một-ô đời trước, và lý do là cùng lý do đã
 * ghi ở `uiKitSheets`: `promptOverride` THAY TRỌN prompt của tấm — kể cả khối
 * hình học nói toạ độ safe zone của từng ô. Với một tấm 1 ô thì mất khối ấy không
 * sao; với một tấm 9 ô thì nó là thứ duy nhất giữ cho chín dáng nằm đúng lưới, và
 * `slice.py` cắt theo đúng lưới đó. Nên câu tự do CẤP THẺ thành một dòng chỉ đạo,
 * còn câu tự do CẤP DÒNG thành `spec` của đúng ô ấy.
 *
 * `poseSpecFor()` chứ không phải cụm chữ của pill dáng: pill trả `"a idle pose"`
 * (id ghép máy móc), còn `POSE_SPEC` là câu đã chạy thật trong `styles.json`
 * ("standing still in a neutral relaxed idle pose, facing the viewer") và nó biết
 * cách NHÉT NÉT MẶT vào đúng chỗ thay vì nối thêm một mệnh đề đá nhau.
 */
function mascotSheets(
  block: MascotBlock,
  startIndex: number,
  presets: PresetBundle,
  styleEN: string,
  themeEN: string,
  /* Cụm TRANG PHỤC của chủ đề chung — KHÁC `themeEN` từ 09/2026, xem `contextOutfitEN`. */
  outfitEN: string,
  opts: ComposerContractOptions,
): { sheets: Sheet[]; poses: string[]; ref: string } {
  if (block.poses.length === 0) return { sheets: [], poses: [], ref: "" };

  const scan = scanDoc(block.doc as PromptDocNode);
  const ctx = makeContext({ styleEN, themeEN, outfitEN, presets, imageCounter: { count: 0 } });
  const headLine = tidy(serializeDoc(block.doc as PromptDocNode, ctx));
  /* Ngữ cảnh RỖNG cho câu của DÒNG: pill trong đó không có "cái chung" nào cao
     hơn để kế thừa ngoài chính câu đầu thẻ, mà câu đầu thẻ đã được ghép sẵn vào
     `subject` ngay dưới. Cùng luật với `uiKitSheets`. */
  const rowCtx = makeContext({ styleEN: "", themeEN: "", presets, imageCounter: { count: 0 } });

  /**
   * DANH TÍNH nhân vật — CHỈ chữ người dùng tự gõ.
   *
   * Lấy RA (`take`) trước `leftover` để nó không bị nối thêm một lần nữa ở cuối
   * `subject`. KHÔNG đi qua `hitPhrase`: pill nhân vật không còn danh mục nào để
   * tra cụm EN (`pillOptions("mascot")` rỗng — linh vật là tài sản của một thương
   * hiệu, không phải một mục trong bảng tra). Hai nguồn còn lại của nó nói bằng
   * hai đường khác: ẢNH thành `ref` ngay dưới đây, còn CHỮ thì chính là chuỗi này.
   * Bản nháp của lượt trước có thể còn một `value` trỏ vào preset thư viện đã bỏ;
   * nó không đóng góp gì — đúng như nó đang là, một lựa chọn không còn tồn tại.
   */
  const identity = take(scan, "mascot")?.custom.trim() ?? "";
  const outfitHit = take(scan, "outfit");
  /* Trang phục để trống = theo theme chung — nhưng CHỮ TỰ GÕ vẫn thắng cả luật
     kế thừa ấy: người dùng gõ một bộ đồ riêng cho nhân vật này thì họ đã trả lời
     câu hỏi, không còn gì để kế thừa. */
  const outfit =
    outfitHit && !outfitHit.custom.trim() && outfitHit.value === INHERIT
      ? outfitEN
      : hitPhrase(outfitHit, presets);
  const ref = scan.images[0]?.path ?? "";

  /**
   * CHỦ NGỮ của mọi ô — "con này là ai".
   *
   * ══ BA NGUỒN (ảnh · chữ · sàn), MỘT THỨ TỰ ƯU TIÊN, VÀ NÓ KHÔNG TUỲ TIỆN ═
   * Có ẢNH ⇒ ảnh nói trước, luôn luôn: một tấm ảnh tả nhân vật chính xác hơn mọi
   * câu chữ, và `gen.sh` gọi đích danh "the attached character REFERENCE PHOTO".
   * Chữ người dùng gõ khi ấy đi KÈM chứ không thay — nó vẫn nói được thứ ảnh
   * không nói ra (tên, tính cách, chi tiết muốn giữ).
   * KHÔNG có ảnh ⇒ chữ ấy LÀ chủ ngữ. Chỉ khi cả hai đều vắng mới rơi về câu
   * chung chung cũ; máy vẽ không có gì để bám thì mỗi lượt ra một con khác nhau,
   * nên câu ấy là mức sàn, không phải mặc định.
   */
  const base = ref
    ? "the SAME character from the reference photo"
    : identity || "the same original mascot character";
  const subject = [
    base,
    ...(ref && identity ? [identity] : []),
    outfit ? `wearing ${outfit}` : "",
    /* Ba trục TẢ NGƯỜI vào đây chứ không vào `variant.style` — xem `buildVariantStyle`.
       Đây là tấm DUY NHẤT của một bộ kit có một con người trong khung; mọi tấm còn
       lại nhận cùng chuỗi `variant.style`, và "clearly feminine" dán lên một cái nút
       thì tốt nhất là nhiễu. */
    subjectAxisLine(opts.styleAxes ?? defaultStyleAxes()),
    ...leftover(scan, presets),
  ]
    .filter(Boolean)
    .join(", ");

  /* Chữ CẤP THẺ: ở khuôn là phần người dùng gõ THÊM ngoài template; ở tự do là cả
     câu họ viết. Cả hai đều là "lời người thiết kế nói cho tấm này". */
  const directive =
    block.mode === "free" ? headLine : freeText(block.doc as PromptDocNode, SCAFFOLDS.mascot);

  const plans = mascotSheetPlan(block, opts);
  const sheetKey = poseSheetKey(block, opts);
  /* Ảnh dáng đã ghép chỉ được dùng khi nó tả ĐÚNG bộ dòng hiện tại — xem
     `poseSheetKey`. Lệch ⇒ bỏ, và tấm vẫn vẽ được bằng chữ. */
  const poseSheets = block.poseSheet?.key === sheetKey ? block.poseSheet.paths : [];

  const sheets = plans.map((plan, i) => {
    const cells: Component[] = plan.poses.map((row, k) => {
      const expression = phraseOf("expression", row.expression, presets);
      const viewEN = phraseOf("view", row.view, presets);
      const free = block.mode === "free" ? tidy(serializeDoc(row.doc as PromptDocNode, rowCtx)) : "";
      /* Câu tự do RỖNG (người dùng xoá sạch dòng) ⇒ rơi về khuôn, KHÔNG ra ô không
         mô tả gì — cùng luật với dòng element. */
      const body = free || [poseSpecFor(row.pose, expression), viewEN, row.note.trim()].filter(Boolean).join(", ");
      return {
        /* Tên ô KHÔNG mang tiền tố `pose-` như `styles.json`: agent
           (`validate.mjs`) chỉ miễn luật tên file cho `shape:"empty"`, nên `pose-…`
           là contract client cho qua mà server từ chối ghi. Bài học đã trả giá một
           lần ở `buildKitsetContract`, không trả lại lần hai. */
        file: `${String(k + 1).padStart(2, "0")}-${slugify(row.pose) || "dang"}`,
        vi: labelOf("pose", row.pose, presets),
        spec: tidy([subject, body, "full body"].filter(Boolean).join(", ")),
        skel: { ...POSE_SKEL, pose: row.pose },
      };
    });

    const poseRef = poseSheets[i] ?? "";
    return {
      id: seriesId("nhan-vat", startIndex + i),
      /* Ô dáng phải VUÔNG cùng lý do với ô Bộ UI (xem `UI_CANVAS`): trên canvas
         ngang 1536×1024 chia n×n thì mỗi ô ra 3:2, và một nhân vật đứng thẳng
         trong một ô dẹt thì bị vẽ lùn rồi bị dao cắt cắt đúng cái lùn ấy.
         `orient` vẫn ghi cho engine đời cũ — có cả hai thì `canvas` thắng. */
      orient: "landscape" as const,
      canvas: UI_CANVAS,
      grid: plan.grid,
      cell_hint: HINT_POSE,
      ...(ref ? { ref, note: POSE_NOTE } : {}),
      ...(poseRef ? { poseRef } : {}),
      ...(directive ? { directive } : {}),
      components: padTo(cells, plan.grid.cols * plan.grid.rows),
    };
  });

  const poses: string[] = [];
  for (const row of block.poses) if (!poses.includes(row.pose)) poses.push(row.pose);
  return { sheets, poses, ref };
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
       tham chiếu 4×4: một tấm 4 món có lưới 2×2 ⇒ ô 627px, và hộp vẽ phải là hộp
       lớn nhất vừa lề của CHÍNH ô ấy. Xem `drawBox`. */
    /* Ô NGUYÊN PIXEL, không phải 1254/cols thô: `geometry.cell_size` của engine là
       `round(width / cols)`, và hộp vẽ phải quy về ĐÚNG con số ấy thì phân số
       `skel.w = hộp / ô` mới cắt lại ra đúng hộp cũ (`round(ô × phân số)`). */
    const cellPx = Math.round(SQUARE_CANVAS_PX / grid.cols);
    const cells: Component[] = chunk.map((cell, k) => {
      const element = presets.elements.find((preset) => preset.id === cell.elementId);
      /* Phong cách của ô: rỗng = theo phong cách chung — CÙNG luật với pill
         `style` và với `cellLine()` của bộ serialize. Ba nơi phải nói một điều. */
      const style = cell.styleId ? phraseOf("style", cell.styleId, presets) : "";
      const decor = phraseOf("decor", cell.decor, presets);
      /* Ô «Không trang trí» KHÔNG in câu bố trí — cùng luật, cùng hàm với
         `cellLine()` của bộ serialize: hai cửa nhìn vào một ô thì không được im
         lặng ở hai chỗ khác nhau. */
      const place = hasDecorPlacement(cell.decor) ? phraseOf("decorPlace", cell.decorPlace, presets) : "";
      /* DANH TỪ ĐỨNG ĐẦU, rồi tới phong cách, lượng trang trí, cách bố trí.
         `element.en` nay là một danh từ thuần ("popover"), không còn là câu mô tả có
         sẵn thuộc tính — xem `ElementPreset.en`. Nhờ vậy thứ tự này đọc ra đúng một
         câu tiếng Anh: "popover, chunky cartoon style, a distinct rim with a few
         ornaments at the corners…, ornaments mirrored symmetrically…". */
      const text = [element?.en ?? cell.elementId, style, decor, place].filter(Boolean).join(", ");
      /* `resolveElementSpec` là nơi DUY NHẤT biết cách nối câu đục nền vào mô tả
         một ô — dùng lại thay vì chép luật nối chuỗi sang đây. */
      const glaze = { glaze: cell.glazeId };
      /* HAI CỠ, KHÔNG PHẢI MỘT.
         · `out` = cỡ ĐẦU RA (pill «Cỡ», nấc S/M/L/XL theo cạnh dài, hoặc mặc định
           của loại) — chỉ đi vào manifest để tầng xuất co lõi về đúng cỡ ấy;
         · hộp vẽ = `drawBox(ô, tỉ lệ của out)` — hộp lớn nhất vừa lề của ô. Máy vẽ
           luôn được giao hộp to nhất có thể, kèm hệ số phóng để biết đây là "cái
           nút nhỏ phóng 2,5 lần" chứ không phải một tấm banner. */
      const out = sizePx(cell.sizeId, element?.skel) ?? defaultSizePx(element);
      const draw = drawBox(cellPx, cellPx, out.w, out.h);
      /* Về PHÂN SỐ Ô — đơn vị của `skel.w/h` (V-06 ∈ (0,1]), không phải pixel. */
      const size: SizePx = { w: draw.w / cellPx, h: draw.h / cellPx };
      const skel = cellSkel(element, size);
      const templateSpec = tidy([
        /* Câu đục nền tra từ KHO (`phraseOf`) chứ không để `resolveElementSpec` tự
           tra bảng hằng: nấc đục nền nay sửa được ở màn «Thư viện prompt», và hai
           đường tra khác nhau là hai câu khác nhau cho cùng một ô. */
        resolveElementSpec({ spec: text }, glaze, phraseOf("glaze", cell.glazeId, presets)),
        cell.note.trim(),
      ].filter(Boolean).join(", "));
      /* Câu tự do RỖNG (người dùng xoá sạch dòng) ⇒ rơi về khuôn, KHÔNG ra ô
         không mô tả gì. Bỏ hẳn ô đi thì lưới tụt một bậc và mọi ô sau nhảy chỗ —
         một dòng bị xoá chữ không được kéo theo cả tấm đổi bố cục. */
      const freeSpec = block.mode === "free" ? tidy(serializeDoc(cell.doc as PromptDocNode, freeCtx)) : "";
      /* HÌNH HỌC KHÔNG THEO CHẾ ĐỘ VIẾT: ở chế độ TỰ DO người dùng viết lại CÂU
         CHỮ, không viết lại cách dao cắt cắt ô — nên `skel` (hình dạng, đục nền,
         cỡ) vẫn là `skel` dựng ở trên, y hệt chế độ khuôn. */
      const spec = freeSpec || templateSpec;
      return {
        file: `${String(k + 1).padStart(2, "0")}-${slugify(cell.elementId) || "o"}`,
        vi: element?.vi ?? cell.elementId,
        spec,
        skel: { ...skel },
        out: { w: out.w, h: out.h },
        drawScale: draw.scale,
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
  /** Dáng của thẻ Nhân vật, không trùng lặp; rỗng với thẻ khác. */
  poses: string[];
  /** Ảnh mẫu của thẻ Nhân vật (`refs/…`); rỗng khi không có. */
  ref: string;
}

/**
 * TRẦN Ô CỦA MỘT TẤM — dùng chung cho thẻ Bộ UI và thẻ Nhân vật.
 *
 * Một trần duy nhất chứ không phải `limits.small` cho Bộ UI và `limits.mascot`
 * cho Nhân vật: cả hai nay là lưới vuông trên cùng một khổ canvas, nên cái quyết
 * định "bao nhiêu ô là còn đọc được" là hình học của tấm, không phải loại nội
 * dung. Quá trần thì CHIA TẤM (`chunkBySize`), không cắt bớt dòng của người dùng.
 */
function cellLimit(opts: ComposerContractOptions): number {
  const asked = Number(opts.limits?.small);
  return Math.min(Number.isInteger(asked) && asked > 0 ? asked : DEFAULT_SHEET_LIMITS.small, MAX_CELLS_SQUARE);
}

/** Duyệt các block đúng MỘT lần, đúng MỘT bộ luật — nguồn của cả hai hàm dưới. */
export function composerBlockSheets(
  input: ComposerDoc | ComposerState,
  opts: ComposerContractOptions = {},
): BlockSheets[] {
  const state = stateOf(input);
  const presets = opts.presets ?? getPresets();
  /* Chữ tự gõ THẮNG preset — một hàm duy nhất biết luật ấy, xem `contextThemeEN`. */
  const styleEN = contextStyleEN(state, presets);
  const themeEN = contextThemeEN(state, presets);
  /* Chủ đề nói với BỘ KIT bằng mô-típ (`themeEN`) và nói với NHÂN VẬT bằng quần áo
     (`outfitEN`) — cùng một lựa chọn, hai cụm chữ. Xem `ThemeOption.kitEN`. */
  const outfitEN = contextOutfitEN(state, presets);

  /* Đếm RIÊNG theo loại: thứ tự tấm bám thứ tự block trên màn (người dùng nhìn
     thấy), còn hậu tố `2`, `3` bám số tấm CÙNG LOẠI. */
  const seen = { background: 0, mascot: 0, uikit: 0 };
  const limit = cellLimit(opts);

  const out: BlockSheets[] = [];
  for (const block of state.blocks as Block[]) {
    if (block.kind === "uikit") {
      const made = uiKitSheets(block, seen.uikit, presets, limit);
      seen.uikit += made.length;
      out.push({ blockId: block.id, kind: "uikit", sheets: made, poses: [], ref: "" });
      continue;
    }
    if (block.kind === "background") {
      const sheet = backgroundSheet(block, seen.background, presets, styleEN, themeEN);
      if (sheet) seen.background += 1;
      out.push({ blockId: block.id, kind: "background", sheets: sheet ? [sheet] : [], poses: [], ref: "" });
      continue;
    }
    const made = mascotSheets(block, seen.mascot, presets, styleEN, themeEN, outfitEN, { ...opts, presets });
    seen.mascot += made.sheets.length;
    out.push({ blockId: block.id, kind: "mascot", sheets: made.sheets, poses: made.poses, ref: made.ref });
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
      contextStyleEN(state, presets),
      contextThemeEN(state, presets),
      /* Tên riêng của thương hiệu KHÔNG có mặt ở đây, dù người dùng vừa chọn một
         cái: nó không giúp máy vẽ (xem nhánh `brandProfilePill` trong
         `serialize.ts`). Thứ nói lên thương hiệu là logo đã đính ở `brand.refs`.
         ══ BỘ MÀU CŨNG KHÔNG CÒN Ở ĐÂY, VÀ ĐÓ LÀ MỘT LỖI ĐÃ VÁ ═══════════════
         `describeBrandColors()` từng được nối vào chuỗi này. Hệ quả đo được trên
         prompt thật: cùng một bảng màu được nói BA lần trong một tấm — một lần ở
         `## Art style` (qua chính chỗ này), một lần ở dòng "Brand palette:", một
         lần nữa ở khối COLOUR AUTHORITY. Ba lần nói cùng một điều bằng ba giọng
         khác nhau là ba cơ hội để chúng lệch nhau, và người đọc prompt không biết
         bản nào thắng. Nay màu chỉ còn MỘT chỗ: section `## Palette` của `gen.sh`,
         dựng từ `variant.brand.primary/secondary` — con số, không phải chữ tả. */
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
    for (const pose of made.poses) if (!poses.includes(pose)) poses.push(pose);
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
          /* Hex là chỗ DUY NHẤT bộ màu đi tới máy vẽ từ 09/2026 (câu tả màu bằng chữ
             đã bị cắt khỏi `style` — xem `composerStyleLine`): `gen.sh` dựng section
             `## Palette` từ đúng hai trường dưới đây — `gen.sh` chèn dòng palette từ đây, và đó là
             chỗ duy nhất con số thương hiệu đi tới máy vẽ nguyên vẹn.
             `mode: "colors"` GIỮ NGUYÊN kể cả khi đã có logo: `gen.sh` từng bỏ dòng
             palette khi mode là "image" (xem khối «BẢNG MÀU VÀ ẢNH BRAND KHÔNG LOẠI
             TRỪ NHAU» ở đó) — bản engine hiện tại đã vá, nhưng đặt mode là "image"
             ở đây là mời lại đúng con bọ ấy ở mọi bản engine chưa cập nhật. */
          mode: "colors",
          primary: state.brandColors[0] ?? "",
          secondary: state.brandColors[1] ?? "",
          /* LOGO của thương hiệu. `gen.sh` gọi chúng theo VAI TRÒ ("brand /
             inspiration reference images") nên thứ tự ở đây không mang nghĩa gì —
             chỉ cần đủ và không trùng. */
          refs: refPathsOf(state, "logo"),
        },
        ...(poses.length > 0
          ? { characters: [{ id: CHARACTER_ID, vi: "Nhân vật", ref: characterRef || null, poses }] }
          : {}),
        /**
         * ẢNH TẢ CẢ BỘ KIT — chủ đề (bối cảnh, mùa, mô-típ) hoặc lối vẽ.
         *
         * ╔══ TRƯỜNG NÀY TỪNG LUÔN RỖNG, VÀ ĐÓ LÀ MỘT CỬA BỊ BỎ QUÊN ═══════════╗
         * ║ `gen.sh` bật cả một khối ART STYLE riêng khi `inspo` có ảnh (xem      ║
         * ║ `use_inspo`), nhưng composer chưa bao giờ có chỗ nào để đính một tấm  ║
         * ║ ảnh cấp BỘ KIT — pill ảnh duy nhất là ảnh của một thẻ, và nó đi vào   ║
         * ║ `sheet.ref`. Nay mục «Đính ảnh tham chiếu» của pill theme/phong cách  ║
         * ║ và asset `brand-style` của thương hiệu cùng đổ về đây.                ║
         * ╚═════════════════════════════════════════════════════════════════════╝
         */
        inspo: refPathsOf(state, "theme", "style"),
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
