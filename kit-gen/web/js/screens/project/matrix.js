/**
 * matrix.js — MA TRẬN TIẾN ĐỘ (phong cách × sheet) của S2 — thành phần cốt lõi của màn
 * (§3-S2 mục 3, đóng audit D1, tiêu chí R24-(3)).
 *
 * Luật thi công:
 *  · Mỗi ô là `<button>` từ primitive `createMatrixCell` (§5.6) → có icon + CHỮ + aria-label
 *    đủ nghĩa ("Tết đỏ, sheet tall, ảnh cũ hơn thiết kế"). KHÔNG bao giờ chỉ có màu (§5.8-A3).
 *  · Composite widget theo §5.8-A6: `role="grid"`, **một tabstop**, ←→↑↓ Home End PageUp/Down
 *    di chuyển, `Enter` mở sheet, `Space` bật/tắt chọn, `⇧`+click/`⇧`+mũi tên chọn dải.
 *  · Chọn nhiều → thanh nổi "⚡ Sinh N lượt đã chọn" (z-index dùng --z-floatbar).
 */

import { el, clear, createMatrixCell, createJobBadge, createButton, icon, uid, JOB_STATES } from '../../ui/index.js';
import { jobLabel, worstOf } from './shared/jobs.js';

const SR_HINT = 'Dùng mũi tên để di chuyển, Enter để mở sheet, dấu cách để chọn nhiều lượt.';

/**
 * @param {object} o
 * @param {import('./shared/jobs.js')} o.matrix  kết quả buildMatrix()
 * @param {(cell)=>void} o.onOpenCell            Enter / click → mở sheet ở S3
 * @param {(jobs:string[])=>void} o.onSelectionChange
 * @returns {{el, selection:()=>string[], clearSelection:()=>void, focusFirst:()=>void}}
 */
export function createProgressMatrix({ matrix, onOpenCell = null, onSelectionChange = null } = {}) {
  const { variants, sheets } = matrix;
  const selected = new Set();
  /** ô đang là tabstop duy nhất */
  let cursor = { r: 0, c: 0 };
  let anchor = null;
  const buttons = new Map();   // "r,c" → button
  const cellsAt = new Map();   // "r,c" → cell data

  const hintId = uid('kg-matrix-hint');
  const grid = el('div', {
    role: 'grid',
    'aria-label': 'Tiến độ theo sheet và phong cách',
    // nối hướng dẫn bàn phím vào lưới (§5.8-A6/A8): trước đây để null nên
    // screen reader không được nghe "dùng mũi tên để di chuyển".
    'aria-describedby': hintId,
    style: {
      display: 'grid',
      gridTemplateColumns: `minmax(120px, max-content) repeat(${Math.max(sheets.length, 1)}, minmax(96px, 1fr))`,
      gap: 'var(--s-1)',
      overflowX: 'auto',
      padding: 'var(--s-1)',
    },
  });

  /* --- hàng tiêu đề: tên sheet (là <th> ngữ nghĩa qua role=columnheader) --- */
  const headRow = el('div', { role: 'row', style: { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' } }, [
    el('span', { role: 'columnheader', class: 'kg-t-tablehead', text: 'Phong cách' }),
    ...sheets.map((s) => el('span', {
      role: 'columnheader', class: 'kg-t-tablehead kg-truncate',
      title: s.id, text: s.id,
    })),
  ]);
  grid.appendChild(headRow);

  /* --- một hàng cho mỗi phong cách --- */
  variants.forEach((v, r) => {
    const row = el('div', {
      role: 'row',
      style: { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1', alignItems: 'center' },
    });
    row.appendChild(el('span', {
      role: 'rowheader', class: 'kg-t-label kg-fg-strong kg-truncate',
      title: v.label, text: v.label,
    }));
    sheets.forEach((s, c) => {
      const cell = matrix.cells.get(`${v.id}|${s.id}`);
      const holder = el('div', { role: 'gridcell', style: { minWidth: '0' } });
      if (!cell || !cell.applies) {
        // Sheet không áp dụng cho phong cách này — nói rõ bằng CHỮ, không để ô trống bí ẩn
        holder.appendChild(el('span', {
          class: 'kg-t-caption kg-fg-default',
          style: { display: 'block', textAlign: 'center' },
          'aria-label': `${v.label}, sheet ${s.id}, không áp dụng`,
          text: 'không áp dụng',
        }));
      } else {
        const btn = createMatrixCell({
          state: cell.state,
          variantLabel: v.label,
          sheetLabel: s.id,
          selected: false,
          onClick: null,
        });
        setTabstop(btn, r === 0 && c === 0);
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.addEventListener('click', (e) => {
          cursor = { r, c };
          if (e.shiftKey) { extendTo(r, c); }
          else if (e.metaKey || e.ctrlKey) { toggle(r, c); }
          else if (onOpenCell) onOpenCell(cell);
          syncTabstop();
        });
        buttons.set(`${r},${c}`, btn);
        cellsAt.set(`${r},${c}`, cell);
        holder.appendChild(btn);
      }
      row.appendChild(holder);
    });
    grid.appendChild(row);
  });

  /* --- bàn phím: một tabstop, mũi tên di chuyển (§5.8-A6) --- */
  grid.addEventListener('keydown', (e) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Enter'];
    if (!keys.includes(e.key)) return;
    const maxR = variants.length - 1;
    const maxC = sheets.length - 1;
    let { r, c } = cursor;
    if (e.key === 'ArrowRight') c = Math.min(maxC, c + 1);
    else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') r = Math.min(maxR, r + 1);
    else if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
    else if (e.key === 'Home') { c = 0; if (e.ctrlKey || e.metaKey) r = 0; }
    else if (e.key === 'End') { c = maxC; if (e.ctrlKey || e.metaKey) r = maxR; }
    else if (e.key === ' ') { e.preventDefault(); toggle(cursor.r, cursor.c); return; }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const cell = cellsAt.get(`${cursor.r},${cursor.c}`);
      if (cell && onOpenCell) onOpenCell(cell);
      return;
    }
    e.preventDefault();
    cursor = { r, c };
    if (e.shiftKey) extendTo(r, c);
    syncTabstop({ focus: true });
  });

  function toggle(r, c) {
    const cell = cellsAt.get(`${r},${c}`);
    if (!cell) return;
    if (selected.has(cell.job)) selected.delete(cell.job);
    else selected.add(cell.job);
    anchor = { r, c };
    paintSelection();
  }

  /** ⇧: chọn dải hình chữ nhật từ anchor tới (r,c) — giống bảng tính, dễ đoán. */
  function extendTo(r, c) {
    if (!anchor) anchor = { r, c };
    selected.clear();
    const r0 = Math.min(anchor.r, r); const r1 = Math.max(anchor.r, r);
    const c0 = Math.min(anchor.c, c); const c1 = Math.max(anchor.c, c);
    for (let i = r0; i <= r1; i += 1) {
      for (let j = c0; j <= c1; j += 1) {
        const cell = cellsAt.get(`${i},${j}`);
        if (cell) selected.add(cell.job);
      }
    }
    paintSelection();
  }

  function paintSelection() {
    for (const [key, btn] of buttons) {
      const cell = cellsAt.get(key);
      btn.setAttribute('aria-pressed', cell && selected.has(cell.job) ? 'true' : 'false');
    }
    if (onSelectionChange) onSelectionChange([...selected]);
  }

  function syncTabstop({ focus = false } = {}) {
    for (const [key, btn] of buttons) setTabstop(btn, key === `${cursor.r},${cursor.c}`);
    if (focus) buttons.get(`${cursor.r},${cursor.c}`)?.focus();
  }

  /** Một tabstop duy nhất (§5.8-A6). Đặt cả property và attribute để DOM luôn khớp. */
  function setTabstop(btn, on) {
    btn.tabIndex = on ? 0 : -1;
    btn.setAttribute('tabindex', on ? '0' : '-1');
  }

  const hint = el('p', { id: hintId, class: 'kg-t-caption kg-fg-default', style: { marginTop: 'var(--s-2)' } }, [
    icon('ⓘ'),
    el('span', { text: ' Bấm 1 ô = mở sheet đó · ⇧+bấm = chọn nhiều để sinh lại · ' }),
    el('span', { text: SR_HINT }),
  ]);

  return {
    el: el('div', { style: { minWidth: '0' } }, [grid, hint]),
    grid,
    selection: () => [...selected],
    clearSelection() { selected.clear(); anchor = null; paintSelection(); },
    focusFirst() { syncTabstop({ focus: true }); },
  };
}

