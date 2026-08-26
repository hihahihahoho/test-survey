import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * ══ B6 (VERIFIER tìm thêm) — `cn()` ĐANG NUỐT MÀU CHỮ ═══════════════════════════
 * Thang chữ của §5.1 đặt tên SEMANTIC (`text-body`, `text-label`, `text-title`…)
 * chứ không phải `text-sm`/`text-base`. `twMerge` mặc định chỉ biết thang cỡ chữ
 * CHUẨN của Tailwind, nên nó xếp `text-body` vào nhóm **màu chữ** — cùng nhóm với
 * `text-fg-on-accent`. Hai class "cùng nhóm" ⇒ class sau THẮNG, class trước bị XOÁ.
 *
 * Hậu quả đo được (script /tmp/… trong VERIFY.md): mọi Button cỡ sm/md/lg mất
 * class màu chữ của biến thể — nút primary mất `text-fg-on-accent` nên chữ rơi về
 * màu KẾ THỪA (trắng/#B4B4B4) trên nền mint: **1.9:1** và **1.09:1** thay vì
 * 11.05:1. Đây chính là "nút mint trống chữ" ở ảnh 09 (B2) — B1 chỉ chữa được ca
 * DISABLED, ca ENABLED vẫn hỏng cho tới lượt sửa này. `danger` mất
 * `text-fg-on-danger`, `secondary/ghost/link` mất màu chữ của mình.
 *
 * SỬA ở đúng tầng: khai báo thang cỡ chữ của dự án cho tailwind-merge, để nó phân
 * biệt được cỡ chữ và màu chữ. Ghi đè trong CÙNG nhóm vẫn hoạt động bình thường
 * (`text-body text-label` → `text-label`; `text-fg-muted text-fg-strong` → `text-fg-strong`).
 * Danh sách dưới đây phải khớp key `theme.fontSize` trong tailwind.config.ts —
 * có test canh (`src/__tests__/cn-font-size.test.ts`).
 */
export const FONT_SIZE_KEYS = [
  /* W2B-1 — ba bậc display của tiêu đề trang. Thiếu chúng ở đây thì `cn()` xếp
     `text-display-1` vào nhóm MÀU CHỮ và nuốt mất `text-fg-strong` đứng sau nó —
     đúng con bọ B6 mà khối chú thích trên kể lại, chỉ khác tên class. */
  "display-1",
  "display-2",
  "display-3",
  "display",
  /* Câu mad-lib của khu soạn prompt — xem chú thích bậc `prose` trong tailwind.config.ts. */
  "prose",
  "title",
  "subtitle",
  "body",
  "label",
  "caption",
  "mono",
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...FONT_SIZE_KEYS] }] } },
});

/** Gộp class, giải xung đột Tailwind. Dùng ở MỌI component. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
