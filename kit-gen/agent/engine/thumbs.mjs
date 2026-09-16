/* thumbs.mjs — KHỐI PYTHON CỦA `agent/lib/thumbs.mjs`, VIẾT LẠI BẰNG JS.
 *
 * Bản cũ gọi ra ngoài:
 *     im = Image.open(src)
 *     im.thumbnail((w, w * 4))
 *     im.convert('RGBA').save(dst + '.tmp', 'PNG')
 *     os.replace(dst + '.tmp', dst)
 * — bốn dòng, nhưng chúng kéo theo `python3` + Pillow lên máy người dùng chỉ để CO
 * một tấm ảnh. Thiếu Pillow thì `agent/lib/thumbs.mjs` phục vụ ẢNH GỐC (3 MB một ô
 * trong lưới), tức "không vỡ" nhưng cũng không còn là thumbnail.
 *
 * ⚠️ CHƯA ĐƯỢC NỐI VÀO `agent/lib/thumbs.mjs` — việc ấy là của bước ④. Ở đây chỉ có
 * hàm, và hàm đã được đo trùng TỪNG BYTE với Pillow 11.3 (xem suite-engine-gen).
 *
 * ── MỘT CHỖ KHÔNG KHỚP ĐƯỢC, NÓI RA CHO RÕ ──────────────────────────────────
 * Ảnh mode "P" (bảng màu) được Pillow nội suy trên CHỈ SỐ BẢNG MÀU rồi mới tra bảng
 * — một phép vô nghĩa về mặt màu sắc, nhưng là phép nó làm. Bản này nội suy trên màu
 * đã tra bảng. Không tấm nào của kit-gen là "P" (raw/ và kits/ đều là PNG RGBA do
 * image_gen và slice sinh ra), nên nhánh ấy không có ai đi — nhưng nó có tồn tại.
 */
import { decode, encode } from "./png.mjs"
import { resize, thumbnailSize } from "./resample.mjs"

/** Bề rộng mà `agent/lib/thumbs.mjs` cho phép (giữ nguyên để bước ④ nối thẳng). */
export const ALLOWED_W = [128, 256, 512]

/**
 * `im.thumbnail((w, w*4))` rồi `im.convert('RGBA')`.
 *
 * `w * 4` chứ không phải `w`: khung cao gấp bốn để tấm DỌC (sprite sheet portrait
 * 1024×1536) vẫn bị bề RỘNG khống chế chứ không bị bề cao — nếu không thì một tấm
 * dọc xin `w=256` sẽ ra 171×256, tức rộng hơn 256 là điều lưới web không chờ.
 *
 * @param pngBuffer Buffer của file nguồn
 * @param width     bề rộng mong muốn
 * @returns Buffer PNG RGBA đã co (hoặc mã hoá lại nguyên cỡ, khi ảnh đã đủ nhỏ)
 */
export function thumbnail(pngBuffer, width) {
  const im = decode(pngBuffer)
  const hasAlpha = im.bands.includes("A")

  /* Pillow co ảnh TRONG MODE GỐC rồi mới `convert('RGBA')`, và mode quyết định đường
     đi: RGBA thì nhân sẵn alpha (và vì thế bỏ qua bước `reduce`, xem resample.mjs),
     RGB thì không. Ép mọi thứ về RGBA là đổi pixel của mọi ảnh không có alpha. */
  const bands = hasAlpha ? 4 : 3
  let work
  if (bands === 4) {
    work = { width: im.width, height: im.height, bands: 4, data: im.data }
  } else {
    work = { width: im.width, height: im.height, bands: 3, data: new Uint8Array(im.width * im.height * 3) }
    for (let i = 0, n = im.width * im.height; i < n; i++) {
      work.data[i * 3] = im.data[i * 4]
      work.data[i * 3 + 1] = im.data[i * 4 + 1]
      work.data[i * 3 + 2] = im.data[i * 4 + 2]
    }
  }

  const size = thumbnailSize(im.width, im.height, [width, width * 4])
  // `preserve_aspect_ratio()` trả None khi ảnh đã nằm gọn trong khung: Pillow KHÔNG
  // đụng gì tới ảnh, kể cả không phóng to. Một thumbnail to hơn ảnh gốc là ảnh mờ.
  const out = size ? resize(work, size[0], size[1], "bicubic", null, 2.0) : work

  // `.convert('RGBA')` — kênh alpha đầy cho ảnh vốn không có.
  const rgba = new Uint8Array(out.width * out.height * 4)
  for (let i = 0, n = out.width * out.height; i < n; i++) {
    if (out.bands === 4) {
      rgba[i * 4] = out.data[i * 4]; rgba[i * 4 + 1] = out.data[i * 4 + 1]
      rgba[i * 4 + 2] = out.data[i * 4 + 2]; rgba[i * 4 + 3] = out.data[i * 4 + 3]
    } else {
      rgba[i * 4] = out.data[i * 3]; rgba[i * 4 + 1] = out.data[i * 3 + 1]
      rgba[i * 4 + 2] = out.data[i * 3 + 2]; rgba[i * 4 + 3] = 255
    }
  }
  return encode({ width: out.width, height: out.height, data: rgba }, { channels: 4 })
}
