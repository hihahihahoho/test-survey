/**
 * Cache danh sách cho chế độ chỉ-đọc §2.5-4.
 *
 * Hai điều PHẢI đúng, nếu sai thì user thấy dữ liệu của một workspace khác:
 *  · fingerprint lệch ⇒ KHÔNG dùng cache (thà rỗng còn hơn hiện lẫn)
 *  · dữ liệu ghi ra localStorage phải đi qua allowlist + bộ dò secret của R0
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _setBackend, memoryBackend, LS_KEYS, storeGet } from "@/lib/store";
import { projectListSchema } from "@/lib/types";
import { readListCache, writeListCache } from "../lib/cache";

const list = (fingerprint: string) =>
  projectListSchema.parse({
    workspaceFingerprint: fingerprint,
    items: [
      {
        id: "tet26",
        name: 'Tết "26" <b>',
        tags: ["tet"],
        updatedAt: "2026-08-06T10:00:00Z",
        cover: "kits/tet/25-bg-home.png",
        stats: { diskBytes: 176_000_000, sheets: 5 },
        state: { stale: true, jobs: { "tet-main": "ok" }, activeRun: { runId: "r-1", done: 2, total: 8 } },
      },
      { id: "broken1", name: "candy-old", broken: true },
    ],
  });

describe("cache danh sách project (§2.5-4)", () => {
  beforeEach(() => _setBackend(memoryBackend()));

  it("ghi rồi đọc lại được, giữ nguyên tên có ký tự đặc biệt", () => {
    expect(writeListCache(list("sha256:aaa"), null)).toBe(true);
    const c = readListCache("sha256:aaa");
    expect(c?.items).toHaveLength(2);
    expect(c?.items[0]?.name).toBe('Tết "26" <b>');
  });

  it("giữ state.jobs + activeRun ⇒ thẻ vẽ từ cache VẪN có badge trạng thái đúng", () => {
    writeListCache(list("sha256:aaa"), null);
    const p = readListCache("sha256:aaa")?.items[0];
    expect(p?.state?.jobs).toEqual({ "tet-main": "ok" });
    expect(p?.state?.activeRun?.total).toBe(8);
  });

  it("giữ cờ broken ⇒ project hỏng KHÔNG biến mất im lặng khi agent tắt", () => {
    writeListCache(list("sha256:aaa"), null);
    expect(readListCache("sha256:aaa")?.items[1]?.broken).toBe(true);
  });

  it("FINGERPRINT LỆCH ⇒ trả null (không hiện project của workspace khác)", () => {
    writeListCache(list("sha256:aaa"), null);
    expect(readListCache("sha256:bbb")).toBeNull();
  });

  it("chưa biết fingerprint (agent tắt hẳn) ⇒ vẫn dùng được cache", () => {
    writeListCache(list("sha256:aaa"), null);
    expect(readListCache(null)?.items).toHaveLength(2);
  });

  it("chưa có gì ⇒ null, không ném lỗi", () => {
    expect(readListCache("sha256:aaa")).toBeNull();
  });

  it("ghi qua đúng khoá allowlist `kitgen.projects.cache.v1` của R0", () => {
    writeListCache(list("sha256:aaa"), "W/\"etag-1\"");
    const raw = storeGet(LS_KEYS.projectsCache);
    expect(raw.items).toHaveLength(2);
    expect(raw.etag).toBe("W/\"etag-1\"");
  });

  it("localStorage bị chặn (Safari private) ⇒ KHÔNG vỡ, chỉ mất cache", () => {
    _setBackend({
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
      removeItem: () => {},
    });
    // storeSet của R0 tự hạ xuống RAM; điều quan trọng là không ném ra ngoài.
    expect(() => writeListCache(list("sha256:aaa"), null)).not.toThrow();
  });
});
