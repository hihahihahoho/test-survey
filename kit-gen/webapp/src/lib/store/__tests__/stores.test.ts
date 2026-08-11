/**
 * Kiểm END-TO-END rằng zustand persist THẬT (không phải mock) đi qua allowlist + sanitize:
 * đọc thẳng backend sau khi gọi action, xem đúng những gì rơi xuống đĩa.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LS_KEYS, _setBackend, memoryBackend } from "../persist";
import { useUiStore } from "../ui";
import { usePrefsStore } from "../prefs";
import { useSetupStore } from "../setup";
import { useRecentStore } from "../recent";

let mem: ReturnType<typeof memoryBackend>;
const onDisk = (key: string) => {
  const raw = mem.dump()[key];
  return raw ? JSON.parse(raw) : null;
};

/**
 * Store zustand là singleton cấp module: state SỐNG QUA các ca test trong cùng file.
 * Không reset thì ca sau kế thừa dữ liệu ca trước và kết quả phụ thuộc thứ tự chạy —
 * đúng kiểu test "xanh giả" mà INTEGRATION.md đã phàn nàn. Chụp state ban đầu một lần
 * rồi khôi phục trước mỗi ca.
 */
const initial = {
  ui: useUiStore.getState(),
  prefs: usePrefsStore.getState(),
  setup: useSetupStore.getState(),
  recent: useRecentStore.getState(),
};

beforeEach(() => {
  mem = memoryBackend();
  _setBackend(mem);
  useUiStore.setState(initial.ui, true);
  usePrefsStore.setState(initial.prefs, true);
  useSetupStore.setState(initial.setup, true);
  useRecentStore.setState(initial.recent, true);
});

describe("useUiStore", () => {
  it("dark-mode first", () => {
    expect(useUiStore.getState().theme).toBe("dark");
  });

  it("chỉ ghi ra đĩa các field trong allowlist; KHÔNG ghi hàm action", () => {
    useUiStore.getState().setTheme("light");
    useUiStore.getState().setProjectsView("list");
    const d = onDisk(LS_KEYS.ui)!;
    expect(d.theme).toBe("light");
    expect(d.projectsView).toBe("list");
    for (const fn of ["setTheme", "toggleTheme", "setSort", "clearFilters"]) {
      expect(d, `hàm ${fn} không được ghi ra đĩa`).not.toHaveProperty(fn);
    }
  });

  it("chỉ có ĐÚNG các khoá của arch §4.1 xuất hiện trên đĩa", () => {
    useUiStore.getState().setTheme("light");
    usePrefsStore.getState().setMaxJobs(6);
    useRecentStore.getState().touch("tet26-a7f3");
    const allowed = new Set(Object.values(LS_KEYS));
    for (const k of Object.keys(mem.dump())) expect(allowed.has(k as never), `khoá lạ: ${k}`).toBe(true);
  });

  it("giới hạn giá trị số để dữ liệu hỏng không phá layout", () => {
    useUiStore.getState().setSidebarWidth(9999);
    expect(useUiStore.getState().sidebarWidth).toBe(480);
    useUiStore.getState().setKitZoom(0);
    expect(useUiStore.getState().kitZoom).toBe(25);
  });

  it("filter chip/tag/query dùng lại được sau khi tải lại trang", () => {
    const s = useUiStore.getState();
    s.setFilterChip("need-gen");
    s.toggleFilterTag("tet");
    s.toggleFilterTag("banking");
    s.setFilterQuery("xuân");
    const d = onDisk(LS_KEYS.ui)!;
    expect(d.filterChip).toBe("need-gen");
    expect(d.filterTags).toEqual(["tet", "banking"]);
    expect(d.filterQuery).toBe("xuân");
    useUiStore.getState().toggleFilterTag("tet");
    expect(useUiStore.getState().filterTags).toEqual(["banking"]);
  });

  it("clearFilters dọn cả 3 loại bộ lọc", () => {
    const s = useUiStore.getState();
    s.setFilterChip("failed");
    s.toggleFilterTag("a");
    s.setFilterQuery("q");
    useUiStore.getState().clearFilters();
    const st = useUiStore.getState();
    expect([st.filterChip, st.filterTags, st.filterQuery]).toEqual(["all", [], ""]);
  });
});

