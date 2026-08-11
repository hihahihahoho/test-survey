/**
 * preview-helpers.js — tiện ích CHỈ dùng cho trang xem thử (preview-ui.html).
 * Không phải phần của design system.
 */
import { el, append } from './index.js';

export const mount = (id, ...nodes) => {
  const t = document.getElementById(id);
  if (t) append(t, nodes.flat());
};
export const label = (t) => el('div', { class: 'demo-lbl', text: t });
export const row = (...kids) => el('div', { class: 'kg-row' }, kids.flat());
