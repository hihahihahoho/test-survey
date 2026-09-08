import { GLAZE_AUTO, GLAZE_PRESETS } from "@/features/kit-core/lib/glaze";
import { EXPRESSIONS, OUTFIT_THEMES, POSES } from "@/features/kit-core/lib/poses";
import { CAMERA_VIEWS } from "@/features/prompt-lab/lib/pose/pose-state";

/**
 * catalog-seeds.ts — HẠT GIỐNG của MỌI danh mục pill chọn-một.
 *
 * ╔══ VÌ SAO CÁC BẢNG CỨNG PHẢI RỜI KHỎI `pill-registry.ts` ═════════════════╗
 * ║ Trước lượt này, mười một trục pill có mười một chỗ chứa khác nhau: khung  ║
 * ║ cảnh và bố cục nằm cứng trong `pill-registry`, đục nền ở `glaze.ts`,      ║
 * ║ trang trí ở `presets-store`, dáng/biểu cảm/trang phục ở `poses.ts`, góc   ║
 * ║ máy ở `pose-state.ts`. Hệ quả đo được: chỉ `style` (và element, mascot)   ║
 * ║ là sửa được trên màn; mười trục còn lại muốn thêm một mục thì phải sửa mã ║
 * ║ nguồn và phát hành lại app. Chủ sản phẩm nói thẳng: *"đang thiếu khá      ║
 * ║ nhiều mục quản lý"*.                                                     ║
 * ║ Nên các bảng ấy đổi vai: từ NGUỒN ĐỌC THẲNG thành HẠT GIỐNG của kho —     ║
 * ║ y hệt cách `GENRE_PRESETS` đã làm với danh mục phong cách từ đầu. Mã      ║
 * ║ nguồn vẫn giữ giá trị mặc định (mở app lần đầu là có ngay), nhưng thứ đi  ║
 * ║ vào prompt thì đọc từ kho, nên sửa được.                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ BẢNG NÀO Ở LẠI CHỖ CŨ, VÀ VÌ SAO ══════════════════════════════════════
 * `GLAZE_PRESETS`, `POSES`, `CAMERA_VIEWS`, `EXPRESSIONS`, `OUTFIT_THEMES`
 * KHÔNG bị xoá khỏi nhà của chúng: mỗi bảng còn mang thứ mà kho không mang nổi
 * — toạ độ camera, nhóm dáng, cụm chữ mặc định cho những cửa không đi qua kho.
 * File này chỉ ĐỌC chúng một lần để gieo hạt. Sau khi gieo, kho là nguồn.
 */

/** Một dòng hạt giống: đúng hình dạng của `CatalogRow` nhưng chưa có cờ trạng thái. */
export interface SeedRow {
  id: string;
  vi: string;
  en: string;
  hint?: string;
  /**
   * CÂU TIẾNG ANH THỨ HAI — chỉ trục `theme` có, và nó không phải chuyện làm màu:
   * một chủ đề trả lời cùng lúc hai câu hỏi ở hai chỗ khác hẳn nhau (bộ kit mang
   * mô-típ gì · nhân vật mặc gì). Xem `ThemeOption.kitEN`.
   */
  en2?: string;
}

/** Khung cảnh của thẻ Cảnh nền. */
const SCENE_SEED: readonly SeedRow[] = [
  { id: "main-menu", vi: "Màn hình chính", en: "a main menu screen background" },
  { id: "level", vi: "Màn chơi", en: "an in-game level background" },
  { id: "shop", vi: "Cửa hàng", en: "an in-game shop interior background" },
  { id: "map", vi: "Bản đồ", en: "a world map screen background" },
  { id: "result", vi: "Màn kết quả", en: "a level-complete result screen background" },
  { id: "loading", vi: "Màn chờ", en: "a loading screen background" },
];

