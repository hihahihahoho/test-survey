/**
 * table.js — Table (view `list` của S1, bảng runs/refs) + List (danh sách dòng).
 * A11y: <caption> hoặc aria-label · th[scope] · aria-sort khi sort được ·
 * checkbox chọn dòng có nhãn thật (§5.8-I4) · hàng chọn dùng aria-selected.
 *
 * API:
 *   createTable({ caption, columns, rows, sort, onSort, selectable, onSelectionChange, rowKey })
 *     columns: [{ key, label, align, width, render(row) -> node|string, sortable }]
 *   createList({ ariaLabel, items })
 *     items: [{ main, meta, badge, current, onClick, ariaLabel }]
 */
import { el, cx, append, uid } from './dom.js';

export function createTable(opts = {}) {
  const {
    caption, columns = [], rows = [], sort = null, onSort = null,
    selectable = false, onSelectionChange = null, rowKey = (r, i) => String(i),
    emptyNode = null,
  } = opts;
  if (!caption) throw new Error('kg-table: thiếu caption (dùng làm aria-label cho bảng)');

  const selected = new Set();
  const table = el('table', { class: 'kg-table' });
  table.appendChild(el('caption', { class: 'kg-sr-only', text: caption }));

  /* --- thead --- */
  const headRow = el('tr');
  if (selectable) {
    const allId = uid('kg-th-all');
    const allBox = el('input', { type: 'checkbox', id: allId, 'aria-label': 'Chọn tất cả' });
    allBox.addEventListener('change', () => {
      rows.forEach((r, i) => {
        const k = rowKey(r, i);
        if (allBox.checked) selected.add(k); else selected.delete(k);
      });
      syncSelection();
    });
    headRow.appendChild(el('th', { scope: 'col', style: { width: '36px' } }, [allBox]));
  }
  for (const c of columns) {
    const th = el('th', {
      scope: 'col',
      style: c.width ? { width: c.width } : null,
      'aria-sort': c.sortable ? (sort && sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : null,
    });
    if (c.sortable && onSort) {
      const dir = sort && sort.key === c.key && sort.dir === 'asc' ? 'desc' : 'asc';
      th.appendChild(el('button', {
        type: 'button', class: 'kg-th-sort',
        'aria-label': `Sắp xếp theo ${c.label}`,
        onClick: () => onSort({ key: c.key, dir }),
      }, [
        el('span', { text: c.label }),
        el('span', { 'aria-hidden': 'true', text: sort && sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ⇅' }),
      ]));
    } else {
      th.appendChild(el('span', { text: c.label }));
    }
    headRow.appendChild(th);
  }
  table.appendChild(el('thead', {}, [headRow]));

  /* --- tbody --- */
  const tbody = el('tbody');
  const boxes = new Map();
  rows.forEach((r, i) => {
    const k = rowKey(r, i);
    const tr = el('tr', { dataset: { key: k } });
    if (selectable) {
      const id = uid('kg-td-sel');
      const box = el('input', {
        type: 'checkbox', id,
        // nhãn thật: đọc được "Chọn <tên dòng>" (đóng I4)
        'aria-label': `Chọn ${r.__label || k}`,
      });
      box.addEventListener('change', () => {
        if (box.checked) selected.add(k); else selected.delete(k);
        syncSelection();
      });
      boxes.set(k, box);
      tr.appendChild(el('td', {}, [box]));
    }
    for (const c of columns) {
      const val = c.render ? c.render(r) : r[c.key];
      tr.appendChild(el('td', { class: cx(c.align === 'right' && 'kg-td--num') },
        [typeof val === 'string' || typeof val === 'number' ? String(val) : val]));
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  function syncSelection() {
    for (const [k, box] of boxes) {
      box.checked = selected.has(k);
      const tr = tbody.querySelector(`tr[data-key="${CSS.escape(k)}"]`);
      if (tr) tr.setAttribute('aria-selected', box.checked ? 'true' : 'false');
    }
    if (onSelectionChange) onSelectionChange([...selected]);
  }

  const wrap = el('div', { class: 'kg-table-wrap' }, [rows.length ? table : (emptyNode || table)]);
  return {
    el: wrap, table, tbody,
    get selection() { return [...selected]; },
    clearSelection() { selected.clear(); syncSelection(); },
  };
}

/** List: dòng bấm được (runs gần đây, ref, lịch sử). Mỗi dòng là <button> nếu có onClick. */
export function createList({ ariaLabel, items = [] } = {}) {
  if (!ariaLabel) throw new Error('kg-list: thiếu ariaLabel');
  const list = el('div', { class: 'kg-list', role: 'list', 'aria-label': ariaLabel });
  for (const it of items) {
    const inner = [
      it.badge || null,
      el('div', { class: 'kg-list__main' }, [
        typeof it.main === 'string' ? el('div', { class: 'kg-truncate', text: it.main }) : it.main,
        it.sub ? el('div', { class: 'kg-t-caption kg-fg-default kg-truncate', text: it.sub }) : null,
      ]),
      it.meta ? el('span', { class: 'kg-list__meta', text: it.meta }) : null,
      it.trailing || null,
    ];
    const row = it.onClick
      ? el('button', {
          type: 'button', class: 'kg-list__item kg-focus-inset', role: 'listitem',
          'aria-current': it.current ? 'true' : null,
          'aria-label': it.ariaLabel || null,
          onClick: it.onClick,
        }, inner)
      : el('div', { class: 'kg-list__item', role: 'listitem', 'aria-current': it.current ? 'true' : null }, inner);
    list.appendChild(row);
  }
  return list;
}
