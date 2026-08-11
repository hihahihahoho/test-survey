/**
 * design/dialogs.js — các modal riêng của trình soạn:
 *  · Đổi lưới (thao tác nguy hiểm nhất: cắt lưới nhỏ = mất element ⇒ xem trước + đường lùi)
 *  · Thêm sheet (4 kiểu của §3-S3.2)
 *  · Đổi tên sheet / thêm phong cách / thêm nhân vật (1 ô nhập)
 * Tất cả dùng openModal của design system — CẤM window.prompt/confirm (đóng I7).
 */

import {
  createButton, createInput, createSegmented, createSelect, createBanner,
  createModalFooter, el, openModal,
} from '../../ui/index.js';
import { overflowOf } from './ops.js';

/**
 * Đổi lưới. Trả về `{cols, rows, overflow:'drop'|'move'}` hoặc false.
 */
export function openResizeGridDialog({ sheet, returnFocusTo = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const curCols = Number(sheet?.grid?.cols ?? 4);
    const curRows = Number(sheet?.grid?.rows ?? 4);
    let cols = curCols;
    let rows = curRows;
    let overflow = 'move';

    const info = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });
    const overflowSlot = el('div', {});

    const fCols = createInput({
      label: 'Số cột', type: 'number', value: String(cols), size: 'sm',
      attrs: { min: '1', max: '8', step: '1' },
      onInput: (e) => { cols = clamp(e.target.value); refresh(); },
    });
    const fRows = createInput({
      label: 'Số hàng', type: 'number', value: String(rows), size: 'sm',
      attrs: { min: '1', max: '8', step: '1' },
      onInput: (e) => { rows = clamp(e.target.value); refresh(); },
    });

    function refresh() {
      const total = cols * rows;
      const lost = overflowOf(sheet, cols, rows);
      info.textContent = '';
      info.appendChild(el('p', {
        class: 'kg-t-body',
        text: `Lưới ${cols}×${rows} = ${total} ô (đang là ${curCols}×${curRows} = ${curCols * curRows} ô).`,
      }));
      const cur = (sheet?.components ?? []).length;
      if (total > cur) {
        info.appendChild(el('p', { class: 'kg-t-caption kg-fg-default', text: `Sẽ thêm ${total - cur} ô trống vào cuối.` }));
      }
      overflowSlot.textContent = '';
      if (lost.length > 0) {
        overflowSlot.appendChild(createBanner({
          kind: 'warning',
          title: `${lost.length} element sẽ không còn chỗ: ${lost.slice(0, 4).map((c) => c.file || 'ô trống').join(', ')}${lost.length > 4 ? '…' : ''}`,
        }));
        const seg = createSegmented({
          label: 'Xử lý element thừa',
          value: overflow,
          items: [
            { value: 'move', label: `Chuyển sang sheet mới «${sheet?.id ?? ''}-2»` },
            { value: 'drop', label: `Xoá ${lost.length} element cuối` },
          ],
          onChange: (v) => { overflow = v; },
        });
        overflowSlot.appendChild(seg.el);
      }
      const ok = cols >= 1 && rows >= 1 && cols <= 8 && rows <= 8;
      confirmBtn.disabled = !ok || (cols === curCols && rows === curRows);
    }

    const cancel = createButton({
      label: 'Huỷ', variant: 'secondary', attrs: { 'data-autofocus': '' },
      onClick: () => { finish(false); m.close(); },
    });
    const confirmBtn = createButton({
      label: 'Đổi lưới', variant: 'primary',
      onClick: () => { finish({ cols, rows, overflow }); m.close(); },
    });

    const m = openModal({
      title: `Đổi lưới sheet «${sheet?.id ?? ''}»`,
      description: 'Số ô của sheet luôn phải bằng cột × hàng — chỗ thiếu sẽ thành ô trống.',
      size: 'md', hasInput: true, returnFocusTo,
      body: el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } }, [
        el('div', { class: 'd-props__row' }, [fCols.el, fRows.el]),
        info, overflowSlot,
      ]),
      footer: createModalFooter({ cancel, confirm: confirmBtn }),
      onClose: () => finish(false),
    });
    refresh();
  });
}

