#!/usr/bin/env node
/* slice.mjs — BẢN PORT JS CỦA `slice.py`. CHỈ CẮT. Không tách nền, không đụng
 * alpha của model.
 *
 * ╔══ ĐÂY LÀ BẢN PORT, KHÔNG PHẢI BẢN VIẾT LẠI ═════════════════════════════════╗
 * ║ `slice.py` ở gốc repo là THAM CHIẾU và không được sửa một byte. File này     ║
 * ║ phải ra ĐÚNG TỪNG PIXEL cùng ảnh và ĐÚNG TỪNG CHỮ cùng `kits/manifest.json`  ║
 * ║ + stdout. Nơi nào thấy bản Python có vẻ sai, KHÔNG sửa ở đây: ghi vào báo    ║
 * ║ cáo. Một "cải tiến" lẻ trong lúc port là một khác biệt không ai đo được.     ║
 * ║                                                                             ║
 * ║ Bộ canh: `agent/test/suite-engine-slice.mjs` so với golden do chính          ║
 * ║ `slice.py` + Pillow sinh ra (`agent/test-fixtures/engine-golden-slice/`).    ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * LUẬT (giữ nguyên lời của bản Python):
 *   raw/<style>-<sheet>.png  (RGBA, alpha do model vẽ)
 *       │  ① hộp ô  = geometry.cell_box — CHÍNH XÁC hộp ô, không nới một pixel
 *       │  ② crop   = copy nguyên vùng đó
 *       │  ③ đo     = bbox alpha (chỉ ĐỌC, không sửa pixel) → content/safe
 *       ▼
 *   kits/<style>/<file>.png        canvas = ĐÚNG một ô
 *   kits/<style>/tight/<file>.png  crop về bbox alpha ≥ CONTENT_ALPHA
 *
 * KHÁC BẢN PYTHON ĐÚNG HAI CHỖ, CẢ HAI ĐỀU LÀ HẠ TẦNG CHỨ KHÔNG PHẢI THUẬT TOÁN:
 *   · THƯ MỤC GỐC. `slice.py` neo mọi đường dẫn theo thư mục CHỨA CHÍNH NÓ, vì
 *     `engine.mjs` copy nguyên engine vào project. Bản JS thì nằm trong agent và
 *     KHÔNG được copy đi đâu, nên gốc là `cwd` (hoặc `KITGEN_PROJECT_DIR`) —
 *     `engine.mjs` đã spawn với `cwd = projectDir`, nên argv không phải đổi.
 *   · Ổ KHOÁ. `flock` không có trên Node; xem `acquireManifestLock`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync,
  renameSync, unlinkSync, fsyncSync } from "node:fs"
import { hostname } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import * as geometry from "./geometry.mjs"
import { decode, encode } from "./png.mjs"
import { Rgba } from "./image.mjs"
import { F, num, PyFloat, pyDumps, pyLoads, pyRound, pyPercent, pyRepr, pyStr, pyReprStr } from "./pyjson.mjs"

/* ── HẰNG SỐ: chép nguyên giá trị VÀ nguyên lý do từ slice.py ─────────────── */

/** QA này chỉ là cổng dữ liệu. 15px lớn hơn sàn nhiễu (~6px/mép). */
export const SIZE_DEVIATION_THRESHOLD_PX = 15
/** 0,15 = lệch 15% TỈ LỆ. Ngưỡng tương đối: tỉ lệ không có đơn vị. */
export const ASPECT_DEVIATION_THRESHOLD = 0.15
/** Từ mức này trở lên coi là ĐỤC HẲN — xem `snapSolidAlpha`. */
export const SOLID_ALPHA = 240
/** Ngưỡng đo LÕI (`safe`). Không phải ngưỡng cắt. */
export const CORE_ALPHA = 128
/** SÀN LƯỢNG TỬ của `content`/`tight/`: nền "trong suốt" của model là α=1..3. */
export const CONTENT_ALPHA = 4
/** Ngưỡng «CÓ SƠN» — thấp hơn CORE_ALPHA có chủ ý (mặt kính α≈64 vẫn là thân). */
export const PAINT_ALPHA = 32
/** Dải giữa lấy trung vị: 60% bề rộng/chiều cao cụm. */
export const CORE_BAND = 0.6
/** Hệ số nới mép theo MAD. */
export const CORE_MAD_K = 3.0
/** Sàn nới, px — viền răng cưa của ngưỡng alpha dao động 1–2px. */
export const CORE_EDGE_FLOOR_PX = 2
/** Nhỏ hơn ngần này so với cụm theo MỘT chiều ⇒ ĐOÁN HỎNG. */
export const CORE_MIN_CLUSTER_FRAC = 0.35
/** Lớn hơn ngần này so với cụm theo CẢ HAI chiều ⇒ món không có trang trí. */
export const CORE_WHOLE_CLUSTER_FRAC = 0.97
/** Đường phụ: ngưỡng độ phủ của một cột/hàng. */
export const CORE_COVER_MIN = 0.85
/** …và số cột/hàng hụt liên tiếp thì dừng. */
export const CORE_COVER_GAP = 3
/** Số vòng lặp của đường phụ. */
export const CORE_COVER_ROUNDS = 3
/** Trần chờ ổ khoá manifest (giây). */
export const MANIFEST_LOCK_TIMEOUT = 900.0

/** Khổ mong đợi theo khai báo của sheet — DẪN XUẤT từ `geometry.CANVAS`. */
export const CANVAS = Object.fromEntries(
  Object.entries(geometry.CANVAS).map(([k, v]) => [k, v.slice(0, 2)]))

/* ── TIỆN ÍCH KIỂU PYTHON ────────────────────────────────────────────────── */

class PyTypeError extends Error {}

/** `int(v)` của Python: số thì cắt về 0, chuỗi số thì đọc, còn lại thì NÉM. */
function pyInt(v) {
  const n = num(v)
  if (typeof n === "boolean") return n ? 1 : 0
  if (typeof n === "number") {
    if (!Number.isFinite(n)) throw new PyTypeError("int() của giá trị không hữu hạn")
    return Math.trunc(n)
  }
  if (typeof n === "string" && /^[\s]*[-+]?[0-9]+[\s]*$/.test(n)) return parseInt(n, 10)
  throw new PyTypeError(`int() không nhận ${pyStr(n)}`)
}

