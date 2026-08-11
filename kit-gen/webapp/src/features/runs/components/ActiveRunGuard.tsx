import { AlertTriangle } from "lucide-react";
import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
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
 * NÚT [Xem lượt đang chạy] CHỈ HIỆN KHI CÓ ROUTER (INTEGRATION):
 * `<Link>` của TanStack ném "Cannot read properties of null (reading 'isServer')"
 * nếu không có RouterProvider ở trên. Dải cảnh báo này được cắm vào các modal dùng
 * chung, mà modal thì còn được mount trong test/preview KHÔNG có router — lúc đó
 * PHẦN CHỮ (thứ mang thông tin) vẫn phải hiện, chỉ nút điều hướng là bỏ. Thà thiếu
 * một nút còn hơn cả dải cảnh báo C-01 biến mất vì lỗi context.
 */
export function ActiveRunGuard({ project }: { project: Project | null | undefined }) {
  const w = activeRunWarning(project);
  const hasRouter = useHasRouter();
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
      {w.runId && hasRouter && (
        <div className="pl-6">
          <Button variant="secondary" size="sm" asChild>
            <Link
              to="/p/$projectId/runs/$runId"
              params={{ projectId: project.id, runId: w.runId }}
            >
              Xem lượt đang chạy
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

/** Có RouterProvider ở trên không. `useRouter` ném khi thiếu context ⇒ bắt và trả false. */
function useHasRouter(): boolean {
  try {
    return useRouter() !== null;
  } catch {
    return false;
  }
}
