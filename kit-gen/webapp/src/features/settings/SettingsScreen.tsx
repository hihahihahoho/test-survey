import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { type ScreenProps } from "@/components/layout";
import { HomeWorkspaceShell } from "@/features/home/components/HomeWorkspaceShell";
import { Route as SettingsRoute } from "@/routes/settings";
import { type SettingsTab } from "@/routes/search-schemas";

import { SettingsDialog } from "./SettingsDialog";

/**
 * MÀN `/settings` — **lớp nối router** cho `SettingsDialog`, không hơn.
 *
 * Toàn bộ ruột (4 mục, phím số, ⌘R, các tab) sống trong `SettingsDialog.tsx` vì nút
 * ⚙ trên topbar TRONG DỰ ÁN mở đúng cái dialog đó (`AppLayout`). Ở đây chỉ còn ba
 * quyết định thuộc về *route* này:
 *  · Home làm nền (`HomeWorkspaceShell`) — vào thẳng `/settings` vẫn thấy chỗ mình đứng.
 *  · `tab` sống ở `?tab=` để deep-link/F5 giữ đúng mục (trong dự án thì là state cục bộ).
 *  · Đóng dialog = rời route, tức về `/`.
 */
export function SettingsScreen(_props: ScreenProps) {
  const navigate = useNavigate();
  const { tab } = SettingsRoute.useSearch();

  const setTab = React.useCallback(
    // Đổi mục trong cùng modal không nên làm dài lịch sử Back của trình duyệt.
    (next: SettingsTab) => void navigate({ to: "/settings", search: { tab: next }, replace: true }),
    [navigate],
  );

  return (
    <HomeWorkspaceShell active="settings" title="Dự án">
      <SettingsDialog
        open
        onOpenChange={(open) => { if (!open) void navigate({ to: "/", search: {} }); }}
        tab={tab}
        onTabChange={setTab}
      />
    </HomeWorkspaceShell>
  );
}
