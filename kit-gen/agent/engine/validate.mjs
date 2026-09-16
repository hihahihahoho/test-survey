#!/usr/bin/env node
/* validate.mjs — BẢN PORT JS CỦA `validate_output_geometry.py`.
 *
 * Đo thân sheet đã sinh so với safe zone của contract, KHÔNG làm méo tranh.
 *
 * NỀN LÀ ALPHA, KHÔNG PHẢI MÀU. Cả tầng đoán màu nền đã bỏ từ 07/09/2026: sheet nay
 * mang alpha thật, nên "pixel này có phải nền không" có câu trả lời thẳng —
 * `alpha < ngưỡng`. Không đoán màu, không đo viền, không lệch trục.
 *
 * ╔══ ĐÂY LÀ BẢN PORT: HAI CHỖ «SAI» CỦA BẢN PYTHON ĐƯỢC GIỮ NGUYÊN ═══════════╗
 * ║ ① LƯỚI Ô Ở ĐÂY KHÔNG PHẢI LƯỚI CỦA `geometry`. File Python tự tính          ║
 * ║   `round(col*cw) … round((col+1)*cw)`, tức MÉP PHẢI của ô này là mép trái   ║
 * ║   của ô sau; `slice.py` thì lấy `cell_origin + cell_size`, và hai phép ấy   ║
 * ║   lệch nhau tới 1px khi khổ không chia hết. Port nguyên: đổi ở đây là đổi   ║
 * ║   số đo mà agent đang đọc, và việc đó không thuộc bước port.                ║
 * ║ ② SỐ NGUYÊN LẪN SỐ THỰC TRONG CÙNG MỘT KHOÁ. `max(0, errors['left'])` của  ║
 * ║   Python trả `int 0` khi lệch ≤ 0 và `float` khi > 0, nên `undershootPx`    ║
 * ║   ra `{"left": 0, "right": 8.0}` — hai kiểu trong một dict. Bản JS mang     ║
 * ║   nhãn `F()` để ghi ra đúng như vậy.                                       ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { openImage, guessCoreBox, paintCoverage } from "./slice.mjs"
import { F, num, PyFloat, pyDumps, pyLoads, pyRound } from "./pyjson.mjs"

/** α ≥ ngưỡng ⇒ pixel CÓ MỰC. Lấy thấp có chủ ý: quầng glow tan tới α rất nhỏ vẫn
 *  là mực. Vẫn CAO HƠN màn sương α=1..3 mà model phủ lên cả ô. */
export const ALPHA_FG = 24
/** α ≥ ngưỡng ⇒ pixel thuộc LÕI. Cùng con số `slice.py:CORE_ALPHA`. */
export const ALPHA_CORE = 128
/** Cùng con số `slice.py:ASPECT_DEVIATION_THRESHOLD`. */
export const ASPECT_DEVIATION_THRESHOLD = 0.15

/** bbox của pixel có α ≥ `threshold` → `[l, t, r, b]` hoặc null. */
export function bboxAt(image, threshold) {
  let alpha = image.channelA()
  if (threshold > 1) alpha = alpha.threshold(threshold)
  return alpha.getbbox()
}

/** bbox của phần CÓ MỰC. Nền = alpha thấp, không phải một màu nào cả. */
export const bboxForeground = (image, threshold = ALPHA_FG) => bboxAt(image, threshold)

/** bbox của phần mực nằm NGOÀI hộp lõi — đồ trang trí tràn ra. */
function decorationBbox(image, coreBox, threshold = ALPHA_FG) {
  if (coreBox === null) return bboxForeground(image, threshold)
  const w = image.width, h = image.height
  const [l, t, r, b] = coreBox
  let out = null
  for (const band of [[0, 0, w, t], [0, b, w, h], [0, t, l, b], [r, t, w, b]]) {
    if (band[0] >= band[2] || band[1] >= band[3]) continue
    const sub = bboxAt(image.crop(band), threshold)
    if (sub === null) continue
    const box = [sub[0] + band[0], sub[1] + band[1], sub[2] + band[0], sub[3] + band[1]]
    out = out === null ? box
      : [Math.min(out[0], box[0]), Math.min(out[1], box[1]),
        Math.max(out[2], box[2]), Math.max(out[3], box[3])]
  }
  return out
}

function measureCoreDecoration(image) {
  const silhouette = bboxForeground(image)
  const core = bboxAt(image, ALPHA_CORE) ?? silhouette
  return { silhouette, core, decoration: decorationBbox(image, core), measured: silhouette !== null }
}

/**
 * `|(box.w/box.h) / (out.w/out.h) − 1|` → sổ đo, hoặc `value=null` nếu thiếu số.
 * Cố ý CHÉP công thức của `slice.py` thay vì gọi lại: file Python gốc chạy độc lập
 * trong tools/, và hai bên có test riêng canh.
 */
