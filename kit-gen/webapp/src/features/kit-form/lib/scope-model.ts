/*
 * §W3-5 — `SCOPE_CHOICES` (12 món hardcode) ĐÃ XOÁ.
 *
 * Nó là danh sách element THỨ BA của repo, đá nhau với `luckyElements` (11) và với
 * `element-lib` (42) — mà **không một file nào import nó**: một export chết đang giả
 * vờ là dữ liệu. Nguồn duy nhất nay là `element-lib` qua `useElementLib()`.
 * `squareCapacity` bên dưới vẫn sống: `form-to-contract.ts` còn dùng.
 */
export function squareCapacity(count: number): 0 | 1 | 4 | 9 | 16 {
  if (count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 4) return 4;
  if (count <= 9) return 9;
  return 16;
}

export function scopeSentence(count: number): string {
  const capacity = squareCapacity(count);
  if (capacity === 0) return "Chưa chọn món giao diện nào.";
  return `Đã chọn ${count} món → máy xếp thành 1 tấm ${capacity} ô, còn ${capacity - count} ô để trống.`;
}
