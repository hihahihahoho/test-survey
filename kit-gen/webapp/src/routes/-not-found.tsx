import { Link, useRouterState } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import { AppLayout } from "@/components/layout";

/**
 * TRANG 404. Dùng khung app đầy đủ, không phải trang trần: user lạc đường vẫn
 * còn header, ⌘K và đường về — thay vì rơi vào ngõ cụt.
 *
 * Không in URL người dùng gõ ra thân trang dưới dạng HTML thô: React escape
 * sẵn qua `{children}`, nên không lặp lại lỗ hổng chèn thẻ của v1 (audit I6).
 */
export function NotFoundScreen() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <AppLayout screen="projects">
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState
          icon={Compass}
          title="Không có trang này"
          description={
            <>
              Đường dẫn <code className="rounded-1 bg-raised px-1.5 py-0.5 font-mono text-caption">{pathname}</code>{" "}
              không nằm trong ứng dụng. Có thể link đã cũ, hoặc project đã bị xoá/đổi thư mục làm việc.
            </>
          }
          steps={[
            "Về danh sách project để chọn lại",
            "Hoặc mở bảng lệnh (⌘K) và gõ tên việc bạn muốn làm",
            "Project vừa xoá vẫn nằm trong Thùng rác 30 ngày",
          ]}
          action={
            <Button variant="primary" size="lg" asChild>
              <Link to="/">Về danh sách project</Link>
            </Button>
          }
        />
      </div>
    </AppLayout>
  );
}
