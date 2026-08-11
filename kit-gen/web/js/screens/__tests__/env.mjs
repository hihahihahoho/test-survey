/* Môi trường test cho các màn: minidom của team design system + những thứ màn cần
   (location/history cho router, timer, clipboard). KHÔNG phải trình duyệt thật —
   nó chứng minh: module chạy được, DOM/ARIA sinh ra đúng, luồng dữ liệu đúng. */
import '../../ui/__tests__/minidom.mjs';

const doc = globalThis.document;

/* document.getElementById + querySelector ở tầng document (minidom chỉ có ở Node) */
doc.getElementById = (id) => doc.body.querySelectorAll(`[id=${id}]`)[0] ?? null;
doc.querySelector = (sel) => doc.body.querySelector(sel);
doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);

/* location + history đủ cho core/router.js chạy ở chế độ history */
const loc = {
  protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1:8765',
  origin: 'http://127.0.0.1:8765', pathname: '/', search: '', hash: '', href: 'http://127.0.0.1:8765/',
};
globalThis.location = loc;
globalThis.history = {
  entries: [],
  pushState(state, _t, url) { this.entries.push({ state, url }); applyUrl(url); },
  replaceState(state, _t, url) { this.entries.push({ state, url, replace: true }); applyUrl(url); },
};
function applyUrl(url) {
  const s = String(url ?? '/');
  const qi = s.indexOf('?');
  loc.pathname = qi === -1 ? s : s.slice(0, qi);
  loc.search = qi === -1 ? '' : s.slice(qi);
  loc.href = `${loc.origin}${s}`;
}

/* CSS.escape đã có; thêm requestAnimationFrame cho chắc */
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

/** localStorage giả (store.js tự dò; đưa bản Map-like để test đo được key đã ghi). */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
  _dump: () => Object.fromEntries(mem),
};

export { doc as document, loc as location, mem as storageMap };

/** Chờ mọi microtask + timer 0 xử lý xong (các màn nạp dữ liệu bằng async). */
export function flush(times = 8) {
  let p = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    p = p.then(() => new Promise((r) => { setTimeout(r, 0); }));
  }
  return p;
}

/** Dựng một container mới trong body. */
export function mountPoint() {
  const n = doc.createElement('div');
  doc.body.appendChild(n);
  return n;
}

/** Toàn bộ text của một cây node — để test kiểm "có nói ra chữ này không". */
export function textOf(node) { return String(node?.textContent ?? ''); }

/** Mọi node khớp selector trong cây (kể cả overlay ở body). */
export function allIn(node, sel) { return node.querySelectorAll(sel); }
