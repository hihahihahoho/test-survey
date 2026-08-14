import * as React from "react";
import { RefreshCw, FolderCog, SlidersHorizontal, Info, Wrench, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
/* ⚠️ Import THẲNG module `command-registry`, KHÔNG qua `@/components/layout`.
   Barrel đó re-export `AppLayout`, mà `AppLayout` lại là một trong hai chỗ dựng dialog
   này ⇒ đi qua barrel là tạo vòng import khung ⇄ màn. */
import { useRegisterCommands } from "@/components/layout/command-registry";
import { type SettingsTab } from "@/routes/search-schemas";
import { useAgentStatus, useDoctor } from "@/lib/hooks";

import { AboutTab } from "./tabs/AboutTab";
import { AgentTab } from "./tabs/AgentTab";
import { EnvTab } from "./tabs/EnvTab";
import { PrefsTab } from "./tabs/PrefsTab";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ DIALOG CÀI ĐẶT CỦA APP — MỘT BẢN DUY NHẤT, HAI CHỖ MỞ                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Chủ sản phẩm: *"cái nút cài đặt ở trong dự án topbar sẽ mở lên dialog giống cài đặt
 * bên ngoài"*. Chữ **giống** ở đây không phải "trông na ná" mà là **CÙNG MỘT
 * COMPONENT** — nếu chép nội dung ra bản thứ hai thì hai bên sẽ trôi khỏi nhau đúng
 * ở lần sửa tiếp theo, và người dùng lại gặp cảnh "cài đặt trong dự án thiếu mục X".
 *
 * Vì sao là DIALOG chứ không phải trang:
 *  · Ngoài dự án (`/settings`) nó vốn ĐÃ là dialog — `SettingsScreen` chỉ là lớp nối
 *    router: Home làm nền, `?tab=` giữ mục đang xem, đóng thì về `/`.
 *  · Trong dự án, người dùng đang làm việc dở. Điều hướng đi nơi khác để đổi một cái
 *    switch là bắt họ mất chỗ đứng — nên `AppLayout` mở CHÍNH dialog này ĐÈ LÊN màn,
 *    bằng state cục bộ, không đụng một tham số URL nào của màn dự án.
 *
 * Hợp đồng props cố tình "câm": component không biết router, không biết đang ở trong
 * hay ngoài dự án. Bên gọi quyết định `tab` sống ở URL hay ở `useState`.
 */
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

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsDialog({ open, onOpenChange, tab, onTabChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Ruột CHỈ mount khi đang mở. `AppLayout` render dialog này ở MỌI màn dự án, nên
          nếu ruột mount sẵn thì `useDoctor`/`useAgentStatus` sẽ chạy và lệnh ⌘K
          "Kiểm tra lại công cụ local" sẽ có mặt cả khi không ai mở cài đặt. */}
      {open && <SettingsDialogBody tab={tab} onTabChange={onTabChange} />}
    </Dialog>
  );
}

function SettingsDialogBody({ tab, onTabChange }: Pick<SettingsDialogProps, "tab" | "onTabChange">) {
  const { status, recheck } = useAgentStatus();

  // §6.2: doctor CẤM poll. Chỉ bật khi user đang thực sự xem tab cần nó.
  const doctor = useDoctor({ enabled: tab === "env" });

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
      if (item) onTabChange(item.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recheckAll, onTabChange]);

  useRegisterCommands(() => [{ id: "settings.recheck", label: "Kiểm tra lại công cụ local", icon: RefreshCw, run: recheckAll }], [recheckAll]);

  return (
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
                onClick={() => onTabChange(id)}
                className={`flex h-10 min-w-0 items-center gap-2 rounded-2 px-3 text-left text-label transition-colors ${tab === id ? "bg-canvas text-fg-strong shadow-sm" : "text-fg-muted hover:bg-canvas hover:text-fg"}`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                <span className="sr-only"> ({index + 1})</span>
              </button>
            ))}
          </nav>
        </aside>
        {/* Cột phải là ổ cuộn của dialog (dialog này cao cố định, không dùng
            `DialogBody`) ⇒ cùng luật lớp nổi: chạm biên thì dừng. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 md:px-7">
          <Tabs value={tab} onValueChange={(v) => onTabChange(v as SettingsTab)}>
            <TabsContent value="agent" className="mt-0"><AgentTab status={status} onRecheck={recheckAll} /></TabsContent>
            <TabsContent value="env" className="mt-0"><EnvTab doctor={doctor} status={status} /></TabsContent>
            <TabsContent value="prefs" className="mt-0"><PrefsTab /></TabsContent>
            <TabsContent value="about" className="mt-0"><AboutTab status={status} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </DialogContent>
  );
}
