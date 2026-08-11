import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * §5.4 — ĐÚNG 5 biến thể × 3 cỡ. Không có biến thể thứ 6.
 * Luật màn: mỗi màn TỐI ĐA 1 nút `primary` (đóng audit §1.1-7).
 * loading : spinner 14px thay icon, chữ giữ nguyên, width không đổi.
 *
 * ══ B1/B2 (mắt chủ dự án bắt trên app thật) ═══════════════════════════════════
 * TRƯỚC: mọi biến thể dùng chung `disabled:opacity-45`. Với `primary` điều đó =
 * nền accent đặc (khi đó là mint #71D083, nay là xanh VNPAY) mờ 45% + chữ `--kg-fg-on-accent` (#000 dark / #FFF light) cũng
 * mờ 45% ⇒ trên nền đen ra một khối mint nhạt với chữ gần như biến mất; hệ điều
 * hành/màn hình còn trộn thêm subpixel nên nhìn ra ánh hồng/tím. Đó là nút
 * "Tiếp: chọn thư mục làm việc →" (01-s0-setup) và nút Lưu ở thanh S3 (09).
 * SAU: disabled KHÔNG dùng opacity nữa — nó ĐỔI HẲN sang bộ màu trung tính đặc
 * (`bg-raised` + `text-fg-muted` + `border-line-subtle`) cho MỌI biến thể. Số đo
 * (scripts/check-contrast.mjs, cập nhật FE-1·A1 sau khi `--kg-fg-muted` đổi bậc):
 * fg-muted trên raised = 7.24:1 dark · 8.05:1 light.
 *
 * `border border-transparent` nằm ở BASE để lúc disabled thêm viền không làm chữ
 * nhảy 1px. `aria-[disabled=true]` được liệt kê song song với `:disabled` vì
 * `asChild` render <a>/<div> — thẻ đó không có thuộc tính `disabled` thật.
 */
/**
 * Bộ màu TRUNG TÍNH ĐẶC cho trạng thái khoá — thay cho `disabled:opacity-45` cũ.
 * Viết THẲNG chuỗi literal (không ghép runtime) để Tailwind quét ra được class;
 * `npm run deadclass` là cổng kiểm chuyện này.
 *
 * `aria-[disabled=true]:*` đi kèm `disabled:*` vì `asChild` render <a>/<span> —
 * những thẻ đó không có thuộc tính `disabled` thật, chỉ có aria.
 * Nút LOADING cũng rơi vào bộ này (nó thật sự không bấm được) nhưng vẫn GIỮ
 * spinner + chữ ở 7.24:1 (dark) / 8.05:1 (light) ⇒ đọc được, không tàng hình.
 */
const DISABLED_NEUTRAL = [
  "disabled:bg-raised disabled:text-fg-muted disabled:border-line-subtle disabled:shadow-none disabled:no-underline",
  "aria-[disabled=true]:bg-raised aria-[disabled=true]:text-fg-muted",
  "aria-[disabled=true]:border-line-subtle aria-[disabled=true]:shadow-none aria-[disabled=true]:no-underline",
].join(" ");

const buttonVariants = cva(
  cn(
    /* ══ P-SWEEP · MỘT BO GÓC CHO MỌI NÚT ═══════════════════════════════════════
       Trước lượt này app có HAI hình nút chạy song song trên cùng một màn: viên
       thuốc 999px ("Quay lại", "Tiếp theo", "Huỷ", "Phục hồi") và bo 8px ("Bắt đầu
       điền form", "Mở bàn làm việc", "Thêm", "Cắt lại"). Cả hai đều là NÚT, nên hai
       hình chỉ nói được một điều sai: rằng chúng khác loại.
       Chốt bo 8px (`rounded-1`, bậc nhỏ nhất của thang) — cùng bo với ô nhập, thẻ
       nhỏ và menu, nên hàng nút đứng cạnh ô nhập không còn lệch hình.
       Viên thuốc `rounded-full` GIỮ cho đúng thứ nó hợp: chip/badge trạng thái, ô
       ⌘K ở header, thanh công cụ nổi ở canvas (mục "phải giữ" #3) — tức những vật
       KHÔNG phải nút hành động. */
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-1 border border-transparent font-medium",
    "transition-colors duration-fast ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:cursor-not-allowed aria-[disabled=true]:cursor-not-allowed",
    DISABLED_NEUTRAL,
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        primary: "bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-active",
        secondary: "border-line bg-transparent text-fg-strong hover:bg-fg-strong/[0.06] active:bg-fg-strong/[0.1]",
        ghost: "text-fg hover:bg-raised hover:text-fg-strong active:bg-overlay",
        danger: "bg-danger-solid text-fg-on-danger hover:bg-danger-solid/90 active:bg-danger-solid/80",
        link: "text-accent-text underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-ctl-sm px-3 text-label",
        md: "h-ctl-md px-3 text-body",
        lg: "h-ctl-lg px-4 text-body",
        "icon-sm": "size-ctl-sm",
        icon: "size-ctl-md",
        "icon-lg": "size-ctl-lg",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Hiện spinner + khoá nút. Chữ giữ nguyên để width không nhảy. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const off = disabled || loading;
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={off}
        /* Nút bị khoá vẫn phải ĐỌC ĐƯỢC bằng trình đọc màn hình và vẫn nhận
           tooltip lý do (§5.4) — nên `aria-disabled` đi kèm, không thay thế. */
        aria-disabled={off || undefined}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