function aspectDeviation(box, out, threshold = ASPECT_DEVIATION_THRESHOLD) {
  let val = null, ba = null, oa = null
  let ow = 0, oh = 0, bw = 0, bh = 0
  try {
    ow = toFloat(get(out, "w")); oh = toFloat(get(out, "h"))
    bw = box[2] - box[0]; bh = box[3] - box[1]
  } catch { ow = oh = bw = bh = 0.0 }
  if (ow > 0 && oh > 0 && bw > 0 && bh > 0) {
    ba = bw / bh; oa = ow / oh
    val = pyRound(Math.abs(ba / oa - 1), 4)
  }
  return new Map([
    ["value", val === null ? null : F(val)],
    ["flagged", val !== null && val > threshold],
    ["threshold", F(threshold)],
    ["coreAspect", ba === null ? null : F(pyRound(ba, 4))],
    ["outAspect", oa === null ? null : F(pyRound(oa, 4))],
    ["metric", "core_aspect"],
  ])
}

/**
 * `{box, coverage}` của thân đoán được, hoặc null.
 *
 * SỐ THEO DÕI, KHÔNG PHẢI CỔNG — `status` của ô không đọc nó. Bản Python nạp
 * `guess_core_box` từ `slice.py` cạnh bên bằng importlib và bọc `try` (vắng thì
 * khoá này là null); bản JS import thẳng, nên nó LUÔN có — đó là khác biệt DUY
 * NHẤT, và nó chỉ xảy ra ở ca bản Python không tìm thấy `slice.py`.
 */
function coreGuess(crop, out, cluster) {
  if (cluster === null || cluster === undefined) return null
  let aspect
  try {
    aspect = toFloat(get(out, "w")) / toFloat(get(out, "h"))
    if (!Number.isFinite(aspect)) return null
  } catch { return null }
  const alpha = crop.channelA()
  const [l, t, r, b] = cluster
  const box = guessCoreBox(alpha, aspect, [l, t, r - l, b - t])
  if (box === null) return null
  const cov = paintCoverage(alpha, box)
  return new Map([["box", box], ["coverage", cov === null ? null : F(pyRound(cov, 4))]])
}

/** `max(0, x)` của Python: kết quả là `int 0` khi x ≤ 0, còn lại là chính x (float). */
const clamp0 = x => (x > 0 ? F(x) : 0)

function oneSidedDeviation(box, expected) {
  const errors = new Map([
    ["left", box[0] - expected[0]], ["top", box[1] - expected[1]],
    ["right", box[2] - expected[2]], ["bottom", box[3] - expected[3]],
  ])
  const undershoot = new Map([
    ["left", clamp0(errors.get("left"))], ["top", clamp0(errors.get("top"))],
    ["right", clamp0(-errors.get("right"))], ["bottom", clamp0(-errors.get("bottom"))],
  ])
  const overflow = new Map([
    ["left", clamp0(-errors.get("left"))], ["top", clamp0(-errors.get("top"))],
    ["right", clamp0(errors.get("right"))], ["bottom", clamp0(errors.get("bottom"))],
  ])
  // `errors` là hiệu int − float ⇒ LUÔN là float trong Python, kể cả khi tròn.
  for (const k of errors.keys()) errors.set(k, F(errors.get(k)))
  return { errors, undershoot, overflow }
}

/** `max(iterable)` của Python: trả về phần tử LỚN NHẤT ĐẦU TIÊN (giữ nguyên kiểu). */
function pyMax(values) {
  let best
  for (const v of values) if (best === undefined || num(v) > num(best)) best = v
  return best
}

const get = (o, k) => (o instanceof Map ? o.get(k) : o?.[k])
function toFloat(v) {
  const n = num(v)
  if (typeof n === "number") return n
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n)
  throw new TypeError("float()")
}

