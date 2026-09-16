/* resample.mjs — PHÉP CO GIÃN ẢNH CỦA PILLOW, CHÉP LẠI BẰNG SỐ NGUYÊN.
 *
 * ╔══ VÌ SAO KHÔNG VIẾT MỘT PHÉP NỘI SUY "TƯƠNG ĐƯƠNG" ═══════════════════════════╗
 * ║ `cover.sh` gọi `im.crop(box).resize((1600, 900), Image.LANCZOS)` và `thumbs.mjs`║
 * ║ gọi `im.thumbnail((w, w*4))`. Cả hai là PILLOW, và Pillow không nội suy bằng    ║
 * ║ số thực: nó dựng hệ số ở `double`, ÉP về số nguyên 22 bit (`PRECISION_BITS`),   ║
 * ║ cộng dồn ở `int`, rồi dịch phải. Một bản "Lanczos đúng công thức toán" viết     ║
 * ║ bằng float của JS ra ảnh KHÁC — lệch 1-2 mức ở hàng nghìn pixel, và lệch LẶNG   ║
 * ║ LẼ: ảnh vẫn đẹp, chỉ không còn là ảnh mà bản cũ trả về.                          ║
 * ║ Nên ở đây chép ĐÚNG `src/libImaging/Resample.c`: cùng `precompute_coeffs`,      ║
 * ║ cùng `normalize_coeffs_8bpc`, cùng `clip8`, cùng thứ tự hai lượt ngang-dọc.     ║
 * ║ Đo trên fixture: TRÙNG TỪNG BYTE với Pillow 11.3 (xem suite-engine-gen).        ║
 * ╚════════════════════════════════════════════════════════════════════════════════╝
 *
 * Ảnh ở đây là `{ width, height, data, bands }` với `data` xen kẽ `bands` kênh
 * 8-bit — KHÔNG phải `Rgba` của image.mjs, vì Pillow chạy lượt ngang/dọc trên ảnh
 * 3 kênh (RGB, sau `convert("RGB")` của cover.sh) lẫn 4 kênh (RGBA, của thumbs).
 */

/* Pillow: `#define PRECISION_BITS (32 - 8 - 2)`. */
const PRECISION_BITS = 32 - 8 - 2

/* ── BỘ LỌC ─────────────────────────────────────────────────────────────────
   Chép nguyên `struct filter` của Pillow. `support` là NỬA bề rộng, và nó quyết
   định `ksize` — đổi một con số ở đây là đổi mọi pixel ở đầu kia. */
function sinc(x) {
  if (x === 0) return 1
  x *= Math.PI
  return Math.sin(x) / x
}

export const FILTERS = {
  /* BILINEAR — `bilinear_filter`. */
  bilinear: { support: 1, f(x) { if (x < 0) x = -x; return x < 1 ? 1 - x : 0 } },
  /* BICUBIC — `bicubic_filter` với a = -0.5 (Catmull-Rom). */
  bicubic: {
    support: 2,
    f(x) {
      const a = -0.5
      if (x < 0) x = -x
      if (x < 1) return ((a + 2) * x - (a + 3)) * x * x + 1
      if (x < 2) return (((x - 5) * x + 8) * x - 4) * a
      return 0
    },
  },
  /* LANCZOS — `lanczos_filter`: sinc bị cắt ở a = 3. */
  lanczos: { support: 3, f(x) { return (x >= -3 && x < 3) ? sinc(x) * sinc(x / 3) : 0 } },
}

/**
 * `precompute_coeffs` của Pillow.
 *
 * ⚠️ BA CHỖ DỄ VIẾT SAI, và cả ba đều đổi pixel:
 *  · `filterscale` bị KẸP SÀN ở 1.0 — phóng to KHÔNG làm giãn bộ lọc, chỉ thu nhỏ mới;
 *  · `xmin/xmax` lấy bằng `(int)(… + 0.5)`, tức CẮT về 0 chứ không phải `Math.round`
 *    (hai phép này khác nhau ở số âm, và `center - support + 0.5` âm ở mép trái);
 *  · hệ số được chuẩn hoá theo TỔNG THẬT `ww` (kể cả khi đuôi bộ lọc bị biên cắt cụt).
 */
