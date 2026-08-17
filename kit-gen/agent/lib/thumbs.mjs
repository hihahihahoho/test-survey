/* thumbs.mjs — thumbnail cho `GET /api/projects/:id/files/*?w=256` (bắt buộc, đóng H4:
   v1 nạp raw/*.png 3.1 MB vào lưới). Node stdlib không resize ảnh được, nên dùng
   python3 + Pillow (đã là phụ thuộc của slice.py). Không có Pillow → trả ảnh gốc kèm
   header X-KitGen-Thumb: unavailable, KHÔNG vỡ UI, KHÔNG giả vờ đã resize. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { ensureDir, exists, mtimeOf } from "./fsx.mjs"
import { pythonCommand, pythonSpawnOpts } from "./platform.mjs"

const ALLOWED_W = [128, 256, 512]
let pillowOk = null

function py(args, timeout = 15000) {
  const c = pythonCommand(args)      // non-win: {cmd:"python3", args} — y hệt mã cũ
  return new Promise(resolve => {
    execFile(c.cmd, c.args, { timeout, ...pythonSpawnOpts() }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" }))
  })
}

async function hasPillow() {
  if (pillowOk !== null) return pillowOk
  const r = await py(["-c", "import PIL; print('ok')"], 8000)
  pillowOk = r.ok && r.stdout.includes("ok")
  return pillowOk
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
  if (!/\.(png|jpe?g|webp)$/i.test(absSrc)) return { path: absSrc, resized: false }
  if (!(await hasPillow())) return { path: absSrc, resized: false }
  const mt = Math.floor(await mtimeOf(absSrc))
  const key = createHash("sha256").update(`${absSrc}@${mt}@${width}`).digest("hex").slice(0, 24)
  const dir = join(ws.cacheDir, "thumbs")
  await ensureDir(dir)
  const out = join(dir, `${key}.png`)
  if (await exists(out)) return { path: out, resized: true }
  const code = [
    "import sys",
    "from PIL import Image",
    "src, dst, w = sys.argv[1], sys.argv[2], int(sys.argv[3])",
    "im = Image.open(src)",
    "im.thumbnail((w, w * 4))",
    "im.convert('RGBA').save(dst + '.tmp', 'PNG')",
    "import os; os.replace(dst + '.tmp', dst)",
  ].join("\n")
  const r = await py(["-c", code, absSrc, out, String(width)])
  if (!r.ok || !(await exists(out))) return { path: absSrc, resized: false }
  return { path: out, resized: true }
}
