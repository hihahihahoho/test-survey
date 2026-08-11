import { describe, expect, it } from "vitest";
import {
  estimateRun, needsGen, quotaWarning, rangeMinutes, QUOTA_PER_JOB, SECONDS_PER_JOB,
} from "../lib/estimate";

describe("ước lượng quota — nguồn: teams/t3-auth/PLAN.md §A.3", () => {
  it("hệ số đúng con số docs OpenAI trích trong PLAN.md: 3–5×", () => {
    expect(QUOTA_PER_JOB).toEqual([3, 5]);
  });

  it("tái lập ĐÚNG phép tính của PLAN.md: 28 lượt ≈ 84–140 lượt tương đương", () => {
    const est = estimateRun(28, 4);
    expect(est.quotaUnits).toEqual([84, 140]);
  });

  it("khớp ví dụ của §4.8: 7 lượt ≈ 21–35 lượt tương đương", () => {
    expect(estimateRun(7, 4).quotaUnits).toEqual([21, 35]);
  });

  it("0 lượt ⇒ 0 quota, không âm, không NaN", () => {
    const est = estimateRun(0, 4);
    expect(est.quotaUnits).toEqual([0, 0]);
    expect(est.jobs).toBe(0);
  });

  it("số lượt âm/rác bị kẹp về 0", () => {
    expect(estimateRun(-5, 4).jobs).toBe(0);
    expect(estimateRun(Number.NaN, 4).jobs).toBe(0);
  });
});

describe("ước lượng thời gian", () => {
  it("tính theo SỐ ĐỢT (ceil), không phải phép chia lẻ", () => {
    // 7 lượt / 4 song song = 2 đợt (không phải 1.75)
    const est = estimateRun(7, 4);
    expect(est.seconds).toEqual([2 * SECONDS_PER_JOB[0], 2 * SECONDS_PER_JOB[1]]);
  });

  it("khớp cỡ ví dụ '7 lượt ≈ 4–6 phút với 4 song song' của §4.8", () => {
    const est = estimateRun(7, 4);
    expect(rangeMinutes(est.seconds)).toBe("~3–5 phút");
  });

  it("song song 0 hoặc rác được kẹp về 1, không chia cho 0", () => {
    expect(Number.isFinite(estimateRun(4, 0).seconds[0])).toBe(true);
    expect(estimateRun(4, 0).seconds).toEqual(estimateRun(4, 1).seconds);
  });

  it("song song > 8 bị kẹp về 8 (giới hạn của #32)", () => {
    expect(estimateRun(16, 99).seconds).toEqual(estimateRun(16, 8).seconds);
  });

  it("rangeMinutes gộp khi hai đầu tròn về cùng một số", () => {
    expect(rangeMinutes([110, 130])).toBe("~2 phút");
    expect(rangeMinutes([90, 150])).toBe("~2–3 phút");
  });
});

describe("câu cảnh báo quota", () => {
  it("có đủ 3 con số và dùng chữ 'khoảng' (ta đang ước lượng, không hứa)", () => {
    const text = quotaWarning(estimateRun(7, 4));
    expect(text).toContain("khoảng");
    expect(text).toContain("3–5");
    expect(text).toContain("7 lượt");
    expect(text).toContain("21–35");
  });
});

describe("[Chỉ thứ đã đổi] — §4.8", () => {
  it("chọn đúng ⟳ stale, ○ never, ❌ failed", () => {
    expect(needsGen("never")).toBe(true);
    expect(needsGen("stale")).toBe(true);
    expect(needsGen("failed")).toBe(true);
  });

  it("KHÔNG chọn thứ đã xong hoặc đang chạy — chọn nhầm là đốt quota vô ích", () => {
    expect(needsGen("ok")).toBe(false);
    expect(needsGen("running")).toBe(false);
    expect(needsGen("queued")).toBe(false);
    expect(needsGen("uncut")).toBe(false);
  });

  it("thiếu dữ liệu ⇒ coi như chưa có ⇒ cần sinh", () => {
    expect(needsGen(undefined)).toBe(true);
    expect(needsGen(null)).toBe(true);
  });
});
