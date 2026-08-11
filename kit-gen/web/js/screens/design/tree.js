/**
 * design/tree.js — VÙNG ① CÂY THIẾT KẾ (§3-S3.2).
 * 3 nhóm gập được: Sheet · Nhân vật · Phong cách. Trạng thái gập lưu ở
 * kitgen.ui.v1.collapsedSections QUA core/store.js (không chạm localStorage — §6.5-2).
 *
 * A11y: mỗi nhóm là disclosure (`aria-expanded` + `aria-controls`), mỗi dòng là <button>
 * có `aria-selected`; ↑↓ đi trong nhóm; `⌥↑/⌥↓` đổi thứ tự sheet; menu ⋯ mở bằng Shift+F10
 * (dùng attachMenu của design system).
 */

import {
  attachMenu, createButton, createJobBadge, el, clear, icon as iconEl,
  worstJobState,
} from '../../ui/index.js';
import { store } from '../../core/index.js';

const SECTIONS = [
  { id: 'sheets', label: 'Sheet' },
  { id: 'characters', label: 'Nhân vật' },
  { id: 'variants', label: 'Phong cách' },
];

/**
 * @param {{
 *   onSelect:(sel:object)=>void, onAddSheet:Function, onSheetMenu:Function,
 *   onAddCharacter:Function, onAddVariant:Function, onMoveSheet:Function,
 *   onOpenStyles:Function, readOnly?:boolean, refUrl?:(p:string)=>string|null
 * }} handlers
 */
