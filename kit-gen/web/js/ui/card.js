/**
 * card.js — Card + Section. Nền của thẻ project (S1) và các thẻ ở S2.
 * §5.8-A12: mọi chuỗi do user nhập vào qua textContent (đóng audit I6).
 * §2.5: thẻ vẽ từ cache có nhãn `cache` + xám bớt, KHÔNG ẩn.
 *
 * API:
 *   createCard({ title, media, badges, rows, tags, footLeft, footRight,
 *                actions, variant, href, onOpen, ariaLabel })
 *   createSection({ title, actions, children })
 */
import { el, cx, append, icon as iconEl } from './dom.js';

export function createCard(opts = {}) {
  const {
    title = null, titleTag = 'h3', media = null, badges = [], rows = [], tags = [],
    footLeft = null, footRight = null, actions = null, variant = 'default',
    interactive = false, onOpen = null, ariaLabel = null, cacheLabel = false,
  } = opts;

  const card = el('article', {
    class: cx('kg-card',
      (interactive || onOpen) && 'kg-card--interactive',
      variant === 'error' && 'kg-card--error',
      variant === 'cache' && 'kg-card--cache'),
    'aria-label': ariaLabel,
  });

  if (media) {
    const m = el('div', { class: 'kg-card__media' }, [media]);
    if (badges.length) m.appendChild(el('div', { class: 'kg-card__media-badge' }, badges));
    card.appendChild(m);
  }

  if (title) {
    card.appendChild(el('div', { class: 'kg-card__head' }, [
      el(titleTag, { class: 'kg-card__title kg-clamp-2', text: title }),
      !media && badges.length ? el('div', { style: { marginLeft: 'auto', flex: 'none' } }, badges) : null,
    ]));
  }

  const body = el('div', { class: 'kg-card__body' });
  for (const r of rows) {
    // r: string | node — dòng số liệu thứ cấp
    body.appendChild(typeof r === 'string' ? el('div', { class: 'kg-t-caption kg-fg-default', text: r }) : r);
  }
  if (tags.length) body.appendChild(el('div', { class: 'kg-row kg-row--tight' }, tags));
  if (cacheLabel) {
    body.appendChild(el('span', { class: 'kg-badge kg-badge--neutral' }, [
      iconEl('▤'), el('span', { class: 'kg-badge__text', text: 'cache' }),
    ]));
  }
  if (body.childNodes.length) card.appendChild(body);

  if (footLeft || footRight || actions) {
    card.appendChild(el('div', { class: 'kg-card__foot' }, [
      footLeft ? (typeof footLeft === 'string' ? el('span', { text: footLeft }) : footLeft) : null,
      footRight ? el('span', { style: { marginLeft: 'auto' } }, [typeof footRight === 'string' ? el('span', { text: footRight }) : footRight]) : null,
      actions ? el('div', { style: { marginLeft: footRight ? 'var(--s-2)' : 'auto', display: 'flex', gap: 'var(--s-2)' } }, [actions]) : null,
    ]));
  }

  // Bấm cả thẻ = Mở (S1). Vẫn PHẢI có nút [Mở] thật trong actions cho bàn phím.
  if (onOpen) {
    card.addEventListener('click', (e) => {
      // không cướp click của nút/link bên trong
      if (e.target.closest('button, a, input, label')) return;
      onOpen(e);
    });
  }
  return card;
}

/** Section có tiêu đề chữ nhỏ in hoa (thẻ "VIỆC TIẾP THEO", "TIẾN ĐỘ…"). */
export function createSection({ title, actions = null, children = [], tag = 'section' } = {}) {
  const head = title
    ? el('div', { class: 'kg-row', style: { marginBottom: 'var(--s-2)' } }, [
        el('h2', { class: 'kg-section__title', style: { marginBottom: '0' }, text: title }),
        actions ? el('div', { style: { marginLeft: 'auto' } }, [actions]) : null,
      ])
    : null;
  const node = el(tag, { class: 'kg-card', style: { padding: 'var(--s-4)' } });
  if (head) node.appendChild(head);
  append(node, children);
  return node;
}

/** Thumb (§5.6): nền checkerboard, object-fit contain, alt BẮT BUỘC. */
export function createThumb({ src, alt, size = null, onClick = null } = {}) {
  if (alt === undefined || alt === null) {
    throw new Error('kg-thumb: thiếu alt — §5.6 buộc alt = nhãn tiếng Việt của element (§5.8-A9)');
  }
  const img = el('img', { src, alt, loading: 'lazy', decoding: 'async', style: { width: '100%', height: '100%', objectFit: 'contain' } });
  const box = el(onClick ? 'button' : 'div', {
    type: onClick ? 'button' : null,
    class: 'kg-checker',
    style: {
      aspectRatio: '1 / 1', width: size ? `${size}px` : '100%',
      border: '1px solid var(--line-default)', borderRadius: 'var(--r-2)',
      overflow: 'hidden', padding: '0',
    },
    'aria-label': onClick ? `Xem lớn: ${alt}` : null,
  }, [img]);
  if (onClick) box.addEventListener('click', onClick);
  return box;
}