/** Thêm sheet — 4 kiểu của §3-S3.2. Trả về mô tả sheet mới hoặc false. */
export function openAddSheetDialog({ returnFocusTo = null, characters = [] } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    let kind = 'blank';
    let cols = 4;
    let rows = 4;
    let orient = 'landscape';
    let characterId = characters[0]?.id ?? null;

    const fId = createInput({
      label: 'Mã sheet', value: '', mono: true, autofocus: true,
      hint: 'Chữ thường, số, gạch nối. Ví dụ: main2, tall, bg-play',
    });
    const gridSlot = el('div', {});
    const charSlot = el('div', {});

    const kindSeg = createSegmented({
      label: 'Kiểu sheet',
      value: 'blank',
      items: [
        { value: 'blank', label: 'Sheet trống (chọn lưới)' },
        { value: 'bg', label: 'Sheet nền full-bleed (1×1)' },
        ...(characters.length ? [{ value: 'pose', label: 'Sheet dáng nhân vật' }] : []),
      ],
      onChange: (v) => { kind = v; refresh(); },
    });

    function refresh() {
      gridSlot.textContent = '';
      charSlot.textContent = '';
      if (kind === 'blank') {
        const fCols = createInput({
          label: 'Số cột', type: 'number', value: String(cols), size: 'sm',
          attrs: { min: '1', max: '8' }, onInput: (e) => { cols = clamp(e.target.value); },
        });
        const fRows = createInput({
          label: 'Số hàng', type: 'number', value: String(rows), size: 'sm',
          attrs: { min: '1', max: '8' }, onInput: (e) => { rows = clamp(e.target.value); },
        });
        const fOrient = createSelect({
          label: 'Khổ ảnh', value: orient,
          options: [
            { value: 'landscape', label: 'Ngang 1536×1024 (ô 3:2)' },
            { value: 'portrait', label: 'Dọc 1024×1536 (ô 2:3)' },
          ],
          onChange: (e) => { orient = e.target.value; },
        });
        gridSlot.appendChild(el('div', { class: 'd-props__row' }, [fCols.el, fRows.el]));
        gridSlot.appendChild(fOrient.el);
      } else if (kind === 'pose') {
        const fChar = createSelect({
          label: 'Nhân vật', value: characterId ?? '',
          options: characters.map((c) => ({ value: c.id, label: c.vi || c.id })),
          onChange: (e) => { characterId = e.target.value; },
        });
        charSlot.appendChild(fChar.el);
        charSlot.appendChild(el('p', { class: 'kg-t-caption kg-fg-default', text: 'Sheet 4×2 khổ dọc, mỗi ô một dáng đã tick của nhân vật.' }));
      } else {
        gridSlot.appendChild(el('p', { class: 'kg-t-caption kg-fg-default', text: 'Lưới 1×1, một ảnh nền tràn viền.' }));
      }
    }

    const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => { finish(false); m.close(); } });
    const ok = createButton({
      label: 'Thêm sheet', variant: 'primary',
      onClick: () => {
        const id = String(fId.value ?? '').trim();
        if (kind === 'bg') finish({ kind, id: id || 'bg-home', cols: 1, rows: 1, orient: 'landscape' });
        else if (kind === 'pose') finish({ kind, id: id || `pose-${characterId ?? 'nv'}`, characterId, cols: 4, rows: 2, orient: 'portrait' });
        else finish({ kind, id: id || 'sheet', cols, rows, orient });
        m.close();
      },
    });

    const m = openModal({
      title: 'Thêm sheet', size: 'md', hasInput: true, returnFocusTo,
      body: el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } }, [fId.el, kindSeg.el, gridSlot, charSlot]),
      footer: createModalFooter({ cancel, confirm: ok }),
      onClose: () => finish(false),
    });
    refresh();
  });
}

/** Modal 1 ô nhập dùng chung (đổi tên sheet, thêm phong cách, thêm nhân vật). */
export function openTextDialog({ title, label, value = '', hint = null, confirmLabel = 'Lưu', returnFocusTo = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const f = createInput({ label, value, hint, autofocus: true });
    const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => { finish(false); m.close(); } });
    const ok = createButton({
      label: confirmLabel, variant: 'primary',
      onClick: () => { finish(String(f.value ?? '').trim()); m.close(); },
    });
    f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
    const m = openModal({
      title, size: 'sm', hasInput: true, returnFocusTo,
      body: f.el, footer: createModalFooter({ cancel, confirm: ok }),
      onClose: () => finish(false),
    });
  });
}

function clamp(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.min(8, Math.max(1, n));
}