function precomputeCoeffs(inSize, in0, in1, outSize, filter) {
  // `(double)(in1 - in0)` của C: HAI SỐ FLOAT trừ nhau Ở ĐỘ CHÍNH XÁC FLOAT rồi
  // mới nới lên double — xem khối "KHUNG CẮT LÀ float" ở `resampleCore`.
  const scale = Math.fround(in1 - in0) / outSize
  const filterscale = scale < 1 ? 1 : scale
  const support = filter.support * filterscale
  const ksize = Math.ceil(support) * 2 + 1
  const bounds = new Int32Array(outSize * 2)
  const kk = new Float64Array(outSize * ksize)
  for (let xx = 0; xx < outSize; xx++) {
    const center = in0 + (xx + 0.5) * scale
    let ww = 0
    const ss = 1 / filterscale
    let xmin = Math.trunc(center - support + 0.5)
    if (xmin < 0) xmin = 0
    let xmax = Math.trunc(center + support + 0.5)
    if (xmax > inSize) xmax = inSize
    xmax -= xmin
    const k = xx * ksize
    for (let x = 0; x < xmax; x++) {
      const w = filter.f((x + xmin - center + 0.5) * ss)
      kk[k + x] = w
      ww += w
    }
    if (ww !== 0) for (let x = 0; x < xmax; x++) kk[k + x] /= ww
    bounds[xx * 2] = xmin
    bounds[xx * 2 + 1] = xmax
  }
  return { ksize, bounds, kk }
}

/** `normalize_coeffs_8bpc` — double → int 22 bit, LÀM TRÒN RA XA 0 rồi CẮT. */
function normalizeCoeffs8(n, prekk) {
  const kk = new Int32Array(n)
  for (let x = 0; x < n; x++) {
    kk[x] = prekk[x] < 0
      ? Math.trunc(-0.5 + prekk[x] * (1 << PRECISION_BITS))
      : Math.trunc(0.5 + prekk[x] * (1 << PRECISION_BITS))
  }
  return kk
}

/** `clip8` của Resample.c — bảng tra chỉ là một phép kẹp sau khi dịch phải 22 bit. */
function clip8(v) {
  const s = v >> PRECISION_BITS     // dịch SỐ CÓ DẤU: chia sàn cho 2^22
  return s <= 0 ? 0 : s >= 255 ? 255 : s
}

const newImage = (bands, width, height) =>
  ({ width, height, bands, data: new Uint8Array(width * height * bands) })

/** `ImagingResampleHorizontal_8bpc`. `offset` = hàng nguồn đầu tiên được dùng. */
function resampleHorizontal(imOut, imIn, offset, ksize, bounds, prekk) {
  const kk = normalizeCoeffs8(imOut.width * ksize, prekk)
  const b = imIn.bands
  const half = 1 << (PRECISION_BITS - 1)
  for (let yy = 0; yy < imOut.height; yy++) {
    const srow = (yy + offset) * imIn.width * b
    const drow = yy * imOut.width * b
    for (let xx = 0; xx < imOut.width; xx++) {
      const xmin = bounds[xx * 2], xmax = bounds[xx * 2 + 1]
      const k = xx * ksize
      for (let c = 0; c < b; c++) {
        let ss = half
        for (let x = 0; x < xmax; x++) ss += imIn.data[srow + (x + xmin) * b + c] * kk[k + x]
        imOut.data[drow + xx * b + c] = clip8(ss | 0)
      }
    }
  }
}

/** `ImagingResampleVertical_8bpc`. */
function resampleVertical(imOut, imIn, ksize, bounds, prekk) {
  const kk = normalizeCoeffs8(imOut.height * ksize, prekk)
  const b = imIn.bands
  const half = 1 << (PRECISION_BITS - 1)
  for (let yy = 0; yy < imOut.height; yy++) {
    const ymin = bounds[yy * 2], ymax = bounds[yy * 2 + 1]
    const k = yy * ksize
    const drow = yy * imOut.width * b
    for (let xx = 0; xx < imOut.width; xx++) {
      for (let c = 0; c < b; c++) {
        let ss = half
        for (let y = 0; y < ymax; y++) ss += imIn.data[((y + ymin) * imIn.width + xx) * b + c] * kk[k + y]
        imOut.data[drow + xx * b + c] = clip8(ss | 0)
      }
    }
  }
}

