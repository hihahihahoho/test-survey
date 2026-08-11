/**
 * runs/commands.js — lệnh của S4 góp vào BẢNG LỆNH ⌘K (§2.3).
 *
 * VÌ SAO CÓ FILE NÀY: §2.3 khai `⌥⌘L` (bật/tắt panel nhật ký) và `⌘Enter` (chạy lại lượt
 * lỗi), nhưng cơ chế `handle.commands()` của app-shell CHƯA MÀN NÀO KHAI ⇒ ngoài phím
 * cứng thì không có đường nào tới các hành động này. Đây là phần khai của S4.
 *
 * Nguyên tắc: KHÔNG lệnh nào chạy gen trực tiếp (§7.3 — phải qua modal M1).
 * "Chạy lại lượt lỗi" là chạy lại ĐÚNG tập lượt đã lỗi của run này, không mở rộng phạm vi.
 * Lệnh bị chặn vẫn HIỆN kèm lý do, không ẩn (§2.5-2).
 */

import { isFinished } from './run-store.js';
import { readOnlyReason } from '../shared/read-only.js';

/**
 * @param {object} o
 * @param {object|null} o.run          run đang xem (#34)
 * @param {boolean} o.readOnly
 * @param {string|null} o.selectedJob
 * @param {boolean} o.errorsOnly       panel nhật ký đang lọc chỉ lỗi?
 */
export function s4Commands({
  run, readOnly, selectedJob, errorsOnly,
  onCancel, onRetryFailed, onToggleErrorFilter, onOpenJobLog,
}) {
  const finished = !run || isFinished(run.status);
  const failed = (run?.jobs ?? []).filter((j) => j.status === 'failed').length;
  const needAgent = readOnly ? readOnlyReason() : null;
  return [
    {
      id: 's4.cancel', label: 'Dừng lượt chạy', hint: '⌘.', icon: '■',
      disabledReason: needAgent ?? (finished ? 'Lượt chạy đã kết thúc' : null),
      run: onCancel,
    },
    {
      id: 's4.retry',
      label: failed > 0 ? `Chạy lại ${failed} lượt lỗi…` : 'Chạy lại các lượt lỗi',
      hint: '⌘⏎', icon: '↻',
      disabledReason: needAgent ?? (failed === 0 ? 'Không có lượt nào lỗi' : null),
      run: onRetryFailed,
    },
    {
      id: 's4.logErrors',
      label: errorsOnly ? 'Nhật ký: hiện lại mọi dòng' : 'Nhật ký: chỉ hiện dòng lỗi',
      hint: '⌥⌘L', icon: '▤',
      run: onToggleErrorFilter,
    },
    {
      id: 's4.jobLog', label: 'Mở nhật ký của lượt đang chọn…', icon: '🕘',
      disabledReason: selectedJob ? null : 'Chưa chọn lượt nào',
      run: onOpenJobLog,
    },
  ];
}
