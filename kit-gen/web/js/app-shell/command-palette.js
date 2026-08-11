/**
 * command-palette.js — ⌘K BẢNG LỆNH (§2.3, §7.1 khối MUST).
 *
 * VÌ SAO TỒN TẠI: §2.3 nói "Mọi hành động trong spec này phải gọi được từ đây", và
 * §7.1 xếp ⌘K vào MUST vì nó là **điều kiện của "điều hướng bàn phím đủ"** (§5.8-A6).
 * Trước đây shell tạm map ⌘K sang hộp nhảy project (TODO NEEDS-N9) ⇒ các hành động
 * như "Tạo project", "Sinh ảnh", "Thùng rác" KHÔNG có đường bàn phím nào từ mọi màn.
 *
 * THIẾT KẾ (không thêm tính năng mới — chỉ mở đường bàn phím tới hành động ĐÃ CÓ):
 *  · Lệnh điều hướng  → `router.go(...)` theo đúng §2.1, không phát minh màn mới.
 *  · Lệnh của S1 (tạo/nhập project) → điều hướng về S1 rồi phát đúng sự kiện
 *    `kg:create-project` / `kg:import-project` mà shell.js ĐÃ lắng nghe.
 *  · Lệnh của màn đang mở → lấy từ `handle.commands()` (tuỳ chọn). Màn nào chưa
 *    khai thì bảng lệnh vẫn đủ phần toàn cục — không màn nào bị vỡ.
 *
 * A11Y (§5.8-A6/A7/A8): mẫu combobox WAI-ARIA giống `screens/projects/jump.js`
 * (một hộp nhập `role=combobox` + `role=listbox`, `aria-activedescendant`),
 * ↑↓ Home End di chuyển · Enter chạy · Esc đóng · focus trả về trigger (do
 * `openModal` + `createOverlayController` lo). Vùng đếm kết quả là `role=status`.
 */

import { createBadge, createInput, el, openModal } from '../ui/index.js';
import { foldCase, fuzzyScore } from '../screens/projects/data.js';

/** Nhóm hiển thị, theo thứ tự cố định để user học được vị trí. */
const GROUP_ORDER = ['Màn hình này', 'Project', 'Điều hướng', 'Công cụ local', 'Trợ giúp'];

/**
 * Dựng danh sách lệnh toàn cục.
 * @param {object} o
 * @param {object} o.router        core/router
 * @param {string|null} o.projectId  project đang mở (null nếu đang ở S1/S6)
 * @param {object} o.status        trạng thái agent (§2.4) — để gate lệnh gây thay đổi
 * @param {object} o.hooks         { openShortcuts, openJump, refreshAgent, copyRunCmd }
 */