/**
 * `ImagingResample` của C — LÕI TRẦN, không biết gì về alpha.
 *
 * Người gọi bình thường dùng `resize()` bên dưới; hàm này để lộ ra vì nhánh
 * `reduce` của Pillow chạy TRÊN ảnh đã nhân sẵn alpha, không được nhân lần nữa.
 *
 * @param im     `{ width, height, bands, data }` 8-bit xen kẽ kênh
 * @param xsize  bề rộng đích
 * @param ysize  bề cao đích
 * @param name   "lanczos" | "bicubic" | "bilinear"
 * @param box    `[x0, y0, x1, y1]` SỐ THỰC trên ảnh nguồn; mặc định cả ảnh
 */
export function resampleCore(im, xsize, ysize, name = "lanczos", box = null) {
  const filter = FILTERS[name]
  if (!filter) throw new Error(`bộ lọc lạ: ${name}`)
  /* ╔══ KHUNG CẮT LÀ float 32 BIT, KHÔNG PHẢI double ═══════════════════════════╗
     ║ `_resize` của `_imaging.c` đọc khung bằng `PyArg_ParseTuple(args, "(ii)|i   ║
     ║ (ffff)", …)` — BỐN CHỮ `f`, tức float 32 bit. Python đưa xuống một double   ║
     ║ đẹp đẽ và C làm tròn nó ngay ở cửa.                                         ║
     ║ Chỗ này KHÔNG bao giờ lộ ra với khung số nguyên (mọi số nguyên tới 2^24 đều ║
     ║ chính xác ở float), nên `cover.sh` chạy đúng suốt. Nó chỉ lộ ra ở khung số  ║
     ║ THỰC — tức nhánh `reduce` của `thumbnail`, nơi khung thành 170,666…: bản    ║
     ║ dùng double lệch 1 mức ở 2/32.640 byte. Hai byte, và không ca nào khác bắt. ║
     ╚════════════════════════════════════════════════════════════════════════════╝ */
  const bx = (box ?? [0, 0, im.width, im.height]).map(Math.fround)
  if (xsize < 1 || ysize < 1) throw new Error(`khổ đích vô nghĩa ${xsize}x${ysize}`)

  /* Hai điều kiện dưới đây chép NGUYÊN của Pillow, kể cả chỗ trông như lỗi gõ:
     `box[2] != xsize` so mép PHẢI của khung cắt với bề rộng ĐÍCH. Nó đúng theo nghĩa
     "không cần lượt ngang khi khung trùng ảnh VÀ khổ không đổi", nhưng viết gọn thành
     một phép so lẫn lộn hai đơn vị. Chép y nguyên vì đầu ra phải y nguyên. */
  const needH = xsize !== im.width || bx[0] !== 0 || bx[2] !== xsize
  const needV = ysize !== im.height || bx[1] !== 0 || bx[3] !== ysize

  const h = precomputeCoeffs(im.width, bx[0], bx[2], xsize, filter)
  const v = precomputeCoeffs(im.height, bx[1], bx[3], ysize, filter)

  const yboxFirst = v.bounds[0]
  const yboxLast = v.bounds[ysize * 2 - 2] + v.bounds[ysize * 2 - 1]

  let cur = im
  if (needH) {
    for (let i = 0; i < ysize; i++) v.bounds[i * 2] -= yboxFirst
    const tmp = newImage(im.bands, xsize, yboxLast - yboxFirst)
    resampleHorizontal(tmp, im, yboxFirst, h.ksize, h.bounds, h.kk)
    cur = tmp
  }
  if (needV) {
    const out = newImage(cur.bands, cur.width, ysize)
    resampleVertical(out, cur, v.ksize, v.bounds, v.kk)
    cur = out
  }
  if (cur === im) {
    // `ImagingCopy`: không lượt nào chạy ⇒ trả về bản SAO, không phải chính nó.
    return { width: im.width, height: im.height, bands: im.bands, data: im.data.slice() }
  }
  return cur
}

