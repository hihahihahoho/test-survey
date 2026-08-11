/**
 * confirm-dialog.js — hộp xác nhận cho THAO TÁC PHÁ HUỶ.
 * Thay window.confirm (§5.5 cấm, đóng audit I7).
 *
 * Nguyên tắc §1.1-1: mọi hành động phá huỷ phải cho thấy TRƯỚC hậu quả.
 * §0.2-X6: xoá project KHÔNG bắt gõ tên (thùng rác phục hồi được);
 *          chỉ purge vĩnh viễn mới cần mã 4 số từ terminal (§4.4).
 *
 * API:
 *   await confirmDestructive({ title, message, consequences[], confirmLabel,
 *                             cancelLabel, danger, requireCode })
 *     -> false  (huỷ / Esc / đóng)
 *     -> true   (xác nhận thường)
 *     -> { code, setError(msg), close() }   khi requireCode: modal GIỮ MỞ để màn
 *        gọi API rồi tự close(), hoặc setError() khi agent trả CONFIRM_INVALID
 *        (§4.4: sai 3 lần → khoá 60s, mã KHÔNG được lưu ở trình duyệt)
 *   await confirmLight({ title, message, confirmLabel })   // tái tạo rẻ (§1.2)
 */
import { el, icon as iconEl, uid } from './dom.js';
import { openModal, createModalFooter } from './modal.js';
import { createButton, setLoading } from './button.js';
import { createInput } from './field.js';

export function confirmDestructive(opts = {}) {
  const {
    title, message = null, consequences = [], confirmLabel = 'Xoá',
    cancelLabel = 'Huỷ', danger = true, requireCode = false,
    codeHint = 'Mã 4 số in ở cửa sổ Terminal đang chạy công cụ local.',
    onResendCode = null,
  } = opts;
  if (!title) throw new Error('kg-confirm: thiếu title');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

    const list = consequences.length
      ? el('ul', { style: { margin: 'var(--s-3) 0 0', paddingLeft: 'var(--s-5)', display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } },
          consequences.map((c) => el('li', { class: 'kg-t-body kg-fg-default', text: c })))
      : null;

    const codeField = requireCode
      ? createInput({
          label: 'Mã xác nhận (4 số)', hint: codeHint, mono: true,
          attrs: { inputmode: 'numeric', maxlength: '4', autocomplete: 'off', spellcheck: 'false' },
          autofocus: true,
        })
      : null;

    const body = el('div', {}, [
      message ? el('p', { class: 'kg-t-body', text: message }) : null,
      list,
      codeField ? el('div', { style: { marginTop: 'var(--s-4)' } }, [codeField.el]) : null,
      requireCode && onResendCode
        ? createButton({ label: 'Gửi lại mã', variant: 'link', size: 'sm', onClick: () => onResendCode() })
        : null,
    ]);

    const cancelBtn = createButton({
      label: cancelLabel, variant: 'secondary',
      // Huỷ là nút AN TOÀN → nhận focus khi mở (§5.5)
      attrs: { 'data-autofocus': requireCode ? null : '' },
      onClick: () => { finish(false); m.close('cancel'); },
    });

    const confirmBtn = createButton({
      label: confirmLabel,
      variant: danger ? 'danger' : 'primary',
      onClick: () => {
        if (requireCode) {
          const code = String(codeField.value || '').trim();
          if (!/^\d{4}$/.test(code)) {
            codeField.setError('Mã gồm đúng 4 chữ số.');
            codeField.focus();
            return;
          }
          codeField.setError(null);
          setLoading(confirmBtn, true);
          m.setBusy(true);
          // Modal GIỮ MỞ: trả handle để màn gọi API rồi tự đóng / hiện lỗi.
          finish({
            code,
            setError(msg) {
              setLoading(confirmBtn, false);
              m.setBusy(false);
              codeField.setError(msg);
              codeField.focus();
            },
            close() { m.close('confirmed'); },
          });
          return;
        }
        finish(true);
        m.close('confirm');
      },
    });

    const m = openModal({
      title, size: 'sm', destructive: true, hasInput: requireCode,
      body,
      footer: createModalFooter({ cancel: cancelBtn, confirm: confirmBtn }),
      onClose: () => finish(false),
    });

    // Enter trong ô mã = xác nhận
    if (codeField) {
      codeField.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); } });
    }
  });
}

/** §1.2 "Tái tạo rẻ": 1 lần confirm nhẹ, KHÔNG modal to, không nút danger. */
export function confirmLight(opts = {}) {
  const { title, message = null, confirmLabel = 'Tiếp tục', cancelLabel = 'Huỷ' } = opts;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const cancel = createButton({ label: cancelLabel, variant: 'ghost', attrs: { 'data-autofocus': '' }, onClick: () => { finish(false); m.close(); } });
    const ok = createButton({ label: confirmLabel, variant: 'primary', onClick: () => { finish(true); m.close(); } });
    const m = openModal({
      title, size: 'sm',
      body: message ? el('p', { class: 'kg-t-body', text: message }) : el('div'),
      footer: createModalFooter({ cancel, confirm: ok }),
      onClose: () => finish(false),
    });
  });
}

/**
 * Hộp xác nhận có checklist xem trước hậu quả (§4.5 "Dọn cache dẫn xuất").
 * items: [{ id, label, detail, checked, warn }] -> trả về mảng id đã tick hoặc false.
 */
export function confirmChecklist(opts = {}) {
  const { title, items = [], confirmLabel = 'Dọn', footnote = null, summary = null } = opts;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const inputs = [];
    const rows = items.map((it) => {
      const id = uid('kg-cl');
      const input = el('input', { type: 'checkbox', id, dataset: { id: it.id } });
      input.checked = !!it.checked;   // property, không chỉ attribute
      inputs.push(input);
      return el('label', { class: 'kg-check', for: id }, [
        input,
        el('span', {}, [
          el('span', { text: it.label }),
          it.detail ? el('span', { class: 'kg-check__sub', text: it.detail }) : null,
          it.warn ? el('span', { class: 'kg-check__sub', style: { color: 'var(--on-tint-warn)' }, text: `⚠ ${it.warn}` }) : null,
        ]),
      ]);
    });

    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } }, [
      ...rows,
      footnote ? el('p', { class: 'kg-t-caption', style: { color: 'var(--on-tint-danger)', marginTop: 'var(--s-3)' } }, [iconEl('⛔'), ' ', footnote]) : null,
      summary ? el('p', { class: 'kg-t-body', style: { marginTop: 'var(--s-3)' }, text: summary }) : null,
    ]);

    const cancel = createButton({ label: 'Huỷ', variant: 'secondary', attrs: { 'data-autofocus': '' }, onClick: () => { finish(false); m.close(); } });
    const ok = createButton({
      label: confirmLabel, variant: 'primary',
      onClick: () => { finish(inputs.filter((i) => i.checked).map((i) => i.dataset.id)); m.close(); },
    });
    const m = openModal({
      title, size: 'md', destructive: true, hasInput: true,
      body, footer: createModalFooter({ cancel, confirm: ok }),
      onClose: () => finish(false),
    });
  });
}
