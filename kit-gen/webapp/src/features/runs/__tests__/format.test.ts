import { describe, expect, it } from "vitest";
import {
  approxTime, bytes, clock, diagnosisText, duration, elapsedSeconds, etaSeconds,
  isRunFinished, jobDetail, jobLabel, kindLabel, progressOf, runStatusOf, runSummary, splitJob,
} from "../lib/format";
import type { Run, RunJob } from "@/lib/types";

const job = (o: Partial<RunJob> & { job: string }): RunJob => ({
  status: "ok", recovered: false, ...o,
} as RunJob);

const mkRun = (o: Partial<Run>): Run => ({
  id: "r-0001", kind: "gen", status: "running",
  progress: { done: 0, total: 0, failed: 0 }, jobs: [], seq: 0,
  ...o,
} as Run);

describe("định dạng thời lượng & dung lượng", () => {
  it("duration đổi ms sang chuỗi ngắn", () => {
    expect(duration(48_000)).toBe("48s");
    expect(duration(108_000)).toBe("1m48s");
    expect(duration(3_840_000)).toBe("1h04m");
    expect(duration(null)).toBe("—");
    expect(duration(-5)).toBe("—");
  });

  it("clock là đồng hồ đang chạy, có mm:ss và h:mm:ss", () => {
    expect(clock(134)).toBe("02:14");
    expect(clock(3_725)).toBe("1:02:05");
    expect(clock(-1)).toBe("00:00");
  });

  it("bytes dùng dấu phẩy thập phân kiểu VI", () => {
    expect(bytes(3_040_192)).toBe("2,9 MB");
    expect(bytes(512)).toBe("512 B");
    expect(bytes(null)).toBe("—");
  });

  it("approxTime LUÔN có dấu ~, và nói 'đang tính…' khi chưa biết", () => {
    expect(approxTime(132)).toBe("~2 phút");
    expect(approxTime(40)).toBe("~40 giây");
    expect(approxTime(null)).toBe("đang tính…");
    expect(approxTime(0)).toBe("đang tính…");
  });
});

describe("trạng thái run — chốt E1 (không bao giờ '✓ xong' khi có lỗi)", () => {
  it("queued gộp vào running vì §5.7 chỉ có 5 trạng thái hiển thị", () => {
    expect(runStatusOf("queued")).toBe("running");
    expect(runStatusOf("done-with-errors")).toBe("done-with-errors");
  });

  it("trạng thái lạ của agent mới KHÔNG làm vỡ UI, rơi về running", () => {
    expect(runStatusOf("something-new")).toBe("running");
    expect(runStatusOf(undefined)).toBe("running");
  });

  it("isRunFinished đúng cho cả 4 kiểu kết thúc", () => {
    expect(isRunFinished("done")).toBe(true);
    expect(isRunFinished("done-with-errors")).toBe(true);
    expect(isRunFinished("cancelled")).toBe(true);
    expect(isRunFinished("env-failed")).toBe(true);
    expect(isRunFinished("running")).toBe(false);
    expect(isRunFinished("queued")).toBe(false);
  });

  it("runSummary nêu SỐ LỖI khi có lỗi — đây là điểm chốt của E1", () => {
    const run = mkRun({ progress: { done: 5, total: 8, failed: 3, etaSeconds: null } });
    expect(runSummary(run)).toBe("5/8 xong · 3 lỗi");
    const clean = mkRun({ progress: { done: 8, total: 8, failed: 0, etaSeconds: null } });
    expect(runSummary(clean)).toBe("8/8 xong");
  });
});

describe("tiến độ", () => {
  it("thanh tiến độ đếm CẢ lượt lỗi, nếu không nó không bao giờ đầy", () => {
    const run = mkRun({ progress: { done: 5, total: 8, failed: 3, etaSeconds: null } });
    expect(progressOf(run).percent).toBe(100);
  });

  it("tự suy từ danh sách lượt khi agent chưa gửi progress", () => {
    const run = mkRun({
      progress: undefined as never,
      jobs: [job({ job: "a-x", status: "ok" }), job({ job: "b-x", status: "failed" }), job({ job: "c-x", status: "running" })],
    });
    const p = progressOf(run);
    expect(p.total).toBe(3);
    expect(p.done).toBe(1);
    expect(p.failed).toBe(1);
    expect(p.running).toBe(1);
  });

  it("total = 0 thì percent = 0, không chia cho 0", () => {
    expect(progressOf(mkRun({})).percent).toBe(0);
  });
});

