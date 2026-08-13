import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureIdb, IDB_STORES, idbGet, idbKeys, idbSet } from "../idb";
import { createFakeIdb } from "./fake-idb";

/**
 * arch §4.3 (danh sách đen) + §4.4 lớp 3: nội dung ghi vào `drafts`/`runlog`
 * PHẢI bị quét secret. Log của codex là nơi token dễ lọt nhất — agent đã redact,
 * đây là LỚP PHÒNG THỦ THỨ HAI.
 *
 * Những ca dưới đây là bằng chứng cho lời hứa "TUYỆT ĐỐI KHÔNG lưu secret ở
 * browser". Nếu ai đó gỡ `assertNoSecret` khỏi `idb.ts`, các ca này đỏ ngay.
 *
 * CÁCH CHẶN đã đổi (hotfix 2.1.17): trúng luật ⇒ trả `false` + cảnh báo đã che giá trị,
 * KHÔNG ném. `idbSet` là hàm `async` chạy trong timer tự lưu, nên ném ở đây là
 * unhandled rejection chứ không phải "báo cho chỗ gọi". Điều PHẢI giữ nguyên là:
 * không có gì bị ghi, và không dòng log nào chứa giá trị bị chặn.
 */
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  configureIdb(createFakeIdb());
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const warnText = () => warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");

describe("bộ dò secret chặn tại cửa IndexedDB", () => {
  it("token OpenAI trong dòng log ⇒ CHẶN (không ném), và KHÔNG có gì được ghi", async () => {
    const payload = {
      projectId: "p1",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-1", payload)).resolves.toBe(false);
    expect(await idbGet(IDB_STORES.runlog, "r-1")).toBeNull();
    expect(await idbKeys(IDB_STORES.runlog)).toHaveLength(0);
    expect(warnText()).toContain("idb.runlog");
  });

  it("JWT trong log ⇒ chặn", async () => {
    const payload = {
      projectId: "p1",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "Bearer eyJhbGciOi.eyJzdWIiOiIxMjM0NTY3ODkwIn0" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-2", payload)).resolves.toBe(false);
  });

  it("TÊN FIELD nghi secret cũng bị chặn, không chỉ giá trị", async () => {
    await expect(
      idbSet(IDB_STORES.drafts, "p1", { contract: {}, baseVersion: 1, accessToken: "gì đó" }),
    ).resolves.toBe(false);
    expect(warnText()).toContain("F-TOKEN");
  });

  it("đường dẫn tuyệt đối chứa tên user (PII, arch §4.3-5) bị chặn", async () => {
    const payload = {
      projectId: "p1",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "ghi vào /Users/tungnt2/KitGen/raw/a.png" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-3", payload)).resolves.toBe(false);
    expect(warnText()).toContain("V-ABSPATH");
  });

  it("DÒNG CẢNH BÁO không được tự làm rò thứ vừa chặn (bài học qa-security §2.2)", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const ok = await idbSet(IDB_STORES.runlog, "r-4", {
      projectId: "p", updatedAt: "x",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: secret }],
    });
    expect(ok).toBe(false);
    expect(warnText()).not.toContain(secret);
    expect(warnText()).toContain("V-SK");
  });

  it("log SẠCH thì ghi bình thường — bộ dò không được cản việc thật", async () => {
    const payload = {
      projectId: "p1",
      lines: [
        { seq: 1, t: "2026-08-06T12:00:00Z", job: "tet-main", level: "info", text: "dựng khung xương ✓" },
        { seq: 2, t: "2026-08-06T12:01:00Z", job: "tet-main", level: "info", text: "raw/tet-main.png 2.9 MB" },
      ],
      updatedAt: "2026-08-06T12:01:00Z",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-5", payload)).resolves.toBe(true);
    expect(await idbGet(IDB_STORES.runlog, "r-5")).toMatchObject({ projectId: "p1" });
  });

  it("nhãn workspace rút gọn `~/KitGen` là HỢP LỆ (không phải path thật)", async () => {
    const payload = {
      projectId: "p1", updatedAt: "x",
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "~/KitGen" }],
    };
    await expect(idbSet(IDB_STORES.runlog, "r-6", payload)).resolves.toBe(true);
  });
});

/**
 * Regression 2.1.17 (cùng luật V-ENTROPY đã làm vỡ `kitgen.recent.v1`): id do app sinh
 * dài + nhiều ký tự khác nhau nên entropy > 4.0, nhưng nó là ID CÔNG KHAI, không phải secret.
 */
describe("id do app sinh KHÔNG bị chặn ở cửa IndexedDB", () => {
  /** `<slug>-<4 hex>` đúng `newProjectId()` của agent; 37 ký tự, entropy 4.16. */
  const LONG_PROJECT_ID = "onboarding-illustration-set-2026-3b91";
  /** mã sheet do slugify tên sheet, tối đa 32 ký tự (`RE_SHEET_ID`). */
  const LONG_SHEET_ID = "nhan-vat-chinh-tu-the-dung-2026a";

  it("runlog của dự án có id dài vẫn ghi được", async () => {
    const payload = {
      projectId: LONG_PROJECT_ID,
      lines: [{ seq: 1, t: "2026-08-13T00:00:00Z", job: "tet-main", level: "info", text: "xong 12/12 ô" }],
      updatedAt: "2026-08-13T00:00:00Z",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-100", payload)).resolves.toBe(true);
    expect(await idbGet(IDB_STORES.runlog, "r-100")).toMatchObject({ projectId: LONG_PROJECT_ID });
    expect(warn).not.toHaveBeenCalled();
  });

  it("nháp editor giữ được contract có mã sheet / phong cách dài", async () => {
    const draft = {
      contract: {
        sheets: [{ id: LONG_SHEET_ID, grid: { cols: 4, rows: 3 }, cells: [] }],
        variants: [{ id: "phong-cach-tet-co-truyen-2026" }],
        characters: [{ id: "nhan-vat-chinh-mascot-vcb-2026a" }],
      },
      baseVersion: 3,
      dirtyFields: ["sheets"],
      savedAt: "2026-08-13T00:00:00Z",
    };
    await expect(idbSet(IDB_STORES.drafts, LONG_PROJECT_ID, draft)).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("TOKEN THẬT đặt vào chính field id vẫn BỊ CHẶN", async () => {
    const secrets = [
      "sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG1234",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gF",
      "Xk29fLp84QmZa71RtVbNw35YcJd06HsE",
    ];
    for (const s of secrets) {
      warn.mockClear();
      await expect(idbSet(IDB_STORES.runlog, "r-101", { projectId: s, lines: [], updatedAt: "x" })).resolves.toBe(false);
      expect(warnText()).not.toContain(s);
    }
    expect(await idbKeys(IDB_STORES.runlog)).toHaveLength(0);
  });

  it("miễn trừ KHÔNG lây sang dòng log — token trong `text` vẫn chặn dù projectId hợp lệ", async () => {
    const payload = {
      projectId: LONG_PROJECT_ID,
      lines: [{ seq: 1, t: "", job: null, level: "info", text: "sk-abcdefghijklmnopqrstuvwxyz123456" }],
      updatedAt: "x",
    };
    await expect(idbSet(IDB_STORES.runlog, "r-102", payload)).resolves.toBe(false);
    expect(warnText()).toContain("V-SK");
  });
});
