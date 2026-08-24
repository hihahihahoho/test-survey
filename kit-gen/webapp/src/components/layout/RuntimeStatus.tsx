import * as React from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { markUpdateAnnounced, shouldAnnounceUpdate } from "@/lib/update";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDoctor, useInstallUpdateFlow, useUpdateCheck } from "@/lib/hooks";
import type { ConnectionStatus, UpdateCheck } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";

/** "Chưa kiểm tra" ≠ "không kiểm tra được" — hai câu khác nhau, không gộp (§3.9). */
function updateLabel(data: UpdateCheck | undefined): string {
  if (!data) return "Chưa kiểm tra";
  if (!data.ok) return `${data.currentVersion} · chưa kiểm tra được`;
  return `${data.currentVersion} → ${data.latestVersion}`;
}

/**
 * TIN "CÓ BẢN MỚI" TỰ TÌM ĐẾN NGƯỜI DÙNG.
 *
 * Chấm tròn trên nút trạng thái là tín hiệu ĐÚNG nhưng THỤ ĐỘNG: nó nằm ở góc phải trên,
 * đường kính 6px, và chỉ ai đang nhìn vào đó mới thấy. Query bên dưới nay tự hỏi lại mỗi
 * 30 phút (xem `lib/update/watch.ts`), nên thứ còn thiếu là một câu nói ra thành lời —
 * kèm nút bấm đi thẳng vào luồng cài SẴN CÓ (`install-store`), không phải một luồng thứ hai.
 *
 * Gắn ở ĐÂY chứ không phải ở `App.tsx`: component này đã luôn có mặt trên header và đã
 * là chủ sở hữu của `useUpdateCheck` + `useInstallUpdateFlow`. Thêm một component toàn
 * cục nữa chỉ để đọc lại đúng hai hook đó là dựng thêm một nguồn sự thật thứ hai.
 *
 * Luật "mỗi bản nói một lần" nằm trong `shouldAnnounceUpdate` — hỏi lại mỗi 30 phút
 * KHÔNG có nghĩa là nhắc lại mỗi 30 phút.
 */
function useUpdateAvailableToast(
  data: UpdateCheck | undefined,
  install: { pending: boolean; start: (v?: string | null) => Promise<void> },
) {
  const start = install.start;
  const installing = install.pending;
  React.useEffect(() => {
    if (!shouldAnnounceUpdate(data, { installing })) return;
    const version = data?.latestVersion ?? null;
    // Đánh dấu TRƯỚC khi hiện: người dùng đóng toast hay để nó tự tắt đều là "đã nghe",
    // và effect này có thể chạy lại (StrictMode) trước khi ai kịp bấm gì.
    markUpdateAnnounced(version);
    toast.info(`Có bản cập nhật ${version}`, {
      description: "Cài xong công cụ local sẽ khởi động lại. Cứ chạy dở việc thì để lát nữa cũng được.",
      duration: 10_000,
      action: { label: "Cài ngay", onClick: () => { void start(version); } },
    });
  }, [data, installing, start]);
}

export function RuntimeStatus({ status, onRecheck }: { status: ConnectionStatus; onRecheck: () => void }) {
  const [open, setOpen] = React.useState(false);
  const doctor = useDoctor({ enabled: open && status.connected });
  const update = useUpdateCheck({ enabled: status.connected });
  const install = useInstallUpdateFlow();
  useUpdateAvailableToast(update.data, install);
  const codexReady = doctor.data?.codex?.ok === true && doctor.data?.imageGen?.available === true;
  const statusLabel = status.connected
    ? "Sẵn sàng"
    : status.pill === "checking" ? "Đang kiểm tra" : "Mất kết nối";

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className={cn("inline-flex h-8 items-center gap-2 border px-3 text-caption", FLORA.pill, FLORA.hair, FOCUS)} aria-label={`Trạng thái: ${statusLabel}`}>
        {status.pill === "checking" ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <span className={cn("size-1.5 rounded-full", status.connected ? "bg-ok" : "bg-warn")} aria-hidden />}
        <span>{statusLabel}</span>
        {update.data?.available && <span className="size-1.5 rounded-full bg-accent" aria-label="Có bản cập nhật" />}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-4">
      <div className="space-y-4">
        <div><p className="text-subtitle text-fg-strong">Trạng thái công cụ</p><p className="mt-1 text-caption text-fg-muted">Chi tiết kết nối và công cụ tạo ảnh trên máy này.</p></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-caption">
          <dt className="text-fg-muted">Công cụ local</dt><dd className="text-fg-strong">{status.connected ? `Đang chạy · v${status.agentVersion ?? "—"}` : "Mất kết nối"}</dd>
          <dt className="text-fg-muted">Tạo ảnh</dt><dd className="text-fg-strong">{codexReady ? "Sẵn sàng" : doctor.data?.imageGen?.reason ?? "Chưa kiểm tra"}</dd>
          <dt className="text-fg-muted">Phiên bản</dt><dd className="text-fg-strong">{updateLabel(update.data)}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => { onRecheck(); void doctor.refetch(); void update.refetch(); }}><RefreshCw aria-hidden /> Kiểm tra lại</Button>
          {/* Đóng popover TRƯỚC khi cài: lớp nổi của Radix ở `z-dropdown` (530) nằm TRÊN
              lớp phủ cập nhật (`z-modal`, 510), nên để nguyên thì tấm popover sẽ trôi lơ
              lửng trên màn hình đang chặn — và vẫn bấm được. */}
          {update.data?.available && <Button size="sm" onClick={() => { setOpen(false); void install.start(update.data?.latestVersion); }} loading={install.pending}>Cập nhật</Button>}
          {update.data?.ok && !update.data.available && <span className="inline-flex items-center gap-1 text-caption text-fg-muted"><Check className="size-3" /> Mới nhất</span>}
        </div>
      </div>
    </PopoverContent>
  </Popover>;
}
