/**
 * features/projects/lib/templates.ts — LUẬT THUẦN của template ở hộp Tạo dự án và ở
 * màn «Template dự án» (`features/home/TemplatesScreen.tsx`).
 *
 * Tách khỏi component để test không cần DOM, và vì luật điền tên (bên dưới) là thứ
 * dễ làm sai nhất mà sai thì im lặng: nó xoá chữ người dùng vừa gõ.
 */
import type { Template } from "@/lib/types";
import { foldCase } from "@/lib/format";

const pad = (n: number) => String(n).padStart(2, "0");

/** Trần độ dài tên — cùng số với `TEMPLATE_NAME_MAX` của agent (`lib/project-templates.mjs`). */
export const TEMPLATE_NAME_MAX = 80;

/**
 * Tên template dùng được chưa — `null` = được. Cùng luật agent áp khi PATCH (trim rồi
 * 1..80 ký tự, sai thì 400 `INVALID_NAME`); kiểm TRƯỚC ở đây để người dùng thấy lý do
 * ngay dưới ô, không phải một băng lỗi chung chung sau một vòng mạng.
 */
export function templateNameError(raw: string): string | null {
  const name = raw.trim();
  // kg-allow-jargon: «template» là TÊN TÍNH NĂNG do chủ sản phẩm đặt («save template»), không phải chữ kỹ thuật lọt ra.
  if (!name) return "Đặt tên cho template.";
  const max = TEMPLATE_NAME_MAX;
  if (name.length > max) return `Tên dài tối đa ${max} ký tự — đang có ${name.length}.`;
  return null;
}

/**
 * Ô tìm template (ở «Bắt đầu từ» và ở màn «Template dự án») — khớp theo TÊN, bỏ dấu,
 * không phân biệt hoa thường: gõ «tet» ra «Shop Tết». Không khớp mô tả hay id: id là
 * slug của tên kèm đuôi hex, khớp nó chỉ sinh kết quả trông như ngẫu nhiên.
 */
export function matchesTemplate(t: Pick<Template, "name">, query: string): boolean {
  const q = foldCase(query.trim());
  return !q || foldCase(t.name).includes(q);
}

/** «hôm nay» · «hôm qua» · «05/09/2026». Ngày lưu, không cần giờ — đây là nhãn nhận diện. */
export function savedDay(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  if (new Date(now).toDateString() === d.toDateString()) return "hôm nay";
  if (new Date(now - 864e5).toDateString() === d.toDateString()) return "hôm qua";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** «3 thẻ · 6 ảnh · lưu hôm nay» — dòng phụ dưới tên template. */
export function templateCaption(t: Pick<Template, "stats" | "createdAt">, now: number = Date.now()): string {
  return `${t.stats.blocks} thẻ · ${t.stats.refs} ảnh · lưu ${savedDay(t.createdAt, now)}`;
}

/** Tên gợi ý cho dự án mở từ template. */
export function nameFromTemplate(t: Pick<Template, "name">): string {
  return `${t.name} (mới)`;
}

/**
 * Ô TÊN sau khi người dùng chọn nguồn («Dự án trống» = `null`).
 *
 * ╔══ LUẬT: KHÔNG BAO GIỜ ĐÈ CHỮ NGƯỜI DÙNG GÕ ═══════════════════════════════╗
 * ║ Ô trống ⇒ điền «<tên template> (mới)». Ô đang chứa ĐÚNG chữ mà chính luật  ║
 * ║ này vừa điền (`autoFilled`) ⇒ chữ ấy là của MÁY, được thay theo template   ║
 * ║ mới — hoặc được xoá khi quay về «Dự án trống». Chữ nào khác là của người   ║
 * ║ dùng (kể cả khi họ chỉ sửa một ký tự của chữ máy điền) ⇒ để nguyên.        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function nameAfterPick(
  current: string,
  autoFilled: string | null,
  picked: Pick<Template, "name"> | null,
): { name: string; autoFilled: string | null } {
  const ours = autoFilled !== null && current === autoFilled;
  if (!picked) return ours ? { name: "", autoFilled: null } : { name: current, autoFilled: null };
  if (current.trim() === "" || ours) {
    const name = nameFromTemplate(picked);
    return { name, autoFilled: name };
  }
  return { name: current, autoFilled: null };
}
