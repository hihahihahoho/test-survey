import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw, FolderCog, SlidersHorizontal, Trash2, Info, Wrench } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";
import { DISPLAY } from "@/components/layout/flora";
import { Route as SettingsRoute } from "@/routes/settings";
import { SETTINGS_TABS, type SettingsTab } from "@/routes/search-schemas";
import { useAgentStatus, useDoctor } from "@/lib/hooks";

import { AboutTab } from "./tabs/AboutTab";
import { AgentTab } from "./tabs/AgentTab";
import { EnvTab } from "./tabs/EnvTab";
import { PrefsTab } from "./tabs/PrefsTab";
import { TrashTab } from "./tabs/TrashTab";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * S6 · CÀI ĐẶT (`/settings`) — UX-SPEC §3-S6. Đóng F1, F2, F4. YC#5, YC#6, YC#7.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * VIẾT BỞI INTEGRATION LEAD. Đây là màn DUY NHẤT không có team nào nộp gì cả:
 * `features/settings/` chỉ có 3 thư mục RỖNG (components/ lib/ tabs/) lúc bàn giao.
 * Route `/settings` đã tồn tại và mọi màn khác đều link tới nó (§3.9 trỏ
 * `/settings?tab=env` cho IMAGEGEN_UNAVAILABLE, `?tab=trash` cho project đã xoá),
 * nên để nó là placeholder thì hàng loạt đường thoát lỗi của các màn khác dẫn vào
 * ngõ cụt. Vì vậy tôi dựng bản thi công đủ 5 tab của spec.
 *
 * 5 TAB qua `?tab=` (§2.1), tab lạ tự rơi về `agent` (search-schemas đã `.catch`):
 *   agent → kết nối + chọn thư mục làm việc (YC#6, chốt X1: gửi id, KHÔNG gửi path)
 *   env   → doctor + tạo ảnh AI (YC#5)
 *   prefs → song song, auto-cắt, xác nhận xoá, theme, log, xoá dữ liệu trình duyệt
 *   trash → thùng rác 30 ngày, phục hồi / xoá vĩnh viễn có mã 4 số (§4.4)
 *   about → phiên bản, protocol, khối QUYỀN RIÊNG TƯ (YC#7)
 *
 * DÙNG LẠI, KHÔNG VIẾT LẠI: tab agent/env dùng đúng `WorkspacePicker`,
 * `DoctorChecklist`, `ImageGenCard`, `ConnectedCard` mà R1-P2 đã viết cho S0 —
 * cùng một sự thật, cùng một cách trình bày, không có bản thứ hai để lệch nhau.
 *
 * PHÍM TẮT §3-S6: `1..5` đổi tab · `⌘R` (chặn mặc định) = Kiểm tra lại.
 * (`⌘,` mở màn này là việc của khung, đã có trong `shortcuts.ts`.)
 */
const TAB_LABEL: Record<SettingsTab, string> = {
  agent: "Công cụ local",
  env: "Môi trường",
  prefs: "Ưu tiên",
  trash: "Thùng rác",
  about: "Về",
};

export function SettingsScreen(_props: ScreenProps) {
  const navigate = useNavigate();
  const { tab } = SettingsRoute.useSearch();
  const { status, recheck } = useAgentStatus();

  // §6.2: doctor CẤM poll. Chỉ bật khi user đang thực sự xem tab cần nó.
  const doctor = useDoctor({ enabled: tab === "env" });

  const setTab = React.useCallback(
    (next: SettingsTab) => void navigate({ to: "/settings", search: { tab: next } }),
    [navigate],
  );

  /** Kiểm tra lại: dò lại agent, và làm mới doctor nếu đang ở tab Môi trường. */
  const recheckAll = React.useCallback(() => {
    recheck();
    if (tab === "env") void doctor.refetch();
  }, [recheck, tab, doctor]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") { e.preventDefault(); recheckAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recheckAll]);

  useRegisterCommands(() => [{ id: "settings.recheck", label: "Kiểm tra lại công cụ local", icon: RefreshCw, run: recheckAll }], [recheckAll]);

  const icons = { agent: FolderCog, env: Wrench, prefs: SlidersHorizontal, trash: Trash2, about: Info };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) void navigate({ to: "/" }); }}>
      <DialogContent size="xl" className="h-[min(82vh,760px)] overflow-hidden p-0">
        <DialogTitle className="sr-only">Cài đặt KitGen</DialogTitle>
        <DialogDescription className="sr-only">Cấu hình môi trường, workspace và ứng dụng.</DialogDescription>
        <div className="grid min-h-0 flex-1 md:grid-cols-[220px_1fr]">
          <aside className="border-r border-line-subtle bg-surface/70 p-3">
            <h2 className={`px-3 pb-4 pt-2 ${DISPLAY} text-fg-strong`}>Cài đặt</h2>
            <nav className="space-y-1">{SETTINGS_TABS.map((t) => { const Icon=icons[t]; return <button key={t} onClick={() => setTab(t)} className={`flex h-10 w-full items-center gap-3 rounded-2 px-3 text-label ${tab===t ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised"}`}><Icon className="size-4" />{TAB_LABEL[t]}</button>; })}</nav>
          </aside>
          <div className="kg-page min-h-0 overflow-y-auto py-5 sm:py-8">
            <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
              <TabsContent value="agent" className="mt-0"><AgentTab status={status} onRecheck={recheck} /></TabsContent>
              <TabsContent value="env" className="mt-0"><EnvTab doctor={doctor} status={status} /></TabsContent>
              <TabsContent value="prefs" className="mt-0"><PrefsTab /></TabsContent>
              <TabsContent value="trash" className="mt-0"><TrashTab /></TabsContent>
              <TabsContent value="about" className="mt-0"><AboutTab status={status} /></TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
