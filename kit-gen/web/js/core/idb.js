/**
 * web/js/core/idb.js — cửa duy nhất tới IndexedDB (architecture §4.2). DB `kitgen` v1, 3 store:
 *   drafts  key=projectId  {contract, baseVersion, savedAt, dirtyFields}   nháp editor tự lưu 2s
 *   thumbs  key=`${projectId}/${relPath}@${mtimeMs}`  Blob PNG ≤256px
 *   runlog  key=runId      {projectId, lines[≤5000], updatedAt}            xem log khi agent đã tắt
 *
 * Luật: store lạ → throw. Nội dung ghi vào `drafts`/`runlog` bị QUÉT SECRET như localStorage
 * (log codex có thể lẫn token — arch §4.3-6; agent đã redact, đây là lớp phòng thủ thứ hai).
 * QuotaExceededError → dọn rồi thử LẠI MỘT LẦN, thất bại thì tắt cache chứ KHÔNG vỡ UI (§4.2).
 */

import { IDB_NAME, IDB_STORES, IDB_VERSION, LIMITS } from './constants.js';
import { assertNoSecret } from './secrets.js';

const STORE_NAMES = Object.freeze(Object.values(IDB_STORES));
let factory = null;
let dbPromise = null;
let disabled = false;

/** Tiêm IDBFactory (test dùng bản giả, hoặc tắt hẳn bằng null). */
export function configure({ indexedDBImpl } = {}) {
  factory = indexedDBImpl ?? null;
  dbPromise = null;
  disabled = false;
}

function theFactory() {
  if (factory !== null) return factory;
  return typeof indexedDB !== 'undefined' ? indexedDB : null;
}

function assertStore(name) {
  if (!STORE_NAMES.includes(name)) {
    const e = new Error(`Chặn: store "${name}" không có trong allowlist IndexedDB (architecture §4.2).`);
    e.name = 'StoreKeyError';
    e.code = 'IDB_STORE_NOT_ALLOWED';
    throw e;
  }
}

/** true nếu IDB dùng được. Không có IDB (Safari private) ⇒ app vẫn chạy, chỉ mất cache. */
export function available() { return !disabled && theFactory() !== null; }

function open() {
  if (!available()) return Promise.resolve(null);
  if (dbPromise !== null) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try { req = theFactory().open(IDB_NAME, IDB_VERSION); }
    catch { disabled = true; resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { disabled = true; resolve(null); };
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, name, mode, fn) {
  return new Promise((resolve, reject) => {
    let t;
    try { t = db.transaction(name, mode); } catch (e) { reject(e); return; }
    const req = fn(t.objectStore(name));
    t.oncomplete = () => resolve(req?.result ?? null);
    t.onerror = () => reject(t.error ?? req?.error ?? new Error('IDB transaction lỗi'));
    t.onabort = () => reject(t.error ?? new Error('IDB transaction bị huỷ'));
  });
}

/** Đọc. Lỗi/không có IDB → null (không bao giờ ném ra UI). */
export async function get(store, key) {
  assertStore(store);
  const db = await open();
  if (db === null) return null;
  try { return await tx(db, store, 'readonly', (os) => os.get(key)); }
  catch { return null; }
}

/**
 * Ghi. Quét secret trước (trừ thumbs vì là Blob ảnh).
 * QuotaExceeded → dọn theo tuổi rồi thử lại 1 lần (§4.2).
 * @returns {Promise<boolean>} true nếu ghi được
 */
export async function set(store, key, value) {
  assertStore(store);
  if (store !== IDB_STORES.thumbs) assertNoSecret(value, `idb.${store}`);
  const db = await open();
  if (db === null) return false;
  try {
    await tx(db, store, 'readwrite', (os) => os.put(value, key));
    return true;
  } catch (e) {
    if (e?.name !== 'QuotaExceededError') return false;
    await prune(store);
    try {
      await tx(db, store, 'readwrite', (os) => os.put(value, key));
      return true;
    } catch { return false; }   // vẫn hết chỗ → tắt cache, KHÔNG vỡ UI
  }
}

export async function del(store, key) {
  assertStore(store);
  const db = await open();
  if (db === null) return false;
  try { await tx(db, store, 'readwrite', (os) => os.delete(key)); return true; }
  catch { return false; }
}

export async function keys(store) {
  assertStore(store);
  const db = await open();
  if (db === null) return [];
  try { return (await tx(db, store, 'readonly', (os) => os.getAllKeys())) ?? []; }
  catch { return []; }
}

/** Dọn theo luật §4.2: runlog giữ 20 run gần nhất; thumbs quá hạn/quá cỡ thì xoá bớt. */
export async function prune(store) {
  assertStore(store);
  const all = await keys(store);
  if (store === IDB_STORES.runlog && all.length > LIMITS.runlogKeepRuns) {
    for (const k of all.slice(0, all.length - LIMITS.runlogKeepRuns)) await del(store, k);
    return;
  }
  if (store === IDB_STORES.thumbs && all.length > 0) {
    for (const k of all.slice(0, Math.ceil(all.length / 2))) await del(store, k);
  }
}

/* ── API tiện dụng cho màn hình (đúng 3 nhiệm vụ của §4.2) ─────────────── */

/** Nháp editor — tầng 2 của chốt X5 (tự lưu mỗi 2s, khôi phục sau khi đóng tab). */
export const drafts = {
  get: (projectId) => get(IDB_STORES.drafts, projectId),
  save: (projectId, { contract, baseVersion, dirtyFields = [] }) => set(IDB_STORES.drafts, projectId, {
    contract, baseVersion, dirtyFields, savedAt: new Date().toISOString(),
  }),
  drop: (projectId) => del(IDB_STORES.drafts, projectId),
};

/** Thumbnail đã tải (≤256px) — đóng H4, và để chế độ chỉ-đọc vẫn có ảnh (§2.5-4). */
export const thumbs = {
  key: (projectId, relPath, mtimeMs) => `${projectId}/${relPath}@${mtimeMs}`,
  get: (projectId, relPath, mtimeMs) => get(IDB_STORES.thumbs, thumbs.key(projectId, relPath, mtimeMs)),
  put: (projectId, relPath, mtimeMs, blob) => set(IDB_STORES.thumbs, thumbs.key(projectId, relPath, mtimeMs), blob),
};

/** Log của run — xem lại khi agent đã tắt, nhãn "bản lưu tạm" (§4.9). */
export const runlog = {
  get: (runId) => get(IDB_STORES.runlog, runId),
  append: async (runId, projectId, newLines) => {
    const cur = await get(IDB_STORES.runlog, runId);
    const lines = [...(cur?.lines ?? []), ...newLines].slice(-LIMITS.runlogMaxLines);
    return set(IDB_STORES.runlog, runId, { projectId, lines, updatedAt: new Date().toISOString() });
  },
};

export { IDB_STORES };
