import { Check } from "lucide-react";
import { useWorkflowStore, type StepId } from "../lib/model";

const steps = ["Chủ thể & brief", "Phong cách", "Kitset UI", "Mascot", "Xem lại & vẽ", "Xem kết quả"] as const;

/**
 * ══ P-SWEEP·15 · HAI HÌNH THÁI CHO HAI BỀ NGANG ═════════════════════════════
 *
 * Từ 640px trở lên: hàng 6 bước như cũ, bấm được để nhảy bước — không mất gì.
 *
 * Dưới 640px: một DÒNG CHỮ "Bước 3/6 · Kitset UI". Ở 375px hàng 6 nút không đủ chỗ,
 * phải cuộn ngang, và mặt nạ cuộn cắt CỤT GIỮA CHỮ ("Kitset U" — ảnh 30): một nhãn
 * bị xén nửa đọc ra lỗi render chứ không đọc ra "còn nữa, cuộn tiếp đi".
 *
 * Vì sao chấp nhận mất nút nhảy bước ở mobile: đi tới/lui vẫn đủ đường bằng hàng nút
 * cuối trang ("Quay lại" / "Tiếp theo"), và dưới 768px khung app đã ở chế độ CHỈ XEM
 * (`FloraShell`) nên mobile không phải nơi người ta nhảy quanh sáu bước để sửa.
 * `aria-label` của nav vẫn nói đủ; số bước hiện thành CHỮ nên screen reader đọc được.
 */
export function WorkflowStepper() {
  const { step, unlocked, go } = useWorkflowStore();
  return (
    <>
      <p className="kg-page workflow-step-now">
        Bước {step}/{steps.length} · <strong>{steps[step - 1]}</strong>
      </p>
      <nav aria-label="Các bước tạo bộ kit" className="kg-page workflow-stepper">
        {steps.map((label, i) => {
          const n = (i + 1) as StepId;
          return (
            <button
              key={label}
              type="button"
              className={n === step ? "workflow-step active" : "workflow-step"}
              aria-current={n === step ? "step" : undefined}
              disabled={n > unlocked}
              onClick={() => go(n)}
            >
              <span className="workflow-step-number">{n < step ? <Check aria-hidden /> : n}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
