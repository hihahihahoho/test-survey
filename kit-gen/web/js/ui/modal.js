/**
 * modal.js — §5.5 Modal. Bắt buộc: focus trap · focus về nút an toàn khi mở ·
 * Esc đóng (trừ khi đang thực thi) · click scrim đóng CHỈ KHI không phá huỷ và
 * không có dữ liệu đang nhập · aria-modal + aria-labelledby · trả focus về trigger.
 * §5.5 CẤM window.prompt/confirm/alert (đóng audit I7) → dùng file này.
 *
 * API:
 *   const m = openModal({ title, description, body, footer, size, destructive,
 *                         hasInput, closable, onClose, returnFocusTo })
 *   m.close()   m.setBusy(bool)   m.el   m.body   m.footer
 */
import { el, uid, clear, overlayRoot, on, disposers } from './dom.js';
import { createOverlayController, overlayCount } from './focus.js';
import { createButton } from './button.js';

const SIZES = new Set(['sm', 'md', 'lg', 'xl']);

export function openModal(opts = {}) {
  const {
    title, description = null, body = null, footer = null, size = 'md',
    destructive = false, hasInput = false, closable = true,
    onClose = null, returnFocusTo = null, labelledBy = null,
  } = opts;
  if (!title) throw new Error('kg-modal: thiếu title — §5.5 buộc có aria-labelledby');
  if (!SIZES.has(size)) throw new Error(`kg-modal: size lạ "${size}"`);

  const titleId = labelledBy || uid('kg-modal-title');
  const descId = description ? uid('kg-modal-desc') : null;

  const bodyWrap = el('div', { class: 'kg-modal__body' });
  if (body) bodyWrap.appendChild(body);

  const footWrap = el('div', { class: 'kg-modal__foot' });
  if (footer) footWrap.appendChild(footer);

  const closeBtn = closable
    ? createButton({
        variant: 'ghost', size: 'sm', icon: '✕', iconOnly: true,
        ariaLabel: 'Đóng', tooltip: 'Đóng (Esc)',
        attrs: { class: 'kg-btn kg-btn--ghost kg-btn--sm kg-btn--icon kg-modal__close' },
        onClick: () => requestClose('close-button'),
      })
    : null;

  const panel = el('div', {
    class: 'kg-modal__panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    'aria-describedby': descId,
  }, [
    el('div', { class: 'kg-modal__head' }, [
      el('div', { style: { minWidth: '0', flex: '1 1 auto' } }, [
        el('h2', { class: 'kg-modal__title', id: titleId, text: title }),
        description ? el('p', { class: 'kg-modal__desc', id: descId, text: description }) : null,
      ]),
      closeBtn,
    ]),
    bodyWrap,
    footer ? footWrap : null,
  ]);

  const layer = el('div', { class: `kg-modal kg-modal--${size}` }, [panel]);
  const scrim = el('div', { class: 'kg-scrim' });

  let busy = false;
  let closed = false;

  function requestClose(reason) {
    if (closed) return;
    // §5.5: modal đang thực thi thì Esc/scrim không đóng
    if (busy) return;
    // §5.5: click scrim chỉ đóng khi KHÔNG phá huỷ và KHÔNG có dữ liệu đang nhập
    if (reason === 'scrim' && (destructive || hasInput)) return;
    if (reason === 'escape' && !closable) return;
    close(reason);
  }

  function close(reason = 'programmatic') {
    if (closed) return;
    closed = true;
    ctl.destroy();
    offs();
    layer.remove();
    scrim.remove();
    if (overlayCount() === 0) document.body.classList.remove('kg-no-scroll');
    if (onClose) onClose(reason);
  }

  const root = overlayRoot();
  root.appendChild(scrim);
  root.appendChild(layer);
  document.body.classList.add('kg-no-scroll');

  const offs = disposers(
    on(layer, 'pointerdown', (e) => { if (e.target === layer) requestClose('scrim'); }),
  );

  const ctl = createOverlayController(panel, {
    onRequestClose: requestClose,
    closeOnEsc: true,
    returnFocusTo,
  });

  return {
    el: layer, panel, body: bodyWrap, footer: footWrap,
    close,
    /** setBusy(true) khi đang gọi API: chặn Esc + scrim, không chặn đọc nội dung. */
    setBusy(b) {
      busy = !!b;
      panel.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (closeBtn) closeBtn.disabled = busy;
      return busy;
    },
    setBody(node) { clear(bodyWrap); if (node) bodyWrap.appendChild(node); },
    setFooter(node) { clear(footWrap); if (node) footWrap.appendChild(node); },
  };
}

/**
 * Footer chuẩn: nút xác nhận BÊN PHẢI, Huỷ sát bên trái nó (§5.5).
 * `extraLeft` cho link phụ (ví dụ "Vì sao?").
 */
export function createModalFooter({ confirm = null, cancel = null, extraLeft = null } = {}) {
  return el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--s-2)', width: '100%' } }, [
    extraLeft,
    el('div', { class: 'kg-modal__foot-spacer' }),
    cancel,
    confirm,
  ]);
}
