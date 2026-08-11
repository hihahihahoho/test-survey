import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("Settings overlay", () => {
  it("keeps Home mounted behind the settings route", () => {
    const route = read("src/routes/settings.tsx");
    expect(route).toContain('<AppLayout screen="projects">');
    expect(route).toContain('<LazyScreen screen="projects" />');
    expect(route).toContain('<LazyScreen screen="settings" />');
  });

  it("uses a compact modal and a title-scale heading", () => {
    const screen = read("src/features/settings/SettingsScreen.tsx");
    expect(screen).toContain("<Dialog open");
    expect(screen).toContain('data-testid="settings-dialog"');
    expect(screen).toContain("text-title text-fg-strong");
    expect(screen).not.toContain("DISPLAY");
  });

  it("does not turn tab clicks into a history trail, and leaves settings for Home", () => {
    const screen = read("src/features/settings/SettingsScreen.tsx");
    expect(screen).toContain('to: "/settings", search: { tab: next }, replace: true');
    expect(screen).toContain('to: "/", search: {}, replace: true');
  });
});
