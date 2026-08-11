import { cn } from "@/lib/utils";

/**
 * §5.6 SkeletonBlock — nền raised + shimmer 1.2s.
 * LUẬT: số lượng skeleton phải KHỚP số phần tử dự kiến. Biết trước thì đừng đoán.
 * `prefers-reduced-motion` tự tắt shimmer (globals.css).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-1 bg-raised", className)}
      aria-hidden
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-kg-shimmer bg-gradient-to-r from-transparent via-fg-muted/10 to-transparent" />
    </div>
  );
}

export { Skeleton };
