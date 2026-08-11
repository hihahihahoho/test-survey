/**
 * tabs.js — §5.5/§2.1: tab con của S3 (Sheet&element / Phong cách / Nâng cao),
 * S5 (Assets / Ma trận / Xuất), S6 (5 tab).
 * A11y (§5.8-A6): role=tablist/tab/tabpanel · MỘT tabstop · ←→ Home End di
 * chuyển · aria-selected · panel có tabindex=0 và aria-labelledby.
 * Kích hoạt: tự động theo mũi tên (automatic activation) — đúng mẫu WAI-ARIA
 * cho tab panel nhẹ; panel nào tải nặng thì màn tự lazy trong onChange.
 *
 * API: createTabs({ ariaLabel, tabs:[{id,label,icon,badge,panel,disabled}],
 *                   active, onChange }) -> { el, panels, setActive, activeId }
 */
import { el, uid, cx, icon as iconEl, clear } from './dom.js';

export function createTabs(opts = {}) {
  const { ariaLabel, tabs = [], active = null, onChange = null } = opts;
  if (!ariaLabel) throw new Error('kg-tabs: thiếu ariaLabel cho tablist');
  if (!tabs.length) throw new Error('kg-tabs: cần ≥1 tab');

  let cur = active || tabs[0].id;
  const tablist = el('div', { class: 'kg-tabs', role: 'tablist', 'aria-label': ariaLabel });
  const btns = new Map();
  const panels = new Map();

  for (const t of tabs) {
    const tabId = uid('kg-tab');
    const panelId = uid('kg-tabpanel');
    const b = el('button', {
      type: 'button', class: 'kg-tab', role: 'tab', id: tabId,
      'aria-controls': panelId,
      'aria-selected': t.id === cur ? 'true' : 'false',
      tabindex: t.id === cur ? '0' : '-1',
      disabled: t.disabled ? true : null,
      dataset: { id: t.id },
    }, [
      t.icon ? iconEl(t.icon) : null,
      el('span', { text: t.label }),
      t.badge || null,
    ]);
    b.addEventListener('click', () => setActive(t.id));
    btns.set(t.id, b);
    tablist.appendChild(b);

    const p = el('div', {
      class: 'kg-tabpanel', role: 'tabpanel', id: panelId,
      'aria-labelledby': tabId, tabindex: '0',
      hidden: t.id === cur ? null : true,
    });
    if (t.panel) p.appendChild(t.panel);
    panels.set(t.id, p);
  }

  const panelWrap = el('div', {}, [...panels.values()]);

  function setActive(id, { focus = false } = {}) {
    if (!btns.has(id) || btns.get(id).disabled) return;
    cur = id;
    for (const [k, b] of btns) {
      const on = k === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      const p = panels.get(k);
      if (on) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
    }
    if (focus) btns.get(id).focus();
    if (onChange) onChange(id);
  }

  const order = () => [...btns.entries()].filter(([, b]) => !b.disabled).map(([k]) => k);
  tablist.addEventListener('keydown', (e) => {
    const ids = order();
    const i = ids.indexOf(cur);
    let next = null;
    if (e.key === 'ArrowRight') next = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft') next = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (!next) return;
    e.preventDefault();
    setActive(next, { focus: true });
  });

  return {
    el: el('div', {}, [tablist, panelWrap]),
    tablist, panelWrap, panels,
    get activeId() { return cur; },
    setActive,
    /** Đổi nội dung 1 panel (lazy load) mà không dựng lại cả tabs. */
    setPanel(id, node) {
      const p = panels.get(id);
      if (!p) return;
      clear(p);
      if (node) p.appendChild(node);
    },
  };
}
