import * as React from "react";
import { Info, Ruler } from "lucide-react";
import type { Sheet } from "@/lib/types/contract";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cellMetrics, effectiveCellHint, elementMetrics, formatPx, simpleRatio, type AnySkel } from "./geometry";

/**
 * webapp/src/features/design/preview/CellMetrics.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * TỈ LỆ / KÍCH THƯỚC Ô THẬT (mục 3 của brief).
 *
 * Vì sao cần: `skel.w = 0.78` chẳng nói lên điều gì. `300 × 102 px` thì người
 * thiết kế biết ngay nút đó to bằng nào trên máy thật, và biết ô 1×1 (nền) khác
 * ô 4×4 (nút) ra sao — TRƯỚC KHI tốn 2–5 phút và một lượt quota để gen.
 *
 * Mọi con số lấy từ `geometry.ts` (rút thẳng từ gen.sh / skeleton.py / slice.py),
 * không có số nào gõ tay ở đây.
 */

export interface SheetMetricsLineProps {
  sheet: Pick<Sheet, "orient" | "grid" | "cell_hint"> | null | undefined;
  className?: string;
}

/** Dòng số đo của SHEET: khổ ảnh · lưới · cỡ một ô · cỡ file cắt ra. */
export function SheetMetricsLine({ sheet, className }: SheetMetricsLineProps): React.ReactElement {
  const m = cellMetrics(sheet);
  const hint = effectiveCellHint(sheet);

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted-raised", className)}>
      <span className="inline-flex items-center gap-1">
        <Ruler className="size-3.5" aria-hidden />
        <span className="sr-only">Số đo:</span>
        Ảnh sinh <b className="font-medium text-fg">{formatPx(m.canvas.w, m.canvas.h)}</b>
      </span>
      <Sep />
      <span>
        Mỗi ô <b className="font-medium text-fg">{formatPx(m.cellPx.w, m.cellPx.h)}</b>{" "}
        <span className="text-fg-muted">({simpleRatio(m.cellPx.w, m.cellPx.h)})</span>
      </span>
      <Sep />
      <ExportSizeNote
        exportW={m.exportPx.w}
        exportH={m.exportPx.h}
        bleedX={m.bleedPx.x}
        bleedY={m.bleedPx.y}
        fixed={m.bleedIsFixed}
      />
      <Sep />
      <CellHintNote text={hint.text} isSuggestion={hint.isSuggestion} />
    </div>
  );
}

export interface ElementMetricsLineProps {
  sheet: Pick<Sheet, "orient" | "grid"> | null | undefined;
  skel: AnySkel | null | undefined;
  /** ẩn phần của sheet khi dòng này nằm ngay dưới `SheetMetricsLine` */
  compact?: boolean;
  className?: string;
}

/** Dòng số đo của MỘT ELEMENT: cỡ thật · tỉ lệ · % diện tích ô. */
export function ElementMetricsLine({
  sheet,
  skel,
  compact = false,
  className,
}: ElementMetricsLineProps): React.ReactElement {
  const m = elementMetrics(sheet, skel);
  const shape = String(skel?.shape ?? "");

  if (shape === "empty") {
    return (
      <p className={cn("text-caption text-fg-muted-raised", className)}>
        Ô trống — không sinh element nào, nhưng ô vẫn chiếm{" "}
        <b className="font-medium text-fg">{formatPx(m.cellPx.w, m.cellPx.h)}</b> trên ảnh.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-muted-raised", className)}>
      <span>
        Element <b className="font-medium text-fg-strong">{formatPx(m.elementPx.w, m.elementPx.h)}</b>{" "}
        <span className="text-fg-muted">({m.ratio})</span>
      </span>
      <Sep />
      <span>
        chiếm <b className="font-medium text-fg">{Math.round(m.areaPercent)}%</b> diện tích ô
      </span>
      {!compact && (
        <>
          <Sep />
          <span>
            ô <b className="font-medium text-fg">{formatPx(m.cellPx.w, m.cellPx.h)}</b>
          </span>
        </>
      )}
      {m.elementPx.w < 64 || m.elementPx.h < 64 ? (
        <Badge tone="warn" title="Element quá nhỏ thì model vẽ mất chi tiết">
          <Info className="size-3" aria-hidden />
          Khá nhỏ
        </Badge>
      ) : null}
    </div>
  );
}

function Sep(): React.ReactElement {
  return (
    <span aria-hidden className="text-fg-muted">
      ·
    </span>
  );
}

function ExportSizeNote({
  exportW, exportH, bleedX, bleedY, fixed,
}: { exportW: number; exportH: number; bleedX: number; bleedY: number; fixed: boolean }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help rounded-1 underline decoration-dotted underline-offset-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          )}
          tabIndex={0}
        >
          File cắt ra <b className="font-medium text-fg">{formatPx(exportW, exportH)}</b>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Ảnh PNG cắt ra rộng hơn ô một chút: mỗi phía có thêm vành {bleedX}×{bleedY} px để trang trí tràn ra
          ngoài khung không bị cụt.
        </p>
        {fixed && (
          <p className="mt-1 text-fg-muted-raised">
            Vành này đang là giá trị cố định trong công cụ cắt (18% cạnh ô). Ô «Vành ngoài ô» ở tab Nâng cao
            được lưu vào bản thiết kế nhưng chưa đổi được kết quả cắt thật.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function CellHintNote({ text, isSuggestion }: { text: string; isSuggestion: boolean }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help rounded-1 underline decoration-dotted underline-offset-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          )}
          tabIndex={0}
        >
          Mô tả ô: <b className="font-medium text-fg">{text}</b>
          {isSuggestion && <span className="ml-1 text-fg-muted">(gợi ý)</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>Câu này được ghép thẳng vào lời nhắc gửi cho AI: “Each cell is a {text}.”</p>
        {isSuggestion && (
          <p className="mt-1 text-fg-muted-raised">
            Sheet chưa đặt mô tả ô — đây là câu gợi ý theo tỉ lệ ô thật. Đặt trong panel thuộc tính của sheet.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
