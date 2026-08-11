/**
 * design/state.js — AN TOÀN DỮ LIỆU của trình soạn (§3.7 + chốt X5 + MUST 'L' của §7.1).
 * Đóng issue #3 của audit (B1, B2, B4, B5, B6, R7).
 *
 * BA TẦNG KHÁC NHIỆM VỤ (chốt X5) — file này giữ tầng 1 & 2:
 *   1. Undo/Redo trong editor  ⌘Z/⇧⌘Z, ≥50 bước, sống trong phiên tab, mỗi bước CÓ NHÃN.
 *   2. Nháp tự lưu IndexedDB mỗi 2s (idb.drafts) → khôi phục sau khi đóng tab.
 *   3. Lịch sử bản lưu phía agent (#24/#25/#26) — nằm ở history-drawer.js.
 *
 * Ngoài ra: dirty flag, beforeunload, và LƯU có If-Match (#23) + xử lý 409 CONTRACT_CONFLICT.
 * KHÔNG chạm localStorage/IndexedDB trực tiếp: mọi thứ qua core/store.js và core/idb.js (§6.5-2).
 */

import { api, idb } from '../../core/index.js';

const UNDO_LIMIT = 50;
const DRAFT_DEBOUNCE_MS = 2000;

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/**
 * @param {{projectId:string, onChange:Function, onDirty?:Function}} opts
 */
