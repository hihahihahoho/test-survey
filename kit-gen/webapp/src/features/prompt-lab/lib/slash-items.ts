import type { JSONContent } from "@tiptap/react";
import { NODE } from "./schema";
import { INHERIT, type PillKind } from "./pill-registry";

/**
 * slash-items.ts — THỰC ĐƠN của menu gõ `/`.
 *
 * ┌── VAI TRÒ ĐÃ THU HẸP, CÓ CHỦ ĐÍCH ───────────────────────────────────────┐
 * │ Bản trước, `/` chèn cả CẤU TRÚC (câu mẫu, hàng spritesheet). Nay không   │
 * │ nữa: cấu trúc chỉ đi qua nút "+ Thêm block". Lý do là một luật giao diện │
 * │ chứ không phải khẩu vị — HAI cửa dẫn tới cùng một việc thì người dùng    │
 * │ phải học cả hai và không bao giờ chắc cửa nào làm gì. Nút "+ Thêm block" │
 * │ nhìn thấy được; menu `/` thì phải biết mới gõ. Cửa nhìn thấy được thắng. │
 * │                                                                          │
 * │ `/` giữ đúng việc mà nút không làm nổi: chèn một pill VÀO GIỮA CÂU đang  │
 * │ gõ dở, ở chế độ tự do. Không có nó thì viết lại câu là mất sạch pill.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface SlashItem {
  id: string;
  /** Chữ đậm trên mỗi hàng menu. */
  title: string;
  /** Dòng phụ — nói CÁI GÌ sẽ được chèn. */
  hint: string;
  /** Từ khoá phụ để tìm (tiếng Anh, viết tắt). */
  keywords: string;
  /** Nội dung chèn vào đúng chỗ vừa gõ `/`. Luôn là node INLINE. */
  content: () => JSONContent;
}

/* Viết bằng `new RegExp` chứ không phải regex literal: dải U+0300–U+036F là các
   ký tự TỔ HỢP, đặt thẳng vào source thì chúng bám vào dấu ngoặc vuông đứng
   trước và dòng code hiện ra méo mó trong mọi editor. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Bỏ dấu tiếng Việt để tìm kiếm.
 *
 * Cần thật: menu toàn nhãn tiếng Việt ("chất liệu", "biểu cảm"), mà người đang
 * gõ dở một câu thì hiếm khi bật bộ gõ dấu chỉ để lọc menu. Gõ "chat" phải ra
 * "Chất liệu". NFD tách dấu thành ký tự tổ hợp rồi xoá; riêng đ/Đ không có dạng
 * tổ hợp nên phải thay tay.
 */
function fold(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

const pillItem = (kind: PillKind, title: string, hint: string, keywords: string): SlashItem => ({
  id: `pill-${kind}`,
  title,
  hint,
  keywords,
  content: () => ({ type: NODE.optionPill, attrs: { kind, value: INHERIT } }),
});

export const SLASH_ITEMS: readonly SlashItem[] = [
  pillItem("style", "Phong cách", "Pill phong cách — mặc định theo phong cách chung", "style phong cach"),
  /* «Chất liệu» (08/2026) rồi «Đục nền» (08/09/2026) ĐÃ RỜI MENU, và lần này rời
     hẳn khỏi app: chất liệu ăn theo prompt tổng phong cách, còn độ trong thì gõ
     thẳng vào câu — ô ghi chú của dòng và nấc «Gõ riêng» của tên element đều đi
     nguyên văn vào prompt, không qua danh mục nào. */
  pillItem("scene", "Khung cảnh", "Pill khung cảnh — menu chính, màn chơi, shop…", "scene khung canh"),
  pillItem("mood", "Không khí", "Pill mood — rộn ràng, yên bình, hoàng hôn…", "mood khong khi"),
  pillItem("layout", "Bố cục", "Pill bố cục — chừa chỗ nào cho UI, hoặc đính bản phác", "layout bo cuc composition khung"),
  pillItem("decor", "Mức viền", "Pill mức trang trí 1–7", "decor muc vien trang tri"),
  pillItem("pose", "Dáng", "Pill dáng nhân vật", "pose dang"),
  pillItem("expression", "Biểu cảm", "Pill biểu cảm khuôn mặt", "expression bieu cam"),
  pillItem("outfit", "Trang phục", "Pill trang phục — mặc định theo theme chung", "outfit trang phuc"),
  /* Có mặt ở menu vì nó là pill DUY NHẤT giữ một thứ không có trường nào ngoài
     câu để cứu: xoá nó ở chế độ tự do là mất cả danh tính lẫn ảnh nhân vật, và
     không có đường nào chèn lại. Theme/phong cách không cần vì giá trị của chúng
     còn nằm trong `ComposerState`. */
  pillItem("mascot", "Nhân vật", "Pill nhân vật — chọn sẵn, đính ảnh, hoặc gõ mô tả", "mascot nhan vat linh vat"),
  {
    id: "pill-image",
    title: "Ảnh tham chiếu",
    hint: "Pill ảnh — bấm vào để chọn ảnh từ máy",
    keywords: "image anh ref reference",
    content: () => ({ type: NODE.imagePill, attrs: { refName: "", path: "" } }),
  },
];

/**
 * Lọc theo chữ gõ sau `/`.
 *
 * Trả về MẢNG RỖNG khi không khớp gì — cố ý, và menu phải vẽ được trạng thái đó.
 * Trả về cả danh sách khi không khớp sẽ tệ hơn: người dùng gõ "xyz" mà menu vẫn
 * đầy mục thì lần sau họ không tin cái ô tìm kiếm nữa.
 */
export function slashItems(query: string): SlashItem[] {
  const needle = fold(query.trim());
  if (!needle) return [...SLASH_ITEMS];
  return SLASH_ITEMS.filter((item) => fold(`${item.title} ${item.keywords}`).includes(needle));
}
