/**
 * focus.js — focus trap + trả focus về trigger + xử lý Esc.
 * Dùng chung cho modal, confirm-dialog, drawer (UX-SPEC §5.5, §5.8-A6/A7).
 */
import { on, disposers } from './dom.js';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
  'audio[controls]', 'video[controls]', '[contenteditable]:not([contenteditable="false"])',
].join(',');

/** Các phần tử focus được, đang nhìn thấy, trong `root`. */
export function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((n) => {
    if (n.hasAttribute('disabled') || n.getAttribute('aria-hidden') === 'true') return false;
    if (n.closest('[hidden]')) return false;
    // Ẩn thật sự thì bỏ. LƯU Ý: modal/drawer là position:fixed nên `offsetParent`
    // của con nó vẫn có giá trị, nhưng panel gốc thì null → phải xét cả position.
    // Môi trường không có layout engine (test dưới Node) trả offsetParent=undefined
    // và không có getComputedStyle ⇒ coi như HIỆN, để trap vẫn hoạt động đúng.
    if (typeof n.offsetParent === 'undefined') return true;
    if (n.offsetParent !== null) return true;
    if (typeof getComputedStyle !== 'function') return true;
    return getComputedStyle(n).position === 'fixed';
  });
}

/**
 * Focus phần tử an toàn đầu tiên (§5.5: "focus về nút an toàn khi mở").
 * Ưu tiên [data-autofocus], rồi phần tử focus được đầu tiên, cuối cùng là chính panel.
 */
export function focusFirst(root) {
  const preferred = root.querySelector('[data-autofocus]');
  const target = preferred || focusables(root)[0] || root;
  if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: false });
  return target;
}

/**
 * Bẫy Tab trong `root` (§5.8-A7). Trả hàm dọn.
 * Chỉ xử lý Tab/Shift+Tab; Esc do createOverlayController lo.
 */
export function trapFocus(root) {
  return on(root, 'keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = focusables(root);
    if (items.length === 0) { e.preventDefault(); root.focus(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  });
}

/**
 * Bộ điều khiển vòng đời overlay: nhớ trigger → trap → Esc → trả focus.
 * `opts.onRequestClose(reason)` được gọi khi user bấm Esc / click scrim.
 * `opts.closeOnEsc = false` cho modal đang thực thi (§5.5: "trừ modal đang thực thi").
 */
export function createOverlayController(panel, opts = {}) {
  const { onRequestClose, closeOnEsc = true, returnFocusTo = null, trap = true } = opts;
  const trigger = returnFocusTo || (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const offEsc = on(document, 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!closeOnEsc) return;
    // Chỉ overlay TRÊN CÙNG được đóng (§2.3: "Đóng overlay trên cùng")
    if (!isTopmost(panel)) return;
    e.stopPropagation();
    e.preventDefault();
    if (onRequestClose) onRequestClose('escape');
  }, true);

  const offTrap = trap ? trapFocus(panel) : null;
  register(panel);
  const focused = focusFirst(panel);

  return {
    focused,
    /** Dọn: bỏ trap, bỏ Esc, TRẢ FOCUS về trigger (§5.5, A7). */
    destroy() {
      disposers(offEsc, offTrap)();
      unregister(panel);
      if (trigger && document.contains(trigger)) {
        try { trigger.focus({ preventScroll: true }); } catch { /* trigger đã biến mất */ }
      }
    },
  };
}

/* --- ngăn xếp overlay: để Esc chỉ đóng cái trên cùng --- */
const stack = [];
function register(panel) { stack.push(panel); }
function unregister(panel) {
  const i = stack.lastIndexOf(panel);
  if (i >= 0) stack.splice(i, 1);
}
function isTopmost(panel) { return stack[stack.length - 1] === panel; }
/** Số overlay đang mở — dùng để khoá cuộn body đúng lúc. */
export function overlayCount() { return stack.length; }
