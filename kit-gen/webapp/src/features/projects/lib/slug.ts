/**
 * features/projects/lib/slug.ts — sinh slug từ tên có dấu (§4.1-1) + validate.
 *
 * "Xuân 26" → "xuan-26"; agent tự thêm `-<4 hex>` nên TRÙNG THƯ MỤC KHÔNG THỂ XẢY RA.
 * LUẬT §3.9 điều cấm 3: KHÔNG BAO GIỜ "từ chối im lặng" — mọi lần trượt validate đều
 * phải có chữ hiện ra (đóng E2: v1 `return` im lặng khi regex slug trượt).
 *
 * Regex chuẩn nằm ở `lib/types/contract.ts` (RE_SLUG, RE_VARIANT_ID) — không chép lại
 * ở đây để hai nơi không lệch nhau.
 */
import { RE_SLUG, RE_VARIANT_ID } from "@/lib/types";
import { foldCase } from "./format";

/** Bỏ dấu → chữ thường → gộp ký tự lạ thành `-` → cắt `max` (đúng thứ tự §4.1-1). */
export function slugify(text: unknown, { max = 40 }: { max?: number } = {}): string {
  return foldCase(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * Agent yêu cầu `^[a-z0-9][a-z0-9-]{2,47}$` (RE_SLUG).
 * @returns câu lỗi tiếng Việt, hoặc null nếu hợp lệ.
 */
export function validateSlug(slug: string): string | null {
  const s = String(slug ?? "");
  if (s === "") return "Chưa có tên thư mục. Gõ tên project để hệ thống tự đặt.";
  if (s.length < 3) return "Tên thư mục cần ít nhất 3 ký tự.";
  if (s.length > 48) return "Tên thư mục tối đa 48 ký tự.";
  if (!/^[a-z0-9-]+$/.test(s)) return "Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.";
  if (/^-|-$/.test(s)) return "Không bắt đầu hoặc kết thúc bằng dấu gạch ngang.";
  if (!RE_SLUG.test(s)) return "Tên thư mục phải bắt đầu bằng chữ hoặc số.";
  return null;
}

/** Tên hiển thị: chuỗi tự do nhưng phải có nội dung (agent giới hạn 120 ký tự). */
export function validateName(name: string): string | null {
  const s = String(name ?? "").trim();
  if (s === "") return "Nhập tên project để dễ tìm lại sau này.";
  if (s.length > 120) return "Tên tối đa 120 ký tự.";
  return null;
}

/** id phong cách đầu tiên (§3-S3.4 V-05): `^[a-z0-9-]{2,24}$`. */
export function variantId(vi: string): string {
  const s = slugify(vi, { max: 24 }).replace(/-+$/g, "");
  return RE_VARIANT_ID.test(s) ? s : "v1";
}

export interface DuplicateNameWarning {
  warn: string;
  suggestion: string;
}

/**
 * Trùng TÊN HIỂN THỊ thì CHO PHÉP (§4.1-2) — `name` là chuỗi tự do. Chỉ cảnh báo
 * vàng inline + gợi ý "(2)". KHÔNG chặn: chặn ở đây là bịa ra ràng buộc mà agent
 * không có, và user sẽ không hiểu vì sao mình bị từ chối.
 */
export function duplicateNameWarning(
  name: string,
  existing: readonly { name?: string }[],
): DuplicateNameWarning | null {
  const n = String(name ?? "").trim();
  if (n === "") return null;
  const taken = new Set(existing.map((p) => String(p.name ?? "").trim().toLowerCase()));
  if (!taken.has(n.toLowerCase())) return null;
  let i = 2;
  while (taken.has(`${n} (${i})`.toLowerCase())) i += 1;
  return {
    warn: `Đã có project tên «${n}». Vẫn tạo được — hai project sẽ khác nhau ở thư mục.`,
    suggestion: `${n} (${i})`,
  };
}

/** Tên mặc định khi nhân bản (§4.3): «X» (bản sao) → (bản sao 2)… */
export function copyName(name: string, existing: readonly { name?: string }[]): string {
  const base = String(name ?? "Project").trim();
  const taken = new Set(existing.map((p) => String(p.name ?? "").trim()));
  const first = `${base} (bản sao)`;
  if (!taken.has(first)) return first;
  let i = 2;
  while (taken.has(`${base} (bản sao ${i})`)) i += 1;
  return `${base} (bản sao ${i})`;
}

/** Tag: cùng luật slug nhưng ngắn. Trả `null` nếu không còn ký tự hợp lệ nào. */
export function normalizeTag(raw: string): string | null {
  const t = slugify(raw, { max: 24 });
  return t === "" ? null : t;
}
