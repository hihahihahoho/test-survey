import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common/CopyableCode";
import { useUpdateCheck } from "@/lib/hooks";
import {
  MANUAL_RESTART_CMD, MANUAL_UPDATE_CMD, isUpdateBlocking, isUpdateRunning, useUpdateInstall, type UpdatePhase,
} from "@/lib/update";

/**
 * LỚP PHỦ TOÀN TRANG KHI ĐANG CẬP NHẬT.
 *
 * Cập nhật không phải một hành động "chạy nền": nó thay chính công cụ local đang phục vụ
 * app này, rồi khởi động lại nó. Mọi thao tác user làm trong lúc đó đều rơi vào khoảng
 * trống — bấm tạo ảnh sẽ hỏng, sửa contract sẽ không lưu được, và trang có thể tự tải lại
 * ngay giữa lúc họ đang gõ. Nên đây là một trong RẤT ÍT chỗ được phép chặn cả app: chặn
 * xong phải nói rõ đang chờ gì và mất bao lâu, không được chỉ quay một cái spinner.
 *
 * Gắn MỘT LẦN ở `App.tsx`, đọc `useUpdateInstall` — nên nó không phụ thuộc component nào
 * đã bấm nút (popover đóng lại thì lớp phủ vẫn đứng nguyên).
 *
 * Bốn màn, bốn câu khác nhau:
 *   · đang cài/đang chờ → spinner + "đừng đóng tab" (KHÔNG có nút thoát: thoát bằng cách
 *     nào cũng không dừng được việc agent đang tự thay mình);
 *   · CÀI XONG, CHƯA KHỞI ĐỘNG LẠI → nói rõ bản mới đã nằm trên máy và đưa lệnh RESTART.
 *     Đây là ca đã cắn máy chủ SP ngày 14/08 (BACKLOG #20): lượt đó UI mời "cập nhật" lần
 *     nữa — lời khuyên sai, vì bản mới đã cài rồi, thứ thiếu chỉ là một cú khởi động lại;
 *   · quá hạn 90s      → có nút [Tải lại trang] + lệnh thủ công + đường lùi [Đóng];
 *   · gửi lệnh hỏng    → nói thẳng là chưa cài gì cả, kèm lệnh thủ công.
 *
 * TÁCH LÀM HAI (`UpdateOverlayView` thuần + vỏ nối store) không phải để cho đẹp: repo chưa
 * có jsdom nên test render bằng `renderToString`, mà zustand ở chế độ SSR trả về
 * `getInitialState()` — tức là mọi test qua vỏ đều chỉ nhìn thấy trạng thái `idle`. Phần
 * thuần nhận props thì kiểm được đủ bốn màn.
 */
export interface UpdateOverlayViewProps {
  phase: UpdatePhase;
  targetVersion: string | null;
  message: string | null;
  updateCommand: string;
  /** lệnh khởi động lại — chỉ có ở ca `needs-restart`. */
  restartCommand?: string | null;
  onDismiss: () => void;
  onReload?: () => void;
}

export function UpdateOverlayView({
  phase, targetVersion, message, updateCommand, restartCommand, onDismiss, onReload,
}: UpdateOverlayViewProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const running = isUpdateRunning(phase);
  const open = isUpdateBlocking(phase);

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    // Cả trang bị chặn ⇒ nền không được cuộn dưới lớp phủ.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const needsRestart = phase === "needs-restart";

  const title = running
    ? targetVersion
      ? `Đang cập nhật lên bản ${targetVersion}…`
      : "Đang cập nhật lên bản mới…"
    : needsRestart
      ? "Đã cài xong — cần khởi động lại công cụ local"
      : phase === "timeout"
        ? "Chưa xác nhận được bản cập nhật"
        : "Chưa gửi được yêu cầu cập nhật";

  const detail = running
    ? "Đừng đóng tab này. Công cụ local sẽ khởi động lại và trang tự tải lại khi xong."
    : `${message ?? ""} ${needsRestart
      ? "Chạy lệnh dưới đây trong Terminal rồi tải lại trang — KHÔNG cần cập nhật lại."
      : phase === "timeout"
        ? "Kiểm tra cửa sổ Terminal đang chạy công cụ local, hoặc cập nhật thủ công rồi tải lại trang."
        : "Bản đang chạy chưa bị thay đổi gì."}`.trim();

  /**
   * Bẫy Tab trong tấm panel. Lúc đang cài panel KHÔNG có gì bấm được ⇒ Tab bị nuốt hẳn,
   * để tiêu điểm không lang thang xuống mấy cái nút đang bị lớp phủ che.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const list = items ? [...items] : [];
    if (list.length === 0) {
      e.preventDefault();
      return;
    }
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-scrim/[var(--kg-scrim-a)] p-6"
      data-testid="update-overlay"
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="kitgen-update-title"
        aria-describedby="kitgen-update-desc"
        aria-busy={running}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="flex w-full max-w-modal-sm flex-col gap-4 rounded-5 border border-line-subtle bg-overlay p-6 shadow-3 outline-none"
      >
        <div className="flex items-start gap-3">
          {running
            ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-accent-text" aria-hidden />
            : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />}
          <div className="flex flex-col gap-1">
            <p id="kitgen-update-title" className="text-subtitle text-fg-strong">{title}</p>
            <p id="kitgen-update-desc" className="text-body text-fg-muted">{detail}</p>
          </div>
        </div>

        {phase === "waiting" && (
          <p role="status" aria-live="polite" className="text-caption text-fg-muted">
            Đang chờ công cụ local khởi động lại…
          </p>
        )}

        {!running && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-caption text-fg-muted">
                {needsRestart ? "Khởi động lại công cụ local trong Terminal:" : "Cập nhật thủ công trong Terminal:"}
              </p>
              {needsRestart
                ? <CopyableCode value={restartCommand || MANUAL_RESTART_CMD} label="Lệnh khởi động lại KitGen" />
                : <CopyableCode value={updateCommand} label="Lệnh cập nhật KitGen" />}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={onDismiss}>Đóng</Button>
              {(phase === "timeout" || needsRestart) && (
                <Button size="sm" variant="primary" onClick={onReload}>
                  <RefreshCw aria-hidden /> Tải lại trang
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function UpdateOverlay() {
  const phase = useUpdateInstall((s) => s.phase);
  const targetVersion = useUpdateInstall((s) => s.targetVersion);
  const message = useUpdateInstall((s) => s.message);
  const restartCommand = useUpdateInstall((s) => s.restartCommand);
  const dismiss = useUpdateInstall((s) => s.dismiss);
  /* Đọc GHÉ cache `["update"]` (enabled:false ⇒ không sinh request nào) chỉ để lấy đúng
     lệnh mà agent tự khai. Không có cache thì dùng lệnh mặc định. */
  const update = useUpdateCheck({ enabled: false });

  return (
    <UpdateOverlayView
      phase={phase}
      targetVersion={targetVersion}
      message={message}
      updateCommand={update.data?.updateCommand || MANUAL_UPDATE_CMD}
      restartCommand={restartCommand || update.data?.restartCommand || MANUAL_RESTART_CMD}
      onDismiss={dismiss}
      onReload={() => window.location.reload()}
    />
  );
}
