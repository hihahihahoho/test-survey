/**
 * Test AN TOÀN DỮ LIỆU (§3.7 + chốt X5): undo/redo ≥50 bước có nhãn, dirty flag,
 * nháp IDB, lưu có If-Match, và 3 lối ra của xung đột 409.
 */
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import * as idb from '../../core/idb.js';
import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import { IDB_STORES } from '../../core/constants.js';
import { jsonResponse, mockFetch } from '../../core/__tests__/mock-fetch.mjs';
import { createEditorState } from '../design/state.js';
import * as ops from '../design/ops.js';

/** IDBFactory giả (cùng khuôn với core/__tests__/idb.test.mjs). */
function fakeIndexedDB() {
  const data = new Map(Object.values(IDB_STORES).map((s) => [s, new Map()]));
  return {
    _data: data,
    open() {
      const req = {};
      setTimeout(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction(name) {
            const map = data.get(name);
            const t = {};
            const os = {
              put(value, key) { map.set(key, value); setTimeout(() => t.oncomplete?.(), 0); return {}; },
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
  };
}

const comp = (f) => ({ file: f, vi: f, spec: 's', skel: { shape: 'pill', w: 0.8, h: 0.4 } });
const c0 = () => ({
  schemaVersion: 4,
  sheets: [{ id: 'main', grid: { cols: 2, rows: 1 }, orient: 'landscape', components: [comp('01-a'), comp('02-b')] }],
  variants: [{ id: 'tet', vi: 'Tết' }],
});

function setup({ fetchHandler = () => jsonResponse({}) } = {}) {
  store._setBackend(store._memoryBackend());
  idb.configure({ indexedDBImpl: fakeIndexedDB() });
  const f = mockFetch(fetchHandler);
  agent.configure({
    fetchImpl: f, baseUrl: 'http://127.0.0.1:8765',
    location: { protocol: 'https:', hostname: 'kitgen.pages.dev', origin: 'https://kitgen.pages.dev', pathname: '/' },
  });
  return f;
}

describe('dirty flag + nút Lưu (đóng B6)', () => {
  it('vừa nạp là SẠCH', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    assert(!s.dirty);
    eq(s.pendingCount, 0);
    eq(s.version, 37);
  });
  it('sửa là BẨN, đếm được số thay đổi', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    assert(s.dirty);
    eq(s.pendingCount, 1);
    s.apply(ops.patchCell(s.contract, 'main', 1, { vi: 'đổi' }));
    eq(s.pendingCount, 2);
  });
  it('sửa rồi hoàn tác về đúng bản cũ ⇒ SẠCH LẠI (so nội dung, không so số bước)', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    s.undo();
    assert(!s.dirty, 'undo về mốc đã lưu thì phải sạch');
  });
  it('onDirty được gọi để rail hiện dấu •', () => {
    setup();
    const seen = [];
    const s = createEditorState({ projectId: 'p1', onChange: () => {}, onDirty: (d) => seen.push(d) });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    eq(seen, [false, true]);
  });
});

describe('undo/redo ≥50 bước, mỗi bước có NHÃN tiếng Việt (đóng B1)', () => {
  it('giữ được 50 bước', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    for (let i = 0; i < 60; i += 1) {
      s.apply(ops.patchCell(s.contract, 'main', 0, { vi: `v${i}` }, `Sửa nhãn lần ${i}`));
    }
    eq(s.stepCount, 50, 'đúng hạn 50 bước');
    assert(s.canUndo);
  });
  it('nhãn undo/redo đọc được (hiện ở tooltip)', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 1));
    eq(s.undoLabel, 'Bỏ «02-b» khỏi sheet «main»');
    const undone = s.undo();
    eq(undone, 'Bỏ «02-b» khỏi sheet «main»');
    eq(s.redoLabel, 'Bỏ «02-b» khỏi sheet «main»');
  });
  it('undo rồi redo trả về đúng nội dung', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    const before = JSON.stringify(s.contract);
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const after = JSON.stringify(s.contract);
    s.undo();
    eq(JSON.stringify(s.contract), before);
    s.redo();
    eq(JSON.stringify(s.contract), after);
  });
  it('thao tác mới XOÁ nhánh redo (không trộn lịch sử)', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    s.undo();
    assert(s.canRedo);
    s.apply(ops.clearCell(s.contract, 'main', 1));
    assert(!s.canRedo, 'redo phải bị xoá');
  });
  it('thao tác KHÔNG đổi gì thì không vào undo stack', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    eq(s.apply(ops.swapCells(s.contract, 'main', 0, 0)), false);
    eq(s.stepCount, 0);
    eq(s.apply(ops.removeSheet(s.contract, 'không-có')), false);
    eq(s.stepCount, 0);
  });
  it('undo khi rỗng trả null, không ném', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    eq(s.undo(), null);
    eq(s.redo(), null);
  });
});

