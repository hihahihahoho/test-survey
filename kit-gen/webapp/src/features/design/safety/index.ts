/**
 * ══════════════════════════════════════════════════════════════════════════════
 * features/design/safety — LƯỚI AN TOÀN DỮ LIỆU CỦA TRÌNH SOẠN (S3)
 * Đóng issue #3 của audit: B1 undo · B2 · B4 backup 1 tầng · B5 rời trang · R7 409.
 * MUST độ khó **L** của §7.1.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THI CÔNG ĐÚNG HỢP ĐỒNG `features/design/contracts.ts` của R2-P1 — hai điểm móc
 * mà `slots.tsx` tự nạp, KHÔNG ai phải sửa file của ai:
 *
 *   features/design/safety/SafetyPanel.tsx  →  export function SafetyPanel(props: SafetyPanelProps)
 *   features/design/safety/useDraft.ts      →  export function useDraft(opts): UseDraftResult
 *
 * NĂM TẦNG AN TOÀN, xếp theo "mất dữ liệu ở đâu thì tầng nào đỡ":
 *
 *   ① dirty + beforeunload      đóng tab / F5            → R2-P1 giữ; `useLeaveGuard` có sẵn bản dự phòng
 *   ①b chặn điều hướng TRONG APP  bấm sang màn khác        → `useLeaveGuard` + `LeaveGuardDialog` (FILE NÀY)
 *   ② undo/redo ≥50 bước        lỡ tay trong phiên       → `useEditorStore` của R0 + màn của R2-P1
 *   ③ nháp IDB mỗi 2s           tab chết, agent tắt      → `useDraft` + `draft-session` (FILE NÀY)
 *   ④ lịch sử 50 bản của agent  "lưu rồi mới biết sai"   → `useContractHistory` + `HistoryDrawer`
 *   ⑤ modal 409                 hai tab đè nhau          → `ConflictDialog` + diff 2 cột thật
 *
 * NGUYÊN TẮC XUYÊN SUỐT (§1.1-1): bản của user KHÔNG BAO GIỜ biến mất vì một lỗi
 * mạng. Chỉ có ĐÚNG HAI đường làm mất nó, và cả hai đều do user tự bấm:
 * [Bỏ nháp] và [Tải lại bản trên đĩa].
 */

/* ── Hai điểm móc của hợp đồng R2-P1 ─────────────────────────────────────── */
export { SafetyPanel, default as SafetyPanelDefault } from "./SafetyPanel";
export { useDraft, acknowledgeDraft, clearDraftSession } from "./useDraft";

/* ── Thành phần dùng lại được (R2-P1 có thể tự bố trí nếu muốn) ──────────── */
export { DraftBanner, type DraftPrompt } from "./DraftBanner";
export { ConflictDialog, type ConflictChoice } from "./ConflictDialog";
export { HistoryDrawer } from "./HistoryDrawer";
export { LeaveGuardDialog } from "./LeaveGuardDialog";
export { useLeaveGuard, _beforeUnloadInstalled } from "./useLeaveGuard";
export type { LeaveGuardApi } from "./useLeaveGuard";
export { DiffTable, SummaryColumns } from "./DiffTable";

/* ── Logic thuần (test được bằng Node, không cần DOM) ────────────────────── */
export { diffContracts, diffSentence, summarize, summaryText } from "./diff";
export type { ContractDiff, DiffRow, ContractSummary, ChangeKind } from "./diff";
export { formatWhen } from "./format-time";
export { readDraft, writeDraft, dropDraft, isDraftStale } from "./drafts";
export type { DraftRecord } from "./drafts";
export {
  DRAFT_AUTOSAVE_MS, subscribeDraft, scheduleDraftWrite, dismissFoundDraft,
  draftState, _resetDraftSessions,
} from "./draft-session";
export type { DraftSessionState } from "./draft-session";
export { useContractHistory } from "./useContractHistory";
export type { ContractHistoryApi } from "./useContractHistory";
export type { ConflictInfo, HistoryEntryView } from "./types";

/* ── Cổng IndexedDB (arch §4.2) — dùng chung với S4 (log run) ────────────── */
export {
  IDB_STORES, IDB_LIMITS, IDB_NAME, IDB_VERSION,
  idbGet, idbSet, idbDel, idbKeys, idbPrune, idbAvailable, configureIdb, IdbStoreError,
} from "./idb";
export type { IdbStore } from "./idb";
