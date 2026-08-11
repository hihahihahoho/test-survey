import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * §5.6 SkeletonBlock — LUẬT: số lượng skeleton phải KHỚP số phần tử dự kiến.
 * Biết trước bao nhiêu thẻ thì truyền đúng số đó, ĐỪNG đoán bừa.
 *
 * aria: vùng đang tải có aria-busy + nhãn cho screen reader; các khối
 * skeleton tự nó aria-hidden (trong ui/skeleton.tsx).
 */
export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** số khối skeleton — phải bằng số phần tử thật dự kiến */
  count?: number;
  variant?: "list" | "cards" | "rows";
  /** câu đọc lên cho screen reader */
  label?: string;
}

export const LoadingState = React.forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ count = 3, variant = "list", label = "Đang tải…", className, ...props }, ref) => (
    <div
      ref={ref}
      aria-busy="true"
      aria-live="polite"
      className={cn(variant === "cards" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-2", className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) =>
        variant === "cards" ? (
          <div key={i} className="flex flex-col gap-3 rounded-3 border border-line-subtle bg-surface p-4">
            <Skeleton className="h-24 w-full rounded-2" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ) : variant === "rows" ? (
          <div key={i} className="flex h-row items-center gap-3 border-b border-line-subtle px-3">
            <Skeleton className="size-4 rounded-1" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ) : (
          <Skeleton key={i} className="h-4 w-full" />
        )
      )}
    </div>
  )
);
LoadingState.displayName = "LoadingState";
