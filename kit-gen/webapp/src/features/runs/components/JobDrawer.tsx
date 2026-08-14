import { Copy, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyableCode, ErrorState, LoadingState } from "@/components/common";
import {
  Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { devDetails, presentError } from "@/lib/api";
import { useJobLog, useJobPrompt } from "@/lib/hooks";
import { downloadText } from "../lib/download";

/**
 * DRAWER "NHẬT KÝ 1 LƯỢT" (§3-S4-6) — mở được từ badge ❌ ở BẤT KỲ đâu trong app.
 * Đóng D7: 91 file log lần đầu đọc được từ giao diện.
 *
 * Hai tab, vì hai câu hỏi khác nhau khi một lượt lỗi:
 *   · "nó chạy ra sao?"      → Nhật ký  (#37, agent ĐÃ redact)
 *   · "nó được bảo vẽ gì?"   → Prompt   (#38, kèm danh sách ảnh đính kèm)
 *
 * Prompt của một lượt ĐÃ CHẠY là bất biến ⇒ hook của R0 để `staleTime: Infinity`.
 * Nhật ký thì không: run đang chạy, mở lại drawer phải thấy phần mới.
 *
 * `LOG_NOT_FOUND` (log cũ đã bị dọn theo hạn lưu) KHÔNG phải lỗi hệ thống — đó là
 * hành vi bình thường. Bảng §3.9 đã có copy riêng và nút [Chạy lại lượt này];
 * ta hiện đúng entry đó thay vì một thông báo đỏ doạ người dùng.
 */
export function JobDrawer({
  open,
  onOpenChange,
  runId,
  job,
  onRetry,
  readOnly,
  readOnlyReason,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runId: string;
  /** `null` ⇒ drawer đóng, không gọi API. */
  job: string | null;
  onRetry: ((job: string) => void) | null;
  readOnly: boolean;
  readOnlyReason: string;
}) {
  const active = open && job !== null;
  const logQuery = useJobLog(active ? runId : null, active ? job : null);
  const promptQuery = useJobPrompt(active ? runId : null, active ? job : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>Lượt {job ?? ""}</SheetTitle>
          <SheetDescription>
            Nhật ký đầy đủ và nội dung đã gửi cho AI của riêng lượt này.
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="flex min-h-0 flex-col gap-3">
          <Tabs defaultValue="log" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="log">Nhật ký</TabsTrigger>
              <TabsTrigger value="prompt">Nội dung gửi AI</TabsTrigger>
            </TabsList>

            <TabsContent value="log" className="min-h-0 flex-1">
              {logQuery.isLoading ? (
                <LoadingState count={6} label="Đang đọc nhật ký của lượt này…" />
              ) : logQuery.error ? (
                <JobQueryError error={logQuery.error} onRetryJob={job && onRetry ? () => onRetry(job) : null}
                  readOnly={readOnly} readOnlyReason={readOnlyReason} onReload={() => void logQuery.refetch()} />
              ) : (
                <div className="flex h-full flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadText(`kitgen-${runId}-${job}.log`, logQuery.data ?? "")}
                    >
                      <Download aria-hidden />
                      Tải nhật ký
                    </Button>
                    <span className="text-caption text-fg-muted-raised">
                      Thông tin nhạy cảm đã được công cụ local che trước khi gửi ra đây.
                    </span>
                  </div>
                  {/* Nhật ký dài vô hạn ⇒ giữ khung cuộn riêng, thêm `overscroll-contain`
                      để chạm đáy log là dừng chứ không hất cho thân drawer trôi theo. */}
                  <pre className="min-h-0 flex-1 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-2 border border-line-subtle bg-canvas p-3 font-mono text-mono text-fg">
                    {logQuery.data && logQuery.data.trim() !== ""
                      ? logQuery.data
                      : "Nhật ký của lượt này rỗng."}
                  </pre>
                </div>
              )}
            </TabsContent>

            <TabsContent value="prompt" className="min-h-0 flex-1">
              {promptQuery.isLoading ? (
                <LoadingState count={4} label="Đang đọc nội dung đã gửi cho AI…" />
              ) : promptQuery.error ? (
                <JobQueryError error={promptQuery.error} onRetryJob={null} readOnly={readOnly}
                  readOnlyReason={readOnlyReason} onReload={() => void promptQuery.refetch()} />
              ) : (
                <div className="flex flex-col gap-3">
                  <CopyableCode
                    label={`Nội dung gửi AI của lượt ${job ?? ""}`}
                    value={promptQuery.data?.prompt ?? ""}
                    className="max-h-96 overflow-auto overscroll-contain"
                  />
                  {(promptQuery.data?.attachments?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-1">
                      <h3 className="text-label text-fg-strong">Ảnh gửi kèm</h3>
                      <ul className="flex flex-col gap-0.5">
                        {promptQuery.data!.attachments.map((a) => (
                          <li key={a} className="flex items-center gap-2 text-caption text-fg">
                            <FileText className="size-3.5 shrink-0 text-fg-muted-raised" aria-hidden />
                            <span className="truncate font-mono">{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {job && onRetry && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-subtle pt-3">
              <Button
                variant="secondary"
                disabled={readOnly}
                aria-disabled={readOnly || undefined}
                title={readOnly ? readOnlyReason : undefined}
                onClick={() => {
                  onRetry(job);
                  onOpenChange(false);
                }}
              >
                <Copy aria-hidden />
                Chạy lại lượt này
              </Button>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Lỗi trong drawer. Dùng bảng §3.9 (`presentError`) — KHÔNG tự viết copy, và
 * `message` kỹ thuật chỉ vào panel "Chi tiết cho lập trình viên" của `ErrorState`.
 */
function JobQueryError({
  error,
  onRetryJob,
  onReload,
  readOnly,
  readOnlyReason,
}: {
  error: unknown;
  onRetryJob: (() => void) | null;
  onReload: () => void;
  readOnly: boolean;
  readOnlyReason: string;
}) {
  const v = presentError(error);
  return (
    <ErrorState
      variant="inline"
      title={v.title}
      description={v.explain}
      detail={devDetails(error)}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={onReload}>
            Thử lại
          </Button>
          {onRetryJob && (
            <Button
              variant="secondary"
              size="sm"
              disabled={readOnly}
              aria-disabled={readOnly || undefined}
              title={readOnly ? readOnlyReason : undefined}
              onClick={onRetryJob}
            >
              Chạy lại lượt này
            </Button>
          )}
        </>
      }
    />
  );
}
