import { normalizeHex } from "@/components/common/HexColorField";

/**
 * brand-colors.ts — MÃ HEX → CÂU VĂN của một art director.
 *
 * ╔══ VÌ SAO KHÔNG LIỆT KÊ "brand palette: #ff5533, #112233" ═════════════════╗
 * ║ Vì đó là một dòng CẤU HÌNH lọt vào giữa một đoạn văn. Model sinh ảnh đọc  ║
 * ║ prompt như đọc lời mô tả: nó bám rất tốt vào "vivid orange-red" (một khái ║
 * ║ niệm nó đã thấy hàng triệu lần) và bám khá vào "#ff5533" (một chuỗi ký    ║
 * ║ tự). Đưa CẢ HAI thì phần chữ dẫn hướng, phần hex ghim độ chính xác — bỏ   ║
 * ║ chữ đi là vứt cái dẫn hướng, bỏ hex đi là mất con số thương hiệu.         ║
 * ║                                                                          ║
 * ║ Và quan trọng hơn: màu phải có VAI TRÒ. "hai màu #ff5533 #112233" không   ║
 * ║ nói cái nào là màu chủ đạo, nên máy tự quyết — thường là chia đôi 50/50,  ║
 * ║ đúng thứ không ai muốn. Nên thứ tự người dùng xếp pill được dịch thành    ║
 * ║ vai trò tường minh: dominant → accent → supporting.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Hàm THUẦN, không DOM, không state ⇒ test được thẳng ở môi trường `node`.
 * `normalizeHex` mượn lại của `components/common/HexColorField` — cùng một
 * chuẩn hoá với ô người dùng gõ, nên chữ mô tả không bao giờ tả một màu khác
 * với màu đang hiện trong swatch.
 */

/** Số màu tối đa. Quá 4 thì không còn là "bộ nhận diện" mà là một bảng màu. */
export const MAX_BRAND_COLORS = 4;

/** `#rrggbb` → HSL (h: 0–360, s/l: 0–1). Công thức CSS chuẩn, không có gì lạ. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * 16 dải hue. Cố ý KHÔNG chia đều 22.5°: mắt người phân biệt vùng cam-vàng mịn
 * hơn nhiều so với vùng lục, nên dải cam rộng 11° còn dải lục rộng 60°. Chia đều
 * thì #ff5533 rơi vào ô "đỏ" và ta gọi một màu cam là màu đỏ.
 */
const HUE_BANDS: { max: number; name: string }[] = [
  { max: 9, name: "red" },
  { max: 20, name: "orange-red" },
  { max: 33, name: "orange" },
  { max: 44, name: "amber" },
  { max: 56, name: "golden yellow" },
  { max: 70, name: "yellow" },
  { max: 89, name: "yellow-green" },
  { max: 149, name: "green" },
  { max: 169, name: "mint green" },
  { max: 189, name: "teal" },
  { max: 201, name: "cyan" },
  { max: 249, name: "blue" },
  { max: 274, name: "indigo" },
  { max: 294, name: "violet" },
  { max: 320, name: "magenta" },
  { max: 344, name: "pink" },
  { max: 360, name: "red" },
];

/**
 * Tên tiếng Anh gần đúng của một màu: `#112233` → "deep navy blue".
 *
 * "Gần đúng" là đủ và là CỐ Ý — đây là chữ để dẫn hướng cho model, không phải
 * một phép đo màu. Ai cần chính xác thì đã có mã hex đi kèm ngay bên cạnh.
 * Trả "" nếu chuỗi không phải một màu.
 */
export function brandColorName(raw: string): string {
  const hex = normalizeHex(raw);
  if (!hex) return "";
  const { h, s, l } = hexToHsl(hex);

  /* ── Nhánh VÔ SẮC: gọi tên theo độ sáng, vì hue của màu xám là số rác ────
     Một #808080 có h=0 — gọi nó là "đỏ" thì sai hoàn toàn, mà lỗi này chỉ lộ
     ra ở đúng những màu trung tính mà thương hiệu nào cũng dùng. */
  if (l <= 0.07) return "near-black";
  if (l >= 0.95) return "near-white";
  if (s <= 0.1) {
    if (l < 0.28) return "charcoal grey";
    if (l < 0.62) return "mid grey";
    return "light grey";
  }

  const band = HUE_BANDS.find((entry) => h <= entry.max) ?? HUE_BANDS[0]!;
  let base = band.name;
  /* Dải lam trải 48° và ôm ba thứ mà mắt người coi là ba màu khác nhau hẳn:
     navy, blue, sky. Tách theo độ sáng ở đây rẻ hơn nhiều so với việc bịa thêm
     ba dải hue chồng nhau. */
  if (base === "blue") base = l <= 0.28 ? "navy blue" : l >= 0.68 ? "sky blue" : "blue";

  const prefix =
    l >= 0.78 ? (s <= 0.62 ? "soft pastel" : "pale") : l <= 0.3 ? "deep" : s <= 0.35 ? "muted" : s >= 0.7 ? "vivid" : "";

  return prefix ? `${prefix} ${base}` : base;
}

/**
 * Cả bộ màu → MỘT MỆNH ĐỀ hoà được vào câu văn.
 *
 *   ["#ff5533", "#112233"]
 *   → "a palette built around vivid orange-red (#ff5533) as the dominant brand
 *      colour, accented with deep navy blue (#112233)"
 *
 * Vai trò gán theo THỨ TỰ, và thứ tự đó là thứ tự pill trên màn — người dùng
 * xếp màu chính lên trước là một hành vi tự nhiên, không cần dạy. Màu không đọc
 * được thì bị loại chứ không đẩy chuỗi rác vào prompt.
 */
export function describeBrandColors(hexes: readonly string[]): string {
  const items = hexes
    .map((raw) => ({ hex: normalizeHex(raw), name: brandColorName(raw) }))
    .filter((item): item is { hex: string; name: string } => !!item.hex && !!item.name)
    .map((item) => `${item.name} (${item.hex})`);

  if (items.length === 0) return "";
  const [dominant, accent, ...support] = items;

  const parts = [`a palette built around ${dominant} as the dominant brand colour`];
  if (accent) parts.push(`accented with ${accent}`);
  /* 3–4 màu gộp thành MỘT mệnh đề "supported by X and Y" chứ không mỗi màu một
     mệnh đề: bốn mệnh đề nối tiếp thì câu dài tới mức phần đầu (màu chủ đạo) bị
     trôi mất trọng lượng — đúng thứ ta đang cố nói. */
  if (support.length > 0) parts.push(`supported by ${support.join(" and ")}`);

  return parts.join(", ");
}