/** `float(v)` của Python. */
function pyFloat(v) {
  const n = num(v)
  if (typeof n === "boolean") return n ? 1 : 0
  if (typeof n === "number") return n
  if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n)
  throw new PyTypeError(`float() không nhận ${pyStr(n)}`)
}

/** `.get(k)` dùng được cho cả `Map` (manifest đọc từ đĩa) lẫn object. */
function get(o, k, dflt = undefined) {
  if (o instanceof Map) return o.has(k) ? o.get(k) : dflt
  if (o && typeof o === "object") return k in o ? o[k] : dflt
  return dflt
}
/** Dựng một "dict" giữ đúng thứ tự khoá như Python. */
const M = pairs => new Map(pairs)

/* ── KHỔ ẢNH ─────────────────────────────────────────────────────────────── */

/**
 * Ảnh raw có đúng khổ mà sheet đã khai không? Trả câu lỗi, hoặc `null` nếu đúng.
 *
 * Ngưỡng 10%: đủ rộng cho vài pixel làm tròn của model, đủ chặt để bắt cả ảnh
 * VUÔNG lẫn ảnh lộn hướng. `canvas` là field mới và THẮNG `orient`.
 */
export function orientationError(orient, W, H, canvas = null) {
  if (!H) return `anh cao 0px (${W}x${H})`
  let key = String(canvas || orient || "landscape").toLowerCase()
  if (!(key in CANVAS)) key = "landscape"
  const [wantW, wantH] = CANVAS[key]
  const wantRatio = wantW / wantH
  const gotRatio = W / H
  if (wantRatio * 0.9 <= gotRatio && gotRatio <= wantRatio * 1.1) return null
  return `sheet khai ${key} (${wantW}x${wantH}) nhung anh la ${W}x${H}`
}

/**
 * Ảnh raw → `[RGBA, mode]` với mode ∈ {"alpha", "rgb"}.
 *
 * KHÔNG CÒN CỔNG CHẶN Ở ĐÂY: chặn lúc sinh là việc của gen; cắt thì cứ cắt. Tấm
 * không alpha vẫn ra file, chỉ mang `mode:"rgb"`. TUYỆT ĐỐI KHÔNG TỰ CHẾ ALPHA.
 */
export function readSheet(img) {
  if (!img.bands.includes("A")) return [img.rgba, "rgb"]
  const rgba = img.rgba
  if (rgba.channelA().extrema()[0] >= SOLID_ALPHA) return [rgba, "rgb"]
  return [snapSolidAlpha(rgba), "alpha"]
}

/**
 * α ≥ SOLID_ALPHA ⇒ kéo về 255. THAO TÁC DUY NHẤT còn chạm vào alpha.
 *
 * Model vẽ alpha bằng cọ: thân đặc đo được nằm ở 251–254, không một pixel nào 255.
 * Phép này chỉ TĂNG alpha và chỉ trong dải 240..254, nên không gặm được gì; kính
 * (α≈64–128) và quầng sáng (tan dần từ 0) cách ngưỡng rất xa.
 */
export function snapSolidAlpha(rgba) {
  const a = rgba.channelA()
  const [lo, hi] = a.extrema()
  if (hi < SOLID_ALPHA || lo >= 255) return rgba
  return rgba.putAlpha(a.point(v => (v >= SOLID_ALPHA ? 255 : v)))
}

/* ── ĐO (chỉ đọc pixel, không bao giờ ghi) ───────────────────────────────── */

/** bbox của pixel có α ≥ `threshold` → `[l, t, r, b]` hoặc `null`. */
export function alphaBbox(canvas, threshold = 1) {
  let a = canvas.channelA()
  if (threshold > 1) a = a.threshold(threshold)
  return a.getbbox()
}

const xywh = rect => (rect === null ? null : [rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]])

/**
 * Lệch TỈ LỆ giữa lõi đo được và cỡ người dùng đặt.
 *
 * `|(safe.w/safe.h) / (out.w/out.h) − 1|` — không đơn vị, không phụ thuộc ô to nhỏ.
 * Thiếu bên nào ⇒ `value` là null, `flagged` false: ô không đo được KHÔNG phải ô
 * đạt, và cũng không phải ô hỏng.
 */
export function aspectDeviation(safe, out, threshold = ASPECT_DEVIATION_THRESHOLD) {
  let val = null, sa = null, oa = null
  let ow = 0, oh = 0, sw = 0, sh = 0
  try {
    ow = pyFloat(get(out, "w")); oh = pyFloat(get(out, "h"))
    sw = pyFloat(safe[2]); sh = pyFloat(safe[3])
  } catch { ow = oh = sw = sh = 0.0 }
  if (ow > 0 && oh > 0 && sw > 0 && sh > 0) {
    sa = sw / sh; oa = ow / oh
    val = pyRound(Math.abs(sa / oa - 1), 4)
  }
  return M([
    ["value", val === null ? null : F(val)],
    ["flagged", val !== null && val > threshold],
    ["threshold", F(threshold)],
    ["safeAspect", sa === null ? null : F(pyRound(sa, 4))],
    ["outAspect", oa === null ? null : F(pyRound(oa, 4))],
    ["metric", "core_aspect"],
  ])
}

/**
 * Sổ đo của một ô đã cắt → `{safe, contractSafe, aspectDeviation, sizeDeviation, measured}`.
 *
 * `safe` = bbox của pixel α ≥ CORE_ALPHA trên CẢ Ô — "lõi đo được", hộp mà Figma
 * dựng frame theo. Lệch tính MỘT PHÍA: chỉ phần lõi THIẾU vào trong khung mới là
 * lỗi; lõi tràn ra ngoài khung là trang trí, và trang trí thì được phép tràn.
 */
