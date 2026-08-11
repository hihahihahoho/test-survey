/**
 * design/cell-grid.js — VÙNG ② lưới ô của S3 (§3-S3.3 + CellGrid §5.6).
 *
 * CỐ Ý không thành primitive ui/: chỉ S3 dùng lưới ô này. CSS đã về file thật
 * (web/css/components/editor.css) ở lượt tích hợp. Ghi chú gốc:
 * teams/design/NEEDS-d2p3.md §2. Chỉ dùng token + primitive sẵn có, không hard-code màu.
 *
 * A11y (§5.8-A6): lưới là COMPOSITE WIDGET — `role=grid`/`row`/`gridcell`,
 * MỘT tabstop duy nhất, mũi tên di chuyển, `⌥←→↑↓` đổi vị trí element,
 * `Space/Enter` chọn, `⌫` xoá (màn tự confirm). Ô là <button> thật, KHÔNG div onclick (A5, I2).
 *
 * Hiệu năng (đóng H3): `updateCell(i)` chỉ vẽ lại MỘT ô, giữ vị trí cuộn + ô đang chọn.
 */

import { el, clear } from '../../ui/index.js';
import { cellAspect, silhouetteSvg } from './shapes.js';
import { isEmptyCell } from './validate.js';

/**
 * @param {{
 *  onSelect:(index:number)=>void, onActivate?:(index:number)=>void,
 *  onMove:(from:number,to:number)=>void, onDelete?:(index:number)=>void,
 *  imageFor?:(comp:object,index:number)=>({src:string,alt:string}|null)
 * }} handlers
 */