export function baseCommands({ router, projectId = null, status = {}, hooks = {} }) {
  const readOnly = status?.readOnly === true;
  // §2.5-2: lệnh gây thay đổi KHÔNG bị ẩn — vẫn hiện, có lý do, chỉ không chạy được.
  const gate = (reason) => (readOnly ? (reason || 'Cần công cụ local đang chạy') : null);
  const go = (id, params, query) => () => router.go(id, params, query);

  const list = [
    /* ── Điều hướng (§2.1) ───────────────────────────────────────────────── */
    { id: 'nav.projects', group: 'Điều hướng', label: 'Về danh sách project', hint: 'g p', icon: '▤', run: go('S1') },
    { id: 'nav.settings.agent', group: 'Điều hướng', label: 'Cài đặt · Công cụ local & Thư mục làm việc', icon: '⚙', run: go('S6', {}, { tab: 'agent' }) },
    { id: 'nav.settings.env', group: 'Điều hướng', label: 'Cài đặt · Môi trường và Tạo ảnh AI', icon: '⚙', run: go('S6', {}, { tab: 'env' }) },
    { id: 'nav.settings.prefs', group: 'Điều hướng', label: 'Cài đặt · Ưu tiên (song song, auto-cắt, giao diện)', icon: '⚙', run: go('S6', {}, { tab: 'prefs' }) },
    { id: 'nav.settings.trash', group: 'Điều hướng', label: 'Cài đặt · Thùng rác', icon: '🗑', run: go('S6', {}, { tab: 'trash' }) },
    { id: 'nav.settings.about', group: 'Điều hướng', label: 'Cài đặt · Phiên bản & quyền riêng tư', icon: '⚙', run: go('S6', {}, { tab: 'about' }) },

    /* ── Project: hành động của S1, gọi được từ MỌI màn ──────────────────── */
    {
      id: 'project.create', group: 'Project', label: 'Tạo project mới…', hint: 'n', icon: '＋',
      disabledReason: gate(), run: () => runOnProjectsScreen(router, 'kg:create-project'),
    },
    {
      id: 'project.import', group: 'Project', label: 'Nhập project từ styles.json cũ…', icon: '⇧',
      disabledReason: gate(), run: () => runOnProjectsScreen(router, 'kg:import-project'),
    },
    { id: 'project.jump', group: 'Project', label: 'Nhảy nhanh giữa project…', hint: '⌘P', icon: '⇄', run: () => hooks.openJump?.() },

    /* ── Công cụ local (§2.4/§2.5) ───────────────────────────────────────── */
    { id: 'agent.recheck', group: 'Công cụ local', label: 'Kiểm tra lại công cụ local', icon: '↻', run: () => hooks.refreshAgent?.() },
    { id: 'agent.copycmd', group: 'Công cụ local', label: 'Copy lệnh chạy công cụ local', icon: '⧉', run: () => hooks.copyRunCmd?.() },
    { id: 'agent.setup', group: 'Công cụ local', label: 'Chạy lại hướng dẫn cài đặt', icon: '◈', run: go('S0') },

    /* ── Trợ giúp ────────────────────────────────────────────────────────── */
    { id: 'help.shortcuts', group: 'Trợ giúp', label: 'Xem bảng phím tắt', hint: '?', icon: '⌨', run: () => hooks.openShortcuts?.() },
  ];

  /* ── Trong ngữ cảnh 1 project: 5 mục rail + 3 tab của S3/S5 (§2.2, §2.3) ── */
  if (projectId) {
    const p = { id: projectId };
    list.unshift(
      { id: 'p.overview', group: 'Project', label: 'Project: Tổng quan', icon: '◧', run: go('S2', p) },
      { id: 'p.design', group: 'Project', label: 'Project: Bản thiết kế', hint: 'g d', icon: '✎', run: go('S3', p, { tab: 'sheets' }) },
      { id: 'p.design.styles', group: 'Project', label: 'Project: Bản thiết kế · Phong cách', icon: '✎', run: go('S3', p, { tab: 'styles' }) },
      { id: 'p.design.advanced', group: 'Project', label: 'Project: Bản thiết kế · Nâng cao', icon: '✎', run: go('S3', p, { tab: 'advanced' }) },
      { id: 'p.runs', group: 'Project', label: 'Project: Theo dõi sinh ảnh', hint: 'g r', icon: '⚡', run: go('S4', p) },
      { id: 'p.kit', group: 'Project', label: 'Project: Thư viện kit', hint: 'g k', icon: '▦', run: go('S5', p, { tab: 'assets' }) },
      { id: 'p.kit.matrix', group: 'Project', label: 'Project: Thư viện kit · Ma trận so sánh', icon: '▦', run: go('S5', p, { tab: 'matrix' }) },
      { id: 'p.kit.export', group: 'Project', label: 'Project: Thư viện kit · Xuất', icon: '⬇', run: go('S5', p, { tab: 'export' }) },
      { id: 'p.settings', group: 'Project', label: 'Project: Cài đặt project', hint: 'g s', icon: '⚙', run: go('S2b', p) },
    );
  }
  return list;
}

/**
 * Hành động thuộc S1: về S1 trước rồi phát sự kiện shell ĐÃ lắng nghe.
 * Không gọi thẳng module CRUD để tránh mở 2 modal cùng loại từ 2 nơi.
 */
function runOnProjectsScreen(router, eventName) {
  router.go('S1');
  // đợi shell mount xong S1 (mount là async vì import động)
  setTimeout(() => window.dispatchEvent(new CustomEvent(eventName)), 80);
}

/**
 * Xếp hạng lệnh theo truy vấn. Lệnh của MÀN ĐANG MỞ được ưu tiên khi chưa gõ gì.
 * Dùng chung `fuzzyScore` (bỏ dấu tiếng Việt) với ô tìm project để giọng tìm nhất quán.
 */
