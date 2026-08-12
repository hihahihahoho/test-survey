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
    expect(screen).toContain("<Dialog open");
    expect(screen).toContain('navigate({ to: "/", search: {} })');
  });

  it("does not turn tab clicks into a history trail", () => {
    const screen = read("src/features/settings/SettingsScreen.tsx");
    expect(screen).toContain('to: "/settings", search: { tab: next }, replace: true');
  });
});