export function measureCell(canvas, contractSafe, threshold = SIZE_DEVIATION_THRESHOLD_PX, out = null) {
  const rect = alphaBbox(canvas, CORE_ALPHA) ?? alphaBbox(canvas)
  const safe = xywh(rect)
  threshold = pyInt(threshold)
  let edges = null, undershoot = null, overflow = null, maxEdge = null
  if (rect !== null && contractSafe !== null) {
    const [cx, cy, cw, ch] = contractSafe
    const err = [rect[0] - cx, rect[1] - cy, rect[2] - (cx + cw), rect[3] - (cy + ch)]
    edges = M([["left", err[0]], ["top", err[1]], ["right", err[2]], ["bottom", err[3]]])
    undershoot = M([["left", Math.max(0, err[0])], ["top", Math.max(0, err[1])],
      ["right", Math.max(0, -err[2])], ["bottom", Math.max(0, -err[3])]])
    overflow = M([["left", Math.max(0, -err[0])], ["top", Math.max(0, -err[1])],
      ["right", Math.max(0, err[2])], ["bottom", Math.max(0, err[3])]])
    maxEdge = Math.max(...undershoot.values())
  }
  return {
    safe,
    contractSafe: contractSafe === null ? null : [...contractSafe],
    aspectDeviation: aspectDeviation(safe, out),
    sizeDeviation: M([
      ["maxEdgePx", maxEdge],
      ["flagged", maxEdge !== null && maxEdge > threshold],
      ["threshold", threshold],
      ["edgesPx", edges],
      ["undershootPx", undershoot],
      ["overflowPx", overflow],
      ["metric", "safe_undershoot"],
    ]),
    measured: rect !== null,
  }
}

/* ── ĐOÁN HỘP THÂN: MÉP TRUNG VỊ ─────────────────────────────────────────── */
/* Model vẽ CẢ CỤM (thân + holly + tuyết + quầng sáng); `safe` đo đúng cụm ấy.
 * Cạnh thân = TRUNG VỊ của «mép ngoài» lấy trên dải giữa 60%: trang trí thò ra chỉ
 * chiếm THIỂU SỐ cột nên không kéo nổi trung vị, còn thân RỖNG RUỘT thì vẫn có mép
 * ở MỌI cột. Rồi NỚI theo MAD, vì mép CONG không phải mép LỆCH: hình cong ⇒ mép tản
 * đều ⇒ MAD lớn ⇒ nới tới đúng đỉnh; thân phẳng + trang trí ⇒ MAD = 0 ⇒ không nới.
 * CÁI GIÁ, ghi ra chứ không giấu: trang trí trải dọc HẾT một cạnh (mũ tuyết phủ cả
 * bề ngang) là ĐA SỐ, nên nó được tính vào thân. */

/** Kênh alpha → mặt nạ 0/255 của pixel CÓ SƠN (α ≥ PAINT_ALPHA). */
export const paintMask = alpha => alpha.threshold(PAINT_ALPHA)

/**
 * Mỗi lát (cột nếu `vertical`, hàng nếu không) → `[mép nhỏ, mép lớn, số px sơn]`.
 * Lát KHÔNG có sơn thì VẮNG MẶT — «không có sơn» khác «có sơn ở mép 0».
 */
function sliceProfile(mask, lo, hi, across0, across1, vertical) {
  const out = new Map()
  const { width: W, height: H, data } = mask
  for (let i = lo; i < hi; i++) {
    let first = -1, last = -1, painted = 0
    for (let j = across0; j < across1; j++) {
      const x = vertical ? i : j
      const y = vertical ? j : i
      if (x < 0 || x >= W || y < 0 || y >= H) continue     // Pillow đệm 0 ngoài biên
      if (!data[y * W + x]) continue
      if (first < 0) first = j
      last = j
      if (data[y * W + x] === 255) painted++
    }
    if (first < 0) continue
    out.set(i, [first, last, painted])
  }
  return out
}

function median(vals) {
  const s = [...vals].sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n / 2) | 0] : (s[(n / 2 | 0) - 1] + s[(n / 2) | 0]) / 2.0
}

/**
 * Mép thân từ danh sách mép ngoài của từng lát. `outward` = -1 (trên/trái) / +1.
 * Trung vị trước, rồi NỚI tới giá trị ngoài cùng còn nằm trong `MAD_K × MAD`.
 */
function robustEdge(vals, outward) {
  const med = median(vals)
  const mad = median(vals.map(v => Math.abs(v - med)))
  const tol = Math.max(CORE_EDGE_FLOOR_PX, CORE_MAD_K * mad)
  const keep = vals.filter(v => (outward < 0 ? v >= med - tol : v <= med + tol))
  if (!keep.length) return pyRound(med)
  return outward < 0 ? Math.min(...keep) : Math.max(...keep)
}

/** Hộp thân theo mép trung vị → `[x, y, w, h]`, hoặc null nếu dải giữa trống. */
function medianCoreBox(mask, cluster) {
  const [x, y, w, h] = cluster
  const ix = pyRound(w * (1 - CORE_BAND) / 2), iy = pyRound(h * (1 - CORE_BAND) / 2)
  const cols = sliceProfile(mask, x + ix, x + w - ix, y, y + h, true)
  const rows = sliceProfile(mask, y + iy, y + h - iy, x, x + w, false)
  if (!cols.size || !rows.size) return null
  const colV = [...cols.values()], rowV = [...rows.values()]
  const top = robustEdge(colV.map(v => v[0]), -1)
  const bottom = robustEdge(colV.map(v => v[1]), +1)
  const left = robustEdge(rowV.map(v => v[0]), -1)
  const right = robustEdge(rowV.map(v => v[1]), +1)
  if (right <= left || bottom <= top) return null
  return [left, top, right - left + 1, bottom - top + 1]
}

/** Từ `start` đi theo `step`: lát cuối còn đủ độ phủ trước khi hụt liên tiếp. */
function runEdge(profile, start, step, span, loLimit, hiLimit) {
  let edge = null, gap = 0
  let i = Math.trunc(start)
  while (loLimit <= i && i <= hiLimit) {
    const cell = profile.get(i)
    if (cell !== undefined && span > 0 && cell[2] / span >= CORE_COVER_MIN) { edge = i; gap = 0 }
    else { gap += 1; if (gap >= CORE_COVER_GAP) break }
    i += step
  }
  return edge
}

