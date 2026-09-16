/* thumbs.mjs — thumbnail cho `GET /api/projects/:id/files/*?w=256` (bắt buộc, đóng H4:
   v1 nạp raw/*.png 3.1 MB vào lưới).

   ╔══ BƯỚC ④, 16/09/2026: KHÔNG CÒN PYTHON, KHÔNG CÒN PILLOW ═══════════════════╗
   ║ Bản cũ chạy `python3 -c "from PIL import Image; …"` — bốn dòng Pillow, nhưng ║
   ║ chúng kéo cả python + Pillow lên máy người dùng CHỈ ĐỂ CO MỘT TẤM ẢNH. Nay    ║
   ║ phép co ấy là `agent/engine/thumbs.mjs` (đo trùng TỪNG BYTE với Pillow 11.3,  ║
   ║ xem suite-engine-gen), chạy qua `cli.mjs thumb`.                              ║
   ║                                                                               ║
   ║ VẪN SPAWN, KHÔNG GỌI THẲNG HÀM: co một tấm 1536×1024 bằng JS thuần mất hàng   ║
   ║ trăm ms CPU, mà agent chỉ có MỘT luồng — nó còn đang bơm event NDJSON của     ║
   ║ lượt gen ra cho web. Một tiến trình node riêng đắt vài chục ms lúc khởi động  ║
   ║ và trả lại quyền cho vòng lặp sự kiện; gọi thẳng thì cả agent đứng hình.      ║
   ╚═══════════════════════════════════════════════════════════════════════════════╝

   ĐƯỜNG LUI KHÔNG ĐỔI MỘT CHỮ: co không được (file không phải PNG, PNG hỏng, tiến
   trình con chết) → trả ẢNH GỐC kèm header `X-KitGen-Thumb: unavailable`, KHÔNG vỡ
   UI, KHÔNG giả vờ đã resize. Trước đây ca thường gặp nhất của đường lui ấy là "máy
   thiếu Pillow"; nay nó chỉ còn là ca ảnh hỏng — nhưng đường thì vẫn phải còn. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { ensureDir, exists, mtimeOf } from "./fsx.mjs"
import { ALLOWED_W } from "../engine/thumbs.mjs"
import { winSpawnOpts } from "./platform.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
/* Engine ĐI KÈM AGENT, không phải `resolveEngine(ws)`: thumbnail là việc của chính
   agent (nó ghi vào cache của agent, không đụng project nào), và nó phải chạy được
   cả khi workspace chưa có engine nào cài. */
const ENGINE_CLI = resolve(HERE, "..", "engine", "cli.mjs")

/** `im.thumbnail((w, w*4))` trong một tiến trình node riêng. Không ném: trả `ok`. */
function shrink(src, dst, width, timeout = 15000) {
  return new Promise(resolve2 => {
    execFile(process.execPath, [ENGINE_CLI, "thumb", src, dst, String(width)],
      { timeout, ...winSpawnOpts() },
      err => resolve2({ ok: !err }))
  })
}

/** `null` = KHÔNG có tham số `w` ⇒ phục vụ ẢNH GỐC. Số = bề rộng đã nắn về ALLOWED_W.
 *
 *  ⚠️ "KHÔNG có tham số" ≠ "có tham số nhưng giá trị lạ". Bản cũ chỉ có `Number.isFinite`,
 *  mà `Number(null) === 0` là số HỮU HẠN ⇒ reduce chọn giá trị gần 0 nhất = 128 ⇒ mọi
 *  request KHÔNG kèm `?w=` (tức mọi đường `loadFull()`: dialog Xem ảnh gốc, lightbox zoom,
 *  nút Tải file, Copy ảnh, Copy sang Figma) nhận về thumbnail 128px thay cho file gốc —
 *  đúng triệu chứng "copy ra Figma bé tí, bị vỡ". Vắng mặt phải trả `null`, dứt khoát.
 *  Có mặt mà lạ (`?w=abc`, `?w=99999`) thì vẫn nắn về ALLOWED_W như cũ: caller ĐÃ xin
 *  bản thu nhỏ, chỉ là xin sai số. */
export function normalizeWidth(w) {
  if (w === null || w === undefined) return null
  const n = Number(w)
  if (!Number.isFinite(n)) return null
  return ALLOWED_W.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), ALLOWED_W[0])
}

/**
 * @returns {Promise<{path:string, resized:boolean}>} đường dẫn file để phục vụ.
 */
export async function thumbnail(ws, absSrc, width) {
  /* CHỈ PNG. Engine JS có codec PNG của riêng nó (`engine/png.mjs`) chứ không có bộ
     giải mã JPEG/WebP — Pillow thì có. Mọi ảnh của sản phẩm (raw/, kits/, cover/) đều
     là PNG; ảnh tham chiếu người dùng tải lên có thể là .jpg, và với chúng câu trả
     lời trung thực là "không co được", tức đúng đường lui đã có sẵn. */
  if (!/\.png$/i.test(absSrc)) return { path: absSrc, resized: false }
  const mt = Math.floor(await mtimeOf(absSrc))
  const key = createHash("sha256").update(`${absSrc}@${mt}@${width}`).digest("hex").slice(0, 24)
  const dir = join(ws.cacheDir, "thumbs")
  await ensureDir(dir)
  const out = join(dir, `${key}.png`)
  if (await exists(out)) return { path: out, resized: true }
  const r = await shrink(absSrc, out, width)
  if (!r.ok || !(await exists(out))) return { path: absSrc, resized: false }
  return { path: out, resized: true }
}
