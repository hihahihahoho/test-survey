/**
 * agent-state.js — CHẾ ĐỘ CHỈ-ĐỌC (§2.5) áp dụng đồng nhất cho S2 · S2b · S5 · S6.
 *
 * Ba luật của §2.5 được thi công ở đây, một lần, để không màn nào tự diễn giải khác:
 *   1. Banner sticky vàng + [Copy lệnh] [Thử lại]   (nội dung lấy từ core/errors.js)
 *   2. Nút gây thay đổi: disabled + aria-disabled + tooltip "Cần công cụ local đang chạy"
 *      — KHÔNG ẩn nút (ẩn làm user tưởng mất tính năng)
 *   3. Ảnh không tải được → khung xám + chữ "Ảnh nằm trên máy bạn"
 *
 * Không tự viết copy lỗi (§3.9): mọi tiêu đề/giải thích đến từ errors.lookup().
 */

import { createBanner, createButton, setDisabled, toast, el, icon } from '../../../ui/index.js';
import * as errors from '../../../core/errors.js';
import * as detect from '../../../core/detect.js';

export const NEED_AGENT = 'Cần công cụ local đang chạy';
const RUN_CMD = 'kitgen-agent';

/** Trạng thái an toàn khi màn được mount mà chưa ai probe (không bao giờ trắng trang). */
export function fallbackStatus() {
  try { return detect.checkingStatus(); }
  catch { return { pill: 'checking', code: null, readOnly: true, connected: false, checkedAt: null }; }
}

/** true ⇒ mọi thao tác ghi bị chặn ở client (§2.5-2 + §4.9). */
export function isReadOnly(status) {
  if (!status || typeof status !== 'object') return true;
  return status.readOnly === true || status.connected !== true;
}

/**
 * Lý do ĐÚNG của trạng thái chỉ-đọc hiện tại.
 *
 * QA-UX CAO-2: từ lượt này `readOnly` có thêm một nguồn nữa là mốc màn hình <768px
 * (§2.2). Nếu vẫn trả cứng NEED_AGENT thì người mở app trên điện thoại sẽ đọc
 * "Cần công cụ local đang chạy" trong khi công cụ local đang chạy tốt — đẩy họ đi
 * sửa nhầm chỗ. Nói đúng nguyên nhân là yêu cầu của §3.9 (cấm thông điệp đổ oan).
 */
export function readOnlyReason(status) {
  if (status?.readOnlyBySmallScreen === true && status?.connected === true) {
    return 'Màn hình nhỏ — mở trên máy tính để sửa';
  }
  if (status?.code === 'AGENT_BLOCKED_BY_BROWSER' || status?.code === 'ORIGIN_NOT_ALLOWED') {
    return 'Trình duyệt đang chặn — mở bản chạy tại máy';
  }
  if (status?.code === 'AGENT_PROTOCOL_OLD' || status?.code === 'AGENT_PROTOCOL_NEW') {
    return 'Công cụ local không cùng phiên bản — cập nhật rồi thử lại';
  }
  return NEED_AGENT;
}

/**
 * Gắn trạng thái chỉ-đọc cho một nút ghi. Trả lại chính nút để dùng inline.
 * `extraReason` cho ca riêng (ví dụ "Đang chạy một lượt sinh ảnh").
 */
export function gateButton(btn, status, extraReason = null) {
  if (extraReason) { setDisabled(btn, true, extraReason); return btn; }
  if (isReadOnly(status)) setDisabled(btn, true, readOnlyReason(status));
  return btn;
}

/** Nút ghi: tạo + gate trong một bước (giữ luật "1 primary mỗi màn" ở tầng gọi). */
export function writeButton(opts, status, extraReason = null) {
  return gateButton(createButton(opts), status, extraReason);
}

/**
 * Banner §2.5-1. Trả về node hoặc null khi agent OK.
 * `lastSyncLabel` = "12:04 hôm nay" (thời điểm dữ liệu cache được lấy) — có thì nói ra,
 * không có thì KHÔNG bịa.
 */
