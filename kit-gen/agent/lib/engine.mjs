/* engine.mjs — adapter mỏng sang engine v1. KHÔNG sửa gen.sh / slice.py / skeleton.py.
 *
 * SỰ THẬT ĐÃ ĐỌC TỪ MÃ (không phải giả định):
 *   · gen.sh dòng 5:   `cd "$(dirname "$0")"` ; ROOT="$(pwd)"
 *   · slice.py dòng 60: HERE = dirname(abspath(__file__)) ; đọc HERE/styles.json, ghi HERE/kits
 *   · skeleton.py:      cùng kiểu HERE
 *   ⇒ engine neo mọi đường dẫn theo THƯ MỤC CHỨA SCRIPT, **không** theo cwd.
 *     Vì vậy chạy `bash <engine>/gen.sh` với cwd=<project> vẫn đọc styles.json của <engine>.
 *
 * CÁCH XỬ LÝ: COPY engine vào chính thư mục project rồi chạy bản copy đó.
 *   → HERE = <project> ⇒ styles.json / raw / kits / prompts / skeleton / logs đều nằm trong project
 *   → đúng tinh thần "project tự chứa" (architecture §2.2), không sửa một dòng engine nào.
 *   (Dùng COPY chứ không symlink: `import.meta.url` của Node GIẢI symlink, nên bản symlink của
 *    render-skeleton.mjs sẽ đọc styles.json của repo — đúng cái ta phải tránh.)
 *
 * CHỐNG "ĐỔ QUOTA OAN": filter của gen.sh là SUBSTRING (dòng ~180), nên truyền "tet-main"
 * sẽ chạy luôn "tet-main2". Vì vậy pha gen KHÔNG dùng argv filter: agent ghi styles.json
 * **thu hẹp đúng tập job đã chọn** (đóng E7). Pha slice thì dùng argv vì slice.py so khớp
 * TẬP CHÍNH XÁC (`sid not in ONLY`).
 */
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"
import { exists, writeJsonAtomic, ensureDir, copyFile } from "./fsx.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_DIR = resolve(HERE, "..", "..")

/** File engine cần có cạnh nhau để chạy. Thiếu file tuỳ chọn thì engine tự fallback. */
const ENGINE_FILES = [
  { name: "gen.sh", required: true, mode: 0o755 },
  { name: "slice.py", required: true },
  { name: "skeleton.py", required: false },
  { name: "skeleton.html", required: false },
  { name: "silhouettes.js", required: false },
  { name: "render-skeleton.mjs", required: false },
  { name: "element-lib.json", required: false },
  { name: "validate_output_geometry.py", required: false },
]

/** Tìm engine: bản cài trong workspace (.kitgen/engine) trước, rồi bản repo (dev). */
export async function resolveEngine(ws) {
  for (const dir of [ws.engineDir, REPO_DIR]) {
    if (await exists(join(dir, "gen.sh"))) return dir
  }
  return null
}

/** Copy engine vào project để HERE = project. Trả danh sách file đã đặt. */
export async function prepareEngine(engineDir, projectDirAbs) {
  await ensureDir(projectDirAbs)
  const placed = []
  for (const f of ENGINE_FILES) {
    const src = join(engineDir, f.name)
    if (!(await exists(src))) {
      if (f.required) throw new Error(`engine thiếu ${f.name}`)
      continue
    }
    const dst = join(projectDirAbs, f.name)
    await copyFile(src, dst)
    if (f.mode) { const { chmod } = await import("node:fs/promises"); await chmod(dst, f.mode) }
    placed.push(f.name)
  }
  return placed
}

/* CHUẨN HOÁ SHAPE Ở ĐÚNG MỐI NỐI agent → engine.
   Lý do (QA LEAD đã chạy để xác nhận, không phải suy đoán):
     · skeleton.py:81 SHAPES KHÔNG có khoá "rect" ⇒ `python3 skeleton.py` ném
       `KeyError: 'rect'` và pha skeleton chết hẳn.
     · silhouettes.js:85-127 cũng không có nhánh "rect" ⇒ trả chuỗi rỗng = ô trống câm.
   Mà "rect" lại là skel MẶC ĐỊNH mà agent tự gán cho element thiếu skel (importer/templates)
   ⇒ đây là ĐƯỜNG MẶC ĐỊNH của luồng nhập, không phải ca hiếm.
   Sửa ở đây thay vì sửa engine vì gen.sh/slice.py là file bị CẤM sửa, và vì contract cũ
   của user đã lỡ lưu "rect" thì vẫn phải chạy được. Contract v2 KHÔNG đổi lược đồ:
   "rect" vẫn hợp lệ, chỉ được dịch sang "rrect" khi ghi styles.json cho engine. */
