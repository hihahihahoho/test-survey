/**
 * ĐÃ GỘP VỀ DÙNG CHUNG (INTEGRATION) — bản thật ở `src/lib/format.ts`.
 *
 * NEEDS-s1-projects.md §N1 đề nghị: "R0 nâng lên src/lib/format.ts; tôi sẽ đổi import
 * và xoá bản của mình". Đã nâng (3 bản trùng của projects/setup/runs gộp làm một).
 * File này chỉ còn là cầu re-export để 13 file của S1/S2/S5 không phải đổi import.
 *
 * ⚠️ MỘT HÀNH VI ĐỔI CÓ CHỦ ĐÍCH: `bytes(null)` trước trả "0 B", nay trả "—".
 * "0 B" nghĩa là *file rỗng*; thiếu dữ liệu phải nói là chưa biết. Không ca test nào
 * của S1 phụ thuộc vào hành vi cũ (đã chạy lại `view.test.ts`).
 */
export { bytes, count, relTime, absTime, foldCase, exportFileName } from "@/lib/format";
