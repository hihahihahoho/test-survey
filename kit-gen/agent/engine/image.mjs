/* image.mjs — ĐÚNG NHỮNG PHÉP ẢNH MÀ slice.py GỌI Ở PILLOW, KHÔNG HƠN.
 *
 * Không phải "thư viện ảnh mini". Mỗi hàm ở đây là một dòng Pillow trong
 * `slice.py` / `validate_output_geometry.py`, và hợp đồng của nó là: cùng đầu vào
 * ⇒ cùng đầu ra TỪNG BYTE với Pillow. Chỗ dễ trượt nhất đã ghi ngay tại hàm:
 *   · `crop` RA NGOÀI ẢNH được Pillow ĐỆM BẰNG 0 (không cắt ngắn, không ném);
 *   · `getbbox` trả hộp NỬA MỞ `(l, t, r, b)` của pixel KHÁC 0, hoặc `null`;
 *   · `point(v >= t ? 255 : 0)` rồi `getbbox` chính là "bbox của α ≥ t".
 */

/** Ảnh RGBA 8-bit — `Image` mode "RGBA" của Pillow. */
export class Rgba {
  constructor(width, height, data) {
    this.width = width
    this.height = height
    this.data = data ?? new Uint8Array(width * height * 4)
  }

  /** `im.crop((x0, y0, x1, y1))` — ngoài biên thì ĐỆM 0 như Pillow. */
  crop([x0, y0, x1, y1]) {
    const w = x1 - x0, h = y1 - y0
    const out = new Rgba(w, h)
    for (let y = 0; y < h; y++) {
      const sy = y0 + y
      if (sy < 0 || sy >= this.height) continue
      for (let x = 0; x < w; x++) {
        const sx = x0 + x
        if (sx < 0 || sx >= this.width) continue
        const s = (sy * this.width + sx) * 4
        const d = (y * w + x) * 4
        out.data[d] = this.data[s]
        out.data[d + 1] = this.data[s + 1]
        out.data[d + 2] = this.data[s + 2]
        out.data[d + 3] = this.data[s + 3]
      }
    }
    return out
  }

  /** `im.getchannel("A")`. */
  channelA() {
    const g = new Gray(this.width, this.height)
    for (let i = 0, n = this.width * this.height; i < n; i++) g.data[i] = this.data[i * 4 + 3]
    return g
  }

  /** `im.putalpha(band)`. */
  putAlpha(gray) {
    for (let i = 0, n = this.width * this.height; i < n; i++) this.data[i * 4 + 3] = gray.data[i]
    return this
  }
}

/** Ảnh một kênh 8-bit — `Image` mode "L" của Pillow. */
export class Gray {
  constructor(width, height, data) {
    this.width = width
    this.height = height
    this.data = data ?? new Uint8Array(width * height)
  }

  /** `band.point(fn)`. */
  point(fn) {
    const g = new Gray(this.width, this.height)
    for (let i = 0; i < this.data.length; i++) g.data[i] = fn(this.data[i])
    return g
  }

  /** `band.point(lambda v: 255 if v >= t else 0)` — nhánh nóng, viết thẳng. */
  threshold(t) {
    const g = new Gray(this.width, this.height)
    for (let i = 0; i < this.data.length; i++) g.data[i] = this.data[i] >= t ? 255 : 0
    return g
  }

  /** `band.getextrema()` → `[min, max]`. */
  extrema() {
    let lo = 255, hi = 0
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    return this.data.length ? [lo, hi] : [0, 0]
  }

  /** `band.getbbox()` → `[l, t, r, b]` (nửa mở) của pixel KHÁC 0, hoặc `null`. */
  getbbox() {
    const { width: w, height: h, data } = this
    let top = -1, bottom = -1, left = w, right = -1
    for (let y = 0; y < h; y++) {
      const row = y * w
      let rowLeft = -1, rowRight = -1
      for (let x = 0; x < w; x++) {
        if (data[row + x]) { if (rowLeft < 0) rowLeft = x; rowRight = x }
      }
      if (rowLeft < 0) continue
      if (top < 0) top = y
      bottom = y
      if (rowLeft < left) left = rowLeft
      if (rowRight > right) right = rowRight
    }
    if (top < 0) return null
    return [left, top, right + 1, bottom + 1]
  }

  /** `band.crop(...)` — cũng đệm 0 ngoài biên. */
  crop([x0, y0, x1, y1]) {
    const w = x1 - x0, h = y1 - y0
    const out = new Gray(w, h)
    for (let y = 0; y < h; y++) {
      const sy = y0 + y
      if (sy < 0 || sy >= this.height) continue
      for (let x = 0; x < w; x++) {
        const sx = x0 + x
        if (sx < 0 || sx >= this.width) continue
        out.data[y * w + x] = this.data[sy * this.width + sx]
      }
    }
    return out
  }

  /** `band.histogram()[value]` — số pixel mang đúng giá trị ấy. */
  countOf(value) {
    let n = 0
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === value) n++
    return n
  }
}
