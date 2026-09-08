/**
 * Tuỳ chọn người dùng phải SỐNG TRÊN ĐĨA, không sống trong trình duyệt.
 *
 * Ca ở đây kiểm đúng cái đã hỏng trong sự cố Cmd+F5: mở lại app với localStorage TRỐNG
 * TRƠN (trình duyệt khác, đường vào khác, vừa xoá dữ liệu duyệt web) thì tuỳ chọn vẫn
 * phải quay về đúng như cũ — miễn là đọc được `<workspace>/.kitgen/config.json`.
 *
 * Chạy trong `node`, KHÔNG jsdom: `_setBackend(memoryBackend())` thay hẳn cửa localStorage
 * nên thứ đang kiểm là LOGIC đồng bộ, không phải hành vi của một trình duyệt cụ thể.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISK_UI_FIELDS, defaultDiskSettings, diffDiskSettings,
  diskSettingsOf, diskSettingsResponseSchema, diskSettingsSchema, type DiskSettings,
} from "../disk-settings";
import { applyDiskSettings, currentDiskSettings, settingsDirection } from "../settings-sync";
import { LS_KEYS, _setBackend, defaultsFor, memoryBackend } from "../persist";
import { useUiStore } from "../ui";

beforeEach(() => {
  _setBackend(memoryBackend());
  useUiStore.setState(defaultsFor(LS_KEYS.ui));
});

describe("phạm vi — cái gì lên đĩa, cái gì ở lại trình duyệt", () => {
  it("chữ NGƯỜI DÙNG GÕ không bao giờ lên đĩa", () => {
    /* Hợp đồng bảo mật của `/api/settings`: chỉ enum · boolean · số · mã do app sinh.
       `filterQuery`/`filterTags` là chuỗi tự do ⇒ đúng đường mà một token dán nhầm sẽ đi
       vào file cấu hình. Ca này là cái chốt cửa: thêm chúng vào danh sách là test đỏ. */
    expect(DISK_UI_FIELDS).not.toContain("filterQuery");
    expect(DISK_UI_FIELDS).not.toContain("filterTags");
  });

  it("mọi field lên đĩa đều có thật trong schema localStorage (không có field ma)", () => {
    const ui = Object.keys(defaultsFor(LS_KEYS.ui));
    for (const f of DISK_UI_FIELDS) expect(ui).toContain(f);
  });

  /* Đợt 2 bỏ hẳn khối `prefs` khỏi hợp đồng đồng bộ: `maxJobs`/`autoSliceAfterGen` nay
     là hằng số trong `lib/hooks/use-generate-run.ts`, ba field còn lại thuộc màn đã gỡ.
     Không còn tuỳ chọn nào thuộc nhóm đó thì web không được ghi vào nhóm đó nữa. */
  it("khối `prefs` KHÔNG còn trong hợp đồng đồng bộ", () => {
    expect(defaultDiskSettings()).not.toHaveProperty("prefs");
  });

  it("mặc định hai bên KHỚP nhau — người chưa chỉnh gì thì đồng bộ không đổi gì", () => {
    expect(defaultDiskSettings()).toEqual(currentDiskSettings());
    expect(diffDiskSettings(defaultDiskSettings(), currentDiskSettings())).toBeNull();
  });
});

describe("đĩa → RAM (khôi phục sau Cmd+F5)", () => {
  it("localStorage TRỐNG vẫn khôi phục đủ tuỳ chọn từ đĩa", () => {
    const mem = memoryBackend();
    _setBackend(mem);
    expect(useUiStore.getState().theme).toBe("dark"); // kho trình duyệt rỗng ⇒ mặc định

    applyDiskSettings(diskSettingsSchema.parse({
      ui: { theme: "light", sortBy: "name", sortDir: "asc" },
    }));

    expect(useUiStore.getState().theme).toBe("light");
    expect(useUiStore.getState().sortBy).toBe("name");
    expect(useUiStore.getState().sortDir).toBe("asc");
  });

  it("khôi phục xong thì localStorage được HÂM NÓNG (lần mở sau vẽ ngay, không chờ mạng)", () => {
    const mem = memoryBackend();
    _setBackend(mem);
    applyDiskSettings(diskSettingsSchema.parse({ ui: { theme: "light", sortBy: "name" } }));
    const dump = mem.dump();
    expect(JSON.parse(dump[LS_KEYS.ui]!).theme).toBe("light");
    expect(JSON.parse(dump[LS_KEYS.ui]!).sortBy).toBe("name");
  });

  it("KHÔNG đụng tới field ở lại trình duyệt", () => {
    useUiStore.setState({ filterQuery: "vcb tết", filterTags: ["tet26"] });
    applyDiskSettings(diskSettingsSchema.parse({ ui: { theme: "light" } }));
    expect(useUiStore.getState().filterQuery).toBe("vcb tết");
    expect(useUiStore.getState().filterTags).toEqual(["tet26"]);
  });

  it("agent bản MỚI thêm field lạ ⇒ bundle CŨ lược bỏ chứ không vỡ", () => {
    const parsed = diskSettingsSchema.parse({
      ui: { theme: "light", futureThing: "???" },
      futureGroup: { a: 1 },
    });
    expect(parsed.ui.theme).toBe("light");
    expect(parsed.ui).not.toHaveProperty("futureThing");
    expect(parsed).not.toHaveProperty("futureGroup");
  });

  /* Chiều ngược lại của cùng một luật khoan dung: agent CŨ vẫn ghi khối `prefs` trong
     `config.json`. Web mới đọc phải LƯỢC BỎ nó, không được vỡ vì nó. */
  it("agent CŨ còn trả khối `prefs` ⇒ lược bỏ, không vỡ", () => {
    const parsed = diskSettingsSchema.parse({ ui: { theme: "light" }, prefs: { maxJobs: 3 } });
    expect(parsed.ui.theme).toBe("light");
    expect(parsed).not.toHaveProperty("prefs");
  });

  it("agent trả rỗng ⇒ mặc định đầy đủ, không undefined lọt vào store", () => {
    const parsed = diskSettingsSchema.parse({});
    expect(parsed).toEqual(defaultDiskSettings());
    applyDiskSettings(parsed);
    for (const f of DISK_UI_FIELDS) expect(useUiStore.getState()[f]).toBeDefined();
  });
});

