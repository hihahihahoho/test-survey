/**
 * cover-picker.js — chọn ẢNH BÌA của project (§3-S2b "Ảnh bìa [▨ … ▾] (•) Tự chọn ( ) Tự động").
 * Nguồn ảnh: chính các file đã cắt trong `kits/` (#42) — không có đường nhập path tự do (X1/G1).
 * Thumbnail LUÔN `?w=256` (§6.5-5). Agent tắt ⇒ khung ▨ + nút disabled, không treo.
 */

import {
  openModal, createModalFooter, createButton, createThumb, createEmptyState,
  createSpinnerRow, el, clear, toast,
} from '../../ui/index.js';
import * as api from '../../core/api.js';
import { loadKit } from './shared/data.js';
import { imageFallback } from './shared/agent-state.js';
import * as errors from '../../core/errors.js';
import * as fmt from '../shared/format.js';

/**
 * @param {{projectId:string, variants:{id:string,label:string}[], current:string|null,
 *          readOnly:boolean, onPick:(relPath:string|null)=>void}} o
 */
export function openCoverPicker({ projectId, variants = [], current = null, readOnly = false, onPick }) {
  const body = el('div', {}, [createSpinnerRow({ label: 'Đang đọc danh sách file kit…' })]);
  let chosen = current;

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', attrs: { 'data-autofocus': '' }, onClick: () => m.close() });
  const clearBtn = createButton({
    label: 'Bỏ ảnh bìa (tự động)', variant: 'ghost',
    onClick: () => { onPick(null); m.close(); },
  });
  const okBtn = createButton({
    label: 'Dùng ảnh này', variant: 'primary',
    onClick: () => { onPick(chosen); m.close(); },
  });
  okBtn.disabled = true;
  okBtn.setAttribute('aria-disabled', 'true');

  const m = openModal({
    title: 'Chọn ảnh bìa', size: 'lg', body,
    footer: createModalFooter({ cancel, confirm: okBtn, extraLeft: clearBtn }),
  });

  void (async () => {
    if (readOnly) {
      clear(body);
      body.appendChild(createEmptyState({
        inline: true, icon: '▨',
        title: 'Cần công cụ local đang chạy',
        description: 'Danh sách ảnh nằm trên máy bạn, phải có công cụ local mới đọc được.',
      }));
      return;
    }
    const variantIds = variants.length ? variants.map((v) => v.id) : [undefined];
    const found = [];
    let lastError = null;
    for (const vid of variantIds) {
      const r = await loadKit(projectId, vid);
      if (r.ok && r.data) found.push(...r.data.files.map((f) => ({ ...f, variant: r.data.variant })));
      else if (!r.ok) lastError = r.error;
    }
    clear(body);
    if (found.length === 0) {
      body.appendChild(createEmptyState({
        inline: true, icon: '▦',
        title: 'Chưa có file kit nào để làm ảnh bìa',
        description: lastError
          ? errors.present(lastError).explain
          : 'Sinh ảnh rồi cắt xong sẽ có ảnh chọn ở đây.',
      }));
      return;
    }
    const grid = el('div', {
      role: 'radiogroup', 'aria-label': 'Ảnh bìa',
      style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 'var(--s-3)' },
    });
    const cells = [];
    found.slice(0, 200).forEach((f, i) => {
      const cell = el('button', {
        type: 'button', role: 'radio', class: 'kg-focus-inset',
        'aria-checked': f.path === chosen ? 'true' : 'false',
        tabindex: (f.path === chosen || (chosen === null && i === 0)) ? '0' : '-1',
        style: {
          display: 'flex', flexDirection: 'column', gap: 'var(--s-1)', padding: 'var(--s-1)',
          border: '1px solid var(--line-default)', borderRadius: 'var(--r-2)', background: 'var(--bg-surface)',
        },
      }, [
        createThumb({ src: api.files.thumbUrl(projectId, f.path), alt: fmt.baseName(f.file) }),
        el('span', { class: 'kg-t-caption kg-fg-default kg-truncate', title: f.file, text: fmt.baseName(f.file) }),
      ]);
      cell.addEventListener('click', () => {
        chosen = f.path;
        cells.forEach((c, j) => {
          c.setAttribute('aria-checked', j === i ? 'true' : 'false');
          c.style.borderColor = j === i ? 'var(--accent)' : 'var(--line-default)';
          c.tabIndex = j === i ? 0 : -1;
        });
        okBtn.disabled = false;
        okBtn.removeAttribute('aria-disabled');
      });
      cells.push(cell);
      grid.appendChild(cell);
    });
    // Bàn phím: mũi tên di chuyển trong radiogroup (mẫu WAI-ARIA), 1 tabstop.
    grid.addEventListener('keydown', (e) => {
      const idx = cells.findIndex((c) => c.tabIndex === 0);
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(cells.length - 1, idx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, idx - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = cells.length - 1;
      if (next === null) return;
      e.preventDefault();
      cells[next].focus();
      cells[next].click();
    });
    body.appendChild(el('p', { class: 'kg-t-caption kg-fg-default', style: { marginBottom: 'var(--s-3)' },
      text: `${found.length} file trong kit đã cắt. Chọn 1 file làm ảnh bìa của project.` }));
    body.appendChild(grid);
  })();
}

/** Ô xem trước ảnh bìa trong form S2b. */
export function coverPreview({ projectId, cover, readOnly }) {
  if (!cover) {
    return el('div', {
      class: 'kg-t-caption kg-fg-default',
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '96px', aspectRatio: '16 / 10', border: '1px dashed var(--line-default)',
        borderRadius: 'var(--r-2)', textAlign: 'center', padding: 'var(--s-1)',
      },
      text: 'tự động',
    });
  }
  if (readOnly) return el('div', { style: { width: '96px' } }, [imageFallback({ note: 'Ảnh trên máy bạn' })]);
  return el('div', { style: { width: '96px' } }, [
    createThumb({ src: api.files.thumbUrl(projectId, cover), alt: `Ảnh bìa: ${fmt.baseName(cover)}` }),
  ]);
}

export { toast };
