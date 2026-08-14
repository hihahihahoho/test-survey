import { SCREEN_SIZE, type ScreenSpec } from "../lib/screen-spec";

/**
 * BỐ CỤC MẶC ĐỊNH CỦA CÁC MÀN DEMO — hằng số trong repo, không phải dữ liệu dự án.
 *
 * ╔══ VÌ SAO MỘT FILE TĨNH LẠI DÙNG ĐƯỢC CHO MỌI KIT ═════════════════════════╗
 * ║ Vì tên ô là **từ vựng có kiểm soát**: `element-lib-v2.json` khai 42 element ║
 * ║ với `file` cố định (`01-btn-pill-red`, `25-bg-home`…) và `slice.py:1129`    ║
 * ║ đặt tên ảnh cắt ra đúng bằng tên đó. Kit nào thiếu ô ⇒ **bỏ qua node đó**,  ║
 * ║ màn vẫn dựng (đúng lối `screens.html:72` `if (!a) return null`); màn mất    ║
 * ║ NỀN thì ẩn hẳn màn, không dán một khung trống ra Figma.                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── LÁT 1 CHỈ CÓ MÀN HOME, VÀ ĐÓ LÀ CHỦ Ý ─────────────────────────────────┐
 * │ Ba màn còn lại của prototype (`screens.html:171-226`) đều dựa vào 9-slice  │
 * │ (`22-board-panel`, `48-rank-row`, các nút pill co giãn). `border-image` —  │
 * │ đường 9-slice của prototype — KHÔNG được encoder nhúng ảnh: `collectFor`   │
 * │ chỉ quét `styles.backgroundImage` (`figma-h2d.global.js:289-296`) trong    │
 * │ khi `borderImageSource` vẫn lọt vào `node.styles` (`:338`). Dán ra Figma   │
 * │ là panel RỖNG, và KHÔNG có gì báo lỗi. Lát 1 né sạch cái bẫy đó bằng cách  │
 * │ chỉ ship màn Home và không co giãn ô nào. Kiến trúc thì đã đủ chỗ: mảng    │
 * │ này thêm màn là xong, mọi tầng dưới đã chạy theo N màn.                    │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * SỐ TRONG BẢNG NÀY ĐẾN TỪ ĐÂU: vị trí `%` chép nguyên `screens.html:154-169`; còn
 * `bw`/`bh` là cỡ THÂN, quy đổi từ cỡ ảnh của prototype bằng tỉ lệ `safe/content` đo
 * trên kit `ipay` thật (ví dụ nút chơi: prototype vẽ ảnh rộng 250px, ipay có
 * `safe.w/content.w = 300/248` ⇒ thân 302 ≈ **300**). Xem `screen-spec.ts` để biết vì
 * sao đơn vị là thân chứ không phải ảnh.
 */
export const DEMO_SCREENS: readonly ScreenSpec[] = [
  {
    id: "home",
    name: "Màn HOME",
    size: SCREEN_SIZE,
    background: "25-bg-home",
    ground: "#0d0f16",
    nodes: [
      { file: "50-counter-pill", x: 20, y: 6, bw: 100, text: { value: "1.250", size: 13 } },
      { file: "04-btn-circle", x: 90, y: 6, bw: 38 },
      { file: "10-popup-ribbon", x: 50, y: 14, bw: 250, text: { value: "SĂN QUÀ MAY MẮN", size: 15, dy: -6 } },
      /* Thân mascot cao 225px, tâm y 57% ⇒ chân chạm mặt bục (~76%) — contract của
         `25-bg-home` dặn model để bục ở NỬA DƯỚI ảnh (`styles.json:486`). */
      { file: "wave", role: "pose", x: 50, y: 57, bh: 225 },
      { file: "07-progress-track", x: 50, y: 82.5, bw: 327 },
      /* Thanh chạy KHÔNG co giãn ở lát 1: giữ đúng tỉ lệ ảnh, thu về ~62% bề ngang thân.
         Kéo méo một raster là thứ hợp đồng §3.3 cấm, 9-slice thì phải chờ lát 3.
         `x:36.5` chọn bằng cách ĐO trên cả bốn kit (ipay/candy/tet/rnd): với số này phần
         MỰC của thanh chạy nằm gọn trong phần mực của rãnh ở cả bốn; canh theo thân
         (36) thì ipay lòi ra ~10px vì hitbox rãnh của nó rộng hơn mực rất nhiều. */
      { file: "08-progress-fill", x: 36.5, y: 82.5, bw: 190 },
      { file: "01-btn-pill-red", x: 50, y: 91, bw: 300, text: { value: "CHƠI NGAY", size: 19 } },
    ],
  },
];

export function screenSpecById(id: string): ScreenSpec | null {
  return DEMO_SCREENS.find((s) => s.id === id) ?? null;
}
