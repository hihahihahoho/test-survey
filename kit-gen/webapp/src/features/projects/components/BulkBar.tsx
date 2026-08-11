import { Download, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { count } from "../lib/format";
import type { Gate } from "../lib/gate";

/**
 * THANH HÀNH ĐỘNG NỔI khi chọn nhiều (§3-S1 wireframe list).
 * MUST của spec: **xuất nhiều + xoá nhiều**. Không nhét thêm hành động khác vào
 * đây — mỗi nút thêm là một cách mới để bấm nhầm lên 5 project cùng lúc.
 *
 * A11y: `role="region"` + `aria-live="polite"` để screen reader đọc "3 project
 * đã chọn" ngay khi số đổi; `Esc` bỏ chọn (gắn ở ProjectsScreen).
 */
export function BulkBar({
  selectedCount,
  gate,
  onExport,
  onDelete,
  onClear,
}: {
  selectedCount: number;
  gate: Gate;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Hành động cho project đã chọn"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-floatbar flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-3 border border-line-subtle bg-overlay p-2 pl-4 shadow-3">
        <span aria-live="polite" className="text-body text-fg-strong">
          {count(selectedCount, "project")} đã chọn
        </span>
        <div className="mx-1 h-5 w-px bg-line-subtle" aria-hidden />
        <Button
          variant="secondary"
          size="sm"
          disabled={gate.readOnly}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={onExport}
        >
          <Download aria-hidden />
          Xuất .zip
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={gate.readOnly}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={onDelete}
          className="text-danger hover:text-danger"
        >
          <Trash2 aria-hidden />
          Xoá
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Bỏ chọn tất cả">
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
