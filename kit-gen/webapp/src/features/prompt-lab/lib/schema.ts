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
  /** Pill ảnh tham chiếu, inline atom. attrs: `{ refName, path }` — xem `PillImage`. */
  imagePill: "imagePill",
} as const;

/**
 * Ảnh tham chiếu của một pill = MỘT tấm đã nằm trên đĩa project.
 *
 * ══ MÓN NỢ `blob:` ĐÃ ĐƯỢC TRẢ (08/2026) ═══════════════════════════════════
 * Bản lab giữ `refs: [{ id, name, url }]` với `url` là object URL — file này tự
 * khai luôn hai hệ quả: F5 là mất sạch ảnh, và JSON tài liệu chứa một `blob:`
 * chết. Khi composer thành khu làm việc thật thì cả hai đều chặn đường: tài liệu
 * nay được LƯU BỀN theo dự án, và ảnh phải đi vào `sheet.ref` của contract dưới
 * dạng đường dẫn tương đối để `gen.sh` đính kèm được.
 *
 * Nên attr của node nay là `{ refName, path }` — đúng thứ agent trả về sau khi
 * ghi ảnh vào `refs/`. HÌNH DẠNG THẬT nằm ở `prompt-canvas/lib/pill-image.ts`
 * (cùng chỗ với hàm tải lên), đây chỉ xuất lại để chỗ gọi cũ không phải biết.
 *
 * MỘT ẢNH MỖI PILL, không còn mảng: một pill = một chỗ trong câu = một `sheet.ref`.
 * Mảng cũ hứa nhiều ảnh cho một chỗ mà contract không có chỗ nhận.
 */
export type { PillImage } from "@/features/prompt-canvas/lib/pill-image";
