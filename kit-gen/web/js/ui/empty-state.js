/**
 * empty-state.js — §5.6 EmptyState: icon 40px + tiêu đề + 1–2 dòng + 1 nút primary
 * + (tuỳ) 3 bước gợi ý. LUẬT: MỌI empty state phải nói được VIỆC TIẾP THEO.
 *
 * Biến thể `inline` dùng trong khung tab để KHÔNG phá DOM cha (đóng audit D10).
 *
 * API: createEmptyState({ icon, title, description, primary, secondary, steps, inline })
 *      createErrorState({ title, description, actions, devDetails })  // §3.9
 */
import { el, append, icon as iconEl } from './dom.js';
import { createButton } from './button.js';

export function createEmptyState(opts = {}) {
  const {
    icon = '▤', title, description = null, primary = null, secondary = null,
    steps = [], inline = false, role = null,
  } = opts;
  if (!title) throw new Error('kg-empty: thiếu title');
  if (!primary && !inline) {
    console.warn('kg-empty: §5.6 yêu cầu 1 nút primary — empty state phải nói được việc tiếp theo');
  }

  const node = el('div', { class: `kg-empty${inline ? ' kg-empty--inline' : ''}`, role });
  append(node, [
    el('div', { class: 'kg-empty__icon', 'aria-hidden': 'true', text: icon }),
    el('p', { class: 'kg-empty__title', text: title }),
    description ? el('p', { class: 'kg-empty__desc', text: description }) : null,
    (primary || secondary) ? el('div', { class: 'kg-empty__actions' }, [primary, secondary]) : null,
  ]);
  if (steps.length) {
    node.appendChild(el('ol', { class: 'kg-empty__steps' },
      steps.map((s, i) => el('li', { text: `${i + 1}. ${s}` }))));
  }
  return node;
}

/**
 * Trạng thái lỗi trong màn (không phải toast) — §1.1-5: 1 câu người thật hiểu
 * + ≥1 nút hành động + panel "Chi tiết cho lập trình viên" GẬP LẠI.
 * `devDetails` là error.message kỹ thuật của agent — §6.1 cấm hiện ra thân UI.
 */
export function createErrorState(opts = {}) {
  const { icon = '⛔', title, description = null, actions = [], devDetails = null } = opts;
  if (!title) throw new Error('kg-error-state: thiếu title');

  const node = el('div', { class: 'kg-empty', role: 'alert' }, [
    el('div', { class: 'kg-empty__icon', 'aria-hidden': 'true', style: { color: 'var(--on-tint-danger)' }, text: icon }),
    el('p', { class: 'kg-empty__title', text: title }),
    description ? el('p', { class: 'kg-empty__desc', text: description }) : null,
    actions.length ? el('div', { class: 'kg-empty__actions' }, actions) : null,
  ]);
  if (devDetails) node.appendChild(createDevDetails(devDetails));
  return node;
}

/**
 * Panel "Chi tiết cho lập trình viên ▾" — dùng ở MỌI chỗ báo lỗi (§3.9).
 * Gập lại mặc định, có nút Copy. KHÔNG BAO GIỜ hiện `message` ở thân UI.
 */
export function createDevDetails(text, { summary = 'Chi tiết cho lập trình viên' } = {}) {
  const pre = el('pre', {
    class: 'kg-t-mono',
    style: {
      margin: 'var(--s-2) 0 0', padding: 'var(--s-2)', maxHeight: '160px', overflow: 'auto',
      background: 'var(--bg-canvas)', border: '1px solid var(--line-subtle)',
      borderRadius: 'var(--r-1)', color: 'var(--fg-default)', textAlign: 'left', whiteSpace: 'pre-wrap',
    },
    text: String(text),
  });
  const copyBtn = createButton({
    label: 'Copy', variant: 'ghost', size: 'sm', icon: '⧉',
    onClick: async () => {
      try { await navigator.clipboard.writeText(String(text)); } catch { /* không có clipboard: user tự chọn */ }
    },
  });
  return el('details', { style: { marginTop: 'var(--s-3)', textAlign: 'left', width: '100%', maxWidth: '52ch' } }, [
    el('summary', { class: 'kg-t-label kg-fg-default', style: { cursor: 'pointer' }, text: summary }),
    pre,
    copyBtn,
  ]);
}

/** Banner trong màn (§5.5) — 4 màu, icon + tiêu đề 1 dòng + ≤2 nút. */
export function createBanner(opts = {}) {
  const { kind = 'info', title, actions = [], onDismiss = null, live = false } = opts;
  const ICONS = { info: 'ⓘ', warning: '▲', error: '⛔', success: '●' };
  if (!title) throw new Error('kg-banner: thiếu title');
  // §5.5 viết "≤2 nút" nhưng §2.5-1 KHAI ĐÍCH DANH 3 nút cho banner chỉ-đọc
  // ([Copy lệnh] [Thử lại] [Vì sao?]). Chốt ở lượt tích hợp: theo §2.5 vì nó cụ thể hơn,
  // và trần 3 vẫn chặn được banner biến thành thanh công cụ. Trước đây chrome.js phải
  // chèn nút thứ 3 ra NGOÀI vùng .kg-banner__actions ⇒ lệch layout + thứ tự Tab.
  if (actions.length > 3) throw new Error('kg-banner: tối đa 3 nút (§2.5-1); nhiều hơn thì dùng sheet/modal');
  return el('div', {
    class: `kg-banner kg-banner--${kind}`,
    role: kind === 'error' ? 'alert' : 'status',
    'aria-live': live ? 'polite' : null,
  }, [
    iconEl(ICONS[kind]),
    el('div', { class: 'kg-banner__main', text: title }),
    actions.length ? el('div', { class: 'kg-banner__actions' }, actions) : null,
    onDismiss ? createButton({ variant: 'ghost', size: 'sm', icon: '✕', iconOnly: true, ariaLabel: 'Ẩn thông báo', onClick: onDismiss }) : null,
  ]);
}
