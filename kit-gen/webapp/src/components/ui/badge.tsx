import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * §5.5 Badge — cao 20px, r-full, padding 2px 8px, cỡ chữ caption (12px = sàn).
 * LUẬT A3: badge LUÔN có icon + chữ. Không có badge chỉ-màu.
 *
 * ══ P-SWEEP·bảng-7 · MỘT KIỂU BADGE, TÔNG CHỈ NẰM Ở CHỮ ═════════════════════
 * Quét 30 ảnh đếm được BỐN kiểu badge cùng lúc: `status-pill` nền accent nhạt ·
 * `workflow-project-pill` xám hairline · badge trạng thái nền tint đặc · `sync-badge`
 * viền hairline. Bốn cái nói cùng một loại thông tin ("đây là một nhãn trạng thái")
 * bằng bốn hình khác nhau, và hai trong bốn mang MẢNG MÀU — trên lưới 6 thẻ Home
 * thành 6 mảng màu nhỏ nhấp nháy dưới mỗi tên bộ kit.
 *
 * Chốt một kiểu: **hairline `line-subtle` + nền trong suốt**, tông trạng thái chỉ
 * đổi MÀU CHỮ. Nhờ vậy badge nằm được trên bất kỳ lớp nền nào mà không phải tính
 * lại nền tint theo lớp.
 *
 * Tương phản: bộ `--kg-on-tint-*` giữ nguyên (chúng vốn là màu CHỮ, không phải màu
 * nền). Đo lại trên nền ĐẶC của cả 4 lớp, cả 2 theme: thấp nhất là
 * `on-tint-accent` trên `overlay` ở theme sáng = **6.15:1** — cao hơn cả ngưỡng cũ
 * 4.5:1 đo trên nền tint, vì bỏ tint đi làm nền tối/sáng hơn chứ không nhạt đi.
 */
const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-line-subtle px-2 text-caption font-medium [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        never: "text-on-tint-never",
        queued: "text-on-tint-queued",
        running: "text-on-tint-running",
        accent: "text-on-tint-accent",
        ok: "text-on-tint-ok",
        warn: "text-on-tint-warn",
        stale: "text-on-tint-stale",
        danger: "text-on-tint-danger",
        outline: "text-fg",
      },
    },
    defaultVariants: { tone: "never" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
