/**
 * toast.js — §5.5 Toast: góc dưới-phải, 360px, xếp dọc TỐI ĐA 3 (cũ nhất bị đẩy ra).
 * role="status" (lỗi: role="alert") → §5.8-A8.
 * Thời lượng: success 4s · info 5s · warning 8s · error KHÔNG tự đóng.
 * Có [Hoàn tác] → 10s và KHÔNG tự đóng khi hover/focus (§5.5, X6).
 *
 * LƯU Ý cho team sau: toast KHÔNG BAO GIỜ là nơi duy nhất báo lỗi của thao tác
 * đang ở trên màn — chỗ nào gây lỗi thì chỗ đó phải hiện inline (§5.5).
 *
 * API: toast.success/info/warning/error({ title, description, actions[], undo })
 *      -> { close }
 */
import { el, icon as iconEl, overlayRoot, on, disposers, prefersReducedMotion } from './dom.js';
import { createButton } from './button.js';

const MAX = 3;
const DURATION = { success: 4000, info: 5000, warning: 8000, error: null };
const ICONS = { success: '✓', info: 'ⓘ', warning: '⚠', error: '⛔' };
const UNDO_MS = 10000;

let container = null;
const live = [];

function ensureContainer() {
  if (container && document.contains(container)) return container;
  container = el('div', { class: 'kg-toasts' });
  overlayRoot().appendChild(container);
  return container;
}

function show(kind, opts = {}) {
  const { title, description = null, actions = [], undo = null, duration } = opts;
  if (!title) throw new Error('kg-toast: thiếu title');

  const isError = kind === 'error';
  const ms = duration !== undefined ? duration : (undo ? UNDO_MS : DURATION[kind]);

  const node = el('div', {
    class: `kg-toast kg-toast--${kind}`,
    // §5.8-A8: lỗi là alert (đọc ngay), còn lại là status (đọc khi rảnh)
    role: isError ? 'alert' : 'status',
    'aria-live': isError ? 'assertive' : 'polite',
    'aria-atomic': 'true',
  });

  const actionRow = el('div', { class: 'kg-toast__actions' });
  let closed = false;
  let timer = null;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    offs();
    node.remove();
    const i = live.indexOf(handle);
    if (i >= 0) live.splice(i, 1);
  };

  // Hoàn tác 10s — hành động "đường về" của mọi thao tác phá huỷ (§1.1-1)
  if (undo) {
    actionRow.appendChild(createButton({
      label: undo.label || 'Hoàn tác', variant: 'secondary', size: 'sm', icon: '↺',
      onClick: () => { close(); undo.onUndo(); },
    }));
  }
  for (const a of actions) {
    actionRow.appendChild(createButton({
      label: a.label, variant: a.variant || 'ghost', size: 'sm',
      onClick: () => { if (a.keepOpen !== true) close(); a.onClick(); },
    }));
  }

  node.appendChild(el('span', { class: 'kg-toast__icon' }, [iconEl(ICONS[kind])]));
  node.appendChild(el('div', { class: 'kg-toast__main' }, [
    el('div', { class: 'kg-toast__title', text: title }),
    description ? el('div', { class: 'kg-toast__desc', text: description }) : null,
    (undo || actions.length) ? actionRow : null,
    // thanh đếm chỉ TRANG TRÍ: chữ "Hoàn tác" vẫn là thông tin chính
    (ms && undo && !prefersReducedMotion())
      ? el('div', { class: 'kg-toast__bar', 'aria-hidden': 'true' },
          [el('i', { style: { animationDuration: `${ms}ms` } })])
      : null,
  ]));
  node.appendChild(createButton({
    variant: 'ghost', size: 'sm', icon: '✕', iconOnly: true,
    ariaLabel: 'Đóng thông báo',
    attrs: { class: 'kg-btn kg-btn--ghost kg-btn--sm kg-btn--icon kg-toast__close' },
    onClick: close,
  }));

  const startTimer = () => {
    if (!ms) return;   // error: không tự đóng
    clearTimeout(timer);
    timer = setTimeout(close, ms);
  };
  // §5.5: có [Hoàn tác] thì KHÔNG tự đóng khi hover/focus
  const pausable = !!undo;
  const offs = disposers(
    on(node, 'pointerenter', () => { if (pausable) clearTimeout(timer); }),
    on(node, 'pointerleave', () => { if (pausable) startTimer(); }),
    on(node, 'focusin', () => { if (pausable) clearTimeout(timer); }),
    on(node, 'focusout', () => { if (pausable) startTimer(); }),
    // Esc đóng toast lỗi đang focus (§5.5)
    on(node, 'keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }),
  );

  ensureContainer().appendChild(node);
  const handle = { close, el: node, kind };
  live.push(handle);
  // tối đa 3: cũ nhất bị đẩy ra
  while (live.length > MAX) live[0].close();
  startTimer();
  return handle;
}

export const toast = {
  success: (o) => show('success', o),
  info: (o) => show('info', o),
  warning: (o) => show('warning', o),
  error: (o) => show('error', o),
  /** Đóng tất cả (dùng khi đổi workspace / điều hướng lớn). */
  closeAll() { [...live].forEach((t) => t.close()); },
};

export default toast;