/** ĐƯỜNG PHỤ: quét ĐỘ PHỦ cột/hàng từ tâm ra hai bên. Dùng khi mép trung vị câm. */
function coverageCoreBox(mask, cluster, center) {
  const [x, y, w, h] = cluster
  const [cx, cy] = center
  let hc = h, wc = w
  let left = null, right = null, top = null, bottom = null
  for (let r = 0; r < CORE_COVER_ROUNDS; r++) {
    const y0 = Math.max(y, pyRound(cy - hc / 2)), y1 = Math.min(y + h, pyRound(cy + hc / 2))
    if (y1 <= y0) return null
    const cols = sliceProfile(mask, x, x + w, y0, y1, true)
    left = runEdge(cols, pyRound(cx), -1, y1 - y0, x, x + w - 1)
    right = runEdge(cols, pyRound(cx), +1, y1 - y0, x, x + w - 1)
    if (left === null || right === null || right <= left) return null
    wc = right - left + 1
    const x0 = Math.max(x, pyRound(cx - wc / 2)), x1 = Math.min(x + w, pyRound(cx + wc / 2))
    if (x1 <= x0) return null
    const rows = sliceProfile(mask, y, y + h, x0, x1, false)
    top = runEdge(rows, pyRound(cy), -1, x1 - x0, y, y + h - 1)
    bottom = runEdge(rows, pyRound(cy), +1, x1 - x0, y, y + h - 1)
    if (top === null || bottom === null || bottom <= top) return null
    hc = bottom - top + 1
  }
  return [left, top, right - left + 1, bottom - top + 1]
}

/** Trọng tâm khối lượng của phần CÓ SƠN trong cụm → `[cx, cy]` hoặc null. */
function paintCentroid(mask, cluster) {
  const [x, y, w, h] = cluster
  const cols = sliceProfile(mask, x, x + w, y, y + h, true)
  const rows = sliceProfile(mask, y, y + h, x, x + w, false)
  let tw = 0, th = 0, sx = 0, sy = 0
  for (const [i, v] of cols) { tw += v[2]; sx += i * v[2] }
  for (const [i, v] of rows) { th += v[2]; sy += i * v[2] }
  if (tw <= 0 || th <= 0) return null
  return [sx / tw, sy / th]
}

/**
 * Hộp lớn nhất có tỉ lệ `aspect` NẰM GỌN trong `box`, cùng tâm, kẹp trong `bounds`.
 * «Nằm gọn» chứ không phải «phủ kín» — đây là chỗ phép đoán trả nợ nhiều nhất.
 */
function fitAspect(box, aspect, bounds) {
  const [x, y, w, h] = box
  let nw, nh
  if (w / h > aspect) { nh = h; nw = nh * aspect } else { nw = w; nh = nw / aspect }
  const nx0 = pyRound(x + w / 2.0 - nw / 2.0)
  const ny0 = pyRound(y + h / 2.0 - nh / 2.0)
  nw = pyRound(nw); nh = pyRound(nh)
  const [bx, by, bw, bh] = bounds
  nw = Math.min(nw, bw); nh = Math.min(nh, bh)
  const nx = Math.max(bx, Math.min(nx0, bx + bw - nw))
  const ny = Math.max(by, Math.min(ny0, by + bh - nh))
  return [nx, ny, nw, nh]
}

/**
 * ĐOÁN HỘP THÂN trong một ô → `[x, y, w, h]` (toạ độ ô), hoặc null.
 *
 * null nghĩa là «không đoán được, hạ nguồn cứ dùng cả cụm» — KHÔNG phải «lỗi».
 * Bốn lối rơi về null: không có tỉ lệ; ô không một pixel nào có sơn; hộp < 35% cụm
 * theo một chiều; hộp ≥ 97% cụm theo CẢ HAI chiều.
 */
export function guessCoreBox(alpha, aspect, clusterBox) {
  let a
  try { a = pyFloat(aspect) } catch { return null }
  if (!(a > 0)) return null
  let gx, gy, gw, gh
  try {
    if (clusterBox === null || clusterBox === undefined) return null
    const four = Array.from(clusterBox).slice(0, 4)
    if (four.length < 4) return null                       // Python: ValueError khi unpack
    ;[gx, gy, gw, gh] = four.map(pyInt)
  } catch { return null }
  if (gw <= 0 || gh <= 0) return null

  const mask = paintMask(alpha)
  const paint = mask.getbbox()
  if (paint === null) return null
  // CỤM = HỢP của hộp đã đo (α ≥ 128) và bbox phần CÓ SƠN (α ≥ 32), kẹp trong ô.
  const W = mask.width, H = mask.height
  const x0 = Math.max(0, Math.min(gx, paint[0])), y0 = Math.max(0, Math.min(gy, paint[1]))
  const x1 = Math.min(W, Math.max(gx + gw, paint[2])), y1 = Math.min(H, Math.max(gy + gh, paint[3]))
  if (x1 <= x0 || y1 <= y0) return null
  const cluster = [x0, y0, x1 - x0, y1 - y0]

  let box = medianCoreBox(mask, cluster)
  if (box === null) {
    // Dải giữa câm (hình chỉ có mực ở rìa, kiểu dấu «=»): rơi sang đường phụ.
    // Hai tâm, LẤY HỘP LỚN HƠN — không có cách nào biết trước cái nào đúng.
    const centers = [[cluster[0] + cluster[2] / 2.0, cluster[1] + cluster[3] / 2.0]]
    const centroid = paintCentroid(mask, cluster)
    if (centroid !== null) centers.push(centroid)
    const found = centers.map(c => coverageCoreBox(mask, cluster, c)).filter(b => b !== null)
    if (!found.length) return null
    box = found.reduce((best, b) => (b[2] * b[3] > best[2] * best[3] ? b : best))
  }

  const core = fitAspect(box, a, cluster)
  if (core[2] < CORE_MIN_CLUSTER_FRAC * cluster[2] || core[3] < CORE_MIN_CLUSTER_FRAC * cluster[3]) return null
  if (core[2] >= CORE_WHOLE_CLUSTER_FRAC * cluster[2] && core[3] >= CORE_WHOLE_CLUSTER_FRAC * cluster[3]) return null
  return core
}

