/**
 * text.js — chuẩn hoá CHUỖI TIẾNG VIỆT dùng chung cho mọi màn.
 *
 * GỘP Ở LƯỢT TÍCH HỢP: cùng một thuật toán từng nằm ở 3 chỗ
 *   · `screens/projects/crud/slug.js` (slug project, max 40)
 *   · `screens/design/ops.js`         (id sheet/variant/nhân vật, max 32/24)
 *   · `screens/projects/data.js`      (`foldCase` cho tìm bỏ dấu)
 * Hai bản slug chỉ khác `max` và cách xử lý chuỗi rỗng ⇒ tham số hoá, không nhân bản.
 *
 * `agent/lib/projects.mjs` CÓ BẢN RIÊNG và phải giữ: agent là runtime khác (Node,
 * không import được web/), và §6.5 buộc agent validate LẠI chứ không tin client.
 * Hai bản được khoá bằng ca test đối chiếu trong `__tests__/projects-data.test.mjs`.
 *
 * Dùng NFD: tiếng Việt phân rã hết dấu thành ký tự tổ hợp, TRỪ đ/Đ nên xử riêng
 * (bản đời đầu dùng bảng tra tay và bị lệch độ dài from/to ⇒ "chủ" ra "cho").
 */

/** Bỏ dấu + hạ chữ. Dùng cho tìm kiếm: gõ "xuan" ra "Xuân". */
export function foldCase(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

/**
 * Bỏ dấu → chữ thường → gộp ký tự lạ thành `-` → cắt `max` (đúng thứ tự §4.1-1).
 * Trả về chuỗi RỖNG khi không còn ký tự hợp lệ — nơi gọi tự quyết định fallback
 * (S1 hiện lỗi cho user sửa; editor tự đặt id mặc định). KHÔNG tự bịa tên ở đây.
 */
export function slugify(text, { max = 40 } = {}) {
  return foldCase(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}