/**
 * Thanh nổi khi đang chọn nhiều ô (§3-S2 mục 3). Luôn nói rõ "đang chọn N/M" (§1.1-4).
 * `onGen` / `onSlice` do màn truyền; nút bị gate ở tầng gọi khi agent chưa chạy.
 */
export function createSelectionBar({ onClear = null } = {}) {
  const label = el('span', { class: 'kg-t-label kg-fg-strong' });
  const actions = el('div', { class: 'kg-row kg-row--tight', style: { marginLeft: 'auto' } });
  const bar = el('div', {
    // class chung với thanh nổi của S1 (web/css/components/surface.css)
    class: 'kg-floatbar kg-floatbar--sticky',
    role: 'status', 'aria-live': 'polite',
    style: { display: 'none' },
  }, [
    label,
    actions,
    onClear ? createButton({ label: 'Bỏ chọn', variant: 'ghost', size: 'sm', onClick: onClear }) : null,
  ]);
  return {
    el: bar,
    /** @param {number} n số ô đã chọn · @param {number} total tổng ô · @param {Node[]} btns nút hành động */
    update(n, total, btns = []) {
      if (n === 0) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      label.textContent = `Đang chọn ${n}/${total} lượt`;
      clear(actions);
      for (const b of btns) actions.appendChild(b);
    },
  };
}

/** Chú giải 7 trạng thái §5.7 — để user không phải đoán icon nghĩa gì. */
export function createMatrixLegend(counts = {}) {
  const items = Object.keys(JOB_STATES)
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => createJobBadge(k, { count: counts[k] }));
  if (items.length === 0) return null;
  return el('div', { class: 'kg-row kg-row--tight', style: { marginTop: 'var(--s-2)' } }, items);
}

/** Nhãn gộp cho một hàng (phong cách) — dùng ở thẻ tóm tắt. */
export function rowSummary(matrix, variantId) {
  const states = matrix.sheets
    .map((s) => matrix.cells.get(`${variantId}|${s.id}`))
    .filter((c) => c && c.applies)
    .map((c) => c.state);
  const w = worstOf(states);
  return w ? { state: w, label: jobLabel(variantId, `${states.length} sheet`) } : null;
}
