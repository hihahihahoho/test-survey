/**
 * web/js/core/store.js — CỬA DUY NHẤT ghi/đọc state trình duyệt (architecture §4.1 + §4.4, UX-SPEC §6.5-2).
 * Mọi màn hình PHẢI đi qua đây; cấm gọi localStorage/sessionStorage trực tiếp ở component.
 *
 * Bốn lớp bảo vệ thi công trong file này:
 *   L1 allowlist khoá tường minh  → key ngoài bảng §4.1 ⇒ throw StoreKeyError
 *   L2 schema `.strict()`         → field lạ bị LOẠI BỎ (schemas.js)
 *   L3 bộ dò secret              → trúng tên field HOẶC pattern giá trị ⇒ throw SecretLeakError, KHÔNG ghi
 *   L4 baseUrl bị giới hạn        → chỉ loopback + cổng trong portCandidates, hoặc mirror same-origin
 *
 * Chỉ được lưu: workspace (nhãn+id), tuỳ chọn UI, cache danh sách project, id project đang mở,
 * enum mode image-gen, trạng thái setup. Không gì khác.
 */

import { LOOPBACK_HOSTS, LS_KEYS, PORT_CANDIDATES } from './constants.js';
import { SCHEMAS, allowedKeys, coerce, defaultsFor, isAllowedKey } from './schemas.js';
import { SecretLeakError, StoreKeyError, assertNoSecret } from './secrets.js';

export { SecretLeakError, StoreKeyError } from './secrets.js';
export { LS_KEYS } from './constants.js';
export { allowedKeys } from './schemas.js';

/** Backend lưu trữ — thay được để test không cần DOM. */
let backend = detectBackend();
const memory = new Map();
const listeners = new Set();
/** Cache trong RAM để đọc nhanh và để vẫn hoạt động khi localStorage bị chặn (Safari private). */
const cache = new Map();

function detectBackend() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__kitgen_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch { return null; } // private mode / storage bị chặn → chạy bằng RAM, không vỡ UI
}

/** Chỉ dùng cho test: tiêm backend giả (Map-like theo API Storage). */
export function _setBackend(b) { backend = b; cache.clear(); memory.clear(); }
export function _memoryBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _dump: () => Object.fromEntries(m),
  };
}

function rawGet(key) {
  if (backend) { try { return backend.getItem(key); } catch { /* quota/chặn */ } }
  return memory.has(key) ? memory.get(key) : null;
}
function rawSet(key, value) {
  if (backend) {
    try { backend.setItem(key, value); return true; }
    catch { /* QuotaExceeded → hạ xuống RAM, arch §4.2 "không vỡ UI" */ }
  }
  memory.set(key, value);
  return false;
}
function rawRemove(key) {
  if (backend) { try { backend.removeItem(key); } catch { /* noop */ } }
  memory.delete(key);
}

/**
 * L4: baseUrl chỉ được là loopback với cổng trong portCandidates, hoặc origin của bản mirror.
 * Đóng §6.5-3 ("không lưu baseUrl do user gõ tự do").
 */
export function isAllowedBaseUrl(baseUrl, portCandidates = PORT_CANDIDATES) {
  if (typeof baseUrl !== 'string' || baseUrl === '') return false;
  let u;
  try { u = new URL(baseUrl); } catch { return false; }
  if (u.username !== '' || u.password !== '') return false;
  if (u.search !== '' || u.hash !== '') return false;
  if (u.pathname !== '/' && u.pathname !== '') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const isLoopback = LOOPBACK_HOSTS.includes(host) || LOOPBACK_HOSTS.includes(u.hostname);
  if (!isLoopback) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  return portCandidates.includes(port);
}

function assertBaseUrl(key, value) {
  if (key !== LS_KEYS.agent) return;
  const base = value?.baseUrl;
  if (base === undefined || base === '') return;
  const ports = Array.isArray(value?.portCandidates) && value.portCandidates.length > 0
    ? value.portCandidates : PORT_CANDIDATES;
  if (!isAllowedBaseUrl(base, ports)) {
    const err = new Error(
      `Chặn ghi: baseUrl không nằm trong danh sách cho phép (loopback + cổng ${ports.join('/')}).`,
    );
    err.name = 'StoreValueError';
    err.code = 'BASEURL_NOT_ALLOWED';
    throw err;
  }
}

