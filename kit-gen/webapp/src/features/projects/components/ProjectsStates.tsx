import { Copy, FolderPlus, LayoutGrid, RefreshCw, SearchX, Upload, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { presentError, errorDetail } from "../lib/feedback";
import type { Gate } from "../lib/gate";

/**
 * 4 TRẠNG THÁI của S1 (§3-S1 bảng trạng thái) — tách khỏi màn để QA soi từng cái.
 * empty (2 loại) · loading (2 loại) · error (2 loại) · success.
 */

/** empty · 0 project, agent OK. 1 nút primary + 1 secondary + 3 bước tiếp theo. */
export function EmptyNoProjects({
  gate,
  onCreate,
  onImport,
}: {
  gate: Gate;
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <EmptyState
      icon={LayoutGrid}
      title="Chưa có project nào"
      description="Một project = một bộ kit cho một campaign. Mọi thứ nằm trong thư mục làm việc trên máy bạn."
      steps={["Chọn element cho từng sheet", "Sinh ảnh bằng AI", "Tải kit đã cắt về dùng"]}
      className="min-h-[420px] rounded-5 border border-line-subtle bg-surface/70 backdrop-blur-xl"
      action={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={onCreate}
          >
            <FolderPlus aria-hidden />
            Tạo project đầu tiên
          </Button>
          <Button
            variant="secondary"
            size="lg"
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={onImport}
          >
            <Upload aria-hidden />
            Nhập từ styles.json cũ
          </Button>
        </div>
      }
    />
  );
}

/** empty · 0 kết quả tìm. Nói rõ TỪ KHOÁ nào không khớp, kèm đường lùi. */
export function EmptyNoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={query ? `Không có project nào khớp «${query}»` : "Không có project nào khớp bộ lọc"}
      description="Thử từ khoá ngắn hơn, hoặc bỏ bộ lọc đang bật."
      className="min-h-[360px] rounded-5 border border-line-subtle bg-surface/70 backdrop-blur-xl"
      action={
        <Button variant="primary" onClick={onClear}>
          Xoá bộ lọc
        </Button>
      }
    />
  );
}

/**
 * loading lần đầu (CHƯA có cache): 6 thẻ skeleton — KHÔNG spinner giữa màn (§3-S1).
 * Số 6 là con số của spec; nó khớp số thẻ vừa một màn hình 1440px.
 */
export function ProjectsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
    >
      <span className="sr-only">Đang tải danh sách project…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-3 border border-line-subtle bg-surface">
          <Skeleton className="aspect-[16/10] w-full rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <div className="flex justify-between border-t border-line-subtle px-4 py-2.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * error · agent không sẵn sàng và KHÔNG có cache (§3-S1): khối giữa màn.
 * Copy lấy từ bảng §3.9 theo mã lỗi — màn KHÔNG tự viết câu lỗi.
 * Nút chính đổi theo ca: bị trình duyệt chặn → [Mở bản chạy tại máy];
 * còn lại → [Copy lệnh].
 */
export function ErrorNoAgent({
  gate,
  blockedByBrowser,
  mirrorUrl,
  runCommand,
  onCopyCommand,
  onRetry,
  detail,
}: {
  gate: Gate;
  blockedByBrowser: boolean;
  mirrorUrl: string;
  runCommand: string;
  onCopyCommand: () => void;
  onRetry: () => void;
  detail: string;
}) {
  return (
    <ErrorState
      title={gate.reason || "Chưa thấy công cụ local"}
      description={`${gate.longReason} Danh sách project nằm trên máy bạn nên chưa đọc được từ đây.`}
      detail={detail}
      actions={
        <>
          {blockedByBrowser ? (
            <Button variant="primary" asChild>
              <a href={mirrorUrl}>
                <WifiOff aria-hidden />
                Mở bản chạy tại máy
              </a>
            </Button>
          ) : (
            <Button variant="primary" onClick={onCopyCommand}>
              <Copy aria-hidden />
              Copy lệnh
            </Button>
          )}
          <Button variant="secondary" onClick={onRetry}>
            <RefreshCw aria-hidden />
            Thử lại
          </Button>
          <code className="rounded-1 border border-line-subtle bg-canvas px-2 py-1 font-mono text-mono text-fg">
            {runCommand}
          </code>
        </>
      }
    />
  );
}

/** error khi `/api/projects` hỏng dù agent CÓ trả lời (403/421/500…). */
export function ErrorLoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const v = presentError(error);
  return (
    <ErrorState
      title={v.title}
      description={v.explain}
      detail={errorDetail(error)}
      actions={
        <Button variant="primary" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Thử lại
        </Button>
      }
    />
  );
}
