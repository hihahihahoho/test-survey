/**
 * design/css.js — LỚP TƯƠNG THÍCH sau khi CSS của S3+S4 về file thật.
 *
 * CSS của hai màn nay nằm ở `web/css/components/editor.css` (lớp `d-*`) và
 * `web/css/components/runs.css` (lớp `r-*`), được `web/css/app.css` @import.
 * Trước đây khối này bị bơm bằng `<style>` từ JS vì team màn không sở hữu `web/css/`;
 * đã chuyển ở lượt tích hợp (135 rule, đối chiếu 1-1, không mất rule nào).
 *
 * VÌ SAO ĐỔI: CSS trong file được trình duyệt cache và tải song song với JS, không phải
 * dựng lại chuỗi mỗi lần mount màn; và phần này không còn phụ thuộc `style-src 'unsafe-inline'`.
 *
 * File giữ lại `ensureScreenCss()` như HÀM RỖNG để hai màn (và bộ test đang gọi nó)
 * không phải sửa, và để bản nhúng lẻ (nếu ai đó mount màn ngoài index.html) không vỡ.
 */

/**
 * Không còn bơm gì. Giữ chữ ký cũ để nơi gọi không phải đổi.
 * Trả về `true` nếu tìm thấy stylesheet của design system (chỉ để chẩn đoán, không chặn gì).
 */
export function ensureScreenCss() {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector?.('link[rel="stylesheet"]'));
}