/** Đọc một khoá. Luôn trả về object đã trộn với default (không bao giờ undefined cho khoá hợp lệ). */
export function get(key) {
  if (!isAllowedKey(key)) throw new StoreKeyError(key);
  if (cache.has(key)) return cache.get(key);
  const raw = rawGet(key);
  const def = defaultsFor(key);
  if (raw === null) { cache.set(key, def); return def; }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { rawRemove(key); cache.set(key, def); return def; }   // dữ liệu rác → về mặc định
  const { value } = coerce(SCHEMAS[key], parsed, '$');
  const merged = { ...def, ...value };
  cache.set(key, merged);
  return merged;
}

/**
 * Ghi TOÀN BỘ giá trị của một khoá (đã qua L1→L4).
 * @throws {StoreKeyError} khoá lạ · @throws {SecretLeakError} nghi có secret
 */
export function set(key, value) {
  if (!isAllowedKey(key)) throw new StoreKeyError(key);           // L1
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    const err = new Error(`Chặn ghi: giá trị của "${key}" phải là object JSON.`);
    err.name = 'StoreValueError';
    err.code = 'STORE_VALUE_INVALID';
    throw err;
  }
  const { value: clean, dropped } = coerce(SCHEMAS[key], value, '$');   // L2
  assertNoSecret(clean, key);                                          // L3
  assertBaseUrl(key, clean);                                           // L4
  const merged = { ...defaultsFor(key), ...clean };
  rawSet(key, JSON.stringify(merged));
  cache.set(key, merged);
  emit(key, merged, dropped);
  return { value: merged, dropped };
}

/** Ghi một phần (merge nông ở tầng field gốc). Vẫn đi qua đủ 4 lớp. */
export function patch(key, partial) {
  if (!isAllowedKey(key)) throw new StoreKeyError(key);
  if (partial === null || typeof partial !== 'object' || Array.isArray(partial)) {
    const err = new Error(`Chặn ghi: patch của "${key}" phải là object JSON.`);
    err.name = 'StoreValueError';
    err.code = 'STORE_VALUE_INVALID';
    throw err;
  }
  // Quét secret trên INPUT THÔ trước: nếu không, field lạ chứa token sẽ bị coerce loại bỏ
  // âm thầm và ta mất cơ hội báo cho dev biết họ vừa suýt ghi secret.
  assertNoSecret(partial, `${key}(patch)`);
  return set(key, { ...get(key), ...partial });
}

/** Xoá một khoá (về mặc định). */
export function remove(key) {
  if (!isAllowedKey(key)) throw new StoreKeyError(key);
  rawRemove(key);
  cache.delete(key);
  emit(key, defaultsFor(key), []);
}

/** Xoá mọi khoá của app (dùng khi workspaceFingerprint đổi — arch §5.2). */
export function clearAll() {
  for (const key of allowedKeys()) { rawRemove(key); cache.delete(key); }
  emit('*', null, []);
}

/** Dọn cache danh sách project khi đổi workspace (WORKSPACE_CHANGED §3.9). */
export function invalidateProjectsCache() { remove(LS_KEYS.projectsCache); }

/** Đăng ký nghe thay đổi. Trả về hàm huỷ. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function emit(key, value, dropped) {
  for (const fn of listeners) {
    try { fn({ key, value, dropped }); } catch { /* listener lỗi không được phá store */ }
  }
}

/**
 * Kiểm định: trả về danh sách khoá LẠ đang có trong localStorage với tiền tố kitgen.
 * Dùng cho test e2e "tập key ⊆ allowlist" (arch §4.4 lớp 5b).
 */
export function auditForeignKeys() {
  const found = [];
  if (!backend) return found;
  try {
    for (let i = 0; i < backend.length; i += 1) {
      const k = backend.key(i);
      if (typeof k === 'string' && k.startsWith('kitgen.') && !isAllowedKey(k)) found.push(k);
    }
  } catch { /* noop */ }
  return found;
}

/** Tiện dụng cho màn hình: id project đang mở / gần đây (arch §4.1 kitgen.recent.v1). */
export function rememberOpenedProject(projectId) {
  if (typeof projectId !== 'string' || projectId === '') return;
  const cur = get(LS_KEYS.recent);
  const ids = [projectId, ...(cur.projectIds ?? []).filter((x) => x !== projectId)].slice(0, 10);
  return patch(LS_KEYS.recent, { projectIds: ids, lastOpenedId: projectId });
}

export const keys = LS_KEYS;