/**
 * Tỉ lệ pixel CÓ SƠN trong `box` → 0..1, hoặc null nếu hộp rỗng.
 * Chỉ là SỐ ĐỂ SOI, không phải cổng — `guessCoreBox` không đọc nó.
 */
export function paintCoverage(alpha, box) {
  let x, y, w, h
  try {
    if (box === null || box === undefined) return null
    const four = Array.from(box).slice(0, 4)
    if (four.length < 4) return null
    ;[x, y, w, h] = four.map(pyInt)
  } catch { return null }
  if (w <= 0 || h <= 0) return null
  const crop = paintMask(alpha).crop([x, y, x + w, y + h])
  return crop.countOf(255) / (w * h)
}

/* ── CLI: tham số ────────────────────────────────────────────────────────── */

/** Tách argv thành `[tập style, tập sheet|null]`. Không có cờ = hành vi cũ y nguyên. */
export function parseCli(argv) {
  const styles = new Set(), sheets = new Set()
  for (const a of argv) {
    if (a.startsWith("--sheet=")) sheets.add(a.slice("--sheet=".length).trim())
    else if (a.startsWith("--sheets=")) {
      for (const s of a.slice("--sheets=".length).split(",")) if (s.trim()) sheets.add(s.trim())
    } else if (a.startsWith("-")) {
      throw new SystemExit(`slice.py: tham số lạ ${pyReprStr(a)} (chỉ có --sheet= / --sheets=)`)
    } else styles.add(a)
  }
  return [styles, sheets.size ? sheets : null]
}

/** `SystemExit` của Python: in `message` ra stderr rồi thoát 1. */
export class SystemExit extends Error {}

/* ── Ổ KHOÁ + GHI NGUYÊN TỬ cho kits/manifest.json ───────────────────────── */
/* ╔══ VÌ SAO KHÔNG PHẢI `flock` ════════════════════════════════════════════════╗
 * ║ Node không có `flock` trong stdlib. Bản Python giữ khoá bằng `flock`/`msvcrt`║
 * ║ — khoá THEO TIẾN TRÌNH, hệ điều hành tự nhả khi tiến trình chết, và file    ║
 * ║ `.manifest.lock` thì Ở LẠI trên đĩa vĩnh viễn (nó chỉ là chỗ đeo khoá).      ║
 * ║                                                                             ║
 * ║ Bản JS dùng `open(..., "wx")` = O_CREAT|O_EXCL: chính SỰ TỒN TẠI của file là ║
 * ║ khoá. Hai hệ quả phải xử, và cả hai đều đã xử:                              ║
 * ║  ① KHÔNG ĐƯỢC dùng lại tên `.manifest.lock`: bản Python để lại file ấy sau  ║
 * ║    mọi lượt, nên O_EXCL trên nó sẽ hỏng VĨNH VIỄN ở bất kỳ project nào từng ║
 * ║    chạy engine Python. Tên riêng: `.manifest.node.lock`.                    ║
 * ║  ② KHOÁ MA. Tiến trình chết giữa chừng thì file ở lại và không ai nhả. Nên  ║
 * ║    file mang PID + thời điểm: chủ cũ không còn sống (`kill(pid, 0)` ném      ║
 * ║    ESRCH) hoặc khoá quá hạn ⇒ coi là ma, xoá rồi giành lại.                 ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝ */

const LOCK_NAME = ".manifest.node.lock"
/* TUỔI THỌ của một ổ khoá ma — CỐ ĐỊNH, không lấy theo `timeout` của người gọi.
   Lấy theo người gọi thì một lượt "chờ 0,2 giây rồi bỏ cuộc" sẽ coi ổ khoá vừa
   đặt 0,2 giây trước là ma và CƯỚP nó — đúng cái mà ổ khoá sinh ra để chặn. */
const LOCK_STALE_MS = MANIFEST_LOCK_TIMEOUT * 1000

function lockIsStale(path, timeoutMs) {
  let info
  try { info = JSON.parse(readFileSync(path, "utf8")) } catch { return true }
  if (!info || typeof info.pid !== "number") return true
  if (Date.now() - (info.at ?? 0) > timeoutMs) return true
  if (info.host !== hostTag()) return false            // máy khác ⇒ không dám phán
  try { process.kill(info.pid, 0); return false } catch (e) { return e.code === "ESRCH" }
}

let HOST = null
function hostTag() {
  if (HOST === null) { try { HOST = hostname() } catch { HOST = "" } }
  return HOST
}

/**
 * Giữ khoá tới khi tiến trình thoát. Trả handle (có `release()`), hoặc ném
 * `SystemExit` khi chờ quá `timeout` giây.
 */
export function acquireManifestLock(kitsDir, timeout = MANIFEST_LOCK_TIMEOUT, pollMs = 50) {
  mkdirSync(kitsDir, { recursive: true })
  const path = join(kitsDir, LOCK_NAME)
  const deadline = Date.now() + timeout * 1000
  const body = JSON.stringify({ pid: process.pid, at: Date.now(), host: hostTag() })
  for (;;) {
    try {
      const fd = openSync(path, "wx", 0o644)
      writeFileSync(fd, body)
      closeSync(fd)
      const handle = { path, release() { try { unlinkSync(path) } catch { /* đã mất */ } } }
      process.on("exit", handle.release)
      return handle
    } catch (e) {
      if (e.code !== "EEXIST") throw e
      if (lockIsStale(path, LOCK_STALE_MS)) { try { unlinkSync(path) } catch { /* đua */ } continue }
      if (Date.now() >= deadline) {
        throw new SystemExit("slice.py: chờ quá lâu ổ khoá kits/manifest.json — "
          + "còn một lượt cắt khác đang chạy trong cùng thư mục")
      }
      sleepSync(pollMs)
    }
  }
}

/** Ngủ ĐỒNG BỘ: cả lượt cắt là một khối tuần tự, không có event loop để nhường. */
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, ms)
}

