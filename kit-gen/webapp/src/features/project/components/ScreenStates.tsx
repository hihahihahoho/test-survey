import { Link } from "@tanstack/react-router";
import { FolderOpen, PackageOpen, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common";
import { devDetails, presentError } from "@/lib/api";
import { useRevealProject } from "@/lib/hooks";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";

/**
 * BỐN TRẠNG THÁI dùng chung cho S2 và S2b — mỗi màn chỉ chọn, không tự vẽ lại.
 *
 * `loading`: §5.6 "số lượng skeleton phải KHỚP số phần tử dự kiến". S2 dự kiến
 * 1 thẻ việc-tiếp-theo + 1 ma trận + 4 thẻ nhỏ; S2b dự kiến 3 thẻ. Truyền `cards`
 * đúng số đó, đừng đoán bừa — skeleton nhiều/ít hơn thật thì màn sẽ "nhảy" khi
 * dữ liệu về, và đó là một dạng nói dối về bố cục.
 *
 * `error`: bám ĐÚNG bảng §3.9 — `PROJECT_NOT_FOUND`/`PROJECT_IN_TRASH` có bộ nút
 * riêng ([Về danh sách] [Xem thùng rác]), `PROJECT_BROKEN` có [Mở thư mục]
 * [Phục hồi từ lịch sử]. `error.message` kỹ thuật CHỈ nằm trong panel gập.
 */

export function ProjectLoading({ cards, label }: { cards: number; label: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-3 w-52" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Project không còn ở đây (`PROJECT_NOT_FOUND` / `PROJECT_IN_TRASH`) — không phải
 * lỗi hệ thống, nên dùng `EmptyState` chứ không phải khối đỏ.
 */
export function ProjectMissing({ inTrash }: { inTrash: boolean }) {
  return (
    <EmptyState
      icon={PackageOpen}
      title={inTrash ? "Dự án này đang ở trong Thùng rác" : "Không tìm thấy dự án này"}
      description={
        inTrash
          ? "Nó vẫn được giữ 30 ngày kể từ lúc xoá — phục hồi lại được."
          : "Có thể nó đã bị xoá, hoặc bạn đang mở một thư mục làm việc khác."
      }
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" asChild>
            <Link to="/">Về danh sách dự án</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/trash">
              <Trash2 aria-hidden />
              Xem thùng rác
            </Link>
          </Button>
        </div>
      }
    />
  );
}

/**
 * Mọi lỗi còn lại. `PROJECT_BROKEN` được ưu tiên vì nó có hai nút riêng và có
 * `details.file`/`details.line` — thông tin đắt giá để user tự sửa file JSON.
 */
export function ProjectError({
  projectId,
  error,
  onRetry,
  onOpenHistory,
}: {
  projectId: string;
  error: unknown;
  onRetry: () => void;
  /** Mở drawer lịch sử bản thiết kế (nút [Phục hồi từ lịch sử] của §3.9). */
  onOpenHistory: (() => void) | null;
}) {
  const v = presentError(error);
  const reveal = useRevealProject(projectId);
  const d = v.details as { file?: string; line?: number | null } | null;
  const where = d?.file ? `${d.file}${typeof d.line === "number" ? `, dòng ${d.line}` : ""}` : null;

  return (
    <ErrorState
      title={v.title}
      description={
        <>
          {v.explain}
          {where && (
            <>
              {" "}
              Chỗ hỏng: <span className="font-mono text-fg-strong">{where}</span>.
            </>
          )}
        </>
      }
      detail={devDetails(error)}
      actions={
        <>
          <Button variant="primary" size="sm" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Thử lại
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={reveal.isPending}
            onClick={() =>
              reveal.mutate(undefined, {
                onSuccess: () => toastSuccess("Đã mở thư mục dự án trên máy"),
                onError: (e) => toastError(e),
              })
            }
          >
            <FolderOpen aria-hidden />
            Mở thư mục
          </Button>
          {onOpenHistory && v.code === "PROJECT_BROKEN" && (
            <Button variant="secondary" size="sm" onClick={onOpenHistory}>
              Phục hồi từ lịch sử
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">Về danh sách</Link>
          </Button>
        </>
      }
    />
  );
}
