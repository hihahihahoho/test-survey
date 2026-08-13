/**
 * Ca tối thiểu bắt buộc: allowlist TỪ CHỐI khoá lạ, schema strict LOẠI BỎ field lạ,
 * và persist middleware của zustand không đi được đường tắt quanh hai lớp đó.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LS_KEYS, StoreKeyError, _setBackend, allowedKeys, createPersistStorage,
  defaultsFor, isAllowedBaseUrl, isAllowedKey, memoryBackend, pickAllowed, storeGet, storePatch, storeSet,
} from "../persist";

let mem: ReturnType<typeof memoryBackend>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mem = memoryBackend();
  _setBackend(mem);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

/** Mọi thứ console.warn đã in ra, gộp thành một chuỗi — để soi "có lộ giá trị không". */
const warnText = () => warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");

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

describe("L3 — bộ dò secret chặn tại cửa ghi (FAIL-SOFT: chặn nhưng không làm vỡ UI)", () => {
  it("chặn PII mà KHÔNG ném, KHÔNG ghi, giá trị cũ còn nguyên", () => {
    expect(() =>
      storeSet(LS_KEYS.workspace, { label: "~/KitGen", fingerprint: "sha256:abcd", knownAt: "", workspaceId: "ws_1" }),
    ).not.toThrow();

    // `label` là path tuyệt đối chứa tên user ⇒ PII, phải chặn (arch §4.3-5).
    expect(() => storeSet(LS_KEYS.workspace, { label: "/Users/tungnt2/KitGen" })).not.toThrow();
    expect(warnText()).toContain("V-ABSPATH");
    // giá trị cũ vẫn nguyên, thao tác bị chặn không phá dữ liệu đang có
    expect(storeGet(LS_KEYS.workspace).label).toBe("~/KitGen");
  });

  it("secret lọt qua field hợp lệ về TÊN vẫn bị chặn bằng pattern GIÁ TRỊ", () => {
    const out = storeSet(LS_KEYS.setup, { agentVersionSeen: "sk-proj-AAAABBBBCCCCDDDDEEEE1234" });
    expect(out.agentVersionSeen).toBe(""); // không ghi ⇒ vẫn là mặc định
    expect(mem.dump()[LS_KEYS.setup]).toBeUndefined();
    expect(warnText()).toContain("V-SK");
  });

  it("KHÔNG BAO GIỜ log giá trị bị chặn, chỉ log luật + đường dẫn", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(() => storeSet(LS_KEYS.ui, { filterQuery: jwt })).not.toThrow();
    const text = warnText();
    expect(text).not.toContain(jwt);
    expect(text).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(text).toContain("V-JWT");
    expect(text).toContain("kitgen.ui.v1.filterQuery");
    expect(mem.dump()[LS_KEYS.ui]).toBeUndefined();
  });
});

/**
 * REGRESSION 2.1.17 — người dùng thật mở dự án thứ 4 thì app văng
 * `SecretLeakError … "kitgen.recent.v1.projectIds[3]" … V-ENTROPY`.
 * Project id do agent sinh là `<slug>-<4 hex>` (agent/lib/projects.mjs `newProjectId`),
 * slug lấy từ tên dự án ⇒ id dài, nhiều ký tự khác nhau ⇒ entropy >4.0. Đó là ID CÔNG
 * KHAI của app, không phải secret.
 */