/** Ghi manifest NGUYÊN TỬ: người đọc thấy bản cũ trọn vẹn hoặc bản mới trọn vẹn. */
export function dumpManifest(mpath, manifest) {
  const tmp = mpath + ".tmp"
  const fd = openSync(tmp, "w", 0o644)
  try {
    writeFileSync(fd, pyDumps(manifest, 2))
    fsyncSync(fd)
  } finally { closeSync(fd) }
  renameSync(tmp, mpath)
}

/* ── TỔNG HỢP QA ─────────────────────────────────────────────────────────── */

const isNum = v => (v instanceof PyFloat) || (typeof v === "number" && Number.isFinite(v))

/** Tổng hợp QA thuần dữ liệu; tuyệt đối không kích hoạt gen lại. */
export function summarizeSizeDeviation(assets, threshold = SIZE_DEVIATION_THRESHOLD_PX, styleId = null) {
  let measured = 0
  const flaggedAssets = []
  let worst = null
  for (const asset of assets ?? []) {
    const qa = get(asset, "sizeDeviation") || M([])
    const maxEdge = get(qa, "maxEdgePx")
    if (!isNum(maxEdge)) continue
    measured += 1
    worst = Math.max(Math.abs(num(maxEdge)), worst ?? 0)
    if (get(qa, "flagged")) {
      flaggedAssets.push(M([
        ["style", styleId !== null ? styleId : get(asset, "_style") ?? null],
        ["file", get(asset, "file") ?? null],
        ["maxEdgePx", maxEdge],
      ]))
    }
  }
  return M([
    ["threshold", pyInt(threshold)],
    ["measured", measured],
    ["flagged", flaggedAssets.length > 0],
    ["flaggedCount", flaggedAssets.length],
    ["maxEdgePx", worst],
    ["flaggedAssets", flaggedAssets],
  ])
}

/** Tổng hợp lệch TỈ LỆ. CÙNG HÌNH DẠNG với khối trên có chủ ý. */
export function summarizeAspectDeviation(assets, threshold = ASPECT_DEVIATION_THRESHOLD, styleId = null) {
  let measured = 0
  const flaggedAssets = []
  let worst = null
  for (const asset of assets ?? []) {
    const qa = get(asset, "aspectDeviation") || M([])
    const val = get(qa, "value")
    if (!isNum(val)) continue
    measured += 1
    worst = Math.max(Math.abs(num(val)), worst ?? 0)
    if (get(qa, "flagged")) {
      flaggedAssets.push(M([
        ["style", styleId !== null ? styleId : get(asset, "_style") ?? null],
        ["file", get(asset, "file") ?? null],
        ["value", val],
      ]))
    }
  }
  return M([
    ["threshold", F(threshold)],
    ["measured", measured],
    ["flagged", flaggedAssets.length > 0],
    ["flaggedCount", flaggedAssets.length],
    ["maxValue", worst === null ? null : F(worst)],
    ["flaggedAssets", flaggedAssets],
  ])
}

/** QA toàn manifest, chỉ chứa ID asset + số; không chứa đường dẫn máy. */
export function summarizeManifestQa(manifest, threshold = SIZE_DEVIATION_THRESHOLD_PX) {
  const all = []
  const styles = get(manifest, "styles") || M([])
  for (const [styleId, entry] of (styles instanceof Map ? styles : new Map(Object.entries(styles)))) {
    for (const asset of get(entry, "assets") || []) {
      const copy = asset instanceof Map ? new Map(asset) : new Map(Object.entries(asset))
      copy.set("_style", styleId)
      all.push(copy)
    }
  }
  return M([
    ["sizeDeviation", summarizeSizeDeviation(all, threshold)],
    ["aspectDeviation", summarizeAspectDeviation(all)],
  ])
}

/* ── ĐỌC/GHI ẢNH ─────────────────────────────────────────────────────────── */

/** `Image.open(path)` — trả `{rgba, bands, width, height}`. */
export function openImage(path) {
  const d = decode(readFileSync(path))
  return { rgba: new Rgba(d.width, d.height, d.data), bands: d.bands, width: d.width, height: d.height }
}

/** `im.save(path)` cho ảnh RGBA. */
export function saveImage(rgba, path) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, encode(rgba, { channels: 4 }))
}

/* ── THÂN CHƯƠNG TRÌNH ───────────────────────────────────────────────────── */

/**
 * Một lượt cắt. `root` = thư mục project (nơi có `styles.json`, `raw/`, `kits/`).
 * `write` nhận từng dòng stdout — mặc định là `process.stdout`.
 * Trả về `{code}`; `code !== 0` là lỗi đã in ra `err`.
 */
