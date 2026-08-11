/**
 * web/js/core/errors.js — LOGIC tra cứu lỗi: error.code → văn bản người dùng đọc (tiếng Việt).
 * Bảng dữ liệu nằm ở ./error-catalog.js. Nguồn: UX-SPEC §3.9 + §6.1, architecture §5.4.
 *
 * QUY TẮC BẤT DI BẤT DỊCH (§3.9, §6.5-6, audit E1–E5):
 *  1. Không màn nào tự viết copy lỗi riêng — mọi copy lấy từ bảng này qua present()/lookup().
 *  2. `error.message` (kỹ thuật) KHÔNG BAO GIỜ ra thân giao diện. Chỉ lấy qua devDetails(err)
 *     để đổ vào panel gập "Chi tiết cho lập trình viên ▾".
 *  3. Mã lạ (agent thêm sau) → lỗi generic, KHÔNG được vỡ UI.
 */

import {
  ACTIONS, ERROR_TABLE, IMAGEGEN_REASONS, WHERE, UNKNOWN_ENTRY, STATUS_FALLBACK,
} from './error-catalog.js';

export {
  ACTIONS, ERROR_TABLE, IMAGEGEN_REASONS, WHERE, UNKNOWN_ENTRY, STATUS_FALLBACK,
} from './error-catalog.js';

/** Mã do client tự sinh (không phải từ agent) — vẫn phải có copy người đọc được. */
export const CLIENT_CODES = Object.freeze({
  /** Alias lịch sử: một số màn/tài liệu gọi trạng thái "chưa thấy agent" là AGENT_OFFLINE. */
  AGENT_OFFLINE: 'AGENT_NOT_RUNNING',
  STARTING: 'AGENT_STARTING',
  INTERNAL: 'AGENT_INTERNAL',
  NETWORK: 'AGENT_NOT_RUNNING',
});

/** Chuẩn hoá mã: bỏ khoảng trắng, hoa hoá, đổi alias sang mã chính. */
export function canonicalCode(code) {
  if (typeof code !== 'string' || code.trim() === '') return null;
  const up = code.trim().toUpperCase().replace(/[-\s]+/g, '_');
  return CLIENT_CODES[up] ?? up;
}

/** true nếu bảng biết mã này (đã tính alias). */
export function isKnownCode(code) {
  const c = canonicalCode(code);
  return c !== null && Object.hasOwn(ERROR_TABLE, c);
}

/**
 * Tra bảng → phần hiển thị cho user. LUÔN trả về object dùng được (không bao giờ null).
 * KHÔNG chứa `message` kỹ thuật.
 */
export function lookup(code) {
  const c = canonicalCode(code);
  const hit = c !== null ? ERROR_TABLE[c] : undefined;
  const entry = hit ?? UNKNOWN_ENTRY;
  return Object.freeze({
    code: c ?? 'UNKNOWN',
    known: Boolean(hit),
    title: entry.title,
    explain: entry.explain,
    actions: Object.freeze(entry.actions.map((a) => Object.freeze({ ...a }))),
    where: Object.freeze([...entry.where]),
    severity: entry.severity,
    readOnly: entry.readOnly === true,
  });
}

/**
 * Phần hiển thị cho một lỗi bất kỳ (AgentError, envelope, hay Error thường).
 * Dùng ở MỌI chỗ vẽ lỗi. Tuyệt đối không đọc `err.message` để hiện ra thân UI.
 */
export function present(err) {
  const code = err && typeof err === 'object'
    ? (err.code ?? err?.error?.code ?? null) : null;
  const view = lookup(code);
  const details = err && typeof err === 'object' ? (err.details ?? err?.error?.details ?? null) : null;
  return Object.freeze({ ...view, details });
}

/**
 * Chuỗi kỹ thuật cho panel gập "Chi tiết cho lập trình viên ▾" — CHỖ DUY NHẤT
 * được phép chứa `message`, status, url, hint, docs.
 */
export function devDetails(err) {
  if (!err || typeof err === 'string') return String(err ?? '');
  const e = err.error && typeof err.error === 'object' ? err.error : err;
  const rows = [
    ['code', e.code], ['status', err.status ?? e.status], ['method', err.method],
    ['url', err.url], ['message', e.message ?? err.message], ['hint', e.hint],
    ['docs', e.docs], ['requestId', err.requestId],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  const details = e.details ?? err.details;
  let out = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  if (details && typeof details === 'object') {
    try { out += `\ndetails: ${JSON.stringify(details, null, 2)}`; } catch { /* vòng lặp tham chiếu */ }
  }
  return out;
}

export function imageGenReasonText(reason) {
  const key = typeof reason === 'string' ? reason.trim().toUpperCase() : '';
  return IMAGEGEN_REASONS[key] ?? IMAGEGEN_REASONS.UNKNOWN;
}

/** Danh sách mã bảng biết — dùng cho test & panel dev. */
export function knownCodes() { return Object.keys(ERROR_TABLE); }
