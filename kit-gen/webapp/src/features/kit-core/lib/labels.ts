/**
 * TÊN CỦA KHÁI NIỆM, MỘT CHỖ DUY NHẤT.
 *
 * Trước đây chuỗi "Skeleton UI" được gõ tay ở BẢY chỗ (stepper · sidebar dự án · tiêu đề
 * trang · aria-label hàng tab · KitsetStep · ReviewStep · command palette) kèm một chú
 * thích dặn "để cả ba nơi gọi cùng một tên" — tức luật chỉ sống bằng thiện chí. Đổi tên
 * một lần là lộ ra ngay: sót một chỗ thì app tự mâu thuẫn với chính nó.
 *
 * "Skeleton UI" nói về THỨ TA DỰNG RA để gửi cho model, còn người dùng đọc nó ra "bộ
 * khung xám" — trong khi trang đó là nơi họ quản lý CÁC THÀNH PHẦN giao diện của dự án.
 * Chủ sản phẩm chốt lại tên: **UI Elements**.
 *
 * ══ VÌ SAO HẰNG NÀY RỜI `steps/Stepper.tsx` SANG ĐÂY (Wave 4·B) ═════════════
 * Nhà cũ của nó là file dựng hàng-6-bước của wizard. Wizard đã bị khai tử, và
 * `WorkflowStepper` chết theo — nhưng cái NHÃN thì không: `ProjectScreen` và
 * `KitsetStep` vẫn gọi tên khái niệm đó mỗi ngày. Giữ nó trong một file tên
 * "Stepper" mà bên trong không còn stepper nào là để lại một cái bẫy đọc hiểu
 * cho người sau. Một module lá không phụ thuộc gì thì ai import cũng được, và
 * không kéo theo `lib/model` như file cũ.
 */
export const UI_STEP_LABEL = "UI Elements";
