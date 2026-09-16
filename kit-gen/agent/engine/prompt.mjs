/* prompt.mjs — BỘ LẮP PROMPT, BẢN JS CỦA KHỐI PYTHON TRONG `gen.sh` (dòng ~202→1273).
 *
 * ╔══ HỢP ĐỒNG CỦA FILE NÀY ════════════════════════════════════════════════════╗
 * ║ Ra prompt GIỐNG TỪNG BYTE bản bash+python. Không một chữ nào được "cải       ║
 * ║ thiện" trong lúc port: bộ ca `suite-engine-prompt.mjs` so từng byte với      ║
 * ║ golden dựng từ `KITGEN_PROMPTS_ONLY=1 bash gen.sh`, nên một dấu phẩy khác là ║
 * ║ một ca đỏ. Thấy bug ở bản cũ thì GHI VÀO BÁO CÁO, không sửa ở đây — sửa ở    ║
 * ║ đây là hai engine nói hai câu khác nhau cho cùng một contract.               ║
 * ║                                                                             ║
 * ║ `gen.sh` là THAM CHIẾU, KHÔNG được sửa một byte. Mỗi khối dưới đây ghi số    ║
 * ║ dòng của bản gốc để đọc song song hai file.                                  ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ BỐN PHÉP CỦA PYTHON KHÔNG CÓ SẴN TRONG JS — cả bốn đều đã làm sai ở đâu đó
 * trong lịch sử của những bản port kiểu này, nên chúng có tên và có ghi chú:
 *   · `pyTruthy` — `[]` và `{}` là SAI trong Python, còn trong JS chúng ĐÚNG.
 *     `bool(b.get("refs"))` với `refs: []` phải ra false, không thì mọi contract
 *     có mảng rỗng đều mọc thêm section «Palette»/ảnh đính kèm.
 *   · `pyRound` (ở geometry.mjs) — làm tròn về số CHẴN ở ca đúng .5.
 *   · `pyInt` — `int()` cắt về 0, không làm tròn.
 *   · `fmtG` — `f"{x:g}"`: 6 chữ số có nghĩa, cắt sạch số 0 thừa (4.0 → "4").
 */
import * as geometry from "./geometry.mjs"

/* ── PHÉP DỊCH NGÔN NGỮ ─────────────────────────────────────────────────────── */

/** `bool(x)` của Python: chuỗi rỗng, 0, None, MẢNG RỖNG và DICT RỖNG đều là sai. */
export function pyTruthy(v) {
  if (v === null || v === undefined || v === false || v === "" || v === 0) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.keys(v).length > 0
  return Boolean(v)
}

/** `str(x)` của Python cho dữ liệu JSON. `True`/`False` viết hoa là của Python. */
export function pyStr(v) {
  if (v === null || v === undefined) return "None"
  if (v === true) return "True"
  if (v === false) return "False"
  return String(v)
}

/** `int(x)` của Python: cắt phần thập phân về phía 0; chuỗi thì phải là số nguyên. */
export function pyInt(v) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new TypeError("int() của giá trị không hữu hạn")
    return Math.trunc(v)
  }
  if (typeof v === "boolean") return v ? 1 : 0
  const s = String(v).trim()
  if (!/^[+-]?\d+$/.test(s)) throw new TypeError(`int() không đọc được ${JSON.stringify(v)}`)
  return Number(s)
}

/** `float(x)` của Python — ném đúng chỗ bản cũ ném (`core_aspect` bắt lỗi ấy). */
export function pyFloat(v) {
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? 1 : 0
  if (typeof v !== "string") throw new TypeError("float() của kiểu không hỗ trợ")
  const s = v.trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) throw new TypeError("float() không đọc được")
  return Number(s)
}

/** `f"{x:g}"` — 6 chữ số có nghĩa, bỏ số 0 vô nghĩa ở đuôi (4.0 → "4", 3.9 → "3.9"). */
export function fmtG(x) {
  if (x === 0) return "0"
  const e = Math.floor(Math.log10(Math.abs(x)))
  if (e < -4 || e >= 6) {
    let m = x.toExponential(5)
    let [mant, exp] = m.split("e")
    if (mant.includes(".")) mant = mant.replace(/0+$/, "").replace(/\.$/, "")
    const sign = exp[0] === "-" ? "-" : "+"
    const dig = exp.slice(1).padStart(2, "0")
    return `${mant}e${sign}${dig}`
  }
  let s = x.toPrecision(6)
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "")
  return s
}

/** `str(x).strip()` — cùng tập ký tự trắng cho mọi chuỗi mà contract thật mang. */
function strip(v) { return pyStr(v).trim() }

/* ══ TỈ LỆ LÕI: THỨ DUY NHẤT MODEL THẬT SỰ GIỮ ĐƯỢC (gen.sh ~210-280) ═════════
   Prompt từng đưa hộp pixel; đo ra model vẽ đúng tâm mà cỡ gấp 1,5–1,7 lần
   (r-0021). Toạ độ không điều khiển được nó; tỉ lệ thì có — và tỉ lệ là thứ hạ
   nguồn KHÔNG chữa được.
   Bảng DẢI chứ không phải phép làm tròn: quanh 1 thì "just over one times wider
   than tall" là câu vô nghĩa; ở dải 1–2 con người nói bằng TỈ LỆ QUEN. */
