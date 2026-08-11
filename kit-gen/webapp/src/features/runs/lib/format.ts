/**
 * features/runs/lib/format.ts — CHUỖI HIỂN THỊ CỦA S4.
 * Thuần khiết, không React, không I/O ⇒ test bằng Node.
 *
 * Mọi copy bám §5.7 (7 trạng thái job / 5 trạng thái run) và §1.3 (từ vựng).
 * CẤM lọt thuật ngữ kỹ thuật ra đây: không "job", không "NDJSON", không "rc=1".
 */
import type { Diagnosis, Run, RunJob } from "@/lib/types";
import type { JobStatus, RunStatus } from "@/lib/status";

/* ═════════ Thời lượng & dung lượng ═════════ */

/** "1m48s" · "48s" · "1h04m" — thời lượng đã kết thúc. */
export function duration(ms: number | null | undefined): string {
  // `Number(null)` là 0, KHÔNG phải NaN — nên phải loại null/"" TRƯỚC khi ép kiểu.
  // Không có bước này thì "chưa biết thời lượng" hiện thành "0s", tức là UI NÓI DỐI.
  // (Ca test "duration(null)" đã bắt đúng lỗi này ở bản đầu.)
  if (ms === null || ms === undefined) return "—";
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return "—";
  const s = Math.round(v / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

/** "02:14" · "1:02:14" — đồng hồ ĐANG CHẠY (khác `duration`: có nhịp, đọc theo giây). */
export function clock(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/**
 * `bytes` ĐÃ GỘP về `src/lib/format.ts` (INTEGRATION) — trước đây file này giữ một
 * bản chép y hệt. Re-export để 6 chỗ gọi trong S4 không phải đổi import.
 */
import { bytes } from "@/lib/format";
export { bytes };

/** "~2 phút" · "~45 giây" — ước lượng, LUÔN có chữ "~" để không hứa chắc. */
export function approxTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "đang tính…";
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "đang tính…";
  if (s < 90) return `~${Math.max(5, Math.round(s / 5) * 5)} giây`;
  return `~${Math.max(1, Math.round(s / 60))} phút`;
}

export function hhmmss(iso: string | null | undefined): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ═════════ Trạng thái ═════════ */

const RUN_STATUS_VALUES: RunStatus[] = ["running", "done", "done-with-errors", "cancelled", "env-failed"];

/**
 * `Run.status` của API có thêm `queued`; §5.7 chỉ định nghĩa 5 trạng thái hiển thị.
 * `queued` gộp vào `running` — với user, "đã bấm nút và chưa xong" là một trạng thái.
 */
export function runStatusOf(status: string | null | undefined): RunStatus {
  if (status === "queued") return "running";
  return RUN_STATUS_VALUES.includes(status as RunStatus) ? (status as RunStatus) : "running";
}

export function isRunFinished(status: string | null | undefined): boolean {
  return status === "done" || status === "done-with-errors" || status === "cancelled" || status === "env-failed";
}

const JOB_STATUS_VALUES: JobStatus[] = ["never", "queued", "running", "ok", "stale", "uncut", "failed"];

export function jobStatusOf(status: string | null | undefined): JobStatus {
  return JOB_STATUS_VALUES.includes(status as JobStatus) ? (status as JobStatus) : "queued";
}

/* ═════════ Chẩn đoán 1 dòng cho lượt lỗi (§3-S4-4) ═════════ */

/**
 * 5 enum `diagnosis` của §6.2 → MỘT CÂU tiếng Việt user hiểu.
 * Đây là chỗ đóng E1 ở mức copy: không bao giờ in `rc=1` hay stack ra dòng lượt.
 */
const DIAGNOSIS_TEXT: Record<Diagnosis, string> = {
  QUOTA_SUSPECTED: "nghi đã chạm giới hạn tạo ảnh của tài khoản",
  NOT_LOGGED_IN: "công cụ tạo ảnh chưa đăng nhập",
  NO_ARTIFACT: "chạy xong nhưng ảnh không được ghi",
  TIMEOUT: "quá thời gian chờ",
  UNKNOWN: "chưa rõ nguyên nhân — mở nhật ký để xem",
};

export function diagnosisText(d: Diagnosis | null | undefined): string {
  if (!d) return DIAGNOSIS_TEXT.UNKNOWN;
  return DIAGNOSIS_TEXT[d] ?? DIAGNOSIS_TEXT.UNKNOWN;
}

/** Số liệu phụ của một dòng lượt: "1m48s · 2,9 MB" hoặc "01:12" khi đang chạy. */
export function jobDetail(job: RunJob, now: number = Date.now()): string {
  if (job.status === "running" && job.startedAt) {
    const t = Date.parse(job.startedAt);
    if (!Number.isNaN(t)) return clock((now - t) / 1000);
  }
  if (job.status === "queued") return "đang chờ";
  const parts: string[] = [];
  if (job.durationMs) parts.push(duration(job.durationMs));
  if (job.artifact?.bytes) parts.push(bytes(job.artifact.bytes));
  return parts.join(" · ");
}

/** `tet-main` → `{variant:"tet", sheet:"main"}` khi API không tách sẵn. */
export function splitJob(job: RunJob): { variant: string; sheet: string } {
  if (job.variant && job.sheet) return { variant: job.variant, sheet: job.sheet };
  const i = String(job.job).indexOf("-");
  return i === -1
    ? { variant: String(job.job), sheet: "" }
    : { variant: String(job.job).slice(0, i), sheet: String(job.job).slice(i + 1) };
}

/** Nhãn dòng lượt: "Tết đỏ · main". `variantLabel` tra tên tiếng Việt nếu có. */
export function jobLabel(job: RunJob, variantLabel?: (id: string) => string): string {
  const { variant, sheet } = splitJob(job);
  const v = variantLabel?.(variant) || variant;
  return sheet ? `${v} · ${sheet}` : v;
}

/** §1.3: `run.kind` → chữ người đọc. KHÔNG hiện "gen"/"slice" ra UI. */
export function kindLabel(kind: string | null | undefined): string {
  if (kind === "slice") return "Cắt ảnh";
  if (kind === "skeleton") return "Dựng khung xương";
  return "Sinh ảnh";
}

/* ═════════ Tiến độ ═════════ */

export interface RunProgress {
  done: number;
  total: number;
  failed: number;
  /** 0–100, đã kẹp biên. */
  percent: number;
  running: number;
}

export function progressOf(run: Run | null | undefined): RunProgress {
  const p = run?.progress;
  const jobs = run?.jobs ?? [];
  const total = Number(p?.total ?? jobs.length) || jobs.length;
  const done = Number(p?.done ?? jobs.filter((j) => j.status === "ok").length) || 0;
  const failed = Number(p?.failed ?? jobs.filter((j) => j.status === "failed").length) || 0;
  const running = jobs.filter((j) => j.status === "running").length;
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round(((done + failed) / total) * 100))) : 0;
  return { done, total, failed, percent, running };
}

