/* png.mjs — CODEC PNG THUẦN JS, KHÔNG PHỤ THUỘC NGOÀI, CHỈ `node:zlib`.
 *
 * VÌ SAO FILE NÀY TỒN TẠI
 * ─────────────────────────────────────────────────────────────────────────────
 * Engine đời cũ cắt ảnh bằng `slice.py` + Pillow, nên máy người dùng phải có
 * Python, venv, pip và ~30 MB thư viện ảnh. Quyết định 16/09/2026: port cả engine
 * sang JS chạy trên Node của agent. Node stdlib không đọc được PNG, nên nó phải
 * nằm ở đây.
 *
 * LUẬT CỦA FILE NÀY: **SOI GƯƠNG PILLOW, KHÔNG SOI GƯƠNG ĐẶC TẢ PNG.**
 * Đầu ra của `decode()` phải bằng ĐÚNG TỪNG BYTE với `Image.open(f).convert("RGBA")`
 * của Pillow — kể cả ở những chỗ Pillow làm khác đặc tả. Bốn chỗ ấy đã ĐO trên
 * Pillow 11.3.0 (xem `agent/test-fixtures/engine-golden-png/`), và nếu ai đó "sửa
 * cho đúng chuẩn" thì ảnh cắt ra sẽ lệch khỏi bản Python mà không một test nào của
 * PNG bắt được:
 *
 *   ① GRAYSCALE 16-BIT bị KẸP (clip) chứ không dịch bit. Pillow nạp nó thành mode
 *      `I;16`, và `I → RGB` trong Pillow là `v<0?0 : v>255?255 : v` — nên
 *      α-16bit 256 ra 255, 32768 ra 255, còn 1 vẫn là 1. MỌI loại 16-bit KHÁC
 *      (RGB, LA, RGBA) thì DỊCH 8 bit (`v >> 8`, tức lấy byte cao).
 *   ② GRAY+ALPHA 16-BIT nạp thẳng thành mode `RGBA` (không phải `LA`), nên nó CÓ
 *      kênh alpha theo nghĩa `getbands()` — thứ `slice.py:read_sheet` hỏi.
 *   ③ tRNS được so với giá trị ĐÃ QUY VỀ 8 BIT, còn bản thân tRNS là số 16-bit thô.
 *      Hệ quả đo được: ảnh gray 4-bit với `tRNS=8` KHÔNG có pixel nào trong suốt
 *      (mẫu 8 nạp thành 136, không khớp 8); ảnh gray 1-bit với `tRNS=0` thì có.
 *      Và tRNS bị BỎ QUA hoàn toàn với mọi ảnh 16-bit.
 *   ④ Ảnh PALETTE có tRNS vẫn KHÔNG có band "A" (`getbands() == ("P",)`). Đây là
 *      lý do `slice.py` gắn nhãn `mode:"rgb"` cho một tấm palette trong suốt —
 *      hành vi của bản Python, được giữ nguyên (xem báo cáo bước ②).
 */
import { inflateSync, deflateSync } from "node:zlib"

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Số kênh mẫu của mỗi color type. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** Adam7: [xStart, yStart, xStep, yStep] của bảy lượt quét. */
const ADAM7 = [
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
  [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
]

export class PngError extends Error {}

/* ── ĐỌC CHUNK ────────────────────────────────────────────────────────────── */

function readChunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new PngError("không phải file PNG (thiếu chữ ký)")
  const out = []
  let p = 8
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString("latin1", p + 4, p + 8)
    const dataStart = p + 8
    const dataEnd = dataStart + len
    if (dataEnd + 4 > buf.length) throw new PngError(`chunk ${type} cụt`)
    out.push({ type, data: buf.subarray(dataStart, dataEnd) })
    p = dataEnd + 4
    if (type === "IEND") break
  }
  return out
}

/* ── BỎ FILTER ────────────────────────────────────────────────────────────── */

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Bỏ filter cho một khối scanline liên tục. Trả về Uint8Array `h * stride`. */
function unfilter(src, offset, width, height, bpp, stride) {
  const out = new Uint8Array(height * stride)
  let sp = offset
  for (let y = 0; y < height; y++) {
    const ft = src[sp++]
    const row = y * stride
    const prev = row - stride
    for (let i = 0; i < stride; i++) {
      const raw = src[sp + i]
      const a = i >= bpp ? out[row + i - bpp] : 0
      const b = y > 0 ? out[prev + i] : 0
      const c = (y > 0 && i >= bpp) ? out[prev + i - bpp] : 0
      let v
      switch (ft) {
        case 0: v = raw; break
        case 1: v = raw + a; break
        case 2: v = raw + b; break
        case 3: v = raw + ((a + b) >> 1); break
        case 4: v = raw + paeth(a, b, c); break
        default: throw new PngError(`filter lạ ${ft} ở dòng ${y}`)
      }
      out[row + i] = v & 0xff
    }
    sp += stride
  }
  return { out, next: sp }
}

