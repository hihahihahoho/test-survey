/**
 * design/commands.js — lệnh của S3 góp vào BẢNG LỆNH ⌘K (§2.3).
 *
 * VÌ SAO CÓ FILE NÀY: §2.3 nói "mọi hành động trong spec phải gọi được từ ⌘K".
 * Cơ chế `handle.commands()` do app-shell dựng sẵn nhưng lượt tích hợp thấy CHƯA MÀN NÀO
 * KHAI ⇒ các hành động nặng nhất của app (Lưu, Hoàn tác, Thư viện element, Lịch sử bản lưu)
 * chỉ tới được bằng phím tắt cứng hoặc chuột. Đây là phần khai của S3.
 *
 * Quy ước: lệnh gây thay đổi khi chỉ-đọc thì VẪN HIỆN + nêu lý do (`disabledReason`),
 * không ẩn (§2.5-2). Không lệnh nào chạy gen trực tiếp — vẫn phải qua modal M1 (§7.3).
 */

import { readOnlyReason } from '../shared/read-only.js';

/**
 * @param {object} o
 * @param {{dirty:boolean, canUndo:boolean, canRedo:boolean}} o.state
 * @param {boolean} o.readOnly
 * @returns {Array<{id,label,hint?,icon?,disabledReason?,run:Function}>}
 */
export function s3Commands({
  state, readOnly, onSave, onSaveAndGen, onUndo, onRedo, onLibrary, onHistory,
}) {
  const needAgent = readOnly ? readOnlyReason() : null;
  return [
    {
      id: 's3.save', label: 'Lưu bản thiết kế', hint: '⌘S', icon: '💾',
      disabledReason: needAgent ?? (state?.dirty ? null : 'Chưa có thay đổi nào để lưu'),
      run: onSave,
    },
    {
      id: 's3.saveGen', label: 'Lưu rồi mở Sinh ảnh…', hint: '⌘⏎', icon: '⚡',
      disabledReason: needAgent, run: onSaveAndGen,
    },
    {
      id: 's3.undo', label: 'Hoàn tác', hint: '⌘Z', icon: '↶',
      disabledReason: state?.canUndo ? null : 'Không còn bước nào để hoàn tác',
      run: onUndo,
    },
    {
      id: 's3.redo', label: 'Làm lại', hint: '⇧⌘Z', icon: '↷',
      disabledReason: state?.canRedo ? null : 'Không còn bước nào để làm lại',
      run: onRedo,
    },
    { id: 's3.library', label: 'Mở thư viện element…', hint: '⌘L', icon: '▤', run: onLibrary },
    { id: 's3.history', label: 'Lịch sử bản lưu…', icon: '🕘', run: onHistory },
  ];
}
