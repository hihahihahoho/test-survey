import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw, FolderCog, SlidersHorizontal, Info, Wrench, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";
import { HomeWorkspaceShell } from "@/features/home/components/HomeWorkspaceShell";
import { Route as SettingsRoute } from "@/routes/settings";
import { type SettingsTab } from "@/routes/search-schemas";
import { useAgentStatus, useDoctor } from "@/lib/hooks";

import { AboutTab } from "./tabs/AboutTab";
import { AgentTab } from "./tabs/AgentTab";
import { EnvTab } from "./tabs/EnvTab";
import { PrefsTab } from "./tabs/PrefsTab";

const SETTINGS_NAV: ReadonlyArray<{
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "agent", label: "Công cụ local", icon: FolderCog },
  { id: "env", label: "Tạo ảnh", icon: Wrench },
  { id: "prefs", label: "Giao diện", icon: SlidersHorizontal },
  { id: "about", label: "Giới thiệu", icon: Info },
];

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

export function SettingsScreen(_props: ScreenProps) {
  const navigate = useNavigate();
  const { tab } = SettingsRoute.useSearch();
  const { status, recheck } = useAgentStatus();

  // §6.2: doctor CẤM poll. Chỉ bật khi user đang thực sự xem tab cần nó.
  const doctor = useDoctor({ enabled: tab === "env" });

  const setTab = React.useCallback(
    // Đổi mục trong cùng modal không nên làm dài lịch sử Back của trình duyệt.
    (next: SettingsTab) => void navigate({ to: "/settings", search: { tab: next }, replace: true }),
    [navigate],
  );

  /** Kiểm tra lại: dò lại agent, và làm mới doctor nếu đang ở tab Môi trường. */
  const recheckAll = React.useCallback(() => {
    recheck();
    if (tab === "env") void doctor.refetch();
  }, [recheck, tab, doctor]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        recheckAll();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      const index = Number(e.key) - 1;
      const item = SETTINGS_NAV[index];
      if (item) setTab(item.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recheckAll, setTab]);

  useRegisterCommands(() => [{ id: "settings.recheck", label: "Kiểm tra lại công cụ local", icon: RefreshCw, run: recheckAll }], [recheckAll]);

  return (
    <HomeWorkspaceShell active="settings" title="Dự án">
      <Dialog open onOpenChange={(open) => { if (!open) void navigate({ to: "/", search: {} }); }}>
        <DialogContent size="xl" className="h-[min(46rem,calc(100dvh-2rem))] overflow-hidden">
          <DialogHeader className="border-b border-line-subtle px-6 pb-4 pt-5">
            <DialogTitle>Cài đặt</DialogTitle>
            <DialogDescription>Công cụ local, tạo ảnh và giao diện.</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="shrink-0 border-b border-line-subtle bg-raised/40 p-3 md:border-b-0 md:border-r">
            <nav aria-label="Các mục cài đặt" className="grid grid-cols-2 gap-1 md:block md:space-y-1">
              {SETTINGS_NAV.map(({ id, label, icon: Icon }, index) => (
                <button
                  key={id}
                  type="button"
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => setTab(id)}
                  className={`flex h-10 min-w-0 items-center gap-2 rounded-2 px-3 text-left text-label transition-colors ${tab === id ? "bg-canvas text-fg-strong shadow-sm" : "text-fg-muted hover:bg-canvas hover:text-fg"}`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                  <span className="sr-only"> ({index + 1})</span>
                </button>
              ))}
            </nav>
          </aside>
          <div className="min-h-0 overflow-y-auto px-5 py-5 md:px-7">
            <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
              <TabsContent value="agent" className="mt-0"><AgentTab status={status} onRecheck={recheckAll} /></TabsContent>
              <TabsContent value="env" className="mt-0"><EnvTab doctor={doctor} status={status} /></TabsContent>
              <TabsContent value="prefs" className="mt-0"><PrefsTab /></TabsContent>
              <TabsContent value="about" className="mt-0"><AboutTab status={status} /></TabsContent>
            </Tabs>
          </div>
        </div>
        </DialogContent>
      </Dialog>
    </HomeWorkspaceShell>
  );
}
