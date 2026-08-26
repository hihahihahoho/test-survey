/**
 * ui.ts — BỐN HẰNG SỐ HÌNH DẠNG của khu soạn prompt.
 *
 * ╔══ VÌ SAO LÀ HẰNG SỐ CHỨ KHÔNG PHẢI CLASS GÕ THẲNG Ở MỖI CHỖ ═════════════╗
 * ║ Chủ sản phẩm (dân design) chê nguyên văn: *"to nhỏ không đều, layout sát   ║
 * ║ sàn sạt không thèm có padding, không có max width"*. Đọc lại mã thì thấy   ║
 * ║ đúng: khối «Ngữ cảnh chung» và vỏ `CanvasBlock` mỗi nơi tự gõ `rounded-3   ║
 * ║ border … p-5`, nhãn khối một nơi 13px một nơi 12px, và khung trang thì     ║
 * ║ KHÔNG có — `<main>` của `FloraShell` không cấp padding nào.               ║
 * ║ Bốn hằng số dưới đây là câu trả lời: mọi khối trong màn đọc CÙNG một chuỗi,║
 * ║ nên "đều" là mặc định chứ không phải thứ phải canh lại sau mỗi lần sửa.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * File `.ts` riêng (không nằm trong `PromptCanvasScreen.tsx`) vì `CanvasBlock` cũng
 * dùng chúng, và màn thì đã import `CanvasBlock` — để chung là một vòng import.
 */

/**
 * HỘP TRANG. `max-w-[1120px]` chứ không `.kg-page` (1280px): màn này là MỘT CỘT
 * chữ để đọc, và ở 1280 câu mad-lib dài tới ~130 ký tự một dòng — quá ngưỡng mà
 * mắt còn bắt được đầu dòng sau. 1120 giữ dòng quanh 90–100 ký tự.
 * `px-6` (24px) → `lg:px-8` (32px): khoảng thở ngang theo nhịp 8 của §5.1.
 */
export const PAGE = "mx-auto w-full max-w-[1120px] px-6 py-8 lg:px-8";

/**
 * NHÃN CỦA MỘT KHỐI («NGỮ CẢNH CHUNG», «CẢNH NỀN», «BỘ UI»…).
 * `tracking-label` (0.04em) đi cùng `uppercase` — giãn chữ chỉ hợp với chữ hoa.
 */
export const SECTION_LABEL = "text-caption font-medium uppercase tracking-label text-fg-muted";

/** Vỏ của mọi khối/thẻ: surface + hairline + bo 12 + đệm 20. */
export const CARD = "rounded-3 border border-line-subtle bg-surface p-5";

/**
 * TRẦN CHIỀU CAO CỦA MỘT Ô XEM TRƯỚC — 320px.
 *
 * Chủ sản phẩm: *"preview ảnh với xương to quá — cỡ vừa ~320px thôi, user có thể
 * phóng to"*. Trần cũ là 420px, và với hai tấm chồng nhau dưới chân một thẻ thì
 * chỉ riêng phần xem trước đã cao hơn một màn laptop 13" — người dùng phải cuộn
 * qua ảnh để về chỗ mình đang gõ. Ảnh vẫn xem được ở độ nét thật: bấm vào ảnh mở
 * dialog phóng to. Dùng `max-h` chứ không `h` để TỈ LỆ ảnh không bao giờ bị ép.
 */
export const PREVIEW_MAX_PX = 320;
export const PREVIEW_MAX_H = "max-h-[320px]";
