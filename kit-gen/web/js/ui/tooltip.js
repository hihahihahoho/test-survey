/**
 * tooltip.js — §5.5: hiện sau 400ms hover HOẶC NGAY KHI focus bàn phím.
 * ≤48 ký tự; dài hơn phải dùng Popover (`ⓘ`) — hàm này cảnh báo ở console.
 * Tooltip KHÔNG BAO GIỜ chứa thông tin duy nhất (§5.5) → nội dung luôn phải
 * có bản sao ở nhãn/aria của phần tử.
 *
 * API: attachTooltip(target, text, { placement, delay, alsoWrapper }) -> dispose()
 */
import { el, uid, on, disposers, overlayRoot, prefersReducedMotion } from './dom.js';

const HOVER_DELAY = 400;
const MAX_LEN = 48;
let current = null;   // { node, target }

export function attachTooltip(target, text, opts = {}) {
  const { placement = 'top', delay = HOVER_DELAY, alsoWrapper = false } = opts;
  if (!text) return () => {};
  if (String(text).length > MAX_LEN) {
    console.warn(`kg-tooltip: nội dung ${String(text).length} ký tự > ${MAX_LEN} — §5.5 yêu cầu dùng Popover (ⓘ) thay vì tooltip.`);
  }
  const id = uid('kg-tip');
  let timer = null;

  const show = (immediate) => {
    clearTimeout(timer);
    const run = () => render(target, text, placement, id);
    if (immediate || prefersReducedMotion()) run();
    else timer = setTimeout(run, delay);
  };
  const hide = () => { clearTimeout(timer); destroy(target); };

  const offs = [
    on(target, 'pointerenter', () => show(false)),
    on(target, 'pointerleave', hide),
    on(target, 'focus', () => show(true)),      // bàn phím: hiện NGAY (§5.5)
    on(target, 'blur', hide),
    // Esc đóng tooltip mà không đóng overlay cha
    on(target, 'keydown', (e) => { if (e.key === 'Escape' && current) { e.stopPropagation(); hide(); } }),
  ];

  // Nút disabled không phát pointer event → cần lắng ở cha bọc
  if (alsoWrapper && target.parentElement) {
    offs.push(on(target.parentElement, 'pointerenter', () => show(false)));
    offs.push(on(target.parentElement, 'pointerleave', hide));
  }

  return disposers(...offs, hide);
}

function render(target, text, placement, id) {
  destroy(target);
  const node = el('div', { class: 'kg-tooltip', role: 'tooltip', id, text: String(text) });
  overlayRoot().appendChild(node);
  position(node, target, placement);
  // Nối vào a11y tree: describedby (không ghi đè nhãn sẵn có)
  const prev = target.getAttribute('aria-describedby');
  target.dataset.kgTipPrevDesc = prev || '';
  target.setAttribute('aria-describedby', prev ? `${prev} ${id}` : id);
  current = { node, target };
}

function position(node, target, placement) {
  const r = target.getBoundingClientRect();
  const t = node.getBoundingClientRect();
  const gap = 6;
  let top = placement === 'bottom' ? r.bottom + gap : r.top - t.height - gap;
  let left = r.left + r.width / 2 - t.width / 2;
  // giữ trong khung nhìn
  if (top < gap) top = r.bottom + gap;
  if (top + t.height > innerHeight - gap) top = Math.max(gap, r.top - t.height - gap);
  left = Math.min(Math.max(gap, left), innerWidth - t.width - gap);
  node.style.top = `${Math.round(top)}px`;
  node.style.left = `${Math.round(left)}px`;
}

function destroy(target) {
  if (!current) return;
  current.node.remove();
  const t = current.target;
  const prev = t.dataset.kgTipPrevDesc || '';
  if (prev) t.setAttribute('aria-describedby', prev);
  else t.removeAttribute('aria-describedby');
  delete t.dataset.kgTipPrevDesc;
  current = null;
}

/**
 * Popover cho nội dung DÀI (nút `ⓘ`) — bấm mới mở, đóng bằng Esc / click ngoài.
 * Khác tooltip: có thể chứa nhiều dòng và nút.
 */
export function createInfoPopover({ label = 'Giải thích', content = '', ariaLabel = 'Giải thích' } = {}) {
  const id = uid('kg-pop');
  const btn = el('button', {
    type: 'button', class: 'kg-btn kg-btn--ghost kg-btn--sm kg-btn--icon',
    'aria-label': ariaLabel, 'aria-expanded': 'false', 'aria-controls': id,
  }, [el('i', { class: 'kg-icon', 'aria-hidden': 'true', text: 'ⓘ' })]);

  let panel = null;
  const close = () => {
    if (!panel) return;
    panel.remove(); panel = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onOutside = (e) => { if (panel && !panel.contains(e.target) && e.target !== btn) close(); };
  const onKey = (e) => { if (e.key === 'Escape' && panel) { e.stopPropagation(); close(); btn.focus(); } };

  btn.addEventListener('click', () => {
    if (panel) { close(); return; }
    panel = el('div', { class: 'kg-tooltip', id, role: 'note', style: { pointerEvents: 'auto', maxWidth: '320px' } },
      [el('div', { text: content })]);
    overlayRoot().appendChild(panel);
    position(panel, btn, 'bottom');
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  });

  // Nội dung cũng phải đọc được bằng screen reader ngay tại chỗ
  btn.appendChild(el('span', { class: 'kg-sr-only', text: `${label}: ${content}` }));
  return btn;
}
