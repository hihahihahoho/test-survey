/**
 * kitset-to-contract.ts — HÒN ĐÁ MÓNG của WAVE 3 (UPGRADE-PLAN §W3-1).
 *
 * Biến state của workflow (thứ 6 file step đang sửa) thành `Contract` — thứ DUY NHẤT
 * mà `gen.sh` ăn được. Trước wave này module như vậy **không tồn tại ở bất kỳ đâu
 * trong repo**, nên workflow không có gì để lưu, để validate, để ước lượng, để preview.
 *
 * ┌── RANH GIỚI (giữ đúng §W3-1) ────────────────────────────────────────────┐
 * │ ADAPTER MỘT CHIỀU, đặt ở `lib/`. 6 file step KHÔNG được biết gì về        │
 * │ `Contract` — chúng tiếp tục đọc `useWorkflowStore()`. Chiều ngược lại     │
 * │ (Contract → state) KHÔNG có ở đây và không nên có: contract giàu hơn      │
 * │ state, dịch ngược là mất dữ liệu.                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ══ VÌ SAO KHÔNG CHÉP THẲNG `form-to-contract.ts` ══════════════════════════
 * Plan bảo "chép khuôn từ `form-to-contract.ts`, đừng viết từ đầu" — tôi chép
 * KHUÔN (bg 1×1 riêng · pad ô `empty` · `contractSchema.parse` chốt cuối) nhưng
 * KHÔNG chép cách chọn lưới, vì đối chiếu với contract THẬT của dự án
 * (`styles.json`, 13 sheet · 122 component) thì cách đó sai hai chỗ:
 *
 *  ① `form-to-contract` ép MỌI lưới về hình vuông (`squareCapacity` → 1/4/9/16).
 *    `styles.json` thật KHÔNG vuông: sheet `tall` là **4×2**. Lý do là số học của
 *    canvas: ảnh landscape 1536×1024, lưới 4×2 ⇒ mỗi ô 384×512 = **dọc 3:4**.
 *    Muốn ô DỌC thì đổi TỶ LỆ LƯỚI, không phải đổi `orient` của sheet. Ép vuông
 *    ⇒ popup dọc (`w .78 · h .84`) bị nhét vào ô ngang 3:2 và méo.
 *  ② `form-to-contract` pad ô trống bằng `{file:""}` cho MỌI ô. Từ ô trống thứ hai
 *    trở đi điều đó **vi phạm V-02** (`contract.ts` bắt trùng tên file trong sheet,
 *    chuỗi rỗng cũng là một tên) ⇒ `contractSchema.parse` NÉM. `styles.json` thật
 *    đặt tên `_empty-1`, `_empty-2`… — đây là lý do có 4 file `_empty-*` trong đó.
 *    Module này đặt tên ô trống theo đúng quy ước ấy.
 *
 * ══ NGUỒN SỰ THẬT CỦA MỌI HẰNG SỐ DƯỚI ĐÂY ═══════════════════════════════
 * Không hằng nào ở đây do tôi nghĩ ra — tất cả đọc ra từ `styles.json` thật:
 *   · `cell_hint` 4 loại : "landscape 3:2 cell" · "portrait 3:4 cell"
 *                          · "full-bleed portrait scene" · "cell containing ONE full-body character"
 *   · sheet nền          : `grid 1×1` + `orient:"portrait"` (bg-home / bg-play)
 *   · sheet dáng         : landscape, lưới vuông, `ref` = ảnh nhân vật, kèm `note`
 *   · đường dẫn ref      : `refs/<name>` — khớp `gen.sh:136-142` (đính kèm tương đối
 *                          từ ROOT) VÀ `agent/lib/validate.mjs:100` `refUsage()`
 *                          (`p === name || p.endsWith("/" + name)`), nên V-08 "ref
 *                          đang được dùng" chặn xoá đúng.
 *   · trần 16 ô/sheet    : sheet lớn nhất của `styles.json` là 4×4.
 */
import {
  contractSchema,
  slugify,
  type Component,
  type Contract,
  type Sheet,
} from "@/lib/types/contract";
import { loadBundledV2 } from "@/features/kit-core/lib/element-lib/source";
import type { LibElement } from "@/features/kit-core/lib/element-lib/types";
import { styleAxisPhrases, subjectAxisLine } from "@/features/kit-core/lib/style-phrases";
import type { GlassLevel, KitElementSkel, SheetPromptTweak, WorkflowMascot, WorkflowState } from "./model";
import { GLASS_LEVEL_SPEC, glazeFromMaterial, glazePreset, type GlazePreset } from "./glaze";
import { isPropElement } from "./user-library";

/* ══════════════════════════════════════════════════════════════════════════
   1. Hằng số — id ỔN ĐỊNH, không lấy từ chữ người dùng gõ
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ Id phong cách và id nhân vật là HẰNG, KHÔNG slug từ `kitName`/`mascotName`.
 *
 * Đây là quyết định có chủ ý, không phải lười. `contractJobs()` sinh job
 * `${variant.id}-${sheet.id}`, và `gen.sh:158` ghi ảnh ra `raw/<job>.png`.
 * Nếu id chạy theo tên người dùng gõ thì **đổi tên bộ kit = mồ côi toàn bộ ảnh
 * đã vẽ trên đĩa** (raw/, kits/, prompts/, logs/ đều khoá theo job). Tên người
 * dùng sống ở `vi` — nơi đổi bao nhiêu lần cũng không đụng tới đĩa.
 */
export const MAIN_VARIANT_ID = "chinh";
export const CHARACTER_ID = "nhan-vat";

/** Trần ô mỗi sheet. Landscape lưới vuông (4×4) · dọc lưới 2:1 (4×2) — xem đầu file. */
const MAX_CELLS_SQUARE = 16;
const MAX_CELLS_TALL = 8;

export interface SheetLimits {
  background: number;
  popup: number;
  small: number;
  props: number;
  mascot: number;
}

