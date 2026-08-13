import * as React from "react";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDoctor, useInstallUpdateFlow, useSetImageProfile, useUpdateCheck } from "@/lib/hooks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConnectionStatus, UpdateCheck } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";

/** "Chưa kiểm tra" ≠ "không kiểm tra được" — hai câu khác nhau, không gộp (§3.9). */
function updateLabel(data: UpdateCheck | undefined): string {
  if (!data) return "Chưa kiểm tra";
  if (!data.ok) return `${data.currentVersion} · chưa kiểm tra được`;
  return `${data.currentVersion} → ${data.latestVersion}`;
}

export function RuntimeStatus({ status, onRecheck }: { status: ConnectionStatus; onRecheck: () => void }) {
  const [open, setOpen] = React.useState(false);
  const doctor = useDoctor({ enabled: open && status.connected });
  const update = useUpdateCheck({ enabled: status.connected });
  const install = useInstallUpdateFlow();
  const profile = useSetImageProfile();
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
        <div className="space-y-2">
          <label className="text-caption text-fg-muted" htmlFor="kitgen-image-profile">Cấu hình tạo ảnh</label>
          <Select
            value={doctor.data?.imageGen?.mode === "img-home" ? "separate" : "default"}
            onValueChange={(value) => profile.mutate(value as "default" | "separate", { onSuccess: () => void doctor.refetch() })}
            disabled={!status.connected || profile.isPending}
          >
            <SelectTrigger id="kitgen-image-profile"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Mặc định (~/.codex)</SelectItem>
              <SelectItem value="separate">Cấu hình riêng (~/.codex-img)</SelectItem>
            </SelectContent>
          </Select>
          {doctor.data?.imageGen?.mode === "img-home" && doctor.data?.imageGen?.authPresent === false && (
            <code className="block rounded-2 bg-raised px-3 py-2 text-caption text-fg">CODEX_HOME=~/.codex-img codex login</code>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => { onRecheck(); void doctor.refetch(); void update.refetch(); }}><RefreshCw aria-hidden /> Kiểm tra lại</Button>
          {update.data?.available && <Button size="sm" onClick={() => void install.start(update.data?.latestVersion)} loading={install.pending}>Cập nhật</Button>}
          {update.data?.ok && !update.data.available && <span className="inline-flex items-center gap-1 text-caption text-fg-muted"><Check className="size-3" /> Mới nhất</span>}
        </div>
      </div>
    </PopoverContent>
  </Popover>;
}
