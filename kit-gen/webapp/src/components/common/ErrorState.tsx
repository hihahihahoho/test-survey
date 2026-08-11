import * as React from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { CopyableCode } from "./CopyableCode";
import { cn } from "@/lib/utils";

/**
 * §1.5 + §3.9 — KHÔNG BAO GIỜ để user đối diện lỗi kỹ thuật thô.
 * Mỗi lỗi = 1 câu người thật hiểu + ≥1 nút hành động + panel
 * "Chi tiết cho lập trình viên" GẬP LẠI.
 *
 * `detail` là nơi duy nhất được chứa từ kỹ thuật (mã lỗi, stack, endpoint).
 * KHÔNG đổ chuỗi lỗi gốc vào `title`.
 */
export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 1 câu tiếng Việt người thật hiểu. Không có mã lỗi ở đây. */
  title: string;
  description?: React.ReactNode;
  /** ≥1 nút hành động (Thử lại / Copy lệnh / Xem log…) */
  actions?: React.ReactNode;
  /** Chi tiết kỹ thuật — gập lại, mở bằng <details> (không cần JS). */
  detail?: string;
  /** dùng khi lỗi chiếm cả vùng màn thay vì dải inline */
  variant?: "block" | "inline";
}

export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ title, description, actions, detail, variant = "block", className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        "flex gap-3 rounded-3 border border-danger/60 bg-danger/10 p-4",
        variant === "block" && "flex-col items-center py-12 text-center",
        className
      )}
      {...props}
    >
      <AlertTriangle className={cn("size-5 shrink-0 text-danger", variant === "block" && "size-10")} aria-hidden strokeWidth={1.5} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", variant === "block" && "items-center")}>
        <div className="flex flex-col gap-1">
          <p className="text-subtitle text-fg-strong">{title}</p>
          {description && <p className="text-body text-fg">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        {detail && (
          <details className="group w-full max-w-xl text-left">
            <summary
              className={cn(
                "inline-flex cursor-pointer list-none items-center gap-1 rounded-1 text-label text-fg-muted-raised hover:text-fg-strong",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              )}
            >
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
              Chi tiết cho lập trình viên
            </summary>
            <CopyableCode className="mt-2" value={detail} />
          </details>
        )}
      </div>
    </div>
  )
);
ErrorState.displayName = "ErrorState";