describe('nháp tự lưu IndexedDB (tầng 2 của X5)', () => {
  it('ghi nháp kèm baseVersion, đọc lại được', async () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    await s.saveDraftNow();
    const d = await s.peekDraft();
    assert(d, 'phải có nháp');
    eq(d.baseVersion, 37);
    eq(d.contract.sheets[0].components[0].file, '');
    assert(d.savedAt, 'phải có mốc thời gian để hiện "nháp từ 14:32"');
  });
  it('sạch thì nháp được DỌN (không hỏi khôi phục vô nghĩa)', async () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    await s.saveDraftNow();
    assert(await s.peekDraft());
    s.undo();
    await s.saveDraftNow();
    eq(await s.peekDraft(), null);
  });
  /* QA-UX CAO-C — MẤT DỮ LIỆU trong cửa sổ debounce 2 giây.
     Bản cũ: destroy() chỉ clearTimeout(draftTimer) ⇒ mọi thay đổi trong 2s cuối
     trước khi rời màn bị huỷ, không ghi vào đâu, KHÔNG thông báo.
     Vì sao lọt: mọi ca cũ đều gọi `await s.saveDraftNow()` TAY hoặc chờ >2s, nên
     đường destroy-khi-còn-nợ chưa bao giờ được đi qua. */
  it('[UX CAO-C] rời màn TRONG 2s debounce: nháp phải được đổ ra đĩa, không mất', async () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 9 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    assert(s.dirty, 'phải đang bẩn');
    // CỐ Ý không await saveDraftNow() và không chờ hết 2000ms — đúng ca người dùng
    // bấm sang màn khác ngay sau khi sửa.
    s.destroy();
    await new Promise((r) => setTimeout(r, 60));
    const s2 = createEditorState({ projectId: 'p1', onChange: () => {} });
    const d = await s2.peekDraft();
    assert(d, 'nháp PHẢI còn — nếu null thì thay đổi của người dùng đã mất trắng');
    eq(d.contract.sheets[0].components[0].file, '', 'nháp phải chứa đúng thay đổi vừa làm');
    eq(d.baseVersion, 9);
  });

  it('[UX CAO-C] màn đang SẠCH thì destroy() không ghi rác vào IDB', async () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 9 });
    s.destroy();
    await new Promise((r) => setTimeout(r, 60));
    const s2 = createEditorState({ projectId: 'p1', onChange: () => {} });
    eq(await s2.peekDraft(), null, 'sạch thì KHÔNG được tạo nháp');
  });

  it('không có IndexedDB (Safari private) thì KHÔNG vỡ', async () => {
    store._setBackend(store._memoryBackend());
    idb.configure({ indexedDBImpl: null });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    eq(await s.saveDraftNow(), false);
    eq(await s.peekDraft(), null);
    assert(s.dirty, 'editor vẫn hoạt động bình thường');
  });
});

