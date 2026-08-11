import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Gate } from "@/features/projects/lib/gate";
import type { StaleWarning } from "../lib/next-actions";

/**
 * DẢI CẢNH BÁO "ẢNH CŨ HƠN BẢN THIẾT KẾ" — yêu cầu 3 của brief, hiện ở CẢ S2 và S2b.
 *
 * Vì sao phải có ở cả hai màn: S2b là chỗ user vào để dọn dẹp / xoá. Nếu ở đó
 * không nói gì, user sẽ dọn `kits/` mà không biết kit đang cắt ra từ thiết kế cũ,
 * rồi cắt lại và vẫn ra kit sai. Cảnh báo phải nằm đúng nơi có hành động nguy hiểm.
 *
 * Một component ⇒ hai màn nói CÙNG một câu (§7.5-U5). Đổi copy thì sửa một chỗ.
 *
 * Đây là `Inline banner` của §5.5: icon + tiêu đề 1 dòng + ≤2 nút. Không dùng
 * `ErrorState` vì stale KHÔNG phải lỗi — nó là trạng thái bình thường của quy
 * trình, và nhuộm đỏ một thứ bình thường sẽ làm user chai với màu đỏ thật.
 */
export function StaleBanner({
  warning,
  gate,
  onGen,
  onSlice,
  pending = false,
}: {
  warning: StaleWarning;
  gate: Gate;
  /** Mở modal M1 với đúng tập lượt cần sinh lại. `null` ⇒ màn này không sinh được (S2b). */
  onGen: (() => void) | null;
  /** Chạy cắt cho đúng tập lượt chưa cắt. `null` ⇒ không hiện nút. */
  onSlice: (() => void) | null;
  pending?: boolean;
}) {
  if (!warning.stale || !warning.message) return null;

  const canGen = onGen !== null && warning.staleJobs.length > 0;
  const canSlice = onSlice !== null && warning.uncutJobs.length > 0;

  return (
    <div
      role="status"
      className="flex flex-wrap items-start gap-3 rounded-3 border border-warn/60 bg-warn/[0.1] p-4"
    >
      <RefreshCw className="mt-0.5 size-5 shrink-0 text-on-tint-warn" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-subtitle text-fg-strong">{warning.message}</p>
        {warning.advice && <p className="text-caption text-fg">{warning.advice}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canGen && (
          <Button
            variant="secondary"
            size="sm"
            disabled={gate.readOnly || pending}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={onGen}
          >
            {`Sinh lại ${warning.staleJobs.length} lượt…`}
          </Button>
        )}
        {canSlice && (
          <Button
            variant="secondary"
            size="sm"
            disabled={gate.readOnly || pending}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={onSlice}
          >
            {`Cắt ${warning.uncutJobs.length} lượt`}
          </Button>
        )}
      </div>
    </div>
  );
}
