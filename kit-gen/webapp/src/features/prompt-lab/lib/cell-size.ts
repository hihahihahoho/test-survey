/**
 * cell-size.ts — «SIZE SAFE ZONE» CỦA MỘT DÒNG ELEMENT.
 *
 * ╔══ VÌ SAO NGƯỜI DÙNG PHẢI ĐƯỢC ĐẶT CỠ, DÙ LƯỚI LÀ VIỆC CỦA HỆ THỐNG ══════╗
 * ║ Chủ sản phẩm: *"Bộ kit có size safe zone: preset size hoặc user tự điền;  ║
 * ║ bảng nền,… custom element cũng cho điền custom."*                        ║
 * ║                                                                          ║
 * ║ Đây KHÔNG mâu thuẫn với luật "không cho xếp lưới" của block Bộ UI. Xếp    ║
 * ║ lưới = chọn ô nào nằm ở đâu (hệ thống lo). Safe zone = món đồ chiếm bao   ║
 * ║ nhiêu TRONG ô của nó — và đó là thứ duy nhất quyết định một cái bảng nền  ║
 * ║ vẽ ra to bằng cả ô hay bé bằng một cái nút. Trước lượt này mọi ô dùng     ║
 * ║ chung một khung `0.8 × 0.6` (xem `CELL_SKEL`), nên bảng nền và huy hiệu   ║
 * ║ ra cùng một cỡ — đúng thứ chủ sản phẩm nhìn thấy và than.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ ĐƠN VỊ LÀ PIXEL, NHƯNG CONTRACT ĂN PHÂN SỐ ═════════════════════════════
 * `skel.w`/`skel.h` của contract là PHÂN SỐ của ô (V-06: ∈ (0,1]) — người thiết
 * kế thì nghĩ bằng pixel. Nên UI nói pixel, còn `skelOf()` chia cho bề rộng ô
 * thật để ra phân số. Chia theo Ô CHỨ KHÔNG THEO CANVAS: cùng một món 96px nằm
 * trên lưới 4×4 (ô 256px) và trên lưới 2×2 (ô 512px) phải ra CÙNG 96 pixel thật,
 * và chỉ phép chia theo ô mới giữ được điều đó.
 */

/**
 * Bề rộng canvas vuông của tấm Bộ UI.
 *
 * **1254, không phải 1024** — con số này không do tôi chọn: tool `image_gen` của
 * codex KHÔNG có tham số `size`, nó luôn trả ~1,57 triệu pixel và chỉ lái được TỈ
 * LỆ, nên ảnh vuông ra đúng 1254×1254 (đo 685 ảnh thật; xem `sheet.canvas` trong
 * `lib/types/contract.ts` và bảng `CANVAS` của `gen.sh`).
 * Mọi con số pixel dưới đây được chọn TRÊN canvas ấy — đổi hằng này mà không đổi
 * bảng preset là làm mọi cỡ lệch đi lặng lẽ.
 */
export const SQUARE_CANVAS_PX = 1254;

/**
 * Ô THAM CHIẾU: lưới đầy 4×4 trên canvas vuông ⇒ 313×313.
 *
 * Bảng preset dưới được đo trên ô này. Lưới thưa hơn (2×2, 3×3) có ô TO hơn, và
 * lúc đó một món "S · 112px" vẫn là 112px thật — nó chỉ chiếm phần nhỏ hơn của ô.
 * Đó là hành vi đúng: người dùng đặt cỡ món đồ, không đặt tỉ lệ lấp đầy.
 */
export const REFERENCE_CELL_PX = Math.round(SQUARE_CANVAS_PX / 4);

export interface SizePreset {
  /** Id ỔN ĐỊNH — thứ được lưu vào tài liệu. */
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /** Bề rộng safe zone, pixel trên canvas vuông. */
  w: number;
  /** Bề cao safe zone, pixel trên canvas vuông. */
  h: number;
}

