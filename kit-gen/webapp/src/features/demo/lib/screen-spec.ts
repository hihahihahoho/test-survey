/**
 * features/demo/lib/screen-spec.ts — LỚP DỮ LIỆU BỐ CỤC MÀN, THỨ CHƯA TỪNG TỒN TẠI.
 *
 * ╔══ VÌ SAO PHẢI ĐẺ RA MỘT LỚP MỚI ══════════════════════════════════════════╗
 * ║ Cả chuỗi skeleton (`styles.json` → contract → `slice.py` → `kits/manifest` ║
 * ║ `.json`) KHÔNG có một trường `x`/`y`/`screen`/`z` nào. Vị trí ô trên tấm    ║
 * ║ gen ảnh suy ra từ CHỈ SỐ MẢNG (`skeleton.py:106` `r, c = divmod(i, cols)`),║
 * ║ và đó là vị trí trên **tấm gen**, không phải trên **màn game**. Prototype   ║
 * ║ `kit-gen/screens.html:154-226` vì thế phải bịa 100% toạ độ bằng tay.        ║
 * ║ ⇒ Feature #21 = THÊM một lớp dữ liệu, không phải đọc một lớp có sẵn.        ║
 * ║ (Khảo sát đầy đủ: `docs/design-demo-to-figma-2026-08.md` §3.1.)             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── HAI QUY ƯỚC ĐƠN VỊ, CẢ HAI ĐỀU CÓ LÝ DO ĐO ĐƯỢC ───────────────────────┐
 * │ ① Vị trí là **% của khung màn**, trỏ vào **TÂM** ô ⇒ đổi khung 400×600     │
 * │    sang 390×844 không phải viết lại spec.                                 │
 * │ ② Kích thước là **px của THÂN (safe zone)**, không phải của ảnh.          │
 * │    Đây là chỗ bản này KHÁC prototype, và số liệu đứng sau nó — đếm trên    │
 * │    bảy ô của màn Home ở cả bốn kit thật (`kits/manifest.json`, ca cuối của │
 * │    `__tests__/resolve-scene.test.ts`):                                     │
 * │        `safe` giống hệt nhau ở cả bốn kit:  **4/7 ô**                      │
 * │        `content` giống hệt nhau:            **0/7 ô**                      │
 * │    Thân đến từ contract skeleton nên chỉ đổi khi thư viện element đổi đời  │
 * │    (ipay là đời cũ, ba kit kia đời mới — 3 ô lệch là vì vậy, và mỗi ô cũng │
 * │    chỉ có ĐÚNG HAI giá trị); còn ảnh đã cắt thì trôi theo lượng trang trí  │
 * │    của từng phong cách, không ô nào giống ô nào (rãnh tiến trình: ipay     │
 * │    237×75 · tet 310×74 · rnd 291×76 · candy 268×73). Spec viết theo thân   │
 * │    thì một bản dùng được cho mọi kit; viết theo ảnh thì mỗi kit lệch một   │
 * │    kiểu.                                                                   │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

/** Khung màn mặc định — đúng cỡ prototype (`screens.html:26`). */
export const SCREEN_SIZE = { w: 400, h: 600 } as const;

/**
 * Chữ đè lên một ô. Sang Figma thành TEXT NODE sửa được (encoder phát
 * `NODE_TYPE.TEXT` kèm font — `figma-h2d.global.js:1049-1055`, `:1187`), đây là giá
 * trị lớn nhất của đường này so với đường bitmap.
 */
export interface ScreenTextSpec {
  value: string;
  /** px trong hệ toạ độ khung màn. */
  size: number;
  weight?: number;
  /** Mặc định trắng + đổ bóng mềm; đặt màu khác khi nền ô sáng. */
  color?: string;
  /** Dời chữ khỏi tâm frame (px) — nhãn ribbon phải nhích lên khỏi phần đuôi cờ. */
  dy?: number;
}

/**
 * Một ô trên màn.
 *
 * `file` là **khoá map duy nhất** giữa spec và kit: chuỗi `component.file` không đuôi
 * `.png` (`slice.py:1129` đặt tên ảnh cắt ra ĐÚNG bằng tên đó — xem §3.2 của thiết kế).
 * Riêng `role:"pose"` thì `file` là **mã dáng** (`wave`, `cheer`…), vì tên file mascot
 * KHÔNG thống nhất giữa các kit — xem `resolveScene`.
 */
export interface ScreenNode {
  file: string;
  /** Tâm ô, % của khung màn. */
  x: number;
  y: number;
  /** Ép **bề ngang THÂN** (px). Giữ nguyên tỉ lệ ảnh. Ưu tiên hơn `bh`. */
  bw?: number;
  /** Ép **chiều cao THÂN** (px). Dùng cho mascot: chiều cao mới là thứ căn theo nền. */
  bh?: number;
  /** Lớp vẽ; nhỏ vẽ trước. Không sinh `z-index` — thứ tự DOM là thứ tự layer. */
  z?: number;
  text?: ScreenTextSpec;
  /** Ô mascot: `file` là mã dáng, không phải tên file. */
  role?: "pose";
}

/** Một màn demo. */
export interface ScreenSpec {
  id: string;
  /** Thành `aria-label` ⇒ TÊN FRAME trong Figma (§4.2: tên chỉ đi qua `aria-*`). */
  name: string;
  size: { w: number; h: number };
  /** Tên ô `shape:"full"` làm nền. Kit thiếu ô này ⇒ màn KHÔNG dựng được. */
  background: string;
  /** Màu nền frame màn — thấy được ở mép khi ảnh nền không phủ hết. */
  ground: string;
  nodes: readonly ScreenNode[];
}