/**
 * ETA theo đúng §3-S4-2: **trung vị** thời lượng các lượt ĐÃ XONG × số lượt còn lại
 * ÷ số song song. Trả `null` khi chưa đủ dữ liệu ⇒ UI hiện "đang tính…".
 *
 * Vì sao TRUNG VỊ chứ không trung bình: một lượt timeout 10 phút sẽ kéo trung bình
 * lên và làm ETA sai gấp đôi suốt phần còn lại của run. Trung vị miễn nhiễm với
 * một hai giá trị dị thường — mà run nào cũng có vài cái.
 *
 * Ưu tiên `etaSeconds` của agent nếu có: agent biết nhiều hơn client.
 */
export function etaSeconds(run: Run | null | undefined): number | null {
  if (!run) return null;
  const fromAgent = run.progress?.etaSeconds;
  if (typeof fromAgent === "number" && fromAgent > 0) return fromAgent;

  const durations = (run.jobs ?? [])
    .filter((j) => (j.status === "ok" || j.status === "failed") && typeof j.durationMs === "number" && j.durationMs! > 0)
    .map((j) => j.durationMs as number)
    .sort((x, y) => x - y);
  if (durations.length === 0) return null;

  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 1
      ? durations[mid]!
      : ((durations[mid - 1]! + durations[mid]!) / 2);

  const { done, total, failed } = progressOf(run);
  const remaining = Math.max(0, total - done - failed);
  if (remaining === 0) return 0;
  const parallel = Math.max(1, Number(run.maxJobs) || 1);
  return Math.round((median * remaining) / parallel / 1000);
}

/** Đồng hồ tổng của run: chạy thì đếm tới now, xong thì cố định. */
export function elapsedSeconds(run: Run | null | undefined, now: number = Date.now()): number | null {
  if (!run?.startedAt) return null;
  const start = Date.parse(run.startedAt);
  if (Number.isNaN(start)) return null;
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  if (Number.isNaN(end)) return null;
  return Math.max(0, (end - start) / 1000);
}

/**
 * Câu tóm tắt trạng thái run — dùng ở badge, tiêu đề tab, và thẻ danh sách.
 * ĐÓNG E1: khi có lượt lỗi thì KHÔNG BAO GIỜ có chữ "Xong" trơn hay dấu ✓.
 */
export function runSummary(run: Run | null | undefined): string {
  const { done, total, failed } = progressOf(run);
  const base = `${done}/${total} xong`;
  return failed > 0 ? `${base} · ${failed} lỗi` : base;
}
