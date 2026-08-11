import * as React from "react";
import { cn } from "@/lib/utils";

/** §5.3: viền `line` đạt 3:1 (WCAG 1.4.11). Nền `raised`. Bán kính --r-1 (4px). */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-ctl-md w-full rounded-2 border border-line bg-raised px-3 py-1 text-body text-fg-strong",
        "transition-colors duration-fast placeholder:text-fg-muted-raised",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
        // B1 quét cùng loại: input khoá KHÔNG mờ chữ, đổi sang bộ trung tính đặc.
        "disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-raised disabled:text-fg-muted",
        "disabled:placeholder:text-fg-muted",
        "aria-[invalid=true]:border-danger",
        "file:border-0 file:bg-transparent file:text-label file:text-fg-strong",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
