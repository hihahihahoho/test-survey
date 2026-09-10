import type { PromptPreviewImage, PromptPreviewJob } from "@/lib/types/api";
import { referenceImages } from "./prompt-copy";

/**
 * prompt-images.ts — ẢNH ĐI KÈM MỘT TẤM: ĐỌC BẢN KÊ CỦA ENGINE, KHÔNG TỰ ĐOÁN.
 *
 * ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 09/09/2026) ═════════════════════════════════╗
 * ║ Mở xem trước prompt của một thẻ: *"đúng rồi prompt thiếu cái hiển thị ảnh ║
 * ║ này"*. Khối ảnh dưới prompt chỉ có một cột đường dẫn, nên nó bày ra bốn ô  ║
 * ║ ảnh mà không ô nào nói được mình là gì — ảnh nhân vật, tấm dáng, cái logo, ║
 * ║ bản phác bố cục trông y như nhau khi tên file đã bị cắt cụt.               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * NGUỒN SỰ THẬT LÀ `job.images` — bản kê `prompts/<job>.refs` do chính gen.sh ghi
 * ra rồi agent đọc lại. Ở đây KHÔNG có một dòng nào tự suy ra vai của một tấm ảnh:
 * thứ tự và vai sống trong gen.sh, và một bản sao bằng TypeScript sẽ trôi khỏi bản
 * gốc trong im lặng — engine trên máy người dùng cập nhật bằng một lượt riêng với
 * webapp, nên hai bản KHÔNG BAO GIỜ đi cùng nhịp.
 */

/** Vai của một ảnh, nói bằng chữ người dùng nhận ra — không phải khoá của engine. */
const ROLE_LABEL: Record<string, string> = {
  character: "Nhân vật",
  pose: "Dáng",
  style: "Phong cách",
  brand: "Thương hiệu",
  layout: "Bố cục",
};

/**
 * Vai lạ (engine đời sau thêm một vai mới) rơi về một chữ TRUNG TÍNH mà vẫn đúng,
 * chứ không hiện khoá tiếng Anh của engine ra mặt người dùng.
 */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? "Ảnh tham chiếu";
}

/**
 * Tên đọc được của một tấm ảnh: bỏ thư mục, giữ tên file.
 *
 * Dòng caption cũ dán nguyên `refs/char-pose-sheet-….png` — vừa dài quá ô 128px
 * (người dùng chỉ thấy `refs/char-pose…`, tức là phần KHÔNG phân biệt được ảnh
 * nào với ảnh nào), vừa là chữ kỹ thuật lọt ra UI mà §5.4 cấm.
 */
export function shortName(path: string): string {
  const clean = path.replace(/[\\/]+$/, "");
  const cut = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
  return cut >= 0 ? clean.slice(cut + 1) : clean;
}

/**
 * DANH SÁCH ẢNH ĐỂ BÀY RA, có đường lùi cho engine đời cũ.
 *
 * Agent bản mới trả `images` (có vai). Agent/engine bản cũ chỉ có `attachments` —
 * khi ấy vẫn bày đúng những tấm ảnh sẽ đính, với vai để TRỐNG (chứ không phải một
 * vai bịa ra). Bày thiếu một cái nhãn hơn là bày một khối rỗng: người dùng ít nhất
 * còn thấy tấm ảnh mình phải dán vào chat.
 */
export function sheetImages(job: Pick<PromptPreviewJob, "images" | "attachments">): PromptPreviewImage[] {
  const rows = job.images ?? [];
  if (rows.length) {
    const out: PromptPreviewImage[] = [];
    for (const row of rows) {
      const path = row.path?.trim();
      /* Bản engine giao thời còn gửi ảnh khung xương — bày nó ra là bảo người dùng
         dán vào chat một tấm máy vẽ không còn nhận (xem `referenceImages`). */
      if (!path || path.startsWith("skeleton/")) continue;
      if (out.some((seen) => seen.path === path)) continue;
      out.push({ ...row, path });
    }
    return out;
  }
  return referenceImages(job.attachments ?? []).map((path) => ({ path, role: "" }));
}
