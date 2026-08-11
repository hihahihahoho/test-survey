/**
 * features/project/settings/schema.ts — SCHEMA FORM THÔNG TIN của S2b (react-hook-form + zod).
 *
 * zod là nguồn sự thật: type suy ra từ schema nên không có chuyện type nói một
 * đằng validate làm một nẻo. Regex slug lấy từ `lib/types` (RE_SLUG — khớp ĐÚNG
 * `agent/lib/paths.mjs`), KHÔNG chép lại ở đây để hai nơi không lệch nhau.
 *
 * Ba điểm cần cẩn thận, đều là chốt của spec:
 *  · `slug` được phép RỖNG (nghĩa là "giữ nguyên") — agent chỉ nhận `slug` khi
 *    user thật sự đổi. Bắt buộc nhập là bịa thêm ràng buộc agent không có.
 *  · `cover` là ĐƯỜNG DẪN TƯƠNG ĐỐI trong project (`kits/<variant>/<file>.png`),
 *    do user chọn từ danh sách file thật (#42). KHÔNG có ô nhập path tự do —
 *    bài học G1 (v1 nhận `path` từ client và bị `refs/../gen.sh` xuyên qua).
 *  · `tags` chuẩn hoá bằng `normalizeTag` của S1 (bỏ dấu, chữ thường) để tag
 *    "Tết" và "tet" không thành hai tag khác nhau.
 */
import { z } from "zod";
import { RE_SLUG } from "@/lib/types";

export const MAX_TAGS = 12;

/** Đường dẫn ảnh bìa phải nằm TRONG project và trỏ vào kit đã cắt. */
const coverPath = z
  .string()
  .refine((v) => v === "" || (!v.includes("..") && !v.startsWith("/")), "Đường dẫn ảnh phải nằm trong project.");

export const projectSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nhập tên project để dễ tìm lại sau này.")
    .max(120, "Tên tối đa 120 ký tự."),
  description: z.string().max(500, "Mô tả tối đa 500 ký tự."),
  /** "" = giữ slug hiện tại. */
  slug: z
    .string()
    .trim()
    .refine((v) => v === "" || RE_SLUG.test(v), "Chỉ chữ thường không dấu, số và gạch nối (3–48 ký tự), bắt đầu bằng chữ hoặc số."),
  tags: z.array(z.string()).max(MAX_TAGS, `Tối đa ${MAX_TAGS} tag.`),
  /** "" = Tự động (agent tự lấy file đầu tiên). */
  cover: coverPath,
});

export type ProjectSettingsForm = z.infer<typeof projectSettingsSchema>;

/** Giá trị khởi tạo form từ project thật. Dùng cả cho `reset()` sau khi lưu. */
export function formDefaults(p: {
  name?: string;
  description?: string | undefined;
  slug?: string | undefined;
  tags?: string[];
  cover?: string | null | undefined;
}): ProjectSettingsForm {
  return {
    name: p.name ?? "",
    description: p.description ?? "",
    slug: p.slug ?? "",
    tags: [...(p.tags ?? [])],
    cover: p.cover ?? "",
  };
}

/**
 * Chỉ gửi field THẬT SỰ đổi (#10 là patch MỘT PHẦN).
 * Gửi cả cụm sẽ ghi đè giá trị mà một tab khác vừa sửa, và làm log của agent
 * đầy những lần "đổi" không đổi gì.
 */
export function patchFrom(
  values: ProjectSettingsForm,
  base: ProjectSettingsForm,
): { name?: string; description?: string; slug?: string; tags?: string[]; cover?: string | null } {
  const patch: {
    name?: string;
    description?: string;
    slug?: string;
    tags?: string[];
    cover?: string | null;
  } = {};
  if (values.name.trim() !== base.name.trim()) patch.name = values.name.trim();
  if (values.description !== base.description) patch.description = values.description;
  if (values.slug.trim() !== base.slug.trim() && values.slug.trim() !== "") patch.slug = values.slug.trim();
  if (values.tags.join("\u0000") !== base.tags.join("\u0000")) patch.tags = values.tags;
  // `cover: null` là cách nói "về Tự động" — schema #10 nhận `null` (nullable).
  if (values.cover !== base.cover) patch.cover = values.cover === "" ? null : values.cover;
  return patch;
}