const _DAI_TI_LE = [
  [1.10, "square", "square"],
  [1.45, "slightly wider than tall, about 4:3", "slightly taller than wide, about 3:4"],
  [1.75, "wider than tall, about 3:2", "taller than wide, about 2:3"],
  [2.30, "about twice as wide as tall", "about twice as tall as wide"],
  [2.75, "about two and a half times wider than tall",
         "about two and a half times taller than wide"],
  [3.50, "about three times wider than tall", "about three times taller than wide"],
  [4.50, "about four times wider than tall", "about four times taller than wide"],
  [5.50, "nearly five times wider than tall", "nearly five times taller than wide"],
]

/** Tỉ lệ ≥ 1 → `[lời tả rộng hơn cao, lời tả cao hơn rộng]`. */
function _taTiLe(r) {
  for (const [nguong, rong, cao] of _DAI_TI_LE) {
    if (r < nguong) return [rong, cao]
  }
  const n = geometry.pyRound(r)
  return [`a long thin bar, ${n} times wider than tall`,
          `a tall thin column, ${n} times taller than wide`]
}

/** Cỡ đầu ra `{w,h}` → câu «core aspect W:H (…)», hoặc null.
 *
 * KHÔNG dùng hộp safe zone để tính: hộp ấy là hộp lớn nhất vừa lề của Ô, tỉ lệ
 * của nó là tỉ lệ ô chứ không phải tỉ lệ element.
 */
export function core_aspect(out) {
  let w, h
  try {
    if (out === null || out === undefined) throw new TypeError("out là None")
    w = pyFloat(out.w)
    h = pyFloat(out.h)
    if (out.w === undefined || out.h === undefined) throw new TypeError("thiếu khoá")
  } catch { return null }              // TypeError / KeyError / ValueError của bản cũ
  if (w <= 0 || h <= 0) return null
  const r = w / h
  const lon = r > 1 ? r : 1 / r
  const [rong, cao] = _taTiLe(lon)
  if (rong === "square") return "core aspect 1:1 (square)"
  const muoi = geometry.pyRound(lon * 10)
  if (r > 1) return `core aspect ${fmtG(muoi / 10)}:1 (${rong})`
  return `core aspect 1:${fmtG(muoi / 10)} (${cao})`
}

/** Hộp THỤT VÀO của một ô → `[x0, y0, x1, y1]` trên sheet (gen.sh ~311-322).
 *
 * Căn giữa bằng chia lấy sàn chứ không `round(…/2)` — đúng phép mà
 * `geometry.safe_offset_in_cell` dùng, nên hộp hứa và hộp cắt không lệch nửa pixel.
 * MỘT lề duy nhất (`CELL_MARGIN_RATIO`): lề decor KHÔNG lọt vào prompt.
 */
export function inner_box(cell, _skel) {
  const [cx0, cy0, cx1, cy1] = cell
  const cw = cx1 - cx0, ch = cy1 - cy0
  const [iw, ih] = geometry.cell_inner(cw, ch, geometry.CELL_MARGIN_RATIO)
  const dx = Math.floor((cw - iw) / 2), dy = Math.floor((ch - ih) / 2)
  return [cx0 + dx, cy0 + dy, cx0 + dx + iw, cy0 + dy + ih]
}

/** `cell_hint` của contract → MỘT CÂU TIẾNG ANH ĐỌC ĐƯỢC, hoặc chuỗi rỗng.
 *
 * Hint là CỤM DANH TỪ viết cho chỗ khác ("square 1:1 cell", "cell containing ONE
 * full-body character"), nên ghép thẳng ra «Each cell is a cell containing…».
 */
export function cell_sentence(hint) {
  let h = strip(pyTruthy(hint) ? hint : "")
  let low = h.toLowerCase()
  for (const dau of ["cell containing ", "cell that contains ", "cell with "]) {
    if (low.startsWith(dau)) return "Each cell contains " + h.slice(dau.length).replace(/\.+$/, "") + "."
  }
  if (low.endsWith(" cell")) {
    h = h.slice(0, -5).trim()
    low = h.toLowerCase()
  }
  if (low === "" || low === "cell" || low === "cells") return ""
  const m = /^(square|landscape|portrait)\s+(\d+:\d+)$/.exec(low)
  if (m) {
    return m[1] === "square" ? "Each cell is square." : `Each cell is ${m[1]}, ${m[2]}.`
  }
  return `Each cell is ${h}.`
}

/** Bề rộng dải mép ô PHẢI TRỐNG → một con số px, cho câu «Layout».
 *
 * Lấy cạnh HẸP HƠN: câu trong prompt chỉ có chỗ cho MỘT con số, và một lời hứa
 * nhỏ hơn sự thật thì vẫn đúng ở cả hai trục. Lề THƯỜNG, không phải lề trang trí.
 */
export function gutter_px(cell_w, cell_h) {
  const [iw, ih] = geometry.cell_inner(cell_w, cell_h)
  return Math.min(Math.floor((cell_w - iw) / 2), Math.floor((cell_h - ih) / 2))
}

const canvas_of = geometry.canvas_of

/** Tấm này có được style `s` chạy không (gen.sh ~440 và vòng liệt kê job cuối file). */
export function sheetRunsWithStyle(sheet, style) {
  return !(pyTruthy(sheet.styles) && !sheet.styles.includes(style.id))
}