/**
 * HỒI QUY 2.1.23 — ca này chặn một lỗi ĐÃ XẢY RA THẬT, bắt được ở e2e
 * `shell-smoke.spec.ts:683`: người dùng để chủ đề SÁNG, mở app sau khi cập nhật thì
 * `<html>` nhảy về `dark`.
 *
 * Gốc: mọi workspace đang tồn tại đều chưa có khối `ui`/`prefs` trong config.json, nên
 * `GET /api/settings` trả về MẶC ĐỊNH. Bản đầu coi đó là sự thật trên đĩa và áp thẳng
 * xuống RAM ⇒ xoá sạch tuỳ chọn thật của người dùng. Đúng loại "tự nhiên mất settings"
 * mà cả thay đổi này sinh ra để chặn — và nó sẽ xảy ra với MỌI người dùng, đúng một lần.
 */
describe("nhận nuôi lần đầu — đĩa chưa có gì thì KHÔNG được ghi đè lên người dùng", () => {
  it("configured:false ⇒ giữ bản của người dùng (adopt), true ⇒ đĩa thắng (apply)", () => {
    expect(settingsDirection(false)).toBe("adopt");
    expect(settingsDirection(true)).toBe("apply");
  });

  it("agent CŨ không trả `configured` ⇒ ngả về phía AN TOÀN (giữ bản người dùng)", () => {
    const parsed = diskSettingsResponseSchema.parse({ settings: { ui: { theme: "dark" } } });
    expect(parsed.configured).toBe(false);
    expect(settingsDirection(parsed.configured)).toBe("adopt");
  });

  it("chủ đề SÁNG của người dùng KHÔNG bị mặc định của đĩa nuốt mất", () => {
    // localStorage của người dùng: sáng. Đĩa: chưa có gì ⇒ trả mặc định (tối).
    useUiStore.setState({ theme: "light" });
    const fromDisk = diskSettingsResponseSchema.parse({ configured: false });
    expect(fromDisk.settings.ui.theme).toBe("dark");

    // Nhánh nhận nuôi: KHÔNG áp gì xuống RAM…
    expect(settingsDirection(fromDisk.configured)).toBe("adopt");
    expect(useUiStore.getState().theme).toBe("light");

    // …và đẩy NGƯỢC đúng phần người dùng đang khác mặc định lên đĩa.
    expect(diffDiskSettings(fromDisk.settings, currentDiskSettings())).toEqual({ ui: { theme: "light" } });
  });

  it("đã cấu hình rồi thì đĩa THẮNG — không quay lại nuốt bản đĩa bằng bản RAM", () => {
    useUiStore.setState({ theme: "light" });
    const fromDisk = diskSettingsResponseSchema.parse({ configured: true, settings: { ui: { theme: "dark" } } });
    expect(settingsDirection(fromDisk.configured)).toBe("apply");
    applyDiskSettings(fromDisk.settings);
    expect(useUiStore.getState().theme).toBe("dark");
    expect(diffDiskSettings(fromDisk.settings, currentDiskSettings())).toBeNull();
  });

  it("người dùng đang đúng bằng mặc định ⇒ không có gì để cứu, không ghi thừa", () => {
    const fromDisk = diskSettingsResponseSchema.parse({ configured: false });
    expect(diffDiskSettings(fromDisk.settings, currentDiskSettings())).toBeNull();
  });

  it("`SettingsSync` thật sự rẽ nhánh theo `configured`, và chặn vòng lặp ghi↔nạp", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../settings-sync.ts", import.meta.url), "utf8"));
    const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(body).toContain('settingsDirection(q.data.configured) === "apply"');
    expect(body).toContain("if (adoptedRef.current) return");
  });
});