describe('LƯU: If-Match bắt buộc (§6.5-4) + 3 lối ra của 409', () => {
  it('PUT gửi If-Match đúng version đang mở', async () => {
    const f = setup({ fetchHandler: () => jsonResponse({ version: 38, hash: 'x', validation: { errors: [], warnings: [] } }) });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const r = await s.save();
    assert(r.ok, 'phải lưu được');
    const call = f.calls.at(-1);
    eq(call.method, 'PUT');
    eq(call.headers['If-Match'], '37');
    eq(s.version, 38, 'version tăng theo phản hồi agent');
    assert(!s.dirty, 'lưu xong là sạch');
  });
  it('lưu xong thì nháp được dọn', async () => {
    setup({ fetchHandler: () => jsonResponse({ version: 2 }) });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    await s.saveDraftNow();
    await s.save();
    eq(await s.peekDraft(), null);
  });
  it('409 CONTRACT_CONFLICT: KHÔNG mất thay đổi, nháp vẫn được ghi', async () => {
    setup({
      fetchHandler: () => jsonResponse(
        { error: { code: 'CONTRACT_CONFLICT', message: 'v37 != v38', details: { serverVersion: 38, diffSummary: { added: 1, removed: 0 } } } },
        { status: 409 },
      ),
    });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const r = await s.save();
    eq([r.ok, r.conflict], [false, true]);
    eq(r.error.details.serverVersion, 38);
    assert(s.dirty, 'thay đổi của user PHẢI còn');
    eq(s.contract.sheets[0].components[0].file, '');
    assert(await s.peekDraft(), 'nháp phải được ghi để không mất khi đóng tab');
  });
  it('lối ra 1 · Ghi đè: PUT lại với version của server', async () => {
    let n = 0;
    const f = setup({
      fetchHandler: () => {
        n += 1;
        if (n === 1) return jsonResponse({ error: { code: 'CONTRACT_CONFLICT', message: 'x', details: { serverVersion: 38 } } }, { status: 409 });
        return jsonResponse({ version: 39 });
      },
    });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const first = await s.save();
    assert(first.conflict);
    const second = await s.saveOverwrite(38);
    assert(second.ok);
    eq(f.calls.at(-1).headers['If-Match'], '38', 'phải dùng version của server');
    eq(s.version, 39);
  });
  it('lối ra 2 · Tải lại bản trên đĩa: mất thay đổi có chủ ý, nháp bị dọn', async () => {
    const serverContract = { schemaVersion: 4, sheets: [], variants: [{ id: 'x' }] };
    setup({ fetchHandler: ({ init }) => (init.method === 'GET'
      ? jsonResponse({ version: 38, contract: serverContract })
      : jsonResponse({ error: { code: 'CONTRACT_CONFLICT', message: 'x', details: { serverVersion: 38 } } }, { status: 409 })) });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 37 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    await s.save();
    await s.reloadFromDisk();
    eq(s.version, 38);
    eq(s.contract.sheets, []);
    assert(!s.dirty);
    eq(await s.peekDraft(), null);
  });
  it('lỗi lưu KHÁC (500) cũng không xoá state + vẫn ghi nháp', async () => {
    setup({ fetchHandler: () => jsonResponse({ error: { code: 'AGENT_INTERNAL', message: 'boom' } }, { status: 500 }) });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 5 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const r = await s.save();
    eq([r.ok, r.conflict], [false, false]);
    assert(s.dirty);
    eq(s.version, 5, 'version không được nhảy khi lưu thất bại');
    assert(await s.peekDraft());
  });
  it('agent tắt (fetch ném) → không ném ra UI, trả kết quả dùng được', async () => {
    setup({ fetchHandler: () => new TypeError('Failed to fetch') });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const r = await s.save();
    eq(r.ok, false);
    eq(r.error.code, 'AGENT_NOT_RUNNING');
    assert(s.dirty);
  });
  it('sửa tiếp TRONG LÚC lưu thì vẫn còn dấu bẩn (không đánh dấu sai)', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    setup({ fetchHandler: async () => { await gate; return jsonResponse({ version: 2 }); } });
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const p = s.save();
    s.apply(ops.patchCell(s.contract, 'main', 1, { vi: 'sửa trong lúc lưu' }));
    release();
    await p;
    assert(s.dirty, 'thay đổi sau khi bấm Lưu vẫn phải được coi là chưa lưu');
  });
});

describe('beforeunload chỉ cảnh báo khi BẨN (đóng B5)', () => {
  function fakeWin() {
    const handlers = {};
    return {
      addEventListener: (t, h) => { handlers[t] = h; },
      removeEventListener: (t) => { delete handlers[t]; },
      fire(t) {
        let prevented = false;
        const e = { preventDefault: () => { prevented = true; }, returnValue: undefined };
        const r = handlers[t]?.(e);
        return { prevented, returnValue: e.returnValue, result: r };
      },
      has: (t) => Boolean(handlers[t]),
    };
  }
  it('sạch → không chặn rời trang', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    const w = fakeWin();
    s.bindBeforeUnload(w);
    eq(w.fire('beforeunload').prevented, false);
  });
  it('bẩn → chặn + ghi nháp', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    s.apply(ops.clearCell(s.contract, 'main', 0));
    const w = fakeWin();
    s.bindBeforeUnload(w);
    const r = w.fire('beforeunload');
    eq(r.prevented, true);
    eq(r.returnValue, '');
  });
  it('huỷ đăng ký được khi rời màn', () => {
    setup();
    const s = createEditorState({ projectId: 'p1', onChange: () => {} });
    s.load({ contract: c0(), version: 1 });
    const w = fakeWin();
    const off = s.bindBeforeUnload(w);
    assert(w.has('beforeunload'));
    off();
    assert(!w.has('beforeunload'));
  });
});