describe("ETA — §3-S4-2 dùng TRUNG VỊ, không phải trung bình", () => {
  it("chưa có lượt nào xong ⇒ null ⇒ UI hiện 'đang tính…'", () => {
    const run = mkRun({ jobs: [job({ job: "a-x", status: "running" })] });
    expect(etaSeconds(run)).toBeNull();
  });

  it("một lượt timeout dị thường KHÔNG kéo lệch ETA (đó là lý do dùng trung vị)", () => {
    // 3 lượt xong: 100s, 100s, 600s (timeout). Trung vị = 100s, trung bình = 267s.
    const run = mkRun({
      maxJobs: 1,
      progress: { done: 3, total: 5, failed: 0, etaSeconds: null },
      jobs: [
        job({ job: "a-x", status: "ok", durationMs: 100_000 }),
        job({ job: "b-x", status: "ok", durationMs: 100_000 }),
        job({ job: "c-x", status: "ok", durationMs: 600_000 }),
        job({ job: "d-x", status: "queued" }),
        job({ job: "e-x", status: "queued" }),
      ],
    });
    // còn 2 lượt × trung vị 100s ÷ 1 song song = 200s (trung bình sẽ cho 533s)
    expect(etaSeconds(run)).toBe(200);
  });

  it("chia cho số lượt song song", () => {
    const run = mkRun({
      maxJobs: 4,
      progress: { done: 2, total: 10, failed: 0, etaSeconds: null },
      jobs: [
        job({ job: "a-x", status: "ok", durationMs: 120_000 }),
        job({ job: "b-x", status: "ok", durationMs: 120_000 }),
      ],
    });
    // còn 8 × 120s ÷ 4 = 240s
    expect(etaSeconds(run)).toBe(240);
  });

  it("agent trả etaSeconds thì AGENT THẮNG — nó biết máy thật", () => {
    const run = mkRun({
      progress: { done: 1, total: 4, failed: 0, etaSeconds: 42 },
      jobs: [job({ job: "a-x", status: "ok", durationMs: 999_000 })],
    });
    expect(etaSeconds(run)).toBe(42);
  });

  it("hết lượt còn lại ⇒ 0, không phải null", () => {
    const run = mkRun({
      progress: { done: 2, total: 2, failed: 0, etaSeconds: null },
      jobs: [
        job({ job: "a-x", status: "ok", durationMs: 1000 }),
        job({ job: "b-x", status: "ok", durationMs: 1000 }),
      ],
    });
    expect(etaSeconds(run)).toBe(0);
  });
});

describe("đồng hồ tổng", () => {
  it("run đã xong thì đồng hồ CỐ ĐỊNH, không đếm tiếp theo now", () => {
    const run = mkRun({
      startedAt: "2026-08-06T12:00:00.000Z",
      finishedAt: "2026-08-06T12:04:12.000Z",
    });
    expect(elapsedSeconds(run, Date.parse("2026-08-06T20:00:00.000Z"))).toBe(252);
  });

  it("run đang chạy thì đếm tới now", () => {
    const run = mkRun({ startedAt: "2026-08-06T12:00:00.000Z" });
    expect(elapsedSeconds(run, Date.parse("2026-08-06T12:02:14.000Z"))).toBe(134);
  });

  it("chưa bắt đầu ⇒ null", () => {
    expect(elapsedSeconds(mkRun({}))).toBeNull();
  });
});

describe("nhãn lượt & chẩn đoán — §1.3 cấm thuật ngữ kỹ thuật ra UI", () => {
  it("tách job thành phong cách + sheet khi API không tách sẵn", () => {
    expect(splitJob(job({ job: "tet-main" }))).toEqual({ variant: "tet", sheet: "main" });
    expect(splitJob(job({ job: "vang-kim-pose-lan" }))).toEqual({ variant: "vang", sheet: "kim-pose-lan" });
    expect(splitJob(job({ job: "tet-main", variant: "tet", sheet: "main2" }))).toEqual({
      variant: "tet", sheet: "main2",
    });
  });

  it("jobLabel tra tên tiếng Việt của phong cách", () => {
    expect(jobLabel(job({ job: "tet-main" }), (id) => (id === "tet" ? "Tết đỏ" : id))).toBe("Tết đỏ · main");
  });

  it("mọi mã chẩn đoán đều ra CÂU TIẾNG VIỆT, không có rc= hay stack", () => {
    for (const d of ["QUOTA_SUSPECTED", "NOT_LOGGED_IN", "NO_ARTIFACT", "TIMEOUT", "UNKNOWN"] as const) {
      const text = diagnosisText(d);
      expect(text.length).toBeGreaterThan(5);
      expect(text).not.toMatch(/rc=|Error|undefined|null/);
    }
  });

  it("mã lạ hoặc thiếu ⇒ câu mặc định, KHÔNG phải chuỗi rỗng", () => {
    expect(diagnosisText(null)).toContain("chưa rõ nguyên nhân");
    expect(diagnosisText("WHAT_IS_THIS" as never)).toContain("chưa rõ nguyên nhân");
  });

  it("kindLabel không bao giờ để lọt chữ 'gen'/'slice' ra UI", () => {
    expect(kindLabel("gen")).toBe("Sinh ảnh");
    expect(kindLabel("slice")).toBe("Cắt ảnh");
    expect(kindLabel("skeleton")).toBe("Dựng khung xương");
    expect(kindLabel(undefined)).toBe("Sinh ảnh");
  });

  it("jobDetail hiện đồng hồ khi đang chạy, thời lượng + dung lượng khi xong", () => {
    const running = job({ job: "a-x", status: "running", startedAt: "2026-08-06T12:00:00.000Z" });
    expect(jobDetail(running, Date.parse("2026-08-06T12:01:12.000Z"))).toBe("01:12");

    const done = job({ job: "a-x", status: "ok", durationMs: 108_000, artifact: { path: "raw/a.png", bytes: 3_040_192 } });
    expect(jobDetail(done)).toBe("1m48s · 2,9 MB");

    expect(jobDetail(job({ job: "a-x", status: "queued" }))).toBe("đang chờ");
  });
});
