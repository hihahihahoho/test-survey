/**
 * screen.js — khung dựng chung cho S2 · S2b · S5 · S6 + máy trạng thái 4 pha.
 *
 * Vì `web/index.html` do team khác sở hữu, mọi màn ở đây tuân theo MỘT hợp đồng mount:
 *     import { mount } from './js/screens/project/index.js';
 *     const screen = mount(container, { projectId, tab, status, onStatusChange });
 *     screen.update({ status });   // agent pill đổi trạng thái
 *     screen.destroy();            // rời màn: dọn listener/timer
 * (Yêu cầu mount point đã ghi ở teams/design/NEEDS-d2p2.md.)
 *
 * KHÔNG hard-code màu/khoảng cách: chỉ dùng class của design system và var(--token)
 * — đúng cách mà web/js/ui/card.js đang làm.
 */

import {
  el, clear, createButton, createSkeleton, createErrorState, createEmptyState,
  createDevDetails, icon,
} from '../../../ui/index.js';
import * as errors from '../../../core/errors.js';
import { readOnlyBanner, isReadOnly } from './agent-state.js';

/** Bốn pha bắt buộc của mọi màn (§3: empty / loading / error / success). */
export const PHASE = Object.freeze({ loading: 'loading', empty: 'empty', error: 'error', success: 'success' });

/** Tiêu đề màn + hàng nút hành động (§5.1 kg-page-head). */
export function pageHead({ title, titleNode = null, subtitle = null, meta = [], actions = [], tags = [] } = {}) {
  const text = el('div', { class: 'kg-page-head__text' }, [
    titleNode ?? el('h1', { class: 'kg-t-display kg-fg-strong', text: title }),
    tags.length ? el('div', { class: 'kg-row kg-row--tight', style: { marginTop: 'var(--s-2)' } }, tags) : null,
    subtitle ? el('p', { class: 'kg-t-body kg-fg-default', style: { marginTop: 'var(--s-1)' }, text: subtitle }) : null,
    meta.length
      ? el('div', { class: 'kg-row kg-row--tight kg-t-caption kg-fg-default', style: { marginTop: 'var(--s-1)' } },
          interleave(meta.map((mtxt) => (typeof mtxt === 'string' ? el('span', { text: mtxt }) : mtxt))))
      : null,
  ]);
  return el('div', { class: 'kg-page-head' }, [
    text,
    actions.length ? el('div', { class: 'kg-page-head__actions' }, actions) : null,
  ]);
}

function interleave(nodes) {
  const out = [];
  nodes.forEach((n, i) => {
    if (i > 0) out.push(el('span', { 'aria-hidden': 'true', text: '·' }));
    out.push(n);
  });
  return out;
}

/** Nhãn nhóm nhỏ in hoa (dùng cho tiêu đề thẻ "VIỆC TIẾP THEO"…). */
export function sectionTitle(text) {
  return el('h2', { class: 'kg-section__title', text });
}

/** Hàng nhãn–giá trị trong thẻ (§5.6): nhãn caption, giá trị body. */
export function statRow(label, value, { valueNode = null } = {}) {
  return el('div', { class: 'kg-row', style: { justifyContent: 'space-between', gap: 'var(--s-3)' } }, [
    el('span', { class: 'kg-t-caption kg-fg-default', text: label }),
    valueNode ?? el('span', { class: 'kg-t-body kg-fg-strong', text: String(value) }),
  ]);
}

/** Thẻ có tiêu đề + nội dung, dùng khung .kg-card của design system. */
export function panel({ title = null, actions = null, children = [], tag = 'section', danger = false } = {}) {
  // Vùng nguy hiểm (§3-S2b) dùng ĐÚNG class `.kg-danger-zone` mà design system đã khai
  // (trước đây tự đặt borderColor inline ⇒ class kia thành CSS chết, hai chỗ định nghĩa
  // cùng một thứ; gộp ở lượt tích hợp).
  const node = el(tag, {
    class: danger ? 'kg-card kg-danger-zone' : 'kg-card',
    style: { padding: 'var(--s-4)', gap: 'var(--s-3)' },
  });
  if (title) {
    node.appendChild(el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } }, [
      sectionTitle(title),
      actions ? el('div', { style: { marginLeft: 'auto' } }, [actions]) : null,
    ]));
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

/** Khối skeleton của một thẻ — giữ nguyên khung khi loading (§3-S2 bảng trạng thái). */
export function panelSkeleton({ rows = 3, title = true } = {}) {
  return el('div', { class: 'kg-card', 'aria-hidden': 'true', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    title ? createSkeleton({ variant: 'text', width: '32%' }) : null,
    createSkeleton({ variant: 'text', count: rows }),
  ]);
}

/** Vùng loading của cả màn: N thẻ skeleton + thông báo cho screen reader (§5.8-A8). */
export function loadingStack({ panels = 3, label = 'Đang tải…' } = {}) {
  const wrap = el('div', { class: 'kg-stack', role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' });
  wrap.appendChild(el('span', { class: 'kg-sr-only', text: label }));
  for (let i = 0; i < panels; i += 1) wrap.appendChild(panelSkeleton({ rows: i === 0 ? 2 : 3 }));
  return wrap;
}

/**
 * Khối lỗi cả màn (§3.9): copy lấy từ bảng tĩnh theo `code`, message kỹ thuật CHỈ trong
 * panel gập. `actions` là các nút thật do màn truyền vào.
 */
export function errorBlock(error, { actions = [] } = {}) {
  const view = errors.present(error);
  return createErrorState({
    title: view.title,
    description: view.explain,
    actions,
    devDetails: errors.devDetails(error),
  });
}

/** Khối "project không còn ở đây" (§3.9 PROJECT_NOT_FOUND / PROJECT_IN_TRASH). */
export function missingProjectBlock(error, { onBack, onTrash }) {
  const view = errors.present(error);
  return createErrorState({
    icon: '▤',
    title: view.title,
    description: view.explain,
    actions: [
      createButton({ label: 'Về danh sách', variant: 'primary', onClick: onBack }),
      createButton({ label: 'Xem thùng rác', variant: 'secondary', onClick: onTrash }),
    ],
  });
}

export { createEmptyState, createDevDetails, icon };

/**
 * Bộ dựng khung màn: banner chỉ-đọc (§2.5-1) luôn ở trên, nội dung ở dưới.
 * Trả về API để màn thay nội dung mà không dựng lại banner (giữ cuộn, giữ focus).
 */
export function createShell(container, { onRetry = null, onWhy = null } = {}) {
  clear(container);
  const bannerSlot = el('div', { class: 'kg-banner-slot' });
  const content = el('div', { class: 'kg-stack' });
  container.appendChild(bannerSlot);
  container.appendChild(content);

  let lastReadOnly = null;

  return {
    bannerSlot, content,
    /** Vẽ lại banner theo trạng thái agent. Trả true nếu vừa chuyển sang kết nối lại. */
    syncBanner(status, { lastSyncLabel = null } = {}) {
      clear(bannerSlot);
      const ro = isReadOnly(status);
      const node = readOnlyBanner(status, { onRetry, onWhy, lastSyncLabel });
      if (node) bannerSlot.appendChild(node);
      const reconnected = lastReadOnly === true && ro === false;
      lastReadOnly = ro;
      return reconnected;
    },
    setContent(node) {
      clear(content);
      if (node) content.appendChild(node);
      return content;
    },
    destroy() { clear(container); },
  };
}
