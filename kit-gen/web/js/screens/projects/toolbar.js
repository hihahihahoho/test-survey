/**
 * toolbar.js — Toolbar của S1 (§3-S1-1): ô tìm (debounce 120ms) · chip filter có SỐ ĐẾM ·
 * chip tag bỏ được · sort · switch grid/list. Tất cả bằng primitive của design system.
 *
 * Trạng thái view sống ở `state.js`; toolbar chỉ phát sự kiện `onChange(partial)`.
 */

import { createButton, createInput, createSegmented, createTag, el, attachTooltip } from '../../ui/index.js';
import { CHIPS, SORTS, allTags } from './data.js';

export function createToolbar({ view, onChange }) {
  const search = createInput({
    label: 'Tìm project',
    placeholder: 'Tìm theo tên, tag hoặc thư mục…   /',
    value: view.query ?? '',
    attrs: { type: 'search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search' },
  });
  // nhãn ẩn: toolbar chật, nhưng §5.8-I4 buộc control có nhãn thật
  search.labelNode.classList.add('kg-sr-only');

  let debounce = null;
  search.input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => onChange({ query: search.input.value }), 120);
  });
  search.input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.input.value !== '') {
      e.stopPropagation();
      search.input.value = '';
      onChange({ query: '' });
    }
  });

  const chipRow = el('div', { class: 'kg-row kg-row--tight', role: 'group', 'aria-label': 'Lọc theo trạng thái' });
  const tagRow = el('div', { class: 'kg-row kg-row--tight' });

  const sortSel = createSelect_();
  const viewSwitch = createSegmented({
    label: 'Kiểu hiển thị',
    items: [
      { value: 'grid', label: 'Lưới', icon: '▦' },
      { value: 'list', label: 'Danh sách', icon: '☰' },
    ],
    value: view.mode ?? 'grid',
    onChange: (v) => onChange({ mode: v }),
  });
  viewSwitch.el.querySelector('.kg-field__label')?.classList.add('kg-sr-only');

  const wrap = el('div', {}, [
    el('div', { class: 'kg-toolbar' }, [
      el('div', { style: { flex: '1 1 280px', minWidth: '0', maxWidth: '420px' } }, [search.el]),
      el('div', { class: 'kg-toolbar__spacer' }),
      sortSel.el,
      viewSwitch.el,
    ]),
    el('div', { class: 'kg-toolbar' }, [chipRow, tagRow]),
  ]);

  function createSelect_() {
    const sel = el('select', { class: 'kg-select kg-select--sm', 'aria-label': 'Sắp xếp' });
    for (const s of SORTS) {
      sel.appendChild(el('option', { value: s.value, selected: s.value === view.sortBy ? true : null, text: s.label }));
    }
    sel.addEventListener('change', () => onChange({ sortBy: sel.value }));
    attachTooltip(sel, 'Thứ tự sắp xếp danh sách');
    return { el: el('div', { style: { flex: 'none', minWidth: 'calc(var(--s-10) * 2 + var(--s-5))' } }, [sel]), sel };
  }

  /**
   * Vẽ lại chip + tag theo dữ liệu THẬT.
   * Chip đếm = 0 vẫn hiện, TRỪ "Đang chạy": lúc không có lượt nào chạy thì chip này vô nghĩa,
   * ẩn đi cho gọn. Số lấy từ `state.jobs` (running/queued) + `state.activeRun` mà agent
   * trả trong #7/#9 — đã hiện thực hoá ở lượt tích hợp (NEEDS-setup-projects.md N3).
   */
  function render({ items, counts, chip, tags }) {
    chipRow.replaceChildren();
    for (const c of CHIPS) {
      const n = counts[c.id] ?? 0;
      if (c.id === 'running' && n === 0 && chip !== 'running') continue;
      const active = chip === c.id;
      const b = createButton({
        label: `${c.label} ${n}`,
        variant: active ? 'secondary' : 'ghost',
        size: 'sm',
        attrs: { 'aria-pressed': active ? 'true' : 'false' },
        icon: active ? '✓' : null,      // §5.8-A3: không dùng màu làm dấu hiệu duy nhất
        onClick: () => onChange({ chip: active ? 'all' : c.id }),
      });
      chipRow.appendChild(b);
    }

    tagRow.replaceChildren();
    const active = new Set(tags);
    for (const t of active) {
      tagRow.appendChild(createTag(`tag: ${t}`, {
        onRemove: () => onChange({ tags: tags.filter((x) => x !== t) }),
      }));
    }
    const avail = allTags(items).filter(([t]) => !active.has(t)).slice(0, 8);
    if (avail.length > 0) {
      const box = el('div', { class: 'kg-row kg-row--tight' }, [
        el('span', { class: 'kg-t-caption kg-fg-default', text: 'tag:' }),
      ]);
      for (const [t, n] of avail) {
        box.appendChild(createButton({
          label: `${t} ${n}`, variant: 'ghost', size: 'sm',
          onClick: () => onChange({ tags: [...tags, t] }),
        }));
      }
      tagRow.appendChild(box);
    }
  }

  return {
    el: wrap,
    render,
    focusSearch() { search.input.focus(); search.input.select?.(); },
    setQuery(v) { search.input.value = v; },
  };
}
