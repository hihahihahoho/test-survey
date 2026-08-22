/**
 * features/kit/lib/backdrop.ts — NỀN XEM THỬ 3 CHẾ ĐỘ (§3-S5: "bắt buộc để đánh giá alpha").
 *
 * Vì sao cần: PNG trong suốt trên nền tối trông "đủ dùng", nhưng viền còn sót màu nền
 * tách (magenta/green) chỉ lộ ra khi xem trên nền TRẮNG; ngược lại phần bị ăn mất chỉ
 * lộ trên nền ĐEN. Ô vuông (checkerboard) cho biết chỗ nào THẬT SỰ trong suốt.
 *
 * Lựa chọn được ghi vào `kitgen.ui.v1` qua store của R0 (`kitBackdrop`) — đã có sẵn
 * trong allowlist persist, tôi KHÔNG thêm khoá mới.
 */
import type { KitBackdrop } from "@/lib/store";

export type Backdrop = KitBackdrop;

export const BACKDROPS: readonly { value: Backdrop; label: string; hint: string }[] = [
  { value: "checker", label: "Ô vuông", hint: "Thấy rõ vùng trong suốt" },
  { value: "dark", label: "Đen", hint: "Thấy phần bị ăn mất ở viền" },
  { value: "light", label: "Trắng", hint: "Thấy viền sáng còn sót" },
];

/**
 * Class nền. Đen/trắng dùng token của §5.3 (`canvas` là nền app tối nhất,
 * `fg-strong` là màu sáng nhất trong thang) — KHÔNG hard-code `#fff`/`#000`,
 * đúng ràng buộc "không hard-code màu".
 */
export function backdropClass(b: Backdrop): string {
  if (b === "dark") return "bg-canvas";
  if (b === "light") return "bg-fg-strong";
  return "kg-checkerboard";
}

export function backdropLabel(b: Backdrop): string {
  return BACKDROPS.find((x) => x.value === b)?.label ?? "Ô vuông";
}

/** Phím `1/2/3` đổi nền (§3-S5 phím tắt). */
export function backdropForKey(key: string): Backdrop | null {
  if (key === "1") return "checker";
  if (key === "2") return "dark";
  if (key === "3") return "light";
  return null;
}