export function createEditorState({ projectId, onChange, onDirty = null }) {
  /** @type {{contract:object, version:number}} */
  const state = { contract: null, version: 0, savedJson: '', lastSavedAt: null };
  /** past/future giữ SNAPSHOT + nhãn của thao tác đã dẫn tới snapshot đó. */
  const past = [];   // [{ json, label }]
  const future = [];
  let draftTimer = null;
  let draftSavedAt = null;
  let beforeUnloadBound = false;
  let disposed = false;

  const isDirty = () => state.contract !== null && json(state.contract) !== state.savedJson;

  function json(c) { return JSON.stringify(c); }

  function emit(reason) {
    if (disposed) return;
    if (onDirty) {
      try { onDirty(isDirty()); } catch { /* rail không được làm vỡ editor */ }
    }
    onChange({ reason, contract: state.contract, version: state.version, dirty: isDirty() });
  }

  /** Nạp bản từ agent (hoặc từ nháp). Reset undo stack — đây là mốc "đã lưu". */
  function load({ contract, version, markSaved = true }) {
    state.contract = clone(contract);
    state.version = Number(version) || 0;
    if (markSaved) state.savedJson = json(state.contract);
    past.length = 0;
    future.length = 0;
    emit('load');
  }

  /** Áp một thao tác từ ops.js. `result` = { contract, label }. */
  function apply(result) {
    if (!result || !result.contract || result.label === '') return false;
    if (json(result.contract) === json(state.contract)) return false;
    past.push({ json: json(state.contract), label: result.label });
    while (past.length > UNDO_LIMIT) past.shift();
    future.length = 0;
    state.contract = result.contract;
    scheduleDraft();
    emit('apply');
    return true;
  }

  function undo() {
    const step = past.pop();
    if (!step) return null;
    future.push({ json: json(state.contract), label: step.label });
    state.contract = JSON.parse(step.json);
    scheduleDraft();
    emit('undo');
    return step.label;
  }

  function redo() {
    const step = future.pop();
    if (!step) return null;
    past.push({ json: json(state.contract), label: step.label });
    state.contract = JSON.parse(step.json);
    scheduleDraft();
    emit('redo');
    return step.label;
  }

  /* ── Tầng 2: nháp IDB mỗi 2s ───────────────────────────────────────────── */

  function scheduleDraft() {
    if (typeof setTimeout !== 'function') return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, DRAFT_DEBOUNCE_MS);
  }

  async function saveDraftNow() {
    if (disposed || state.contract === null) return false;
    if (!isDirty()) { await idb.drafts.drop(projectId); draftSavedAt = null; return false; }
    const ok = await idb.drafts.save(projectId, {
      contract: state.contract,
      baseVersion: state.version,
      dirtyFields: [],
    });
    if (ok) draftSavedAt = new Date().toISOString();
    return ok;
  }

  /** Nháp đang có trên máy (gọi khi mở màn, TRƯỚC khi load bản của agent). */
  async function peekDraft() {
    const d = await idb.drafts.get(projectId);
    if (!d || !d.contract) return null;
    return { contract: d.contract, baseVersion: Number(d.baseVersion) || 0, savedAt: d.savedAt ?? null };
  }

  async function dropDraft() {
    draftSavedAt = null;
    return idb.drafts.drop(projectId);
  }

  /* ── LƯU (#23 PUT contract, If-Match bắt buộc) ─────────────────────────── */

  /**
   * @returns {Promise<{ok:true, version:number, validation?:object}
   *                  | {ok:false, conflict:true, error:AgentError}
   *                  | {ok:false, conflict:false, error:AgentError}>}
   */
  async function save() {
    if (state.contract === null) return { ok: false, conflict: false, error: new Error('Chưa nạp bản thiết kế') };
    const sending = json(state.contract);
    try {
      const res = await api.contract.save(projectId, state.version, state.contract);
      state.version = Number(res?.version) || state.version + 1;
      // Chỉ đánh dấu "đã lưu" đúng bản ĐÃ GỬI: user có thể sửa tiếp trong lúc chờ mạng.
      state.savedJson = sending;
      state.lastSavedAt = new Date().toISOString();
      if (!isDirty()) await dropDraft();
      emit('saved');
      return { ok: true, version: state.version, validation: res?.validation ?? null, snapshot: res?.snapshot ?? null };
    } catch (e) {
      // Thất bại KHÔNG được xoá state của user (§3-S3 bảng trạng thái, dòng "error (lưu thất bại khác)").
      await saveDraftNow();
      return { ok: false, conflict: e?.code === 'CONTRACT_CONFLICT', error: e };
    }
  }

  /** Xung đột 409 · [Ghi đè bằng bản của tôi]: nhận version của server rồi PUT lại. */
  async function saveOverwrite(serverVersion) {
    state.version = Number(serverVersion) || state.version;
    return save();
  }

  /** Xung đột 409 · [Tải lại bản trên đĩa]: mất thay đổi — chỉ gọi sau khi user xác nhận. */
  async function reloadFromDisk() {
    const res = await api.contract.get(projectId);
    load({ contract: res?.contract ?? { schemaVersion: 4, sheets: [], variants: [] }, version: res?.version ?? 0 });
    await dropDraft();
    return { version: state.version };
  }

  /* ── beforeunload khi bẩn (§3.7, đóng B5) ──────────────────────────────── */

  function bindBeforeUnload(win) {
    const w = win ?? (typeof window !== 'undefined' ? window : null);
    if (!w || beforeUnloadBound) return () => {};
    const handler = (e) => {
      if (!isDirty()) return undefined;
      // Nháp đã/đang được ghi; cảnh báo vẫn cần vì nháp ≠ đã lưu vào project.
      saveDraftNow();
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    w.addEventListener('beforeunload', handler);
    beforeUnloadBound = true;
    return () => { w.removeEventListener('beforeunload', handler); beforeUnloadBound = false; };
  }

  /**
   * QA-UX CAO-C · MẤT DỮ LIỆU THẬT — cửa sổ 2 giây.
   *
   * Nháp được ghi qua `scheduleDraft()` với debounce 2000ms. Bản cũ `destroy()` chỉ
   * `clearTimeout(draftTimer)` rồi đặt `disposed = true` ⇒ mọi thay đổi trong 2 giây
   * cuối trước khi rời màn bị HUỶ, không ghi vào đâu cả.
   *
   * Đo được (v8-flush): sửa element rồi rời màn sau 300ms ⇒ nháp trên IDB = null,
   * thay đổi mất trắng, KHÔNG có thông báo nào. Rời sau 2500ms thì giữ được.
   * Đây đúng là bệnh B5 của audit ("gõ 5 phút, đóng tab → mất sạch") mà bản v2 sinh
   * ra để chữa, chỉ là cửa sổ hẹp hơn nên không ai bắt được: mọi test đều chờ >2s.
   *
   * Bản vá: ĐỔ nháp đang nợ ra đĩa TRƯỚC khi đánh dấu disposed. `destroy()` phải giữ
   * chữ ký đồng bộ (shell gọi nó không await), nên flush là fire-and-forget — nhưng
   * `saveDraftNow()` được gọi khi `disposed` VẪN false nên nó chạy tới cùng.
   */
  function destroy() {
    clearTimeout(draftTimer);
    const pending = isDirty();
    if (pending) {
      // Không await: shell gọi destroy() đồng bộ. Promise vẫn chạy tới khi xong.
      Promise.resolve(saveDraftNow()).catch(() => { /* IDB chặn ⇒ đã có banner cảnh báo */ });
    }
    disposed = true;
  }

  return {
    /* đọc */
    get contract() { return state.contract; },
    get version() { return state.version; },
    get dirty() { return isDirty(); },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    get undoLabel() { return past.length ? past[past.length - 1].label : null; },
    get redoLabel() { return future.length ? future[future.length - 1].label : null; },
    get stepCount() { return past.length; },
    get lastSavedAt() { return state.lastSavedAt; },
    get draftSavedAt() { return draftSavedAt; },
    /** Số thay đổi chưa lưu (nhãn nút "Lưu (3)") — đếm bước undo từ mốc đã lưu. */
    get pendingCount() { return isDirty() ? Math.max(1, past.length) : 0; },
    /* ghi */
    load, apply, undo, redo,
    save, saveOverwrite, reloadFromDisk,
    peekDraft, dropDraft, saveDraftNow,
    bindBeforeUnload, destroy,
  };
}
