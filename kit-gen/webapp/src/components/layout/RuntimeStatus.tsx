import * as React from "react";
import { Check, Loader2, RefreshCw, Server, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDoctor, useInstallUpdate, useUpdateCheck } from "@/lib/hooks";
import type { ConnectionStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";

export function RuntimeStatus({ status, onRecheck }: { status: ConnectionStatus; onRecheck: () => void }) {
  const [open, setOpen] = React.useState(false);
  const doctor = useDoctor({ enabled: open && status.connected });
  const update = useUpdateCheck({ enabled: status.connected });
  const install = useInstallUpdate();
  const codexReady = doctor.data?.codex?.ok === true && doctor.data?.imageGen?.available === true;
  const codexLabel = !status.connected ? "Codex —" : doctor.isLoading ? "Codex…" : codexReady ? "Codex Live" : "Codex check";

  const doInstall = async () => {
    if (!window.confirm(`Cập nhật KitGen lên ${update.data?.latestVersion}? Server sẽ khởi động lại sau khi cài.`)) return;
    await install.mutateAsync();
    window.setTimeout(() => window.location.reload(), 5000);
  };

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className={cn("inline-flex h-8 items-center gap-3 border px-3 text-caption", FLORA.pill, FLORA.hair, FOCUS)} aria-label="Trạng thái server và Codex">
        <Tag icon={Server} live={status.connected} label={status.connected ? "Server Live" : status.pill === "checking" ? "Server…" : "Server Offline"} />
        <span className="h-3 w-px bg-line-subtle" aria-hidden />
        <Tag icon={Sparkles} live={codexReady} label={codexLabel} loading={doctor.isLoading} />
        {update.data?.available && <span className="size-1.5 rounded-full bg-accent" aria-label="Có bản cập nhật" />}
      </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-80 p-4">
      <div className="space-y-4">
        <div><p className="text-subtitle text-fg-strong">Trạng thái local</p><p className="mt-1 text-caption text-fg-muted">Server và profile tạo ảnh trên máy bạn.</p></div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-caption">
          <dt className="text-fg-muted">Server</dt><dd className="text-fg-strong">{status.connected ? `Live · v${status.agentVersion ?? "—"}` : "Offline"}</dd>
          <dt className="text-fg-muted">Codex</dt><dd className="text-fg-strong">{codexReady ? `Ready · ${doctor.data?.imageGen?.codexHomeLabel ?? "~/.codex"}` : doctor.data?.imageGen?.reason ?? "Chưa kiểm tra"}</dd>
          <dt className="text-fg-muted">KitGen</dt><dd className="text-fg-strong">{update.data ? `${update.data.currentVersion} → ${update.data.latestVersion}` : "Chưa kiểm tra"}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => { onRecheck(); void doctor.refetch(); void update.refetch(); }}><RefreshCw aria-hidden /> Kiểm tra lại</Button>
          {update.data?.available && <Button size="sm" onClick={() => void doInstall()} loading={install.isPending}>Cập nhật</Button>}
          {update.data && !update.data.available && <span className="inline-flex items-center gap-1 text-caption text-fg-muted"><Check className="size-3" /> Mới nhất</span>}
        </div>
      </div>
    </PopoverContent>
  </Popover>;
}

function Tag({ icon: Icon, label, live, loading }: { icon: typeof Server; label: string; live: boolean; loading?: boolean }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-fg">
    {loading ? <Loader2 className="size-3 animate-spin" /> : <Icon className="size-3" />}
    <span className="hidden sm:inline">{label}</span><span className={cn("size-1.5 rounded-full", live ? "bg-ok" : "bg-warn")} aria-hidden />
  </span>;
}