describe("RAM → đĩa (chỉ gửi thứ đã đổi)", () => {
  const server = (): DiskSettings => defaultDiskSettings();

  it("không đổi gì ⇒ KHÔNG ghi", () => {
    expect(diffDiskSettings(server(), currentDiskSettings())).toBeNull();
  });

  it("đổi một field ⇒ patch chỉ chứa field đó", () => {
    useUiStore.getState().setTheme("light");
    expect(diffDiskSettings(server(), currentDiskSettings())).toEqual({ ui: { theme: "light" } });
  });

  it("đổi hai field ⇒ patch có cả hai, và không kèm field không đổi", () => {
    useUiStore.getState().setTheme("light");
    useUiStore.getState().setSort("name", "asc");
    const patch = diffDiskSettings(server(), currentDiskSettings());
    expect(patch).toEqual({ ui: { theme: "light", sortBy: "name", sortDir: "asc" } });
  });

  /* So bằng NỘI DUNG chứ không bằng tham chiếu: hôm nay ba field lên đĩa đều là enum nên
     `===` cũng đủ, nhưng một field mảng/bảng thêm vào ngày mai mà so bằng tham chiếu thì
     mỗi lần `setState` dựng object mới là một lần ghi file thừa. */
  it("object mới cùng nội dung KHÔNG sinh lần ghi thừa", () => {
    const sameContent: DiskSettings = { ui: { ...server().ui } };
    expect(diffDiskSettings(server(), sameContent)).toBeNull();
  });

  it("đổi field Ở LẠI trình duyệt KHÔNG sinh lần ghi đĩa nào", () => {
    useUiStore.getState().setFilterQuery("tìm gì đó");
    useUiStore.getState().toggleFilterTag("tet26");
    expect(diffDiskSettings(server(), currentDiskSettings())).toBeNull();
  });

  it("áp bản agent trả về xuống RAM ⇒ vòng so kế tiếp IM (không giằng co)", () => {
    // Người dùng đổi thứ tự, agent ghi rồi trả lại bản của nó; áp bản đó về RAM thì vòng
    // so kế tiếp phải im — nếu không, hai bên sẽ ghi qua ghi lại vô hạn.
    useUiStore.getState().setSort("size", "asc");
    const afterServer = diskSettingsSchema.parse({ ui: { sortBy: "size", sortDir: "asc" } });
    applyDiskSettings(afterServer);
    expect(diffDiskSettings(afterServer, currentDiskSettings())).toBeNull();
  });
});

describe("diskSettingsOf — cắt đúng lát", () => {
  it("chỉ lấy field trong danh sách, không hơn không kém", () => {
    const s = diskSettingsOf(defaultsFor(LS_KEYS.ui));
    expect(Object.keys(s.ui).sort()).toEqual([...DISK_UI_FIELDS].sort());
  });

  it("không giữ tham chiếu tới hàm action của store (chỉ dữ liệu mới ra khỏi RAM)", () => {
    const s = currentDiskSettings();
    for (const v of Object.values(s.ui)) {
      expect(typeof v).not.toBe("function");
    }
  });
});

describe("hợp đồng ghi — chưa đọc được đĩa thì chưa được ghi", () => {
  /**
   * Đây là ca chống mất dữ liệu QUAN TRỌNG NHẤT của cả cây cầu. Nếu vòng RAM→đĩa chạy
   * trước khi biết trên đĩa đang có gì, một localStorage rỗng (máy mới, vừa xoá dữ liệu
   * duyệt web) sẽ ghi TOÀN BỘ giá trị mặc định đè lên tuỳ chọn thật của người dùng —
   * đúng kiểu mất dữ liệu mà cả thay đổi này sinh ra để chặn.
   */
  it("mã nguồn `SettingsSync` thoát ra khi chưa có bản đĩa", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../settings-sync.ts", import.meta.url), "utf8"));
    const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(body).toContain("if (server === null) return");
    expect(body).toContain("serverRef.current = q.data");
  });

  it("nhịp gom ghi ở cùng bậc với hai đường ghi đĩa còn lại (không dội file)", async () => {
    const { SETTINGS_SAVE_DELAY_MS } = await import("../settings-sync");
    expect(SETTINGS_SAVE_DELAY_MS).toBeGreaterThanOrEqual(300);
    expect(SETTINGS_SAVE_DELAY_MS).toBeLessThanOrEqual(2000);
  });
});

describe("gom nhịp — bấm liên tiếp không sinh một lần ghi mỗi bước", () => {
  it("8 lần set liên tiếp chỉ còn MỘT lần gọi mạng", () => {
    vi.useFakeTimers();
    const calls: unknown[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const base = defaultDiskSettings();
    /* Mô phỏng đúng vòng lặp của `SettingsSync` (subscribe → debounce → gửi patch);
       component thật cần React nên ở đây kiểm phần LOGIC mà nó chạy. */
    const push = () => {
      if (diffDiskSettings(base, currentDiskSettings()) === null) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => calls.push(diffDiskSettings(base, currentDiskSettings())), 600);
    };
    const off = useUiStore.subscribe(push);
    const seq = ["name", "size", "created", "name", "size", "created", "name", "size"] as const;
    for (const by of seq) useUiStore.getState().setSort(by);
    vi.advanceTimersByTime(600);
    off();
    vi.useRealTimers();
    expect(calls).toEqual([{ ui: { sortBy: "size" } }]);
  });
});