/**
 * Bố cục của tấm nền — CHỖ NÀO ĐỂ TRỐNG cho UI, chi tiết dồn vào đâu.
 *
 * Mỗi cụm EN nói ra hai vế ấy bằng số phần khung cụ thể ("the middle third"),
 * không nói bằng tính từ ("balanced"): một tấm nền game hỏng hay không là ở chỗ
 * cái nút bấm sắp đặt lên nó có nằm trên một vùng rối rắm hay không.
 */
const LAYOUT_SEED: readonly SeedRow[] = [
  {
    id: "center-clear",
    vi: "thoáng giữa",
    hint: "chỗ đặt UI",
    en: "composition: keep the middle third of the frame open and low in detail so UI can sit there, and concentrate the detail along the top and bottom edges",
  },
  {
    id: "top-clear",
    vi: "thoáng phía trên",
    en: "composition: keep the upper third of the frame open and low in detail so UI can sit there, and concentrate the detail in the lower half",
  },
  {
    id: "bottom-clear",
    vi: "thoáng phía dưới",
    en: "composition: keep the lower third of the frame open and low in detail so UI can sit there, and concentrate the detail in the upper half",
  },
  {
    id: "full",
    vi: "kín toàn khung",
    en: "composition: detail spread evenly across the whole frame, with no area held back for UI",
  },
  {
    id: "low-horizon",
    vi: "chân trời thấp",
    en: "composition: horizon low in the frame with a wide open sky above it, and the detail concentrated along the bottom",
  },
  {
    id: "high-horizon",
    vi: "chân trời cao",
    en: "composition: horizon high in the frame with a wide open foreground below it, and the detail concentrated along the top",
  },
];

/**
 * BỐN NẤC TRANG TRÍ — thang của pill `decor`, dùng lại ở hạt giống element.
 *
 * ╔══ VÌ SAO BỐN NẤC CÓ TÊN THAY CHO THANG 1..7 ═════════════════════════════╗
 * ║ Thang cũ hỏi "viền dày bao nhiêu" và trả lời bằng bảy mức độ dày. Chủ sản ║
 * ║ phẩm nhìn tấm khung Tết vẽ ra rồi nói: *"lần nào nó cũng ra viền decor"*  ║
 * ║ — và cả bảy nấc đều đúng như thế, vì không nấc nào trong số đó CẤM được   ║
 * ║ hoa mai với đèn lồng bám quanh ô. Nên trục này đổi câu hỏi: không phải    ║
 * ║ "viền dày mỏng" mà LƯỢNG TRANG TRÍ — không · ít · vừa · nhiều — và mỗi    ║
 * ║ nấc phải nói CẢ hai vế (viền lẫn hoa văn), đủ mạnh để thắng chủ đề.       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VẪN CHỈ TẢ CẤU TRÚC, KHÔNG TẢ CÁCH ĐÁNH BÓNG ══════════════════════════╗
 * ║ Cách hoàn thiện (vát khối, chuyển màu, đổ bóng) là việc của PHONG CÁCH —  ║
 * ║ đã nói một lần cho cả tấm. Không "bevel", không "gradient", không         ║
 * ║ "shadow", không "glow" — cổng ở `prompt-composer.test.tsx` canh chữ ấy.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const DECOR_SEED: readonly SeedRow[] = [
  {
    id: "none",
    vi: "Không",
    en: "clean silhouette: a plain edge with no rim ornament and NO decorative objects attached"
      + " — no flowers, lanterns, ribbons, gems or trinkets on or around it",
  },
  { id: "light", vi: "Ít", en: "a simple rim and at most one small accent, no clusters of ornaments" },
  { id: "medium", vi: "Vừa", en: "a distinct rim with a few ornaments at the corners, the body itself left clear" },
  { id: "rich", vi: "Nhiều", en: "an ornate rim with generous ornaments around it" },
];

/**
 * BỐN CÁCH BỐ TRÍ chỗ trang trí — thang của pill `decorPlace`.
 *
 * Câu Anh nói ra CHỖ, không nói ra lượng: lượng đã là việc của `DECOR_SEED`, và
 * hai trục cùng nói về lượng là hai giọng chỉ huy một chuyện.
 */
