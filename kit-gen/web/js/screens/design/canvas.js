/**
 * design/canvas.js — VÙNG ② KHUNG SHEET (§3-S3.3): header sheet + 3 tab xem
 * (Khung xương / Ảnh đã sinh / Đã cắt) + CẢNH BÁO TẠI CHỖ + lưới ô + thanh validate.
 *
 * Đóng:
 *   C5 · dải vàng "N ô trống — vẫn tính vào ảnh (≈X% diện tích)" + [Thêm element]
 *   C4 · "16/16 ô — thêm element nữa sẽ tạo sheet mới"
 *   D10 · tab chưa có dữ liệu → empty state TRONG khung tab, không phá DOM cha
 *   H2 · [Sinh sheet này…] [Cắt sheet này]
 *   H4 · ảnh trong lưới LUÔN qua ?w=256 (api.files.thumbUrl)
 */

import {
  createBanner, createButton, createEmptyState, createSelect, createTabs,
  el, clear,
} from '../../ui/index.js';
import { api } from '../../core/index.js';
import { readOnlyReason } from '../shared/read-only.js';
import { createCellGrid } from './cell-grid.js';
import { createValidateBar } from './save-bar.js';

const VIEWS = [
  { id: 'skeleton', label: 'Khung xương', icon: '▤' },
  { id: 'raw', label: 'Ảnh đã sinh', icon: '🖼' },
  { id: 'kit', label: 'Đã cắt', icon: '✂' },
];

