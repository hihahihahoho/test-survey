import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common";
import { AppLayout } from "@/components/layout";
import { devDetails, presentError } from "@/lib/api";

/**
 * TRANG LỖI CẤP ROUTE — có nút thử lại (§3.9: mỗi lỗi = 1 câu người thật hiểu
 * + ≥1 nút hành động + panel chi tiết gập lại).
 *
 * `router.invalidate()` chạy lại loader/beforeLoad của route đang lỗi, tức là
 * "Thử lại" thật sự chứ không phải chỉ xoá thông báo.
 */
export function RouteErrorScreen({ error }: ErrorComponentProps) {
  const router = useRouter();
  const p = presentError(error);

  return (
    <AppLayout screen="projects">
      <div className="mx-auto max-w-3xl p-6">
        <ErrorState
          title={p.known ? p.title : "Không mở được trang này"}
          description={
            p.known
              ? p.explain
              : "Giao diện dừng lại khi đang chuẩn bị trang. Dữ liệu trên máy bạn không bị ảnh hưởng."
          }
          detail={devDetails(error)}
          actions={
            <>
              <Button variant="primary" onClick={() => void router.invalidate()}>
                <RotateCcw aria-hidden /> Thử lại
              </Button>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                <RefreshCw aria-hidden /> Tải lại trang
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/">Về danh sách project</Link>
              </Button>
            </>
          }
        />
      </div>
    </AppLayout>
  );
}
