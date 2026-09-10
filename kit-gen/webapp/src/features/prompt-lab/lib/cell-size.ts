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
 * ║ chung một khung `0.8 × 0.6`, nên bảng nền và huy hiệu ra cùng một cỡ —    ║
 * ║ đúng thứ chủ sản phẩm nhìn thấy và than.                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÀ VÌ SAO CỠ MẶC ĐỊNH PHẢI ĐẾN TỪ *HÌNH DẠNG* CỦA ELEMENT ═════════════╗
 * ║ 07/09/2026, đo trên `kits/manifest.json` thật của dự án `test`: prompt in  ║
 * ║ *"2) health bar — safe zone … (251x188 px)"* và *"3) avatar frame — safe   ║
 * ║ zone … (251x188 px)"* — CÙNG MỘT HỘP cho một thanh máu và một khung tròn.  ║
 * ║ Model vẽ ra thứ hợp lý: lõi thanh máu đo được 370×97, lõi khung avatar     ║
 * ║ 303×263. Cả hai đều "sai" so với hộp ta đòi, QA gắn cờ 46px, và ở Figma ô  ║
 * ║ dán ra lệch cỡ. Nhưng cái sai không nằm ở model: một cái hộp 4:3 KHÔNG     ║
 * ║ PHẢI hình dạng của thanh máu, và không lời hứa nào bắt nó thành hình ấy.   ║
 * ║                                                                          ║
 * ║ ⇒ Cỡ mặc định của một dòng element = `skel` của CHÍNH loại element ấy      ║
 * ║   (`ElementPreset.skel`, cùng từ vựng `shape` với `element-lib.json`) đo   ║
 * ║   trên ô tham chiếu. Bar ra hộp rộng-mỏng, circle ra hộp vuông, panel ra   ║
 * ║   hộp to. Không còn MỘT con số hệ thống cho mọi loại.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ 07/09/2026 — CON SỐ Ở ĐÂY LÀ CỠ ĐẦU RA, KHÔNG PHẢI CỠ VẼ ══════════════╗
 * ║ Chủ sản phẩm: *«nó chỉ cần vẽ đúng tỉ lệ, để tối đa độ phân giải — còn     ║
 * ║ việc co về của Figma là của code»*. Bảo máy vẽ một cái nút 120px trên tấm  ║
 * ║ 1254px là tự nguyện vứt đi 90% pixel mà lượt gen ấy đã trả tiền.           ║
 * ║                                                                          ║
 * ║ ⇒ Ô LUÔN được lấp bằng hộp lớn nhất vừa lề (`drawBox` trong               ║
 * ║   `design/preview/geometry.ts`, gương của `geometry.py`), và cỡ chọn ở đây ║
 * ║   còn đúng hai vai: ① cho ra TỈ LỆ của hộp vẽ ấy, ② đi vào                 ║
 * ║   `component.out` → `manifest.outSize` để tầng xuất co lõi về đúng cỡ.     ║
 * ║                                                                          ║
 * ║ Vì thế file này KHÔNG còn hàm nào đổi cỡ chọn thành phân số ô: phân số ô   ║
 * ║ nay do `drawBox` quyết, và hai đường cùng tính một thứ là hai đường sẽ     ║
 * ║ trôi khỏi nhau (xem chính `geometry.py` sinh ra để chấm dứt chuyện đó).    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import { elementBox } from "@/features/kit-core/lib/geometry";
import type { Skel } from "@/lib/types/contract";

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
  /** CẠNH DÀI của safe zone, pixel trên canvas vuông. Cạnh còn lại suy từ hình dạng. */
  long: number;
}

