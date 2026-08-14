import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KitFile } from "@/lib/types";
import { KitImage } from "./KitImage";
import type { Backdrop } from "../lib/backdrop";
import type { StaleReason } from "../lib/kit-model";
import { exportSize } from "../lib/export-scale";

/**
 * MỘT Ô TRÊN LƯỚI ASSETS.
 *
 * A11y (§5.8-A5, đóng I2/I4): ô là `<button>` thật có nhãn đầy đủ, KHÔNG phải
 * `<div onclick>`. Nhãn đọc lên gồm tên + cỡ + tình trạng, vì người dùng screen
 * reader không thấy được badge màu.
 *
 * Lưới là composite widget (§5.8-A6): chỉ MỘT tabstop, ←→↑↓ di chuyển giữa ô.
 * `tabIndex` do `useCellKeys` cấp, không phải mỗi ô một tabstop (nếu không, muốn
 * qua 96 ảnh để tới nút [Xuất] phải bấm Tab 96 lần).
 */
export interface AssetCellProps {
  projectId: string;
  file: KitFile;
  backdrop: Backdrop;
  offline: boolean;
  staleReason: StaleReason;
  poseFiles: ReadonlySet<string>;
  tabIndex: 0 | -1;
  onOpen: () => void;
}

export const AssetCell = React.forwardRef<HTMLButtonElement, AssetCellProps>(function AssetCell(
  { projectId, file, backdrop, offline, staleReason, poseFiles, tabIndex, onOpen },
  ref,
) {
  const info = exportSize(file, poseFiles);
  const dims = info.srcW !== null && info.srcH !== null ? `${info.srcW}×${info.srcH}` : "chưa rõ cỡ";
  const trouble = file.empty
    ? ", file rỗng"
    : staleReason === "design-changed"
      ? ", cần sinh lại vì thiết kế đã đổi"
      : staleReason === "uncut"
        ? ", cần cắt lại"
        : "";

  return (
    <button
      ref={ref}
      type="button"
      data-kit-cell
      tabIndex={tabIndex}
      onClick={onOpen}
      aria-label={`Xem lớn ${file.file}, ${dims}${trouble}`}
      className={cn(
        "group flex flex-col gap-1 rounded-2 text-left",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
      )}
    >
      <KitImage
        projectId={projectId}
        path={file.path}
        alt={file.file}
        backdrop={backdrop}
        blend={file.blend}
        empty={file.empty}
        offline={offline}
        className={cn(
          "aspect-square w-full transition-colors duration-fast",
          "group-hover:border-line-strong",
        )}
      />
      <span className="truncate font-mono text-caption text-fg-strong" title={file.file}>
        {file.file}
      </span>
      <span className="flex items-center gap-1 text-caption text-fg-muted-raised">
        <span className="tabular-nums">{dims}</span>
        {/* Badge luôn icon + chữ (A3) — không có badge chỉ-màu. */}
        {staleReason === "design-changed" && (
          <Badge tone="stale" className="ml-auto">
            <RefreshCw aria-hidden />
            Cần sinh lại
          </Badge>
        )}
        {staleReason === "uncut" && (
          <Badge tone="stale" className="ml-auto">
            <Scissors aria-hidden />
            Cần cắt
          </Badge>
        )}
      </span>
    </button>
  );
});
