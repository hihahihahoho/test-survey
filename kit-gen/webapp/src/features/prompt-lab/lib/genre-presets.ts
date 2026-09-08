import { STYLE_AXIS_IDS, type StyleAxisId } from "@/features/kit-core/lib/form-model";

/**
 * PRESET PHONG CÁCH THEO THỂ LOẠI GAME (feedback team 24/08 §2a).
 *
 * Bệnh: bước Phong cách mở ra là 8 thanh trượt ở nấc giữa + một ô mô tả TRỐNG. Người
 * làm game biết ngay "bộ này cho game merge" nhưng phải tự dịch câu đó thành 8 con số
 * và một đoạn tiếng Anh — mà chính đoạn tiếng Anh ấy mới là thứ `gen.sh` đọc. Kết quả
 * là ai cũng bấm Tiếp với 8 nấc giữa và một ô rỗng.
 *
 * ĐÂY LÀ PHÍM TẮT ĐIỀN FORM, KHÔNG PHẢI MỘT CHẾ ĐỘ. Bấm một chip = điền hộ `stylePrompt`
 * + 8 trục, xong là hết vai trò: mọi ô vẫn sửa tự do, không khoá gì, không có state
 * "đang ở preset X" phải giữ đồng bộ. Chip sáng lên chỉ vì FORM ĐANG KHỚP nó — một tấm
 * gương, không phải một cái công tắc. Nhờ vậy sửa một nấc là chip tự tắt, và không có
 * đường nào để UI nói "đang dùng preset merge" trong khi prompt đã bị viết lại hoàn toàn.
 *
 * `stylePrompt` viết như art director giao brief: chất liệu, bảng màu, ánh sáng, hình
 * khối — thứ model vẽ được. KHÔNG viết "phong cách game merge" (model không biết đó là
 * gì) và KHÔNG nhắc lại thứ 8 trục đã nói (`axes` lo phần đó, hai nguồn nói cùng một
 * điều thì mâu thuẫn là chuyện sớm muộn).
 */
export interface GenrePreset {
  id: string;
  /** Chữ trên chip — tiếng Việt, ngắn để cả hàng chip nằm gọn một dòng trên laptop. */
  vi: string;
  /** Đi thẳng vào ô "Mô tả phong cách" ⇒ phải là tiếng Anh, đúng thứ tiếng của prompt. */
  stylePrompt: string;
  /** ĐỦ 8 trục, luôn luôn. Thiếu một trục là để lại nấc của preset trước — xem `applyGenrePreset`. */
  axes: Record<StyleAxisId, number>;
}

export const GENRE_PRESETS: readonly GenrePreset[] = [
  {
    id: "merge",
    vi: "Merge",
    stylePrompt: "soft rounded 3D clay-like objects with gentle gradients, pastel candy palette on warm cream backgrounds, chunky friendly silhouettes that stay readable at thumbnail size, glossy top highlights and soft contact shadows",
    axes: { age: 6, energy: 5, lux: 4, era: 2, gender: 5, detail: 6, outline: 2, ornament: 3 },
  },
  {
    id: "match3",
    vi: "Match-3",
    stylePrompt: "glossy jewel-like gems and candy pieces with saturated specular highlights, high-contrast board tiles over a deep vignetted background, sparkle and confetti accents, thick beveled frames with a bright top rim",
    axes: { age: 6, energy: 2, lux: 3, era: 2, gender: 5, detail: 6, outline: 4, ornament: 4 },
  },
  {
    id: "casual",
    vi: "Casual",
    stylePrompt: "clean vector shapes with flat fills and at most one soft gradient per surface, bright primary accents on light neutral panels, generous padding and oversized readable type, no texture and no fussy detail",
    axes: { age: 5, energy: 4, lux: 4, era: 2, gender: 4, detail: 3, outline: 3, ornament: 2 },
  },
  {
    id: "farm",
    vi: "Nông trại (cozy)",
    stylePrompt: "cozy storybook farmland palette of wheat gold, leaf green and terracotta, hand-painted wood grain and woven cloth textures, warm late-afternoon light with long soft shadows, rounded hand-drawn edges",
    axes: { age: 5, energy: 6, lux: 5, era: 5, gender: 5, detail: 5, outline: 3, ornament: 4 },
  },
  {
    id: "puzzle",
    vi: "Giải đố",
    stylePrompt: "calm minimal geometry in a restrained two-tone palette, flat surfaces separated only by soft ambient shadow, wide negative space and precise grid alignment, a single accent color reserved for the active piece",
    axes: { age: 4, energy: 5, lux: 3, era: 1, gender: 4, detail: 2, outline: 2, ornament: 1 },
  },
  {
    id: "rpg",
    vi: "Nhập vai nhẹ",
    stylePrompt: "semi-realistic fantasy interface in aged bronze and deep parchment, carved metal frames with gemstone inlays and rope trim, rich rim lighting on armor and scroll surfaces, heraldic banner and shield shapes",
    axes: { age: 3, energy: 3, lux: 2, era: 5, gender: 4, detail: 6, outline: 5, ornament: 6 },
  },
  {
    id: "arcade",
    vi: "Arcade retro",
    stylePrompt: "bold retro arcade look with chunky blocky shapes and dot-matrix texture, limited high-contrast CRT palette of hot magenta, cyan and near-black, hard-edged outlines, neon glow rimming every panel",
    axes: { age: 5, energy: 1, lux: 6, era: 6, gender: 3, detail: 1, outline: 6, ornament: 3 },
  },
] as const;

/**
 * Form hiện tại có đang là ĐÚNG preset này không — so sánh NÔNG, cố ý.
 *
 * Chip chỉ cần trả lời "bấm vào đây có đổi gì không". Người dùng thêm một câu vào cuối
 * `stylePrompt` là đã không còn là preset nữa, và chip tắt — đúng như vậy: bấm lại sẽ
 * xoá mất câu họ vừa viết, nên chip KHÔNG được sáng như thể "bạn đang ở đây".
 */
export function matchesGenrePreset(
  preset: GenrePreset,
  form: { stylePrompt: string; styleAxes: Record<string, number> },
): boolean {
  if (form.stylePrompt.trim() !== preset.stylePrompt) return false;
  return STYLE_AXIS_IDS.every((id) => form.styleAxes[id] === preset.axes[id]);
}

/**
 * Mẩu state một chip điền vào. Trả về object MỚI cho `styleAxes` (không spread state cũ):
 * preset khai đủ 8 trục, nên giữ lại nấc cũ của bất kỳ trục nào là để lộ vết của preset
 * bấm trước đó — hai nửa của hai phong cách khác nhau, không ai chọn thế bao giờ.
 */
export function applyGenrePreset(preset: GenrePreset): { stylePrompt: string; styleAxes: Record<StyleAxisId, number>; styleMode: "prompt" } {
  return { stylePrompt: preset.stylePrompt, styleAxes: { ...preset.axes }, styleMode: "prompt" };
}

/** Người dùng có thứ gì để mất khi bấm chip không ⇒ có phải hỏi trước khi đè không. */
export function genrePresetOverwrites(form: { stylePrompt: string }): boolean {
  return form.stylePrompt.trim().length > 0;
}