/**
 * ╔══ VÌ SAO `background: 1` — MỖI ẢNH NỀN MỘT TẤM RIÊNG ═════════════════════╗
 * ║ Trước là `2`, và đó chính là bệnh "ảnh nền bé tí / vỡ" chủ sản phẩm báo.   ║
 * ║ Với 2 nền, `chunkKeepingGroups` gộp cả hai vào MỘT tấm ⇒ `one === false`   ║
 * ║ ⇒ `orient:"landscape"` + `tallGrid(2)` = 2×1 ⇒ mỗi ô chỉ 768×1024.         ║
 * ║                                                                            ║
 * ║ ĐO TRÊN DỰ ÁN THẬT (`hello-368a` của chủ SP) so với 4 kit tham chiếu mà     ║
 * ║ chủ SP vẫn dùng làm chuẩn (`kits/candy|ipay|tet|rnd`):                      ║
 * ║                                                                            ║
 * ║   ô nền        hello-368a (limit 2)   candy/ipay/tet (1 nền / tấm)         ║
 * ║   25-bg-home        764×1024                1024×1536                      ║
 * ║   26-bg-play        764×1024                1024×1536                      ║
 * ║                                                                            ║
 * ║ Tức **2.25× ít pixel hơn**, và còn sai tỷ lệ: ô 3:4 cho một cảnh full-bleed ║
 * ║ vốn phải là 2:3. Dán sang Figma ở tỉ lệ xuất 0.5 ⇒ node 382×512 — đúng      ║
 * ║ "cop ra figma ảnh cũng bé tí, bị vỡ".                                      ║
 * ║                                                                            ║
 * ║ ĐÁNH ĐỔI, NÓI THẲNG: mỗi nền một tấm = **thêm 1 lượt gen** cho kit 2 nền.   ║
 * ║ Chấp nhận, vì nền là ô DUY NHẤT phủ kín màn hình — tiết kiệm đúng chỗ đó là ║
 * ║ tiết kiệm sai chỗ, và 4 kit tham chiếu đều đã làm 1 nền/tấm. Ai muốn gộp    ║
 * ║ lại vẫn chỉnh được: `sheetLimits.background` trong cài đặt dự án/thư viện.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export const DEFAULT_SHEET_LIMITS: SheetLimits = {
  background: 1,
  popup: 4,
  small: 16,
  props: 16,
  mascot: 4,
};

/* EXPORT (08/2026): bộ dịch của Prompt Canvas (`prompt-canvas/lib/composer-to-contract.ts`)
   dựng cùng loại sheet nên phải ghi CÙNG một `cell_hint`. Chép lại bốn chuỗi này sang
   feature khác là tạo bản sao thứ hai của một hằng số mà `gen.sh` đọc thẳng — sửa một
   nơi, nơi kia lặng lẽ nói khác. Chỉ thêm từ khoá `export`, không đổi giá trị. */
export const HINT_LANDSCAPE = "landscape 3:2 cell";
export const HINT_PORTRAIT = "portrait 3:4 cell";
/**
 * Ô VUÔNG — chỉ đúng trên canvas `square` (1024×1024) chia lưới n×n.
 *
 * Thêm mới 08/2026 cùng `sheet.canvas`: chủ sản phẩm xin lưới UI tỉ lệ 1:1 (*"canvas
 * lưới UI 1:1"*), và trên canvas vuông thì `HINT_LANDSCAPE` là một lời nói dối — nó
 * bảo máy vẽ bố trí món đồ trong một ô 3:2 trong khi ô thật là 1:1, nên món nào cũng
 * bị vẽ dẹt rồi mới bị cắt. Hằng ở ĐÂY chứ không ở bộ dịch composer vì ba chuỗi
 * `cell_hint` kia cũng ở đây — bốn anh em phải nằm cùng một chỗ, xem chú thích export.
 */
export const HINT_SQUARE = "square 1:1 cell";
export const HINT_BG = "full-bleed portrait scene";
export const HINT_POSE = "cell containing ONE full-body character";

/** Chép nguyên `note` của sheet dáng trong `styles.json` — đây là prompt engineering
 *  đã chạy thật, không phải văn tôi viết. Chỉ dùng khi CÓ ảnh ref nhân vật. */
export const POSE_NOTE =
  "All cells show THE SAME character as in the attached REFERENCE PHOTO: match its " +
  "species, face, colors, costume, materials and proportions exactly — only the pose " +
  "and viewing angle change per cell, like one character turnaround sheet.";

/** 19 dáng của `styles.example.json` → mô tả tiếng Anh cho `spec`.
 *  Dáng lạ vẫn chạy được (rơi về chính id), không ném. */
export const POSE_SPEC: Record<string, string> = {
  idle: "standing still in a neutral relaxed idle pose, facing the viewer",
  wave: "waving one hand high in greeting",
  point: "pointing forward with one arm extended",
  "hold-gift": "holding a wrapped gift box with both hands in front of the chest",
  cheer: "cheering with both arms raised in celebration",
  sad: "looking down with slumped shoulders, sad expression",
  run: "running to the side, mid-stride, arms swinging",
  think: "one hand on the chin in a thinking pose, head slightly tilted",
  sit: "sitting down, legs forward, relaxed",
  jump: "jumping upward, both feet off the ground, arms up",
  bow: "bowing forward politely, hands together",
  "thumbs-up": "giving a confident thumbs-up with one hand",
  fly: "flying forward, body horizontal, arms stretched ahead",
  walk: "walking to the side, mid-step",
  dance: "dancing, weight on one leg, arms out in a playful rhythm",
  present: "presenting with one open palm to the side, as if showing a reward",
  "view-34": "standing in a three-quarter view, body turned about 45 degrees, face toward the viewer",
  "view-side": "standing in full side profile",
  "view-back": "standing seen from behind, back to the viewer",
};

/**
 * NÉT MẶT ĐI VÀO ĐÚNG MỘT CHỖ TRONG CÂU DÁNG.
 *
 * Vài dáng ĐÃ tự khai nét mặt trong `POSE_SPEC` (`sad` = "…, sad expression"). Nối
 * thêm "a big bright smile" vào sau câu ấy là gửi cho máy vẽ HAI mệnh lệnh đá nhau
 * trong cùng một dòng, và kết quả là một khuôn mặt nửa nọ nửa kia. Nên: có mệnh đề
 * nét mặt sẵn thì **THAY**, chưa có thì **NỐI THÊM**.
 *
 * Regex chỉ bắt mệnh đề nét mặt đứng sau dấu phẩy và kết thúc bằng chữ `expression`
 * — đúng hình dạng của dữ liệu thật, và hẹp đủ để không ăn nhầm "arms swinging".
 */
const FACE_CLAUSE_RE = /,\s*[a-z]+(?:\s+[a-z]+)*\s+expression\b/;

/**
 * Câu dáng cuối cùng cho `spec` của ô.
 *
 * ⚠️ KHÔNG có nét mặt ⇒ trả về **NGUYÊN VĂN** câu cũ. Đây là điều kiện bắt buộc, không
 * phải tối ưu: mọi dự án đang chạy đều chưa chọn biểu cảm, và một chữ khác trong `spec`
 * là một lượt gen ra ảnh khác — người dùng không xin điều đó.
 */
