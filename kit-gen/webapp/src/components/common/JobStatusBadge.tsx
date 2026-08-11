import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JOB_STATUS, RUN_STATUS, type JobStatus, type RunStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * §5.7 — badge trạng thái dùng CHUNG cho mọi màn. Đọc nhãn/icon/tone từ
 * lib/status.ts, màn KHÔNG được tự chế.
 *
 * Luôn icon + chữ (A3). `detail` nối vào nhãn dài của tooltip/aria-label,
 * ví dụ detail="1m48s · 2.9 MB" → aria-label "Xong · 1m48s · 2.9 MB".
 */
export interface JobStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: JobStatus;
  /** số liệu phụ, hiện sau nhãn (vd "01:12") */
  detail?: string;
  /** ẩn chữ, CHỈ dùng ở nơi cực chật (vd ô ma trận) — vẫn giữ aria-label */
  compact?: boolean;
}

export const JobStatusBadge = React.forwardRef<HTMLSpanElement, JobStatusBadgeProps>(
  ({ status, detail, compact = false, className, ...props }, ref) => {
    const meta = JOB_STATUS[status];
    const Icon = meta.icon;
    const full = detail ? `${meta.long} · ${detail}` : meta.long;

    const badge = (
      <Badge
        ref={ref}
        tone={meta.tone}
        className={cn(compact && "px-1", className)}
        aria-label={full}
        {...props}
      >
        <Icon className={cn(status === "running" && "motion-safe:animate-kg-pulse")} aria-hidden />
        {!compact && (
          <span>
            {meta.label}
            {detail ? ` · ${detail}` : ""}
          </span>
        )}
      </Badge>
    );

    // compact = chỉ icon ⇒ BẮT BUỘC có tooltip để chữ vẫn tiếp cận được
    if (!compact) return badge;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            {badge}
          </span>
        </TooltipTrigger>
        <TooltipContent>{full}</TooltipContent>
      </Tooltip>
    );
  }
);
JobStatusBadge.displayName = "JobStatusBadge";

/** §5.7 badge cho LƯỢT CHẠY. `progress` vd "5/8 · 3 lỗi". */
export interface RunStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: RunStatus;
  progress?: string;
}

export const RunStatusBadge = React.forwardRef<HTMLSpanElement, RunStatusBadgeProps>(
  ({ status, progress, className, ...props }, ref) => {
    const meta = RUN_STATUS[status];
    const Icon = meta.icon;
    return (
      <Badge
        ref={ref}
        tone={meta.tone}
        className={className}
        aria-label={progress ? `${meta.long} · ${progress}` : meta.long}
        {...props}
      >
        <Icon className={cn(status === "running" && "motion-safe:animate-kg-pulse")} aria-hidden />
        <span>
          {meta.label}
          {progress ? ` · ${progress}` : ""}
        </span>
      </Badge>
    );
  }
);
RunStatusBadge.displayName = "RunStatusBadge";

/** §5.6 StatusDot — chấm 8px + CHỮ bên cạnh (không bao giờ chấm trơn). */
export function StatusDot({
  tone,
  label,
  pulse = false,
  className,
}: {
  tone: "ok" | "warn" | "danger" | "running" | "never" | "accent";
  label: string;
  pulse?: boolean;
  className?: string;
}) {
  const dot: Record<string, string> = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    running: "bg-running",
    never: "bg-never",
    accent: "bg-accent",
  };
  return (
    <span className={cn("inline-flex items-center gap-2 text-body text-fg", className)}>
      <span
        className={cn("size-2 shrink-0 rounded-full", dot[tone], pulse && "motion-safe:animate-kg-pulse")}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
