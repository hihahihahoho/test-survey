/**
 * card.js — THẺ PROJECT của S1 (§3-S1-2: 8 vùng bắt buộc, đúng thứ tự) + thẻ lỗi (§3-S1-4).
 * Dùng `createCard`/`createJobBadge`/`createTag`/`createThumb` của design system —
 * không tự vẽ thẻ, không hard-code màu/khoảng cách.
 *
 * 8 vùng: ảnh bìa 16:10 · badge run · tên (2 dòng, textContent) · số liệu 1 · số liệu 2 ·
 *         dòng trạng thái · tag · footer (thời gian + dung lượng) + [Mở] [⋯]
 */

import { api } from '../../core/index.js';
import {
  attachMenu, createButton, createCard, createJobBadge, createTag, el, icon,
} from '../../ui/index.js';
import { bytes, count, relTime } from '../shared/format.js';
import { projectState } from './data.js';

/** Nhãn dòng trạng thái + có cần nút hành động ngay cạnh không (§5.7). */
const STATE_ROW = Object.freeze({
  ok: { badge: 'ok', text: 'Mọi thứ đã đồng bộ' },
  stale: { badge: 'stale', text: 'Thiết kế đã đổi sau lần sinh ảnh cuối', action: 'Xem việc cần làm' },
  uncut: { badge: 'uncut', text: 'Có ảnh mới nhưng chưa cắt', action: 'Xem việc cần làm' },
  never: { badge: 'never', text: 'Chưa sinh ảnh lần nào', action: 'Bắt đầu' },
  queued: { badge: 'queued', text: 'Đang chờ tới lượt' },
  running: { badge: 'running', text: 'Đang sinh ảnh' },
  failed: { badge: 'failed', text: 'Có lượt sinh ảnh bị lỗi', action: 'Xem lỗi' },
  empty: { badge: 'never', text: 'Chưa bắt đầu', action: 'Chọn element' },
});

/**
 * Ảnh bìa. Không có `cover` → khung xám có CHỮ (không để ô trống bí ẩn).
 * Ở chế độ chỉ-đọc, ảnh nằm trên máy nên không tải được → khung `▨` + chữ (§2.5-3).
 */
function cover(p, { readOnly }) {
  // Từ API: `cover`. Từ cache (schema kitgen.projects.cache.v1): `coverUrlPath`.
  const raw = p.cover ?? p.coverUrlPath;
  const path = typeof raw === 'string' && raw !== '' ? raw : null;
  if (!path || readOnly) {
    return el('div', {
      class: 'kg-checker kg-row',
      style: { height: '100%', justifyContent: 'center' },
    }, [
      icon('▨'),
      el('span', {
        class: 'kg-t-caption kg-fg-default',
        text: readOnly && path ? 'Ảnh nằm trên máy bạn' : 'Chưa có ảnh bìa',
      }),
    ]);
  }
  // §6.5-5: lưới LUÔN dùng ?w=256, không bao giờ tải PNG gốc trong danh sách.
  return el('img', {
    src: api.files.thumbUrl(p.id, path),
    alt: `Ảnh bìa của project ${p.name ?? p.id}`,
    loading: 'lazy', decoding: 'async',
  });
}

/**
 * Badge góc ảnh bìa khi đang chạy: `⚡ Đang sinh 2/8`.
 * Nguồn CHÍNH là `state.activeRun {done,total}` của agent (#7/#9) — số đúng theo lượt chạy
 * thật của CHÍNH project này. Không có (agent cũ) thì suy từ `state.jobs`.
 */
function runBadge(p) {
  const jobs = p?.state?.jobs ?? {};
  const values = Object.values(jobs);
  const active = p?.state?.activeRun;
  if (active && Number(active.total) > 0) {
    return createJobBadge('running', {
      long: `Đang sinh ảnh ${Number(active.done) || 0}/${Number(active.total)}`,
      count: Math.max(1, Number(active.total) - (Number(active.done) || 0)),
    });
  }
  if (values.length === 0) return null;
  const running = values.filter((s) => s === 'running' || s === 'queued').length;
  if (running === 0) return null;
  const done = values.filter((s) => s === 'ok' || s === 'uncut').length;
  return createJobBadge('running', { long: `Đang sinh ảnh ${done}/${values.length}`, count: running });
}

/**
 * Menu ⋯ — ĐÚNG 8 mục, thứ tự cố định (§3-S1-3).
 * Agent chưa chạy: mục gây thay đổi bị `disabled` + lý do, KHÔNG ẩn (§2.5-2, §4.9).
 */
export function projectMenuItems(p, actions, { readOnly, reason }) {
  const guard = (fn) => ({ disabled: readOnly, disabledReason: reason, onSelect: fn });
  return [
    { label: 'Mở', icon: '↗', onSelect: () => actions.open(p) },
    { label: 'Đổi tên…', icon: '✎', hint: 'F2', ...guard(() => actions.rename(p)) },
    { label: 'Nhân bản…', icon: '⧉', hint: '⌘D', ...guard(() => actions.duplicate(p)) },
    { label: 'Xuất .zip', icon: '⬇', ...guard(() => actions.exportZip(p)) },
    { label: 'Mở thư mục trên máy', icon: '▤', ...guard(() => actions.reveal(p)) },
    { label: 'Dọn cache dẫn xuất…', icon: '⌫', ...guard(() => actions.clean(p)) },
    'separator',
    { label: 'Xoá…', icon: '🗑', danger: true, hint: '⌫', ...guard(() => actions.remove(p)) },
  ];
}

