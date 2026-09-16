/* geometry.mjs — BẢN JS CỦA `geometry.py`. Toạ độ ô và safe zone, thuần số học.
 *
 * ╔══ VÌ SAO CÓ FILE NÀY ═══════════════════════════════════════════════════════╗
 * ║ 16/09/2026: engine được port sang JS để máy người dùng không cần bash, không ║
 * ║ cần Python/venv/pip. `geometry.py` là NGUỒN SỐ HỌC DUY NHẤT của cả prompt    ║
 * ║ (gen.sh) lẫn dao cắt (slice.py); bản JS này phải cho ra ĐÚNG TỪNG SỐ, vì hai ║
 * ║ bản lệch nhau nghĩa là hứa một khung rồi cắt một khung khác — và lệch LẶNG   ║
 * ║ LẼ, đúng cái bệnh mà `geometry.py` sinh ra để chữa.                          ║
 * ║                                                                             ║
 * ║ `geometry.py` là THAM CHIẾU, KHÔNG được sửa. File này bám theo nó từng hàm,  ║
 * ║ từng hằng số, từng tên.                                                     ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ HAI PHÉP LÀM TRÒN KHÁC NHAU GIỮA PYTHON VÀ JS — ĐÂY LÀ CHỖ DỄ LỆCH NHẤT.
 *   · `round()` của Python là LÀM TRÒN VỀ SỐ CHẴN ở ca đúng .5 (banker's rounding):
 *     round(0.5)=0, round(1.5)=2, round(2.5)=2. `Math.round` của JS làm tròn LÊN:
 *     Math.round(0.5)=1, Math.round(2.5)=3. Lưới chia hết một nửa pixel là ca
 *     THẬT (1254/4 = 313.5), nên ở đây dùng `pyRound` chứ KHÔNG dùng Math.round.
 *   · `//` của Python là chia lấy sàn (floor), không phải cắt phần thập phân.
 *   · `int(x)` của Python cắt về 0 (truncate) — dùng `Math.trunc`.
 *
 * Tên hàm giữ nguyên dạng snake_case của bản Python (để đọc song song hai file
 * không phải dịch trong đầu); mỗi hàm có thêm một tên camelCase cùng trỏ vào một
 * hàm duy nhất, cho người gọi bên JS.
 */