describe("id do app sinh KHÔNG phải secret (regression 2.1.17)", () => {
  /** Đúng định dạng thật: slug tiếng Việt bỏ dấu + 4 hex, khớp RE_PROJECT_ID của agent. */
  const REAL_IDS = [
    "onboarding-illustration-set-2026-3b91",
    "vcb-look-back-2025-chuc-tet-2026-9f3a",
    "bo-nhan-dien-thuong-hieu-mua-he-1a2b",
    "chuoi-minh-hoa-du-an-fintech-quy-4-7c0d",
    "kit-tet-2026-4f7c",
  ];

  it("mọi id mẫu đều đủ dài + entropy cao — nếu không thì ca test này vô nghĩa", () => {
    const long = REAL_IDS.filter((id) => id.length >= 32);
    expect(long.length).toBeGreaterThanOrEqual(4);
  });

  it("ghi kitgen.recent.v1 với ≥4 projectIds thật → GHI ĐƯỢC, không ném, không cảnh báo", () => {
    expect(() =>
      storeSet(LS_KEYS.recent, { projectIds: REAL_IDS, lastOpenedId: REAL_IDS[0] }),
    ).not.toThrow();
    const onDisk = JSON.parse(mem.dump()[LS_KEYS.recent]!);
    expect(onDisk.projectIds).toEqual(REAL_IDS);
    expect(onDisk.lastOpenedId).toBe(REAL_IDS[0]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("id thật cũng đi lọt qua zustand persist (đúng đường mà bug đi)", () => {
    const storage = createPersistStorage(LS_KEYS.recent, 1);
    expect(() =>
      storage.setItem(LS_KEYS.recent, { state: { projectIds: REAL_IDS, lastOpenedId: REAL_IDS[3] }, version: 1 }),
    ).not.toThrow();
    expect(JSON.parse(mem.dump()[LS_KEYS.recent]!).projectIds).toHaveLength(5);
    expect(warn).not.toHaveBeenCalled();
  });

  it("cache danh sách dự án giữ được id + slug dài", () => {
    const out = storeSet(LS_KEYS.projectsCache, {
      fetchedAt: "2026-08-13T00:00:00.000Z",
      items: REAL_IDS.map((id) => ({ id, slug: id.replace(/-[0-9a-f]{4}$/, "") })),
    });
    expect(out.items.map((i) => i.id)).toEqual(REAL_IDS);
    expect(warn).not.toHaveBeenCalled();
  });

  it("TOKEN THẬT nằm ở chính field id vẫn BỊ CHẶN — miễn trừ chỉ dành cho hình dạng id", () => {
    const secrets = [
      "sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG1234",                                            // V-SK
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gF", // V-JWT
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",                                            // V-GHTOKEN
      "Xk29fLp84QmZa71RtVbNw35YcJd06HsE",                                                    // V-ENTROPY
      "dGhpc2lzYWxvbmdiYXNlNjRzdHJpbmd3aXRocGFkZGluZz09",                                     // base64 dài
    ];
    for (const s of secrets) {
      warn.mockClear();
      _setBackend(memoryBackend());
      const out = storeSet(LS_KEYS.recent, { projectIds: ["kit-tet-2026-4f7c", s] });
      expect(out.projectIds).not.toContain(s);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warnText()).not.toContain(s);
    }
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
  it("storeSet chặn baseUrl không hợp lệ — chặn kiểu fail-soft, không ghi", () => {
    expect(() => storeSet(LS_KEYS.agent, { baseUrl: "http://evil.example:8765" })).not.toThrow();
    expect(mem.dump()[LS_KEYS.agent]).toBeUndefined();
    expect(warnText()).toContain("kitgen.agent.v1.baseUrl");
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

  it("field lạ có TÊN nghi secret thì BỊ CHẶN + cảnh báo rõ, không lược bỏ im lặng", () => {
    // Lược bỏ im lặng cũng an toàn về mặt đĩa, nhưng người viết code sẽ không bao giờ
    // biết mình vừa suýt ghi token vào localStorage ⇒ phải có một dòng cảnh báo nêu luật.
    // Nhưng KHÔNG ném: `setItem` chạy ngay trong subscriber của zustand, ném ở đây là vỡ UI.
    expect(() => storage.setItem(LS_KEYS.ui, { state: { theme: "light", hackedToken: "x" }, version: 1 })).not.toThrow();
    expect(mem.dump()[LS_KEYS.ui]).toBeUndefined();
    expect(warnText()).toContain("F-TOKEN");
  });

  it("setItem với secret không ghi và không ném", () => {
    expect(() =>
      storage.setItem(LS_KEYS.ui, { state: { filterQuery: "Bearer abcdefghijklmnopqrstuvwx" }, version: 1 }),
    ).not.toThrow();
    expect(mem.dump()[LS_KEYS.ui]).toBeUndefined();
    expect(warnText()).toContain("V-BEARER");
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
