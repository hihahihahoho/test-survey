import { Scissors, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Gate } from "@/features/projects/lib/gate";

/**
 * THANH NỔI khi đang chọn nhiều ô của ma trận (§3-S2 mục 3).
 *
 * §1.1-4 ("phạm vi hiện rành mạch"): luôn có dòng "đang chọn N/M" NGAY tại nơi
 * bấm nút — không để user phải tự đếm ô xanh. Đây là chỗ v1 làm sai và sinh audit
 * C1 (selection rò rỉ giữa các kit, đốt quota nhầm tập).
 *
 * `role="status"` + `aria-live="polite"`: người dùng screen reader nghe được số
 * lượng đổi khi họ bấm Space trên từng ô, thay vì phải rời lưới đi kiểm tra.
 *
 * Nút Sinh mở modal M1 — không tự chạy gen (§4.8: modal là cửa DUY NHẤT tiêu quota).
 */
export function SelectionBar({
  selectedCount,
  total,
  gate,
  pending,
  onGen,
  onSlice,
  onClear,
}: {
  selectedCount: number;
  total: number;
  gate: Gate;
  pending: boolean;
  onGen: () => void;
  onSlice: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky bottom-4 z-floatbar mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-3 border border-line bg-overlay px-4 py-2.5 shadow-2"
    >
      <span className="text-label text-fg-strong">
        Đang chọn {selectedCount}/{total} lượt
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={gate.readOnly || pending}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : undefined}
          onClick={onGen}
        >
          <Zap aria-hidden />
          {`Sinh ${selectedCount} lượt…`}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={gate.readOnly || pending}
          aria-disabled={gate.readOnly || undefined}
          title={gate.readOnly ? gate.reason : "Cắt không tiêu quota"}
          onClick={onSlice}
        >
          <Scissors aria-hidden />
          Cắt
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden />
          Bỏ chọn
        </Button>
      </div>
    </div>
  );
}
