/**
 * Timer tự lưu nháp chạy NGOÀI React: không ai `await` nó, không error boundary nào bắt
 * được nó. Nếu `writeDraft` reject mà `scheduleDraftWrite` không `catch`, kết quả là một
 * **unhandled rejection** — đúng loại lỗi đã làm vỡ bản 2.1.17, chỉ khác là đi đường
 * promise thay vì đường render.
 *
 * File riêng vì phải `vi.mock` cả module `../drafts` (drafts.test.ts dùng bản THẬT).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Contract } from "@/lib/types";

const writeDraft = vi.fn<(...args: unknown[]) => Promise<boolean>>();

vi.mock("../drafts", () => ({
  writeDraft: (...args: unknown[]) => writeDraft(...args),
  readDraft: async () => null,
  dropDraft: async () => true,
  isDraftStale: () => false,
}));

const { _resetDraftSessions, draftState, scheduleDraftWrite, subscribeDraft } = await import("../draft-session");

const mk = (n = 1): Contract =>
  ({
    schemaVersion: 4,
    sheets: [{ id: "main", grid: { cols: n, rows: 1 }, components: [] }],
    variants: [],
    characterPoses: [],
  }) as unknown as Contract;

let seen: unknown[];
const collect = (e: unknown) => seen.push(e);

beforeEach(() => {
  seen = [];
  writeDraft.mockReset();
  _resetDraftSessions();
  process.on("unhandledRejection", collect);
});
afterEach(() => {
  process.off("unhandledRejection", collect);
  vi.useRealTimers();
});

/** Cho hàng microtask + vòng lặp sự kiện chạy hết, để unhandled rejection kịp nổ. */
const settle = async () => {
  for (let i = 0; i < 3; i += 1) await new Promise<void>((r) => setTimeout(r, 0));
};

describe("tự lưu nháp KHÔNG bao giờ thành unhandled rejection", () => {
  it("writeDraft ném ⇒ phiên đi tiếp, không có rejection nào lọt ra", async () => {
    writeDraft.mockRejectedValue(new Error("cửa IDB từ chối"));
    vi.useFakeTimers();
    const off = subscribeDraft("p-fail", () => {}, null);
    scheduleDraftWrite("p-fail", { contract: mk(2), dirty: true, baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    await settle();

    expect(writeDraft).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
    // Ghi hỏng ⇒ KHÔNG được báo "đã lưu": nhãn thời gian phải im lặng, không nói dối.
    expect(draftState("p-fail").savedAt).toBeNull();
    off();
  });

  it("lần ghi sau vẫn được hẹn bình thường — hỏng một nhịp không tắt tính năng", async () => {
    writeDraft.mockRejectedValueOnce(new Error("hỏng một nhịp")).mockResolvedValue(true);
    vi.useFakeTimers();
    const off = subscribeDraft("p-recover", () => {}, null);
    scheduleDraftWrite("p-recover", { contract: mk(2), dirty: true, baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(2500);
    scheduleDraftWrite("p-recover", { contract: mk(3), dirty: true, baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    await settle();

    expect(writeDraft).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([]);
    expect(draftState("p-recover").savedAt).not.toBeNull();
    off();
  });

  it("ghi được thì vẫn đánh dấu đã lưu (catch không nuốt nhầm ca thành công)", async () => {
    writeDraft.mockResolvedValue(true);
    vi.useFakeTimers();
    const off = subscribeDraft("p-ok", () => {}, null);
    scheduleDraftWrite("p-ok", { contract: mk(2), dirty: true, baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    await settle();

    expect(draftState("p-ok").savedAt).not.toBeNull();
    expect(seen).toEqual([]);
    off();
  });
});
