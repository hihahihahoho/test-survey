import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/common";
import type { ConnectionStatus } from "@/lib/api";
import { StepCard, Note } from "../../components/StepShell";
import { count } from "../../lib/format";

/**
 * Thẻ SUCCESS của bước 2 — §3-S0 bảng trạng thái, hàng `success`:
 * `● Đã kết nối · ~/KitGen · agent v1.2.0 · gray-otter`.
 *
 * Mọi số ở đây đều lấy từ `/health` thật (§6.2 #1). Không có chỗ nào bịa.
 * `instanceLabel` (vd `gray-otter`) là nhãn ngẫu nhiên do agent tự đặt để user phân biệt
 * hai cửa sổ agent — nó không phải định danh máy và không phải secret.
 */
export function ConnectedCard({
  status,
  onNext,
}: {
  status: ConnectionStatus;
  onNext: () => void;
}) {
  const h = status.health;
  const meta = [
    status.workspaceLabel ? `thư mục làm việc ${status.workspaceLabel}` : null,
    status.agentVersion ? `công cụ local v${status.agentVersion}` : null,
    status.instanceLabel,
    status.entry === "mirror" ? "bản chạy tại máy" : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <StepCard>
        <StatusDot tone="ok" label="Đã kết nối với công cụ local" />
        {meta.length > 0 ? (
          <p className="text-body text-fg">{meta.join(" · ")}</p>
        ) : (
          <p className="text-body text-fg">Đã nói chuyện được với công cụ local trên máy bạn.</p>
        )}
        <Note>
          {[
            typeof h?.projects === "number" ? count(h.projects, "project trong thư mục làm việc") : null,
            typeof h?.activeRuns === "number" && h.activeRuns > 0
              ? count(h.activeRuns, "lượt sinh ảnh đang chạy")
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Kết nối chỉ đi tới 127.0.0.1 trên máy bạn."}
        </Note>
      </StepCard>
      <div>
        <Button variant="primary" size="lg" onClick={onNext} data-kg-primary="">
          Tiếp: chọn thư mục làm việc →
        </Button>
      </div>
    </>
  );
}
