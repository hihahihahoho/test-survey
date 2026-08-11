import * as React from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { KIND_ICON, KIND_LABEL } from "./doc-visuals";
import { trashCountdown, trashEntries } from "../../lib/subfile-actions";
import { TRASH_KEEP_DAYS, type Doc } from "../../lib";

/**
 * THÙNG RÁC FILE của dự án (§4.4): giữ 30 ngày, phục hồi được bất cứ lúc nào.
 *
 * Nút mở nằm ở chân popover «Tất cả N» — đúng chỗ C1 chừa sẵn (`allFilesFooter`),
 * nên không phải thêm nút thứ hai vào thanh tab vốn đã chật.
 *
 * BA ĐIỀU CỐ Ý:
 *  · **Không có nút "Xoá vĩnh viễn".** Người dùng không cần nó (thùng rác tự dọn sau
 *    30 ngày) và mỗi nút xoá-hẳn là một cách mất dữ liệu. Nếu sau này cần, nó phải đi
 *    kèm `confirmText` — thao tác không có đường về mới xứng ma sát đó.
 *  · **Dọn hết hạn chạy khi MỞ**, không chạy nền: người dùng thấy đúng thứ đang có,
 *    và không có tiến trình bí ẩn xoá dữ liệu sau lưng họ.
 *  · Đếm ngược nói bằng tiếng người ("Còn 12 ngày"), không phải ISO timestamp.
 */
export interface TrashPopoverProps {
  /** danh sách CÓ CẢ file trong thùng rác (`includeTrashed: true`). */
  allDocs: readonly Doc[];
  loading?: boolean;
  errorTitle?: string | null;
  errorDetail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (docId: string) => void;
  restorePending?: boolean;
  /** dọn bản ghi quá hạn — gọi một lần mỗi lần mở. */
  onPurgeExpired?: () => void;
  /** tiêm để test tất định. */
  now?: number;
}

export function TrashPopover(props: TrashPopoverProps) {
  const {
    allDocs, loading, errorTitle, errorDetail, open, onOpenChange,
    onRestore, restorePending, onPurgeExpired, now,
  } = props;

  const entries = React.useMemo(() => trashEntries(allDocs, now ?? Date.now()), [allDocs, now]);

  React.useEffect(() => {
    if (open) onPurgeExpired?.();
    // chỉ chạy khi cánh cửa MỞ ra, không chạy lại mỗi lần render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
          <Trash2 className="size-4" aria-hidden strokeWidth={1.5} />
          Thùng rác file
          {entries.length > 0 && (
            <span className="ml-auto text-caption text-fg-muted-raised">{entries.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col gap-0.5 border-b border-line-subtle px-3 py-2">
          <p className="text-label text-fg-strong">Thùng rác file</p>
          <p className="text-caption text-fg-muted-raised">
            File xoá được giữ {TRASH_KEEP_DAYS} ngày. Sheet, ảnh và kit của dự án không nằm ở đây.
          </p>
        </div>

        <ScrollArea className="max-h-64">
          <TrashBody
            loading={loading}
            errorTitle={errorTitle}
            errorDetail={errorDetail}
            entries={entries}
            onRestore={onRestore}
            restorePending={restorePending}
          />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function TrashBody({
  loading, errorTitle, errorDetail, entries, onRestore, restorePending,
}: {
  loading?: boolean;
  errorTitle?: string | null;
  errorDetail?: string | null;
  entries: ReturnType<typeof trashEntries>;
  onRestore: (docId: string) => void;
  restorePending?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        <span className="sr-only">Đang mở thùng rác…</span>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-2" />
        ))}
      </div>
    );
  }

  if (errorTitle) {
    return (
      <div role="alert" className="flex flex-col gap-1 p-3">
        <p className="text-body text-fg-strong">{errorTitle}</p>
        {errorDetail && (
          <details>
            <summary className="cursor-pointer list-none text-caption text-fg-muted-raised">
              Chi tiết cho lập trình viên
            </summary>
            <code className="mt-1 block font-mono text-caption text-fg-muted-raised">{errorDetail}</code>
          </details>
        )}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-caption text-fg-muted-raised">
        Thùng rác trống. File bạn xoá sẽ nằm đây {TRASH_KEEP_DAYS} ngày trước khi được dọn.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-1">
      {entries.map((e) => {
        const Icon = KIND_ICON[e.doc.kind];
        return (
          <li key={e.doc.id} className="flex items-center gap-2 rounded-2 px-2 py-1.5">
            <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={1.5} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label text-fg-strong">{e.doc.name}</span>
              <span className={cn("text-caption", e.expired ? "text-warn" : "text-fg-muted-raised")}>
                {KIND_LABEL[e.doc.kind]} · {trashCountdown(e)}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={restorePending}
              onClick={() => onRestore(e.doc.id)}
              aria-label={`Phục hồi file ${e.doc.name}`}
              className="shrink-0 gap-1"
            >
              <RotateCcw className="size-3.5" aria-hidden strokeWidth={1.5} />
              Phục hồi
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