/**
 * Bốn nấc cỡ. Số đo chọn theo ba mốc có thật, không phải bốn số tròn cho đẹp:
 *  · S  = một icon/huy hiệu vuông, đủ chỗ cho một ký hiệu đọc được ở 96px;
 *  · M  = một nút bấm có nhãn — ngang gấp rưỡi cao, hình dạng thật của nút;
 *  · L  = một thanh (máu, tiến trình) hoặc khung avatar lớn;
 *  · XL = bảng nền / popup: gần trọn ô, chỉ chừa vài px mỗi bên để `slice.py`
 *         còn biên mà cắt (ô 313 ⇒ 304).
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "s", vi: "S · nhỏ", w: 112, h: 112 },
  { id: "m", vi: "M · vừa", w: 192, h: 136 },
  { id: "l", vi: "L · lớn", w: 256, h: 192 },
  { id: "xl", vi: "XL · tràn ô", w: 304, h: 304 },
];

/** Trần một cạnh — không ai đặt safe zone rộng hơn cả canvas. */
export const MAX_SIZE_PX = SQUARE_CANVAS_PX;
/** Sàn một cạnh. Dưới 8px thì ô cắt ra không còn gì để nhìn. */
export const MIN_SIZE_PX = 8;

export interface SizePx {
  w: number;
  h: number;
}

/**
 * Một trường, HAI hình dạng — cùng quy ước đã dùng cho `material` đời trước:
 * giá trị lưu là **id preset HOẶC chuỗi `"<w>x<h>"` người dùng tự điền**.
 *
 * Vì sao không tách thành `sizeId` + `sizeW` + `sizeH`: ba trường thì luôn có một
 * trạng thái thứ tư vô nghĩa (id preset kèm số riêng), và chỗ đọc sẽ phải chọn hộ
 * người dùng. Id preset là `[a-z]` nên không bao giờ đụng hàng với `"120x80"`.
 */
const CUSTOM_RE = /^(\d{1,4})x(\d{1,4})$/;

function clampSide(value: number): number {
  return Math.min(MAX_SIZE_PX, Math.max(MIN_SIZE_PX, Math.round(value)));
}

/** `"120x80"` → `{w:120,h:80}`. `null` khi không phải chuỗi tự điền hợp lệ. */
export function parseCustomSize(value: string | null | undefined): SizePx | null {
  const hit = CUSTOM_RE.exec(String(value ?? "").trim().toLowerCase());
  if (!hit) return null;
  const w = Number(hit[1]);
  const h = Number(hit[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return { w: clampSide(w), h: clampSide(h) };
}

/** Chuỗi lưu cho một cỡ tự điền. Đi cặp với `parseCustomSize` — sửa cùng nhau. */
export function customSizeValue(w: number, h: number): string {
  return `${clampSide(w)}x${clampSide(h)}`;
}

/**
 * Cỡ pixel của một giá trị đã lưu. `null` = "theo hệ thống" (rỗng, hoặc id lạ của
 * tài liệu đời sau) — nơi gọi giữ nguyên khung mặc định thay vì đoán bừa một cỡ.
 */
export function sizePx(value: string | null | undefined): SizePx | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const preset = SIZE_PRESETS.find((item) => item.id === raw);
  if (preset) return { w: preset.w, h: preset.h };
  return parseCustomSize(raw);
}

/** Nhãn hiện trên pill. Rỗng ⇒ chuỗi rỗng (nơi gọi tự quyết chữ placeholder). */
export function sizeLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const preset = SIZE_PRESETS.find((item) => item.id === raw);
  if (preset) return preset.vi;
  const custom = parseCustomSize(raw);
  return custom ? `${custom.w}×${custom.h}px` : raw;
}

/**
 * Cỡ pixel → PHÂN SỐ của một ô rộng `cellPx`.
 *
 * Kẹp trần ở 1: contract cấm `w`/`h` > 1 (V-06), và một safe zone to hơn ô của nó
 * là một yêu cầu không thực hiện được chứ không phải một lỗi cần ném — người dùng
 * điền 400px cho một ô 256px thì thứ họ muốn là "tràn ô", và đó là điều ta cho họ.
 */
export function skelSizeOf(value: string | null | undefined, cellPx: number): SizePx | null {
  const px = sizePx(value);
  if (!px) return null;
  const side = cellPx > 0 ? cellPx : REFERENCE_CELL_PX;
  return {
    w: Math.min(1, Math.round((px.w / side) * 1000) / 1000),
    h: Math.min(1, Math.round((px.h / side) * 1000) / 1000),
  };
}
