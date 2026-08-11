/**
 * webapp/src/lib/viewport/types.ts — kiểu dữ liệu của tầng khung nhìn (pan/zoom).
 *
 * Tầng này THUẦN TOÁN + THUẦN DOM-EVENT, KHÔNG biết gì về canvas/S3/feature nào.
 * Luật (FE-PLAN §3-B1): không import bất cứ thứ gì từ `features/**`.
 *
 * QUY ƯỚC TOẠ ĐỘ (một quy ước duy nhất cho cả app — UI-SPEC-V2 W4):
 *   screen = world * k + (x, y)
 *   world  = (screen - (x, y)) / k
 * `x`,`y` tính bằng **pixel màn hình** (không phải pixel thế giới) ⇒ pan bằng chuột
 * cộng thẳng delta của con trỏ, không phải chia cho k. Đây là chỗ hay sai nhất khi
 * mỗi màn tự viết một bản; vì thế nó được viết một lần ở đây.
 */

/** Trạng thái khung nhìn. `k` = hệ số phóng (1 = 100%). */
export interface Viewport {
  x: number;
  y: number;
  k: number;
}

/** Hình chữ nhật trong hệ toạ độ THẾ GIỚI. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Kích thước khung chứa (phần tử DOM bọc canvas), pixel màn hình. */
export interface Size {
  width: number;
  height: number;
}

/** Điểm — dùng cho cả hệ màn hình lẫn hệ thế giới, tuỳ ngữ cảnh hàm. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Lệnh khung nhìn sinh ra từ bàn phím. Tách khỏi hook để test được **không cần DOM**
 * (vitest.config.ts đang chạy environment "node"; test cần DOM phải mang tên
 * `*.dom.test.tsx` và hiện chưa có jsdom trong devDependencies — không giấu).
 */
export type ViewportCommand =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoomStep"; direction: 1 | -1 }
  | { type: "actualSize" }
  | { type: "fitAll" }
  | { type: "fitSelection" };

/** Phần thuộc tính bàn phím mà `resolveViewportCommand` cần (KeyboardEvent thoả kiểu này). */
export interface KeyLike {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}
