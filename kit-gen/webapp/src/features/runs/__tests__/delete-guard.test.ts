import { describe, expect, it } from "vitest";
import { activeRunWarning, activeRunWarnings } from "../lib/delete-guard";
import type { Project } from "@/lib/types";

/**
 * C-01 (teams/qa-web/qa-func.md, tái hiện 6/8 lần): xoá project khi đang gen ⇒
 * thư mục ma + nút [Hoàn tác] hỏng thật (409 PROJECT_ID_TAKEN).
 * Những ca dưới đây khoá chặt hành vi "phải cảnh báo", để không ai vô tình gỡ.
 */
const mkProject = (state: Partial<NonNullable<Project["state"]>> = {}): Project =>
  ({
    id: "tet26-a7f3",
    name: "Tết 2026",
    tags: [],
    broken: false,
    state: { stale: false, staleReason: [], jobs: {}, ...state },
  }) as Project;

describe("C-01 · phát hiện project đang chạy", () => {
  it("có activeRun.runId ⇒ CẢNH BÁO, nêu đích danh lượt", () => {
    const w = activeRunWarning(mkProject({ activeRun: { runId: "r-0031", done: 3, total: 8, failed: 1 } }));
    expect(w.hasActiveRun).toBe(true);
    expect(w.runId).toBe("r-0031");
    expect(w.message).toContain("r-0031");
    expect(w.message).toContain("3/8");
  });

  it("agent CHƯA kịp cập nhật activeRun nhưng có job running ⇒ VẪN cảnh báo", () => {
    // Đây chính là khe hở đã tạo ra C-01: run vừa khởi động, activeRun còn rỗng.
    const w = activeRunWarning(mkProject({ jobs: { "tet-main": "running" } }));
    expect(w.hasActiveRun).toBe(true);
    expect(w.runId).toBeNull();
    expect(w.message).toContain("một lượt sinh ảnh");
  });

  it("job queued cũng tính là đang bận", () => {
    expect(activeRunWarning(mkProject({ jobs: { "tet-main": "queued" } })).hasActiveRun).toBe(true);
  });

  it("project rảnh ⇒ KHÔNG cảnh báo (đừng doạ người dùng vô cớ)", () => {
    const w = activeRunWarning(mkProject({ jobs: { "tet-main": "ok", "tet-tall": "stale" } }));
    expect(w.hasActiveRun).toBe(false);
    expect(w.message).toBeNull();
  });

  it("project null/undefined ⇒ không cảnh báo, không ném", () => {
    expect(activeRunWarning(null).hasActiveRun).toBe(false);
    expect(activeRunWarning(undefined).hasActiveRun).toBe(false);
  });

  it("lời khuyên nói ĐÚNG hậu quả của C-01, không nói chung chung", () => {
    const w = activeRunWarning(mkProject({ activeRun: { runId: "r-1", done: 0, total: 4, failed: 0 } }));
    expect(w.advice).toContain("Hoàn tác");
    expect(w.advice).toContain("dừng");
  });
});

describe("C-01 · xoá nhiều project cùng lúc (thanh chọn nhiều ở S1)", () => {
  const busy = { ...mkProject({ activeRun: { runId: "r-1", done: 1, total: 4, failed: 0 } }), name: "A" } as Project;
  const idle = { ...mkProject(), id: "b", name: "B" } as Project;

  it("lọc đúng project đang bận", () => {
    const r = activeRunWarnings([busy, idle]);
    expect(r.busy.map((p) => p.name)).toEqual(["A"]);
    expect(r.message).toContain("«A»");
  });

  it("không project nào bận ⇒ không có câu cảnh báo nào", () => {
    const r = activeRunWarnings([idle]);
    expect(r.busy).toHaveLength(0);
    expect(r.message).toBeNull();
  });

  it("nhiều project bận ⇒ nêu số lượng và liệt kê tên", () => {
    const busy2 = { ...busy, id: "c", name: "C" } as Project;
    const r = activeRunWarnings([busy, busy2, idle]);
    expect(r.busy).toHaveLength(2);
    expect(r.message).toContain("2 project");
    expect(r.message).toContain("«C»");
  });

  it("danh sách rỗng ⇒ không ném", () => {
    expect(activeRunWarnings([]).busy).toHaveLength(0);
  });
});
