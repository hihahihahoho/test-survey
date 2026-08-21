import { Check } from "lucide-react";
import { useWorkflowStore, type StepId } from "../lib/model";

/**
 * NĂM bước, không phải sáu.
 *
 * Bước "Kết quả" đã bỏ: bấm **Tạo ảnh** ở bước Kiểm tra là vào thẳng màn quản lý dự án,
 * tab "Ảnh đã tạo".
 */

/**
 * TÊN CỦA KHÁI NIỆM, MỘT CHỖ DUY NHẤT.
 *
 * Trước đây chuỗi "Skeleton UI" được gõ tay ở BẢY chỗ (stepper · sidebar dự án · tiêu đề
 * trang · aria-label hàng tab · KitsetStep · ReviewStep · command palette) kèm một chú
 * thích dặn "để cả ba nơi gọi cùng một tên" — tức luật chỉ sống bằng thiện chí. Đổi tên
 * một lần là lộ ra ngay: sót một chỗ thì app tự mâu thuẫn với chính nó.
 *
 * "Skeleton UI" nói về THỨ TA DỰNG RA để gửi cho model, còn người dùng đọc nó ra "bộ
 * khung xám" — trong khi trang đó là nơi họ quản lý CÁC THÀNH PHẦN giao diện của dự án.
 * Chủ sản phẩm chốt lại tên: **UI Elements**.
 */
export const UI_STEP_LABEL = "UI Elements";

export const WIZARD_STEPS = ["Yêu cầu", "Phong cách", UI_STEP_LABEL, "Mascot", "Kiểm tra"] as const;
const steps = WIZARD_STEPS;

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
  const { step: raw, unlocked: unlockedRaw, go } = useWorkflowStore();
  /* Bản nháp ghi từ bản build cũ có thể mang `step: 6` (bước "Kết quả" đã bỏ). Kẹp lại
     ở tầng hiển thị để không hiện "Bước 6/5" và không tra vào một ô không tồn tại. */
  const step = Math.min(raw, steps.length);
  const unlocked = Math.min(unlockedRaw, steps.length);
  return (
    <>
      <p className="kg-page workflow-step-now">
        Bước {step}/{steps.length} · <strong>{steps[step - 1]}</strong>
      </p>
      <nav aria-label="Các bước tạo dự án" className="kg-page workflow-stepper">
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
