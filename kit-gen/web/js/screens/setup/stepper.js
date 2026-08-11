/**
 * stepper.js — Stepper 4 bước của S0 (§3-S0): `①━②──③──④` CÓ NHÃN CHỮ, không chỉ số.
 * Bước đã qua có ✓ và BẤM LÙI ĐƯỢC. Bước chưa tới thì disabled + nêu lý do.
 *
 * Stepper CỐ Ý không thành primitive dùng chung: chỉ S0 có wizard 4 bước, §5.6 không
 * khai nó, và một primitive chỉ-một-nơi-dùng là nợ chứ không phải tài sản (chốt lượt
 * tích hợp — NEEDS-setup-projects.md N5). Dropzone thì ngược lại: 3 nơi dùng ⇒ đã đưa
 * vào `web/js/ui/dropzone.js`.
 * A11y: `aria-current="step"`, mỗi bước là <button> có nhãn đủ nghĩa.
 */

import { el, icon } from '../../ui/index.js';

export const STEPS = Object.freeze([
  { id: 'download', label: 'Cài công cụ', long: 'Bước 1: tải và chạy script cài' },
  { id: 'connect', label: 'Kết nối', long: 'Bước 2: chờ công cụ local sẵn sàng' },
  { id: 'workspace', label: 'Thư mục', long: 'Bước 3: chọn thư mục làm việc' },
  { id: 'imagegen', label: 'Tạo ảnh', long: 'Bước 4: xác nhận môi trường tạo ảnh' },
]);

export function stepIndex(id) {
  const i = STEPS.findIndex((s) => s.id === id);
  return i === -1 ? 0 : i;
}

export function createStepper({ onGoto } = {}) {
  const list = el('ol', {
    style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)', listStyle: 'none', padding: '0', margin: '0' },
  });
  const nav = el('nav', { 'aria-label': 'Các bước cài đặt' }, [list]);

  /** @param {{current:string, done:string[]}} s */
  function render({ current, done = [] }) {
    const curIdx = stepIndex(current);
    list.replaceChildren();
    STEPS.forEach((s, i) => {
      const isDone = done.includes(s.id) || i < curIdx;
      const isCur = s.id === current;
      const reachable = isDone || isCur;
      const btn = el('button', {
        type: 'button',
        class: 'kg-btn kg-btn--sm',
        'aria-current': isCur ? 'step' : null,
        'aria-disabled': reachable ? null : 'true',
        disabled: reachable ? null : true,
        'aria-label': `${s.long}${isDone ? ' — đã xong' : ''}`,
        style: {
          gap: 'var(--s-1)',
          background: isCur ? 'var(--accent-weak)' : 'transparent',
          color: isCur ? 'var(--fg-strong)' : 'var(--fg-default)',
          borderColor: isCur ? 'var(--accent)' : 'transparent',
          borderWidth: '1px', borderStyle: 'solid',
        },
      }, [
        icon(isDone ? '✓' : `${i + 1}`),
        el('span', { class: 'kg-btn__label', text: s.label }),
      ]);
      if (reachable && onGoto) btn.addEventListener('click', () => onGoto(s.id));
      list.appendChild(el('li', { style: { display: 'flex', alignItems: 'center', gap: 'var(--s-2)' } }, [
        btn,
        i < STEPS.length - 1
          ? el('span', {
              'aria-hidden': 'true',
              style: {
                width: 'var(--s-5)', height: '1px',
                background: i < curIdx ? 'var(--accent)' : 'var(--line-default)',
              },
            })
          : null,
      ]));
    });
    return nav;
  }

  return { el: nav, render };
}
