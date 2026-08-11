/**
 * assets-tab.js — S5 tab **Assets** (§3-S5 wireframe): lưới thumbnail nền checkerboard,
 * gom theo sheet (gập được), zoom, tìm/lọc, dải cảnh báo STALE + file rỗng, lightbox.
 *
 * Ràng buộc đã tuân:
 *  · Lưới LUÔN dùng `?w=256` (§6.5-5, đóng H4 — v1 nạp raw 3.1 MB vào lưới).
 *  · Nền checkerboard là class `.kg-checker` của design system (§5.6), không tự vẽ lại.
 *  · Ô là `<button>` có nhãn thật (§5.8-A5), không `<div onclick>`.
 *  · Ảnh lỗi → khung ▨ "thiếu file" + tooltip đường dẫn tương đối + [Cắt lại] (§3-S5 error).
 */

import {
  el, clear, createButton, createInput, createSelect, createSegmented, createBadge,
  createBanner, createEmptyState, createSkeletonGrid, attachTooltip, icon,
} from '../../ui/index.js';
import * as api from '../../core/api.js';
import * as fmt from '../shared/format.js';
import { openLightbox, applyBackdrop, BACKDROPS, download } from './lightbox.js';
import { gateButton } from '../project/shared/agent-state.js';

const ZOOMS = [72, 104, 152, 208];   // 4 bậc, khớp ý "25/50/100/200%" ở cỡ thumbnail 256px

/**
 * @param {object} o
 * @param {string} o.projectId
 * @param {object|null} o.kit           kết quả #42 (null ⇒ chưa cắt)
 * @param {object} o.staleInfo          { staleJobs:Set<sheetId>, contractNewer:boolean }
 * @param {object} o.status
 * @param {object} o.handlers           { onSlice(sheets), onGen(sheets), onOpenSheet(f), onReload() }
 * @param {object} o.uiState            { backdrop, zoom, query, sheet, collapsed:Set } — giữ giữa các lần vẽ
 */
