/**
 * slug.js — sinh slug từ tên có dấu (§4.1-1) + validate.
 * "Xuân 26" → "xuan-26"; agent tự thêm `-<4 hex>` nên trùng thư mục KHÔNG THỂ xảy ra.
 * LUẬT §3.9 điều cấm 3: không bao giờ "từ chối im lặng" — mọi trượt validate đều có chữ.
 */

import { slugify as slugifyShared } from '../../shared/text.js';

/** Bỏ dấu → chữ thường → gộp ký tự lạ thành `-` → cắt 40 (đúng thứ tự §4.1-1).
 *  Thuật toán ở `screens/shared/text.js` (dùng chung với editor S3). */
export function slugify(name) { return slugifyShared(name, { max: 40 }); }

/** Agent yêu cầu `^[a-z0-9-]{3,48}$` (§4.1-1). Trả về chuỗi lỗi VI hoặc null. */
export function validateSlug(slug) {
  const s = String(slug ?? '');
  if (s === '') return 'Chưa có tên thư mục. Gõ tên project để hệ thống tự đặt.';
  if (s.length < 3) return 'Tên thư mục cần ít nhất 3 ký tự.';
  if (s.length > 48) return 'Tên thư mục tối đa 48 ký tự.';
  if (!/^[a-z0-9-]+$/.test(s)) return 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.';
  if (/^-|-$/.test(s)) return 'Không bắt đầu hoặc kết thúc bằng dấu gạch ngang.';
  return null;
}

/** Tên hiển thị: chuỗi tự do nhưng phải có nội dung (agent giới hạn 120 ký tự). */
export function validateName(name) {
  const s = String(name ?? '').trim();
  if (s === '') return 'Nhập tên project để dễ tìm lại sau này.';
  if (s.length > 120) return 'Tên tối đa 120 ký tự.';
  return null;
}

/** id phong cách đầu tiên (§3-S3.4 V-05): `^[a-z0-9-]{2,24}$`. */
export function variantId(vi) {
  const s = slugify(vi).slice(0, 24).replace(/-+$/g, '');
  return s.length >= 2 ? s : 'v1';
}

/**
 * Trùng TÊN HIỂN THỊ thì CHO PHÉP (§4.1-2), chỉ cảnh báo + gợi ý "(2)".
 * @returns {{warn:string, suggestion:string}|null}
 */
export function duplicateNameWarning(name, existing) {
  const n = String(name ?? '').trim();
  if (n === '') return null;
  const same = existing.filter((p) => String(p.name ?? '').trim().toLowerCase() === n.toLowerCase());
  if (same.length === 0) return null;
  let i = 2;
  const taken = new Set(existing.map((p) => String(p.name ?? '').trim().toLowerCase()));
  while (taken.has(`${n.toLowerCase()} (${i})`)) i += 1;
  return {
    warn: `Đã có project tên «${n}». Vẫn tạo được — hai project sẽ khác nhau ở thư mục.`,
    suggestion: `${n} (${i})`,
  };
}

/** Tên mặc định khi nhân bản (§4.3): «X» (bản sao) → (bản sao 2)… */
export function copyName(name, existing) {
  const base = `${String(name ?? 'Project').trim()} (bản sao)`;
  const taken = new Set(existing.map((p) => String(p.name ?? '').trim()));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${String(name).trim()} (bản sao ${i})`)) i += 1;
  return `${String(name).trim()} (bản sao ${i})`;
}
