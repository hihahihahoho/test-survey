import * as React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Silhouette, cellAspect, shapeLabel } from "../../preview";
import { cellLabel, skelFlags, type LibElementView } from "../lib/types";
import { invalidFileName } from "../lib/source";

/**
 * webapp/src/features/design/library/components/LibraryItem.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * MỘT DÒNG trong thư viện element. Đóng đúng 4 issue audit mà spec nêu tên:
 *
 *   I2/I4 · là `<label>` bọc `<Checkbox>` THẬT (Radix render `<button role=checkbox>`
 *           + input ẩn) — KHÔNG phải `<div onClick>`. Bấm vào đâu trong dòng cũng tick,
 *           Space/Enter chạy, screen reader đọc đúng trạng thái.
 *   I3    · chữ nhỏ nhất là `text-caption` = 12px — sàn tuyệt đối của §5.2.
 *   I1    · trạng thái chọn = DẤU ✓ + NỀN + VIỀN, ba tín hiệu, không chỉ màu viền.
 *
 * "Xem trước hình dáng" (mục 1 của brief) = silhouette THẬT vẽ bằng `preview/`,
 * đúng hình mà engine sẽ gửi cho model — không phải icon minh hoạ chung chung.
 */

export interface LibraryItemProps {
  view: LibElementView;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** id để `<label htmlFor>` trỏ tới */
  id: string;
}

export const LibraryItem = React.memo(function LibraryItem({
  view,
  checked,
  onCheckedChange,
  id,
}: LibraryItemProps): React.ReactElement {
  const flags = skelFlags(view.skel);
  const badName = invalidFileName(view);
  /* `cell:"portrait"` = ô dọc 2:3; `landscape`/`full` đều dùng khung ngang 3:2. */
  const orient = view.cell === "portrait" ? "portrait" : "landscape";
  const aspect = cellAspect({ orient, grid: { cols: 1, rows: 1 } });

  return (
    <label
      htmlFor={id}
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-2 border p-2 transition-colors duration-fast",
        "focus-within:ring-2 focus-within:ring-focus-ring focus-within:ring-offset-2 focus-within:ring-offset-raised",
        checked
          ? "border-accent bg-accent/[var(--kg-tint-a)]"
          : "border-line-subtle bg-surface hover:border-line hover:bg-raised"
      )}
    >
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} className="mt-1.5" />

      {/* xem trước hình dáng — tỉ lệ khung đúng loại ô (ngang 3:2 / dọc 2:3) */}
      <div
        className="mt-0.5 w-14 shrink-0 overflow-hidden rounded-1 border border-line-subtle bg-canvas text-fg-muted"
        style={{ aspectRatio: String(aspect) }}
      >
        <Silhouette skel={view.skel} orient={orient} uid={`lib-${view.file}`} className="size-full" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body font-medium text-fg-strong">{view.vi || view.file}</span>
          {checked && (
            <span className="inline-flex items-center gap-0.5 text-caption text-on-tint-accent">
              <Check className="size-3" aria-hidden />
              đã chọn
            </span>
          )}
        </div>

        <code className="truncate font-mono text-caption text-fg-muted-raised">{view.file}</code>

        <div className="flex flex-wrap items-center gap-1">
          <Badge tone="outline">{shapeLabel(view.skel?.shape)}</Badge>
          <Badge tone="outline">{cellLabel(view.cell)}</Badge>
          {view.groupKey !== "__none__" && <Badge tone="outline">{view.groupLabel}</Badge>}
          {flags.map((f) => (
            <Tooltip key={f.key}>
              <TooltipTrigger asChild>
                <Badge tone="accent" className="cursor-help">
                  {f.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{f.hint}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {view.usedIn.length > 0 && (
          <p className="text-caption text-on-tint-ok">
            ● đã có trong sheet {view.usedIn.join(", ")}
            <span className="text-fg-muted"> — thêm nữa sẽ trùng tên file</span>
          </p>
        )}

        {badName && (
          <p className="inline-flex items-start gap-1 text-caption text-on-tint-warn">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
            Tên file không đúng dạng «2 số + gạch nối + chữ thường» — sẽ bị chặn khi lưu.
          </p>
        )}
      </div>
    </label>
  );
});