/** Cổng chính — cùng chữ ký, cùng phán quyết với `validate()` của bản Python. */
export function validate(image, contract, job, positionTolerance = 0.08, sizeTolerance = 0.15) {
  const dash = job.indexOf("-")
  const variantId = dash < 0 ? job : job.slice(0, dash)
  const sheetId = dash < 0 ? "" : job.slice(dash + 1)
  void variantId
  const sheets = get(contract, "sheets") ?? []
  const sheet = sheets.find(s => get(s, "id") === sheetId)
  if (sheet === undefined) throw new Error(`unknown sheet: ${sheetId}`)
  const grid = get(sheet, "grid") ?? new Map()
  const cols = Math.max(1, Math.trunc(num(get(grid, "cols") ?? 1)))
  const rows = Math.max(1, Math.trunc(num(get(grid, "rows") ?? 1)))
  const cw = image.width / cols, ch = image.height / rows
  const results = []
  const comps = get(sheet, "components") ?? []
  for (let index = 0; index < comps.length; index++) {
    const component = comps[index]
    const col = index % cols, row = Math.floor(index / cols)
    if (row >= rows) break
    const skel = get(component, "skel") ?? new Map()
    // Ô CỐ Ý BỎ TRỐNG: không có thân để đo — báo 'empty' chứ KHÔNG 'regenerate'.
    if (get(skel, "shape") === "empty") {
      results.push(new Map([
        ["file", get(component, "file") ?? String(index)], ["cell", index],
        ["status", "empty"], ["reasons", []], ["expected", null], ["actual", null],
      ]))
      continue
    }
    const crop = image.crop([pyRound(col * cw), pyRound(row * ch),
      pyRound((col + 1) * cw), pyRound((row + 1) * ch)])
    const measured = measureCoreDecoration(crop)
    const box = measured.core ?? measured.silhouette
    const sw = toFloat(get(skel, "w") ?? 1) * crop.width
    const sh = toFloat(get(skel, "h") ?? 1) * crop.height
    const expected = [(crop.width - sw) / 2, (crop.height - sh) / 2, sw, sh]
    const reasons = []
    let actual = null, dev = null
    if (box === null) {
      reasons.push("missing-body")
    } else {
      const [x0, y0, x1, y1] = box
      actual = [x0, y0, x1 - x0, y1 - y0]
      const target = [expected[0], expected[1], expected[0] + expected[2], expected[1] + expected[3]]
      const { errors, undershoot, overflow } = oneSidedDeviation(box, target)
      if (Math.abs((x0 + x1) / 2 - crop.width / 2) > positionTolerance * crop.width
        || Math.abs((y0 + y1) / 2 - crop.height / 2) > positionTolerance * crop.height) reasons.push("position")
      const capW = Math.max(1, sw), capH = Math.max(1, sh)
      if (num(undershoot.get("left")) > sizeTolerance * capW
        || num(undershoot.get("right")) > sizeTolerance * capW
        || num(undershoot.get("top")) > sizeTolerance * capH
        || num(undershoot.get("bottom")) > sizeTolerance * capH) reasons.push("size")
      dev = new Map([
        ["edgesPx", errors], ["undershootPx", undershoot], ["overflowPx", overflow],
        ["maxEdgePx", pyMax([...undershoot.values()])], ["metric", "core_undershoot"],
      ])
    }
    results.push(new Map([
      ["file", get(component, "file") ?? String(index)], ["cell", index],
      ["status", reasons.length ? "regenerate" : "ok"], ["reasons", reasons],
      ["expected", expected.map(v => F(pyRound(v, 2)))], ["actual", actual],
      ["core", measured.core], ["decoration", measured.decoration],
      ["silhouette", measured.silhouette],
      ["deviation", dev],
      // SỐ THEO DÕI, KHÔNG PHẢI CỔNG: `status` vẫn do `reasons` quyết.
      ["aspectDeviation", box === null ? null : aspectDeviation(box, get(component, "out"))],
      // HỘP THÂN ĐOÁN ĐƯỢC — cùng phép, cùng con số `slice.py` ghi vào manifest.
      ["core_guess", coreGuess(crop, get(component, "out"), box)],
    ]))
  }
  return new Map([
    ["ok", results.every(x => ["ok", "empty"].includes(x.get("status")))],
    ["job", job], ["sheet", sheetId], ["bg_mode", "alpha"], ["cells", results],
  ])
}

/**
 * CLI: `--image <png> --contract <json> --job <id> [--output <json>]`.
 * Exit 0 khi mọi ô `ok`/`empty`, 2 khi có ô đòi sinh lại — y hệt bản Python.
 */
export function main(argv, { write = s => process.stdout.write(s) } = {}) {
  const args = new Map()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") && a.includes("=")) args.set(a.slice(2, a.indexOf("=")), a.slice(a.indexOf("=") + 1))
    else if (a.startsWith("--")) args.set(a.slice(2), argv[++i])
  }
  for (const need of ["image", "contract", "job"]) {
    if (!args.get(need)) { process.stderr.write(`validate: thiếu --${need}\n`); return 2 }
  }
  const image = openImage(args.get("image")).rgba
  const contract = pyLoads(readFileSync(args.get("contract"), "utf8"))
  const result = validate(image, contract, args.get("job"))
  const text = pyDumps(result)
  if (args.get("output")) writeFileSync(args.get("output"), text + "\n")
  write(text + "\n")
  return result.get("ok") ? 0 : 2
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)))
}

export { PyFloat }