export function runSlice(argv = [], { root = defaultRoot(), write = s => process.stdout.write(s),
  err = s => process.stderr.write(s) } = {}) {
  const say = line => write(line + "\n")
  let cfg, ONLY, ONLY_SHEETS, lock = null
  try {
    // Thứ tự có Ý NGHĨA: `slice.py` nạp styles.json ở THÂN MODULE, tức TRƯỚC khi
    // `parse_cli` chạy. Một argv sai trên một styles.json hỏng thì bản Python báo
    // lỗi styles.json trước, và bản này phải báo đúng cái đó.
    cfg = pyLoads(readFileSync(join(root, "styles.json"), "utf8"))
    for (const sh of get(cfg, "sheets") ?? []) {
      const grid = get(sh, "grid")
      const n = num(get(grid, "cols")) * num(get(grid, "rows"))
      if ((get(sh, "components") ?? []).length !== n) {
        throw new Error(`AssertionError: sheet ${get(sh, "id")}: component phải khớp lưới`)
      }
    }
    ;[ONLY, ONLY_SHEETS] = parseCli(argv)
  } catch (e) {
    err((e instanceof SystemExit ? e.message : String(e?.message ?? e)) + "\n")
    return { code: 1 }
  }

  const kitsDir = join(root, "kits")
  const mpath = join(kitsDir, "manifest.json")
  try {
    // Khoá TRƯỚC khi đọc: mọi lượt slice trong cùng project xếp hàng.
    lock = acquireManifestLock(kitsDir)
  } catch (e) {
    err((e instanceof SystemExit ? e.message : String(e?.message ?? e)) + "\n")
    return { code: 1 }
  }

  try {
    const manifest = existsSync(mpath) ? pyLoads(readFileSync(mpath, "utf8")) : M([["styles", M([])]])
    if (!manifest.has("schemaVersion")) manifest.set("schemaVersion", 2)
    if (!manifest.has("styles")) manifest.set("styles", M([]))
    const mstyles = manifest.get("styles")

    for (const style of get(cfg, "styles") ?? []) {
      const sid = get(style, "id")
      if (ONLY.size && !ONLY.has(sid)) continue
      let qaThreshold
      try { qaThreshold = pyInt(get(style, "sizeDeviationThreshold", SIZE_DEVIATION_THRESHOLD_PX)) }
      catch { qaThreshold = SIZE_DEVIATION_THRESHOLD_PX }
      const outDir = join(kitsDir, sid)
      const entry = M([["sheets", M([])], ["assets", []], ["empty_cells", []]])
      const doneSheets = new Set()

      for (const sh of get(cfg, "sheets") ?? []) {
        const shStyles = get(sh, "styles")
        if (shStyles && shStyles.length && !shStyles.includes(sid)) continue
        const shId = get(sh, "id")
        if (ONLY_SHEETS && !ONLY_SHEETS.has(shId)) continue
        const job = `${sid}-${shId}`
        const srcPath = join(root, "raw", `${job}.png`)
        if (!existsSync(srcPath)) { say(`⚠ bỏ qua ${job}: chưa có raw/${job}.png`); continue }

        const grid = get(sh, "grid")
        const COLS = num(get(grid, "cols")), ROWS = num(get(grid, "rows"))
        const rawImg = openImage(srcPath)
        const W = rawImg.width, H = rawImg.height

        // ── KHỔ SHEET PHẢI ĐÚNG HƯỚNG ĐÃ KHAI ──────────────────────────────
        const orientErr = orientationError(get(sh, "orient"), W, H, get(sh, "canvas"))
        if (orientErr) {
          say(`⚠ bỏ qua ${job}: ${orientErr}. Cắt lưới ${COLS}x${ROWS} trên khổ `
            + "sai sẽ ra ô méo — sinh lại sheet này thay vì dùng ảnh hiện có.")
          continue
        }

        const [CW, CH] = geometry.cell_size(W, H, COLS, ROWS)
        const [sheetImg, mode] = readSheet(rawImg)
        if (mode === "rgb") {
          say(`  ⚠ ${job}: ảnh KHÔNG có nền trong suốt (mode rgb). Vẫn cắt `
            + `nguyên, KHÔNG tự chế alpha — manifest ghi mode:"rgb" để web `
            + "báo cho người dùng biết mà sinh lại.")
        }

        mkdirSync(outDir, { recursive: true })
        let nOk = 0
        const comps = get(sh, "components") ?? []
        for (let idx = 0; idx < comps.length; idx++) {
          const comp = comps[idx]
          const sk = get(comp, "skel")
          if (get(sk, "shape") === "empty") continue           // ô đệm cố ý bỏ trống
          const file = get(comp, "file")

          // ① HỘP Ô, KHÔNG NỚI MỘT PIXEL.
          const [cx0, cy0] = geometry.cell_origin(W, H, COLS, ROWS, idx)
          const canvas = sheetImg.crop([cx0, cy0, cx0 + CW, cy0 + CH])

          // ② KHUNG HỢP ĐỒNG. Ô full-bleed không có khung nào để hứa ⇒ khung = cả ô.
          let contractSafe
          if (get(sk, "shape") === "full") contractSafe = [0, 0, CW, CH]
          else contractSafe = geometry.safe_offset_in_cell(CW, CH, skelPlain(sk))

          // ③ ĐO. Không một dòng nào dưới đây ghi vào pixel.
          let contentBox = alphaBbox(canvas, CONTENT_ALPHA)
          const hazeOnly = contentBox === null
          if (hazeOnly) contentBox = alphaBbox(canvas)
          if (contentBox === null) {
            entry.get("empty_cells").push(file)
            say(`  · ${sid}/${file}: ô TRỐNG (không pixel nào có alpha)`)
            continue
          }
          if (hazeOnly) {
            say(`  ⚠ ${sid}/${file}: cả ô không có pixel nào α ≥ `
              + `${CONTENT_ALPHA} — chỉ là sương mờ. Vẫn cắt nguyên, nhưng `
              + "lượt vẽ này gần như trống.")
          }
          const ledger = measureCell(canvas, contractSafe, qaThreshold, get(comp, "out"))
          const ad = ledger.aspectDeviation
          if (ad.get("flagged")) {
            say(`  ⚠ QA ${sid}/${file}: aspectDeviation `
              + `${pyPercent(num(ad.get("value")))} > `
              + `${pyPercent(ASPECT_DEVIATION_THRESHOLD)} `
              + `(lõi ${pyStr(ad.get("safeAspect"))}:1 vs `
              + `hứa ${pyStr(ad.get("outAspect"))}:1)`)
          }
          if (ledger.sizeDeviation.get("flagged")) {
            say(`  ⚠ QA ${sid}/${file}: sizeDeviation `
              + `max ${pyStr(ledger.sizeDeviation.get("maxEdgePx"))}px > ${qaThreshold}px `
              + "(chỉ gắn cờ, không tự gen lại)")
          }

          saveImage(canvas, join(outDir, `${file}.png`))
          const ox = contentBox[0], oy = contentBox[1]
          const pw = contentBox[2] - contentBox[0]
          const ph = contentBox[3] - contentBox[1]
          // tight/ = cùng ảnh, cắt về đúng bbox alpha ≥ CONTENT_ALPHA.
          saveImage(canvas.crop(contentBox), join(outDir, "tight", `${file}.png`))

          const asset = M([
            ["file", file + ".png"], ["sheet", shId], ["mode", mode],
            ["canvas", [CW, CH]], ["cell", [CW, CH]], ["bleed", [0, 0]],
            ["content", [pw, ph]], ["content_at", [ox, oy]],
            ["safe", ledger.safe ?? contractSafe],
            ["contractSafe", contractSafe],
            ["sizeDeviation", ledger.sizeDeviation],
            ["aspectDeviation", ad],
          ])
          // CỠ ĐẦU RA CHỈ ĐI QUA, KHÔNG THAM GIA CẮT.
          const out = get(comp, "out")
          if (isDict(out) && truthy(get(out, "w")) && truthy(get(out, "h"))) {
            asset.set("outSize", [pyInt(get(out, "w")), pyInt(get(out, "h"))])
            if (truthy(get(comp, "drawScale"))) asset.set("drawScale", F(pyFloat(get(comp, "drawScale"))))
          }

          // ④ ĐOÁN THÂN. Cũng chỉ ĐỌC pixel.
          let coreAspect = null
          if (isDict(out) && truthy(get(out, "w")) && truthy(get(out, "h"))) {
            try {
              coreAspect = pyFloat(get(out, "w")) / pyFloat(get(out, "h"))
              if (!Number.isFinite(coreAspect)) coreAspect = null
            } catch { coreAspect = null }
          }
          const coreBox = guessCoreBox(canvas.channelA(), coreAspect, ledger.safe ?? contractSafe)
          if (coreBox !== null) {
            asset.set("coreBox", coreBox)
            const cov = paintCoverage(canvas.channelA(), coreBox)
            if (cov !== null) asset.set("coreCoverage", F(pyRound(cov, 4)))
          }
          entry.get("assets").push(asset)
          nOk += 1
        }

        entry.get("sheets").set(shId, M([
          ["mode", mode], ["canvas", [CW, CH]], ["cell", [CW, CH]],
          ["bleed", [0, 0]], ["size", [W, H]], ["cut", nOk],
        ]))
        doneSheets.add(shId)
        say(`✓ ${job}: ${nOk}/${comps.length} ô (canvas = ô ${CW}x${CH}), ${mode}`)
      }

      // ── GEN LẠI MỘT NHÓM: giữ phần sheet KHÔNG chạy lượt này ───────────────
      const prev = mstyles.get(sid) || M([])
      const prevSheets = get(prev, "sheets") || M([])
      const keepSheets = [...(prevSheets instanceof Map ? prevSheets.keys()
        : Object.keys(prevSheets))].filter(k => !doneSheets.has(k))
      if (keepSheets.length) {
        const doneFiles = new Set()
        for (const sh of get(cfg, "sheets") ?? []) {
          if (!doneSheets.has(get(sh, "id"))) continue
          for (const c of get(sh, "components") ?? []) doneFiles.add(get(c, "file"))
        }
        for (const k of keepSheets) entry.get("sheets").set(k, get(prevSheets, k))
        for (const a of get(prev, "assets") || []) {
          if (!keepSheets.includes(get(a, "sheet")) || doneFiles.has(String(get(a, "file") ?? "").slice(0, -4))) continue
          entry.get("assets").push(a)
        }
        for (const f of get(prev, "empty_cells") || []) {
          if (!doneFiles.has(f) && !entry.get("empty_cells").includes(f)) entry.get("empty_cells").push(f)
        }
        say(`  ↺ ${sid}: giữ nguyên ${keepSheets.length} sheet không chạy lượt này `
          + `(${keepSheets.join(", ")})`)
      }

      entry.set("qa", M([
        ["sizeDeviation", summarizeSizeDeviation(entry.get("assets"), qaThreshold, sid)],
        ["aspectDeviation", summarizeAspectDeviation(entry.get("assets"), ASPECT_DEVIATION_THRESHOLD, sid)],
      ]))
      mstyles.set(sid, entry)
      const total = entry.get("assets").length
      let want = 0
      for (const sh of get(cfg, "sheets") ?? []) {
        if (!doneSheets.has(get(sh, "id"))) continue
        for (const c of get(sh, "components") ?? []) if (get(get(c, "skel"), "shape") !== "empty") want += 1
      }
      for (const a of entry.get("assets")) if (!doneSheets.has(get(a, "sheet"))) want += 1
      say(`— ${sid}: ${total}/${want} asset`
        + (entry.get("empty_cells").length ? `, Ô TRỐNG: ${pyStr(entry.get("empty_cells"))}` : ""))
      const qsize = entry.get("qa").get("sizeDeviation")
      if (qsize.get("flagged")) {
        say(`  ⚠ QA summary ${sid}: ${qsize.get("flaggedCount")} ô vượt ${qsize.get("threshold")}px `
          + "(chỉ dữ liệu; người dùng tự quyết gen lại)")
      }
    }

    manifest.set("qa", summarizeManifestQa(manifest))
    const q = manifest.get("qa").get("sizeDeviation")
    say(`— QA sizeDeviation: ${q.get("flaggedCount")} flagged / ${q.get("measured")} measured, `
      + `threshold ${q.get("threshold")}px (không auto-regen)`)
    const a = manifest.get("qa").get("aspectDeviation")
    say(`— QA aspectDeviation: ${a.get("flaggedCount")} flagged / ${a.get("measured")} measured, `
      + `threshold ${pyPercent(num(a.get("threshold")))} (không auto-regen)`)
    dumpManifest(mpath, manifest)
    say("→ kits/manifest.json")
    return { code: 0 }
  } finally {
    lock?.release()
  }
}

/** `skel` có thể là Map (đọc từ JSON) — `geometry.mjs` chờ một object thường. */
function skelPlain(sk) {
  if (sk instanceof Map) return Object.fromEntries(sk)
  return sk ?? {}
}
const isDict = v => v instanceof Map || (v !== null && typeof v === "object" && !Array.isArray(v))
/** `if out.get("w")` của Python: 0 / "" / None đều là giả. */
const truthy = v => { const n = num(v); return !(n === undefined || n === null || n === 0 || n === "" || n === false) }

/** Thư mục project: `slice.py` neo theo thư mục chứa script, bản JS neo theo cwd. */
export function defaultRoot() {
  return process.env.KITGEN_PROJECT_DIR || process.cwd()
}

/* ── chạy trực tiếp: `node agent/engine/slice.mjs [<style>…] [--sheet=…]` ── */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { code } = runSlice(process.argv.slice(2))
  process.exit(code)
}