/** Thẻ project lỗi manifest (§3-S1-4): viền đỏ, KHÔNG biến mất im lặng, không cho Mở. */
function brokenCard(p, actions, { readOnly, reason }) {
  const err = p.error ?? {};
  const where = [err.file, err.line != null ? `dòng ${err.line}` : null].filter(Boolean).join(' · ');
  const card = createCard({
    variant: 'error',
    title: p.name ?? p.id,
    ariaLabel: `Project lỗi: ${p.name ?? p.id}`,
    badges: [createJobBadge('failed', { long: 'Không đọc được project' })],
    rows: [
      el('div', { class: 'kg-t-body', style: { color: 'var(--on-tint-danger)' }, text: 'Không đọc được project' }),
      el('div', { class: 'kg-t-caption kg-fg-default', text: where === '' ? 'Thiếu hoặc sai định dạng project.json' : where }),
      el('div', { class: 'kg-t-caption kg-fg-default', text: `Thư mục: ${p.id}` }),
    ],
    footLeft: 'Sửa file trên máy rồi bấm Kiểm tra lại',
    actions: el('div', { class: 'kg-row kg-row--tight' }, [
      createButton({
        label: 'Mở thư mục', variant: 'secondary', size: 'sm',
        disabled: readOnly, onClick: () => actions.reveal(p),
      }),
      createButton({
        label: 'Chi tiết', variant: 'ghost', size: 'sm',
        onClick: () => actions.showBrokenDetail(p),
      }),
    ]),
  });
  if (readOnly) {
    const b = card.querySelector('button');
    if (b) b.title = reason ?? '';
  }
  return card;
}

/**
 * Thẻ project bình thường.
 * @param {object} p project (#7)
 * @param {object} actions {open,rename,duplicate,exportZip,reveal,clean,remove,nextStep,showBrokenDetail}
 * @param {object} opts {readOnly, reason, fromCache}
 */
export function createProjectCard(p, actions, opts = {}) {
  const { readOnly = false, reason = null, fromCache = false } = opts;
  if (p.broken) return brokenCard(p, actions, { readOnly, reason });

  const st = projectState(p);
  const s = p.stats ?? {};
  // Thẻ vẽ từ cache VẪN hiện dòng trạng thái §5.7: cache đã lưu `state.jobs` (schema bổ sung
  // ở lượt tích hợp) nên trạng thái là THẬT của lần quét gần nhất, không phải phỏng đoán.
  // Chỉ khi thiếu hẳn state.jobs (cache đời cũ) mới bỏ dòng đó — thà thiếu hơn sai.
  const hasState = Object.keys(p?.state?.jobs ?? {}).length > 0 || p?.state?.stale === true;
  const row = (fromCache && !hasState) ? null : (STATE_ROW[st] ?? STATE_ROW.empty);

  const stateRow = row
    ? el('div', { class: 'kg-row kg-row--tight' }, [
        createJobBadge(row.badge, { long: row.text }),
        el('span', { class: 'kg-t-caption kg-fg-default kg-truncate', text: row.text }),
      ])
    : null;
  if (row?.action && !readOnly) {
    stateRow.appendChild(createButton({
      label: row.action, variant: 'link', size: 'sm',
      onClick: () => actions.nextStep(p),
    }));
  }

  const menuBtn = createButton({
    variant: 'ghost', size: 'sm', icon: '⋯', iconOnly: true,
    ariaLabel: `Thao tác khác cho ${p.name ?? p.id}`,
    tooltip: 'Thao tác khác (Shift+F10)',
  });
  attachMenu(menuBtn, () => projectMenuItems(p, actions, { readOnly, reason }));

  const card = createCard({
    interactive: true,
    // §2.5-4: thẻ từ cache xám bớt (variant) VÀ có nhãn chữ `cache` (cacheLabel).
    variant: fromCache ? 'cache' : 'default',
    onOpen: () => actions.open(p),
    ariaLabel: `Project ${p.name ?? p.id}`,
    media: cover(p, { readOnly }),
    badges: [runBadge(p)].filter(Boolean),
    title: p.name ?? p.id,
    cacheLabel: fromCache,
    rows: [
      `${count(s.variants ?? 0, 'phong cách')} · ${count(s.sheets ?? 0, 'sheet')}`,
      `${count(s.components ?? 0, 'element')} · ${count(s.kitsCut ?? 0, 'file đã cắt')}`,
      stateRow,
    ].filter(Boolean),
    tags: (p.tags ?? []).slice(0, 4).map((t) => createTag(t)),
    footLeft: `${st === 'empty' ? 'tạo' : 'sửa'} ${relTime(st === 'empty' ? p.createdAt : p.updatedAt)}`,
    footRight: bytes(s.diskBytes ?? 0),
    actions: el('div', { class: 'kg-row kg-row--tight' }, [
      createButton({ label: 'Mở', variant: 'secondary', size: 'sm', onClick: () => actions.open(p) }),
      menuBtn,
    ]),
  });
  card.dataset.projectId = p.id;
  card.tabIndex = -1;    // ↑↓←→ điều hướng giữa thẻ do grid quản (§3-S1 phím tắt)
  return card;
}