export function readOnlyBanner(status, { onRetry, onWhy, lastSyncLabel = null } = {}) {
  if (!isReadOnly(status)) return null;
  const code = status?.code ?? 'AGENT_NOT_RUNNING';
  const view = errors.lookup(code);
  const title = lastSyncLabel
    ? `${view.title} — đây là dữ liệu bạn thấy lần cuối (${lastSyncLabel}). Không sửa được.`
    : `${view.title} — ${view.explain}`;

  const actions = [];
  // Chỉ ≤2 nút (§5.5). Ưu tiên hành động sửa được tình hình.
  if (code === 'AGENT_BLOCKED_BY_BROWSER' || code === 'ORIGIN_NOT_ALLOWED' || code === 'BAD_HOST') {
    actions.push(createButton({
      label: 'Mở bản chạy tại máy', variant: 'secondary', size: 'sm',
      onClick: () => { openMirror(status); },
    }));
    if (onWhy) actions.push(createButton({ label: 'Vì sao?', variant: 'ghost', size: 'sm', onClick: onWhy }));
  } else if (code === 'AGENT_PROTOCOL_OLD') {
    actions.push(copyCmdButton(status?.updateCommand ?? 'npm i -g kitgen-agent', 'Copy lệnh cập nhật'));
    if (onRetry) actions.push(createButton({ label: 'Kiểm tra lại', variant: 'ghost', size: 'sm', onClick: onRetry }));
  } else {
    actions.push(copyCmdButton(RUN_CMD, 'Copy lệnh'));
    if (onRetry) actions.push(createButton({ label: 'Thử lại', variant: 'ghost', size: 'sm', onClick: onRetry }));
  }

  return createBanner({ kind: 'warning', title, actions: actions.slice(0, 2), live: true });
}

/** Banner xanh 3 giây "đã kết nối lại" (§2.5-5). Tầng gọi tự tháo sau 3s. */
export function reconnectedBanner() {
  return createBanner({ kind: 'success', title: 'Đã kết nối lại — đã làm mới dữ liệu', live: true });
}

export function copyCmdButton(cmd, label = 'Copy lệnh') {
  return createButton({
    label, variant: 'secondary', size: 'sm', icon: '⧉',
    onClick: async () => {
      let ok = false;
      try {
        if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(cmd); ok = true; }
      } catch { ok = false; }
      // §3.9 điều cấm 3: thất bại KHÔNG được im lặng
      if (ok) toast.success({ title: 'Đã copy lệnh', description: cmd });
      else toast.warning({ title: 'Không copy được', description: `Hãy gõ tay: ${cmd}` });
    },
  });
}

/** Điều hướng top-level sang bản mirror (§2.4 / §3.9 [Mở bản chạy tại máy]). */
export function openMirror(status) {
  const url = status?.mirrorUrl ?? detect.mirrorUrl();
  if (typeof location !== 'undefined') location.href = url;
}

/**
 * §2.5-3 · Khung thay ảnh khi không tải được (agent tắt / file mất).
 * `note` mặc định đúng câu của spec.
 */
export function imageFallback({ note = 'Ảnh nằm trên máy bạn', square = true } = {}) {
  return el('div', {
    class: 'kg-t-caption kg-fg-default',
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'var(--s-1)', textAlign: 'center', padding: 'var(--s-2)',
      aspectRatio: square ? '1 / 1' : null, width: '100%', height: square ? null : '100%',
      background: 'var(--bg-raised)', border: '1px dashed var(--line-default)',
      borderRadius: 'var(--r-2)',
    },
  }, [icon('▨'), el('span', { text: note })]);
}

/** Nhãn nhỏ `cache` cho thẻ vẽ từ bộ nhớ tạm (§2.5-4). */
export function cacheChip() {
  return el('span', { class: 'kg-badge kg-badge--neutral' }, [
    icon('▤'), el('span', { class: 'kg-badge__text', text: 'cache' }),
  ]);
}

/** Nhãn giờ của dữ liệu cache: "12:04 hôm nay" — dùng cho banner §2.5-1. */
export function syncLabel(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  const hhmm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return new Date().toDateString() === d.toDateString() ? `${hhmm} hôm nay` : `${hhmm} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}
