import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureIdb, IDB_STORES, idbGet, idbKeys, idbPrune, idbSet, IdbStoreError } from "../idb";
import { dropDraft, isDraftStale, readDraft, writeDraft } from "../drafts";
import {
  _resetDraftSessions, clearDraftSession, dismissFoundDraft, draftState,
  scheduleDraftWrite, subscribeDraft,
} from "../draft-session";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import type { Contract } from "@/lib/types";

const sheet = (id: string, n: number) => ({
  id,
  grid: { cols: n, rows: 1 },
  components: Array.from({ length: n }, (_, i) => ({
    file: `0${i + 1}-e`, vi: "e", spec: "", skel: { shape: "rect", w: 0.8, h: 0.6 },
  })),
});

const mk = (n = 1): Contract =>
  ({ schemaVersion: 4, sheets: [sheet("main", n)], variants: [], characterPoses: [] }) as unknown as Contract;

let fake: FakeIdb;

beforeEach(() => {
  fake = createFakeIdb();
  configureIdb(fake);
  _resetDraftSessions();
});

/** Chờ hàng microtask của IDB giả xả hết. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("cổng IndexedDB — allowlist store (arch §4.2)", () => {
  it("store lạ ⇒ ném IdbStoreError, không có đường ghi lén", async () => {
    await expect(idbSet("evil" as never, "k", { a: 1 })).rejects.toBeInstanceOf(IdbStoreError);
    await expect(idbGet("evil" as never, "k")).rejects.toBeInstanceOf(IdbStoreError);
  });

  it("đúng 3 store của arch §4.2, không hơn", () => {
    expect(Object.values(IDB_STORES).sort()).toEqual(["drafts", "runlog", "thumbs"]);
  });

  it("ghi rồi đọc lại được", async () => {
    await idbSet(IDB_STORES.runlog, "r-1", { projectId: "p", lines: [], updatedAt: "x" });
    expect(await idbGet(IDB_STORES.runlog, "r-1")).toMatchObject({ projectId: "p" });
  });

  it("QuotaExceeded ⇒ dọn rồi thử lại, KHÔNG ném ra UI", async () => {
    for (let i = 0; i < 25; i += 1) {
      await idbSet(IDB_STORES.runlog, `r-${String(i).padStart(3, "0")}`, { projectId: "p", lines: [], updatedAt: "x" });
    }
    fake._failQuotaOn(IDB_STORES.runlog);
    // Lần put nào cũng hỏng ⇒ trả false (tắt cache), KHÔNG ném.
    await expect(idbSet(IDB_STORES.runlog, "r-999", { projectId: "p", lines: [], updatedAt: "x" })).resolves.toBe(false);
  });

  it("prune giữ 20 run gần nhất (arch §4.2)", async () => {
    for (let i = 0; i < 26; i += 1) {
      await idbSet(IDB_STORES.runlog, `r-${String(i).padStart(3, "0")}`, { projectId: "p", lines: [], updatedAt: "x" });
    }
    await idbPrune(IDB_STORES.runlog);
    expect((await idbKeys(IDB_STORES.runlog)).length).toBe(20);
  });

  it("prune KHÔNG BAO GIỜ đụng vào `drafts` — nháp là thứ duy nhất không tái tạo được", async () => {
    for (let i = 0; i < 30; i += 1) await writeDraft(`p${i}`, { contract: mk(), baseVersion: 1, dirtyFields: [] });
    await idbPrune(IDB_STORES.drafts);
    expect((await idbKeys(IDB_STORES.drafts)).length).toBe(30);
  });

  it("không có IndexedDB (Safari private) ⇒ trả rỗng, KHÔNG vỡ", async () => {
    configureIdb(null as never);
    // `configureIdb(null)` = dùng của trình duyệt; trong Node thì không có ⇒ available false
    expect(await idbGet(IDB_STORES.drafts, "x")).toBeNull();
    expect(await idbSet(IDB_STORES.drafts, "x", { a: 1 })).toBe(false);
  });
});

describe("nháp — đọc/ghi/xoá", () => {
  it("ghi rồi đọc lại đúng contract + baseVersion", async () => {
    await writeDraft("p1", { contract: mk(2), baseVersion: 37, dirtyFields: ["Bỏ 1 element"] });
    const rec = await readDraft("p1");
    expect(rec?.baseVersion).toBe(37);
    expect(rec?.contract.sheets[0]!.components).toHaveLength(2);
    expect(rec?.savedAt).not.toBe("");
  });

  it("nháp LỆCH SCHEMA ⇒ coi như không có, KHÔNG ném rác vào editor", async () => {
    await idbSet(IDB_STORES.drafts, "p2", { contract: { sheets: "không phải mảng" }, baseVersion: 1 });
    expect(await readDraft("p2")).toBeNull();
  });

  it("không có nháp ⇒ null", async () => {
    expect(await readDraft("chưa-có")).toBeNull();
  });

  it("dropDraft xoá thật", async () => {
    await writeDraft("p3", { contract: mk(), baseVersion: 1, dirtyFields: [] });
    await dropDraft("p3");
    expect(await readDraft("p3")).toBeNull();
  });

  it("isDraftStale phát hiện nháp CŨ HƠN bản trên đĩa — ca dễ mất công người khác", () => {
    expect(isDraftStale({ baseVersion: 37 }, 38)).toBe(true);
    expect(isDraftStale({ baseVersion: 37 }, 37)).toBe(false);
    expect(isDraftStale({ baseVersion: 38 }, 37)).toBe(false);
  });
});

describe("phiên nháp — MỘT người ghi duy nhất", () => {
  it("hai subscriber cùng project chỉ quét IDB MỘT lần, và thấy CÙNG trạng thái", async () => {
    await writeDraft("p1", { contract: mk(2), baseVersion: 1, dirtyFields: [] });

    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeDraft("p1", a, mk(1));
    const offB = subscribeDraft("p1", b, mk(1));
    await tick();

    expect(draftState("p1").found).not.toBeNull();
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    offA();
    offB();
  });

  it("nháp TRÙNG KHÍT bản trên đĩa ⇒ tự dọn, KHÔNG hỏi user câu vô nghĩa", async () => {
    const same = mk(2);
    await writeDraft("p2", { contract: same, baseVersion: 1, dirtyFields: [] });

    const off = subscribeDraft("p2", () => {}, same);
    await tick();
    expect(draftState("p2").found).toBeNull();
    expect(draftState("p2").scanned).toBe(true);
    off();
  });

  it("[Bỏ nháp] xoá cả trên đĩa và làm MỌI subscriber cùng thấy", async () => {
    await writeDraft("p3", { contract: mk(2), baseVersion: 1, dirtyFields: [] });
    const seen: unknown[] = [];
    const off = subscribeDraft("p3", (s) => seen.push(s.found), mk(1));
    await tick();
    expect(draftState("p3").found).not.toBeNull();

    clearDraftSession("p3");
    await tick();
    expect(draftState("p3").found).toBeNull();
    expect(await readDraft("p3")).toBeNull();
    off();
  });

  it("[Khôi phục] chỉ tắt câu hỏi, GIỮ nháp trên đĩa (phòng tab chết ngay sau đó)", async () => {
    await writeDraft("p4", { contract: mk(2), baseVersion: 1, dirtyFields: [] });
    const off = subscribeDraft("p4", () => {}, mk(1));
    await tick();

    dismissFoundDraft("p4");
    expect(draftState("p4").found).toBeNull();
    expect(await readDraft("p4")).not.toBeNull(); // vẫn còn trên đĩa
    off();
  });

  it("chỉ MỘT timer cho mỗi project dù gọi schedule nhiều lần", async () => {
    vi.useFakeTimers();
    const off = subscribeDraft("p5", () => {}, null);
    const c = mk(3);
    scheduleDraftWrite("p5", { contract: c, dirty: true, baseVersion: 1 });
    scheduleDraftWrite("p5", { contract: c, dirty: true, baseVersion: 1 });
    scheduleDraftWrite("p5", { contract: c, dirty: true, baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    await tick();

    const rec = await readDraft("p5");
    expect(rec?.contract.sheets[0]!.components).toHaveLength(3);
    off();
  });

  it("SẠCH thì KHÔNG ghi nháp — không tạo nháp vô nghĩa để hỏi ở lần mở sau", async () => {
    vi.useFakeTimers();
    const off = subscribeDraft("p6", () => {}, null);
    scheduleDraftWrite("p6", { contract: mk(2), dirty: false, baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();
    await tick();
    expect(await readDraft("p6")).toBeNull();
    off();
  });

  it("subscriber cuối rời đi ⇒ phiên đóng, timer bị huỷ (không ghi sau khi unmount)", async () => {
    vi.useFakeTimers();
    const off = subscribeDraft("p7", () => {}, null);
    scheduleDraftWrite("p7", { contract: mk(2), dirty: true, baseVersion: 1 });
    off();
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();
    await tick();
    expect(await readDraft("p7")).toBeNull();
  });
});