/* ══ THU NHỎ NGUYÊN LẦN (`Image.reduce`) ═════════════════════════════════════
   `Image.resize(..., reducing_gap=…)` gọi `reduce()` TRƯỚC để hạ ảnh xuống ~2 lần
   khổ đích rồi mới nội suy. Nhánh này KHÔNG có ảnh RGBA nào đi qua (xem khối
   "LƯỢT ĐỆ QUY ĐÁNH RƠI reducing_gap" ở `resize`), nhưng ảnh RGB thì có.

   ⚠️ PILLOW KHÔNG CHIA BẰNG SỐ THỰC Ở ĐÂY. `Reduce.c` dựng một số nhân nguyên
   (`division_UINT32`) rồi dịch phải 24 bit. Viết `tổng / số_ô` bằng double trông
   "đúng hơn" mà ra ảnh KHÁC — đo thật trên 1536×1024 RGB: lệch 1-2 mức ở 2.523
   byte. Một hai mức thì mắt không thấy, nhưng nó là bằng chứng rằng bản chép đã
   trôi khỏi bản gốc, và lần trôi sau sẽ không dừng ở hai mức. */

/**
 * `division_UINT32(divider, 8)`.
 *
 * `max_int` là `float` 32 BIT trong C, nên phép chia này làm tròn ở 24 bit mantissa
 * chứ không phải 53 — `Math.fround` giữ đúng chỗ ấy.
 */
const divisionUINT32 = divider => Math.trunc(Math.fround(Math.fround(4294967296) / (256 * divider)))

/** `(ss * multiplier) >> 24` với phép nhân TRÀN 32 bit của C, rồi ép về UINT8. */
const mulShift = (ss, multiplier) => (((ss * multiplier) >>> 0) >>> 24) & 0xff

/**
 * `ImagingReduce(imIn, xscale, yscale, box)` cho ảnh 8-bit nhiều kênh.
 *
 * `box` theo ĐÚNG quy ước của C: `[x0, y0, rộng, cao]` — KHÔNG phải `[x0,y0,x1,y1]`
 * như `crop`. Hai quy ước ấy nằm cạnh nhau trong cùng một file Pillow, và lẫn chúng
 * là một lỗi không bao giờ ném: ảnh vẫn ra, chỉ lấy sai vùng.
 */
export function reduce(im, xscale, yscale, box = null) {
  const bx = box ?? [0, 0, im.width, im.height]
  const [bx0, by0, bw, bh] = bx
  const b = im.bands
  const out = newImage(b, Math.trunc((bw + xscale - 1) / xscale), Math.trunc((bh + yscale - 1) / yscale))
  const nx = Math.trunc(bw / xscale), ny = Math.trunc(bh / yscale)

  /* Ô ĐỦ (`ImagingReduceNxN` và mọi bản chuyên biệt 2x2/3x3/4x4/5x5 — chúng cộng
     cùng những pixel ấy theo cùng thứ tự, chỉ mở vòng lặp sẵn, nên một bản là đủ). */
  const mul = divisionUINT32(yscale * xscale)
  const amend = Math.trunc((yscale * xscale) / 2)
  for (let y = 0; y < ny; y++) {
    const yFrom = by0 + y * yscale
    for (let x = 0; x < nx; x++) {
      const xFrom = bx0 + x * xscale
      for (let c = 0; c < b; c++) {
        let ss = amend
        for (let yy = yFrom; yy < yFrom + yscale; yy++) {
          const row = yy * im.width * b
          for (let xx = xFrom; xx < xFrom + xscale; xx++) ss += im.data[row + xx * b + c]
        }
        out.data[(y * out.width + x) * b + c] = mulShift(ss, mul)
      }
    }
  }

  /* `ImagingReduceCorners` — BA khối, và khối thứ ba (góc dưới-phải) là khối dễ
     quên nhất: nó KHÔNG được cột dư hay hàng dư phủ, và bỏ nó ra thì đúng một pixel
     ở góc ảnh giữ nguyên rác của `ImagingNewDirty`. */
  const sum = (x0, y0, sx, sy, dst, scale) => {
    const m = divisionUINT32(scale), am = Math.trunc(scale / 2)
    for (let c = 0; c < b; c++) {
      let ss = am
      for (let yy = y0; yy < y0 + sy; yy++) {
        const row = yy * im.width * b
        for (let xx = x0; xx < x0 + sx; xx++) ss += im.data[row + xx * b + c]
      }
      out.data[dst + c] = mulShift(ss, m)
    }
  }
  const restX = bw % xscale, restY = bh % yscale
  if (restX) {
    for (let y = 0; y < ny; y++)
      sum(bx0 + nx * xscale, by0 + y * yscale, restX, yscale, (y * out.width + nx) * b, restX * yscale)
  }
  if (restY) {
    for (let x = 0; x < nx; x++)
      sum(bx0 + x * xscale, by0 + ny * yscale, xscale, restY, (ny * out.width + x) * b, xscale * restY)
  }
  if (restX && restY) {
    sum(bx0 + nx * xscale, by0 + ny * yscale, restX, restY, (ny * out.width + nx) * b, restX * restY)
  }
  return out
}