/**
 * Bốn NẤC CỠ — mỗi nấc là một CẠNH DÀI, không phải một cái hộp.
 *
 * ╔══ VÌ SAO KHÔNG CÒN LÀ BỐN HỘP CỐ ĐỊNH ══════════════════════════════════╗
 * ║ Chủ sản phẩm nhìn pill Cỡ của «Avatar frame» rồi hỏi: *"mà avatar sao lại ║
 * ║ có 256×192 nhỉ…"*. Câu hỏi ấy không có câu trả lời nào tử tế: bốn nấc cũ  ║
 * ║ là bốn hộp chữ nhật đóng cứng (112×112 · 192×136 · 256×192 · 304×304), và ║
 * ║ ba trong bốn hộp đó KHÔNG PHẢI hình dạng của một khung avatar vuông. Chọn ║
 * ║ «L» cho một cái khung tròn nghĩa là tự tay phá đúng cái hình dạng mà lượt ║
 * ║ trước vừa dựng lên — và prompt lại hứa với model một hộp nó không vẽ được.║
 * ║                                                                          ║
 * ║ ⇒ Nấc chỉ trả lời «TO CỠ NÀO», hình dạng vẫn là của element. Cạnh dài ăn ║
 * ║   đúng con số cũ (112 · 192 · 256 · 304 — thói quen không đổi), cạnh ngắn ║
 * ║   = cạnh dài × tỉ lệ của `skel`. Avatar frame (1:1) ⇒ 256×256; health bar ║
 * ║   (3,9:1) ⇒ 256×65; nút pill (2,9:1) ⇒ 256×89.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Bốn mốc vẫn là bốn mốc CÓ THẬT, chỉ đọc lại theo cạnh dài:
 *  · S  = một icon/huy hiệu, đủ chỗ cho một ký hiệu đọc được;
 *  · M  = một nút bấm có nhãn;
 *  · L  = một thanh (máu, tiến trình) hoặc khung avatar lớn;
 *  · XL = bảng nền / popup: gần trọn ô, chỉ chừa vài px mỗi bên để `slice.py`
 *         còn biên mà cắt (ô 314 ⇒ 304).
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "s", vi: "S · nhỏ", long: 112 },
  { id: "m", vi: "M · vừa", long: 192 },
  { id: "l", vi: "L · lớn", long: 256 },
  { id: "xl", vi: "XL · tràn ô", long: 304 },
];

/** Trần một cạnh — không ai đặt safe zone rộng hơn cả canvas. */
export const MAX_SIZE_PX = SQUARE_CANVAS_PX;
/** Sàn một cạnh. Dưới 8px thì ô cắt ra không còn gì để nhìn. */
export const MIN_SIZE_PX = 8;

