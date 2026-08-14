/**
 * ══════════════════════════════════════════════════════════════════════════════
 * features/runs — S4 THEO DÕI SINH ẢNH (§3-S4) + MODAL M1 (§4.8)
 * Đóng D1–D10, E1, E4, E5, H1, R3, R20, C1, D8 — MUST độ khó **L** của §7.1.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * HAI MÀN theo hợp đồng lazy-mount của R1 (`components/layout/screen-contract.ts`):
 *   features/runs/RunsScreen.tsx       → export function RunsScreen(props)
 *   features/runs/RunDetailScreen.tsx  → export function RunDetailScreen(props)
 *
 * BA THỨ MÀN KHÁC DÙNG LẠI (đừng viết bản thứ hai):
 *
 *   1. `<GenerateDialog>` — MODAL M1, cửa DUY NHẤT tiêu quota (§1.1-2, X11).
 *      Mọi nút "⚡ Sinh ảnh…" ở S2/S3/S5 phải mở modal này, không tự gọi
 *      `useStartRun` — nếu tự gọi là mất cảnh báo quota, mất chặn doctor, mất
 *      chặn run trùng, tức là đúng ba lỗi mà §4.8 sinh ra để chống.
 *
 *   2. `<JobDrawer>` — nhật ký + prompt của MỘT lượt. §3-S4-6 nói drawer này
 *      mở được "từ badge ❌ bất kỳ đâu trong app", nên S2/S3/S5 cứ dùng.
 *
 *   3. `<ActiveRunGuard>` + `activeRunWarning()` — cảnh báo C-01. Cắm vào mọi
 *      modal phá huỷ project (xoá, dọn cache, nhập đè, đổi workspace).
 *      Xem `lib/delete-guard.ts` để biết vì sao.
 */
export { RunsScreen, default } from "./RunsScreen";
export { RunDetailScreen } from "./RunDetailScreen";

export { GenerateDialog } from "./components/GenerateDialog";
export { JobDrawer } from "./components/JobDrawer";
export { JobList } from "./components/JobList";
export { JobPickMatrix } from "./components/JobPickMatrix";
export { LogPanel } from "./components/LogPanel";
export { RunHeader } from "./components/RunHeader";
export { SheetProgressCard } from "./components/SheetProgressCard";
export { SheetProgressGrid } from "./components/SheetProgressGrid";
export { ActiveRunGuard } from "./components/ActiveRunGuard";

export { activeRunWarning, activeRunWarnings } from "./lib/delete-guard";
export type { ActiveRunWarning } from "./lib/delete-guard";

export {
  estimateRun, quotaWarning, rangeMinutes, needsGen,
  QUOTA_PER_JOB, SECONDS_PER_JOB,
} from "./lib/estimate";
export type { RunEstimate } from "./lib/estimate";

export {
  duration, clock, bytes, approxTime, hhmmss, runStatusOf, jobStatusOf, isRunFinished,
  diagnosisText, jobDetail, jobLabel, splitJob, kindLabel, progressOf, etaSeconds,
  elapsedSeconds, runSummary,
} from "./lib/format";
export { resolveSheetIdentity, sheetProgressState, sheetDisplayName, friendlyDiagnosis } from "./lib/sheet-progress";
export type { RunProgress } from "./lib/format";

export { useRunLog } from "./lib/useRunLog";
export type { RunLogApi } from "./lib/useRunLog";
export {
  createRunLogBuffer, readStoredLog, filterLines, logToText,
} from "./lib/runlog";
export type { LogLine, LogLevel, LogFilter, RunLogBuffer } from "./lib/runlog";
export { downloadText } from "./lib/download";
/** #22 — khối chẩn đoán để dán cho dev. CỤC BỘ: chỉ dựng chuỗi, không gửi đi đâu. */
export { buildDiagnosticsText, osLabel, currentOsLabel } from "./lib/diagnostics";
export type { DiagnosticsInput } from "./lib/diagnostics";
export { useGenerateRun } from "./lib/useGenerateRun";
