/**
 * jump.js — ⌘P NHẢY NHANH GIỮA PROJECT (§2.3). Fuzzy theo tên + tag (+ id).
 *
 * A11y: mẫu combobox WAI-ARIA — input `role=combobox` + list `role=listbox`,
 * `aria-activedescendant` trỏ tới dòng đang chọn, ↑↓ Enter Esc, KHÔNG cướp Tab.
 * Dữ liệu: danh sách đang có trên màn + `kitgen.recent.v1` (project mở gần đây)
 * ⇒ vẫn dùng được khi agent chưa chạy (đọc từ cache, §2.5).
 *
 * ⌘K (bảng lệnh) là thứ KHÁC và đã có thật: `web/js/app-shell/command-palette.js`.
 * Hộp này chỉ lo ⌘P; shell nhường ⌘P cho màn nào tự khai `jump()`.
 */

import { store } from '../../core/index.js';

const { LS_KEYS } = store;
import { createBadge, createInput, el, openModal } from '../../ui/index.js';
import { foldCase, fuzzyScore, projectState } from './data.js';

const STATE_SHORT = Object.freeze({
  ok: 'Đã đồng bộ', stale: 'Cần sinh lại', uncut: 'Cần cắt', never: 'Chưa có ảnh',
  running: 'Đang sinh', queued: 'Đang chờ', failed: 'Có lỗi', empty: 'Chưa bắt đầu', broken: 'Lỗi đọc',
});
const STATE_TONE = Object.freeze({
  ok: 'ok', stale: 'stale', uncut: 'uncut', never: 'never',
  running: 'running', queued: 'queued', failed: 'failed', empty: 'never', broken: 'failed',
});

/** Xếp hạng: khớp tên/tag trước, rồi tới project mở gần đây (§9.2 J5 kitgen.recent.v1). */
export function rankProjects(items, query, recentIds = []) {
  const q = query.trim();
  const recentRank = new Map(recentIds.map((id, i) => [id, recentIds.length - i]));
  const scored = items.map((p) => {
    const hay = `${p.name ?? ''} ${(p.tags ?? []).join(' ')} ${p.id}`;
    const s = q === '' ? 0 : fuzzyScore(hay, q);
    return { p, s, r: recentRank.get(p.id) ?? 0 };
  });
  const usable = q === '' ? scored : scored.filter((x) => x.s > 0);
  usable.sort((a, b) => (b.s - a.s) || (b.r - a.r) || String(a.p.name ?? '').localeCompare(String(b.p.name ?? ''), 'vi'));
  return usable.map((x) => x.p);
}

function recentIds() {
  try { return store.get(LS_KEYS.recent).projectIds ?? []; } catch { return []; }
}

/**
 * Mở hộp nhảy nhanh.
 * @param {object} o {items, onPick(project), title}
 */
export function openJump({ items = [], onPick, title = 'Nhảy nhanh giữa project' } = {}) {
  const listId = 'kg-jump-list';
  const field = createInput({
    label: 'Tìm project theo tên hoặc tag', autofocus: true,
    placeholder: 'Gõ tên project… (không cần dấu)',
    attrs: {
      type: 'text', role: 'combobox', autocomplete: 'off', spellcheck: 'false',
      'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list',
    },
  });
  field.labelNode.classList.add('kg-sr-only');

  const list = el('div', { class: 'kg-list', role: 'listbox', id: listId, 'aria-label': 'Kết quả' });
  const status = el('p', { class: 'kg-t-caption kg-fg-default', role: 'status', 'aria-live': 'polite' });
  let rows = [];
  let active = 0;

  function render() {
    const ranked = rankProjects(items, field.value, recentIds()).slice(0, 12);
    rows = ranked;
    active = ranked.length > 0 ? Math.min(active, ranked.length - 1) : 0;
    list.replaceChildren();
    ranked.forEach((p, i) => {
      const st = projectState(p);
      const id = `kg-jump-opt-${i}`;
      const row = el('div', {
        class: 'kg-list__item', role: 'option', id,
        'aria-selected': i === active ? 'true' : 'false',
        dataset: { index: String(i) },
        style: i === active ? { background: 'var(--accent-weak)' } : {},
      }, [
        el('div', { class: 'kg-list__main' }, [
          el('div', { class: 'kg-truncate', text: p.name ?? p.id }),
          el('div', { class: 'kg-t-caption kg-fg-default kg-truncate', text: (p.tags ?? []).join(' · ') || p.id }),
        ]),
        createBadge({ state: STATE_TONE[st] ?? 'neutral', text: STATE_SHORT[st] ?? 'Chưa rõ' }),
      ]);
      row.addEventListener('click', () => pick(i));
      list.appendChild(row);
    });
    field.input.setAttribute('aria-activedescendant', ranked.length > 0 ? `kg-jump-opt-${active}` : '');
    status.textContent = ranked.length === 0
      ? (field.value.trim() === '' ? 'Chưa có project nào.' : `Không có project nào khớp «${field.value.trim()}»`)
      : `${ranked.length} project · ↑↓ chọn · Enter mở · Esc đóng`;
  }

  function move(d) {
    if (rows.length === 0) return;
    active = (active + d + rows.length) % rows.length;
    render();
    list.children[active]?.scrollIntoView?.({ block: 'nearest' });
  }

  function pick(i) {
    const p = rows[i];
    if (!p) return;
    m.close('picked');
    onPick?.(p);
  }

  field.input.addEventListener('input', () => { active = 0; render(); });
  field.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); active = 0; render(); }
    else if (e.key === 'End') { e.preventDefault(); active = Math.max(0, rows.length - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
  });

  const m = openModal({
    title, size: 'md', hasInput: true,
    body: el('div', { class: 'kg-stack' }, [field.el, list, status]),
  });
  render();
  return m;
}
