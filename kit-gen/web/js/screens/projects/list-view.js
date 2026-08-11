/**
 * list-view.js — view `☰ list` của S1 (§3-S1 wireframe list) + thanh hành động nổi
 * khi chọn nhiều. MUST của chọn nhiều: **xuất zip + xoá** (§3-S1).
 * Dùng `createTable` (đã có aria-sort, checkbox có nhãn thật) — không tự dựng bảng.
 */

import { attachMenu, createButton, createJobBadge, createTag, createTable, el, setDisabled } from '../../ui/index.js';
import { bytes, relTime } from '../shared/format.js';
import { projectMenuItems } from './card.js';
import { projectState } from './data.js';

const STATE_TEXT = Object.freeze({
  ok: 'Đã đồng bộ', stale: 'Cần sinh lại', uncut: 'Cần cắt', never: 'Chưa có ảnh',
  queued: 'Đang chờ', running: 'Đang sinh', failed: 'Có lỗi', empty: 'Chưa bắt đầu',
  broken: 'Không đọc được',
});

export function createListView({ items, actions, readOnly, reason, sortBy, onSort, onSelectionChange }) {
  const table = createTable({
    caption: 'Danh sách project trong thư mục làm việc',
    selectable: true,
    rowKey: (p) => p.id,
    sort: { key: sortBy, dir: sortBy === 'name' ? 'asc' : 'desc' },
    onSort: ({ key }) => onSort(key),
    onSelectionChange,
    columns: [
      {
        key: 'name', label: 'Project', sortable: true,
        render: (p) => el('div', { class: 'kg-row kg-row--tight' }, [
          el('button', {
            type: 'button', class: 'kg-btn kg-btn--link kg-btn--sm',
            onClick: () => actions.open(p),
            'aria-label': `Mở project ${p.name ?? p.id}`,
          }, [el('span', { class: 'kg-btn__label kg-truncate', text: p.name ?? p.id })]),
          ...(p.tags ?? []).slice(0, 3).map((t) => createTag(t)),
        ]),
      },
      { key: 'variants', label: 'Phong cách', align: 'right', render: (p) => String(p.stats?.variants ?? 0) },
      { key: 'sheets', label: 'Sheet', align: 'right', render: (p) => String(p.stats?.sheets ?? 0) },
      { key: 'components', label: 'Element', align: 'right', render: (p) => String(p.stats?.components ?? 0) },
      {
        key: 'state', label: 'Trạng thái',
        render: (p) => {
          const st = projectState(p);
          if (st === 'broken') {
            return el('div', { class: 'kg-row kg-row--tight' }, [
              createJobBadge('failed', { long: 'Không đọc được project' }),
              el('span', { class: 'kg-t-caption kg-fg-default', text: STATE_TEXT.broken }),
            ]);
          }
          const badge = st === 'empty' ? 'never' : st;
          return el('div', { class: 'kg-row kg-row--tight' }, [
            createJobBadge(badge, { long: STATE_TEXT[st] }),
            el('span', { class: 'kg-t-caption kg-fg-default', text: STATE_TEXT[st] ?? '' }),
          ]);
        },
      },
      { key: 'updatedAt', label: 'Sửa', sortable: true, render: (p) => relTime(p.updatedAt) },
      { key: 'diskBytes', label: 'Dung lượng', align: 'right', sortable: true, render: (p) => bytes(p.stats?.diskBytes ?? 0) },
      {
        key: 'more', label: 'Thao tác', width: 'calc(var(--s-8) + var(--s-2))',
        render: (p) => {
          const b = createButton({
            variant: 'ghost', size: 'sm', icon: '⋯', iconOnly: true,
            ariaLabel: `Thao tác khác cho ${p.name ?? p.id}`,
            tooltip: 'Thao tác khác (Shift+F10)',
          });
          attachMenu(b, () => projectMenuItems(p, actions, { readOnly, reason }));
          return b;
        },
      },
    ],
    // __label: createTable dùng làm nhãn thật cho checkbox chọn dòng (§5.8-I4)
    rows: items.map((p) => ({ ...p, __label: p.name ?? p.id })),
  });
  return table;
}

/**
 * Thanh hành động nổi ở đáy (§3-S1): `N project đã chọn [Thêm tag] [Xuất zip] [Xoá]`.
 * MUST là xuất + xoá nhiều; "Thêm tag" cần PATCH từng project nên vẫn làm được ở đây.
 * Kiểu dáng dùng class chung `.kg-floatbar` (web/css/components/surface.css) — gộp ở
 * lượt tích hợp với thanh nổi của ma trận S2 để hai chỗ không lệch nhau.
 */
export function createBulkBar({ onExport, onDelete, onTag, onClear, readOnly, reason }) {
  const label = el('span', { class: 'kg-t-label', text: '0 project đã chọn' });
  const btnTag = createButton({ label: 'Thêm tag', variant: 'secondary', size: 'sm', icon: '#', onClick: () => onTag() });
  const btnExport = createButton({ label: 'Xuất .zip', variant: 'secondary', size: 'sm', icon: '⬇', onClick: () => onExport() });
  const btnDelete = createButton({ label: 'Xoá', variant: 'secondary', size: 'sm', icon: '🗑', onClick: () => onDelete() });
  const btnClear = createButton({
    variant: 'ghost', size: 'sm', icon: '✕', iconOnly: true,
    ariaLabel: 'Bỏ chọn tất cả', tooltip: 'Bỏ chọn (Esc)', onClick: () => onClear(),
  });

  // QA-UX CAO-A: dùng primitive thay vì tự đặt title (xem chú thích ở projects/index.js).
  for (const b of [btnTag, btnExport, btnDelete]) if (readOnly) setDisabled(b, true, reason ?? null);

  const bar = el('div', {
    class: 'kg-floatbar kg-floatbar--fixed',
    role: 'region', 'aria-label': 'Hành động cho nhiều project',
    hidden: true,
  }, [label, btnTag, btnExport, btnDelete, btnClear]);

  return {
    el: bar,
    update(n) {
      label.textContent = `${n} project đã chọn`;
      if (n > 0) bar.removeAttribute('hidden'); else bar.setAttribute('hidden', '');
    },
  };
}
