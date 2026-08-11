/**
 * lightbox.js — xem lớn 1 file kit (§3-S5: "Click 1 file → Lightbox").
 * Ảnh ở đây là bản GỐC (không `?w=256`) — đúng §6.5-5: lưới dùng thumbnail, lightbox dùng full.
 * Nền xem thử 3 chế độ (checkerboard / đen / trắng) để đánh giá vùng trong suốt.
 * `←→` chuyển file, Esc đóng, focus trả về ô đã bấm (openModal lo phần focus).
 */

import {
  openModal, createButton, createSegmented, createBadge, el, clear, toast, icon,
} from '../../ui/index.js';
import * as api from '../../core/api.js';
import * as fmt from '../shared/format.js';
import { imageFallback } from '../project/shared/agent-state.js';

export const BACKDROPS = Object.freeze([
  { value: 'checker', label: 'Ô vuông', icon: '▨' },
  { value: 'dark', label: 'Đen', icon: '⬛' },
  { value: 'light', label: 'Trắng', icon: '⬜' },
]);

/** Áp nền xem thử lên một node (dùng cả ở lưới và lightbox). */
export function applyBackdrop(node, mode) {
  node.classList.remove('kg-checker');
  if (mode === 'dark') { node.style.background = 'var(--bg-canvas)'; return; }
  if (mode === 'light') { node.style.background = 'var(--fg-strong)'; return; }
  node.style.background = '';
  node.classList.add('kg-checker');
}

/**
 * @param {object} o
 * @param {string} o.projectId
 * @param {object[]} o.files       danh sách file của tab hiện tại (để ←→ chuyển)
 * @param {number} o.index         file đang xem
 * @param {string} o.backdrop
 * @param {boolean} o.readOnly
 * @param {(file)=>void} o.onRegen  "Sinh lại sheet này"
 * @param {(file)=>void} o.onOpenSheet
 * @param {(f)=>boolean} o.isStale
 */
export function openLightbox(o) {
  let i = Math.max(0, Math.min(o.index ?? 0, (o.files?.length ?? 1) - 1));
  let backdrop = o.backdrop ?? 'checker';

  const stage = el('div', {
    style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '240px', maxHeight: '52vh', overflow: 'auto',
      border: '1px solid var(--line-default)', borderRadius: 'var(--r-2)', padding: 'var(--s-2)',
    },
  });
  const info = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });
  const bg = createSegmented({
    label: 'Nền xem thử', value: backdrop, items: BACKDROPS,
    note: 'Nền chỉ để xem — không nằm trong file PNG.',
    onChange: (v) => { backdrop = v; applyBackdrop(stage, v); },
  });

  const prev = createButton({
    label: 'Trước', variant: 'ghost', size: 'sm', icon: '←',
    onClick: () => { move(-1); },
  });
  const next = createButton({
    label: 'Sau', variant: 'ghost', size: 'sm', icon: '→',
    onClick: () => { move(1); },
  });

  const body = el('div', {}, [
    stage,
    el('div', { class: 'kg-row', style: { marginTop: 'var(--s-3)' } }, [prev, next, el('div', { style: { marginLeft: 'auto' } }, [bg.el])]),
    info,
  ]);

  const m = openModal({
    title: 'Xem file kit', size: 'lg', body,
    footer: null,
  });
  applyBackdrop(stage, backdrop);
  paint();

  // ←→ chuyển file (§3-S5 phím tắt). Modal đã bẫy focus nên nghe trên panel là đủ.
  m.panel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
  });

  function move(d) {
    const n = o.files.length;
    if (n === 0) return;
    i = (i + d + n) % n;
    paint();
  }

  function paint() {
    const f = o.files[i];
    if (!f) return;
    clear(stage);
    if (o.readOnly) {
      stage.appendChild(imageFallback({ note: 'Ảnh nằm trên máy bạn', square: false }));
    } else if (f.empty) {
      // File cắt ra rỗng — nói thật, không hiện ô trống bí ẩn
      stage.appendChild(el('div', { class: 'kg-t-body kg-fg-default', style: { textAlign: 'center' } }, [
        icon('⚠'), el('div', { text: 'File này rỗng — bước cắt không tìm thấy nội dung trong ô.' }),
      ]));
    } else {
      stage.appendChild(el('img', {
        src: api.files.fullUrl(o.projectId, f.path),
        alt: fmt.baseName(f.file),
        style: { maxWidth: '100%', height: 'auto', imageRendering: 'auto' },
      }));
    }

    clear(info);
    info.appendChild(el('div', { class: 'kg-row', style: { gap: 'var(--s-2)' } }, [
      el('span', { class: 'kg-t-subtitle kg-fg-strong', text: fmt.baseName(f.file) }),
      o.isStale?.(f) ? createBadge({ state: 'stale', text: 'Ảnh cũ hơn thiết kế', iconGlyph: '⟳' }) : null,
      f.empty ? createBadge({ state: 'failed', text: 'File rỗng', iconGlyph: '⚠' }) : null,
      el('span', { class: 'kg-t-caption kg-fg-default', style: { marginLeft: 'auto' }, text: `${i + 1}/${o.files.length}` }),
    ]));
    info.appendChild(el('div', { class: 'kg-t-caption kg-fg-default' }, [
      el('span', { text: fmt.dimensions(f.w, f.h) }),
      el('span', { 'aria-hidden': 'true', text: ' · ' }),
      el('span', { text: fmt.bytes(f.bytes) }),
      f.sheet ? el('span', { 'aria-hidden': 'true', text: ' · ' }) : null,
      f.sheet ? el('span', { text: `sheet ${f.sheet}` }) : null,
      Number.isFinite(f.cellIndex) ? el('span', { 'aria-hidden': 'true', text: ' · ' }) : null,
      Number.isFinite(f.cellIndex) ? el('span', { text: `ô số ${f.cellIndex}` }) : null,
    ]));
    info.appendChild(el('div', { class: 'kg-row kg-row--tight' }, [
      createButton({
        label: 'Tải file', variant: 'secondary', size: 'sm', icon: '⬇',
        disabled: o.readOnly,
        onClick: () => download(o.projectId, f),
      }),
      createButton({
        label: 'Copy tên file', variant: 'ghost', size: 'sm', icon: '⧉',
        onClick: async () => {
          try { await navigator.clipboard.writeText(fmt.baseName(f.file)); toast.success({ title: 'Đã copy tên file' }); }
          catch { toast.warning({ title: 'Không copy được', description: fmt.baseName(f.file) }); }
        },
      }),
      f.sheet && o.onOpenSheet
        ? createButton({ label: 'Xem trong sheet gốc', variant: 'ghost', size: 'sm', onClick: () => { m.close(); o.onOpenSheet(f); } })
        : null,
      f.sheet && o.onRegen
        ? createButton({ label: 'Sinh lại sheet này', variant: 'ghost', size: 'sm', icon: '⚡',
            disabled: o.readOnly, onClick: () => { m.close(); o.onRegen(f); } })
        : null,
    ]));
  }

  return m;
}

/** Tải 1 file: dùng <a download> để giữ header của agent, không đọc bytes vào JS. */
export function download(projectId, f) {
  const a = el('a', {
    href: api.files.fullUrl(projectId, f.path),
    download: `${fmt.baseName(f.file)}.png`,
    style: { display: 'none' },
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
