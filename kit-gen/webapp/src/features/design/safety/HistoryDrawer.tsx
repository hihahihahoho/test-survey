import * as React from "react";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/common";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { devDetails, presentError } from "@/lib/api";
import { formatWhen } from "./format-time";
import type { ContractHistoryApi } from "./useContractHistory";

/**
 * DRAWER "LỊCH SỬ BẢN THIẾT KẾ" (§3.7 + overlay toàn cục §2.1) — đóng B4.
 * 50 bản lưu của agent (#24); [Khôi phục] gọi #26.
 *
 * HAI CÂU PHẢI NÓI RÕ, VÌ USER HAY HIỂU SAI CHỮ "KHÔI PHỤC":
 *  1. Khôi phục tạo bản MỚI, KHÔNG xoá các bản sau nó. Nhiều phần mềm khác thì
 *     có — nếu không nói rõ, user sẽ ngại bấm đúng cái nút cứu họ.
 *  2. Đang có thay đổi chưa lưu mà khôi phục thì thay đổi đó bị thay thế. Cảnh
 *     báo hiện NGAY TRONG drawer kèm số thay đổi, TRƯỚC khi bấm.
 *
 * Khôi phục là thao tác phá huỷ mức nhẹ (bản hiện tại cũng đã nằm trong lịch sử,
 * và ⌘Z vẫn hoàn tác được) ⇒ xác nhận INLINE 2 bước, không dựng modal chồng lên
 * drawer. Modal chồng modal là thứ §5.5 tránh; ma sát 2 bước ở đây là vừa đủ.
 */
export function HistoryDrawer({
  open,
  onOpenChange,
  history,
  currentVersion,
  dirty,
  dirtyCount,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  history: ContractHistoryApi;
  currentVersion: number;
  dirty: boolean;
  dirtyCount: number;
  onRestore: (snapshot: string) => Promise<boolean>;
}) {
  const [confirming, setConfirming] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) setConfirming(null);
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Lịch sử bản thiết kế</SheetTitle>
          <SheetDescription>
            Mỗi lần bạn bấm Lưu, bản trước đó được giữ lại đây (tối đa 50 bản). Khôi phục tạo một
            bản mới — không bản nào bị xoá.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex flex-col gap-3">
          {dirty && (
            <p role="status" className="rounded-2 border border-warn/60 bg-warn/10 p-2 text-caption text-fg">
              Bạn đang có <strong className="text-fg-strong">{dirtyCount} thay đổi chưa lưu</strong>.
              Khôi phục sẽ thay nội dung đang mở — hãy Lưu trước nếu muốn giữ. Vẫn hoàn tác được
              bằng ⌘Z sau đó.
            </p>
          )}

          {history.restoreError != null && (
            <ErrorState
              variant="inline"
              title={presentError(history.restoreError).title}
              description={presentError(history.restoreError).explain}
              detail={devDetails(history.restoreError)}
            />
          )}

          {history.loading ? (
            <LoadingState count={5} variant="rows" label="Đang đọc lịch sử bản thiết kế…" />
          ) : history.error != null ? (
            <ErrorState
              variant="inline"
              title={presentError(history.error).title}
              description={presentError(history.error).explain}
              detail={devDetails(history.error)}
              actions={
                <Button variant="secondary" size="sm" onClick={history.refetch}>
                  Thử lại
                </Button>
              }
            />
          ) : history.items.length === 0 ? (
            <EmptyState
              icon={History}
              title="Chưa có bản lưu nào"
              description="Bản lưu đầu tiên xuất hiện ngay sau lần bấm Lưu tiếp theo. Trong lúc đó, Hoàn tác (⌘Z) vẫn giữ được ≥50 bước của phiên này."
            />
          ) : (
            <ul className="flex flex-col">
              {history.items.map((h) => {
                const isCurrent = h.version === currentVersion;
                const busy = history.restoring === h.snapshot;
                const locked = history.restoring !== null && !busy;
                return (
                  <li
                    key={h.snapshot}
                    className="flex items-center gap-3 border-b border-line-subtle py-2 last:border-0"
                  >
                    <Badge tone={isCurrent ? "accent" : "never"}>
                      <span>v{h.version}</span>
                    </Badge>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-caption text-fg-strong">
                        {h.at ? formatWhen(h.at) : "chưa rõ thời điểm"}
                        {isCurrent && " · đang mở"}
                      </span>
                      <span className="text-caption text-fg-muted-raised">{h.summary}</span>
                    </div>

                    {confirming === h.snapshot ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="danger"
                          size="sm"
                          loading={busy}
                          onClick={() => {
                            void onRestore(h.snapshot).then((ok) => {
                              if (ok) {
                                setConfirming(null);
                                onOpenChange(false);
                              }
                            });
                          }}
                        >
                          Xác nhận khôi phục
                        </Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(null)}>
                          Thôi
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isCurrent || locked}
                        aria-disabled={isCurrent || locked || undefined}
                        title={isCurrent ? "Đây là bản đang mở" : undefined}
                        onClick={() => setConfirming(h.snapshot)}
                      >
                        <RotateCcw aria-hidden />
                        Khôi phục
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
