import { Construction } from "lucide-react";
import { EmptyState, CopyableCode } from "@/components/common";
import { SCREEN_EXPORT, SCREEN_LABEL, SCREEN_PATH, type LazyScreenId } from "./screen-contract";

/**
 * Màn giữ chỗ khi file của team khác CHƯA TỒN TẠI (hợp đồng lazy-mount).
 *
 * Đây KHÔNG phải màn lỗi: không có gì hỏng cả, chỉ là màn chưa được nộp. Nên
 * nó dùng tông trung tính (EmptyState), không phải tông đỏ — để QA và chủ dự
 * án phân biệt ngay "chưa làm" với "làm rồi nhưng vỡ".
 *
 * Nội dung cố tình nêu ĐÚNG đường dẫn file + tên export cần có, để người mở ra
 * biết phải tạo gì mà không phải đi hỏi.
 */
export function ScreenPlaceholder({ screen }: { screen: LazyScreenId }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <EmptyState
        icon={Construction}
        title={`Màn «${SCREEN_LABEL[screen]}» chưa được nộp`}
        description="Khung ứng dụng, điều hướng và bảng lệnh vẫn chạy bình thường. Màn này sẽ tự xuất hiện ngay khi file dưới đây có mặt — không cần sửa route."
        steps={[
          `Tạo file ${SCREEN_PATH[screen]}`,
          `Export component tên ${SCREEN_EXPORT[screen]} (hoặc export default)`,
          "Nhận props { projectId? } và tự lấy dữ liệu bằng hook trong @/lib/hooks",
        ]}
      />
      <CopyableCode
        label={`Đường dẫn file của màn ${SCREEN_LABEL[screen]}`}
        value={`${SCREEN_PATH[screen]}\nexport function ${SCREEN_EXPORT[screen]}({ projectId }: ScreenProps) { … }`}
      />
    </div>
  );
}