describe("usePrefsStore — giá trị đi thẳng vào payload #32", () => {
  it("autoSliceAfterGen BẬT mặc định (chốt X9)", () => {
    expect(usePrefsStore.getState().autoSliceAfterGen).toBe(true);
  });
  it("maxJobs mặc định 4 (arch R3) và bị kẹp trong 1..8", () => {
    expect(usePrefsStore.getState().maxJobs).toBe(4);
    usePrefsStore.getState().setMaxJobs(99);
    expect(usePrefsStore.getState().maxJobs).toBe(8);
    usePrefsStore.getState().setMaxJobs(0);
    expect(usePrefsStore.getState().maxJobs).toBe(1);
  });
});

describe("useSetupStore — chỉ lưu enum và cờ, không lưu gì của auth.json", () => {
  it("đi hết wizard 4 bước", () => {
    const s = useSetupStore.getState();
    expect(s.step).toBe("download");
    s.next();
    expect(useSetupStore.getState().step).toBe("run");
    useSetupStore.getState().markConnected({ version: "1.2.0", protocol: 1 });
    expect(useSetupStore.getState().step).toBe("imagegen");
    useSetupStore.getState().complete();
    expect(useSetupStore.getState().completed).toBe(true);
  });

  it("next/back không vượt ra ngoài dải bước", () => {
    useSetupStore.getState().setStep("done");
    useSetupStore.getState().next();
    expect(useSetupStore.getState().step).toBe("done");
    useSetupStore.getState().setStep("download");
    useSetupStore.getState().back();
    expect(useSetupStore.getState().step).toBe("download");
  });

  it("trên đĩa chỉ có enum/cờ/nhãn phiên bản — không có token, không có path", () => {
    useSetupStore.getState().markConnected({ version: "1.2.0", protocol: 1 });
    useSetupStore.getState().markImageGen("img-home");
    const d = onDisk(LS_KEYS.setup)!;
    expect(Object.keys(d).sort()).toEqual(
      ["agentVersionSeen", "checkedAt", "completed", "imageGenMode", "protocolSeen", "step"].sort(),
    );
    expect(JSON.stringify(d)).not.toMatch(/\/Users\/|sk-|eyJ|Bearer/);
  });

  it("[Chạy lại hướng dẫn cài] đưa về bước đầu", () => {
    useSetupStore.getState().complete();
    useSetupStore.getState().restart();
    expect(useSetupStore.getState().completed).toBe(false);
    expect(useSetupStore.getState().step).toBe("download");
  });
});

describe("useRecentStore — 10 project gần nhất (đóng J5)", () => {
  it("đưa project vừa mở lên đầu, không lặp", () => {
    const s = useRecentStore.getState();
    s.touch("a");
    s.touch("b");
    s.touch("a");
    expect(useRecentStore.getState().projectIds).toEqual(["a", "b"]);
    expect(useRecentStore.getState().lastOpenedId).toBe("a");
  });

  it("giữ tối đa 10", () => {
    for (let i = 0; i < 15; i += 1) useRecentStore.getState().touch(`p${i}`);
    expect(useRecentStore.getState().projectIds).toHaveLength(10);
    expect(useRecentStore.getState().projectIds[0]).toBe("p14");
  });

  it("xoá project thì quên luôn khỏi 'gần đây'", () => {
    const s = useRecentStore.getState();
    s.touch("a");
    s.touch("b");
    useRecentStore.getState().forget("b");
    expect(useRecentStore.getState().projectIds).toEqual(["a"]);
    expect(useRecentStore.getState().lastOpenedId).toBe("");
  });
});
