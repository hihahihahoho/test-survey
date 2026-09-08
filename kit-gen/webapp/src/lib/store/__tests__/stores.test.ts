/**
 * Kiểm END-TO-END rằng zustand persist THẬT (không phải mock) đi qua allowlist + sanitize:
 * đọc thẳng backend sau khi gọi action, xem đúng những gì rơi xuống đĩa.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { LS_KEYS, _setBackend, memoryBackend, storeGet } from "../persist";
import { useUiStore } from "../ui";
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
  recent: useRecentStore.getState(),
};

beforeEach(() => {
  mem = memoryBackend();
  _setBackend(mem);
  useUiStore.setState(initial.ui, true);
  useRecentStore.setState(initial.recent, true);
});

describe("useUiStore", () => {
  it("dark-mode first", () => {
    expect(useUiStore.getState().theme).toBe("dark");
  });

  it("chỉ ghi ra đĩa các field trong allowlist; KHÔNG ghi hàm action", () => {
    useUiStore.getState().setTheme("light");
    useUiStore.getState().setSort("name", "asc");
    const d = onDisk(LS_KEYS.ui)!;
    expect(d.theme).toBe("light");
    expect(d.sortBy).toBe("name");
    expect(d.sortDir).toBe("asc");
    for (const fn of ["setTheme", "toggleTheme", "setSort", "clearFilters"]) {
      expect(d, `hàm ${fn} không được ghi ra đĩa`).not.toHaveProperty(fn);
    }
  });

  /**
   * Đợt 2 gỡ 10 field của những màn không còn (`locale`, `density`, `sidebarWidth`,
   * `railCollapsed`, `projectsView`, `filterChip`, `collapsedSections`, `lastTab`,
   * `kitBackdrop`, `kitZoom`). Máy người dùng bản cũ VẪN CÒN chúng trong `kitgen.ui.v1`
   * — ca này khoá lại rằng bản mới đọc dữ liệu cũ thì lược bỏ phần thừa chứ không rơi
   * về mặc định, tức là không ai bị mất `theme` vì một lần cập nhật.
   */
  it("đọc được kitgen.ui.v1 của bản CŨ: bỏ field thừa, giữ tuỳ chọn hợp lệ", () => {
    /* `createPersistStorage` chỉ lưu phần `state` (không có vỏ `{state,version}`), nên
       bản CŨ trên máy người dùng có đúng hình dạng này. */
    mem.setItem(
      LS_KEYS.ui,
      JSON.stringify({ theme: "light", sortBy: "name", kitZoom: 150, railCollapsed: true, lastTab: { kit: "assets" } }),
    );
    const parsed = storeGet(LS_KEYS.ui);
    expect(parsed.theme).toBe("light");
    expect(parsed.sortBy).toBe("name");
    expect(parsed).not.toHaveProperty("kitZoom");
    expect(parsed).not.toHaveProperty("railCollapsed");
  });

  it("chỉ có ĐÚNG các khoá của arch §4.1 xuất hiện trên đĩa", () => {
    useUiStore.getState().setTheme("light");
    useRecentStore.getState().touch("tet26-a7f3");
    const allowed = new Set(Object.values(LS_KEYS));
    for (const k of Object.keys(mem.dump())) expect(allowed.has(k as never), `khoá lạ: ${k}`).toBe(true);
  });

  it("filter tag/query dùng lại được sau khi tải lại trang", () => {
    const s = useUiStore.getState();
    s.toggleFilterTag("tet");
    s.toggleFilterTag("banking");
    s.setFilterQuery("xuân");
    const d = onDisk(LS_KEYS.ui)!;
    expect(d.filterTags).toEqual(["tet", "banking"]);
    expect(d.filterQuery).toBe("xuân");
    useUiStore.getState().toggleFilterTag("tet");
    expect(useUiStore.getState().filterTags).toEqual(["banking"]);
  });

  it("clearFilters dọn cả tag lẫn ô tìm", () => {
    const s = useUiStore.getState();
    s.toggleFilterTag("a");
    s.setFilterQuery("q");
    useUiStore.getState().clearFilters();
    const st = useUiStore.getState();
    expect([st.filterTags, st.filterQuery]).toEqual([[], ""]);
  });
});

/* `usePrefsStore` và `useSetupStore` đã bị gỡ ở Đợt 2 (không còn màn nào đọc chúng);
   `kitgen.prefs.v1` / `kitgen.setup.v1` chỉ còn là KHOÁ CŨ trong allowlist để nút "Xoá
   dữ liệu trình duyệt" dọn được máy người dùng bản trước — xem persist.ts. */

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
