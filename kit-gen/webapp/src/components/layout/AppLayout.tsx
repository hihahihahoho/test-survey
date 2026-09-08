import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { FloraShell } from "./FloraShell";
import { useAgentStatus, useProject } from "@/lib/hooks";
import { useRecentStore } from "@/lib/store";
import type { AgentStatus } from "@/lib/status";
import { SCREEN_LABEL, ShellEnvProvider, type ScreenId } from "./screen-contract";
import { RUN_CMD } from "./agent-commands";
import type { SettingsTab } from "@/routes/search-schemas";

/**
 * ⚠️ LAZY, KHÔNG PHẢI IMPORT TĨNH — đã đo, không phải đề phòng suông.
 *
 * `AppLayout` nằm trong chunk `layout` mà MỌI route đều tải ngay từ lần vẽ đầu. Bản
 * import tĩnh của dialog Cài đặt kéo cả 4 tab (agent/env/prefs/about) vào đó:
 * `layout` phồng 46.19kB → 108.72kB (gzip 16.54 → 34.34) cho một cái dialog mà phần
 * lớn phiên làm việc không ai mở. Lazy ⇒ chunk chỉ tải ở cú bấm đầu tiên vào bánh răng.
 */
const SettingsDialogLazy = React.lazy(async () => ({
  default: (await import("@/features/settings/SettingsDialog")).SettingsDialog,
}));

/**
 * KHUNG ỨNG DỤNG dùng chung cho 8 màn (S0 tự vẽ khung riêng — wizard không có
 * rail, không breadcrumb).
 *
 * Chia việc rõ ràng: `FloraShell` là KHUNG THUẦN (không biết đang ở màn nào);
 * file này là chỗ NỐI khung với router — nó biết màn nào đang mở, project nào
 * đang xem, agent đang ở trạng thái gì, và cung cấp ⌘K/⌘P/`?`.
 *
 * VỎ: `FloraShell` thay `AppShell` của R0 để đạt chuẩn thị giác FLORA-REF §3 (nền #000,
 * header thoáng, ô ⌘K pill, agent status dạng chấm). **Hợp đồng props y nguyên** — đổi lại
 * `import { AppShell } from "@/components/common"` là quay về bản R0. Lý do không sửa
 * thẳng file R0: teams/react/NEEDS-rs2.md (N3).
 *
 * Màn KHÔNG cần tự dựng header/rail/banner. Màn chỉ render nội dung.
 */
export interface AppLayoutProps {
  screen: ScreenId;
  projectId?: string;
  children: React.ReactNode;
}

export function AppLayout({ screen, projectId, children }: AppLayoutProps) {
  const navigate = useNavigate();

  const project = useProject(projectId);
  const activeRuns = project.data?.state?.activeRun?.runId ? 1 : 0;
  // Nhịp probe nhanh hơn khi có lượt đang chạy (arch §5.3).
  const { status, recheck } = useAgentStatus({ hasActiveRun: activeRuns > 0 });

  const touchRecent = useRecentStore((s) => s.touch);
  React.useEffect(() => {
    if (projectId) touchRecent(projectId);
  }, [projectId, touchRecent]);

  // §5.8-A13: <title> đổi theo màn. Tên project ưu tiên hơn tên màn vì đó là
  // thứ user phân biệt được khi mở nhiều tab.
  React.useEffect(() => {
    const parts = [project.data?.name, SCREEN_LABEL[screen], "kit-gen"].filter(Boolean);
    document.title = parts.join(" · ");
  }, [screen, project.data?.name]);

  const shellEnv = React.useMemo(() => ({ agentOffline: !status.connected, agentCommand: RUN_CMD }), [status.connected]);

  /* ══════════ NÚT ⚙ TRÊN TOPBAR = CÀI ĐẶT CỦA CẢ APP ══════════
     Chủ sản phẩm: *"cái nút cài đặt ở trong dự án topbar sẽ mở lên dialog giống cài đặt
     bên ngoài"*. Nó nằm giữa thanh quota Codex và trạng thái runtime — cả hai đều là
     việc của MÁY, không phải của một dự án — nên cái cửa nó mở cũng phải là cài đặt máy.

     Bản cũ ghi `?settings=requirements` ⇒ mở **dialog cài đặt DỰ ÁN** (Yêu cầu · Phong
     cách · Dự án). Đó là cửa của mục sidebar «Cài đặt style», không phải của bánh răng
     này — đúng điều ghi ngay trong `ProjectScreen`: *"Bánh răng ở topbar là cài đặt của
     CẢ APP"*. Nay bánh răng mở CHÍNH `SettingsDialog` mà `/settings` dùng.

     VÌ SAO STATE CỤC BỘ CHỨ KHÔNG PHẢI URL — hai lý do, cùng một gốc "đừng đụng vào
     chỗ người ta đang đứng":
      · Người dùng đang làm việc dở trong dự án. Điều hướng sang `/settings` là ném họ
        ra khỏi màn (và khỏi cả bộ nhớ chưa lưu của màn đó).
      · Màn dự án đã có BA TRỤC URL độc lập (`section`/`group`/`settings`) và một lịch
        sử lỗi vì gánh chung (lỗi #5). Thêm một trục thứ tư cho một cái dialog không
        cần deep-link là mời lại đúng lớp lỗi đó. Đóng dialog ⇒ URL y nguyên, kể cả
        khi màn nền là S3/S5 chứ không phải màn dự án. */
  const [appSettingsTab, setAppSettingsTab] = React.useState<SettingsTab | null>(null);
  /* Mở một lần rồi thì GIỮ MOUNT (chỉ `open` bật/tắt). Nếu tháo hẳn theo `appSettingsTab`
     thì Radix mất luôn animation đóng — dialog biến mất khựng một nhịp. Cờ này cũng là
     thứ hoãn `import()` tới cú bấm đầu tiên. */
  const [settingsEverOpened, setSettingsEverOpened] = React.useState(false);
  const openAppSettings = React.useCallback(() => {
    setSettingsEverOpened(true);
    setAppSettingsTab("agent");
  }, []);

  const body = (
    <FloraShell
      home={screen === "projects" || screen === "settings"}
      agentStatus={status.pill as AgentStatus}
      connectionStatus={status}
      onRecheck={recheck}
      onSettingsClick={projectId ? openAppSettings : undefined}
      onHomeClick={() => void navigate({ to: "/" })}
    >
      {children}
    </FloraShell>
  );

  return (
    <ShellEnvProvider value={shellEnv}>
      {body}
      {/* Dialog là ANH EM của khung, không phải con của `children`: nó phải sống qua mọi
          lần màn bên trong render lại, và không được nằm trong `ErrorBoundary` của màn.
          Chỉ dựng khi topbar THẬT SỰ có bánh răng (`projectId`) — ở `/settings` thì
          chính `SettingsScreen` dựng dialog này, không được có bản thứ hai. */}
      {projectId && settingsEverOpened && (
        /* `fallback={null}`: khoảng chờ là một chunk ~50kB từ ĐĨA (agent chạy local),
           nên nhấp nháy một skeleton ở đây ồn hơn là không vẽ gì. */
        <React.Suspense fallback={null}>
          <SettingsDialogLazy
            open={appSettingsTab !== null}
            onOpenChange={(open) => { if (!open) setAppSettingsTab(null); }}
            tab={appSettingsTab ?? "agent"}
            onTabChange={setAppSettingsTab}
          />
        </React.Suspense>
      )}
    </ShellEnvProvider>
  );
}