const DECOR_PLACE_SEED: readonly SeedRow[] = [
  { id: "balanced", vi: "Cân đối", en: "ornaments mirrored symmetrically, left and right halves matching" },
  { id: "left", vi: "Lệch trái", en: "ornaments clustered on the LEFT side, the right side kept clean" },
  { id: "right", vi: "Lệch phải", en: "ornaments clustered on the RIGHT side, the left side kept clean" },
  { id: "random", vi: "Ngẫu nhiên", en: "ornaments placed freely, asymmetric" },
];

/**
 * DÁNG — id + nhãn lấy thẳng từ danh mục dáng của kit-core.
 *
 * `en` sinh từ id (id vốn đã là tiếng Anh: "hold-gift", "view-34") thay vì bịa một
 * bảng dịch thứ hai. Sau khi gieo, người dùng sửa được câu ấy trên màn.
 */
const POSE_SEED: readonly SeedRow[] = POSES.map((pose) => ({
  id: pose.id,
  vi: pose.label,
  en: `a ${pose.id.replace(/-/g, " ")} pose`,
}));

/**
 * GÓC MÁY — đọc thẳng bảng camera của manơcanh.
 *
 * Chỉ lấy `id`/`vi`/`en`; `position` ở lại `pose-state.ts` vì nó là toạ độ dựng
 * ảnh, không phải chữ. Đó cũng là lý do trục này KHÔNG cho thêm dòng mới: một góc
 * không có toạ độ thì manơcanh không biết đặt máy quay ở đâu.
 */
const VIEW_SEED: readonly SeedRow[] = CAMERA_VIEWS.map((view) => ({ id: view.id, vi: view.vi, en: view.en }));

/**
 * ĐỤC NỀN — `id`/`vi`/`en`/`hint` của `GLAZE_PRESETS`.
 *
 * Nấc `auto` mang `en` RỖNG có chủ ý: câu của nó nằm ở `gen.sh` (`## Transparency`)
 * chứ không nối vào dòng element. Dòng phụ trong menu vì thế nhường cho `hint`.
 */
const GLAZE_SEED: readonly SeedRow[] = GLAZE_PRESETS.map((preset) => ({
  id: preset.id,
  vi: preset.vi,
  en: preset.en,
  ...(preset.hint ? { hint: preset.hint } : {}),
}));

/** BIỂU CẢM — `value` (cụm tiếng Anh) vừa là id vừa là hạt giống của câu. */
const EXPRESSION_SEED: readonly SeedRow[] = EXPRESSIONS.map((option) => ({
  id: option.value,
  vi: option.label,
  en: option.value,
}));

/**
 * CHỦ ĐỀ — mục DUY NHẤT mang hai câu, xem `SeedRow.en2`.
 *
 * `id` giữ nguyên `value` (cụm trang phục đời đầu) vì nó đang nằm trong bản nháp
 * của mọi dự án có thật; đổi id là mọi dự án cũ mở lên mất chủ đề đã chọn.
 */
const THEME_SEED: readonly SeedRow[] = OUTFIT_THEMES.map((option) => ({
  id: option.value,
  vi: option.label,
  en: option.kitEN,
  en2: option.value,
}));

/** TRANG PHỤC — cùng hạt giống với chủ đề, nhưng là danh mục RIÊNG: một đội có thể
 *  muốn thêm bộ đồ không gắn với chủ đề nào (đồng phục, cosplay sự kiện). */
const OUTFIT_SEED: readonly SeedRow[] = OUTFIT_THEMES.map((option) => ({
  id: option.value,
  vi: option.label,
  en: option.value,
}));

/** Trục pill có danh mục chỉ gồm «nhãn Việt + câu Anh» — tức mọi trục trừ element. */
export type CatalogKind =
  | "style" | "theme" | "scene" | "layout" | "glaze"
  | "decor" | "decorPlace" | "pose" | "view" | "expression" | "outfit";

