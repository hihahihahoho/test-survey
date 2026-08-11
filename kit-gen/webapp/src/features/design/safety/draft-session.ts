/**
 * features/design/safety/draft-session.ts — MỘT NGƯỜI GHI NHÁP DUY NHẤT.
 *
 * ╔═ VÌ SAO CẦN FILE NÀY (vấn đề thật, không phải trừu tượng hoá thừa) ═════════╗
 * ║ Hợp đồng của R2-P1 (`features/design/contracts.ts`) mở HAI cửa vào phần     ║
 * ║ nháp, và cả hai đều hợp lệ:                                                 ║
 * ║   · màn gọi `useDraft({projectId, contract, dirty, baseVersion})`           ║
 * ║   · màn mount `<SafetyPanel api=… />`, mà panel cũng cần biết có nháp không ║
 * ║ Nếu mỗi bên tự chạy timer 2s thì cùng một khoá IDB bị ghi hai lần mỗi nhịp, ║
 * ║ và tệ hơn: hai bên tự đọc "có nháp" độc lập ⇒ user bị hỏi khôi phục hai lần ║
 * ║ ở hai chỗ khác nhau, bấm [Bỏ nháp] ở chỗ này thì chỗ kia vẫn hiện.          ║
 * ║                                                                             ║
 * ║ Ở đây: một phiên cho mỗi `projectId`, đếm số người đăng ký. Người ĐẦU TIÊN  ║
 * ║ mở phiên (đọc nháp cũ, bật timer), người cuối cùng rời thì đóng. Mọi         ║
 * ║ subscriber thấy CÙNG MỘT trạng thái và [Bỏ nháp] có tác dụng ở mọi nơi.     ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG dùng React ở tầng này ⇒ test được bằng Node thuần.
 */
import type { Contract } from "@/lib/types";
import { diffContracts } from "./diff";
import { dropDraft, readDraft, writeDraft, type DraftRecord } from "./drafts";

/** §3.7 "Autosave nháp IDB mỗi 2s". */
export const DRAFT_AUTOSAVE_MS = 2000;

export interface DraftSessionState {
  /** Nháp tìm thấy lúc mở màn, CHƯA được xử lý. `null` = không có gì để hỏi. */
  found: DraftRecord | null;
  /** Thời điểm ghi nháp gần nhất trong phiên này (ISO), `null` nếu chưa ghi lần nào. */
  savedAt: string | null;
  /** Đã đọc xong IDB chưa — banner không nên nhấp nháy trước khi biết. */
  scanned: boolean;
}

interface Session {
  projectId: string;
  refs: number;
  state: DraftSessionState;
  listeners: Set<(s: DraftSessionState) => void>;
  timer: ReturnType<typeof setTimeout> | null;
  /** ảnh chụp cuối đã ghi — không ghi lại y hệt. */
  lastWritten: Contract | null;
}

const sessions = new Map<string, Session>();

function emit(s: Session): void {
  for (const fn of s.listeners) fn(s.state);
}

function setState(s: Session, patch: Partial<DraftSessionState>): void {
  s.state = { ...s.state, ...patch };
  emit(s);
}

function getOrCreate(projectId: string): Session {
  const hit = sessions.get(projectId);
  if (hit) return hit;
  const s: Session = {
    projectId,
    refs: 0,
    state: { found: null, savedAt: null, scanned: false },
    listeners: new Set(),
    timer: null,
    lastWritten: null,
  };
  sessions.set(projectId, s);
  return s;
}

/**
 * Đăng ký vào phiên. Trả hàm huỷ đăng ký.
 * `serverContract` dùng để bỏ qua nháp trùng khít bản trên đĩa — hỏi user một câu
 * mà đáp án nào cũng như nhau là làm phiền vô ích.
 */
export function subscribeDraft(
  projectId: string,
  listener: (s: DraftSessionState) => void,
  serverContract: Contract | null,
): () => void {
  if (!projectId) return () => {};
  const s = getOrCreate(projectId);
  s.refs += 1;
  s.listeners.add(listener);
  listener(s.state);

  if (!s.state.scanned && s.refs === 1) {
    void (async () => {
      const rec = await readDraft(projectId);
      if (!sessions.has(projectId)) return;
      if (rec && serverContract && diffContracts(rec.contract, serverContract).identical) {
        void dropDraft(projectId);
        setState(s, { found: null, scanned: true });
        return;
      }
      setState(s, { found: rec, scanned: true });
    })();
  }

  return () => {
    s.listeners.delete(listener);
    s.refs -= 1;
    if (s.refs <= 0) {
      if (s.timer !== null) clearTimeout(s.timer);
      sessions.delete(projectId);
    }
  };
}

export function draftState(projectId: string): DraftSessionState {
  return sessions.get(projectId)?.state ?? { found: null, savedAt: null, scanned: false };
}

/**
 * Báo "contract vừa đổi" — hẹn ghi sau 2s (mỗi lần gọi lại dời hẹn).
 * Gọi bao nhiêu lần cũng chỉ có MỘT timer cho mỗi project.
 * `dirty === false` ⇒ huỷ hẹn: sạch thì không có gì để nháp.
 */
export function scheduleDraftWrite(
  projectId: string,
  args: { contract: Contract | null; dirty: boolean; baseVersion: number; label?: string },
): void {
  const s = sessions.get(projectId);
  if (!s) return;
  if (s.timer !== null) {
    clearTimeout(s.timer);
    s.timer = null;
  }
  if (!args.dirty || args.contract === null) return;
  if (args.contract === s.lastWritten) return;

  const { contract, baseVersion, label } = args;
  s.timer = setTimeout(() => {
    s.timer = null;
    void (async () => {
      const ok = await writeDraft(projectId, {
        contract,
        baseVersion,
        dirtyFields: label ? [label] : [],
      });
      if (!sessions.has(projectId)) return;
      if (ok) {
        s.lastWritten = contract;
        setState(s, { savedAt: new Date().toISOString() });
      }
    })();
  }, DRAFT_AUTOSAVE_MS);
}

/** User bấm [Bỏ nháp], hoặc lưu thành công ⇒ nháp hết nhiệm vụ. */
export function clearDraftSession(projectId: string): void {
  const s = sessions.get(projectId);
  void dropDraft(projectId);
  if (!s) return;
  if (s.timer !== null) {
    clearTimeout(s.timer);
    s.timer = null;
  }
  s.lastWritten = null;
  setState(s, { found: null, savedAt: null });
}

/** User đã trả lời câu hỏi khôi phục ⇒ đừng hỏi lại, nhưng GIỮ nháp trên đĩa. */
export function dismissFoundDraft(projectId: string): void {
  const s = sessions.get(projectId);
  if (!s) return;
  setState(s, { found: null });
}

/** Chỉ dùng trong test. */
export function _resetDraftSessions(): void {
  for (const s of sessions.values()) if (s.timer !== null) clearTimeout(s.timer);
  sessions.clear();
}
