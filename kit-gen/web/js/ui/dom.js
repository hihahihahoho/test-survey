/**
 * dom.js — tiện ích DOM dùng chung cho mọi primitive.
 * Quy tắc BẤT DI BẤT DỊCH (UX-SPEC §5.8-A12, audit I6):
 *   Mọi chuỗi do người dùng nhập PHẢI đi qua textContent. File này không có
 *   hàm nào nhận HTML thô. Không innerHTML ở bất cứ đâu trong web/js/ui/**.
 */

/** Tạo element. `attrs` là thuộc tính/ARIA; `children` là node hoặc string (string → textNode). */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

/** Thêm con: bỏ qua null/false, string → textNode (KHÔNG parse HTML). */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false || c === '') continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return parent;
}

/** Xoá sạch con của node. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Icon trang trí: luôn aria-hidden, vì §5.7 buộc icon phải đi kèm CHỮ thật. */
export function icon(glyph) {
  return el('i', { class: 'kg-icon', 'aria-hidden': 'true', text: glyph });
}

/** Nhãn chỉ cho screen reader. */
export function srOnly(text) {
  return el('span', { class: 'kg-sr-only', text });
}

let seq = 0;
/** id duy nhất cho liên kết label/aria-describedby/aria-labelledby. */
export function uid(prefix = 'kg') {
  seq += 1;
  return `${prefix}-${seq.toString(36)}`;
}

/** Gộp className có điều kiện. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Người dùng có xin giảm chuyển động? (§5.8-A10) */
export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Gắn nhiều listener, trả hàm dọn tất cả. */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Bọc nhiều hàm dọn thành một. */
export function disposers(...fns) {
  return () => { for (const f of fns) { if (typeof f === 'function') f(); } };
}

/** Container gắn overlay (modal/drawer/toast/tooltip). Cho phép test thay thế. */
export function overlayRoot() {
  return document.body;
}
