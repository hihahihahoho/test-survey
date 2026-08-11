/**
 * breakpoints.js — NGUỒN DUY NHẤT của 3 mốc responsive §2.2 cho phía JS.
 *
 * VÌ SAO CẦN FILE NÀY: media query của CSS **không** dùng được `var(--token)`,
 * nên mốc phải viết bằng số ở cả `css/layout.css` lẫn `matchMedia()` trong JS.
 * Gom số vào một chỗ để hai bên không lệch nhau khi ai đó sửa mốc.
 *
 * Ba mốc (§2.2): ≥1440 thoải mái · 1100–1439 rail icon · 768–1099 rail thành
 * drawer + editor xếp dọc · <768 chỉ đọc.
 *
 * ⚠ Sửa số ở đây thì PHẢI sửa cùng lúc trong `web/css/layout.css`.
 */

/** Từ mốc này trở xuống, rail bị đưa ra khỏi luồng và phải mở bằng nút ☰. */
export const RAIL_DRAWER_MAX = 1099;

/** Từ mốc này trở xuống là "màn hình nhỏ": xem được, sửa nên dùng máy tính. */
export const SMALL_SCREEN_MAX = 767;

/** `matchMedia` cho mốc rail-drawer. Trả null nếu môi trường không có matchMedia. */
export function railDrawerQuery() {
  if (typeof matchMedia !== 'function') return null;
  return matchMedia(`(max-width: ${RAIL_DRAWER_MAX}px)`);
}

/** `matchMedia` cho mốc màn hình nhỏ. */
export function smallScreenQuery() {
  if (typeof matchMedia !== 'function') return null;
  return matchMedia(`(max-width: ${SMALL_SCREEN_MAX}px)`);
}
