/**
 * shared/read-only.js — MỘT nguồn duy nhất cho CÂU CHỮ "vì sao nút này bị khoá".
 *
 * QA-UX CAO-2 · vì sao file này ra đời.
 *   Từ lượt vá M5, `readOnly` có HAI nguồn chứ không còn một:
 *     1. công cụ local chưa chạy / bị chặn / lệch phiên bản   (§2.5)
 *     2. mốc màn hình <768px — "chỉ đọc"                       (§2.2)
 *   Trong khi đó 14 chỗ ở `screens/design/**` và `screens/runs/**` viết CỨNG câu
 *   "Cần công cụ local đang chạy". Trên điện thoại, câu đó SAI SỰ THẬT (agent đang
 *   chạy tốt) và đẩy người dùng đi sửa nhầm chỗ — đúng điều §3.9 cấm.
 *
 *   Hai màn đó cố ý KHÔNG phụ thuộc `app-shell/**` (hợp đồng NEEDS-d2p3 §1 chỉ cho
 *   chúng một boolean `readOnly`). Thay vì kéo cả plumbing xuống 11 file, câu chữ
 *   được đặt ở đây và cập nhật đúng một lần khi shell báo trạng thái đổi.
 *
 * KHÔNG chứa logic quyết định có khoá hay không — quyết định đó vẫn thuộc
 * `app-shell/agent-status.js`. File này chỉ giữ CÂU CHỮ.
 */

export const NEED_AGENT = 'Cần công cụ local đang chạy';

let current = NEED_AGENT;

/** Câu chữ đang đúng cho trạng thái chỉ-đọc hiện tại. */
export function readOnlyReason() { return current; }

/**
 * Shell/adapter gọi mỗi khi trạng thái đổi. Trạng thái không rõ ⇒ về câu mặc định
 * (không bao giờ để trống: nút bị khoá mà không nêu lý do là lỗi §2.5-2).
 */
export function setReadOnlyStatus(status) {
  current = pick(status);
  return current;
}

function pick(st) {
  if (!st || typeof st !== 'object') return NEED_AGENT;
  // Agent vẫn tốt, chỉ vướng mốc màn hình.
  if (st.readOnlyBySmallScreen === true && st.connected === true) {
    return 'Màn hình nhỏ — mở trên máy tính để sửa';
  }
  if (st.code === 'AGENT_BLOCKED_BY_BROWSER' || st.code === 'ORIGIN_NOT_ALLOWED') {
    return 'Trình duyệt đang chặn — mở bản chạy tại máy';
  }
  if (st.code === 'AGENT_PROTOCOL_OLD' || st.code === 'AGENT_PROTOCOL_NEW') {
    return 'Công cụ local không cùng phiên bản — cập nhật rồi thử lại';
  }
  return NEED_AGENT;
}
