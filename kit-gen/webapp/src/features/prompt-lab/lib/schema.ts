/**
 * schema.ts — TÊN NODE + hình dạng attr của các tài liệu TipTap trong lab.
 *
 * ┌── VÌ SAO CÓ FILE NÀY (một file chỉ toàn hằng số) ────────────────────────┐
 * │ Tên node là DÂY NỐI giữa ba nơi không nhìn thấy nhau: extension khai     │
 * │ `name`, lệnh chèn của menu `/`, và bộ serialize đọc JSON. Gõ lệch một    │
 * │ chữ ở bất kỳ đâu thì KHÔNG có lỗi nào nổ — node chỉ lặng lẽ bị bỏ qua và │
 * │ prompt copy ra thiếu một mảnh. Gom vào một chỗ để `tsc` bắt hộ.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * CHỈ CÓ HAI NODE TỰ CHẾ. Cấu trúc (block, lưới ô, thứ tự) do REACT quản, không
 * do schema ProseMirror quản — xem chú thích đầu `PromptComposerScreen.tsx`.
 */

export const NODE = {
  /**
   * Pill chọn-một, inline atom. attrs: `{ kind, value }`.
   *
   * MỘT node cho MỌI loại pill (phong cách, chất liệu, khung cảnh, dáng, biểu
   * cảm…) thay vì mỗi loại một node. Lý do: chúng khác nhau đúng ở DANH SÁCH
   * lựa chọn — cùng hình dạng, cùng cách bấm, cùng cách đi vào prompt. Tách
   * thành 8 node là 8 lần chép cùng một node view và 8 chỗ để quên cập nhật.
   * Danh sách nằm ở `pill-registry.ts`, tra theo `kind`.
   */
  optionPill: "optionPill",
  /** Pill ảnh tham chiếu, inline atom. attrs: `{ refs }`. */
  imagePill: "imagePill",
} as const;

/**
 * Một ảnh tham chiếu người dùng thả vào pill.
 *
 * `url` là **object URL** (`URL.createObjectURL`) — chỉ sống trong RAM của tab
 * này. Cố ý: đây là lab, không có backend, và không được để một prototype âm
 * thầm ghi ảnh của người dùng xuống đâu cả. Hệ quả phải nói thẳng: tải lại
 * trang là mất, và JSON của tài liệu chứa một `blob:` không ai mở lại được.
 * Bản làm thật phải thay `url` bằng id tài sản trong workspace KitGen.
 */
export interface ImageRef {
  id: string;
  name: string;
  url: string;
}
