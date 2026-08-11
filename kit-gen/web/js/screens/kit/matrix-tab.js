/**
 * matrix-tab.js — S5 tab **Ma trận so sánh** (§3-S5, thay `preview.html`, đóng J1).
 * Bảng element (hàng) × phong cách (cột), ô = thumbnail.
 * Ô thiếu ảnh hiện `▨ chưa có` + nút [Sinh] — **không bao giờ 404 câm**
 * (v1: 18/78 ảnh 404 im lặng). Có nút [Chỉ hiện chỗ khác nhau].
 */

import {
  el, clear, createButton, createCheckbox, createEmptyState, createSpinnerRow,
  attachTooltip, icon,
} from '../../ui/index.js';
import * as api from '../../core/api.js';
import * as fmt from '../shared/format.js';
import { applyBackdrop } from './lightbox.js';
import { openLightbox } from './lightbox.js';
import { gateButton } from '../project/shared/agent-state.js';

/**
 * @param {object} o
 * @param {string} o.projectId
 * @param {{id,label}[]} o.variants
 * @param {Map<string, object|null>} o.kits   variantId → kết quả #42 (null ⇒ chưa cắt)
 * @param {boolean} o.loading
 * @param {object} o.status
 * @param {object} o.handlers                 { onGen(sheets), onReload() }
 * @param {{backdrop:string, diffOnly:boolean}} o.uiState
 */
