/**
 * Ca tối thiểu bắt buộc: allowlist TỪ CHỐI khoá lạ, schema strict LOẠI BỎ field lạ,
 * và persist middleware của zustand không đi được đường tắt quanh hai lớp đó.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LS_KEYS, SecretLeakError, StoreKeyError, _setBackend, allowedKeys, createPersistStorage,
  defaultsFor, isAllowedBaseUrl, isAllowedKey, memoryBackend, pickAllowed, storeGet, storePatch, storeSet,
} from "../persist";

let mem: ReturnType<typeof memoryBackend>;
beforeEach(() => {
  mem = memoryBackend();
  _setBackend(mem);
});

describe("L1 — allowlist khoá", () => {
  it("nhận đúng 9 khoá của arch §4.1, không hơn", () => {
    expect(allowedKeys().sort()).toEqual(
      [
        "kitgen.agent.v1", "kitgen.hints.v1", "kitgen.prefs.v1", "kitgen.projects.cache.v1",
        "kitgen.recent.v1", "kitgen.setup.v1", "kitgen.ui.v1", "kitgen.workspace.v1",
        // §cập-nhật: ý định cập nhật đang treo, sống đúng một nhịp reload.
        "kitgen.update.v1",
      ].sort(),
    );
  });

  const strangers = [
    "kitgen.tokens.v1",
    "kitgen.ui.v2",
    "ui",
    "kitgen.auth",
    "__proto__",
    "",
  ];
  for (const k of strangers) {
    it(`từ chối khoá lạ «${k}»`, () => {
      expect(isAllowedKey(k)).toBe(false);
      expect(() => storeSet(k as never, { a: 1 })).toThrow(StoreKeyError);
      expect(() => storeGet(k as never)).toThrow(StoreKeyError);
    });
  }

  it("khoá lạ KHÔNG để lại dấu vết nào trong backend", () => {
    try {
      storeSet("kitgen.tokens.v1" as never, { t: "x" });
    } catch {
      /* mong đợi */
    }
    expect(Object.keys(mem.dump())).toHaveLength(0);
  });
});

describe("L2 — schema strict loại bỏ field lạ", () => {
  it("ghi field lạ vô hại vào kitgen.ui.v1 thì field đó bị loại, phần hợp lệ vẫn ghi", () => {
    const out = storeSet(LS_KEYS.ui, { theme: "light", somethingNew: "xyz" });
    expect(out.theme).toBe("light");
    expect(out as Record<string, unknown>).not.toHaveProperty("somethingNew");
    expect(JSON.parse(mem.dump()[LS_KEYS.ui]!)).not.toHaveProperty("somethingNew");
  });

  it("giá trị sai kiểu → về mặc định, không ghi rác", () => {
    const out = storeSet(LS_KEYS.prefs, { maxJobs: "rất nhiều" });
    expect(out).toEqual(defaultsFor(LS_KEYS.prefs));
  });

  it("đọc khoá chưa có → mặc định đủ field", () => {
    const v = storeGet(LS_KEYS.prefs);
    expect(v.maxJobs).toBe(4);
    expect(v.autoSliceAfterGen).toBe(true); // chốt X9: bật mặc định
  });

  it("JSON hỏng trên đĩa không làm vỡ, trả mặc định", () => {
    mem.setItem(LS_KEYS.ui, "{không phải json");
    expect(storeGet(LS_KEYS.ui).theme).toBe("dark");
  });
});

describe("L3 — bộ dò secret chặn tại cửa ghi", () => {
  it("ném SecretLeakError và KHÔNG ghi gì cả", () => {
    expect(() =>
      storeSet(LS_KEYS.workspace, { label: "~/KitGen", fingerprint: "sha256:abcd", knownAt: "", workspaceId: "ws_1" }),
    ).not.toThrow();

    // `label` là path tuyệt đối chứa tên user ⇒ PII, phải chặn (arch §4.3-5).
    expect(() => storeSet(LS_KEYS.workspace, { label: "/Users/tungnt2/KitGen" })).toThrow(SecretLeakError);
    // giá trị cũ vẫn nguyên, thao tác bị chặn không phá dữ liệu đang có
    expect(storeGet(LS_KEYS.workspace).label).toBe("~/KitGen");
  });

  it("secret lọt qua field hợp lệ về TÊN vẫn bị chặn bằng pattern GIÁ TRỊ", () => {
    expect(() => storeSet(LS_KEYS.setup, { agentVersionSeen: "sk-proj-AAAABBBBCCCCDDDDEEEE1234" })).toThrow(
      SecretLeakError,
    );
  });
});

