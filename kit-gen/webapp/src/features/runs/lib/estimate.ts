/**
 * features/runs/lib/estimate.ts — BA CON SỐ CỦA MODAL M1 (chốt X11, đóng D8).
 *
 * §4.8 đòi modal "Bắt đầu sinh ảnh" nêu đúng ba thứ trước khi tiêu tiền:
 *   ① số lượt · ② ước lượng thời gian · ③ CẢNH BÁO QUOTA
 *
 * ╔═ NGUỒN CỦA HỆ SỐ QUOTA 3–5× — KHÔNG PHẢI TÔI BỊA ══════════════════════════╗
 * ║ `teams/t3-auth/PLAN.md` §A.3 mục 1 trích docs chính thức của OpenAI:        ║
 * ║   "Image generations use included limits 3-5x faster on average than        ║
 * ║    similar turns without image generation"                                  ║
 * ║ và tính sẵn cho `styles.json` thật: 28 lượt ≈ 84–140 "lượt tương đương".    ║
 * ║ 28 × [3,5] = [84,140] ⇒ khớp. Ta dùng đúng hệ số đó.                        ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * THỜI GIAN thì KHÔNG có nguồn chính thức nào — nó phụ thuộc máy, mạng, tải của
 * dịch vụ. `[90, 150]` giây/lượt là con số quan sát được ghi trong wireframe của
 * §3-S4 ("1m48s", "1m52s") và §4.8 ("7 lượt ≈ 4–6 phút với 4 song song":
 * 7/4 × 90s ≈ 2.6′, 7/4 × 150s ≈ 4.4′ — cùng cỡ). Vì là ƯỚC LƯỢNG THÔ, mọi chỗ
 * hiển thị đều phải có chữ "khoảng"/"~". Nếu agent trả `estimate` trong response
 * #32 thì **agent thắng** — nó biết máy thật.
 */

/** Hệ số quota mỗi lượt sinh ảnh so với một lượt hỏi thường (t3-auth §A.3). */
export const QUOTA_PER_JOB: readonly [number, number] = [3, 5];
/** Giây mỗi lượt, ước lượng thô (§3-S4 wireframe). */
export const SECONDS_PER_JOB: readonly [number, number] = [90, 150];

export interface RunEstimate {
  jobs: number;
  /** [thấp, cao] giây cho cả run, đã chia cho số lượt song song. */
  seconds: [number, number];
  /** [thấp, cao] "lượt tương đương" về mức ăn quota. */
  quotaUnits: [number, number];
}

export function estimateRun(jobCount: number, maxJobs: number): RunEstimate {
  // `Math.max(0, NaN) === NaN` — không chặn NaN ở đây thì modal hiện "NaN lượt"
  // và cảnh báo quota thành "NaN–NaN lượt tương đương". Ca test đã bắt đúng lỗi này.
  const n = Number.isFinite(jobCount) ? Math.max(0, Math.floor(jobCount)) : 0;
  const parallel = Number.isFinite(maxJobs) ? Math.max(1, Math.min(8, Math.floor(maxJobs) || 1)) : 1;
  // `ceil` số đợt: 7 lượt / 4 song song = 2 đợt, không phải 1.75.
  const waves = Math.ceil(n / parallel);
  return {
    jobs: n,
    seconds: [waves * SECONDS_PER_JOB[0], waves * SECONDS_PER_JOB[1]],
    quotaUnits: [n * QUOTA_PER_JOB[0], n * QUOTA_PER_JOB[1]],
  };
}

/** "~3–5 phút" · "~2 phút" khi hai đầu tròn về cùng một số. */
export function rangeMinutes([lo, hi]: readonly [number, number]): string {
  const a = Math.max(1, Math.round(lo / 60));
  const b = Math.max(1, Math.round(hi / 60));
  return a === b ? `~${a} phút` : `~${a}–${b} phút`;
}

/**
 * Câu cảnh báo quota — CHỖ DUY NHẤT dựng chuỗi này, để không nơi nào nói một
 * con số khác. Cố ý dùng chữ "khoảng": ta đang ước lượng, không hứa.
 */
export function quotaWarning(est: RunEstimate): string {
  return (
    `Sinh ảnh tiêu quota tài khoản ChatGPT khoảng ${QUOTA_PER_JOB[0]}–${QUOTA_PER_JOB[1]} lần một lượt hỏi thường. ` +
    `${est.jobs} lượt ≈ ${est.quotaUnits[0]}–${est.quotaUnits[1]} lượt tương đương.`
  );
}

/** "Đã đổi" = cần sinh: chưa có ○, cũ hơn thiết kế ⟳, hoặc lỗi ❌ (§4.8 [Chỉ thứ đã đổi]). */
export function needsGen(status: string | null | undefined): boolean {
  return status === undefined || status === null || status === "never" || status === "stale" || status === "failed";
}
