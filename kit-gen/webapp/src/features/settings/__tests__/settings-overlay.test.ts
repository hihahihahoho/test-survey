import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("Settings page", () => {
  it("mounts one settings screen instead of a second Home behind a dialog", () => {
    const route = read("src/routes/settings.tsx");
    expect(route).toContain('<AppLayout screen="settings">');
    expect(route).toContain('<LazyScreen screen="settings" />');
    expect(route).not.toContain('<LazyScreen screen="projects" />');
  });

  it("uses the shared Home workspace shell with route-backed dialog settings", () => {
    const screen = read("src/features/settings/SettingsScreen.tsx");
    const shell = read("src/features/home/components/HomeWorkspaceShell.tsx");
    expect(screen).toContain('<HomeWorkspaceShell active="settings" title="Dự án">');
    expect(shell).toContain("text-subtitle text-fg-strong");
    expect(screen).toContain("<SettingsDialog\n        open\n");
    expect(screen).toContain('navigate({ to: "/", search: {} })');
  });

  it("does not turn tab clicks into a history trail", () => {
    const screen = read("src/features/settings/SettingsScreen.tsx");
    expect(screen).toContain('to: "/settings", search: { tab: next }, replace: true');
  });

  /**
   * Chủ sản phẩm: *"cái nút cài đặt ở trong dự án topbar sẽ mở lên dialog giống cài đặt
   * bên ngoài"*. **Giống = CÙNG MỘT COMPONENT.** Phép kiểm phát biểu ở dạng phủ định
   * cho chắc: ngoài `SettingsDialog.tsx` ra, KHÔNG file nào được tự dựng lại 4 mục đó.
   */
  it("một bản dialog duy nhất: `/settings` và bánh răng topbar cùng gọi SettingsDialog", () => {
    const dialog = read("src/features/settings/SettingsDialog.tsx");
    const screen = read("src/features/settings/SettingsScreen.tsx");
    const layout = read("src/components/layout/AppLayout.tsx");

    // Ruột (bảng 4 mục + các tab) chỉ tồn tại ở MỘT nơi.
    expect(dialog).toContain("const SETTINGS_NAV");
    expect(dialog).toContain('<DialogTitle>Cài đặt</DialogTitle>');
    for (const file of [screen, layout]) {
      expect(file).toContain("SettingsDialog");
      expect(file).not.toContain("SETTINGS_NAV");
      expect(file).not.toContain("<AgentTab");
    }

    // Bánh răng topbar mở dialog TẠI CHỖ — không điều hướng rời dự án, và không còn
    // mở nhầm dialog cài đặt DỰ ÁN (`?settings=requirements`) như bản cũ.
    expect(layout).toContain("onSettingsClick={projectId ? openAppSettings : undefined}");
    expect(layout).toContain('setAppSettingsTab("agent")');
    expect(layout).not.toContain('settings: "requirements"');
    expect(layout).not.toContain('to: "/settings"');

    /* …và KHÔNG kéo 4 tab cài đặt vào chunk `layout` (thứ mọi route tải ngay lần vẽ
       đầu). Import tĩnh ở đây đã đo là +17.8kB gzip cho mọi màn. */
    expect(layout).toContain('React.lazy(async () => ({');
    expect(layout).toContain('await import("@/features/settings/SettingsDialog")');
    expect(layout).not.toMatch(/^import \{ SettingsDialog \}/m);
  });

  /** Hai dialog cùng với tới được từ màn dự án ⇒ KHÔNG được trùng tên. */
  it("dialog cài đặt dự án mang tên riêng", () => {
    const projectDialog = read("src/features/project/components/ProjectSettingsDialog.tsx");
    expect(projectDialog).toContain("<DialogTitle>Cài đặt dự án</DialogTitle>");
  });
});