/** Danh sách job theo ĐÚNG thứ tự gen.sh dựng: style ngoài, sheet trong. */
export function listJobs(cfg) {
  const out = []
  for (const s of cfg.styles) {
    for (const sh of cfg.sheets) {
      if (!sheetRunsWithStyle(sh, s)) continue
      out.push({ job: `${s.id}-${sh.id}`, style: s, sheet: sh })
    }
  }
  return out
}

/* ══ PROMPT = MỘT LOẠT SECTION MARKDOWN, MỖI LUẬT NÓI ĐÚNG MỘT LẦN ════════════
   Bốn loại tấm — ui · mascot · background · screen — rút section ra từ CÙNG MỘT
   bảng, mỗi section tự khai mình đi với loại nào qua `on=`.

   ⚠️ BA DÒNG ĐẦU LÀ HỢP ĐỒNG VỚI TẦNG BASH (`run_one` đọc `head -n3 | case`):
   trên cùng là `background="transparent"` (tấm không full-bleed), rồi «## Canvas»,
   rồi dòng mang chữ PORTRAIT/SQUARE/LANDSCAPE. Bước ③ (vòng chạy codex) đọc lại
   đúng ba dòng ấy — đừng ai chèn gì lên đầu. */

const ALL = ["ui", "mascot", "background", "screen"]

/** Dựng prompt + danh sách ảnh kèm cho MỘT (style × sheet).
 *
 * Trả về đủ thứ mà `cli.mjs` cần ghi ra đĩa; KHÔNG tự ghi file, để bộ ca so byte
 * gọi được mà không phải dựng thư mục.
 */
