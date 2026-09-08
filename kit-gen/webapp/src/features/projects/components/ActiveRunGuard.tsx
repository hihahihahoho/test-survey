import { AlertTriangle } from "lucide-react";
import type { Project } from "@/lib/types";
import { activeRunWarning } from "../lib/delete-guard";

/**
 * DẢI CẢNH BÁO "ĐANG CHẠY — ĐỪNG XOÁ VỘI" — thi công lớp (a) của C-01.
 *
 * Cắm vào bất kỳ modal phá huỷ nào của project: Xoá (§4.4), Dọn cache (§4.5),
 * Nhập đè, Đổi workspace. Một component ⇒ mọi chỗ nói cùng một câu, và khi
 * agent vá xong thì sửa MỘT chỗ.
 *
 * Cố ý KHÔNG khoá nút xoá: §2.5-2 cấm ẩn/khoá tính năng mà không có đường đi
 * tiếp, và agent có quyền tự cancel run rồi move (§4.4 "agent tự cancel run
 * trước khi move"). Việc của UI là nói rõ hậu quả + đưa đúng đường lùi
 * ([Xem lượt đang chạy] để user tự dừng), chứ không phải quyết thay.
 *
 * 08/09/2026 — NÚT [Xem lượt đang chạy] ĐÃ BỎ. Nó trỏ `/p/:id/runs/:runId`, tức màn
 * theo dõi lượt chạy; màn ấy và route ấy đã bị xoá cùng đợt IA prompt-first (tiến độ
 * nay hiện ngay trên từng thẻ ở khu soạn). Một nút dẫn tới trang chuyển hướng thì tệ
 * hơn là không có nút: người dùng bấm rồi thấy mình quay về đúng chỗ vừa đứng. Phần
 * CHỮ — thứ mang thông tin của C-01 — ở lại nguyên vẹn.
 */
export function ActiveRunGuard({ project }: { project: Project | null | undefined }) {
  const w = activeRunWarning(project);
  if (!w.hasActiveRun || !project) return null;

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3"
    >
      <p className="flex items-start gap-2 text-body text-fg-strong">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        <span>{w.message}</span>
      </p>
      <p className="pl-6 text-caption text-fg">{w.advice}</p>
    </div>
  );
}

