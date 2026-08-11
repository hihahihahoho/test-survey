/* thumbs.mjs — thumbnail cho `GET /api/projects/:id/files/*?w=256` (bắt buộc, đóng H4:
   v1 nạp raw/*.png 3.1 MB vào lưới). Node stdlib không resize ảnh được, nên dùng
   python3 + Pillow (đã là phụ thuộc của slice.py). Không có Pillow → trả ảnh gốc kèm
   header X-KitGen-Thumb: unavailable, KHÔNG vỡ UI, KHÔNG giả vờ đã resize. */
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { ensureDir, exists, mtimeOf } from "./fsx.mjs"

const ALLOWED_W = [128, 256, 512]
let pillowOk = null

function py(args, timeout = 15000) {
  return new Promise(resolve => {
    execFile("python3", args, { timeout }, (err, stdout, stderr) =>
      resolve({ ok: !err, stdout: stdout ?? "", stderr: stderr ?? "" }))
  })
}

async function hasPillow() {
  if (pillowOk !== null) return pillowOk
  const r = await py(["-c", "import PIL; print('ok')"], 8000)
  pillowOk = r.ok && r.stdout.includes("ok")
  return pillowOk
}

export function normalizeWidth(w) {
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
