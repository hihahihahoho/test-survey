import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * §5.6 EmptyState — icon 40px + tiêu đề (title) + 1–2 dòng body + 1 nút primary
 * + (tuỳ) 3 bước gợi ý.
 * LUẬT: MỌI empty state phải nói được VIỆC TIẾP THEO. Không có empty state
 * chỉ ghi "Không có dữ liệu".
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Đúng 1 nút primary — đừng nhét 2 hành động ngang hàng vào đây. */
  action?: React.ReactNode;
  /** 3 bước gợi ý (tuỳ chọn) */
  steps?: string[];
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, description, action, steps, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col items-center justify-center gap-4 rounded-3 px-12 py-12 text-center", className)}
      {...props}
    >
      <Icon className="size-10 text-fg-muted" aria-hidden strokeWidth={1.5} />
      <div className="flex max-w-md flex-col gap-2">
        <h3 className="text-title text-fg-strong">{title}</h3>
        {description && <p className="text-body text-fg">{description}</p>}
      </div>
      {steps && steps.length > 0 && (
        <ol className="flex max-w-md flex-col gap-1 text-left text-caption text-fg-muted-raised">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-2">
              <span className="shrink-0 font-mono text-accent-text">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {action}
    </div>
  )
);
EmptyState.displayName = "EmptyState";