describe("L4 — baseUrl bị giới hạn (§6.5-3)", () => {
  it("nhận loopback đúng cổng ứng viên", () => {
    expect(isAllowedBaseUrl("http://127.0.0.1:8765")).toBe(true);
    expect(isAllowedBaseUrl("http://localhost:8767")).toBe(true);
  });
  it("từ chối host ngoài, cổng lạ, có path/query, có credential", () => {
    expect(isAllowedBaseUrl("http://evil.example:8765")).toBe(false);
    expect(isAllowedBaseUrl("http://127.0.0.1:8125")).toBe(false); // chốt X2: cấm 8125
    expect(isAllowedBaseUrl("http://127.0.0.1:8765/api")).toBe(false);
    expect(isAllowedBaseUrl("http://u:p@127.0.0.1:8765")).toBe(false);
    expect(isAllowedBaseUrl("not a url")).toBe(false);
  });
  it("storeSet chặn baseUrl không hợp lệ", () => {
    expect(() => storeSet(LS_KEYS.agent, { baseUrl: "http://evil.example:8765" })).toThrow(StoreKeyError);
  });
});

describe("createPersistStorage — zustand không đi được đường tắt", () => {
  const storage = createPersistStorage(LS_KEYS.ui, 1);

  it("setItem đi qua allowlist + schema; field lạ VÔ HẠI bị lược bỏ", () => {
    storage.setItem(LS_KEYS.ui, { state: { theme: "light", experimentalThing: "x" }, version: 1 });
    const onDisk = JSON.parse(mem.dump()[LS_KEYS.ui]!);
    expect(onDisk.theme).toBe("light");
    expect(onDisk).not.toHaveProperty("experimentalThing");
  });

  it("field lạ có TÊN nghi secret thì NÉM LỖI chứ không lược bỏ im lặng", () => {
    // Lược bỏ im lặng cũng an toàn về mặt đĩa, nhưng người viết code sẽ không bao giờ
    // biết mình vừa suýt ghi token vào localStorage. Brief đòi "ném lỗi rõ khi bị chặn".
    expect(() => storage.setItem(LS_KEYS.ui, { state: { theme: "light", hackedToken: "x" }, version: 1 })).toThrow(
      SecretLeakError,
    );
    expect(mem.dump()[LS_KEYS.ui]).toBeUndefined();
  });

  it("setItem với secret ném lỗi, không ghi", () => {
    expect(() =>
      storage.setItem(LS_KEYS.ui, { state: { filterQuery: "Bearer abcdefghijklmnopqrstuvwx" }, version: 1 }),
    ).toThrow(SecretLeakError);
  });

  it("từ chối ghi sang khoá khác với khoá đã khai", () => {
    expect(() => storage.setItem(LS_KEYS.prefs, { state: {}, version: 1 })).toThrow(StoreKeyError);
  });

  it("getItem trả về vỏ {state, version} mà zustand mong đợi", () => {
    storage.setItem(LS_KEYS.ui, { state: { theme: "light" }, version: 1 });
    const got = storage.getItem(LS_KEYS.ui);
    expect(got?.version).toBe(1);
    expect((got?.state as { theme: string }).theme).toBe("light");
  });
});

describe("pickAllowed — partialize theo allowlist FIELD", () => {
  it("chỉ giữ field được liệt kê, bỏ mọi thứ khác (kể cả field mới thêm)", () => {
    const state = { theme: "dark", railCollapsed: false, authToken: "x", setTheme: () => {} };
    const out = pickAllowed(state, ["theme", "railCollapsed"] as const);
    expect(out).toEqual({ theme: "dark", railCollapsed: false });
    expect(out).not.toHaveProperty("authToken");
    expect(out).not.toHaveProperty("setTheme");
  });
});

describe("storePatch", () => {
  it("merge chứ không ghi đè toàn bộ", () => {
    storeSet(LS_KEYS.prefs, { maxJobs: 6, autoSliceAfterGen: false });
    storePatch(LS_KEYS.prefs, { logTail: 500 });
    const v = storeGet(LS_KEYS.prefs);
    expect(v.maxJobs).toBe(6);
    expect(v.autoSliceAfterGen).toBe(false);
    expect(v.logTail).toBe(500);
  });
});
