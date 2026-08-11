/**
 * spinner.js — Spinner + SkeletonBlock (§5.6).
 * LUẬT §5.6: số lượng skeleton phải KHỚP số phần tử dự kiến — biết trước thì
 * đừng đoán (S1 loading lần đầu = 6 thẻ skeleton, KHÔNG spinner giữa màn).
 * §5.8-A8: vùng loading có aria-live/aria-busy để screen reader biết đang chờ.
 *
 * API:
 *   createSpinner({ size, label })            // label BẮT BUỘC (đọc bằng SR)
 *   createSpinnerRow({ label, size })         // spinner + CHỮ bên cạnh
 *   createSkeleton({ variant, width, height, count })
 *   createSkeletonCard()                      // đúng khung thẻ project S1
 *   createTopProgress()                       // đường 2px ở đỉnh khi làm mới từ cache
 */
import { el, cx, srOnly } from './dom.js';

export function createSpinner({ size = 'md', label = 'Đang tải…' } = {}) {
  const cls = cx('kg-spinner', size === 'sm' && 'kg-spinner--sm', size === 'lg' && 'kg-spinner--lg');
  return el('span', { class: 'kg-row kg-row--tight', role: 'status', 'aria-live': 'polite' }, [
    el('span', { class: cls, 'aria-hidden': 'true' }),
    srOnly(label),
  ]);
}

/** Spinner CÓ CHỮ nhìn thấy được — dùng khi chờ > 1s ở nơi có chỗ cho chữ. */
export function createSpinnerRow({ label = 'Đang tải…', size = 'sm' } = {}) {
  return el('span', { class: 'kg-spinner-row', role: 'status', 'aria-live': 'polite' }, [
    el('span', { class: cx('kg-spinner', size === 'sm' && 'kg-spinner--sm', size === 'lg' && 'kg-spinner--lg'), 'aria-hidden': 'true' }),
    el('span', { text: label }),
  ]);
}

const SKEL_VARIANTS = new Set(['text', 'title', 'block', 'media', 'circle']);

export function createSkeleton({ variant = 'text', width = null, height = null, count = 1 } = {}) {
  if (!SKEL_VARIANTS.has(variant)) throw new Error(`kg-skel: variant lạ "${variant}"`);
  const make = () => el('div', {
    class: `kg-skel kg-skel--${variant}`,
    'aria-hidden': 'true',       // skeleton là trang trí; trạng thái chờ do vùng cha thông báo
    style: { width: width || undefined, height: height || undefined },
  });
  if (count === 1) return make();
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' } },
    Array.from({ length: count }, make));
}

/** Skeleton đúng khung thẻ project (S1): ảnh bìa 16:10 + tên + 2 dòng số liệu. */
export function createSkeletonCard() {
  return el('div', { class: 'kg-card', 'aria-hidden': 'true' }, [
    el('div', { class: 'kg-skel kg-skel--media' }),
    el('div', { style: { padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' } }, [
      el('div', { class: 'kg-skel kg-skel--title', style: { width: '70%' } }),
      el('div', { class: 'kg-skel kg-skel--text', style: { width: '55%' } }),
      el('div', { class: 'kg-skel kg-skel--text', style: { width: '45%' } }),
      el('div', { class: 'kg-skel kg-skel--text', style: { width: '35%' } }),
    ]),
  ]);
}

/**
 * Vùng chờ có N skeleton + thông báo cho screen reader.
 * `expected` = số phần tử dự kiến (§5.6: biết trước thì đừng đoán).
 */
export function createSkeletonGrid({ expected = 6, label = 'Đang tải danh sách project…', factory = createSkeletonCard } = {}) {
  const wrap = el('div', { class: 'kg-grid', 'aria-busy': 'true', role: 'status', 'aria-live': 'polite' });
  wrap.appendChild(srOnly(label));
  for (let i = 0; i < expected; i += 1) wrap.appendChild(factory());
  return wrap;
}

/** Đường progress 2px ở đỉnh: đang làm mới trong khi đã vẽ từ cache (S1). */
export function createTopProgress({ label = 'Đang làm mới dữ liệu' } = {}) {
  return el('div', { class: 'kg-topbar-progress', role: 'status', 'aria-label': label }, [el('i')]);
}