export function poseSpecFor(pose: string, expression?: string | null): string {
  const base = POSE_SPEC[pose] ?? pose;
  const face = (expression ?? "").trim();
  if (!face) return base;
  return FACE_CLAUSE_RE.test(base) ? base.replace(FACE_CLAUSE_RE, `, ${face}`) : `${base}, ${face}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   1b. CHẤT LIỆU + ĐỘ TRONG CỦA MỘT Ô — thực thi bằng CHỮ, không bằng field mới
   ══════════════════════════════════════════════════════════════════════════ */

/** Ba mức kính → câu tiếng Anh. NHÀ THẬT của nó nay là `glaze.ts`; xuất lại ở đây
 *  để chỗ gọi cũ (và bộ test đang khoá đúng ba câu ấy) không phải đổi import. */
export { GLASS_LEVEL_SPEC } from "./glaze";

/** Nhãn tiếng Việt của ba mức — UI đọc chỗ này để không tự chế bộ chữ thứ hai. */
export const GLASS_LEVEL_VI: Record<GlassLevel, string> = {
  clear: "Kính trong",
  frosted: "Kính mờ",
  tinted: "Kính đậm",
};

export const GLASS_LEVELS: readonly GlassLevel[] = ["clear", "frosted", "tinted"];

/**
 * Từ khoá "ô này nghe như là kính" — nguồn của DÒNG GỢI Ý cạnh ba nút Nền tách.
 *
 * Đây là đường BỊ ĐỘNG (ý kiến 4): app **không tự bấm hộ**, chỉ nói ra chỗ có vẻ lệch.
 * Tự bấm hộ là đúng loại việc mà một mô tả nhắc tới "cửa sổ kính" (bối cảnh, không phải
 * chất liệu của chính ô) sẽ làm hỏng — và người dùng không hiểu vì sao ô của mình đột
 * nhiên trong suốt.
 */
const GLASSY_WORDS = /\b(glass|crystal|transparent|see-?through|translucent)\b|kinh|thuy tinh|pha le|trong suot/;

/** Bỏ dấu tiếng Việt để "kính"/"kinh" cùng khớp — cùng phép gấp mà ô tìm kiếm đang dùng. */
function foldForMatch(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

/** `true` khi mô tả (thư viện HOẶC bản người dùng sửa) nghe như một vật trong suốt. */
export function looksLikeGlass(spec: string | null | undefined): boolean {
  return GLASSY_WORDS.test(foldForMatch(spec ?? ""));
}

/**
 * ĐỤC NỀN ĐANG CÓ HIỆU LỰC của một lớp đè — một chỗ tra, dùng ở cả hai hàm dưới.
 *
 * Hai lối vào, và thứ tự ưu tiên là bắt buộc: `glaze` là trường của HÔM NAY, còn
 * `material` là bản nháp ĐỜI CŨ được dịch sang (`glazeFromMaterial`). Bản nháp nào
 * có cả hai (người dùng mở dự án cũ rồi bấm pill) thì lựa chọn MỚI phải thắng —
 * ngược lại là chọn xong thấy nó tự quay về giá trị cũ, hỏng câm khó chịu nhất.
 */
function glazeOf(override: KitElementSkel | undefined): GlazePreset | null {
  if (!override) return null;
  return glazePreset(override.glaze) ?? glazePreset(glazeFromMaterial(override.material));
}

/**
 * MÔ TẢ CUỐI CÙNG CỦA MỘT Ô = [mô tả] + [đục nền] + [mức kính].
 *
 * ┌── BA NGUỒN, MỘT DÒNG ────────────────────────────────────────────────────┐
 * │ ① mô tả  : lớp đè của dự án nếu có, không thì `spec` của thư viện;        │
 * │ ② đục nền: cụm tiếng Anh NGẮN về độ xuyên thấu (`GLAZE_PRESETS`);         │
 * │ ③ mức kính: chỉ nối khi ô THẬT SỰ đang là kính sau khi trộn `matte`.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ② KHÔNG CÒN LÀ "CHẤT LIỆU". Cụm chữ thẩm mỹ ("polished gold metal, warm
 * reflections") đã bị bỏ khỏi đây — thẩm mỹ đến từ prompt tổng phong cách, thứ
 * `gen.sh` chèn vào MỌI tấm. Đọc khối đầu `glaze.ts` trước khi định đưa nó về.
 *
 * Điều kiện ③ không phải chuyện vặt: người dùng chọn "Băng" rồi đổi Đục nền về
 * "Không" thì `glassLevel` vẫn còn nằm trong bản nháp. Nối nó vào lúc ấy là dặn
 * máy vẽ hạ alpha xuống 128 trong khi slicer đang cắt ô như một mảng đặc — ảnh ra mờ
 * và không ai hiểu tại sao. Giá trị được GIỮ (đổi ý lần nữa là có lại) nhưng KHÔNG nói.
 */
export function resolveElementSpec(base: Pick<LibElement, "spec" | "skel">, override?: KitElementSkel): string {
  const parts: string[] = [];
  const own = override?.spec?.trim();
  const text = own || base.spec;
  if (text) parts.push(text);

  const glaze = glazeOf(override);
  if (glaze?.en) parts.push(glaze.en);

  /* Mức kính khai TAY thắng mức của preset: bản nháp workflow có ô chọn riêng ba
     nấc, và một lựa chọn người dùng bấm bằng tay không được preset đắp lên. */
  const level = override?.glassLevel ?? glaze?.glassLevel;
  if (level) {
    const matte = override ? mergeElementSkel(base.skel, override).matte : base.skel.matte;
    if (matte === "glass") parts.push(GLASS_LEVEL_SPEC[level]);
  }
  return parts.join(", ");
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Bước 1 — kitset của workflow ⇄ element THẬT của thư viện
   ══════════════════════════════════════════════════════════════════════════ */

/** Vì sao một món KHÔNG vào được contract. Cả hai đều phải NÓI RA trên UI, không nuốt. */
export type SkipReason =
  /** Món preset chưa có bản thiết kế (`wheel-board`) — UI đã tự gắn nhãn "bỏ qua khi vẽ thật". */
  | "mock"
  /** Có trong kitset nhưng không có trong thư viện element ⇒ không có `spec`/`skel` để vẽ. */
  | "unknown";

export interface SkippedElement {
  file: string;
  label: string;
  reason: SkipReason;
}

export interface ResolvedKitset {
  /** Món VẼ ĐƯỢC THẬT, đã kèm `spec`/`skel` của thư viện. */
  drawable: LibElement[];
  skipped: SkippedElement[];
}

/**
 * Đối chiếu kitset (chỉ có `file`/`label`) với thư viện element (có `spec`/`skel`).
 *
 * Món không đối chiếu được thì **bị bỏ ra và ghi tên vào `skipped`** — tuyệt đối không
 * im lặng thả rơi: ước lượng lượt đọc chính hàm này, nên nuốt một món = báo giá sai.
 */
export function resolveKitset(
  elements: readonly WorkflowState["elements"][number][],
  lib: readonly LibElement[],
): ResolvedKitset {
  const byFile = new Map(lib.map((e) => [e.file, e]));
  const drawable: LibElement[] = [];
  const skipped: SkippedElement[] = [];
  for (const e of elements) {
    if (!e.selected) continue;
    if (e.mock) {
      skipped.push({ file: e.file, label: e.label, reason: "mock" });
      continue;
    }
    const hit = byFile.get(e.file);
    if (!hit) {
      skipped.push({ file: e.file, label: e.label, reason: "unknown" });
      continue;
    }
    /* KÍCH THƯỚC + NỀN RIÊNG CỦA DỰ ÁN đè lên giá trị của thư viện — trộn ở ĐÂY, một
       lần, để contract, preview skeleton và bảng chi tiết không thể nói ba thứ khác
       nhau. Thư viện chung không bị đụng tới: `hit` được sao ra bản mới.

       ⚠️ ĐÂY LÀ CHỖ FIELD LẶNG LẼ RƠI (research-glow-extraction §4.2 "Lỗ 2"). Bản
       trước chỉ trộn `w`/`h`, nên bất cứ trường nào thêm vào `KitElementSkel` mà quên
       chỗ này thì người dùng chọn xong, UI hiện đúng, còn contract KHÔNG có gì —
       không lỗi, không cảnh báo. Thêm trường mới ⇒ thêm một nhánh ở đây.

       Từ 08/2026 lớp đè mang thêm CHỮ (`spec` sửa tay · `material` · `glassLevel`), và
       chữ KHÔNG đi vào `skel` — nó đi vào `spec` của component. Hai đích khác nhau nên
       phải trộn bằng hai hàm khác nhau; gộp lại là đẩy `material` vào `skel` của
       contract, nơi `skelSchema` (looseObject) sẽ vui vẻ ghi nó ra đĩa cho không ai đọc. */
    const override = e.skel;
    if (!override) { drawable.push(hit); continue; }
    const skel = mergeElementSkel(hit.skel, override);
    const spec = resolveElementSpec(hit, override);
    drawable.push(skel === hit.skel && spec === hit.spec ? hit : { ...hit, spec, skel });
  }
  return { drawable, skipped };
}

/**
 * Trộn lớp đè của dự án vào `skel` của thư viện. Trả về CHÍNH `base` khi không có gì
 * để đè (giữ đúng hành vi cũ: không sinh object mới cho 42 món mỗi lần dựng contract).
 *
 * EXPORT vì `KitsetStep` phải vẽ silhouette và bật/tắt nút "Nền tách" theo ĐÚNG thứ
 * contract sẽ nhận. Bản trước UI tự spread `{...lib.skel, ...override}` — một bản sao
 * của luật trộn, và bản sao đó không biết `matte:"none"` nghĩa là gì.
 *
 * Luật của `matte` — CÁCH TÁCH của một ô. Người dùng chọn được hai giá trị, vì cả hai
 * đều có mặt ở CẢ prompt lẫn slicer, nên phải cùng bật cùng tắt:
 *  · `"glow"`  = nền ô lúc gen là ĐEN (`gen.sh:480`) + `slice.py` tách theo kênh sáng.
 *  · `"glass"` = ô TRONG SUỐT: prompt bắt để key lộ qua thân (`gen.sh:489`) + `slice.py`
 *    giải ngược `C = α·F + (1−α)·K`. Từ 08/2026 đây là MỘT cờ duy nhất, không tách thành
 *    "transparent-panel" riêng: prompt và slicer là hai nửa của cùng một hợp đồng, tách
 *    ra là mở đường cho hai nửa đó mâu thuẫn (xem docs/design-glass-transparent-panel).
 *  · `"vitmatte"` = **thuần thuật toán tách**, không có mặt nào ở prompt. Thư viện khai
 *    sẵn, popup KHÔNG hỏi ⇒ `"none"` không được âm thầm hạ chất lượng tách của nó.
 */
const USER_MATTE = new Set(["glow", "glass"]);

export function mergeElementSkel(base: LibElement["skel"], override: KitElementSkel): LibElement["skel"] {
  const patch: Partial<LibElement["skel"]> = {};
  if (override.w !== undefined) patch.w = override.w;
  if (override.h !== undefined) patch.h = override.h;
  /* ĐỤC NỀN TỰ MANG THEO CÁCH TÁCH — đây là nửa còn lại của hợp đồng mà `glaze.ts`
     mô tả: chọn "Băng" mà `matte` vẫn rỗng thì máy vẽ ra một khối băng ĐỤC và
     `slice.py` cắt nó như mảng đặc. Lớp đè khai `matte` bằng tay vẫn THẮNG: bản
     nháp workflow có ba nút "Nền thường / Phát sáng / Trong suốt" riêng, và một
     lựa chọn bấm bằng tay không được preset đắp lên. */
  const matte = override.matte ?? glazeOf(override)?.matte;
  if (matte === "glow" || matte === "glass") patch.matte = matte;
  const clears = matte === "none" && USER_MATTE.has(String(base.matte));
  if (Object.keys(patch).length === 0 && !clears) return base;
  const next = { ...base, ...patch };
  if (clears) delete next.matte;
  return next;
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Xếp ô — giữ group liền kề, pad cho đủ cols×rows
   ══════════════════════════════════════════════════════════════════════════ */

/** Ô trống. Tên `_empty-N` là **bắt buộc**, không phải trang trí — xem ② ở đầu file. */
function emptyCell(n: number): Component {
  return { file: `_empty-${n}`, vi: "", spec: "", skel: { shape: "empty" } };
}

function toComponent(el: LibElement): Component {
  return { file: el.file, vi: el.vi, spec: el.spec, skel: { ...el.skel } };
}

/**
 * Lưới cho ô NGANG: vuông ⇒ ô thừa hưởng đúng tỷ lệ canvas 3:2.
 * (1536×1024 chia 4×4 = 384×256 = 3:2 — đúng `cell_hint` của sheet `main`.)
 */
function squareGrid(n: number): { cols: number; rows: number } {
  const side = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  return { cols: side, rows: side };
}

/**
 * Lưới cho ô DỌC: `cols = 2 × rows` ⇒ ô 3:4 trên canvas ngang.
 * (1536×1024 chia 4×2 = 384×512 = 3:4 — đúng sheet `tall` của `styles.json`.)
 */
function tallGrid(n: number): { cols: number; rows: number } {
  const rows = Math.min(2, Math.max(1, Math.ceil(Math.sqrt(n / 2))));
  return { cols: rows * 2, rows };
}

function padTo(cells: Component[], capacity: number): Component[] {
  const out = [...cells];
  for (let i = out.length; i < capacity; i += 1) out.push(emptyCell(i - cells.length + 1));
  return out;
}

/**
 * Chia thành từng sheet ≤ `max` ô, **giữ nguyên khối các món cùng `group`**.
 *
 * Vì sao group phải liền: `element-lib` ghép cặp trạng thái (`toggle-off`/`toggle-on`,
 * `checkbox-off`/`checkbox-on`, 3 hạng huy chương…). Hai ô cùng cặp mà rơi vào hai
 * ảnh khác nhau thì model vẽ hai phong cách khác nhau, và cặp trạng thái đó vô dụng.
 * Group to hơn cả một sheet thì buộc phải cắt — nhưng cắt sau cùng, không cắt bừa.
 */
export function chunkKeepingGroups<T extends { group?: string }>(items: readonly T[], max: number): T[][] {
  const groups: T[][] = [];
  const at = new Map<string, T[]>();
  items.forEach((it, i) => {
    const key = it.group ? `g:${it.group}` : `solo:${i}`;
    const bucket = at.get(key);
    if (bucket) bucket.push(it);
    else {
      const fresh = [it];
      at.set(key, fresh);
      groups.push(fresh);
    }
  });

  const out: T[][] = [];
  let cur: T[] = [];
  for (const g of groups) {
    if (g.length > max) {
      if (cur.length) { out.push(cur); cur = []; }
      for (let i = 0; i < g.length; i += max) out.push(g.slice(i, i + max));
      continue;
    }
    if (cur.length + g.length > max) { out.push(cur); cur = []; }
    cur.push(...g);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Cắt thuần theo trần ô — cho danh sách không có khái niệm `group` (dáng nhân vật). */
function chunkBySize<T>(items: readonly T[], max: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += max) out.push(items.slice(i, i + max));
  return out;
}

/** `main`, `main2`, `main3`… — đúng quy ước `styles.json` (KHÔNG phải `main-2`). */
function seriesId(base: string, index: number): string {
  return index === 0 ? base : `${base}${index + 1}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. Ảnh tham khảo
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Tên agent đặt (`inspo-1.png`) → đường dẫn contract (`refs/inspo-1.png`). Idempotent.
 *
 * Ref của agent LUÔN là **một đoạn đường dẫn duy nhất** (`agent/routes/refs.mjs:118`
 * `pickRefName` sinh `inspo-N.ext` / `brand-N.ext` / `char-<slug>.ext`, rồi
 * `safeSegment()` canh lúc xoá). Nên bất cứ thứ gì có `/` hay `..` bên trong đều
 * KHÔNG phải tên ref hợp lệ và bị trả về chuỗi rỗng (rồi bị lọc bỏ) — chứ không
 * phải bị "sửa" cho hợp lệ. Bản đầu của hàm này chỉ cắt dấu `/` đứng đầu, nên
 * `/etc/passwd` biến thành `refs/etc/passwd`: một đường dẫn có thư mục con, lọt
 * qua luật REF_PATH của `contract.ts` (chỉ chặn `..` và `/` ĐỨNG ĐẦU). Chính ca
 * test dưới `__tests__` bắt được, không phải tôi đọc lại mà thấy.
 */
export function refPath(name: string): string {
  const raw = String(name ?? "").trim();
  const seg = raw.startsWith("refs/") ? raw.slice("refs/".length) : raw;
  if (seg === "" || seg.includes("/") || seg.includes("\\") || seg.includes("..")) return "";
  return `refs/${seg}`;
}

const refPaths = (items: readonly { name: string }[]): string[] =>
  items.map((r) => refPath(r.name)).filter((p) => p !== "");

/* ══════════════════════════════════════════════════════════════════════════
   5. Hàm chính
   ══════════════════════════════════════════════════════════════════════════ */

/** Đúng những trường của `WorkflowState` mà contract cần — `Pick` để không lệch khi model đổi. */
export type KitsetContractInput = Pick<
  WorkflowState,
  | "kitName" | "campaign" | "stylePrompt" | "styleMode" | "styleAxes"
  | "primaryColor" | "secondaryColor" | "styleAvoid" | "sliceThreshold"
  | "elements" | "styleRefs" | "brandRefs"
  | "mascotEnabled" | "mascotName" | "mascotDescription" | "mascotRef" | "mascotPoses"
> & {
  /** UI-FIX §3b — danh sách nhân vật. Thiếu (bản nháp cũ) ⇒ rơi về ba trường `mascot*`. */
  mascots?: readonly WorkflowMascot[];
  /**
   * Chủ đề trang phục của cả bộ. **OPTIONAL có chủ ý**: bản nháp và contract đã lưu từ
   * trước không có trường này, và thiếu nó phải nghĩa là "không nói gì về trang phục" —
   * không phải một `undefined` rơi vào chuỗi prompt.
   */
  outfitTheme?: string;
  /**
   * PROMPT STUDIO — chỉ đạo / prompt tự soạn theo từng tấm, khoá là `sheet.id`.
   * **OPTIONAL có chủ ý**, cùng lý do với `outfitTheme`: bản nháp và contract đã lưu từ
   * trước không có nó, và thiếu nó phải nghĩa là "không can thiệp gì" — tức sheet của
   * contract KHÔNG mọc thêm một khoá nào.
   */
  sheetPrompts?: Readonly<Record<string, SheetPromptTweak>>;
};

/**
 * Rút đúng phần state mà contract phụ thuộc.
 *
 * Dùng để dựng khoá memo/so sánh: store trả object MỚI mỗi lần `set()` dù nội dung
 * không đổi, và `WorkflowState` còn mang cả hàm (`set`, `next`, `toggleElement`…).
 * Băm cả state thì vừa thừa vừa nhiễu — băm đúng 17 trường này thì "có gì đổi thật
 * không" là câu trả lời được.
 */
export function pickContractInput(s: KitsetContractInput): KitsetContractInput {
  return {
    kitName: s.kitName, campaign: s.campaign, stylePrompt: s.stylePrompt, styleMode: s.styleMode,
    styleAxes: s.styleAxes, primaryColor: s.primaryColor, secondaryColor: s.secondaryColor,
    styleAvoid: s.styleAvoid, sliceThreshold: s.sliceThreshold,
    elements: s.elements, styleRefs: s.styleRefs, brandRefs: s.brandRefs,
    mascotEnabled: s.mascotEnabled, mascotName: s.mascotName, mascotDescription: s.mascotDescription,
    mascotRef: s.mascotRef, mascotPoses: s.mascotPoses,
    ...(s.mascots ? { mascots: s.mascots } : {}),
    /* PHẢI có mặt ở đây, nếu không `useContractSync` băm khoá memo thiếu nó ⇒ đổi chủ đề
       trang phục xong contract đứng im, và người dùng kết luận cái select không chạy.
       Đây đúng là chỗ mọi trường mới của contract hay bị quên. */
    ...(s.outfitTheme ? { outfitTheme: s.outfitTheme } : {}),
    /* CÙNG BẪY, KHÁC TRƯỜNG: quên dòng này thì gõ chỉ đạo cho một tấm xong contract
       đứng im ⇒ "Xem prompt sẽ gửi" trả về đúng prompt cũ, và người dùng kết luận
       Prompt Studio không chạy. Chỉ đưa vào khi map CÓ mục: một `{}` trong khoá memo
       làm chữ ký của mọi dự án cũ đổi mà không có gì đổi thật. */
    ...(s.sheetPrompts && Object.keys(s.sheetPrompts).length > 0 ? { sheetPrompts: s.sheetPrompts } : {}),
  };
}

export interface BuildKitsetOptions {
  /** Thư viện element. Mặc định bản đóng gói (42 món); W3-5 truyền bản của agent vào. */
  lib?: readonly LibElement[];
  /**
   * Ref ĐANG CÓ THẬT trên đĩa (§W3-3). Truyền vào thì **thắng** state: đĩa là sự thật,
   * bản nháp chỉ là tiếng vọng. Không truyền (test, offline) thì rơi về state.
   */
  refs?: {
    inspo: readonly string[];
    brand: readonly string[];
    /** Ảnh nhân vật MỚI NHẤT — đường lùi cho bản nháp một-mascot. */
    character: string | null;
    /** MỌI ảnh `char-*` đang có trên đĩa. Dùng để đối chiếu ref của từng nhân vật. */
    characters?: readonly string[];
  };
  /** Giới hạn do thư viện dùng chung quản lý. Geometry vẫn kẹp theo sức chứa canvas. */
  limits?: Partial<SheetLimits>;
}

function limitOf(value: number | undefined, fallback: number, ceiling: number): number {
  return Number.isInteger(value) && Number(value) > 0
    ? Math.min(Number(value), ceiling)
    : fallback;
}

function isPopupElement(element: LibElement): boolean {
  return /popup|modal|panel|ribbon/.test(`${element.file} ${element.group ?? ""}`.toLowerCase());
}

/** Một nhân vật đã giải xong ref + tên, sẵn sàng đổ vào contract. */
export interface ContractCharacter {
  /** Id HẰNG theo VỊ TRÍ (`nhan-vat`, `nhan-vat-2`…) — xem chú thích của `CHARACTER_ID`. */
  id: string;
  vi: string;
  description: string;
  /** `refs/<tên>` hoặc chuỗi rỗng khi không có ảnh mẫu. */
  ref: string;
  /** Cụm tiếng Anh của trang phục ĐÃ GIẢI (riêng con này, không thì của cả bộ). Rỗng = không nói. */
  outfit: string;
  /** Nét mặt theo từng dáng của RIÊNG con này. Dáng vắng mặt ⇒ giữ nguyên văn `POSE_SPEC`. */
  poseExpressions: Record<string, string>;
}

/**
 * Danh sách nhân vật của contract, theo đúng thứ tự bước Mascot hiện ra.
 *
 * Ba lối vào, cùng một lối ra:
 *  · `s.mascots` có mục  ⇒ mỗi mục một nhân vật, ref lấy theo TÊN NÓ TỰ GIỮ.
 *  · rỗng nhưng bật mascot ⇒ đúng hành vi cũ: một nhân vật từ ba trường `mascot*`.
 *  · tắt mascot          ⇒ nơi gọi không gọi hàm này.
 *
 * ĐĨA VẪN THẮNG (§W3-3): có `opts.refs` thì ảnh nào không nằm trên đĩa bị coi là
 * không có — bản nháp chỉ là tiếng vọng, không phải bằng chứng.
 */
export function contractCast(
  s: Pick<KitsetContractInput, "mascots" | "mascotName" | "mascotDescription" | "mascotRef" | "outfitTheme">,
  opts: Pick<BuildKitsetOptions, "refs"> = {},
): ContractCharacter[] {
  /* Chủ đề chung là ĐƯỜNG LÙI, không phải giá trị mặc định ghi đè: con nào tự khai
     trang phục riêng thì bản của nó thắng, con nào để trống thì mặc theo cả bộ. */
  const shared = (s.outfitTheme ?? "").trim();
  const outfitOf = (own: string | undefined): string => (own ?? "").trim() || shared;
  const onDisk = opts.refs
    ? new Set(opts.refs.characters ?? (opts.refs.character ? [opts.refs.character] : []))
    : null;
  const resolve = (name: string | null | undefined): string => {
    const path = name ? refPath(name) : "";
    if (!path) return "";
    if (onDisk && !onDisk.has(path)) return "";
    return path;
  };

  const list = s.mascots ?? [];
  if (list.length === 0) {
    // Đường cũ, giữ NGUYÊN: bản nháp một-mascot không biết tên ref của agent nên
    // `opts.refs.character` (ảnh `char-*` mới nhất) vẫn là nguồn đáng tin nhất.
    const ref = opts.refs ? (opts.refs.character ?? "") : (s.mascotRef ? refPath(s.mascotRef.name) : "");
    return [{
      id: CHARACTER_ID,
      vi: s.mascotName.trim() || "Nhân vật",
      description: s.mascotDescription,
      ref,
      // Bản nháp một-mascot không có chỗ khai trang phục riêng ⇒ theo cả bộ, và không
      // có chỗ khai nét mặt ⇒ mọi dáng giữ NGUYÊN VĂN câu cũ.
      outfit: shared,
      poseExpressions: {},
    }];
  }
  return list.map((m, i) => ({
    id: i === 0 ? CHARACTER_ID : `${CHARACTER_ID}-${i + 1}`,
    vi: m.name.trim() || (i === 0 ? "Nhân vật" : `Nhân vật ${i + 1}`),
    description: m.description,
    ref: resolve(m.ref?.name),
    outfit: outfitOf(m.outfitTheme),
    poseExpressions: m.poseExpressions ?? {},
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   5b. Màu nền tách — DI SẢN, KHÔNG CÒN ĐI VÀO PROMPT
   ══════════════════════════════════════════════════════════════════════════

   Ở đây từng có cả một cỗ máy chọn key: `CHROMA_KEY_PRESETS` (4 màu),
   `pickChromaKey`, `explainChromaKey`, `CHROMA_KEY_HEX` và phép đo hue để tránh
   key trùng bảng màu — vì `gen.sh` viết thẳng tên màu vào prompt (*"BACKGROUND of
   the sheet: one flat solid chroma-key color: {bg}"*) và một style neon magenta
   trên key magenta thì bị `matte_vlahos` ăn mất độ bão hoà.

   Prompt đó KHÔNG CÒN. `image_gen` của codex 0.149 trả về RGBA thật, nên gen.sh
   xin thẳng nền trong suốt và không nhắc tới màu nào nữa. Không có tên màu trong
   prompt thì cũng không có gì để đá bảng màu ⇒ toàn bộ phép tránh-va-chạm mất
   nghĩa, và một ô swatch "Màu nền tách" chỉ còn là lời hứa suông với người dùng.

   `bg` thì Ở LẠI, đúng như người dùng chọn: `slice.py` vẫn cần nó để cắt lại
   những sheet raw ĐỜI CŨ (nền magenta/green) của project cũ. Nó chỉ không còn
   ảnh hưởng tới lượt gen mới nữa.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Mô tả phong cách gửi cho `gen.sh` = ô mô tả + trục ngữ nghĩa + điều không muốn.
 *
 * ╔══ HAI THỨ BỊ CẮT KHỎI CÂU NÀY, VÀ CẢ HAI ĐỀU CÓ LÝ DO ĐO ĐƯỢC ═══════════╗
 * ║ `gen.sh` in chuỗi này nguyên văn vào `## Art style` của MỌI tấm — nút bấm, ║
 * ║ cảnh nền, nhân vật, không phân biệt. Nên câu chỉ được chứa thứ ĐÚNG cho    ║
 * ║ mọi tấm:                                                                  ║
 * ║  ① trục ở NẤC GIỮA không in (xem `styleAxisPhrases`);                     ║
 * ║  ② trục cụm `subject` (tuổi · giới · năng lượng) không in ở đây — chúng tả ║
 * ║    một con người, mà 15/16 tấm của một bộ kit không có người nào. Chúng đi ║
 * ║    theo đường riêng vào chủ ngữ của ô dáng (xem `subjectAxisLine`).        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function buildVariantStyle(s: Pick<KitsetContractInput, "stylePrompt" | "styleAxes" | "styleAvoid">): string {
  const parts = [s.stylePrompt.trim(), styleAxisPhrases(s.styleAxes, ["feel", "render"]).join(", ")].filter(
    (p) => p.length > 0,
  );
  const avoid = s.styleAvoid.trim();
  if (avoid) parts.push(`avoid: ${avoid}`);
  return parts.join(", ");
}

/**
 * PROMPT STUDIO — gắn `directive` / `promptOverride` vào ĐÚNG tấm mang id ấy.
 *
 * MỘT LUẬT DUY NHẤT, và cả bộ test khoá nó: tấm không có mục trong map phải đi ra
 * **CHÍNH NÓ** (`sh` chứ không phải `{...sh}`), không thêm một khoá `undefined` nào.
 * Contract là thứ được so bằng `JSON.stringify` để quyết định "có gì đổi không"
 * (`contract-sync.ts:sameContract`) rồi mới ghi đĩa; một khoá thừa ở đây là một lượt
 * ghi `styles.json` + một bản `.history` cho mỗi dự án cũ mở lên, mà không ai sửa gì.
 *
 * Khoá lạ (tấm đã bị xoá khỏi kitset) được BỎ QUA im lặng, không dựng sheet ma: map là
 * ghi chú của người dùng, còn danh sách tấm là do kitset quyết.
 */
function withSheetPrompts(
  sheets: readonly Sheet[],
  tweaks: Readonly<Record<string, SheetPromptTweak>> | undefined,
): Sheet[] {
  if (!tweaks) return [...sheets];
  return sheets.map((sh) => {
    const t = tweaks[sh.id];
    if (!t) return sh;
    const directive = (t.directive ?? "").trim();
    const promptOverride = (t.promptOverride ?? "").trim();
    if (!directive && !promptOverride) return sh;
    return {
      ...sh,
      ...(directive ? { directive } : {}),
      ...(promptOverride ? { promptOverride } : {}),
    };
  });
}

/**
 * `WorkflowState` → `Contract`. Ném `ZodError` nếu sinh ra thứ không hợp lệ —
 * **có chủ ý**: thà đỏ ở client còn hơn để `gen.sh:31` (`assert len(comps) == cols*rows`)
 * nổ giữa chừng sau khi đã tiêu lượt.
 */
export function buildKitsetContract(s: KitsetContractInput, opts: BuildKitsetOptions = {}): Contract {
  const lib = opts.lib ?? loadBundledV2().elements;
  const { drawable } = resolveKitset(s.elements, lib);

  const limits = {
    background: limitOf(opts.limits?.background, DEFAULT_SHEET_LIMITS.background, MAX_CELLS_TALL),
    popup: limitOf(opts.limits?.popup, DEFAULT_SHEET_LIMITS.popup, MAX_CELLS_SQUARE),
    small: limitOf(opts.limits?.small, DEFAULT_SHEET_LIMITS.small, MAX_CELLS_SQUARE),
    props: limitOf(opts.limits?.props, DEFAULT_SHEET_LIMITS.props, MAX_CELLS_SQUARE),
    mascot: limitOf(opts.limits?.mascot, DEFAULT_SHEET_LIMITS.mascot, MAX_CELLS_SQUARE),
  };

  const backgrounds = drawable.filter((e) => e.skel.shape === "full");
  const rest = drawable.filter((e) => e.skel.shape !== "full");
  const popup = rest.filter(isPopupElement);
  const props = rest.filter((e) => !isPopupElement(e) && isPropElement(e));
  const small = rest.filter((e) => !isPopupElement(e) && !isPropElement(e));
  const popupTall = popup.filter((e) => e.cell === "portrait");
  const popupWide = popup.filter((e) => e.cell !== "portrait");
  const smallTall = small.filter((e) => e.cell === "portrait");
  const smallWide = small.filter((e) => e.cell !== "portrait");
  const propsTall = props.filter((e) => e.cell === "portrait");
  const propsWide = props.filter((e) => e.cell !== "portrait");

  const sheets: Sheet[] = [];

  /* ── a. Nền: ô dọc 3:4, mặc định HOME + THÀNH CÔNG chung một sheet ─────── */
  chunkKeepingGroups(backgrounds, limits.background).forEach((chunk, i) => {
    const one = chunk.length === 1;
    const grid = one ? { cols: 1, rows: 1 } : tallGrid(chunk.length);
    sheets.push({
      id: seriesId("nen", i),
      orient: one ? "portrait" : "landscape",
      grid,
      cell_hint: HINT_BG,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  /* ── b. Popup tách khỏi UI nhỏ; mỗi nhóm giữ đúng tỷ lệ ô ───────────────── */
  chunkKeepingGroups(popupWide, limits.popup).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    sheets.push({
      id: seriesId("popup", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });
  chunkKeepingGroups(popupTall, Math.min(limits.popup, MAX_CELLS_TALL)).forEach((chunk, i) => {
    const grid = tallGrid(chunk.length);
    sheets.push({
      id: seriesId("popup-doc", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_PORTRAIT,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  chunkKeepingGroups(smallWide, limits.small).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    sheets.push({
      id: seriesId("ui", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });
  chunkKeepingGroups(smallTall, Math.min(limits.small, MAX_CELLS_TALL)).forEach((chunk, i) => {
    const grid = tallGrid(chunk.length);
    sheets.push({
      id: seriesId("ui-doc", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_PORTRAIT,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  chunkKeepingGroups(propsWide, limits.props).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    sheets.push({
      id: seriesId("dao-cu", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_LANDSCAPE,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });
  chunkKeepingGroups(propsTall, Math.min(limits.props, MAX_CELLS_TALL)).forEach((chunk, i) => {
    const grid = tallGrid(chunk.length);
    sheets.push({
      id: seriesId("dao-cu-doc", i),
      orient: "landscape",
      grid,
      cell_hint: HINT_PORTRAIT,
      components: padTo(chunk.map(toComponent), grid.cols * grid.rows),
    });
  });

  /* ── c. Dáng nhân vật ───────────────────────────────────────────────────── */
  const poses = s.mascotEnabled ? s.mascotPoses.filter((p) => typeof p === "string" && p.length > 0) : [];
  const cast = s.mascotEnabled ? contractCast(s, opts) : [];

  /**
   * UI-FIX §3b — MỖI NHÂN VẬT MỘT BỘ TẤM DÁNG.
   *
   * Bước Mascot nay cộng được nhiều con, nên nếu chỗ này vẫn chỉ dựng tấm cho con đầu
   * thì app bán một thứ nó không vẽ — đúng loại nói dối mà `estimateLine` sinh ra để dọn.
   * Cấu trúc contract vốn đã cho phép (`variants[].characters` là MẢNG); chỉ tầng dịch
   * này là đang thắt cổ chai.
   *
   * Tên ô: một nhân vật ⇒ giữ nguyên `NN-pose-<id>` (không đổi gì so với trước).
   * Nhiều nhân vật ⇒ chèn id nhân vật (`NN-pose-nhan-vat-2-idle`) để hai con không ghi
   * đè ảnh của nhau khi `slice.py` xuất ra `kits/`.
   */
  cast.forEach((character) => {
  const charRef = character.ref;
  const base = charRef
    ? "the SAME character from the reference photo"
    : character.description.trim() || "the same original mascot character";
  /* TRANG PHỤC NẰM Ở SUBJECT, không ở mệnh đề dáng — nó tả CON NGƯỜI ấy, không tả cử
     động. Đặt nhầm chỗ (nối vào cuối câu dáng) thì với dáng `run` ta được "…arms
     swinging, wearing a football kit", và máy vẽ đọc ra "bộ đồ đang vung tay". */
  /* Ba trục TẢ NGƯỜI (tuổi · giới · năng lượng) đổ về ĐÂY, không về `variant.style`
     — xem `buildVariantStyle`. Cả ba ở nấc giữa ⇒ chuỗi rỗng ⇒ câu không đổi một
     ký tự nào so với trước, nên không dự án cũ nào bị đổi prompt vì lượt này. */
  const dressed = character.outfit ? `${base} wearing ${character.outfit}` : base;
  const subject = [dressed, subjectAxisLine(s.styleAxes)].filter(Boolean).join(", ");
  const charName = character.vi;
  const multi = cast.length > 1;

  // Dáng KHÔNG có `group` (không phải cặp trạng thái) ⇒ cắt thuần theo trần ô.
  chunkBySize(poses, limits.mascot).forEach((chunk, i) => {
    const grid = squareGrid(chunk.length);
    const cells: Component[] = chunk.map((pose, k) => ({
      /**
       * ⚠️ TÊN Ô DÁNG PHẢI KHỚP `^[0-9]{2}-[a-z0-9-]+$` — bài học đắt của W3, và
       * TEST TÍCH HỢP VỚI AGENT THẬT mới lôi ra được, `npm test` thì không.
       *
       * Bản đầu đặt `pose-<char>-<pose>` theo đúng `styles.json` thật (`pose-lan-idle`).
       * Schema zod của webapp cho qua — `contract.ts` MIỄN V-01 cho `shape:"pose"`,
       * và docstring của nó nói rõ là cố ý. Nhưng **agent thì không miễn**:
       * `agent/lib/validate.mjs:63` chỉ miễn `shape === "empty"`, và
       * `agent/lib/contract.mjs:67-69` **CHẶN HẲN** lệnh ghi khi có error
       * (`CONTRACT_INVALID`). Nghĩa là contract đó lưu KHÔNG NỔI — client nói hợp lệ,
       * server từ chối. (Hệ quả kèm theo: `styles.json` thật của repo cũng không lưu
       * được qua agent. Đó là chuyện của agent, và WAVE 3 không được sửa `agent/`.)
       *
       * Đổi sang `NN-pose-<id>` là cách hoà cả hai mà KHÔNG mất gì: `gen.sh` và
       * `slice.py` không đọc tiền tố tên file bao giờ — chúng đọc `skel.shape==="pose"`
       * và `skel.pose` (slice.py:839). Tên file chỉ là tên ảnh xuất ra.
       * Đánh số chạy XUYÊN các tấm dáng để hai tấm không sinh ra hai `01-pose-*`.
       */
      file: `${String(i * limits.mascot + k + 1).padStart(2, "0")}-pose-${multi ? `${character.id}-` : ""}${pose}`,
      vi: `${charName}: ${pose}`,
      spec: `${subject}, ${poseSpecFor(pose, character.poseExpressions[pose])}, full body`,
      // `w` hẹp: một người đứng chiếm ~1/3 bề ngang ô, cao gần trọn ô — số của
      // `styles.json` (`w .3 · h .85`), không phải số tôi ước.
      skel: { shape: "pose" as const, pose, w: 0.3, h: 0.85 },
    }));
    sheets.push({
      id: seriesId(`pose-${character.id}`, i),
      orient: "landscape",
      grid,
      cell_hint: HINT_POSE,
      ...(charRef ? { ref: charRef, note: POSE_NOTE } : {}),
      components: padTo(cells, grid.cols * grid.rows),
    });
  });
  });

  /* ── d. Phong cách (variant) ────────────────────────────────────────────── */
  const brandRefs = opts.refs ? [...opts.refs.brand] : refPaths(s.brandRefs);
  const inspo = opts.refs ? [...opts.refs.inspo] : refPaths(s.styleRefs);

  return contractSchema.parse({
    schemaVersion: 4,
    sheets: withSheetPrompts(sheets, s.sheetPrompts),
    variants: [
      {
        id: MAIN_VARIANT_ID,
        vi: s.kitName.trim() || "Phong cách chính",
        style: buildVariantStyle(s),
        styleMode: s.styleMode,
        brand: {
          // `gen.sh:87-94`: mode "colors" ⇒ chèn dòng palette; mode "image" ⇒ đính ảnh brand.
          // Có ảnh thì ảnh thắng, nhưng vẫn giữ hex để không mất dữ liệu người dùng đã chọn.
          mode: brandRefs.length > 0 ? "image" : "colors",
          primary: s.primaryColor,
          secondary: s.secondaryColor,
          refs: brandRefs,
        },
        characters: cast.map((c) => ({ id: c.id, vi: c.vi, ref: c.ref || null, poses })),
        inspo,
      },
    ],
    characterPoses: poses,
    slice: { threshold: s.sliceThreshold },
  });
}

/** Slug ổn định cho tên file tải về (`.zip`) — dùng chung `slugify` của agent. */
export function kitSlug(s: Pick<KitsetContractInput, "kitName">): string {
  return slugify(s.kitName);
}
