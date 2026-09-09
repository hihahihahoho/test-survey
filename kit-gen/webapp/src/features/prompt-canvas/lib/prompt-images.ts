import type { PromptPreviewImage, PromptPreviewJob } from "@/lib/types/api";
import { referenceImages } from "./prompt-copy";

/**
 * prompt-images.ts — ẢNH ĐI KÈM MỘT TẤM: ĐỌC BẢN KÊ CỦA ENGINE, KHÔNG TỰ ĐOÁN.
 *
 * ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 09/09/2026) ═════════════════════════════════╗
 * ║ Mở xem trước prompt của một thẻ: *"đúng rồi prompt thiếu cái hiển thị ảnh ║
 * ║ này"*. Khối ảnh dưới prompt chỉ đọc danh sách ĐÍNH KÈM, nên nó hiện đúng   ║
 * ║ tấm ảnh dáng (có nền trong suốt ⇒ được đính) và giấu mất tấm ảnh nhân vật  ║
 * ║ (nền đục ⇒ engine đổi thành chữ) — đúng tấm quyết định con vật vẽ ra       ║
 * ║ trông thế nào. Cùng lượt ấy họ còn đọc thấy `{{DESC:refs/….jpg}}` trong    ║
 * ║ chữ và tưởng máy đang bịa nhân vật.                                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * NGUỒN SỰ THẬT LÀ `job.images` — bản kê `prompts/<job>.refs` do chính gen.sh ghi
 * ra rồi agent đọc lại. Ở đây KHÔNG có một dòng nào tính "ảnh này đính được hay
 * không": luật ấy sống trong gen.sh, và một bản sao bằng TypeScript sẽ trôi khỏi
 * bản gốc trong im lặng — engine trên máy người dùng cập nhật bằng một lượt riêng
 * với webapp, nên hai bản KHÔNG BAO GIỜ đi cùng nhịp.
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
 * Agent bản mới trả `images` (đủ hai lối đi). Agent/engine bản cũ chỉ có
 * `attachments` — khi ấy vẫn bày được nửa sự thật, với vai để trống (chứ không
 * phải một vai bịa ra) và lối đi là "đính kèm", vì đó đúng là thứ `attachments`
 * kể. Bày nửa sự thật hơn là bày một khối rỗng: người dùng ít nhất còn thấy tấm
 * ảnh mình phải dán vào chat.
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
  return referenceImages(job.attachments ?? []).map((path) => ({
    path,
    role: "",
    mode: "attached" as const,
    alpha: false,
    desc: null,
  }));
}

/** Một mẩu của prompt khi đã cắt ra để neo: `imageIndex` ≠ null ⇒ đây là đoạn tả một ảnh. */
export interface PromptPart {
  text: string;
  /** Vị trí của ảnh trong danh sách `sheetImages`, hoặc `null` với phần chữ thường. */
  imageIndex: number | null;
}

/**
 * CẮT PROMPT THÀNH CÁC MẨU ĐỂ NEO ĐƯỢC VÀO ĐOẠN TẢ CỦA TỪNG ẢNH.
 *
 * ╔══ VÌ SAO NEO BẰNG CHÍNH ĐOẠN CHỮ, KHÔNG BẰNG SỐ THỨ TỰ DÒNG ═════════════╗
 * ║ Agent trả về `desc` = ĐÚNG đoạn chữ đang đứng thay cho ảnh ấy trong        ║
 * ║ prompt (mô tả thật engine đã tả, hoặc câu chờ nếu chưa tả). Nên chỗ cần    ║
 * ║ nhảy tới tìm được bằng một phép `indexOf` trên chính chuỗi đang hiện —     ║
 * ║ không có bảng toạ độ thứ hai nào để mà lệch khi engine đổi bố cục prompt.  ║
 * ║ Đoạn nào không tìm thấy thì KHÔNG neo (thumbnail hết bấm được), chứ không  ║
 * ║ neo bừa vào một chỗ gần đúng: một cú nhảy tới nhầm đoạn còn tệ hơn không   ║
 * ║ nhảy, vì người dùng sẽ tin đoạn văn họ vừa được đưa tới.                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Ghép lại các mẩu phải ra ĐÚNG chuỗi ban đầu, không thiếu một ký tự — khối chữ
 * này là bản xem trước nguyên văn, có ca test canh từng ký tự.
 */
export function splitPromptByDesc(prompt: string, images: readonly PromptPreviewImage[]): PromptPart[] {
  const found: { at: number; end: number; imageIndex: number }[] = [];
  images.forEach((image, imageIndex) => {
    if (image.mode !== "described") return;
    const desc = image.desc?.trim();
    if (!desc) return;
    const at = prompt.indexOf(desc);
    if (at < 0) return;
    found.push({ at, end: at + desc.length, imageIndex });
  });
  found.sort((a, b) => a.at - b.at);

  const parts: PromptPart[] = [];
  let cursor = 0;
  for (const hit of found) {
    /* Hai ảnh tả ra CÙNG một đoạn chữ (hiếm, nhưng có thật khi hai ảnh trùng nội
       dung) ⇒ mẩu sau chồng lên mẩu trước. Bỏ mẩu chồng: cắt chồng nhau sẽ nhân
       đôi một khúc chữ, tức là bản xem trước nói dối. */
    if (hit.at < cursor) continue;
    if (hit.at > cursor) parts.push({ text: prompt.slice(cursor, hit.at), imageIndex: null });
    parts.push({ text: prompt.slice(hit.at, hit.end), imageIndex: hit.imageIndex });
    cursor = hit.end;
  }
  if (cursor < prompt.length) parts.push({ text: prompt.slice(cursor), imageIndex: null });
  return parts;
}