/* ══ NHÂN SẴN ALPHA — VÌ `reduce` CỦA PILLOW LÀM THẾ ════════════════════════
   `Image.reduce` với mode RGBA đổi sang "RGBa" (alpha nhân sẵn), thu nhỏ, rồi đổi
   ngược. Không nhân sẵn thì pixel trong suốt kéo màu của nó vào trung bình — viền
   sprite xám đi. Hai hàm dưới chép `rgba2rgbA` / `rgbA2rgba` của `Convert.c`. */

/** `MULDIV255(a, b)` của Pillow: `(t = a*b + 128, ((t >> 8) + t) >> 8)`. */
const muldiv255 = (a, al) => { const t = a * al + 128; return ((t >> 8) + t) >> 8 }

export function premultiply(im) {
  const out = newImage(4, im.width, im.height)
  for (let i = 0, n = im.width * im.height; i < n; i++) {
    const a = im.data[i * 4 + 3]
    out.data[i * 4] = muldiv255(im.data[i * 4], a)
    out.data[i * 4 + 1] = muldiv255(im.data[i * 4 + 1], a)
    out.data[i * 4 + 2] = muldiv255(im.data[i * 4 + 2], a)
    out.data[i * 4 + 3] = a
  }
  return out
}

export function unpremultiply(im) {
  const out = newImage(4, im.width, im.height)
  for (let i = 0, n = im.width * im.height; i < n; i++) {
    const a = im.data[i * 4 + 3]
    for (let c = 0; c < 3; c++) {
      const v = im.data[i * 4 + c]
      out.data[i * 4 + c] = (a === 255 || a === 0) ? v : Math.min(255, Math.trunc((255 * v) / a))
    }
    out.data[i * 4 + 3] = a
  }
  return out
}

/** `_filters_support` của Image.py — dùng cho `_get_safe_box`. */
const SUPPORT = { bilinear: 1.0, bicubic: 2.0, lanczos: 3.0 }

/**
 * `Image.resize(size, resample, box, reducing_gap)` — BẢN ĐẦY ĐỦ CỦA PILLOW.
 *
 * ╔══ ALPHA ĐƯỢC NHÂN SẴN, VÀ ĐÓ KHÔNG PHẢI CHI TIẾT NHỎ ═══════════════════════╗
 * ║ `Image.resize` mở đầu bằng:                                                 ║
 * ║     if self.mode in ("LA", "RGBA") and resample != NEAREST:                  ║
 * ║         im = self.convert({"LA": "La", "RGBA": "RGBa"}[self.mode])           ║
 * ║         return im.resize(size, resample, box).convert(self.mode)             ║
 * ║ Bỏ hai dòng ấy ra thì ảnh vẫn "đúng cỡ" mà SAI TỚI 255 MỨC ở vùng trong suốt ║
 * ║ (đo thật: 370.725/698.368 byte lệch, max 255) — vì pixel alpha=0 vẫn mang    ║
 * ║ màu rác, và không nhân sẵn thì màu rác ấy được tính vào trung bình. Đúng      ║
 * ║ triệu chứng "viền sprite xám xịt" mà không ai truy ra nổi nguồn.             ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÀ LƯỢT ĐỆ QUY ẤY ĐÁNH RƠI `reducing_gap` ════════════════════════════════╗
 * ║ Nhìn kỹ dòng giữa: `im.resize(size, resample, box)` — BA đối số. `reducing_  ║
 * ║ gap` KHÔNG được truyền tiếp. Nên với ảnh RGBA (tức MỌI sheet của kit-gen),   ║
 * ║ bước thu nhỏ nguyên lần của `Image.thumbnail` KHÔNG BAO GIỜ CHẠY, dù         ║
 * ║ `thumbnail` luôn truyền `reducing_gap=2.0` xuống.                            ║
 * ║ Đo thật (Pillow 11.3, 1536×1024 RGBA → 128 và 256): bản JS CÓ `reduce` lệch  ║
 * ║ tới 255 mức; bản BỎ `reduce` trùng TỪNG BYTE. Đây là hành vi của bản cũ, nên ║
 * ║ nó là hợp đồng — chép cả chỗ đánh rơi, và ghi ra đây để đời sau đừng "sửa".  ║
 * ║ `reduce` vẫn ở lại bên dưới vì nhánh RGB/L (`cover.sh` đổi sang RGB) có đi.  ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 */
