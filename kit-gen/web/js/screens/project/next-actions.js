/**
 * next-actions.js — thẻ "VIỆC TIẾP THEO" của S2 (§3-S2 mục 2).
 * Mục đích: user KHÔNG phải đoán và KHÔNG phải mở log. Mỗi dòng = 1 câu trạng thái
 * (icon + chữ, §5.7) + 1 nút hành động trực tiếp. Tối đa 3 dòng.
 * Không có việc gì cần làm ⇒ dòng xanh "Mọi thứ đã đồng bộ ✓" + gợi ý xem kit.
 */

import { el, createJobBadge, createButton, createBanner, icon } from '../../ui/index.js';
import { gateButton } from './shared/agent-state.js';

/**
 * @param {object} o
 * @param {ReturnType<import('./shared/jobs.js').nextActions>} o.rows
 * @param {object} o.status              trạng thái agent (§2.4) để gate nút ghi
 * @param {object} o.handlers            { onGen(jobs), onSlice(jobs), onDesign(tab), onRuns(), onKit() }
 * @param {boolean} o.degraded           true ⇒ chưa đọc được tiến độ từng lượt (§7.5-U2)
 */
export function createNextActions({ rows = [], status, handlers = {}, degraded = false } = {}) {
  const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' } });

  if (degraded) {
    // Nói THẬT: không có state.jobs thì đây là suy đoán mức sheet, không phải sự thật từng lượt.
    wrap.appendChild(createBanner({
      kind: 'info',
      title: 'Công cụ local chưa trả tiến độ từng lượt — các trạng thái dưới đây là mức sheet, có thể thô hơn thực tế.',
    }));
  }

  if (rows.length === 0) {
    wrap.appendChild(el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } }, [
      createJobBadge('ok', { long: 'Mọi thứ đã đồng bộ' }),
      el('span', { class: 'kg-t-body kg-fg-strong', text: 'Mọi thứ đã đồng bộ — không có việc nào đang chờ.' }),
      el('div', { style: { marginLeft: 'auto' } }, [
        createButton({ label: 'Xem kit đã cắt', variant: 'secondary', size: 'sm', icon: '▦',
          onClick: () => handlers.onKit?.() }),
      ]),
    ]));
    return wrap;
  }

  for (const row of rows) {
    wrap.appendChild(el('div', {
      class: 'kg-row',
      style: {
        gap: 'var(--s-3)', padding: 'var(--s-2)',
        background: 'var(--bg-raised)', borderRadius: 'var(--r-2)',
        border: '1px solid var(--line-subtle)',
      },
    }, [
      createJobBadge(row.state),
      el('div', { style: { minWidth: '0', flex: '1 1 240px' } }, [
        el('div', { class: 'kg-t-body kg-fg-strong', text: row.title }),
        row.detail
          ? el('div', { class: 'kg-t-caption kg-fg-default kg-truncate', title: row.detail, text: row.detail })
          : null,
      ]),
      el('div', { class: 'kg-row kg-row--tight', style: { marginLeft: 'auto', flex: 'none' } },
        actionsFor(row, status, handlers)),
    ]));
  }
  return wrap;
}

/** Mỗi dòng ≤2 nút: 1 nút "xem" (không phá gì) + 1 nút làm việc (bị gate khi chỉ-đọc). */
function actionsFor(row, status, handlers) {
  const out = [];
  if (row.action === 'design') {
    out.push(gateButton(createButton({
      label: 'Mở bản thiết kế', variant: 'secondary', size: 'sm', icon: '✎',
      onClick: () => handlers.onDesign?.('sheets'),
    }), status));
    return out;
  }
  if (row.action === 'styles') {
    out.push(gateButton(createButton({
      label: 'Thêm phong cách', variant: 'secondary', size: 'sm', icon: '✎',
      onClick: () => handlers.onDesign?.('styles'),
    }), status));
    return out;
  }
  if (row.action === 'runs') {
    out.push(createButton({
      label: 'Xem tiến độ', variant: 'secondary', size: 'sm', icon: '⏳',
      onClick: () => handlers.onRuns?.(),
    }));
    return out;
  }
  if (row.action === 'slice') {
    out.push(createButton({
      label: 'Xem', variant: 'ghost', size: 'sm',
      onClick: () => handlers.onKit?.(),
    }));
    out.push(gateButton(createButton({
      label: row.jobs.length === 1 ? 'Cắt 1 sheet' : `Cắt ${row.jobs.length} sheet`,
      variant: 'secondary', size: 'sm', icon: '✂',
      onClick: () => handlers.onSlice?.(row.jobs),
    }), status));
    return out;
  }
  // 'gen' — thao tác TỐN QUOTA: luôn qua modal M1 (§1.1-2), nhãn nói rõ số lượt.
  out.push(createButton({
    label: 'Xem', variant: 'ghost', size: 'sm',
    onClick: () => handlers.onDesign?.('sheets'),
  }));
  out.push(gateButton(createButton({
    label: `Sinh ${row.jobs.length} lượt này`, variant: 'secondary', size: 'sm', icon: '⚡',
    onClick: () => handlers.onGen?.(row.jobs),
  }), status));
  return out;
}

/** Khối hướng dẫn 3 bước cho project mới (§3-S2 trạng thái empty). */
export function createOnboardingSteps({ status, handlers = {} } = {}) {
  const step = (n, title, desc, btn) => el('div', {
    class: 'kg-card',
    style: { padding: 'var(--s-4)', gap: 'var(--s-2)' },
  }, [
    el('div', { class: 'kg-t-label kg-fg-default', text: `Bước ${n}` }),
    el('div', { class: 'kg-t-subtitle kg-fg-strong', text: title }),
    el('p', { class: 'kg-t-caption kg-fg-default', text: desc }),
    btn,
  ]);

  const genBtn = createButton({ label: 'Sinh ảnh', variant: 'secondary', icon: '⚡', onClick: () => {} });
  genBtn.disabled = true;
  genBtn.setAttribute('aria-disabled', 'true');
  const kitBtn = createButton({ label: 'Tải kit', variant: 'secondary', icon: '⬇', onClick: () => {} });
  kitBtn.disabled = true;
  kitBtn.setAttribute('aria-disabled', 'true');

  return el('div', {}, [
    el('p', { class: 'kg-t-body kg-fg-default', style: { marginBottom: 'var(--s-4)' },
      text: 'Project này chưa có sheet nào. Ba bước dưới đây là toàn bộ quy trình.' }),
    el('div', { class: 'kg-grid' }, [
      step(1, 'Chọn element', 'Mở bản thiết kế, thêm element từ thư viện vào các sheet.',
        gateButton(createButton({
          label: 'Chọn element', variant: 'primary', icon: '✎',
          onClick: () => handlers.onDesign?.('sheets'),
        }), status)),
      step(2, 'Sinh ảnh', 'Cần ≥1 sheet mới sinh ảnh được. Bước này tiêu quota tài khoản.',
        withReason(genBtn, 'Cần ≥1 sheet')),
      step(3, 'Tải kit', 'Sau khi sinh và cắt, tải bộ PNG trong suốt về máy.',
        withReason(kitBtn, 'Cần ảnh đã cắt')),
    ]),
  ]);
}

/** Nút xám PHẢI nói lý do (§2.5-2: không ẩn nút, có tooltip giải thích). */
function withReason(btn, reason) {
  const wrap = el('span', { class: 'kg-row kg-row--tight' }, [
    btn,
    el('span', { class: 'kg-t-caption kg-fg-default' }, [icon('ⓘ'), el('span', { text: ` ${reason}` })]),
  ]);
  return wrap;
}
