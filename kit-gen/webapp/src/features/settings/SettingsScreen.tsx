import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  /* ── Phím tắt của màn (§3-S6) ────────────────────────────────────────── */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault(); // chặn F5 của trình duyệt — ở đây "làm mới" nghĩa là dò lại agent
        recheckAll();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key);
      if (Number.isInteger(i) && i >= 1 && i <= SETTINGS_TABS.length) {
        setTab(SETTINGS_TABS[i - 1]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recheckAll, setTab]);

  useRegisterCommands(
    () => [
      ...SETTINGS_TABS.map((t) => ({
        id: `settings.tab.${t}`,
        label: `Cài đặt: ${TAB_LABEL[t]}`,
        run: () => setTab(t),
      })),
      {
        id: "settings.recheck",
        label: "Kiểm tra lại công cụ local",
        icon: RefreshCw,
        run: recheckAll,
      },
    ],
    [setTab, recheckAll],
  );

  return (
    /* §W2A-2 — TRƯỚC ĐÂY `mx-auto max-w-4xl` (896px) đẩy H1 "Cài đặt" vào x=304,
       lệch 264px so với H1 của Home. Nội dung cài đặt HẸP là đúng — nhưng nó phải
       hẹp VỀ BÊN PHẢI (`max-w-3xl` không `mx-auto`), không được kéo tiêu đề vào
       giữa trang. Tiêu đề nay đứng đúng mép trái chung với mọi màn khác. */
    /* ══ P-SWEEP·14 · MÉP PHẢI ĂN VỚI HEADER ═══════════════════════════════════
       `max-w-3xl` (768px) đặt ở CẤP TRANG làm nội dung dừng ở giữa màn 1280 trong
       khi header phía trên chạy hết bề ngang ⇒ nửa phải trống hoác và thẻ "Tết 2026
       · Đỏ" kết thúc lơ lửng, không thẳng với bất cứ mép nào (ảnh 28). Bảng "bất
       nhất" chốt: mọi màn dùng chung lưới `.kg-page` 1280px, muốn hẹp thì hẹp ở CẤP
       KHỐI (từng thẻ tự giới hạn bề rộng chữ), không hẹp ở cấp trang. */
    <div className="kg-page flex flex-col gap-8 py-6 pb-16 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        {/* W2B-5 · LUẬT PLAYFAIR điều ③: chỉ nhấn serif khi tiêu đề có ≥3 từ.
            "Cài đặt" có HAI từ ⇒ từ nghiêng chiếm nửa tiêu đề và hết còn là nhấn
            (TOA 6 gọi đúng tên: "sai liều"). Bỏ `<em>`, giữ nguyên chữ.
            W2B-1 · cỡ chữ về const `DISPLAY` — trước đây màn này gõ riêng 30/34px,
            lệch khỏi Home (30/38) dù cùng một cấp tiêu đề. */}
        {/* P-SWEEP·14 — nút "Kiểm tra lại" ở đây ĐÃ BỎ. Nó đứng lơ lửng cạnh H1,
            không thuộc tab nào, trong khi tab "Công cụ local" ĐÃ CÓ SẴN một nút y hệt
            (`AgentTab`) ngay cạnh dòng trạng thái kết nối — tức chỗ nó có nghĩa. Phím
            tắt ⌘R vẫn gọi `recheckAll` cho mọi tab, và lệnh "Kiểm tra lại công cụ
            local" vẫn nằm trong bảng lệnh ⌘K: không đường vào nào bị mất. */}
        <h1 className={`${DISPLAY} text-fg-strong`}>Cài đặt</h1>
      </header>

      {/* QA-LEAD: nội dung PHẢI nằm trong `TabsContent`. Radix luôn gắn
          `aria-controls` lên mỗi `role="tab"`; không có `tabpanel` tương ứng thì
          trình đọc màn hình thông báo một vùng KHÔNG TỒN TẠI trong DOM. */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <TabsList>
          {SETTINGS_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>{TAB_LABEL[t]}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="agent" className="mt-8"><AgentTab status={status} onRecheck={recheck} /></TabsContent>
        <TabsContent value="env" className="mt-8"><EnvTab doctor={doctor} status={status} /></TabsContent>
        <TabsContent value="prefs" className="mt-8"><PrefsTab /></TabsContent>
        <TabsContent value="trash" className="mt-8"><TrashTab /></TabsContent>
        <TabsContent value="about" className="mt-8"><AboutTab status={status} /></TabsContent>
      </Tabs>
    </div>
  );
}
