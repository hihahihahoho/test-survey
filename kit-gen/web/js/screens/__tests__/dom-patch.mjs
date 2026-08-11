/* dom-patch.mjs — dùng LẠI minidom của team design system (chỉ đọc, không sửa file họ)
   rồi bổ sung đúng những API mà màn SETUP/PROJECTS cần: replaceChildren, prepend,
   hidden, crypto.subtle, URL.createObjectURL, CustomEvent, localStorage.
   Đây KHÔNG phải trình duyệt thật — nó chứng minh: module nạp được, mount không throw,
   và cấu trúc DOM/ARIA sinh ra đúng như mong đợi. */
import { Node, document } from '../../ui/__tests__/minidom.mjs';
import { createHash, webcrypto } from 'node:crypto';

Node.prototype.replaceChildren = function replaceChildren(...kids) {
  this.childNodes = [];
  for (const k of kids) {
    if (k === null || k === undefined || k === false || k === '') continue;
    this.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return this;
};
Node.prototype.prepend = function prepend(...kids) {
  const first = this.childNodes[0] ?? null;
  for (const k of kids) {
    if (!k) continue;
    if (first) this.insertBefore(k, first); else this.appendChild(k);
  }
  return this;
};
Node.prototype.append = function append(...kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false || k === '') continue;
    this.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
  return this;
};
Node.prototype.scrollIntoView = function scrollIntoView() {};
Object.defineProperty(Node.prototype, 'children', {
  get() { return this.childNodes.filter((c) => c instanceof Node); },
  configurable: true,
});
Object.defineProperty(Node.prototype, 'hidden', {
  get() { return this.getAttribute('hidden') !== null; },
  set(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); },
  configurable: true,
});
Object.defineProperty(Node.prototype, 'isContentEditable', { get() { return false; }, configurable: true });

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto ?? {
      subtle: { async digest(_a, bytes) { return createHash('sha256').update(Buffer.from(bytes)).digest().buffer; } },
    },
    configurable: true,
  });
}
globalThis.URL.createObjectURL = () => 'blob:kg-test';
globalThis.URL.revokeObjectURL = () => {};
// Node ≥18 đã có Blob/File thật → dùng bản thật để FormData/File hoạt động đúng.
// Chỉ tạo bản tối giản khi môi trường thiếu hẳn.
if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(parts = []) { this.size = parts.reduce((n, p) => n + (p.length ?? p.byteLength ?? 0), 0); }
  };
}
globalThis.CustomEvent = class CustomEvent { constructor(t, o = {}) { this.type = t; this.detail = o.detail; } };
Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: { protocol: 'https:', hostname: 'kitgen.pages.dev', pathname: '/', origin: 'https://kitgen.pages.dev', hash: '', search: '', href: 'https://kitgen.pages.dev/', reload() {} } });
globalThis.history = { pushState() {}, replaceState() {} };
globalThis.setTimeout = globalThis.setTimeout;

/** localStorage giả để store.js chạy thật (allowlist + dò secret hoạt động y như trên web). */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
  _dump: () => Object.fromEntries(mem),
};
globalThis.indexedDB = undefined;

export { document, Node };
export const storageDump = () => Object.fromEntries(mem);