/** Làm tròn KIỂU PYTHON: nửa chừng thì về số CHẴN (round-half-to-even). */
export function pyRound(x, ndigits = 0) {
  if (!Number.isFinite(x)) return x
  if (ndigits) {
    // Ca duy nhất cần ndigits trong file này là `round(…, 2)` của `draw_scale`.
    // `toFixed` làm tròn theo GIÁ TRỊ THẬT của double y như Python; ca hoà đúng
    // giữa hai nấc không tồn tại với bội của 0,05/0,25 nên hai bản không lệch.
    return Number(x.toFixed(ndigits))
  }
  const f = Math.floor(x)
  const diff = x - f
  if (diff > 0.5) return f + 1
  if (diff < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

// ── BẢNG KHỔ CANVAS — NGUỒN SỰ THẬT DUY NHẤT ─────────────────────────────────
// ⚠️ VÌ SAO Ô VUÔNG LÀ 1254x1254 CHỨ KHÔNG PHẢI 1024x1024 HAY 2048x2048: tool
// `image_gen.imagegen` KHÔNG có tham số `size`, khổ do backend chọn. Đo 685 ảnh
// thật: mọi ảnh ≈ 1.572.864 pixel (=1536×1024) ±1500; 132 ảnh vuông đều là
// **1254×1254**. Ghi 1254 để con số ta hứa với model trùng con số nó trả về.
// (tuple của Python → mảng ở đây: [w, h, header, ratio])
export const CANVAS = {
  landscape: [1536, 1024, "LANDSCAPE 1536x1024", "landscape 3:2"],
  portrait: [1024, 1536, "PORTRAIT 1024x1536", "portrait 2:3"],
  square: [1254, 1254, "SQUARE 1254x1254", "square 1:1"],
}

/** Ô neo đáy được đẩy xuống một khoảng bằng 4% chiều cao ô. */
export const BOTTOM_ANCHOR_RATIO = 0.04

/** Khổ của tấm → `[w, h, header, ratio]`.
 *
 * `canvas` là field CHÍNH; `orient` (đời cũ) vẫn được đọc để contract cũ chạy
 * nguyên vẹn. Giá trị lạ RƠI VỀ landscape chứ không ném.
 */
export function canvas_of(sheet) {
  const raw = (sheet || {}).canvas || (sheet || {}).orient || "landscape"
  const key = String(raw).toLowerCase()
  return CANVAS[key] !== undefined ? CANVAS[key] : CANVAS.landscape
}

/** Khổ chuẩn của MỘT ô — `[CW, CH]`, đã làm tròn về pixel nguyên. */
export function cell_size(width, height, cols, rows) {
  return [pyRound(width / cols), pyRound(height / rows)]
}

/** Góc trên-trái của ô thứ `index` (đếm từ 0, quét theo hàng) trên sheet.
 *
 * Làm tròn TỪ TOẠ ĐỘ THẬT (`col * cell_w`) chứ không cộng dồn `col * CW`.
 */
export function cell_origin(width, height, cols, rows, index) {
  const cell_w = width / cols
  const cell_h = height / rows
  const row = Math.floor(index / cols)
  const col = index - row * cols
  return [pyRound(col * cell_w), pyRound(row * cell_h)]
}

/** Hộp ô trên sheet: `[x0, y0, x1, y1]`, nửa mở bên phải/dưới. */
export function cell_box(width, height, cols, rows, index) {
  const [cx0, cy0] = cell_origin(width, height, cols, rows, index)
  const [cw, ch] = cell_size(width, height, cols, rows)
  return [cx0, cy0, cx0 + cw, cy0 + ch]
}

/** Vị trí safe zone TRONG ô → `[dx, dy, sw, sh]`.
 *
 * Căn giữa ngang; dọc thì `anchor:"bottom"` dán đáy ô, còn lại căn giữa.
 * `//2` (chia lấy sàn) chứ không `round(…/2)`: lệch nửa pixel này đi thẳng vào
 * hộp cắt, nên nó phải là ĐÚNG phép mà dao cắt dùng.
 */
export function safe_offset_in_cell(cell_w, cell_h, skel) {
  const s = skel || {}
  const sw = pyRound(cell_w * s.w)
  const sh = pyRound(cell_h * s.h)
  let dy
  if (s.anchor === "bottom") dy = cell_h - sh - pyRound(cell_h * BOTTOM_ANCHOR_RATIO)
  else dy = Math.floor((cell_h - sh) / 2)
  return [Math.floor((cell_w - sw) / 2), dy, sw, sh]
}

/** Hộp safe zone trên SHEET: `[x0, y0, x1, y1]`. */
export function safe_box(width, height, cols, rows, index, skel) {
  const [cx0, cy0] = cell_origin(width, height, cols, rows, index)
  const [cw, ch] = cell_size(width, height, cols, rows)
  const [dx, dy, sw, sh] = safe_offset_in_cell(cw, ch, skel)
  return [cx0 + dx, cy0 + dy, cx0 + dx + sw, cy0 + dy + sh]
}

/** Lề chừa quanh ô cho phần TRÀN (viền, bevel, bóng, quầng sáng) — 10% mỗi cạnh. */
export const CELL_MARGIN_RATIO = 0.10

/** Lề của ô CÓ VIỀN / TRANG TRÍ — gấp đôi, tức hộp vẽ chỉ còn 0,6 ô. */
export const CELL_MARGIN_RATIO_DECOR = 0.20

/** Lề của CHÍNH ô này → tỉ lệ mỗi cạnh.
 *
 * Contract ĐỜI CŨ không có khoá `decor` ⇒ rơi về `CELL_MARGIN_RATIO`.
 */
export function cell_margin_ratio(skel) {
  return (skel || {}).decor ? CELL_MARGIN_RATIO_DECOR : CELL_MARGIN_RATIO
}

/** Hệ số phóng làm tròn XUỐNG về bước 0,25. */
export const DRAW_SCALE_STEP = 0.25

/** Sàn của hệ số khi cỡ đầu ra LỚN HƠN ô: bước 0,05 chứ không 0,25. */
export const DRAW_SHRINK_STEP = 0.05

/** Phần ô còn lại sau khi trừ lề mỗi cạnh → `[w, h]` pixel nguyên. */
export function cell_inner(cell_w, cell_h, margin = CELL_MARGIN_RATIO) {
  return [pyRound(cell_w * (1 - 2 * margin)), pyRound(cell_h * (1 - 2 * margin))]
}

/** Hộp LỚN NHẤT có tỉ lệ `aspect` (= w/h) nằm gọn trong ô sau khi trừ lề. */
export function max_fit_box(cell_w, cell_h, aspect, margin = CELL_MARGIN_RATIO) {
  const [aw, ah] = cell_inner(cell_w, cell_h, margin)
  if (!aspect || aspect <= 0) return [aw, ah]
  const w = Math.min(aw, ah * aspect)
  return [pyRound(w), pyRound(w / aspect)]
}

/** Hệ số phóng từ cỡ ĐẦU RA lên cỡ VẼ → float đã làm tròn xuống theo bước. */
export function draw_scale(cell_w, cell_h, out_w, out_h, margin = CELL_MARGIN_RATIO) {
  const [aw, ah] = cell_inner(cell_w, cell_h, margin)
  if (out_w <= 0 || out_h <= 0) return 1.0
  const raw = Math.min(aw / out_w, ah / out_h)
  const step = raw >= 1 ? DRAW_SCALE_STEP : DRAW_SHRINK_STEP
  return Math.max(step, pyRound(Math.trunc(raw / step) * step, 2))
}

/** Hộp vẽ của một ô → `[w, h, k]`: cỡ đầu ra nhân hệ số phóng, kẹp trong lề. */
export function draw_box(cell_w, cell_h, out_w, out_h, margin = CELL_MARGIN_RATIO) {
  const k = draw_scale(cell_w, cell_h, out_w, out_h, margin)
  const [aw, ah] = cell_inner(cell_w, cell_h, margin)
  // `min` cuối chỉ đỡ sai số làm tròn nửa pixel — k đã bảo đảm out*k <= khung trong
  return [Math.min(pyRound(out_w * k), aw), Math.min(pyRound(out_h * k), ah), k]
}

/** Ô này thuộc loại nào — "empty" | "full" | "safe". KHÔNG CÒN "free". */
export function cell_kind(skel) {
  const shape = (skel || {}).shape
  if (shape === "empty") return "empty"
  if (shape === "full") return "full"
  return "safe"
}

/** Toàn bộ hình học của một tấm → mảng object, một phần tử cho mỗi ô.
 *
 * `row`/`col` đếm từ 1 (con số NGƯỜI ĐỌC), `index` đếm từ 0 (con số MÁY dùng để
 * tra `components[index]`). `safe` là `null` với ô full-bleed và ô trống.
 */
export function sheet_geometry(sheet) {
  const [width, height] = canvas_of(sheet)
  const cols = sheet.grid.cols
  const rows = sheet.grid.rows
  const out = []
  const comps = sheet.components || []
  for (let index = 0; index < comps.length; index++) {
    const skel = comps[index].skel || {}
    const kind = cell_kind(skel)
    const row = Math.floor(index / cols)
    const col = index - row * cols
    out.push({
      index,
      row: row + 1,
      col: col + 1,
      kind,
      cell: cell_box(width, height, cols, rows, index),
      safe: kind === "empty" || kind === "full" ? null : safe_box(width, height, cols, rows, index, skel),
    })
  }
  return out
}

/* Tên camelCase cho người gọi bên JS — CÙNG một hàm, không phải bản sao. */
export {
  canvas_of as canvasOf,
  cell_size as cellSize,
  cell_origin as cellOrigin,
  cell_box as cellBox,
  safe_offset_in_cell as safeOffsetInCell,
  safe_box as safeBox,
  cell_margin_ratio as cellMarginRatio,
  cell_inner as cellInner,
  max_fit_box as maxFitBox,
  draw_scale as drawScale,
  draw_box as drawBox,
  cell_kind as cellKind,
  sheet_geometry as sheetGeometry,
}
