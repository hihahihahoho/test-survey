/**
 * dom-extra.mjs — bổ sung cho web/js/ui/__tests__/minidom.mjs những API mà màn S3/S4 dùng
 * mà DOM giả của team d1 chưa có: createElementNS (SVG silhouette), createDocumentFragment
 * (LogView bơm theo lô), document.head/title, URL.createObjectURL (tải log).
 *
 * KHÔNG sửa file của team khác — chỉ bọc thêm ở đây (đúng luật sở hữu file).
 */
import { document, Node } from '../../ui/__tests__/minidom.mjs';

if (!document.createElementNS) {
  document.createElementNS = (ns, tag) => {
    const n = new Node(tag);
    n.namespaceURI = ns;
    // innerHTML của SVG chỉ nhận chuỗi do shapes.js sinh (số + màu hằng); ở DOM giả
    // ta chỉ cần lưu lại để test kiểm được là có nội dung.
    Object.defineProperty(n, 'innerHTML', {
      get() { return this._html ?? ''; },
      set(v) { this._html = String(v); },
      configurable: true,
    });
    return n;
  };
}
if (!document.createDocumentFragment) {
  document.createDocumentFragment = () => {
    const f = new Node('#fragment');
    f.isFragment = true;
    return f;
  };
}
if (!document.head) {
  document.head = new Node('head');
  document.documentElement.appendChild(document.head);
}
if (!document.getElementById) {
  document.getElementById = (id) => document.documentElement.querySelectorAll(`[id="${id}"]`)[0] ?? null;
}
/* ── Bù các API DOM CHUẨN mà minidom của d1 chưa có ─────────────────────────
   Đây là API thật của trình duyệt (Node.replaceChild, DOMTokenList.toggle,
   Element.append), màn của tôi dùng đúng chuẩn — chỉ DOM giả trong test thiếu.
   Không sửa file của team khác: bọc thêm tại đây. */
if (!Node.prototype.replaceChild) {
  Node.prototype.replaceChild = function replaceChild(next, old) {
    const i = this.childNodes.indexOf(old);
    if (i === -1) throw new Error('replaceChild: node không phải con');
    this.childNodes[i] = next;
    next.parentNode = this;
    old.parentNode = null;
    return old;
  };
}
{
  const proto = Object.getPrototypeOf(new Node('div').classList);
  if (!proto.toggle) {
    proto.toggle = function toggle(cls, force) {
      const on = force === undefined ? !this.contains(cls) : Boolean(force);
      if (on) this.add(cls); else this.remove(cls);
      return on;
    };
  }
}
if (!Node.prototype.append) {
  Node.prototype.append = function append(...nodes) {
    for (const n of nodes) this.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
  };
}
/** Fragment: appendChild phải nhấc con của fragment lên cha thật (như DOM chuẩn). */
{
  const origAppend = Node.prototype.appendChild;
  Node.prototype.appendChild = function appendChild(c) {
    if (c && c.isFragment) {
      for (const child of [...c.childNodes]) origAppend.call(this, child);
      c.childNodes = [];
      return c;
    }
    return origAppend.call(this, c);
  };
}

/** DOM thật: setAttribute('disabled'|'hidden') bật luôn property; minidom thì không. */
{
  const origSet = Node.prototype.setAttribute;
  Node.prototype.setAttribute = function setAttribute(k, v) {
    origSet.call(this, k, v);
    if (k === 'disabled') this.disabled = true;
    if (k === 'id') this.id = String(v);
  };
  const origRemove = Node.prototype.removeAttribute;
  Node.prototype.removeAttribute = function removeAttribute(k) {
    origRemove.call(this, k);
    if (k === 'disabled') this.disabled = false;
  };
}

document.title = document.title ?? '';

globalThis.URL = globalThis.URL ?? {};
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:fake';
  globalThis.URL.revokeObjectURL = () => {};
}
globalThis.Blob = globalThis.Blob ?? class FakeBlob { constructor(parts) { this.parts = parts; } };
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame ?? ((fn) => setTimeout(fn, 0));

/** Đếm mọi node theo bộ chọn trong một cây (tiện cho assert cấu trúc). */
export function countAll(root, sel) { return root.querySelectorAll(sel).length; }
/** Gom toàn bộ text của cây — dùng để kiểm copy tiếng Việt có xuất hiện. */
export function textOf(root) { return root.textContent ?? ''; }

export { document, Node };
