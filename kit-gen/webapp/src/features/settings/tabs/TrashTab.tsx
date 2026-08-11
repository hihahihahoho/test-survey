import * as React from "react";
import { Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/common";
import { devDetails, presentError } from "@/lib/api";
import { useRestoreProject, useTrash } from "@/lib/hooks";
import { bytes, relTime } from "@/lib/format";
import type { TrashItem } from "@/lib/types";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { PurgeDialog } from "../components/PurgeDialog";

/**
 * TAB "THÙNG RÁC" (§3-S6, §4.4).
 *
 * Hai thao tác, hai mức ma sát KHÁC HẲN NHAU — đúng §1.2:
 *  · [Phục hồi]        — hoàn tác được ⇒ bấm là chạy, không hỏi.
 *  · [Xoá vĩnh viễn…]  — KHÔNG hoàn tác được ⇒ modal riêng đòi MÃ 4 SỐ do agent in
 *    ra terminal (arch §3.4 lớp 8). Mã KHÔNG được lưu ở bất cứ đâu trong trình duyệt.
 *
 * `restoreBefore` là sự thật của agent về hạn 30 ngày; ta hiện "còn N ngày" từ nó chứ
 * không tự cộng 30 ngày vào `deletedAt` (hai nguồn sẽ lệch khi agent đổi chính sách).
 */
export function TrashTab() {
  const trash = useTrash();
  const restore = useRestoreProject();
  const [purging, setPurging] = React.useState<TrashItem | null>(null);

  const items = trash.data?.items ?? [];

  if (trash.isLoading) return <LoadingState count={3} variant="rows" label="Đang đọc thùng rác…" />;

  if (trash.error) {
    return (
      <ErrorState
        title="Không đọc được thùng rác"
        description={presentError(trash.error).explain}
        detail={devDetails(trash.error)}
        actions={
          <Button variant="primary" size="sm" onClick={() => void trash.refetch()}>Thử lại</Button>
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Trash2}
        title="Thùng rác trống"
        description="Dự án đã xoá sẽ nằm ở đây 30 ngày và có thể phục hồi trong thời gian đó."
      />
    );
  }

  const onRestore = (it: TrashItem) => {
    restore.mutate(it.trashId, {
      onSuccess: () => toastSuccess(`Đã phục hồi «${it.name ?? it.projectId ?? "Dự án"}»`),
      onError: (e: unknown) => toastError(e),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-fg-muted">
        {items.length} dự án đang trong thùng rác.
      </p>

      {items.map((it) => (
        <Card key={it.trashId}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-subtitle text-fg-strong">
                {it.name ?? it.projectId ?? "Dự án không rõ tên"}
              </p>
              <p className="text-caption text-fg-muted">
                {[
                  it.deletedAt ? `xoá ${relTime(it.deletedAt)}` : null,
                  daysLeft(it.restoreBefore),
                  it.bytes !== undefined ? bytes(it.bytes) : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={restore.isPending && restore.variables === it.trashId}
                onClick={() => onRestore(it)}
              >
                <Undo2 aria-hidden />
                Phục hồi
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPurging(it)}>
                <Trash2 aria-hidden />
                Xoá vĩnh viễn…
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <PurgeDialog
        item={purging}
        onClose={() => setPurging(null)}
        onPurged={() => {
          setPurging(null);
          void trash.refetch();
        }}
      />
    </div>
  );
}

/** "còn 27 ngày" — lấy từ `restoreBefore` của agent, không tự cộng 30 ngày. */
function daysLeft(restoreBefore: string | undefined): string | null {
  if (!restoreBefore) return null;
  const t = Date.parse(restoreBefore);
  if (Number.isNaN(t)) return null;
  const d = Math.ceil((t - Date.now()) / 864e5);
  if (d <= 0) return "sắp bị xoá hẳn";
  return `còn ${d} ngày`;
}
