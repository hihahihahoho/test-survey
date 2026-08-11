/**
 * drawer.js — §5.5 Drawer trượt phải, 480px (log: 640px).
 * Dùng cho: log 1 lượt · lịch sử bản thiết kế · thư viện element · trạng thái
 * công cụ local. Cùng quy tắc a11y như modal, NHƯNG drawer "không chặn"
 * (blocking:false, ví dụ drawer log) cho phép tương tác ngoài → dùng
 * role="complementary" + không scrim, không khoá cuộn.
 *
 * API: openDrawer({ title, body, footer, wide, blocking, onClose, returnFocusTo })
 *      -> { el, body, footer, close, setBody }
 */
import { el, uid, clear, overlayRoot, on, disposers } from './dom.js';
import { createOverlayController, overlayCount } from './focus.js';
import { createButton } from './button.js';

export function openDrawer(opts = {}) {
  const {
    title, body = null, footer = null, wide = false,
    blocking = true, onClose = null, returnFocusTo = null,
  } = opts;
  if (!title) throw new Error('kg-drawer: thiếu title');

  const titleId = uid('kg-drawer-title');
  const bodyWrap = el('div', { class: 'kg-drawer__body' });
  if (body) bodyWrap.appendChild(body);
  const footWrap = el('div', { class: 'kg-drawer__foot' });
  if (footer) footWrap.appendChild(footer);

  const panel = el('aside', {
    class: `kg-drawer${wide ? ' kg-drawer--wide' : ''}`,
    // drawer chặn = dialog (có aria-modal); drawer không chặn = complementary
    role: blocking ? 'dialog' : 'complementary',
    'aria-modal': blocking ? 'true' : null,
    'aria-labelledby': titleId,
    // drawer không chặn nằm ngoài luồng đọc chính → cho nó là landmark tìm được
    tabindex: blocking ? null : '-1',
  }, [
    el('div', { class: 'kg-drawer__head' }, [
      el('h2', { class: 'kg-drawer__title', id: titleId, text: title }),
      createButton({
        variant: 'ghost', size: 'sm', icon: '✕', iconOnly: true,
        ariaLabel: 'Đóng', tooltip: 'Đóng (Esc)',
        onClick: () => close('close-button'),
      }),
    ]),
    bodyWrap,
    footer ? footWrap : null,
  ]);

  const scrim = blocking ? el('div', { class: 'kg-scrim' }) : null;
  const root = overlayRoot();
  if (scrim) root.appendChild(scrim);
  root.appendChild(panel);
  if (blocking) document.body.classList.add('kg-no-scroll');

  let closed = false;
  function close(reason = 'programmatic') {
    if (closed) return;
    closed = true;
    ctl.destroy();
    offs();
    panel.remove();
    if (scrim) scrim.remove();
    if (overlayCount() === 0) document.body.classList.remove('kg-no-scroll');
    if (onClose) onClose(reason);
  }

  const offs = disposers(
    scrim ? on(scrim, 'pointerdown', () => close('scrim')) : null,
  );

  const ctl = createOverlayController(panel, {
    onRequestClose: close,
    closeOnEsc: true,
    returnFocusTo,
    // drawer không chặn: vẫn bẫy Tab khi focus đang ở trong, nhưng user Tab ra
    // ngoài được vì ta không trap (§5.5 "cho phép tương tác ngoài")
    trap: blocking,
  });

  return {
    el: panel, body: bodyWrap, footer: footWrap, close,
    setBody(node) { clear(bodyWrap); if (node) bodyWrap.appendChild(node); },
    setFooter(node) { clear(footWrap); if (node) footWrap.appendChild(node); },
  };
}
