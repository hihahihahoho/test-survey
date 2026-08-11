/**
 * Test HỢP ĐỒNG LAZY-MOUNT + registry lệnh.
 *
 * Ca quan trọng nhất: bảng đường dẫn phải khớp ĐÚNG những gì brief chốt. Nếu
 * ai đó lỡ tay đổi một ký tự trong `SCREEN_PATH`, màn của team kia sẽ im lặng
 * biến thành placeholder mà build vẫn xanh — đúng kiểu lỗi khó truy nhất.
 * Test này biến nó thành lỗi ồn ào.
 *
 * Chạy: npx vitest run --config vitest.shell.config.ts
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  HAS_RAIL, SCREEN_EXPORT, SCREEN_LABEL, SCREEN_PATH, type ScreenId,
} from "../screen-contract";
import { _registry } from "../command-registry";

const ROOT = resolve(new URL("../../../..", import.meta.url).pathname);

/** Bảng NGUYÊN VĂN từ brief. Sửa test này = đang đổi hợp đồng với 3 team. */
const CONTRACT: Record<string, string> = {
  setup: "src/features/setup/SetupScreen.tsx",
  projects: "src/features/projects/ProjectsScreen.tsx",
  design: "src/features/design/DesignScreen.tsx",
  runs: "src/features/runs/RunsScreen.tsx",
  "run-detail": "src/features/runs/RunDetailScreen.tsx",
  project: "src/features/project/ProjectScreen.tsx",
  "project-settings": "src/features/project/ProjectSettingsScreen.tsx",
  kit: "src/features/kit/KitScreen.tsx",
  settings: "src/features/settings/SettingsScreen.tsx",
};

describe("bảng lazy-mount khớp brief", () => {
  it("đủ 9 màn, không thừa không thiếu", () => {
    expect(Object.keys(SCREEN_PATH).sort()).toEqual(Object.keys(CONTRACT).sort());
  });

  it.each(Object.entries(CONTRACT))("đường dẫn của %s đúng nguyên văn", (id, path) => {
    expect(SCREEN_PATH[id as ScreenId]).toBe(path);
  });

  it("tên export suy ra đúng từ tên file", () => {
    for (const [id, path] of Object.entries(CONTRACT)) {
      const fromPath = path.split("/").pop()!.replace(/\.tsx$/, "");
      expect(SCREEN_EXPORT[id as ScreenId]).toBe(fromPath);
    }
  });

  it("mọi màn có nhãn tiếng Việt (placeholder và <title> đều dùng)", () => {
    for (const id of Object.keys(CONTRACT) as ScreenId[]) {
      expect(SCREEN_LABEL[id]).toBeTruthy();
    }
  });

  it("§2.2: S1 và S6 full width; 6 màn trong project có rail", () => {
    expect([...HAS_RAIL].sort()).toEqual(
      ["design", "kit", "project", "project-settings", "run-detail", "runs"],
    );
    expect(HAS_RAIL.has("projects")).toBe(false);
    expect(HAS_RAIL.has("settings")).toBe(false);
    expect(HAS_RAIL.has("setup")).toBe(false);
  });

  /**
   * Không khẳng định "mọi file phải tồn tại" — cả điểm của hợp đồng là chạy
   * được khi thiếu. Test này chỉ CHỤP LẠI hiện trạng để báo cáo trung thực.
   */
  it("báo hiện trạng: màn nào đã có file thật", () => {
    const report = Object.entries(CONTRACT).map(([id, path]) => ({
      id,
      exists: existsSync(resolve(ROOT, path)),
    }));
    console.log(
      "[hiện trạng màn]",
      report.map((r) => `${r.exists ? "✓" : "…"} ${r.id}`).join("  "),
    );
    expect(report).toHaveLength(9);
  });
});

describe("registry lệnh ⌘K", () => {
  it("thêm/gỡ đúng, gỡ rồi thì lệnh không còn trong bảng", () => {
    const off = _registry.add(() => [{ id: "x.test", label: "Lệnh thử", run: () => {} }]);
    expect(_registry.list().map((c) => c.id)).toContain("x.test");
    off();
    expect(_registry.list().map((c) => c.id)).not.toContain("x.test");
  });

  it("một màn khai lệnh LỖI không được giết bảng lệnh của cả app", () => {
    const offBad = _registry.add(() => {
      throw new Error("màn này viết sai");
    });
    const offGood = _registry.add(() => [{ id: "ok.cmd", label: "Vẫn chạy", run: () => {} }]);
    expect(_registry.list().map((c) => c.id)).toEqual(["ok.cmd"]);
    offBad();
    offGood();
  });

  it("báo cho người nghe khi danh sách đổi", () => {
    let calls = 0;
    const unsub = _registry.subscribe(() => {
      calls += 1;
    });
    const off = _registry.add(() => []);
    off();
    unsub();
    expect(calls).toBe(2); // 1 lần thêm + 1 lần gỡ
  });
});