export function buildPrompt(style, sheet) {
  const s = style, sh = sheet
  const cols = sh.grid.cols, rows = sh.grid.rows
  const comps = sh.components
  if (comps.length !== cols * rows) {
    // `assert` của bản cũ (gen.sh ~443). Nó giết cả lượt, và đó là chủ ý: một
    // contract sai lưới mà vẫn dựng prompt là hứa một hình học không tồn tại.
    throw new Error(`${sh.id}: ${comps.length} component ≠ lưới ${cols}x${rows}`)
  }
  const real = comps.filter(c => c.skel.shape !== "empty")
  const n_real = real.length
  const [canvas_w, canvas_h, canvas_header, canvas_ratio] = canvas_of(sh)
  // HÌNH HỌC CỦA CẢ TẤM, tính MỘT LẦN, bằng ĐÚNG hàm `slice.py` dùng để cắt.
  const geo = geometry.sheet_geometry(sh)
  // ⚠️ FULL-BLEED NHẬN DIỆN THEO skel.shape, KHÔNG theo id sheet: id do người dùng
  // đặt ("nen", "background", "bg-scene"…) nên nhánh theo id gần như không chạy.
  const full_bleed = n_real > 0 && real.every(c => c.skel.shape === "full")
  // LỚP NỀN CÓ VÙNG TRỐNG — `skel.alpha`. «Phủ kín khung» và «có nền đục» là HAI
  // câu hỏi; một lớp parallax trả lời khác nhau cho chúng.
  const keep_alpha = full_bleed && real.some(c => pyTruthy(c.skel.alpha))
  // MỘT Ô FULL-BLEED = MỘT MÀN HÌNH, không phải sprite sheet 1x1.
  const screen_sheet = full_bleed && comps.length === 1
  // ⚠️ MASCOT KHÔNG CÒN NHẬN DIỆN BẰNG MỖI `sh.ref`: tín hiệu thật là `skel.shape
  // == "pose"` (thứ `slice.py` đã đọc từ lâu), `poseRef` cũng đủ kết luận.
  const pose_cells = real.some(c => c.skel.shape === "pose")
  const mascot_sheet = pyTruthy(sh.ref) || pyTruthy(sh.poseRef) || pose_cells

  const b = pyTruthy(s.brand) ? s.brand : {}
  const use_brand_refs = pyTruthy(b.refs)
  // ⚠️ ẢNH PHONG CÁCH ĐÃ TẢI LÊN THÌ PHẢI ĐƯỢC DÙNG (bản cũ gài `styleMode ==
  // "inspo"` — không màn nào đặt giá trị ấy nên ảnh không bao giờ được đính).
  const use_inspo = pyTruthy(s.inspo)

  let profile
  if (screen_sheet) profile = "screen"          // MỘT cảnh phủ kín khung
  else if (full_bleed) profile = "background"   // NHIỀU cảnh, mỗi cảnh phủ kín ô
  else if (mascot_sheet) profile = "mascot"     // lưới nhân vật full-body
  else profile = "ui"                           // món đồ giao diện

  const sections = []
  const section = (title, body, on = ALL) => {
    if (!on.includes(profile)) return
    const rows_ = body.filter(row => pyTruthy(row))
    if (!rows_.length) return
    sections.push("## " + title)
    sections.push(...rows_)
    sections.push("")
  }

  // ── Canvas ──────────────────────────────────────────────────────────────────
  // Nền nói ở ĐÂY và chỉ ở đây. Tấm full-bleed ĐẢO NGƯỢC câu ấy chứ không im lặng
  // bỏ qua: xin nền trong suốt cho một tấm phủ kín là mời model chừa khung rỗng.
  section("Canvas", [
    `${canvas_header} px, origin top-left: x grows right, y grows down.`
    + (keep_alpha
      ? " The artwork reaches all four edges of the frame, and this is a LAYER meant to"
        + " sit over another one: save a PNG with a real alpha channel, alpha 0 on every"
        + " pixel the artwork does not cover."
      : full_bleed
      ? " The artwork covers the whole frame; there is no transparent area anywhere."
      : " Background fully transparent: save a PNG with a real alpha channel, alpha 0 on"
        + " every pixel that is not part of a drawn element."),
  ])

  // ── Art style ───────────────────────────────────────────────────────────────
  // `style_text` là NGUYÊN VĂN `variant.style` do webapp dựng. Engine KHÔNG bóc nó
  // ra, không thêm tính từ nào: nó là chữ của người dùng.
  const style_text = strip(pyTruthy(s.style) ? s.style : "")
  const style_body = []
  if (use_inspo) {
    style_body.push(
      "The attached reference image(s) ARE the style: match their rendering technique,",
      "materials, palette and level of detail. Some of them may instead show SUBJECT",
      "MATTER — a season, a festival, a setting, a recurring motif; borrow that from",
      "those. Never copy the layout or composition of any reference.")
    if (style_text) {
      style_body.push(
        "Written direction, secondary to those images and never contradicting them: "
        + style_text + ".")
    }
  } else if (style_text) {
    style_body.push(style_text + ".")
  } else {
    // KHÔNG bịa một phong cách thay người dùng.
    style_body.push(
      "None was given for this project: choose one coherent look and apply it to"
      + " every element here without exception.")
  }
  section("Art style", style_body)

  // ── Palette ─────────────────────────────────────────────────────────────────
  // MỘT TRỌNG TÀI MÀU DUY NHẤT. Trước đây màu được nhắc ba lần ở ba giọng khác
  // nhau nên nguồn ĐỨNG GẦN Ô NHẤT thắng — đúng triệu chứng "màu thương hiệu
  // không được respect".
  const palette = []
  if (pyTruthy(b.primary)) {
    let row = `Primary ${b.primary} (dominant: primary actions and key surfaces)`
    if (pyTruthy(b.secondary)) row += `, secondary ${b.secondary} (secondary actions)`
    if (pyTruthy(b.gradient)) row += `, gradient ${b.gradient}`
    palette.push(row + "; neutrals derive from them. No other hues unless the art"
      + " style names them.")
    if (use_brand_refs || use_inspo) {
      palette.push("The attached reference images decide the RENDERING, not the hue:"
        + " re-tint whatever they show into this palette.")
    }
  } else if (use_brand_refs || use_inspo) {
    palette.push("Taken from the attached reference image(s), which decide both the"
      + " rendering and the palette.")
  }
  section("Palette", palette)

  // ── Layout ──────────────────────────────────────────────────────────────────
  let direction = []
  if (profile === "screen") {
    // ⚠️ MỘT CẢNH NỀN KHÔNG PHẢI MỘT SPRITE SHEET CÓ ĐÚNG MỘT Ô: không lưới,
    // không hộp nào để cắt, và không được phép có một pixel trong suốt nào.
    section("Layout", [
      keep_alpha
        ? "A single full-screen mobile game layer, spread across the whole frame edge to"
          + " edge: one layer of one scene, not a sheet of separate parts. No border, no"
          + " frame, no margin, no rounded corners — the art reaches all four edges. It does"
          + " not have to cover every pixel: this layer sits over another one, so wherever"
          + " the scene has nothing, the frame stays empty."
        : "A single full-screen mobile game background, filling the whole frame edge to"
          + " edge: one finished screen, not a sheet of separate parts. No border, no frame,"
          + " no margin, no rounded corners, no vignette band — the art reaches all four"
          + " edges, and a scene sitting inset inside an empty frame is unusable and will be"
          + " regenerated.",
    ], ["screen"])
  } else {
    const empties = comps.map((comp, i) => [i, comp]).filter(([, comp]) => comp.skel.shape === "empty")
      .map(([i]) => String(i + 1))
    // `cell_hint` đi thẳng vào prompt, nguyên văn: bộ dịch bên webapp tính tỉ lệ ô
    // từ lưới THẬT và người dùng đọc lại đúng câu ấy trên màn thiết kế.
    const cell_hint = strip(pyTruthy(sh.cell_hint ?? "cell") ? (sh.cell_hint ?? "cell") : "cell")
    // CỠ Ô BẰNG SỐ, NÓI ĐÚNG MỘT LẦN Ở ĐÂY. Tấm 1 ô không in CỠ Ô: ô ấy chính là
    // khổ ảnh, và «Canvas» đã nói khổ ảnh ở dòng thứ hai của prompt.
    let cell_px = ""
    let _cw = 0, _ch = 0
    if (cols * rows > 1) {
      ;[_cw, _ch] = geometry.cell_size(canvas_w, canvas_h, cols, rows)
      cell_px = ` of ${_cw}x${_ch} px cells`
    }
    let grid_row = `${cols}x${rows} grid${cell_px}, ${n_real} `
      + (n_real !== 1 ? "elements" : "element")
    grid_row += " in reading order."
    const cau_o = cell_sentence(cell_hint)
    if (cau_o) grid_row += " " + cau_o
    grid_row += " Keep exactly this many cells in exactly this order."
    const layout = [grid_row]
    // ⚠️ CÂU CHỐT BỀ NGANG CHỈ CỦA TẤM GIAO DIỆN: nó nói bằng hai từ mà một dáng
    // người không có ("core", "ratio").
    if (cols * rows > 1 && profile === "ui") {
      layout.push("A wide element is at most as wide as the box on its line: if the"
        + " box cannot hold the core at its ratio at the size you want, draw"
        + " it smaller — never wider than the box.")
    }
    if (cols * rows > 1 && (profile === "ui" || profile === "mascot")) {
      // Ô và HỘP LÀ HAI THỨ: không ai định nghĩa thì model tự gán nghĩa rộng hơn.
      layout.push("Each cell has a box, given on that element's line below: the box"
        + " is the part of the cell that may be painted.")
      // RÃNH TRỐNG, NÓI BẰNG SỐ, MỘT LẦN CHO CẢ TẤM.
      layout.push(`Cells are separated by empty gutters: the outer`
        + ` ${gutter_px(_cw, _ch)} px band of every cell — everything`
        + " outside that box — stays completely empty, not a leaf tip, not a"
        + " glow, so neighbouring elements never meet.")
    }
    if (empties.length) {
      layout.push("Cell " + empties.join(", ")
        + (empties.length > 1 ? " are" : " is")
        + " intentionally empty: draw nothing there.")
    }
    if (profile === "background") {
      layout.push("Each scene fills its own cell edge to edge and bleeds off all four"
        + " sides of that cell; the only gap allowed is a thin 24px line"
        + " exactly on the cell boundaries.")
    }
    section("Layout", layout, ["ui", "mascot", "background"])

    // ── Geometry ──────────────────────────────────────────────────────────────
    // ⚠️ HAI BỘ LUẬT, KHÔNG PHẢI MỘT BỘ CÓ HAI NHÁNH: chữ viết cho một món đồ giao
    // diện ("lõi chức năng", "viền và hoa văn ở ngoài lõi") đọc trên một dáng người
    // là vô nghĩa.
    if (profile === "ui") {
      const geom = [
        "- GEOMETRY IS STRICT. Each element's line gives the width-to-height ratio of"
        + " its functional CORE — the continuous body of the thing. Draw the core at that"
        + " ratio.",
        "- Never make a core taller, shorter, wider or more square because it looks"
        + " better that way: something described as nearly five times wider than tall is"
        + " drawn nearly five times wider than tall.",
        "- Rim, border, glow and ornament are NOT part of the core: they are excluded"
        + " from that ratio and sit outside the core.",
        // TRUNG LẬP VỚI Ô KÍNH / Ô ÁNH SÁNG: "lấp gần kín ô" bị model đọc thành "phủ
        // SƠN ĐẶC" ⇒ nó lấp phần trong suốt bằng thứ nó nghĩ là "trong suốt".
        "- Filling space is about REACH, not about opaque paint: a see-through or glowing"
        + " element may fade to full transparency inside its own body, and nothing is ever"
        + " added behind it to fill the gap.",
      ]
      if (cols * rows > 1) {
        geom.push(
          "- Each element is centred in its own cell and fills most of its box."
          + " Everything of an element, rim and ornament included, stays inside that"
          + " box: elements never touch each other and never touch the image edges.")
        // AI THẮNG AI, NÓI THẲNG RA (r-0040: banner 3.9:1 vẽ rộng 818px trong ô 627px).
        geom.push(
          "- The box on each line is a hard limit; the ratio is drawn inside it.")
      } else {
        geom.push(
          "- The element is centred in the frame and fills most of it while keeping a"
          + " clear margin all round — nothing, rim and ornament included, touches the"
          + " image edges.")
        geom.push(
          "- The box on the element line is a hard limit; the ratio is drawn inside"
          + " it.")
      }
      section("Geometry", geom, ["ui"])
    } else if (profile === "mascot") {
      // Một dáng người không có "lõi chức năng" và không có viền để mà đẩy ra ngoài.
      const geom = [
        "- GEOMETRY IS STRICT. Each pose is centred in its own cell and stands upright,"
        + " the full figure inside its box with a clear margin above the head and below"
        + " the feet.",
        "- Draw the character as ONE natural figure, not a rim around a flat plate: no"
        + " forced border, no badge frame, no plaque.",
      ]
      if (comps.some(c => pyTruthy(c.out))) {
        geom.push(
          "- Where a line gives a width-to-height ratio, that is the ratio of the"
          + " figure itself: keep it, and never stretch or squash the character to fill"
          + " space.")
      }
      if (cols * rows > 1) {
        geom.push(
          "- Hair, tail, cape and anything the character holds come to rest inside the"
          + " box on that line — characters stay inside their own box, never touch each"
          + " other and never touch the image edges.")
        // ⚠️ KHÔNG có vế "the ratio is drawn inside it" ở đây: dòng dáng thường KHÔNG
        // mang tỉ lệ nào, và một mệnh lệnh trỏ vào hư không dạy model rằng prompt nói bừa.
        geom.push("- The box on each line is a hard limit.")
      } else {
        geom.push(
          "- The whole character comes to rest well inside the frame — nothing touches"
          + " the image edges.")
        geom.push("- The box on the element line is a hard limit.")
      }
      section("Geometry", geom, ["mascot"])
    }
  }

  // ── Transparency ────────────────────────────────────────────────────────────
  // KHÔNG GỌI TÊN THỨ MÌNH KHÔNG MUỐN: bản trước gọi tên "CHECKERBOARD" ba lần in
  // hoa để cấm, và cái tên được nhắc đi nhắc lại chính là thứ model vẽ ra.
  if (profile === "ui") {
    section("Transparency", [
      "- The space around and between the elements is simply empty: alpha 0 in the"
      + " PNG, with nothing painted there. Whatever is placed behind this layer later"
      + " will show through those pixels.",
      "- Where something should be see-through — a glass body, the outer halo of a"
      + " light — draw it in its own colour at a lower alpha, so the layer behind shows"
      + " through it naturally. If a region cannot be made translucent, leave it"
      + " unpainted.",
      // GẠCH ĐẦU DÒNG ③ LÀ NHÀ DUY NHẤT CỦA NẤC «TỰ ĐỘNG THEO VẬT LIỆU» (`auto`).
      "- Unless an element's own line below says otherwise, its transparency follows"
      + " its material: glass, ice, water and light effects are see-through, drawn with"
      + " real alpha; every other material — metal, wood, stone, plastic, fabric — is"
      + " fully opaque (alpha 255), solid all the way through.",
    ], ["ui"])
  } else if (profile === "mascot") {
    section("Transparency", [
      "The space around the characters is simply empty: alpha 0 in the PNG, with"
      + " nothing painted there. Each character's own body is solid all the way"
      + " through.",
    ], ["mascot"])
  } else if (keep_alpha) {
    // Tấm nền ĐỤC không nhận section này; lớp nền CÓ vùng trống thì đây là câu quan
    // trọng nhất của cả prompt, và nó phải tả bằng VÍ DỤ.
    section("Transparency", [
      "Wherever the scene shows nothing — the gaps between leaves, the sky behind a"
      + " treeline, the space between foreground props — leave those pixels empty:"
      + " alpha 0 in the PNG, with nothing painted there. Whatever is placed behind this"
      + " layer later shows through those gaps. The scene's own body stays solid.",
    ], ["screen", "background"])
  }

  // ── Text ────────────────────────────────────────────────────────────────────
  // Câu này sinh ra cho một tấm giao diện và gọi tên đúng những thứ của tấm ấy.
  // Trên một lưới nhân vật thì không có cái nút nào để mà để trống — chỉ còn một
  // danh sách danh từ giao diện đọc thẳng vào một tấm không có chúng.
  section("Text", [
    "No letters, no digits, no words of any language anywhere in the image. Faces,"
    + " plates, banners, buttons and screens stay BLANK — text is composited later in the"
    + " game engine.",
  ], ["ui", "background", "screen"])

  // ── Ảnh tham chiếu, gọi theo VAI TRÒ ────────────────────────────────────────
  // KHÔNG CÒN "The FIRST/SECOND attached image": `referenced_image_paths` là danh
  // sách phẳng và thứ tự trong đó không phải hợp đồng với model.
  if (pyTruthy(sh.ref) && (profile === "screen" || profile === "background")) {
    // ẢNH CỦA TẤM NỀN TẢ CẢNH, KHÔNG TẢ NHÂN VẬT.
    section("Scene reference", [
      "The attached SCENE REFERENCE image says WHAT this background shows: take its"
      + " subject, setting, season and mood from it. Re-draw it in the art style above"
      + " and recompose it to fill this canvas — never copy it pixel for pixel, and never"
      + " keep its original framing, borders or empty margins.",
    ], ["screen", "background"])
  } else if (pyTruthy(sh.ref)) {
    section("Character reference", [
      "The attached CHARACTER REFERENCE PHOTO is the character: every character cell"
      + " shows EXACTLY this character — same species, face, colours, costume, materials"
      + " and proportions — re-drawn in the art style above. This outranks everything"
      + " else: if any other reference shows a DIFFERENT character, ignore that one.",
    ], ["mascot"])
  }
  if (pyTruthy(sh.poseRef)) {
    section("Pose reference", [
      "The attached POSE REFERENCE SHEET is a grey mannequin in the SAME grid as this"
      + " sheet: cell k there gives the body pose and camera angle for cell k here. Copy"
      + " pose and camera angle only. NEVER draw the mannequin itself — it is grey and"
      + " faceless on purpose, and none of its plastic look may appear in the result.",
    ], ["mascot"])
  }
  if (pyTruthy(sh.layoutRef)) {
    // ẢNH BỐ CỤC KHÔNG BAO GIỜ ĐI VÀO `sheet.ref`: hai tấm trả lời hai câu khác nhau.
    section("Layout sketch", [
      "The attached LAYOUT SKETCH is a rough composition guide: copy WHERE things sit"
      + " and how much of the frame each area takes; take nothing else from it — not its"
      + " style, colours, line quality or level of finish.",
    ])
  }

  // ── Direction ───────────────────────────────────────────────────────────────
  // `note` là mô tả tấm do khuôn/thư viện sinh ra; `directive` là câu NGƯỜI THIẾT KẾ
  // gõ thêm cho đúng tấm này ở đúng lượt này. Nói RA NGUỒN có chủ ý.
  const directive = strip(pyTruthy(sh.directive) ? sh.directive : "")
  direction = []
  let note = strip(pyTruthy(sh.note) ? sh.note : "")
  // «CÙNG MỘT NHÂN VẬT» NÓI BA LẦN, GIỮ LẠI HAI — bỏ ĐÚNG khi có ảnh nhân vật đính
  // kèm (không có ảnh thì «## Character reference» không in, và đây là nơi duy nhất
  // còn nói điều đó).
  if (note && profile === "mascot" && pyTruthy(sh.ref) && note.includes("SAME character")) note = ""
  if (note) direction.push(note)
  if (directive) direction.push("From the designer: " + directive)
  section("Direction", direction)

  // ── Elements / Scene ────────────────────────────────────────────────────────
  // MỘT DANH SÁCH, KHÔNG PHẢI HAI: danh từ và toạ độ nằm CÙNG MỘT DÒNG. Hộp Ô
  // (`geo[i].cell`) KHÔNG được in: nó là chuyện của dao cắt.
  if (profile === "screen") {
    section("Scene", [comps[0].spec], ["screen"])
  } else {
    // Câu dẫn phải nói đúng thứ danh sách BÊN DƯỚI thật sự mang: contract đời cũ
    // không khai cỡ nào ⇒ không dòng nào có tỉ lệ.
    const co_ti_le = comps.some(c => pyTruthy(c.out))
    const listing = [
      "The list names WHAT each cell is; the art style above decides how it looks;"
      + (co_ti_le
        ? " the core aspect ratio on its line decides its shape."
        : " the geometry rules above decide shape and placement."),
    ]
    // AI QUYẾT LƯỢNG TRANG TRÍ: theme cấp MÔ-TÍP, dòng của ô cấp SỐ LƯỢNG và CHỖ ĐẶT.
    if (profile === "ui") {
      listing.push(
        "Ornament amount and placement are set PER ELEMENT on its line below; the"
        + " theme supplies the motif, not the quantity.")
    }
    // CỠ TRÊN MÀN VẪN Ở LẠI dù hộp pixel đã đi: nó quyết ĐỘ DÀY NÉT và BÁN KÍNH BO.
    if (comps.some(c => pyTruthy(c.out))) {
      listing.push(
        "Each line also says roughly how wide that element sits on screen in the"
        + " finished game. Design every stroke weight, corner radius, bevel and detail"
        + " for that size, then draw it large and crisp — a small button must still"
        + " read as a small button, never as a wide banner with hairline edges.")
    }
    for (let i = 0; i < comps.length; i++) {
      const comp = comps[i]
      const g = geo[i]
      // Ô TRỐNG KHÔNG CÓ DÒNG RIÊNG: «Layout» đã gọi tên chúng, và `spec` của ô
      // trống là chuỗi rỗng nên dòng ấy mở đầu bằng một số không có danh từ theo sau.
      if (g.kind === "empty") continue
      let spec = comp.spec
      const out = pyTruthy(comp.out) ? comp.out : null
      if (g.safe) {
        // HỘP PIXEL RA KHỎI PROMPT, TỈ LỆ Ở LẠI (r-0021: hộp hứa 368px, lõi vẽ 587px).
        const aspect = out ? core_aspect(out) : null
        if (aspect) {
          spec += " — " + aspect
          const ow = pyInt(out.w)
          // GỢI Ý CỠ TRÊN MÀN, BẰNG LỜI, KHÔNG PHẢI MỘT HỘP. Một con số thôi.
          if (ow > 0) spec += `, about ${ow} px wide on screen`
        }
        // ══ HỘP Ô QUAY LẠI, VÀ CHỈ HỘP Ô ══
        // Thứ model không thực hiện được là hộp SAFE ZONE (lời hứa về CỠ LÕI). Hộp Ô
        // là một lời hứa khác hẳn: một RANH GIỚI, và ranh giới thì model giữ
        // (đo: lấn 237px khi không hộp → 113 → 63 khi có hộp).
        // VÀ HỘP ẤY LÀ Ô ĐÃ THỤT VÀO: phần model luôn tràn thêm vài chục px rơi vào
        // lề còn trống của CHÍNH ô mình chứ không sang hàng xóm.
        // ⚠️ NGOÀI `if aspect:` CÓ CHỦ Ý — xem gen.sh ~1104.
        const [cx0, cy0, cx1, cy1] = inner_box(g.cell, pyTruthy(comp.skel) ? comp.skel : {})
        // Một dáng người không có "viền" hay "hoa văn" để mà dặn.
        const thuoc = profile === "mascot"
          ? "this character, hair and props included"
          : "this element, rim and ornaments included"
        spec += ` — its box is x=${cx0}..${cx1}, y=${cy0}..${cy1}`
          + ` (${cx1 - cx0}x${cy1 - cy0} px); everything of ${thuoc},`
          + " stays inside that box"
        // VẾ BỀ NGANG CHO ELEMENT NẰM NGANG (tỉ lệ ≥ 2:1): với banner 3.9:1 thì chiều
        // CAO chẳng bao giờ chạm mép, chỉ bề ngang cãi nhau với ô.
        if (aspect && pyFloat(out.w) >= 2 * pyFloat(out.h)) {
          const thuoc_ngang = profile === "mascot" ? "its hair and props" : "its ornaments"
          spec += `; including ${thuoc_ngang} it is at most`
            + ` ${cx1 - cx0} px wide`
        }
      } else if (g.kind === "full") {
        spec += " — full-bleed scene, fills its whole cell edge to edge"
      }
      listing.push(`${i + 1}) ${spec}`)
    }
    section(profile === "background" ? "Scenes" : "Elements", listing,
      ["ui", "mascot", "background"])
  }

  // ── Output ──────────────────────────────────────────────────────────────────
  if (profile === "screen") {
    section("Output", [
      `Game-ready mobile game background art, ${canvas_ratio}.`,
    ], ["screen"])
  } else {
    section("Output", [
      (n_real > 1 ? `One coherent set: all ${n_real} elements share the same style. ` : "")
      + `Game-ready ${canvas_ratio} PNG with a real alpha channel (background="transparent").`,
    ], ["ui", "mascot", "background"])
  }

  // Bỏ dòng trắng cuối: nó là dấu phân cách GIỮA các section.
  let lines = (sections.length && sections[sections.length - 1] === "")
    ? sections.slice(0, -1) : sections
  // ── NGƯỜI DÙNG TỰ SOẠN TRỌN PROMPT CỦA TẤM ─────────────────────────────────
  // Đã nói "để tôi tự viết" thì phải được viết THẬT. HAI NGOẠI LỆ, và cả hai đều
  // KHÔNG phải cãi lời người dùng: ① «Canvas» (tầng bash đọc ngược khổ giấy từ đó),
  // ② «Direction» (ghi chú và câu chỉ đạo là CHỮ CỦA CHÍNH NGƯỜI DÙNG).
  const override = strip(pyTruthy(sh.promptOverride) ? sh.promptOverride : "")
  if (override) {
    lines = [...sections.slice(0, 2), "", override]
    if (direction.length) lines = [...lines, "", "## Direction", ...direction]
  }
  // ── DÒNG ĐẦU TIÊN CỦA PROMPT LÀ TỪ KHOÁ THAM SỐ ────────────────────────────
  // Đứng TRƯỚC cả «## Canvas». Tấm full-bleed thì không có dòng này — nó xin điều
  // ngược lại. Tầng bash đọc khổ giấy bằng `head -n3` để chừa chỗ cho dòng này.
  if (!full_bleed || keep_alpha) lines = ['background="transparent"', ...lines]

  // ── ẢNH ĐÍNH KÈM: VAI ĐI KÈM ĐƯỜNG DẪN, MỘT LẦN, DÙNG CHO CẢ HAI FILE ───────
  // `.att` là danh sách đường dẫn trần cho `run_one`; `.refs` còn phải nói ẢNH NÀY
  // LÀ VAI GÌ, cho màn xem trước prompt. Tính hai lần là hai chỗ để lệch.
  // Ảnh thương hiệu và ảnh cảm hứng tách HAI vai vì người dùng tải chúng lên ở hai
  // chỗ khác nhau trong bản thiết kế; prompt thì gọi chung là "brand / inspiration".
  const att_roles = []
  const candidates = [
    ...(pyTruthy(sh.ref) ? [["character", sh.ref]] : []),
    ...(pyTruthy(sh.poseRef) ? [["pose", sh.poseRef]] : []),
    ...(pyTruthy(sh.layoutRef) ? [["layout", sh.layoutRef]] : []),
    ...(use_brand_refs ? b.refs.map(q => ["brand", q]) : []),
    ...(use_inspo ? s.inspo.map(q => ["style", q]) : []),
  ]
  for (const [role, p] of candidates) {
    // Một ảnh có thể xuất hiện ở nhiều vai (vd sheet.ref cũng là brand ref); codex
    // tính token theo từng `-i` nên khử trùng lặp ngay lúc dựng argv.
    if (pyTruthy(p) && att_roles.every(([, q]) => p !== q)) att_roles.push([role, p])
  }
  const att = att_roles.map(([, p]) => p)

  return {
    job: `${s.id}-${sh.id}`,
    profile,
    fullBleed: full_bleed,
    keepAlpha: keep_alpha,
    text: lines.join("\n"),
    lines,
    attRoles: att_roles,
    att,
    attText: att.join("\n") + "\n",
    refsText: att_roles.map(([role, p]) => `${role}\t${p}\n`).join(""),
    // DẤU FULL-BLEED CHO TẦNG BASH (`prompts/<job>.fullbleed`): `full_bleed` tính
    // được ở đây nhưng `alpha_verdict` chạy ở bash sau khi codex trả ảnh — hai tầng
    // không nói chuyện được với nhau ngoài đĩa.
    // ⚠️ LỚP NỀN CÓ VÙNG TRỐNG KHÔNG ĐƯỢC ĐÓNG DẤU NÀY: dấu nói "tấm này phải ĐỤC".
    fullBleedMarker: full_bleed && !keep_alpha,
  }
}

/** Dựng prompt cho MỌI job của một cfg (styles.json đã nạp). */
export function buildAll(cfg) {
  return listJobs(cfg).map(({ style, sheet }) => buildPrompt(style, sheet))
}