export interface SizePx {
  w: number;
  h: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   CỠ MẶC ĐỊNH — của TỪNG LOẠI ELEMENT, không phải của hệ thống
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Khung của element NGƯỜI DÙNG TỰ ĐẶT TÊN — và chỉ của nó.
 *
 * Một cái tên tự gõ ("Khiên chắn", "wheel pointer") không nói được hình dạng nào,
 * nên ở đây thật sự không có gì tốt hơn một hộp trung tính: `rrect` 0.8×0.6, đúng
 * cặp số mà MỌI ô từng dùng chung trước 07/09/2026. Khác biệt duy nhất — và là cả
 * lượt sửa này — là nó không còn được áp cho element CÓ KHAI hình dạng.
 *
 * Người dùng vẫn chỉnh được bằng pill «Cỡ» ở từng dòng; đây chỉ là điểm xuất phát.
 */
export const CUSTOM_ELEMENT_SKEL: Skel = { shape: "rrect", w: 0.8, h: 0.6 };

/**
 * Hộp safe zone (pixel) mà một `skel` chiếm trên một ô VUÔNG cạnh `cellPx`.
 *
 * Đo bằng `elementBox` của `design/preview/geometry.ts` chứ không nhân tay: đó là
 * bản mirror của `geometry.safe_offset_in_cell` (engine), và nó đã có test đọc
 * thẳng `geometry.py` canh không cho trôi. Nhân tay ở đây là dựng nguồn thứ hai.
 *
 * Ô VUÔNG là chủ ý, không phải đơn giản hoá: tấm Bộ UI của màn prompt-first luôn
 * là canvas vuông chia lưới vuông (`UI_CANVAS` + `squareGrid` của
 * `composer-to-contract.ts`), nên trên ô ấy `w/h` CHÍNH LÀ tỉ lệ hình dạng của
 * element. Đó là điều làm cho bảng `skel` dưới `presets-store.ts` đọc được bằng mắt.
 */
export function skelSizePx(skel: Skel | null | undefined, cellPx: number = REFERENCE_CELL_PX): SizePx {
  const side = cellPx > 0 ? cellPx : REFERENCE_CELL_PX;
  const box = elementBox(skel ?? CUSTOM_ELEMENT_SKEL, side, side);
  return { w: Math.round(box.w), h: Math.round(box.h) };
}

/**
 * TỈ LỆ NGANG/DỌC của một hình dạng.
 *
 * Đọc thẳng `w/h` được là nhờ ô Bộ UI luôn VUÔNG (xem `skelSizePx`). Hình dạng
 * hỏng (`h` thiếu, bằng 0, hay `full` không khai w/h) ⇒ rơi về tỉ lệ của
 * `CUSTOM_ELEMENT_SKEL` (0,8/0,6 = 4:3) thay vì trả `Infinity` hay `NaN` — một
 * cạnh `NaN` đi thẳng vào contract và làm `gen.sh` in ra một hộp không đọc được.
 */
export function aspectOf(skel: Skel | null | undefined): number {
  const w = Number(skel?.w);
  const h = Number(skel?.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return (CUSTOM_ELEMENT_SKEL.w ?? 0.8) / (CUSTOM_ELEMENT_SKEL.h ?? 0.6);
  }
  return w / h;
}

/**
 * Một NẤC (cạnh dài) + một hình dạng → hộp pixel.
 *
 * Cạnh dài ăn đúng con số của nấc; cạnh ngắn suy ra từ tỉ lệ rồi LÀM TRÒN. Kẹp cả
 * hai cạnh vào `[MIN_SIZE_PX, MAX_SIZE_PX]`: một hình cực dẹt (thanh 6:1) ở nấc S
 * cho cạnh ngắn 19px — vẫn cắt được; nhưng nếu ai đó khai một tỉ lệ hoang thì sàn
 * 8px là thứ giữ cho ô cắt ra còn có gì để nhìn.
 */
export function stepSizePx(longPx: number, skel: Skel | null | undefined): SizePx {
  const long = clampSide(longPx);
  const ratio = aspectOf(skel);
  return ratio >= 1
    ? { w: long, h: clampSide(long / ratio) }
    : { w: clampSide(long * ratio), h: long };
}

/**
 * Cỡ pixel → giá trị LƯU: id nấc nếu trùng khít một nấc, không thì chuỗi tự điền.
 *
 * Ưu tiên id nấc vì nó là thứ người dùng đọc được («M · vừa» thay vì «192×66px»)
 * và vì nó sống sót khi bảng nấc được chỉnh lại.
 *
 * PHẢI có `skel`: từ khi nấc là một CẠNH DÀI, cùng một con số `192` ra hộp khác
 * nhau theo hình dạng, nên "px này có phải nấc M không" là câu hỏi chỉ trả lời
 * được khi biết hình. Thiếu hình ⇒ hỏi theo hộp trung tính, đúng thứ nơi gọi sẽ
 * dùng để vẽ.
 */
export function sizeValueOfPx(px: SizePx, skel: Skel | null | undefined): string {
  const hit = SIZE_PRESETS.find((preset) => {
    const step = stepSizePx(preset.long, skel);
    return step.w === px.w && step.h === px.h;
  });
  return hit ? hit.id : customSizeValue(px.w, px.h);
}

/** Hình dạng + cỡ ghim của một loại element — phần `ElementPreset` mà cỡ cần đọc. */
export interface SizedElement {
  /** Cỡ GHIM TAY ở trang danh mục; rỗng ⇒ cỡ suy từ `skel`. */
  sizeId?: string;
  /** Hình dạng của loại element; thiếu ⇒ hộp trung tính `CUSTOM_ELEMENT_SKEL`. */
  skel?: Skel;
}

/**
 * Cỡ mặc định của một loại element, tính bằng PIXEL trên ô tham chiếu.
 *
 * Hai tầng, theo đúng thứ tự ai-nói-sau-thắng:
 *  ① `sizeId` của danh mục — ai đó đã GHIM một nấc cỡ cho loại này ở trang preset;
 *  ② không ghim ⇒ đo từ `skel` của chính loại ấy (thanh máu ra hộp rộng-mỏng,
 *     khung avatar ra hộp vuông). Đây là tầng thay cho cỡ hệ thống cũ.
 */
export function defaultSizePx(preset: SizedElement | null | undefined): SizePx {
  const pinned = sizePx(preset?.sizeId, preset?.skel);
  return pinned ?? skelSizePx(preset?.skel);
}

/**
 * Cỡ của một loại element, dạng GIÁ TRỊ LƯU (id preset hoặc `"<w>x<h>"`).
 *
 * Ở đây chứ không rải ở ba chỗ gọi, vì nó là ĐỊNH NGHĨA của "cỡ mặc định của loại
 * này" — và `swapCellElement` phải so ĐÚNG định nghĩa ấy để biết người dùng đã
 * chỉnh tay hay chưa.
 */
export function defaultSizeOf(preset: SizedElement | null | undefined): string {
  return String(preset?.sizeId ?? "").trim() || sizeValueOfPx(skelSizePx(preset?.skel), preset?.skel);
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
 * Cỡ pixel của một giá trị đã lưu. `null` = KHÔNG ĐỌC RA CỠ NÀO (rỗng, hoặc id lạ
 * của tài liệu đời sau) — nơi gọi giữ nguyên khung mặc định thay vì đoán bừa.
 *
 * Rỗng vẫn phải đọc được, dù UI không còn sinh ra nó: bản nháp lưu trước 07/09/2026
 * có `sizeId` rỗng, và `readCell` mới là chỗ vá chúng (bằng `defaultSizeOf` của
 * chính loại element ấy).
 *
 * ⚠️ NHÁP CŨ LƯU MỘT NẤC SẼ ĐỔI HỘP, CÓ CHỦ Ý. Một dòng «Avatar frame» lưu `"l"`
 * trước lượt này đọc ra 256×192; nay nó đọc ra 256×256. Đó KHÔNG phải mất dữ liệu:
 * `"l"` luôn có nghĩa là «nấc lớn», và nghĩa của nấc lớn nay là «cạnh dài 256, giữ
 * hình dạng». Giữ nguyên hộp cũ thì phải lưu thêm một bảng hộp-đời-trước, tức là
 * giữ sống đúng cái thứ vừa bị chủ sản phẩm chỉ tay vào. Ai đã tự gõ `"256x192"`
 * thì con số ấy vẫn nguyên — chuỗi tự điền không đi qua bảng nấc.
 */
export function sizePx(value: string | null | undefined, skel: Skel | null | undefined): SizePx | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const preset = SIZE_PRESETS.find((item) => item.id === raw);
  if (preset) return stepSizePx(preset.long, skel);
  return parseCustomSize(raw);
}

/**
 * Nhãn hiện trên pill. Rỗng ⇒ chuỗi rỗng (nơi gọi tự quyết chữ placeholder).
 *
 * KHÔNG nhận `skel`, và đó là chủ ý: nhãn của một nấc là TÊN NẤC («L · lớn»), thứ
 * không phụ thuộc hình dạng. Con số px thì có — nhưng nó thuộc về cột phụ của hộp
 * chọn (`SizePill`), nơi đã có `skel` trong tay.
 */
export function sizeLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const preset = SIZE_PRESETS.find((item) => item.id === raw);
  if (preset) return preset.vi;
  const custom = parseCustomSize(raw);
  return custom ? `${custom.w}×${custom.h}px` : raw;
}