export function createCanvas(h = {}) {
  const root = el('div', { class: 'd-pane d-pane--canvas' });
  const head = el('div', { class: 'd-canvas-head' });
  const warnRow = el('div', { class: 'd-warnrow' });
  const gridWrap = el('div', { style: { flex: '1 1 auto', minHeight: '0', overflow: 'auto' } });
  const tabsWrap = el('div', {});

  let ctx = { sheet: null, readOnly: false, validation: null, projectId: null, variants: [], jobStates: {} };
  let view = 'skeleton';
  let variantForView = null;

  const grid = createCellGrid({
    onSelect: (i) => h.onSelectCell(i),
    onActivate: (i) => h.onSelectCell(i),
    onMove: (from, to) => h.onMoveCell(from, to),
    onDelete: (i) => h.onDeleteCell(i),
    imageFor: (comp, index) => imageFor(comp, index),
  });

  const validateBar = createValidateBar({ onJump: (item) => h.onJumpToIssue(item) });

  const viewTabs = createTabs({
    ariaLabel: 'Cách xem sheet',
    tabs: VIEWS.map((v) => ({ id: v.id, label: v.label, icon: v.icon, panel: el('div') })),
    active: 'skeleton',
    onChange: (id) => { view = id; refreshGrid(); renderWarnings(); },
  });

  root.appendChild(head);
  root.appendChild(warnRow);
  root.appendChild(tabsWrap);
  root.appendChild(gridWrap);
  root.appendChild(validateBar.el);
  tabsWrap.appendChild(viewTabs.tablist);

  /** Ảnh cho một ô theo tab đang xem. Lưới LUÔN dùng thumbnail w=256 (§6.5-5). */
  function imageFor(comp, index) {
    if (view === 'skeleton' || !ctx.projectId || !comp?.file) return null;
    const variant = variantForView ?? (ctx.variants[0]?.id ?? null);
    if (!variant) return null;
    if (view === 'raw') {
      // Ảnh sinh là ẢNH CẢ SHEET, không phải từng ô ⇒ không vẽ vào từng ô để tránh sai lệch.
      return null;
    }
    // view === 'kit': mỗi element là 1 PNG đã cắt trong kits/<variant>/
    return {
      src: api.files.thumbUrl(ctx.projectId, `kits/${variant}/${comp.file}.png`),
      alt: comp.vi || comp.file,
    };
  }

  function renderHead() {
    clear(head);
    const sh = ctx.sheet;
    if (!sh) return;
    const cols = Number(sh.grid?.cols ?? 0);
    const rows = Number(sh.grid?.rows ?? 0);
    const total = cols * rows;
    const filled = (sh.components ?? []).filter((c) => String(c?.skel?.shape ?? '') !== 'empty').length;

    head.appendChild(el('h2', { class: 'd-canvas-title', text: sh.id }));
    head.appendChild(el('span', {
      class: 'd-canvas-meta',
      text: `lưới ${cols}×${rows} · ${filled}/${total} ô`,
    }));
    head.appendChild(createButton({
      label: 'Đổi lưới…', variant: 'ghost', size: 'sm', icon: '⊞',
      disabled: ctx.readOnly, tooltip: ctx.readOnly ? readOnlyReason() : null,
      onClick: () => h.onResizeGrid(sh.id),
    }));
    head.appendChild(el('span', { style: { marginLeft: 'auto' } }));

    if (ctx.variants.length > 0) {
      const sel = createSelect({
        label: 'Phong cách xem', value: variantForView ?? ctx.variants[0].id, size: 'sm',
        options: ctx.variants.map((v) => ({ value: v.id, label: v.vi || v.id })),
        onChange: (e) => { variantForView = e.target.value; refreshGrid(); renderWarnings(); },
      });
      sel.el.style.minWidth = 'var(--s-10)';
      head.appendChild(sel.el);
    }
    head.appendChild(createButton({
      label: 'Sinh sheet này…', variant: 'secondary', size: 'sm', icon: '⚡',
      disabled: ctx.readOnly, tooltip: ctx.readOnly ? readOnlyReason() : null,
      onClick: () => h.onGenSheet(sh.id),
    }));
    head.appendChild(createButton({
      label: 'Cắt sheet này', variant: 'ghost', size: 'sm', icon: '✂️',
      disabled: ctx.readOnly, tooltip: ctx.readOnly ? readOnlyReason() : null,
      onClick: () => h.onSliceSheet(sh.id),
    }));
  }

  /** Tối đa 2 dòng cảnh báo cùng lúc (§3-S3.3). */
  function renderWarnings() {
    clear(warnRow);
    const sh = ctx.sheet;
    if (!sh) return;
    const cols = Number(sh.grid?.cols ?? 0);
    const rows = Number(sh.grid?.rows ?? 0);
    const total = cols * rows;
    const comps = sh.components ?? [];
    const empties = comps.filter((c) => String(c?.skel?.shape ?? '') === 'empty').length;
    const out = [];

    if (empties > 0) {
      const pct = total > 0 ? Math.round((empties / total) * 100) : 0;
      out.push(createBanner({
        kind: 'warning',
        title: `${empties} ô trống — vẫn tính vào ảnh (≈${pct}% diện tích).`,
        actions: [createButton({
          label: 'Thêm element', variant: 'secondary', size: 'sm',
          disabled: ctx.readOnly, onClick: () => h.onLibrary(),
        })],
      }));
    } else if (total > 0) {
      out.push(createBanner({
        kind: 'info',
        title: `${total}/${total} ô — thêm element nữa sẽ nới lưới thành ${cols}×${rows + 1}.`,
      }));
    }

    // Ảnh đã sinh cũ hơn thiết kế (stale) — lấy từ project.state.jobs
    const staleJobs = Object.entries(ctx.jobStates ?? {})
      .filter(([job, st]) => job.endsWith(`-${sh.id}`) && (st === 'stale' || st === 'uncut'));
    if (staleJobs.length > 0 && out.length < 2) {
      const anyStale = staleJobs.some(([, st]) => st === 'stale');
      out.push(createBanner({
        kind: 'warning',
        title: anyStale
          ? 'Ảnh đã sinh cũ hơn thiết kế.'
          : 'Có ảnh mới nhưng chưa cắt.',
        actions: [createButton({
          label: anyStale ? 'Sinh lại sheet này' : 'Cắt sheet này',
          variant: 'secondary', size: 'sm', disabled: ctx.readOnly,
          onClick: () => (anyStale ? h.onGenSheet(sh.id) : h.onSliceSheet(sh.id)),
        })],
      }));
    }
    for (const b of out.slice(0, 2)) warnRow.appendChild(b);
  }

  /** Lỗi theo từng ô để CellGrid tô viền đỏ. */
  function issuesByIndex() {
    const map = new Map();
    const sh = ctx.sheet;
    if (!sh || !ctx.validation) return map;
    const push = (arr, severity) => {
      for (const it of arr) {
        const t = it.target;
        if (!t || t.kind !== 'element' || t.sheetId !== sh.id) continue;
        if (!map.has(t.index)) map.set(t.index, []);
        map.get(t.index).push({ ...it, severity });
      }
    };
    push(ctx.validation.errors ?? [], 'error');
    push(ctx.validation.warnings ?? [], 'warn');
    return map;
  }

  function refreshGrid() {
    clear(gridWrap);
    const sh = ctx.sheet;
    if (!sh) {
      gridWrap.appendChild(createEmptyState({
        inline: true, icon: '▦', title: 'Chưa chọn sheet',
        description: 'Chọn một sheet ở cây bên trái.',
      }));
      return;
    }
    if ((sh.components ?? []).length === 0) {
      gridWrap.appendChild(createEmptyState({
        inline: true, icon: '▦', title: 'Sheet này chưa có element',
        description: 'Thêm element từ thư viện để lấp các ô của lưới.',
        primary: createButton({
          label: 'Mở thư viện element', variant: 'primary',
          disabled: ctx.readOnly, onClick: () => h.onLibrary(),
        }),
      }));
      return;
    }
    // Tab "Ảnh đã sinh": ảnh là CẢ SHEET → hiện đúng một ảnh, empty state riêng trong tab (D10)
    if (view === 'raw') {
      const variant = variantForView ?? (ctx.variants[0]?.id ?? null);
      const job = variant ? `${variant}-${sh.id}` : null;
      const st = job ? (ctx.jobStates ?? {})[job] : null;
      if (!variant || st === 'never' || st === undefined || st === null) {
        gridWrap.appendChild(createEmptyState({
          inline: true, icon: '🖼', title: 'Chưa có ảnh đã sinh cho sheet này',
          description: variant
            ? `Chưa sinh ảnh cho «${variant} · ${sh.id}» lần nào.`
            : 'Chưa có phong cách nào để sinh ảnh.',
          primary: createButton({
            label: 'Sinh sheet này…', variant: 'primary',
            disabled: ctx.readOnly, onClick: () => h.onGenSheet(sh.id),
          }),
        }));
        return;
      }
      const img = el('img', {
        src: api.files.thumbUrl(ctx.projectId, `raw/${job}.png`),
        alt: `Ảnh AI đã sinh của sheet ${sh.id}, phong cách ${variant}`,
        class: 'kg-checker',
        style: { maxWidth: '100%', height: 'auto', borderRadius: 'var(--r-2)' },
        loading: 'lazy',
      });
      img.addEventListener('error', () => {
        clear(gridWrap);
        gridWrap.appendChild(createEmptyState({
          inline: true, icon: '▨', title: 'Không tải được ảnh',
          description: 'Ảnh nằm trên máy bạn — cần công cụ local đang chạy để xem.',
        }));
      });
      gridWrap.appendChild(el('div', { class: 'kg-stack' }, [
        el('p', { class: 'kg-t-caption kg-fg-default', text: `raw/${job}.png · xem bản đầy đủ ở Thư viện kit` }),
        img,
      ]));
      return;
    }
    gridWrap.appendChild(grid.update(sh, { issues: issuesByIndex() }));
  }

  function render(next = {}) {
    ctx = { ...ctx, ...next };
    if (variantForView === null && ctx.variants.length > 0) variantForView = ctx.variants[0].id;
    renderHead();
    renderWarnings();
    refreshGrid();
    validateBar.update(ctx.validation);
    return root;
  }

  return {
    el: root,
    render,
    grid,
    selectCell(i) { grid.select(i); grid.focusSelected(); },
    get selectedIndex() { return grid.selectedIndex; },
    get view() { return view; },
  };
}
