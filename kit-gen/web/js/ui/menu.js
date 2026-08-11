/**
 * menu.js — menu ngữ cảnh `⋯` (S1/S2, đúng 8 mục thứ tự cố định).
 * §5.8-A6: mở được bằng BÀN PHÍM (Shift+F10 hoặc phím Menu), ↑↓ di chuyển,
 * Enter chọn, Esc đóng và trả focus về nút trigger.
 * Mục disabled vẫn HIỆN + có lý do (§2.5-2: không ẩn nút).
 *
 * API: attachMenu(triggerBtn, () => items)   -> dispose()
 *      items: [{ label, icon, hint, danger, disabled, disabledReason, onSelect } | 'separator']
 */
import { el, icon as iconEl, overlayRoot, on, disposers, cx } from './dom.js';
import { attachTooltip } from './tooltip.js';

export function attachMenu(trigger, getItems, opts = {}) {
  const { placement = 'bottom-end' } = opts;
  let menu = null;
  let items = [];
  let idx = -1;

  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');

  function open({ focusFirst = false } = {}) {
    if (menu) return;
    const defs = (typeof getItems === 'function' ? getItems() : getItems) || [];
    menu = el('div', { class: 'kg-menu', role: 'menu', 'aria-label': trigger.getAttribute('aria-label') || 'Menu' });
    items = [];
    for (const d of defs) {
      if (d === 'separator') { menu.appendChild(el('div', { class: 'kg-menu__sep', role: 'separator' })); continue; }
      const it = el('button', {
        type: 'button',
        class: cx('kg-menu__item', d.danger && 'kg-menu__item--danger'),
        role: 'menuitem',
        tabindex: '-1',
        'aria-disabled': d.disabled ? 'true' : null,
      }, [
        d.icon ? iconEl(d.icon) : null,
        el('span', { class: 'kg-truncate', text: d.label }),
        d.hint ? el('span', { class: 'kg-menu__hint', text: d.hint }) : null,
      ]);
      if (d.disabled) {
        // §2.5-2: disabled + lý do, KHÔNG ẩn
        if (d.disabledReason) attachTooltip(it, d.disabledReason);
        it.addEventListener('click', (e) => e.preventDefault());
      } else {
        it.addEventListener('click', () => { close(); d.onSelect(); });
      }
      items.push(it);
      menu.appendChild(it);
    }
    overlayRoot().appendChild(menu);
    position();
    trigger.setAttribute('aria-expanded', 'true');
    offs = disposers(
      on(document, 'pointerdown', onOutside, true),
      on(document, 'keydown', onKey, true),
      on(window, 'resize', close),
      on(window, 'scroll', close, true),
    );
    idx = -1;
    if (focusFirst) move(1);
  }

  function position() {
    const r = trigger.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    let top = r.bottom + 4;
    let left = placement.endsWith('end') ? r.right - m.width : r.left;
    if (top + m.height > innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    left = Math.min(Math.max(8, left), innerWidth - m.width - 8);
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  }

  function move(delta) {
    const usable = items.filter((i) => i.getAttribute('aria-disabled') !== 'true');
    if (!usable.length) return;
    const curNode = items[idx];
    let pos = usable.indexOf(curNode);
    pos = pos < 0 ? (delta > 0 ? 0 : usable.length - 1) : (pos + delta + usable.length) % usable.length;
    const next = usable[pos];
    idx = items.indexOf(next);
    next.focus();
  }

  let offs = () => {};
  function onOutside(e) {
    if (!menu) return;
    if (menu.contains(e.target) || e.target === trigger) return;
    close();
  }
  function onKey(e) {
    if (!menu) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); trigger.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); idx = -1; move(1); }
    else if (e.key === 'End') { e.preventDefault(); idx = -1; move(-1); }
    else if (e.key === 'Tab') { close(); }
  }
  function close() {
    if (!menu) return;
    offs();
    menu.remove();
    menu = null;
    items = [];
    trigger.setAttribute('aria-expanded', 'false');
  }

  const offTrigger = disposers(
    on(trigger, 'click', (e) => { e.stopPropagation(); if (menu) { close(); } else { open(); } }),
    on(trigger, 'keydown', (e) => {
      // A6: Shift+F10 và phím Menu mở được menu ngữ cảnh
      if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
        e.preventDefault(); open({ focusFirst: true });
      } else if (e.key === 'ArrowDown' && !menu) {
        e.preventDefault(); open({ focusFirst: true });
      }
    }),
  );

  return disposers(offTrigger, close);
}