export function renderAssetsTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });
  const kit = o.kit;
  const ui = o.uiState;

  if (o.loading) {
    root.appendChild(createSkeletonGrid({
      expected: o.expectedCount ?? 12,
      label: 'Đang tải danh sách file kit…',
      factory: () => el('div', { class: 'kg-skel kg-skel--block', style: { aspectRatio: '1 / 1' } }),
    }));
    return root;
  }

  if (!kit || kit.files.length === 0) {
    root.appendChild(emptyState(o));
    return root;
  }

  const files = kit.files;
  const stale = files.filter((f) => isStale(f, o.staleInfo));
  const emptyFiles = files.filter((f) => f.empty);

  /* --- hàng số liệu + nền + zoom --- */
  const bgSeg = createSegmented({
    label: 'Nền xem thử', value: ui.backdrop, items: BACKDROPS,
    note: 'Nền chỉ để nhìn thấy vùng trong suốt — không nằm trong file.',
    onChange: (v) => { ui.backdrop = v; repaintBackdrops(); },
  });
  const zoomOut = createButton({
    variant: 'ghost', size: 'sm', icon: '⊖', iconOnly: true, ariaLabel: 'Thu nhỏ ô xem', tooltip: 'Thu nhỏ (-)',
    onClick: () => { ui.zoom = Math.max(0, ui.zoom - 1); repaintSize(); },
  });
  const zoomIn = createButton({
    variant: 'ghost', size: 'sm', icon: '⊕', iconOnly: true, ariaLabel: 'Phóng to ô xem', tooltip: 'Phóng to (+)',
    onClick: () => { ui.zoom = Math.min(ZOOMS.length - 1, ui.zoom + 1); repaintSize(); },
  });

  root.appendChild(el('div', { class: 'kg-toolbar', style: { marginBottom: '0' } }, [
    el('span', { class: 'kg-t-caption kg-fg-default' }, [
      el('span', { text: `${files.length} file` }),
      el('span', { 'aria-hidden': 'true', text: ' · ' }),
      el('span', { text: fmt.bytes(files.reduce((n, f) => n + (Number(f.bytes) || 0), 0)) }),
      kit.cutAt ? el('span', { 'aria-hidden': 'true', text: ' · ' }) : null,
      kit.cutAt ? el('span', { text: `cắt ${fmt.relTime(kit.cutAt)}` }) : null,
    ]),
    el('div', { class: 'kg-toolbar__spacer' }),
    bgSeg.el,
    el('div', { class: 'kg-row kg-row--tight' }, [zoomOut, zoomIn]),
  ]));

  /* --- tìm + lọc theo sheet --- */
  const sheetIds = [...new Set(files.map((f) => f.sheet).filter(Boolean))].sort();
  const search = createInput({
    label: 'Tìm theo tên file', value: ui.query, size: 'sm', placeholder: '01-btn…',
    onInput: () => { ui.query = String(search.value ?? ''); repaintList(); },
  });
  const sheetSel = createSelect({
    label: 'Sheet', value: ui.sheet, size: 'sm',
    options: [{ value: '', label: 'Tất cả sheet' }, ...sheetIds.map((s) => ({ value: s, label: s }))],
    onChange: () => { ui.sheet = String(sheetSel.value ?? ''); repaintList(); },
  });
  root.appendChild(el('div', { class: 'kg-toolbar', style: { marginBottom: '0', alignItems: 'flex-end' } }, [
    el('div', { style: { flex: '1 1 220px', minWidth: '0' } }, [search.el]),
    el('div', { style: { flex: '0 1 200px' } }, [sheetSel.el]),
  ]));

  /* --- dải cảnh báo (§3-S5) --- */
  if (stale.length > 0) {
    root.appendChild(createBanner({
      kind: 'warning',
      title: `${stale.length} file cũ hơn ảnh đã sinh — cần cắt lại để khớp thiết kế.`,
      actions: [gateButton(createButton({
        label: 'Cắt lại', variant: 'secondary', size: 'sm', icon: '✂',
        onClick: () => o.handlers.onSlice?.(sheetsOf(stale)),
      }), o.status)],
    }));
  }
  if (emptyFiles.length > 0) {
    root.appendChild(createBanner({
      kind: 'warning',
      title: `${emptyFiles.length} file cắt ra rỗng — có thể ô trên sheet bị trống hoặc nền tách sai.`,
      actions: [createButton({
        label: 'Xem sheet gốc', variant: 'secondary', size: 'sm',
        onClick: () => o.handlers.onOpenSheet?.(emptyFiles[0]),
      })],
    }));
  }

  /* --- danh sách gom theo sheet, gập được --- */
  const listWrap = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });
  root.appendChild(listWrap);
  const thumbBoxes = [];
  repaintList();

  function repaintList() {
    clear(listWrap);
    thumbBoxes.length = 0;
    const q = ui.query.trim().toLowerCase();
    const filtered = files.filter((f) => {
      if (ui.sheet && f.sheet !== ui.sheet) return false;
      if (q && !String(f.file).toLowerCase().includes(q)) return false;
      return true;
    });
    if (filtered.length === 0) {
      listWrap.appendChild(createEmptyState({
        inline: true, icon: '🔍',
        title: `Không có file nào khớp «${ui.query || ui.sheet}»`,
        primary: createButton({
          label: 'Xoá bộ lọc', variant: 'secondary', size: 'sm',
          onClick: () => { ui.query = ''; ui.sheet = ''; search.setValue(''); sheetSel.setValue(''); repaintList(); },
        }),
      }));
      return;
    }
    const groups = new Map();
    for (const f of filtered) {
      const key = f.sheet || 'không rõ sheet';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    for (const [sheetId, items] of groups) {
      listWrap.appendChild(groupNode(sheetId, items, filtered));
    }
  }

  function groupNode(sheetId, items, allFiltered) {
    const collapsed = ui.collapsed.has(sheetId);
    const grid = el('div', {
      style: {
        display: collapsed ? 'none' : 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${ZOOMS[ui.zoom]}px, 1fr))`,
        gap: 'var(--s-3)', marginTop: 'var(--s-3)',
      },
    });
    const toggle = createButton({
      label: `${sheetId} (${items.length})`, variant: 'ghost', size: 'sm',
      icon: collapsed ? '▸' : '▾',
      onClick: () => {
        if (ui.collapsed.has(sheetId)) ui.collapsed.delete(sheetId); else ui.collapsed.add(sheetId);
        repaintList();
      },
    });
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

    for (const f of items) {
      grid.appendChild(thumbCell(f, allFiltered));
    }
    return el('section', {}, [
      el('div', { class: 'kg-row', style: { gap: 'var(--s-2)' } }, [
        toggle,
        isStale(items[0], o.staleInfo)
          ? createBadge({ state: 'stale', text: 'cần cắt lại', iconGlyph: '⟳' })
          : null,
      ]),
      grid,
    ]);
  }

  function thumbCell(f, allFiltered) {
    const box = el('div', { class: 'kg-checker', style: {
      aspectRatio: '1 / 1', border: '1px solid var(--line-default)', borderRadius: 'var(--r-2)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
    } });
    thumbBoxes.push(box);
    applyBackdrop(box, ui.backdrop);

    if (o.readOnly) {
      box.appendChild(el('span', { class: 'kg-t-caption kg-fg-default', text: 'Ảnh nằm trên máy bạn' }));
    } else if (f.empty) {
      box.appendChild(el('span', { class: 'kg-t-caption kg-fg-default', text: '⚠ file rỗng' }));
    } else {
      const img = el('img', {
        src: api.files.thumbUrl(o.projectId, f.path),
        alt: fmt.baseName(f.file), loading: 'lazy', decoding: 'async',
        style: { width: '100%', height: '100%', objectFit: 'contain' },
      });
      // §3-S5 error: thiếu file trên đĩa → ô nói rõ + tooltip đường dẫn TƯƠNG ĐỐI
      img.addEventListener('error', () => {
        clear(box);
        const miss = el('span', { class: 'kg-t-caption kg-fg-default', text: '▨ thiếu file' });
        attachTooltip(miss, f.path);
        box.appendChild(miss);
      });
      box.appendChild(img);
    }

    const cell = el('button', {
      type: 'button', class: 'kg-focus-inset',
      'aria-label': `Xem lớn ${fmt.baseName(f.file)}, ${fmt.dimensions(f.w, f.h)}${f.empty ? ', file rỗng' : ''}`,
      style: {
        display: 'flex', flexDirection: 'column', gap: 'var(--s-1)', padding: '0',
        background: 'none', textAlign: 'left', minWidth: '0',
      },
      onClick: () => openLightbox({
        projectId: o.projectId, files: allFiltered, index: allFiltered.indexOf(f),
        backdrop: ui.backdrop, readOnly: o.readOnly,
        isStale: (x) => isStale(x, o.staleInfo),
        onOpenSheet: (x) => o.handlers.onOpenSheet?.(x),
        onRegen: (x) => o.handlers.onGen?.([x.sheet]),
      }),
    }, [
      box,
      el('span', { class: 'kg-t-caption kg-fg-strong kg-truncate', title: f.file, text: fmt.baseName(f.file) }),
      el('span', { class: 'kg-t-caption kg-fg-default', text: fmt.dimensions(f.w, f.h) }),
    ]);
    return cell;
  }

  function repaintBackdrops() { for (const b of thumbBoxes) applyBackdrop(b, ui.backdrop); }
  function repaintSize() { repaintList(); }

  /** Phím tắt của tab (§3-S5): 1/2/3 đổi nền · +/- zoom. Gắn ở root, không bắt khi đang gõ. */
  root.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      ui.backdrop = BACKDROPS[Number(e.key) - 1].value;
      bgSeg.setValue(ui.backdrop);
      repaintBackdrops();
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); ui.zoom = Math.min(ZOOMS.length - 1, ui.zoom + 1); repaintSize(); }
    else if (e.key === '-') { e.preventDefault(); ui.zoom = Math.max(0, ui.zoom - 1); repaintSize(); }
  });

  return root;
}

/** Trạng thái rỗng (§3-S5 empty): phân biệt "đã có ảnh, chưa cắt" vs "chưa có ảnh". */
function emptyState(o) {
  const hasRaw = Number(o.rawPresent ?? 0) > 0;
  if (hasRaw) {
    return createEmptyState({
      icon: '✂',
      title: 'Chưa có file nào được cắt',
      description: 'Đã có ảnh AI. Bước cắt sẽ tách mỗi sheet thành từng PNG trong suốt.',
      primary: gateButton(createButton({
        label: 'Cắt ngay', variant: 'primary', icon: '✂',
        onClick: () => o.handlers.onSlice?.(null),
      }), o.status),
    });
  }
  return createEmptyState({
    icon: '▦',
    title: 'Chưa có file nào được cắt',
    description: 'Cần ảnh đã sinh mới cắt được.',
    primary: gateButton(createButton({
      label: 'Sinh ảnh trước', variant: 'primary', icon: '⚡',
      onClick: () => o.handlers.onGen?.(null),
    }), o.status),
  });
}

/** File cũ hơn ảnh đã sinh / cũ hơn thiết kế ⇒ cảnh báo STALE (§3-S5 + §5.7 badge stale). */
export function isStale(f, staleInfo) {
  if (!f || !staleInfo) return false;
  if (f.sheet && staleInfo.staleSheets?.has(f.sheet)) return true;
  return false;
}

function sheetsOf(files) {
  return [...new Set(files.map((f) => f.sheet).filter(Boolean))];
}

export { download, icon };
