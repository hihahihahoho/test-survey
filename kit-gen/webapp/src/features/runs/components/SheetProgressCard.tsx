import { Check, Circle, CircleDashed, FileText, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Contract, Run, RunJob } from "@/lib/types";
import {
  friendlyDiagnosis, resolveSheetIdentity, sheetDisplayName, sheetProgressState,
} from "../lib/sheet-progress";

const STATE = {
  waiting: { icon: CircleDashed, label: "Đang chờ", ink: "text-fg-muted-raised" },
  drawing: { icon: LoaderCircle, label: "Đang vẽ…", ink: "text-on-tint-running" },
  "awaiting-cut": { icon: Circle, label: "Đã vẽ · đợi tách nền", ink: "text-warn" },
  done: { icon: Check, label: "Xong", ink: "text-on-tint-ok" },
  failed: { icon: TriangleAlert, label: "Lỗi", ink: "text-danger" },
} as const;

export function SheetProgressCard({
  job, run, contract, onLog, onRetry, readOnly,
}: {
  job: RunJob;
  run: Run;
  contract: Contract | null;
  onLog: () => void;
  onRetry: () => void;
  readOnly: boolean;
}) {
  const identity = resolveSheetIdentity(job, contract);
  const state = sheetProgressState(job, run);
  const meta = STATE[state];
  const Icon = meta.icon;
  const cells = identity.sheet?.components ?? [];
  const cols = identity.sheet?.grid.cols ?? 1;
  const failed = state === "failed";

  return (
    <article className={cn(
      "group flex min-h-[260px] flex-col overflow-hidden rounded-4 border bg-surface shadow-1",
      failed ? "border-danger/60" : "border-line-subtle",
    )} data-sheet-state={state}>
      <div className={cn("relative flex min-h-[176px] flex-1 items-center justify-center overflow-hidden p-6", state === "drawing" ? "bg-raised" : "bg-canvas")}>
        <div
          className="grid w-full max-w-[220px] gap-1.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(cols, 8)}, minmax(0, 1fr))` }}
          aria-label={`${cells.length || 1} ô trong tấm; các ô chỉ là khung xem trước, không phải tiến trình riêng`}
        >
          {(cells.length ? cells : [null]).map((cell, index) => (
            <span
              key={cell ? `${cell.file}-${index}` : index}
              className={cn(
                "aspect-square rounded-1 border border-line-subtle",
                state === "drawing" ? "bg-overlay" : "bg-raised",
                cell?.skel.shape === "empty" && "border-dashed bg-canvas",
              )}
              aria-hidden
            />
          ))}
        </div>
        {state === "drawing" && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-running" aria-hidden />}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <p className="kg-label-above truncate">{identity.variantLabel || "Bộ kit"} / {identity.sheetId}</p>
        <h2 className="truncate text-subtitle text-fg-strong">{sheetDisplayName(identity)}</h2>
        <p className={cn("flex items-center gap-2 text-label", meta.ink)} role="status">
          <Icon className={cn("size-4", state === "drawing" && "animate-spin")} aria-hidden />
          {meta.label}
        </p>
        {failed && <p className="text-caption text-fg">{friendlyDiagnosis(job.diagnosis)}</p>}
        {failed && (
          <div className="flex flex-wrap gap-1 pt-1">
            <Button variant="secondary" size="sm" disabled={readOnly} onClick={onRetry}>
              <RotateCcw aria-hidden /> Vẽ lại tấm này
            </Button>
            <Button variant="ghost" size="sm" onClick={onLog}>
              <FileText aria-hidden /> Xem máy nói gì
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