export function createDesignTree(handlers = {}) {
  const {
    onSelect = () => {}, onAddSheet = () => {}, onSheetMenu = () => [],
    onAddCharacter = () => {}, onAddVariant = () => {}, onMoveSheet = () => {},
    onOpenStyles = () => {}, refUrl = null,
  } = handlers;

  const root = el('nav', { class: 'd-tree', 'aria-label': 'Cây thiết kế' });
  let data = { sheets: [], characters: [], variants: [], jobStates: {} };
  let selection = null;
  let readOnly = Boolean(handlers.readOnly);

  function collapsed() {
    try { return new Set(store.get(store.keys.ui).collapsedSections ?? []); }
    catch { return new Set(); }
  }
  function toggleSection(id) {
    const set = collapsed();
    if (set.has(id)) set.delete(id); else set.add(id);
    try { store.patch(store.keys.ui, { collapsedSections: [...set] }); } catch { /* store chặn thì thôi */ }
    render();
  }

  function isSelected(kind, id, index) {
    if (!selection) return false;
    if (kind === 'sheet') return selection.kind === 'sheet' && selection.sheetId === id;
    if (kind === 'character') return selection.kind === 'character' && selection.characterId === id;
    if (kind === 'variant') return selection.kind === 'variant' && selection.variantId === id;
    return false;
  }

  /** Badge tổng hợp của sheet = trạng thái XẤU NHẤT trong các phong cách (§3-S3.2). */
  function sheetBadge(sheetId) {
    const states = [];
    for (const [job, st] of Object.entries(data.jobStates ?? {})) {
      if (job.endsWith(`-${sheetId}`)) states.push(st);
    }
    if (states.length === 0) return createJobBadge('never', { long: 'Chưa sinh ảnh lần nào' });
    return createJobBadge(worstJobState(states), { long: null });
  }

  function render() {
    clear(root);
    const fold = collapsed();
    for (const sec of SECTIONS) {
      const open = !fold.has(sec.id);
      const bodyId = `d-tree-${sec.id}`;
      const count = sec.id === 'sheets' ? data.sheets.length
        : sec.id === 'characters' ? data.characters.length : data.variants.length;

      const toggle = el('button', {
        type: 'button', class: 'd-tree__toggle',
        'aria-expanded': open ? 'true' : 'false',
        'aria-controls': bodyId,
        onClick: () => toggleSection(sec.id),
      }, [
        iconEl(open ? '▾' : '▸'),
        el('span', { text: sec.label }),
        el('span', { class: 'd-tree__count', text: String(count) }),
      ]);

      const body = el('div', { class: 'd-tree__group', id: bodyId, hidden: open ? null : true });
      if (open) {
        if (sec.id === 'sheets') renderSheets(body);
        else if (sec.id === 'characters') renderCharacters(body);
        else renderVariants(body);
      }
      root.appendChild(el('div', { class: 'd-tree__group' }, [toggle, body]));
    }
    return root;
  }

  function renderSheets(body) {
    if (data.sheets.length === 0) {
      body.appendChild(el('p', { class: 'd-tree__empty', text: 'Chưa có sheet nào.' }));
    }
    data.sheets.forEach((sh, i) => {
      const total = Number(sh.grid?.cols ?? 0) * Number(sh.grid?.rows ?? 0);
      const filled = (sh.components ?? []).filter((c) => String(c?.skel?.shape ?? '') !== 'empty').length;
      const row = el('button', {
        type: 'button', class: 'd-tree__row',
        'aria-selected': isSelected('sheet', sh.id) ? 'true' : 'false',
        'aria-label': `Sheet ${sh.id}, ${filled} trên ${total} ô`,
        onClick: () => { selection = { kind: 'sheet', sheetId: sh.id }; onSelect(selection); },
      }, [
        iconEl('▦'),
        el('span', { class: 'd-tree__name', text: sh.id || `sheet ${i + 1}` }),
        el('span', { class: 'd-tree__num', text: `${filled}/${total}` }),
        sheetBadge(sh.id),
      ]);
      row.addEventListener('keydown', (e) => {
        // ⌥↑ / ⌥↓ đổi thứ tự sheet (§3-S3.2)
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          if (readOnly) return;
          onMoveSheet(sh.id, e.key === 'ArrowUp' ? -1 : 1);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          moveFocus(row, e.key === 'ArrowDown' ? 1 : -1);
        }
      });
      const more = createButton({
        variant: 'ghost', size: 'sm', icon: '⋯', iconOnly: true,
        ariaLabel: `Thao tác với sheet ${sh.id}`, tooltip: 'Thao tác (Shift+F10)',
      });
      attachMenu(more, () => onSheetMenu(sh));
      body.appendChild(el('div', { class: 'kg-row kg-row--tight', style: { alignItems: 'center' } }, [row, more]));
    });

    body.appendChild(createButton({
      label: 'Thêm sheet', variant: 'ghost', size: 'sm', icon: '＋',
      disabled: readOnly,
      onClick: (e) => onAddSheet(e),
      attrs: { 'data-role': 'add-sheet' },
    }));
  }

  function renderCharacters(body) {
    if (data.characters.length === 0) {
      body.appendChild(el('p', { class: 'd-tree__empty', text: 'Chưa có nhân vật nào.' }));
    }
    for (const ch of data.characters) {
      const url = refUrl && ch.ref ? refUrl(ch.ref) : null;
      const row = el('button', {
        type: 'button', class: 'd-tree__row',
        'aria-selected': isSelected('character', ch.id) ? 'true' : 'false',
        'aria-label': `Nhân vật ${ch.vi || ch.id}, ${(ch.poses ?? []).length} dáng`,
        onClick: () => { selection = { kind: 'character', characterId: ch.id }; onSelect(selection); },
      }, [
        url
          ? el('img', { class: 'd-tree__avatar', src: url, alt: '' })
          : el('span', { class: 'd-tree__swatch', 'aria-hidden': 'true' }),
        el('span', { class: 'd-tree__name', text: ch.vi || ch.id }),
        el('span', { class: 'd-tree__num', text: `${(ch.poses ?? []).length} dáng` }),
      ]);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(row, e.key === 'ArrowDown' ? 1 : -1); }
      });
      body.appendChild(row);
    }
    body.appendChild(createButton({
      label: 'Thêm nhân vật', variant: 'ghost', size: 'sm', icon: '＋',
      disabled: readOnly, onClick: () => onAddCharacter(),
    }));
  }

  function renderVariants(body) {
    if (data.variants.length === 0) {
      body.appendChild(el('p', { class: 'd-tree__empty', text: 'Chưa có phong cách nào.' }));
    }
    for (const v of data.variants) {
      const color = typeof v.brand?.primary === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.brand.primary)
        ? v.brand.primary : null;
      const row = el('button', {
        type: 'button', class: 'd-tree__row',
        'aria-selected': isSelected('variant', v.id) ? 'true' : 'false',
        'aria-label': `Phong cách ${v.vi || v.id}`,
        onClick: () => { selection = { kind: 'variant', variantId: v.id }; onSelect(selection); onOpenStyles(v.id); },
      }, [
        el('span', {
          class: 'd-tree__swatch', 'aria-hidden': 'true',
          style: color ? { background: color } : null,
        }),
        el('span', { class: 'd-tree__name', text: v.vi || v.id }),
      ]);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(row, e.key === 'ArrowDown' ? 1 : -1); }
      });
      body.appendChild(row);
    }
    body.appendChild(createButton({
      label: 'Thêm phong cách', variant: 'ghost', size: 'sm', icon: '＋',
      disabled: readOnly, onClick: () => onAddVariant(),
    }));
  }

  function moveFocus(fromRow, delta) {
    const all = [...root.querySelectorAll('.d-tree__row')];
    const i = all.indexOf(fromRow);
    const next = all[i + delta];
    if (next) next.focus();
  }

  return {
    el: root,
    render,
    update(next) {
      data = { ...data, ...next };
      if (next.readOnly !== undefined) readOnly = Boolean(next.readOnly);
      render();
    },
    setSelection(sel) { selection = sel; render(); },
    focusFirstSheet() { root.querySelector('.d-tree__row')?.focus(); },
  };
}