export function createCellGrid(handlers = {}) {
  const {
    onSelect = () => {}, onActivate = () => {}, onMove = () => {},
    onDelete = () => {}, imageFor = null,
  } = handlers;

  const grid = el('div', {
    class: 'd-grid', role: 'grid',
    'aria-label': 'Lưới ô của sheet',
  });
  let sheet = null;
  let selected = 0;
  let issuesByIndex = new Map();
  const cells = [];

  function cols() { return Math.max(1, Number(sheet?.grid?.cols ?? 1) || 1); }
  function rows() { return Math.max(1, Number(sheet?.grid?.rows ?? 1) || 1); }
  function comps() { return Array.isArray(sheet?.components) ? sheet.components : []; }

  /** Vẽ lại toàn bộ (chỉ khi đổi sheet / đổi lưới). */
  function render(nextSheet, { selectedIndex = 0, issues = new Map() } = {}) {
    sheet = nextSheet;
    selected = clampIndex(selectedIndex);
    issuesByIndex = issues;
    clear(grid);
    cells.length = 0;
    if (!sheet) return grid;

    const c = cols();
    grid.style.gridTemplateColumns = `repeat(${c}, minmax(0, 1fr))`;
    grid.setAttribute('aria-rowcount', String(rows()));
    grid.setAttribute('aria-colcount', String(c));

    const list = comps();
    for (let r = 0; r < rows(); r += 1) {
      const row = el('div', { role: 'row', style: { display: 'contents' } });
      for (let k = 0; k < c; k += 1) {
        const i = r * c + k;
        const cellWrap = el('div', { role: 'gridcell', style: { display: 'contents' } });
        const btn = buildCell(list[i], i, r, k);
        cells[i] = btn;
        cellWrap.appendChild(btn);
        row.appendChild(cellWrap);
      }
      grid.appendChild(row);
    }
    syncTabstop();
    return grid;
  }

  function buildCell(comp, index, r, k) {
    const empty = comp === undefined || isEmptyCell(comp);
    const issues = issuesByIndex.get(index) ?? [];
    const hasError = issues.some((x) => x.severity !== 'warn');
    const name = String(comp?.file ?? '');
    const vi = String(comp?.vi ?? '');
    const label = empty
      ? `Ô ${index + 1}, trống`
      : `Ô ${index + 1}, ${vi || name || 'element'}${hasError ? ', có lỗi' : ''}`;

    const btn = el('button', {
      type: 'button',
      class: `d-cell${empty ? ' d-cell--empty' : ''}${hasError ? ' d-cell--error' : ''}`,
      'aria-selected': index === selected ? 'true' : 'false',
      'aria-label': label,
      'aria-rowindex': String(r + 1),
      'aria-colindex': String(k + 1),
      tabindex: index === selected ? '0' : '-1',
      dataset: { index: String(index) },
      style: { aspectRatio: String(cellAspect(sheet?.orient)) },
    });

    btn.appendChild(el('span', { class: 'd-cell__no', text: String(index + 1) }));
    if (index === selected) {
      btn.appendChild(el('span', { class: 'd-cell__check', 'aria-hidden': 'true', text: '✓' }));
    }

    const art = el('div', { class: 'd-cell__art' });
    if (empty) {
      // ␀ + gạch chéo (CSS) — ô trống PHẢI phân biệt rõ (§5.6 trạng thái `empty`)
      art.appendChild(el('span', { class: 'd-cell__ph', 'aria-hidden': 'true', text: '␀' }));
    } else {
      const img = imageFor ? imageFor(comp, index) : null;
      if (img && img.src) {
        art.appendChild(el('img', { src: img.src, alt: img.alt ?? vi ?? name, loading: 'lazy', decoding: 'async' }));
      } else {
        art.appendChild(silhouetteSvg(comp?.skel ?? {}, 120, 120 / cellAspect(sheet?.orient)));
      }
    }
    btn.appendChild(art);
    btn.appendChild(el('span', { class: 'd-cell__name', text: empty ? 'trống' : (name || vi || '—') }));
    if (!empty && comp?.skel?.matte) {
      btn.appendChild(el('span', { class: 'd-cell__flag', 'aria-hidden': 'true', text: comp.skel.matte === 'glow' ? '✳' : '◫' }));
    }

    btn.addEventListener('click', () => { select(index); onActivate(index); });
    btn.addEventListener('dblclick', () => onActivate(index));
    btn.addEventListener('keydown', (e) => onKey(e, index));

    // Kéo-thả bằng chuột là NICE (§7.2) nhưng rẻ ở đây — bàn phím vẫn là đường chính.
    btn.draggable = true;
    btn.addEventListener('dragstart', (e) => {
      try { e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
    });
    btn.addEventListener('dragover', (e) => { e.preventDefault(); });
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      let from = NaN;
      try { from = Number(e.dataTransfer.getData('text/plain')); } catch { /* noop */ }
      if (Number.isInteger(from) && from !== index) onMove(from, index);
    });
    return btn;
  }

  function onKey(e, index) {
    const c = cols();
    const n = comps().length;
    let to = null;
    if (e.key === 'ArrowRight') to = index + 1;
    else if (e.key === 'ArrowLeft') to = index - 1;
    else if (e.key === 'ArrowDown') to = index + c;
    else if (e.key === 'ArrowUp') to = index - c;
    else if (e.key === 'Home') to = e.ctrlKey ? 0 : index - (index % c);
    else if (e.key === 'End') to = e.ctrlKey ? n - 1 : index - (index % c) + (c - 1);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); select(index); onActivate(index); return; }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onDelete(index); return; }

    if (to === null || to < 0 || to >= n) return;
    e.preventDefault();
    // ⌥ (altKey) = DI CHUYỂN element, không chỉ di chuyển con trỏ (§3-S3.3 bàn phím)
    if (e.altKey) { onMove(index, to); return; }
    select(to);
    cells[to]?.focus();
  }

  function select(index) {
    const i = clampIndex(index);
    if (i === selected) { onSelect(i); return; }
    const prev = selected;
    selected = i;
    // Chỉ vẽ lại 2 ô liên quan (đóng H3: không vẽ lại cả vùng ②)
    refreshCell(prev);
    refreshCell(i);
    syncTabstop();
    onSelect(i);
  }

  function clampIndex(i) {
    const n = comps().length;
    if (n === 0) return 0;
    return Math.min(Math.max(0, Number(i) || 0), n - 1);
  }

  function syncTabstop() {
    cells.forEach((btn, i) => {
      if (!btn) return;
      btn.tabIndex = i === selected ? 0 : -1;
      btn.setAttribute('aria-selected', i === selected ? 'true' : 'false');
    });
  }

  /** Vẽ lại ĐÚNG MỘT ô (giữ cuộn, giữ focus nếu ô đó đang focus). */
  function refreshCell(index) {
    const old = cells[index];
    if (!old || !old.parentNode) return;
    const hadFocus = typeof document !== 'undefined' && document.activeElement === old;
    const c = cols();
    const fresh = buildCell(comps()[index], index, Math.floor(index / c), index % c);
    old.parentNode.replaceChild(fresh, old);
    cells[index] = fresh;
    if (hadFocus) fresh.focus();
  }

  /** Cập nhật dữ liệu sheet mà KHÔNG dựng lại DOM nếu lưới không đổi. */
  function update(nextSheet, { issues = new Map(), selectedIndex = null } = {}) {
    const sameShape = sheet
      && nextSheet
      && sheet.id === nextSheet.id
      && Number(sheet.grid?.cols) === Number(nextSheet.grid?.cols)
      && Number(sheet.grid?.rows) === Number(nextSheet.grid?.rows)
      && (sheet.components?.length ?? 0) === (nextSheet.components?.length ?? 0)
      && sheet.orient === nextSheet.orient;
    if (!sameShape) {
      return render(nextSheet, { selectedIndex: selectedIndex ?? selected, issues });
    }
    sheet = nextSheet;
    issuesByIndex = issues;
    if (selectedIndex !== null) selected = clampIndex(selectedIndex);
    for (let i = 0; i < comps().length; i += 1) refreshCell(i);
    syncTabstop();
    return grid;
  }

  return {
    el: grid,
    render,
    update,
    refreshCell,
    select,
    get selectedIndex() { return selected; },
    focusSelected() { cells[selected]?.focus(); },
  };
}
