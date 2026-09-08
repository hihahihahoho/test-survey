/**
 * Test HỢP ĐỒNG LAZY-MOUNT + registry lệnh.
 *
 * Ca quan trọng nhất: bảng đường dẫn phải khớp ĐÚNG file có thật. Nếu ai đó lỡ tay
 * đổi một ký tự trong `SCREEN_PATH`, màn sẽ im lặng biến thành placeholder mà build
 * vẫn xanh — đúng kiểu lỗi khó truy nhất. Test này biến nó thành lỗi ồn ào.
 *
 * 08/09/2026 — bảng rút từ 9 màn xuống 2 màn lazy + 1 màn nạp tĩnh. Sáu id đã xoá
 * (`setup`, `project`, `project-settings`, `design`, `runs`, `run-detail`) đi cùng
 * màn của chúng ở đợt dọn prompt-first; `HAS_RAIL` cũng vậy — không màn nào còn rail.
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  SCREEN_EXPORT, SCREEN_LABEL, SCREEN_PATH,
  type LazyScreenId, type ScreenId,
} from "../screen-contract";
import { _registry } from "../command-registry";

const ROOT = resolve(new URL("../../../..", import.meta.url).pathname);

/** Bảng NGUYÊN VĂN. Sửa test này = đang đổi hợp đồng lazy-mount. */
const CONTRACT: Record<string, string> = {
  projects: "src/features/projects/ProjectsScreen.tsx",
  settings: "src/features/settings/SettingsScreen.tsx",
};

/** Ba id màn của app — `kit` KHÔNG lazy (route nạp tĩnh, props riêng). */
const SCREEN_IDS: ScreenId[] = ["projects", "kit", "settings"];

describe("bảng lazy-mount khớp hợp đồng", () => {
  it("đúng hai màn lazy, không thừa không thiếu", () => {
    expect(Object.keys(SCREEN_PATH).sort()).toEqual(Object.keys(CONTRACT).sort());
    expect(Object.keys(SCREEN_EXPORT).sort()).toEqual(Object.keys(CONTRACT).sort());
  });

  it.each(Object.entries(CONTRACT))("đường dẫn của %s đúng nguyên văn", (id, path) => {
    expect(SCREEN_PATH[id as LazyScreenId]).toBe(path);
  });

  it("tên export suy ra đúng từ tên file", () => {
    for (const [id, path] of Object.entries(CONTRACT)) {
      const fromPath = path.split("/").pop()!.replace(/\.tsx$/, "");
      expect(SCREEN_EXPORT[id as LazyScreenId]).toBe(fromPath);
    }
  });

  it("mọi màn có nhãn tiếng Việt (placeholder và <title> đều dùng)", () => {
    expect(Object.keys(SCREEN_LABEL).sort()).toEqual([...SCREEN_IDS].sort());
    for (const id of SCREEN_IDS) expect(SCREEN_LABEL[id]).toBeTruthy();
  });

  /**
   * Hợp đồng cho phép file VẮNG MẶT (đó là cả điểm của nó). Nhưng hai màn này là
   * đường vào duy nhất của app hôm nay — thiếu là app trắng, nên ở đây đòi có thật.
   */
  it("hai file màn lazy CÓ THẬT trên đĩa", () => {
    for (const path of Object.values(CONTRACT)) {
      expect(existsSync(resolve(ROOT, path)), `${path} phải tồn tại`).toBe(true);
    }
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