export function renderMatrixTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });

  if (o.loading) {
    root.appendChild(createSpinnerRow({ label: 'Đang đọc kit của từng phong cách…' }));
    return root;
  }
  if (o.variants.length === 0) {
    root.appendChild(createEmptyState({
      inline: true, icon: '▦',
      title: 'Chưa có phong cách nào để so sánh',
      description: 'Thêm phong cách thứ hai để so cùng một element giữa các art style.',
    }));
    return root;
  }

  // Hợp tất cả tên element xuất hiện ở bất kỳ phong cách nào.
  const rows = new Map();   // fileName → { sheet, byVariant: Map<variantId, file|null> }
  for (const v of o.variants) {
    const kit = o.kits.get(v.id);
    for (const f of kit?.files ?? []) {
      const key = fmt.baseName(f.file);
      if (!rows.has(key)) rows.set(key, { sheet: f.sheet ?? null, byVariant: new Map() });
      rows.get(key).byVariant.set(v.id, f);
    }
  }
  if (rows.size === 0) {
    root.appendChild(createEmptyState({
      inline: true, icon: '▦',
      title: 'Chưa có file nào được cắt ở bất kỳ phong cách nào',
      description: 'Sinh ảnh rồi cắt xong, ma trận so sánh sẽ có nội dung.',
      primary: gateButton(createButton({ label: 'Sinh ảnh', variant: 'primary', icon: '⚡', onClick: () => o.handlers.onGen?.(null) }), o.status),
    }));
    return root;
  }

  const diffBox = createCheckbox({
    label: 'Chỉ hiện chỗ khác nhau',
    sublabel: 'Ẩn các element đã có đủ ảnh ở mọi phong cách.',
    checked: o.uiState.diffOnly,
    onChange: () => { o.uiState.diffOnly = diffBox.checked; repaint(); },
  });
  root.appendChild(el('div', { class: 'kg-toolbar', style: { marginBottom: '0' } }, [
    el('span', { class: 'kg-t-caption kg-fg-default', text: `${rows.size} element × ${o.variants.length} phong cách` }),
    el('div', { class: 'kg-toolbar__spacer' }),
    diffBox.el,
  ]));

  const tableWrap = el('div', { class: 'kg-table-wrap' });
  root.appendChild(tableWrap);
  repaint();

  function repaint() {
    clear(tableWrap);
    const entries = [...rows.entries()].filter(([, r]) => {
      if (!o.uiState.diffOnly) return true;
      const present = o.variants.filter((v) => r.byVariant.get(v.id) && !r.byVariant.get(v.id).empty).length;
      return present !== o.variants.length;
    });
    if (entries.length === 0) {
      tableWrap.appendChild(createEmptyState({
        inline: true, icon: '✓',
        title: 'Mọi element đều có ảnh ở tất cả phong cách',
        description: 'Bỏ tick “Chỉ hiện chỗ khác nhau” để xem toàn bộ.',
      }));
      return;
    }

    const table = el('table', { class: 'kg-table' }, [
      el('caption', { class: 'kg-sr-only', text: 'So sánh element giữa các phong cách' }),
      el('thead', {}, [
        el('tr', {}, [
          el('th', { scope: 'col', style: { width: '200px' } }, [el('span', { text: 'Element' })]),
          ...o.variants.map((v) => el('th', { scope: 'col' }, [el('span', { text: v.label })])),
        ]),
      ]),
    ]);
    const tbody = el('tbody');
    for (const [name, r] of entries) {
      const tr = el('tr', {}, [
        el('th', { scope: 'row', style: { textAlign: 'left' } }, [
          el('div', { class: 'kg-t-body kg-fg-strong kg-truncate', title: name, text: name }),
          r.sheet ? el('div', { class: 'kg-t-caption kg-fg-default', text: `sheet ${r.sheet}` }) : null,
        ]),
        ...o.variants.map((v) => el('td', {}, [cellNode(name, r, v)])),
      ]);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  function cellNode(name, r, v) {
    const f = r.byVariant.get(v.id);
    if (!f) {
      // KHÔNG 404 câm: nói rõ chưa có + cho hành động ngay tại ô
      const box = el('div', {
        class: 'kg-t-caption kg-fg-default',
        style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s-1)',
          padding: 'var(--s-2)', border: '1px dashed var(--line-default)', borderRadius: 'var(--r-2)',
        },
      }, [
        el('span', {}, [icon('▨'), el('span', { text: ' chưa có' })]),
        r.sheet
          ? gateButton(createButton({
              label: 'Sinh', variant: 'ghost', size: 'sm', icon: '⚡',
              onClick: () => o.handlers.onGen?.([r.sheet], v.id),
            }), o.status)
          : null,
      ]);
      return box;
    }
    const thumb = el('div', {
      class: 'kg-checker',
      style: {
        aspectRatio: '1 / 1', maxWidth: '96px', border: '1px solid var(--line-default)',
        borderRadius: 'var(--r-2)', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      },
    });
    applyBackdrop(thumb, o.uiState.backdrop);
    if (o.readOnly) {
      thumb.appendChild(el('span', { class: 'kg-t-caption kg-fg-default', text: 'trên máy bạn' }));
    } else if (f.empty) {
      thumb.appendChild(el('span', { class: 'kg-t-caption kg-fg-default', text: '⚠ rỗng' }));
    } else {
      const img = el('img', {
        src: api.files.thumbUrl(o.projectId, f.path), alt: `${name} · ${v.label}`,
        loading: 'lazy', decoding: 'async',
        style: { width: '100%', height: '100%', objectFit: 'contain' },
      });
      img.addEventListener('error', () => {
        clear(thumb);
        const miss = el('span', { class: 'kg-t-caption kg-fg-default', text: '▨ thiếu file' });
        attachTooltip(miss, f.path);
        thumb.appendChild(miss);
      });
      thumb.appendChild(img);
    }
    const btn = el('button', {
      type: 'button', class: 'kg-focus-inset',
      'aria-label': `Xem lớn ${name} của phong cách ${v.label}`,
      style: { padding: '0', background: 'none', display: 'block', width: '100%' },
      onClick: () => openLightbox({
        projectId: o.projectId,
        files: [f], index: 0, backdrop: o.uiState.backdrop, readOnly: o.readOnly,
        isStale: () => false,
        onRegen: (x) => o.handlers.onGen?.([x.sheet], v.id),
      }),
    }, [thumb]);
    return btn;
  }

  return root;
}