export function resize(im, xsize, ysize, name = "lanczos", box = null, reducingGap = null) {
  if (im.bands === 4) {
    // ⚠️ `reducingGap` KHÔNG đi tiếp — xem khối ngay trên. Không phải bỏ sót.
    return unpremultiply(resizeStraight(premultiply(im), xsize, ysize, name, box, null))
  }
  return resizeStraight(im, xsize, ysize, name, box, reducingGap)
}

/** `Image.resize` cho ảnh KHÔNG cần nhân alpha (RGB, L, hoặc RGBa đã nhân sẵn). */
function resizeStraight(im, xsize, ysize, name, box = null, reducingGap = null) {
  let bx = box ?? [0, 0, im.width, im.height]
  let cur = im
  if (reducingGap !== null && name !== "nearest") {
    const fx = Math.trunc((bx[2] - bx[0]) / xsize / reducingGap) || 1
    const fy = Math.trunc((bx[3] - bx[1]) / ysize / reducingGap) || 1
    if (fx > 1 || fy > 1) {
      // `_get_safe_box`: nới khung cắt ra đúng bề rộng đuôi bộ lọc, để lượt thu nhỏ
      // không cắt mất pixel mà lượt nội suy sau còn cần.
      const fs = SUPPORT[name] - 0.5
      const sx = fs * ((bx[2] - bx[0]) / xsize)
      const sy = fs * ((bx[3] - bx[1]) / ysize)
      const safe = [
        Math.max(0, Math.trunc(bx[0] - sx)),
        Math.max(0, Math.trunc(bx[1] - sy)),
        Math.min(im.width, Math.ceil(bx[2] + sx)),
        Math.min(im.height, Math.ceil(bx[3] + sy)),
      ]
      cur = reduce(cur, fx, fy, [safe[0], safe[1], safe[2] - safe[0], safe[3] - safe[1]])
      bx = [
        (bx[0] - safe[0]) / fx, (bx[1] - safe[1]) / fy,
        (bx[2] - safe[0]) / fx, (bx[3] - safe[1]) / fy,
      ]
    }
  }
  return resampleCore(cur, xsize, ysize, name, bx)
}

/**
 * Cỡ đích của `Image.thumbnail(size)` — `preserve_aspect_ratio()` trong Image.py.
 * Trả `null` khi ảnh đã nhỏ hơn khung (Pillow không đụng gì tới ảnh).
 *
 * `round_aspect` KHÔNG phải làm tròn thường: nó thử cả `floor` lẫn `ceil` rồi chọn
 * bên giữ TỈ LỆ sát hơn — 1536×1024 xuống khung 256 ra cao 171, không phải 170.
 */
export function thumbnailSize(w, h, [bw, bh]) {
  bw = Math.floor(bw); bh = Math.floor(bh)
  if (bw >= w && bh >= h) return null
  const aspect = w / h
  const roundAspect = (n, key) => {
    const lo = Math.floor(n), hi = Math.ceil(n)
    const best = key(hi) < key(lo) ? hi : lo    // `min` của Python giữ phần tử ĐẦU khi hoà
    return Math.max(best, 1)
  }
  let x = bw, y = bh
  if (x / y >= aspect) x = roundAspect(y * aspect, n => Math.abs(aspect - n / y))
  else y = roundAspect(x / aspect, n => (n === 0 ? 0 : Math.abs(aspect - x / n)))
  return [x, y]
}
