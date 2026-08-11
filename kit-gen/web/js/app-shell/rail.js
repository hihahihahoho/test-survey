/**
 * rail.js — RAIL TRÁI khi đang ở trong một project (§2.2): 5 mục S2/S3/S4/S5/S2b.
 * Màn nào cần badge số / dấu • thì trả về từ `handle.rail()`; shell dựng phần còn lại.
 * A11y: <nav> + aria-current="page" + vạch chỉ thị (không chỉ dựa vào màu).
 */

import { createBadge, createButton, el, icon, on, disposers, focusables } from '../ui/index.js';
import { railDrawerQuery } from './breakpoints.js';

export const RAIL_ITEMS = Object.freeze([
  { screen: 'project', route: 'S2', label: 'Tổng quan', glyph: '◧' },
  { screen: 'design', route: 'S3', label: 'Thiết kế', glyph: '✎' },
  { screen: 'runs', route: 'S4', label: 'Sinh ảnh', glyph: '⚡' },
  { screen: 'kit', route: 'S5', label: 'Thư viện', glyph: '▦' },
  { screen: 'project-settings', route: 'S2b', label: 'Cài đặt', glyph: '⚙' },
]);

/** `run-detail` là con của S4 nên rail vẫn sáng ở mục "Sinh ảnh". */
function isCurrent(item, screenId) {
  if (item.screen === screenId) return true;
  return item.screen === 'runs' && screenId === 'run-detail';
}

export function createRail({ onNavigate }) {
  const nav = el('nav', { class: 'kg-rail', 'aria-label': 'Các phần của project' });

  /* ── Rail-as-drawer ở mốc ≤1099px (§2.2) ────────────────────────────────
     Ở mốc đó CSS đặt `.kg-rail { display:none }`, nên nếu không có nút mở thì
     5 mục điều hướng của project KHÔNG tới được — bằng chuột lẫn bàn phím.
     Nút dưới đây do `createRailToggle()` cấp cho header; a11y theo mẫu
     disclosure: aria-expanded + aria-controls + Esc đóng + trả focus về nút. */
  const railId = 'kg-rail';
  nav.id = railId;
  let scrim = null;
  let offDrawer = null;
  let toggleBtn = null;

  const isDrawerMode = () => railDrawerQuery()?.matches === true;

  function closeDrawer({ returnFocus = true } = {}) {
    nav.removeAttribute('data-open');
    if (scrim) { scrim.remove(); scrim = null; }
    if (offDrawer) { offDrawer(); offDrawer = null; }
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      if (returnFocus) { try { toggleBtn.focus({ preventScroll: true }); } catch { /* nút đã biến mất */ } }
    }
  }

  function openDrawer() {
    if (nav.getAttribute('data-open') === 'true') return;
    nav.setAttribute('data-open', 'true');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    scrim = el('div', { class: 'kg-rail-scrim' });
    nav.parentElement?.insertBefore(scrim, nav);
    offDrawer = disposers(
      on(scrim, 'pointerdown', () => closeDrawer()),
      // Esc đóng (§2.3 "đóng overlay trên cùng")
      on(document, 'keydown', (e) => {
        if (e.key === 'Escape' && nav.getAttribute('data-open') === 'true') {
          e.stopPropagation(); e.preventDefault(); closeDrawer();
        }
      }, true),
      // rời khỏi rail bằng Tab thì đóng — không bẫy focus vì đây là điều hướng
      on(nav, 'focusout', (e) => {
        if (!nav.contains(e.relatedTarget)) closeDrawer({ returnFocus: false });
      }),
      // đổi về mốc rộng ⇒ rail lại nằm trong luồng, trạng thái "mở" vô nghĩa
      on(window, 'resize', () => { if (!isDrawerMode()) closeDrawer({ returnFocus: false }); }),
    );
    focusables(nav)[0]?.focus({ preventScroll: true });
  }

  /** Nút ☰ cho header. Chỉ nhìn thấy ở ≤1099px (CSS `.kg-rail-toggle`). */
  function createRailToggle() {
    toggleBtn = createButton({
      variant: 'ghost', size: 'sm', icon: '☰', iconOnly: true,
      ariaLabel: 'Các phần của project',
      tooltip: 'Các phần của project',
      attrs: {
        class: 'kg-btn kg-btn--ghost kg-btn--sm kg-btn--icon kg-rail-toggle',
        'aria-expanded': 'false',
        'aria-controls': railId,
      },
      onClick: () => {
        if (nav.getAttribute('data-open') === 'true') closeDrawer();
        else openDrawer();
      },
    });
    return toggleBtn;
  }

  /**
   * @param {object} o {screenId, projectId, badges:{runs?:number}, dots:{design?:boolean}}
   */
  function render({ screenId, projectId, badges = {}, dots = {} }) {
    nav.replaceChildren();
    if (toggleBtn) toggleBtn.hidden = !projectId;   // S1/S6 không có rail (§2.2)
    if (!projectId) { closeDrawer({ returnFocus: false }); return nav; }
    for (const it of RAIL_ITEMS) {
      const cur = isCurrent(it, screenId);
      const count = it.screen === 'runs' ? Number(badges.runs ?? 0) : 0;
      const dot = it.screen === 'design' && dots.design === true;
      const btn = el('button', {
        type: 'button',
        class: 'kg-rail__item kg-focus-inset',
        'aria-current': cur ? 'page' : null,
      }, [
        icon(it.glyph),
        el('span', { class: 'kg-rail__label', text: it.label }),
        count > 0
          ? el('span', { class: 'kg-rail__count' }, [createBadge({ state: 'running', text: String(count) })])
          : null,
        dot ? el('span', { class: 'kg-rail__dot', 'aria-hidden': 'true' }) : null,
        dot ? el('span', { class: 'kg-sr-only', text: '(có thay đổi chưa lưu)' }) : null,
      ]);
      btn.addEventListener('click', () => {
        closeDrawer({ returnFocus: false });
        onNavigate(it.route, projectId);
      });
      nav.appendChild(btn);
    }
    return nav;
  }

  return { el: nav, render, createRailToggle, closeDrawer };
}