export function rankCommands(commands, query) {
  const q = String(query ?? '').trim();
  const scored = commands.map((c, i) => {
    const hay = `${c.label} ${c.group ?? ''} ${c.keywords ?? ''}`;
    const s = q === '' ? 0 : fuzzyScore(hay, q);
    // giữ thứ tự khai báo khi chưa gõ gì, nhưng nhóm "Màn hình này" lên đầu
    const rank = GROUP_ORDER.indexOf(c.group ?? '');
    return { c, s, order: i, rank: rank < 0 ? GROUP_ORDER.length : rank };
  });
  const usable = q === '' ? scored : scored.filter((x) => x.s > 0);
  usable.sort((a, b) => (b.s - a.s) || (a.rank - b.rank) || (a.order - b.order));
  return usable.map((x) => x.c);
}

/**
 * Mở bảng lệnh.
 * @param {object} o {commands, title}
 * @returns {{close:Function}} handle của modal
 */
export function openCommandPalette({ commands = [], title = 'Bảng lệnh' } = {}) {
  const listId = 'kg-cmdk-list';
  const field = createInput({
    label: 'Tìm lệnh', autofocus: true,
    placeholder: 'Gõ tên việc bạn muốn làm… (không cần dấu)',
    attrs: {
      type: 'text', role: 'combobox', autocomplete: 'off', spellcheck: 'false',
      'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list',
    },
  });
  field.labelNode.classList.add('kg-sr-only');

  const list = el('div', { class: 'kg-list', role: 'listbox', id: listId, 'aria-label': 'Lệnh' });
  const status = el('p', { class: 'kg-t-caption kg-fg-default', role: 'status', 'aria-live': 'polite' });
  let rows = [];
  let active = 0;

  function render() {
    rows = rankCommands(commands, field.value).slice(0, 40);
    active = rows.length > 0 ? Math.min(active, rows.length - 1) : 0;
    list.replaceChildren();
    let lastGroup = null;
    rows.forEach((c, i) => {
      if (c.group !== lastGroup) {
        lastGroup = c.group;
        // tiêu đề nhóm: chỉ để mắt đọc, không phải option của listbox
        list.appendChild(el('div', {
          class: 'kg-t-tablehead', role: 'presentation',
          style: { padding: 'var(--s-2) var(--s-3) var(--s-1)' },
          text: c.group ?? 'Khác',
        }));
      }
      const disabled = Boolean(c.disabledReason);
      const row = el('div', {
        class: 'kg-list__item', role: 'option', id: `kg-cmdk-opt-${i}`,
        'aria-selected': i === active ? 'true' : 'false',
        'aria-disabled': disabled ? 'true' : null,
        dataset: { index: String(i) },
        style: i === active ? { background: 'var(--accent-weak)' } : {},
      }, [
        c.icon ? el('span', { class: 'kg-icon', 'aria-hidden': 'true', text: c.icon }) : null,
        el('div', { class: 'kg-list__main' }, [
          el('div', { class: 'kg-truncate', text: c.label }),
          // §2.5-2: lệnh không chạy được vẫn HIỆN + nói rõ lý do bằng CHỮ
          disabled ? el('div', { class: 'kg-t-caption kg-fg-default kg-truncate', text: c.disabledReason }) : null,
        ]),
        disabled ? createBadge({ state: 'warn', text: 'Cần công cụ local' }) : null,
        c.hint ? el('kbd', { class: 'kg-t-mono kg-list__meta', text: c.hint }) : null,
      ]);
      row.addEventListener('click', () => pick(i));
      list.appendChild(row);
    });
    field.input.setAttribute('aria-activedescendant', rows.length > 0 ? `kg-cmdk-opt-${active}` : '');
    status.textContent = rows.length === 0
      ? `Không có lệnh nào khớp «${field.value.trim()}»`
      : `${rows.length} lệnh · ↑↓ chọn · Enter chạy · Esc đóng`;
  }

  function move(d) {
    if (rows.length === 0) return;
    active = (active + d + rows.length) % rows.length;
    render();
    list.querySelector(`#kg-cmdk-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }

  function pick(i) {
    const c = rows[i];
    if (!c) return;
    if (c.disabledReason) return;   // không chạy, nhưng cũng không đóng: user thấy lý do
    m.close('picked');
    // chạy SAU khi modal đóng để focus trả về trigger trước, rồi màn mới tự nhận focus
    setTimeout(() => { try { c.run(); } catch (e) { console.error('[⌘K] lệnh lỗi', c.id, e); } }, 0);
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
    title, size: 'lg', hasInput: true,
    body: el('div', { class: 'kg-stack' }, [field.el, list, status]),
  });
  render();
  return m;
}

export const _GROUP_ORDER = GROUP_ORDER;
export const _foldCase = foldCase;