/**
 * HẠT GIỐNG THEO TRỤC. `style` KHÔNG có mặt ở đây: nó đã có kho riêng
 * (`PresetBundle.styles`, gieo từ `GENRE_PRESETS`) từ trước lượt này, và gộp nó
 * vào bảng này nghĩa là hai chỗ cùng gieo một trục.
 */
export const CATALOG_SEEDS: Record<Exclude<CatalogKind, "style">, readonly SeedRow[]> = {
  theme: THEME_SEED,
  scene: SCENE_SEED,
  layout: LAYOUT_SEED,
  glaze: GLAZE_SEED,
  decor: DECOR_SEED,
  decorPlace: DECOR_PLACE_SEED,
  pose: POSE_SEED,
  view: VIEW_SEED,
  expression: EXPRESSION_SEED,
  outfit: OUTFIT_SEED,
};

/** Thứ tự hiện trên rail trái của màn «Thư viện prompt». */
export const CATALOG_ORDER: readonly Exclude<CatalogKind, "style">[] = [
  "theme", "scene", "layout", "glaze", "decor", "decorPlace", "pose", "view", "expression", "outfit",
];

/**
 * DÒNG HỆ THỐNG — sửa được câu, KHÔNG xoá được.
 *
 * ╔══ VÌ SAO KHOÁ, THAY VÌ CHO XOÁ RỒI TỰ GIEO LẠI ══════════════════════════╗
 * ║ Ba id dưới đây không phải "một lựa chọn trong danh sách" — chúng là GIÁ    ║
 * ║ TRỊ MẶC ĐỊNH mà mã nguồn gọi tên thẳng: `newCell` đặt `glazeId = auto`,   ║
 * ║ `decorLevelOf` rơi về `medium` nhưng `hasDecorPlacement` so với `none`,   ║
 * ║ `decorPlaceOf` rơi về `balanced`. Xoá một trong số chúng là để lại một    ║
 * ║ giá trị mặc định không tra ra dòng nào — pill hiện chữ trần, câu rụng      ║
 * ║ khỏi prompt, và không ai được báo. Nên khoá, và nói ra lý do trên UI.     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export const LOCKED_ROWS: Partial<Record<CatalogKind, readonly string[]>> = {
  glaze: [GLAZE_AUTO, "solid"],
  decor: ["none"],
  decorPlace: ["balanced"],
};

/**
 * TRỤC KHÔNG THÊM ĐƯỢC DÒNG — dòng của chúng gắn với dữ liệu ngoài câu chữ.
 *
 * `pose` gắn bảng góc khớp manơcanh 3D (`pose-presets.ts`), `view` gắn toạ độ máy
 * quay (`pose-state.ts`). Một dòng mới ở hai trục này sẽ có chữ mà không có hình —
 * và ảnh manơcanh đính kèm sẽ nói về một dáng/góc khác hẳn câu trong prompt. Sửa
 * nhãn · sửa câu · ẩn · đổi thứ tự thì vẫn được.
 */
export const FIXED_KINDS: readonly CatalogKind[] = ["pose", "view"];

/**
 * Trục này có bảng dữ liệu ngoài chữ đi kèm không.
 *
 * Nhận `string` chứ không nhận `CatalogKind`: chỗ gọi là màn quản lý, và ở đó
 * `kind` còn có thể là `element` (danh mục có kho riêng, không nằm trong bảng hạt
 * giống này). Ép kiểu hẹp ở đây chỉ đẩy một phép ép kiểu sang bên kia.
 */
export function isFixedKind(kind: string): boolean {
  return (FIXED_KINDS as readonly string[]).includes(kind);
}

/** Trục này có cho thêm dòng mới không. */
export function canAddRow(kind: string): boolean {
  return !isFixedKind(kind);
}

/** Dòng này có xoá được không. */
export function canDeleteRow(kind: string, id: string): boolean {
  if (isFixedKind(kind)) return false;
  return !(LOCKED_ROWS[kind as CatalogKind] ?? []).includes(id);
}