/* ── ĐỌC MẪU THEO BIT DEPTH ───────────────────────────────────────────────── */

/** Mẫu thứ `i` của một dòng đã bỏ filter, trả về giá trị THÔ (chưa quy về 8 bit). */
function sampleReader(rowBuf, rowOff, depth) {
  if (depth === 8) return i => rowBuf[rowOff + i]
  if (depth === 16) return i => (rowBuf[rowOff + i * 2] << 8) | rowBuf[rowOff + i * 2 + 1]
  const per = 8 / depth
  const mask = (1 << depth) - 1
  return i => {
    const byte = rowBuf[rowOff + ((i / per) | 0)]
    const shift = 8 - depth * ((i % per) + 1)
    return (byte >> shift) & mask
  }
}

/* ── GIẢI MÃ ──────────────────────────────────────────────────────────────── */

/**
 * PNG → ``{ width, height, data (RGBA8), bands, mode }``.
 *
 * `data` là ĐÚNG thứ `Image.open(f).convert("RGBA")` của Pillow trả về;
 * `bands` là `im.getbands()` TRƯỚC khi convert (`slice.py:read_sheet` hỏi
 * `"A" not in img.getbands()`), `mode` là `im.mode`.
 */
export function decode(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf)
  const chunks = readChunks(buf)
  const ihdr = chunks.find(c => c.type === "IHDR")
  if (!ihdr || ihdr.data.length < 13) throw new PngError("thiếu IHDR")
  const width = ihdr.data.readUInt32BE(0)
  const height = ihdr.data.readUInt32BE(4)
  const depth = ihdr.data[8]
  const ctype = ihdr.data[9]
  const compression = ihdr.data[10]
  const filterMethod = ihdr.data[11]
  const interlace = ihdr.data[12]
  if (!width || !height) throw new PngError(`khổ ảnh vô nghĩa ${width}x${height}`)
  if (compression !== 0) throw new PngError(`nén lạ ${compression}`)
  if (filterMethod !== 0) throw new PngError(`filter method lạ ${filterMethod}`)
  if (interlace !== 0 && interlace !== 1) throw new PngError(`interlace lạ ${interlace}`)
  const nch = CHANNELS[ctype]
  if (!nch) throw new PngError(`color type lạ ${ctype}`)
  const okDepth = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[ctype]
  if (!okDepth.includes(depth)) throw new PngError(`bit depth ${depth} không hợp với color type ${ctype}`)

  let palette = null, trns = null
  const idat = []
  for (const c of chunks) {
    if (c.type === "PLTE") palette = c.data
    else if (c.type === "tRNS") trns = c.data
    else if (c.type === "IDAT") idat.push(c.data)
  }
  if (ctype === 3 && !palette) throw new PngError("ảnh palette mà thiếu PLTE")
  if (!idat.length) throw new PngError("không có IDAT")
  const raw = inflateSync(Buffer.concat(idat))

  const bitsPerPixel = depth * nch
  const bpp = Math.max(1, bitsPerPixel >> 3)
  const data = new Uint8Array(width * height * 4)

  const emit = (px, py, read) => {
    const put = (r, g, b, a) => {
      const o = (py * width + px) * 4
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a
    }
    if (ctype === 0) {
      const v = read(0)
      // ① 16-bit grayscale ⇒ Pillow mode I;16 ⇒ KẸP, không dịch; và bỏ qua tRNS.
      const g = depth === 16 ? (v > 255 ? 255 : v) : scale(v, depth)
      put(g, g, g, (depth !== 16 && trns && trnsGray(trns) === g) ? 0 : 255)
    } else if (ctype === 2) {
      const sh = depth === 16 ? 8 : 0
      const r = read(0) >> sh, g = read(1) >> sh, b = read(2) >> sh
      let a = 255
      if (depth !== 16 && trns && trns.length >= 6
          && trns.readUInt16BE(0) === r && trns.readUInt16BE(2) === g && trns.readUInt16BE(4) === b) a = 0
      put(r, g, b, a)
    } else if (ctype === 3) {
      const i = read(0)
      const o = i * 3
      put(palette[o] ?? 0, palette[o + 1] ?? 0, palette[o + 2] ?? 0,
        trns && i < trns.length ? trns[i] : 255)
    } else if (ctype === 4) {
      const g = depth === 16 ? read(0) >> 8 : scale(read(0), depth)
      const a = depth === 16 ? read(1) >> 8 : read(1)
      put(g, g, g, a)
    } else {
      const sh = depth === 16 ? 8 : 0
      put(read(0) >> sh, read(1) >> sh, read(2) >> sh, read(3) >> sh)
    }
  }

  if (interlace === 0) {
    const stride = Math.ceil(bitsPerPixel * width / 8)
    const { out } = unfilter(raw, 0, width, height, bpp, stride)
    for (let y = 0; y < height; y++) {
      const read = sampleReader(out, y * stride, depth)
      for (let x = 0; x < width; x++) {
        const base = x * nch
        emit(x, y, i => read(base + i))
      }
    }
  } else {
    let off = 0
    for (const [x0, y0, dx, dy] of ADAM7) {
      const pw = Math.ceil((width - x0) / dx)
      const ph = Math.ceil((height - y0) / dy)
      if (pw <= 0 || ph <= 0) continue
      const stride = Math.ceil(bitsPerPixel * pw / 8)
      const { out, next } = unfilter(raw, off, pw, ph, bpp, stride)
      off = next
      for (let sy = 0; sy < ph; sy++) {
        const read = sampleReader(out, sy * stride, depth)
        for (let sx = 0; sx < pw; sx++) {
          const base = sx * nch
          emit(x0 + sx * dx, y0 + sy * dy, i => read(base + i))
        }
      }
    }
  }

  return { width, height, data, bands: bandsOf(ctype, depth), mode: modeOf(ctype, depth) }
}

