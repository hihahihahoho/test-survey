/**
 * BACKLOG #22 — dòng phụ "lượt gen gần nhất" trên thẻ Home.
 *
 * Ca ĐẦU TIÊN dưới đây là lý do cả file này tồn tại: gen chết 100% ⇒ `rawPresent = 0`
 * ⇒ `deriveStatus` nói «Chưa vẽ». Một dự án vừa cháy rụi trông y hệt một dự án chưa
 * từng chạy — đúng cảnh chủ sản phẩm gặp hai lần trong một ngày.
 */
import { describe, expect, it } from "vitest";
import { RUN_DOT_CLASS, runLineOf } from "../lib/run-line";
import { deriveStatus } from "@/features/kitfile";
import type { Project } from "@/lib/types";

const NOW = Date.parse("2026-08-14T03:00:00.000Z");

const mk = (o: Partial<Project> = {}): Project => ({
  id: "tet-1a2b", name: "Tết 2026", slug: "tet",
  updatedAt: "2026-08-14T02:00:00.000Z", tags: [],
  ...o,
} as Project);

describe("① lượt chạy chết SẠCH — ca mà badge cũ nuốt mất", () => {
  const burned = mk({
    stats: { rawPresent: 0, jobs: 10, lastRun: { id: "r-0003", at: "2026-08-14T02:40:00.000Z", ok: 0, fail: 10, total: 10, status: "done-with-errors", failSummary: "10/10 job không ghi được ảnh" } },
    state: { jobs: {} },
  } as Partial<Project>);

  it("badge cũ THẬT SỰ nói sai — đây là bằng chứng, không phải giả định", () => {
    expect(deriveStatus(burned, NOW).label).toBe("Chưa vẽ");
  });

  it("dòng phụ nói đúng: chấm đỏ + n/m tấm lỗi", () => {
    const line = runLineOf(burned, NOW);
    expect(line?.dot).toBe("danger");
    expect(line?.text).toBe("Lỗi 10/10 tấm");
  });

  it("câu dài dùng NGUYÊN VĂN failSummary của agent (mọi bề mặt nói cùng một câu)", () => {
    expect(runLineOf(burned, NOW)?.long).toBe("10/10 job không ghi được ảnh");
  });

  it("lỗi một phần cũng hiện, không đợi chết sạch mới báo", () => {
    const partial = mk({ stats: { rawPresent: 7, jobs: 10, lastRun: { id: "r-0004", at: "2026-08-14T02:40:00.000Z", ok: 7, fail: 3, total: 10, status: "done-with-errors" } } } as Partial<Project>);
    expect(runLineOf(partial, NOW)?.text).toBe("Lỗi 3/10 tấm");
  });

  it("env-failed (engine còn chẳng chạy được) KHÔNG được im lặng", () => {
    const dead = mk({ stats: { rawPresent: 0, jobs: 4, lastRun: { id: "r-0005", at: "2026-08-14T02:40:00.000Z", ok: 0, fail: 0, total: 4, status: "env-failed" } } } as Partial<Project>);
    const line = runLineOf(dead, NOW);
    expect(line?.dot).toBe("danger");
    expect(line?.text).toBe("Lần trước không chạy được");
  });
});

describe("② đang chạy", () => {
  it("hiện x/y và chấm tím, thắng cả lượt hỏng trước đó", () => {
    const running = mk({
      stats: { rawPresent: 0, jobs: 6, lastRun: { id: "r-0002", at: "2026-08-14T01:00:00.000Z", ok: 0, fail: 6, total: 6, status: "done-with-errors" } },
      state: { jobs: {}, activeRun: { runId: "r-0003", kind: "gen", done: 2, total: 6, failed: 0 } },
    } as Partial<Project>);
    const line = runLineOf(running, NOW);
    expect(line?.dot).toBe("running");
    expect(line?.text).toBe("Đang tạo ảnh 2/6");
  });

  it("chưa biết tổng thì KHÔNG bịa mẫu số", () => {
    const running = mk({ state: { jobs: {}, activeRun: { runId: "r-0003", done: 0, total: 0, failed: 0 } } } as Partial<Project>);
    expect(runLineOf(running, NOW)?.text).toBe("Đang tạo ảnh");
  });
});

describe("③ xong ổn — và những ca PHẢI nhường badge cũ", () => {
  const done = mk({
    stats: { rawPresent: 6, jobs: 6, lastRun: { id: "r-0006", at: "2026-08-14T02:00:00.000Z", ok: 6, fail: 0, total: 6, status: "done" } },
    state: { jobs: {}, stale: false },
  } as Partial<Project>);

  it("chấm xanh + thời gian tương đối", () => {
    const line = runLineOf(done, NOW);
    expect(line?.dot).toBe("ok");
    expect(line?.text).toMatch(/^Đã tạo ảnh xong · /);
  });

  it("đã sửa thiết kế sau khi chạy ⇒ nhường «Cần vẽ lại» của badge cũ", () => {
    const stale = mk({ ...done, state: { jobs: {}, stale: true } } as Partial<Project>);
    expect(runLineOf(stale, NOW)).toBeNull();
  });

  it("chưa chạy lần nào ⇒ null, thẻ giữ nguyên ảnh bìa rỗng", () => {
    expect(runLineOf(mk({ stats: { rawPresent: 0, jobs: 5, lastRun: null } } as Partial<Project>), NOW)).toBeNull();
  });

  it("dự án hỏng file mô tả ⇒ null, «Không mở được» của badge quan trọng hơn", () => {
    expect(runLineOf(mk({ broken: true } as Partial<Project>), NOW)).toBeNull();
  });

  it("người dùng tự dừng ⇒ null, đó không phải lỗi để báo động", () => {
    const cancelled = mk({ stats: { rawPresent: 3, jobs: 6, lastRun: { id: "r-0007", at: "2026-08-14T02:00:00.000Z", ok: 3, fail: 0, total: 6, status: "cancelled" } } } as Partial<Project>);
    expect(runLineOf(cancelled, NOW)).toBeNull();
  });

  it("dữ liệu thiếu/lạ KHÔNG bao giờ làm ném — thẻ Home không được trắng", () => {
    expect(runLineOf(null, NOW)).toBeNull();
    expect(runLineOf(undefined, NOW)).toBeNull();
    expect(() => runLineOf({} as Project, NOW)).not.toThrow();
  });
});

describe("agent bản CŨ (chưa có status/total/failSummary) vẫn dùng được", () => {
  it("suy từ mỗi `fail` — không có `status` không phải là hết đường", () => {
    const old = mk({ stats: { rawPresent: 0, jobs: 8, lastRun: { id: "r-0009", at: "2026-08-14T02:00:00.000Z", ok: 0, fail: 8 } } } as Partial<Project>);
    const line = runLineOf(old, NOW);
    expect(line?.dot).toBe("danger");
    expect(line?.text).toBe("Lỗi 8/8 tấm");
  });
});

describe("chấm màu ánh xạ vào token đã đo tương phản", () => {
  it("ba chấm, ba class, không có class tự chế", () => {
    expect(Object.keys(RUN_DOT_CLASS).sort()).toEqual(["danger", "ok", "running"]);
    for (const cls of Object.values(RUN_DOT_CLASS)) expect(cls).toMatch(/^bg-(ok|warn|danger|running)$/);
  });
});
