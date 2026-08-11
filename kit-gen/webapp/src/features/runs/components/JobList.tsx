import * as React from "react";
import { FileText, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobStatusBadge } from "@/components/common";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RunJob } from "@/lib/types";
import { diagnosisText, jobDetail, jobLabel, jobStatusOf } from "../lib/format";

/**
 * DANH SÁCH LƯỢT trong một run (§3-S4-4).
 *
 * Mỗi dòng: `<badge> <phong cách · sheet>  <đồng hồ/thời lượng · dung lượng>`,
 * dòng lỗi có **1 dòng chẩn đoán bằng tiếng Việt** (không bao giờ là `rc=1`).
 *
 * BÀN PHÍM (§3-S4 "j/k di chuyển lượt · Enter mở log"): danh sách là composite
 * widget — MỘT tabstop, mũi tên/j/k di chuyển bên trong. Nếu để mỗi dòng một
 * tabstop thì run 28 lượt sẽ ngốn 28 lần Tab để đi qua, đúng thứ §5.8-A6 muốn tránh.
 *
 * `useMemo` cho từng dòng là cố ý: khi log chạy, `now` đổi mỗi giây và React sẽ
 * dựng lại cả danh sách. Chỉ dòng `running` mới cần vẽ lại theo đồng hồ.
 */
export function JobList({
  jobs,
  selectedJob,
  onSelect,
  onOpenLog,
  onRetry,
  variantLabel,
  readOnly,
  readOnlyReason,
  now,
  className,
}: {
  jobs: readonly RunJob[];
  selectedJob: string | null;
  onSelect: (job: string) => void;
  onOpenLog: (job: string) => void;
  /** `null` ⇒ ẩn nút chạy lại (vd run đã bị xoá project). */
  onRetry: ((job: string) => void) | null;
  variantLabel?: (id: string) => string;
  readOnly: boolean;
  readOnlyReason: string;
  /** epoch ms — cha nhịp mỗi giây khi run đang chạy. */
  now: number;
  className?: string;
}) {
  const listRef = React.useRef<HTMLUListElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (jobs.length === 0) return;
    const idx = Math.max(0, jobs.findIndex((j) => j.job === selectedJob));
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "j") next = (idx + 1) % jobs.length;
    else if (e.key === "ArrowUp" || e.key === "k") next = (idx - 1 + jobs.length) % jobs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = jobs.length - 1;
    else if (e.key === "Enter" && selectedJob) {
      e.preventDefault();
      onOpenLog(selectedJob);
      return;
    }
    if (next >= 0) {
      e.preventDefault();
      const job = jobs[next]!.job;
      onSelect(job);
      listRef.current?.querySelector<HTMLElement>(`[data-job="${CSS.escape(job)}"]`)?.scrollIntoView({ block: "nearest" });
    }
  };

  return (
    <ul
      ref={listRef}
      className={cn(
        "flex flex-col overflow-y-auto rounded-3 border border-line-subtle bg-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring",
        className,
      )}
      tabIndex={0}
      role="listbox"
      aria-label={`Danh sách ${jobs.length} lượt sinh ảnh`}
      aria-activedescendant={selectedJob ? `job-${selectedJob}` : undefined}
      onKeyDown={onKeyDown}
    >
      {jobs.map((job) => (
        <JobRow
          key={job.job}
          job={job}
          selected={job.job === selectedJob}
          onSelect={onSelect}
          onOpenLog={onOpenLog}
          onRetry={onRetry}
          variantLabel={variantLabel}
          readOnly={readOnly}
          readOnlyReason={readOnlyReason}
          now={job.status === "running" ? now : 0}
        />
      ))}
    </ul>
  );
}

const JobRow = React.memo(function JobRow({
  job,
  selected,
  onSelect,
  onOpenLog,
  onRetry,
  variantLabel,
  readOnly,
  readOnlyReason,
  now,
}: {
  job: RunJob;
  selected: boolean;
  onSelect: (job: string) => void;
  onOpenLog: (job: string) => void;
  onRetry: ((job: string) => void) | null;
  variantLabel?: (id: string) => string;
  readOnly: boolean;
  readOnlyReason: string;
  now: number;
}) {
  const status = jobStatusOf(job.status);
  const failed = status === "failed";
  const detail = jobDetail(job, now || Date.now());

  return (
    <li
      id={`job-${job.job}`}
      data-job={job.job}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(job.job)}
      className={cn(
        "group flex items-center gap-3 border-b border-line-subtle px-3 py-2 last:border-0",
        "cursor-pointer transition-colors duration-fast hover:bg-raised",
        selected && "bg-overlay",
      )}
    >
      <JobStatusBadge status={status} />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body text-fg-strong">{jobLabel(job, variantLabel)}</span>
        {failed && (
          // §3-S4-4: dòng lỗi LUÔN có một câu chẩn đoán người thật hiểu.
          <span className="truncate text-caption text-danger">{diagnosisText(job.diagnosis)}</span>
        )}
        {job.recovered && (
          // R20 — ảnh được cứu từ thư mục tạm của công cụ tạo ảnh.
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex w-fit items-center gap-1 text-caption text-on-tint-warn">
                <Undo2 className="size-3" aria-hidden />
                đã cứu ảnh từ thư mục tạm
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Lượt này báo lỗi nhưng ảnh vẫn được tìm thấy trong thư mục tạm của công cụ tạo ảnh và đã
              được chép về. Bạn không phải sinh lại (không tốn thêm quota).
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {detail && <span className="shrink-0 font-mono text-caption text-fg-muted-raised">{detail}</span>}

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [&:has(:focus-visible)]:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Xem nhật ký lượt ${job.job}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenLog(job.job);
          }}
        >
          <FileText aria-hidden />
        </Button>
        {onRetry && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={readOnly}
            aria-disabled={readOnly || undefined}
            title={readOnly ? readOnlyReason : `Chạy lại lượt ${job.job}`}
            aria-label={`Chạy lại lượt ${job.job}`}
            onClick={(e) => {
              e.stopPropagation();
              onRetry(job.job);
            }}
          >
            <RotateCcw aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
});