const SHAPE_TO_ENGINE = { rect: "rrect" }
function engineSkel(skel) {
  const s = skel ?? DEFAULT_SKEL_V1
  const mapped = SHAPE_TO_ENGINE[s.shape]
  return mapped ? { ...s, shape: mapped } : s
}
/** skel mặc định khi component không khai — dùng shape engine VẼ ĐƯỢC. */
const DEFAULT_SKEL_V1 = { shape: "rrect", w: 0.8, h: 0.6 }

/** contract v2 → styles.json v1 (variants[] → styles[], sheet.variants → sheet.styles).
 *  `onlyJobs` (mảng {variant,sheet}) = thu hẹp đúng tập job cần chạy. */
export function contractToStylesV1(contract, onlyJobs = null) {
  let variants = contract.variants ?? []
  let sheets = contract.sheets ?? []
  let perSheet = null
  if (onlyJobs) {
    const wantVariants = new Set(onlyJobs.map(j => j.variant))
    perSheet = new Map()
    for (const j of onlyJobs) {
      if (!perSheet.has(j.sheet)) perSheet.set(j.sheet, new Set())
      perSheet.get(j.sheet).add(j.variant)
    }
    variants = variants.filter(v => wantVariants.has(v.id))
    sheets = sheets.filter(sh => perSheet.has(sh.id))
  }
  return {
    schemaVersion: contract.schemaVersion ?? 4,
    characterPoses: contract.characterPoses ?? [],
    sheets: sheets.map(sh => {
      const out = { ...sh }
      delete out.variants
      const only = perSheet?.get(sh.id)
      if (only) out.styles = [...only]
      else if (Array.isArray(sh.variants) && sh.variants.length) out.styles = sh.variants
      out.components = (sh.components ?? []).map(c => ({
        file: c.file, vi: c.vi, spec: c.spec,
        skel: engineSkel(c.skel),
      }))
      return out
    }),
    styles: variants.map(v => ({ ...v })),
  }
}

/** Ghi styles.json vào project để engine đọc (HERE = project). */
export async function materializeStyles(projectDirAbs, contract, onlyJobs = null) {
  await ensureDir(projectDirAbs)
  await writeJsonAtomic(join(projectDirAbs, "styles.json"), contractToStylesV1(contract, onlyJobs))
  return "styles.json"
}

/** argv cho từng pha. Client chỉ gửi DANH TỪ; argv do agent dựng, không có chuỗi shell nào của client. */
export function buildCommand(kind, projectDirAbs, { variants = [], maxJobs = 4, imgHome = null }) {
  const env = {}
  if (kind === "gen") {
    env.MAXJOBS = String(maxJobs)
    // Không đặt IMG_HOME = Codex dùng cấu hình mặc định. Chỉ truyền khi user chủ động
    // chọn profile riêng; đây là path, không phải credential.
    if (imgHome) {
      const raw = String(imgHome)
      env.IMG_HOME = raw.startsWith("~") ? join(homedir(), raw.slice(1)) : raw
    }
    // KHÔNG truyền argv filter: styles.json đã thu hẹp đúng tập job (filter của gen.sh là substring)
    return { cmd: "bash", args: [join(projectDirAbs, "gen.sh")], env }
  }
  if (kind === "slice") return { cmd: "python3", args: [join(projectDirAbs, "slice.py"), ...variants], env }
  if (kind === "skeleton") return { cmd: "python3", args: [join(projectDirAbs, "skeleton.py")], env }
  throw new Error(`unknown run kind ${kind}`)
}

/** Chẩn đoán 1 dòng cho job lỗi (enum của Run.jobs[].diagnosis). */
export function diagnose(lines) {
  const hay = lines.join("\n").toLowerCase()
  if (/rate limit|429|quota|usage limit|too many requests/.test(hay)) return "QUOTA_SUSPECTED"
  if (/not logged in|unauthor|chưa đăng nhập|codex login/.test(hay)) return "NOT_LOGGED_IN"
  if (/timed? ?out|timeout/.test(hay)) return "TIMEOUT"
  if (/ảnh không được ghi|no artifact/.test(hay)) return "NO_ARTIFACT"
  return "UNKNOWN"
}

export { REPO_DIR }