function scale(v, depth) {
  if (depth === 8) return v
  if (depth === 1) return v ? 255 : 0
  if (depth === 2) return v * 85
  if (depth === 4) return v * 17
  return v
}

function trnsGray(trns) {
  return trns.length >= 2 ? trns.readUInt16BE(0) : -1
}

/** `im.getbands()` của Pillow cho tổ hợp (color type, bit depth). */
export function bandsOf(ctype, depth) {
  if (ctype === 0) return depth === 1 ? ["1"] : depth === 16 ? ["I"] : ["L"]
  if (ctype === 2) return ["R", "G", "B"]
  if (ctype === 3) return ["P"]
  // ② LA 16-bit nạp thẳng thành RGBA trong Pillow.
  if (ctype === 4) return depth === 16 ? ["R", "G", "B", "A"] : ["L", "A"]
  return ["R", "G", "B", "A"]
}

function modeOf(ctype, depth) {
  if (ctype === 0) return depth === 1 ? "1" : depth === 16 ? "I;16" : "L"
  if (ctype === 2) return "RGB"
  if (ctype === 3) return "P"
  if (ctype === 4) return depth === 16 ? "RGBA" : "LA"
  return "RGBA"
}

/* ── MÃ HOÁ ───────────────────────────────────────────────────────────────── */

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([len, body, crc])
}

let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      CRC_TABLE[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

/**
 * ``{width, height, data}`` (RGBA8) → Buffer PNG hợp lệ.
 *
 * `channels` = 4 (RGBA, color type 6) hoặc 3 (RGB, color type 2). Chỉ 8-bit —
 * `slice.py` chỉ bao giờ ghi ra ảnh đã `convert("RGBA")`, nên không có nhánh nào
 * cần 16-bit, và một nhánh không ai đi là một nhánh không ai kiểm.
 *
 * CHỌN FILTER theo tổng trị tuyệt đối (heuristic của libpng): rẻ, tất định, và
 * không đụng tới một bit dữ liệu nào — đầu ra giải mã lại phải bằng đúng đầu vào.
 */
export function encode({ width, height, data }, { channels = 4, level = 6 } = {}) {
  if (channels !== 3 && channels !== 4) throw new PngError(`channels phải là 3 hoặc 4, không phải ${channels}`)
  if (!width || !height) throw new PngError(`khổ ảnh vô nghĩa ${width}x${height}`)
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  const cur = new Uint8Array(stride)
  let prev = new Uint8Array(stride)
  const cand = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride),
    new Uint8Array(stride), new Uint8Array(stride)]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4
      const d = x * channels
      cur[d] = data[s]; cur[d + 1] = data[s + 1]; cur[d + 2] = data[s + 2]
      if (channels === 4) cur[d + 3] = data[s + 3]
    }
    let best = 0, bestSum = Infinity
    for (let ft = 0; ft < 5; ft++) {
      const buf = cand[ft]
      let sum = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? cur[i - channels] : 0
        const b = prev[i]
        const c = i >= channels ? prev[i - channels] : 0
        let v
        switch (ft) {
          case 0: v = cur[i]; break
          case 1: v = cur[i] - a; break
          case 2: v = cur[i] - b; break
          case 3: v = cur[i] - ((a + b) >> 1); break
          default: v = cur[i] - paeth(a, b, c)
        }
        v &= 0xff
        buf[i] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) { bestSum = sum; best = ft }
    }
    const off = y * (stride + 1)
    raw[off] = best
    raw.set(cand[best], off + 1)
    prev.set(cur)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = channels === 4 ? 6 : 2
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}
