/**
 * states.js — 4 TRẠNG THÁI của S1 (§3-S1 bảng trạng thái): empty · loading · error · success.
 * Tách khỏi index.js để mỗi file < 400 dòng và để QA soi từng trạng thái riêng.
 * Mọi khối dựng bằng primitive; mọi copy lỗi lấy từ core/errors.js (§3.9).
 */

import { errors } from '../../core/index.js';
import {
  createButton, createEmptyState, createErrorState, createSkeletonGrid, el,
} from '../../ui/index.js';

/** empty · 0 project, agent OK (§3-S1): 2 nút + 3 bước tiếp theo. */
export function emptyNoProjects({ onCreate, onImport, readOnly, reason }) {
  const primary = createButton({
    label: '＋ Tạo project đầu tiên', variant: 'primary', size: 'lg',
    disabled: readOnly, onClick: onCreate,
  });
  if (readOnly) primary.title = reason ?? '';
  const secondary = createButton({
    label: 'Nhập từ styles.json cũ', variant: 'secondary', size: 'lg',
    disabled: readOnly, onClick: onImport,
  });
  if (readOnly) secondary.title = reason ?? '';
  return createEmptyState({
    icon: '▤',
    title: 'Chưa có project nào',
    description: 'Một project = một bộ kit cho một campaign. Mọi thứ nằm trong thư mục làm việc trên máy bạn.',
    primary, secondary,
    steps: ['Chọn element cho từng sheet', 'Sinh ảnh bằng AI', 'Tải kit đã cắt về dùng'],
  });
}

/** empty · 0 kết quả tìm (§3-S1). */
export function emptyNoMatch({ query, onClear }) {
  return createEmptyState({
    icon: '🔍',
    title: `Không có project nào khớp «${query}»`,
    description: 'Thử từ khoá ngắn hơn, hoặc bỏ bộ lọc đang bật.',
    primary: createButton({ label: 'Xoá bộ lọc', variant: 'primary', onClick: onClear }),
  });
}

/** loading lần đầu (chưa có cache): 6 thẻ skeleton, KHÔNG spinner giữa màn (§3-S1). */
export function loadingSkeleton(expected = 6) {
  return createSkeletonGrid({ expected, label: 'Đang tải danh sách project…' });
}

/**
 * error · agent không sẵn sàng và KHÔNG có cache (§3-S1): khối giữa màn.
 * Copy lấy từ bảng §3.9 theo `status.code` — màn không tự viết.
 */
export function errorNoAgent({ status, onCopyCmd, onRetry, onOpenMirror }) {
  // lookup() nhận MÃ; present() nhận đối tượng lỗi. Truyền string vào present sẽ ra 'mã lạ'.
  const view = errors.lookup(status.code ?? 'AGENT_NOT_RUNNING');
  const actions = [];
  if (status.pill === 'blocked-by-browser') {
    actions.push(createButton({ label: 'Mở bản chạy tại máy', variant: 'primary', onClick: onOpenMirror }));
  } else {
    actions.push(createButton({ label: 'Copy lệnh', variant: 'primary', icon: '⧉', onClick: onCopyCmd }));
  }
  actions.push(createButton({ label: 'Thử lại', variant: 'secondary', icon: '↻', onClick: onRetry }));
  return createErrorState({
    icon: '○',
    title: view.title,
    description: `${view.explain} Danh sách project nằm trên máy bạn nên chưa đọc được từ đây.`,
    actions,
    devDetails: errors.devDetails({
      code: status.code ?? 'AGENT_NOT_RUNNING',
      message: `pill=${status.pill} entry=${status.entry}`,
      url: status.baseUrl ?? '(chưa dò được cổng)',
    }),
  });
}

/** error khi gọi /api/projects thất bại dù agent có trả lời (403/421/500…). */
export function errorLoadFailed({ err, onRetry }) {
  const view = errors.present(err);
  return createErrorState({
    title: view.title,
    description: view.explain,
    actions: [createButton({ label: 'Thử lại', variant: 'primary', icon: '↻', onClick: onRetry })],
    devDetails: errors.devDetails(err),
  });
}

/** Dòng "N project · quét lúc hh:mm" + nhãn cache khi vẽ từ bộ nhớ đệm. */
export function countLine({ shown, total, scannedAt, fromCache }) {
  const parts = [shown === total ? `${total} project` : `${shown}/${total} project`];
  if (fromCache) parts.push('dữ liệu đã lưu trên máy này');
  else if (scannedAt) parts.push(`quét lúc ${String(scannedAt).slice(11, 16)}`);
  return el('p', { class: 'kg-t-caption kg-fg-default', role: 'status', 'aria-live': 'polite', text: parts.join(' · ') });
}
