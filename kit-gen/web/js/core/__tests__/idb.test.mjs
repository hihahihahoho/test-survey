/** Test cửa IndexedDB (arch §4.2): allowlist store + quét secret + dọn quota. */
import { describe, it, assert, eq, rejects } from './harness.mjs';
import * as idb from '../idb.js';
import { IDB_STORES } from '../constants.js';

/** IDBFactory giả tối giản, đủ cho put/get/delete/getAllKeys. */
function fakeIndexedDB({ quotaAfter = Infinity } = {}) {
  const data = new Map(Object.values(IDB_STORES).map((s) => [s, new Map()]));
  let writes = 0;
  return {
    open() {
      const req = {};
      setTimeout(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction(name) {
            const map = data.get(name);
            const t = {};
            const os = {
              put(value, key) {
                writes += 1;
                const r = {};
                if (writes > quotaAfter) {
                  setTimeout(() => { t.error = { name: 'QuotaExceededError' }; t.onerror?.(); }, 0);
                  return r;
                }
                map.set(key, value);
                setTimeout(() => t.oncomplete?.(), 0);
                return r;
              },
              get(key) { const r = { result: map.get(key) ?? null }; setTimeout(() => t.oncomplete?.(), 0); return r; },
              delete(key) { map.delete(key); setTimeout(() => t.oncomplete?.(), 0); return {}; },
              getAllKeys() { const r = { result: [...map.keys()] }; setTimeout(() => t.oncomplete?.(), 0); return r; },
            };
            t.objectStore = () => os;
            return t;
          },
        };
        req.onsuccess?.();
      }, 0);
      return req;
    },
    _data: data,
    _writes: () => writes,
  };
}

describe('idb.js — allowlist store + an toàn', () => {
  it('store lạ bị chặn', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB() });
    await rejects(idb.get('evil', 'k'), 'IDB_STORE_NOT_ALLOWED');
    await rejects(idb.set('secrets', 'k', {}), 'IDB_STORE_NOT_ALLOWED');
  });
  it('chỉ 3 store của §4.2 được phép', () => {
    eq(Object.values(IDB_STORES), ['drafts', 'thumbs', 'runlog']);
  });
  it('drafts: lưu + đọc lại được (nháp editor tầng 2 của X5)', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB() });
    eq(await idb.drafts.save('tet26', { contract: { sheets: [] }, baseVersion: 37, dirtyFields: ['sheets[0]'] }), true);
    const d = await idb.drafts.get('tet26');
    eq(d.baseVersion, 37);
    assert(typeof d.savedAt === 'string', 'phải có savedAt');
  });
  it('CHẶN ghi secret vào runlog (log codex có thể lẫn token — arch §4.3-6)', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB() });
    await rejects(
      idb.runlog.append('r-1', 'p1', ['Authorization: Bearer abcdef1234567890xyz']),
      'SECRET_BLOCKED',
    );
  });
  it('CHẶN ghi secret vào drafts', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB() });
    await rejects(idb.drafts.save('p1', { contract: { note: 'sk-abcdefghijklmnop12345678' }, baseVersion: 1 }), 'SECRET_BLOCKED');
  });
  it('runlog cắt còn 5000 dòng cuối', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB() });
    await idb.runlog.append('r-2', 'p1', Array.from({ length: 5200 }, (_, i) => `dòng ${i}`));
    const r = await idb.runlog.get('r-2');
    eq(r.lines.length, 5000);
    eq(r.lines[0], 'dòng 200');
  });
  it('thumbs: key gồm mtime để tự cache-bust', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB() });
    eq(idb.thumbs.key('p1', 'kits/a.png', 123), 'p1/kits/a.png@123');
    await idb.thumbs.put('p1', 'kits/a.png', 123, { fakeBlob: true });
    assert(await idb.thumbs.get('p1', 'kits/a.png', 123) !== null, 'phải đọc lại được');
    eq(await idb.thumbs.get('p1', 'kits/a.png', 999), null);
  });
  it('QuotaExceeded → dọn rồi thử lại, KHÔNG ném ra UI (§4.2)', async () => {
    idb.configure({ indexedDBImpl: fakeIndexedDB({ quotaAfter: 0 }) });
    const ok = await idb.set(IDB_STORES.thumbs, 'k', { b: 1 });
    eq(ok, false, 'trả false chứ không ném lỗi');
  });
  it('không có IndexedDB → trả null/false, app vẫn chạy', async () => {
    idb.configure({ indexedDBImpl: null });
    eq(idb.available(), false);
    eq(await idb.get(IDB_STORES.drafts, 'x'), null);
    eq(await idb.set(IDB_STORES.drafts, 'x', { contract: {} }), false);
  });
});
