/* ref-alpha.mjs — ẢNH THAM CHIẾU NÀY CÓ NỀN TRONG SUỐT THẬT KHÔNG.
 *
 * ╔══ VÌ SAO AGENT PHẢI TRẢ LỜI ĐƯỢC CÂU NÀY ══════════════════════════════════╗
 * ║ Từ 09/09/2026 `gen.sh` quyết định ĐÍNH hay TẢ theo TỪNG TẤM ẢNH: ảnh có     ║
 * ║ nền trong suốt thật thì đính thẳng vào lời gọi `image_gen` (giống hơn hẳn), ║
 * ║ ảnh đục thì phải đi qua một lượt codex tả thành chữ (đính ảnh đục vào là     ║
 * ║ kéo cả sheet về RGB — đo được). Đó là một quyết định người dùng NHÌN THẤY   ║
 * ║ hậu quả: cùng một tấm ảnh nhân vật, hai đường đi cho ra hai mức giống nhau  ║
 * ║ khác hẳn, và một đường còn tốn thêm một lượt codex. Nên nó phải hiện ra    ║
 * ║ trên pill ảnh, chứ không nằm im trong một script bash.                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ ĐO BẰNG ĐÚNG PHÉP CỦA `gen.sh`, KHÔNG BẰNG MỘT PHÉP GẦN ĐÚNG. Đọc header PNG
 * ra "có kênh alpha" là RẺ nhưng SAI: mọi PNG do webapp ghép đều là RGBA, và một
 * tấm RGBA alpha 255 toàn bộ thì đục y như JPG. Cái web nói phải là cái engine làm,
 * nên phép đo ở đây là cùng một phép: tỉ lệ pixel alpha=0 ≥ REF_ALPHA_MIN.
 *
 * Không có Pillow ⇒ `false` cho mọi ảnh, y như `ref_has_alpha` của gen.sh: đường
 * an toàn là TẢ, và hai tầng phải chọn cùng một đường an toàn.
 */
import { execFile } from "node:child_process"
import { stat } from "node:fs/promises"
import { pythonCommand, pythonSpawnOpts } from "./platform.mjs"

/** PHẢI khớp `REF_ALPHA_MIN` trong gen.sh (test_gen_prompt canh hai bên bằng nhau). */
export const REF_ALPHA_MIN = 0.05

/* Cache theo (đường dẫn, cỡ, mtime): danh sách refs được đọc lại mỗi lần mở dự án,
   và mở một PNG ra đếm histogram không phải phép rẻ. Khoá mang mtime nên người dùng
   thay ảnh (giữ nguyên tên) là kết quả cũ tự hết hạn — cùng luật với cache mô tả. */
const seen = new Map()

const PY = [
  "import json, sys",
  "out = {}",
  "try:",
  "    from PIL import Image",
  "except Exception:",
  "    Image = None",
  "for p in sys.argv[1:]:",
  "    ok = False",
  "    if Image is not None:",
  "        try:",
  "            with Image.open(p) as im:",
  "                if 'A' in im.getbands() or (im.mode == 'P' and 'transparency' in im.info):",
  "                    h = im.convert('RGBA').getchannel('A').histogram()",
  "                    n = float(sum(h)) or 1.0",
  `                    ok = (h[0] / n) >= ${REF_ALPHA_MIN}`,
  "        except Exception:",
  "            ok = False",
  "    out[p] = ok",
  "print(json.dumps(out))",
].join("\n")

function py(args, timeout = 20000) {
  const c = pythonCommand(args)
  return new Promise(resolve => {
    execFile(c.cmd, c.args, { timeout, ...pythonSpawnOpts() }, (err, stdout) =>
      resolve({ ok: !err, stdout: stdout ?? "" }))
  })
}

/**
 * Đo một LOẠT ảnh trong MỘT lượt spawn python.
 *
 * Một lượt cho cả danh sách chứ không một lượt mỗi ảnh: `GET /refs` của một dự án
 * thật trả về 5-15 tấm, và 15 lần khởi động python là gần một giây cho một danh
 * sách đáng lẽ tức thì.
 *
 * @param {string[]} paths đường dẫn TUYỆT ĐỐI tới ảnh
 * @returns {Promise<Map<string, boolean>>} ảnh nào có nền trong suốt thật
 */
export async function refAlpha(paths) {
  const out = new Map()
  const todo = []
  const keyOf = new Map()
  for (const p of paths) {
    const st = await stat(p).catch(() => null)
    if (!st?.isFile()) { out.set(p, false); continue }
    const key = `${p}@${st.size}@${Math.floor(st.mtimeMs)}`
    keyOf.set(p, key)
    if (seen.has(key)) out.set(p, seen.get(key))
    else todo.push(p)
  }
  if (todo.length === 0) return out
  const r = await py(["-c", PY, ...todo])
  let table = {}
  /* Python không chạy được / trả rác ⇒ MỌI ảnh về `false`, và KHÔNG cache lại:
     thiếu Pillow là chuyện của cả máy (cache được), còn một lượt spawn hỏng thì
     đóng đinh "đục" cho một tấm ảnh trong suốt suốt phiên làm việc. */
  if (r.ok) { try { table = JSON.parse(r.stdout.trim() || "{}") } catch { table = {} } }
  for (const p of todo) {
    const v = table[p] === true
    out.set(p, v)
    if (r.ok) seen.set(keyOf.get(p), v)
  }
  return out
}

/** Một ảnh, một câu trả lời. Vỏ mỏng của `refAlpha` cho đường upload. */
export async function refAlphaOne(path) {
  return (await refAlpha([path])).get(path) === true
}
