/* engine.mjs — adapter mỏng sang engine v1. KHÔNG sửa gen.sh / slice.py.
 *
 * SỰ THẬT ĐÃ ĐỌC TỪ MÃ (không phải giả định):
 *   · gen.sh dòng 5:   `cd "$(dirname "$0")"` ; ROOT="$(pwd)"
 *   · slice.py:        HERE = dirname(abspath(__file__)) ; đọc HERE/styles.json + HERE/geometry.py,
 *                      ghi HERE/kits
 *   ⇒ engine neo mọi đường dẫn theo THƯ MỤC CHỨA SCRIPT, **không** theo cwd.
 *     Vì vậy chạy `bash <engine>/gen.sh` với cwd=<project> vẫn đọc styles.json của <engine>.
 *
 * CÁCH XỬ LÝ: COPY engine vào chính thư mục project rồi chạy bản copy đó.
 *   → HERE = <project> ⇒ styles.json / raw / kits / prompts / logs đều nằm trong project
 *   → đúng tinh thần "project tự chứa" (architecture §2.2), không sửa một dòng engine nào.
 *
 * CHỐNG "ĐỔ QUOTA OAN": filter của gen.sh là SUBSTRING (dòng ~180), nên truyền "tet-main"
 * sẽ chạy luôn "tet-main2". Vì vậy pha gen KHÔNG dùng argv filter: agent ghi styles.json
 * **thu hẹp đúng tập job đã chọn** (đóng E7). Pha slice thì dùng argv vì slice.py so khớp
 * TẬP CHÍNH XÁC (`sid not in ONLY`).
 */
import { spawn } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"
import { exists, writeJsonAtomic, ensureDir, copyFile } from "./fsx.mjs"
import { IS_WIN, bashCommand, pythonCommand, pythonEnv, killTree, winSpawnOpts } from "./platform.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_DIR = resolve(HERE, "..", "..")

/** File engine cần có cạnh nhau để chạy. Thiếu file tuỳ chọn thì engine tự fallback. */
const ENGINE_FILES = [
  { name: "gen.sh", required: true, mode: 0o755 },
  { name: "slice.py", required: true },
  /* geometry.py là BẮT BUỘC, và bắt buộc theo nghĩa mạnh nhất: cả hai file trên đều
     `import geometry`. Thiếu nó thì gen.sh chết ở dòng import với một `ModuleNotFoundError`
     mà người dùng không đọc ra được điều gì.
     Từ 27/08/2026 nó thay chỗ của bộ khung xương (skeleton.html / skeleton-svg.js /
     render-skeleton.mjs, đã xoá): prompt nay TỰ NÓI toạ độ safe zone thay vì đính một
     tấm PNG vẽ khung, và toạ độ đó phải ra từ cùng hàm mà slice.py cắt.
     `silhouettes.js` KHÔNG còn trong danh sách — engine không nạp nó nữa; file vẫn ở
     repo vì webapp rút dữ liệu shape từ đó (features/design/scripts/extract-shapes.mjs). */
  { name: "geometry.py", required: true },
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
    // Bit thực thi không tồn tại trên NTFS: Node chmod ở đó chỉ lật cờ read-only.
    // Bỏ hẳn trên win32 để không có tác dụng phụ nào ngoài ý muốn (gate: darwin/linux giữ nguyên).
    if (f.mode && !IS_WIN) { const { chmod } = await import("node:fs/promises"); await chmod(dst, f.mode) }
    placed.push(f.name)
  }
  return placed
}

/* CHUẨN HOÁ SHAPE Ở ĐÚNG MỐI NỐI agent → engine.
   Lý do gốc là bộ vẽ khung xương: `silhouettes.js` không có nhánh "rect" ⇒ trả chuỗi
   rỗng = ô trống câm (và bản PIL trước nó còn ném `KeyError: 'rect'`). Khung xương đã
   bỏ hẳn 27/08/2026, nhưng phép dịch này Ở LẠI: `slice.py` vẫn phân nhánh theo
   `skel.shape` (`"empty"` / `"full"` / `"pose"`), và webapp cũng đọc cùng tập shape đó
   để vẽ preview. Một giá trị ngoài tập là một ô hành xử khác cả engine lẫn UI.
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
      /* CHÉP NGUYÊN TẤM rồi mới gọt, KHÔNG liệt kê từng field. Đây là chủ ý, không
         phải lười: `note`, `orient`, `ref`, `cell_hint`, `grid`, và nay `directive` /
         `promptOverride` đều là thứ gen.sh đọc thẳng từ styles.json. Một danh sách
         trắng ở đây thì mỗi field mới của Prompt Studio sẽ rơi ÂM THẦM — contract
         lưu đúng, UI hiện đúng, prompt thì không có gì, và không ai biết mất ở đâu.
         Chỉ `components` bị lọc (bên dưới) vì engine v1 chỉ hiểu 4 khoá của nó. */
      const out = { ...sh }
      delete out.variants
      const only = perSheet?.get(sh.id)
      if (only) out.styles = [...only]
      else if (Array.isArray(sh.variants) && sh.variants.length) out.styles = sh.variants
      out.components = (sh.components ?? []).map(c => {
        /* DANH SÁCH TRẮNG NÀY ĐÃ TỪNG NUỐT MẤT MỘT TÍNH NĂNG — đọc trước khi thêm khoá.
           Lọc là CHỦ Ý cho `components`: engine v1 chỉ hiểu vài khoá và một object lạ
           lọt vào `skel` là `slice.py` cắt sai chứ không báo lỗi. Nhưng cái giá của nó
           là mỗi khoá MỚI phải được ghi tên vào đây, và ngày 07/09/2026 `out`/`drawScale`
           không được ghi ⇒ contract lưu đúng, UI hiện đúng, mà `styles.json` thì trống:
           `gen.sh:583` không in "final size WxH, drawn at kx" (máy vẽ mất cỡ thật),
           `slice.py:498` không ghi `outSize`/`drawScale` vào manifest ⇒ `sheet-files.ts`
           rơi về `contractSafe` ⇒ dán ra Figma đúng cỡ MÁY VẼ chứ không đúng cỡ NGƯỜI DÙNG.
           Vì vậy hai khoá ấy phải đi qua — và chúng an toàn: engine chỉ ĐỌC, không cắt theo.
           `out` chép có gọt (chỉ `w`/`h` dương) để một object rác trong contract cũ không
           thành `int(None)` giữa `slice.py`. */
        const e = { file: c.file, vi: c.vi, spec: c.spec, skel: engineSkel(c.skel) }
        const ow = Number(c.out?.w), oh = Number(c.out?.h)
        if (ow > 0 && oh > 0) e.out = { w: Math.round(ow), h: Math.round(oh) }
        const k = Number(c.drawScale)
        if (k > 0) e.drawScale = k
        return e
      })
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

/* ══ XEM TRƯỚC PROMPT (KITGEN_PROMPTS_ONLY) ═══════════════════════════════════
   MỘT NGUỒN SỰ THẬT DUY NHẤT. Prompt được lắp trong gen.sh, nên bất kỳ bản "dựng
   lại prompt bằng JS" nào ở agent cũng là bản SAO CHÉP — và bản sao thì trôi khỏi
   bản gốc trong im lặng, đúng lúc người dùng đang tin nó để sửa câu chữ. Vì vậy
   xem trước = CHẠY THẬT gen.sh, chỉ chặn nó lại trước vòng gọi codex.
   Rẻ và tất định: chỉ có khung xương + văn bản, không mạng, không quota.

   TRẦN THỜI GIAN là bắt buộc: đây là đường ĐỒNG BỘ của một request HTTP, không
   phải run-store có nút Dừng. Hết giờ thì giết cả cây tiến trình (gen.sh đẻ node
   + python) rồi vẫn TRẢ VỀ những gì đã kịp ghi — caller tự quyết. */
export const PROMPTS_ONLY_TIMEOUT_MS = 60_000

/** Chạy gen.sh ở chế độ chỉ-dựng-prompt. Không ném: trả về phán quyết để caller xử. */
export async function renderPromptsOnly(engineDir, projectDirAbs, contract, { timeoutMs = PROMPTS_ONLY_TIMEOUT_MS } = {}) {
  await prepareEngine(engineDir, projectDirAbs)
  await materializeStyles(projectDirAbs, contract)
  for (const d of ["prompts", "logs"]) await ensureDir(join(projectDirAbs, d))
  const { cmd, args, env } = buildCommand("gen", projectDirAbs, { maxJobs: 1 })
  return new Promise(done => {
    let child
    try {
      child = spawn(cmd, args, {
        cwd: projectDirAbs, detached: !IS_WIN, stdio: ["ignore", "pipe", "pipe"],
        // KITGEN_PROMPTS_ONLY là CÔNG TẮC DUY NHẤT khác với một lượt gen thật —
        // mọi thứ còn lại (bash của Git-Bash, PATH coreutils, PYTHONUTF8) phải y hệt,
        // không thì "xem trước" lại xem một thứ khác với thứ sẽ chạy.
        env: { ...process.env, ...env, KITGEN_PROMPTS_ONLY: "1", PATH: env.PATH ?? process.env.PATH },
        ...winSpawnOpts(),
      })
    } catch (e) { return done({ code: -1, timedOut: false, output: `spawn failed: ${e?.message ?? e}` }) }
    let output = ""
    const cap = c => { if (output.length < 64 * 1024) output += String(c) }
    child.stdout?.on("data", cap)
    child.stderr?.on("data", cap)
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; killTree(child, "SIGKILL") }, timeoutMs)
    const settle = (code, extra = "") => { clearTimeout(timer); done({ code, timedOut, output: output + extra }) }
    child.on("error", e => settle(-1, `spawn failed: ${e?.message ?? e}`))
    child.on("close", code => settle(code ?? -1))
  })
}

/** argv cho từng pha. Client chỉ gửi DANH TỪ; argv do agent dựng, không có chuỗi shell nào của client. */
export function buildCommand(kind, projectDirAbs, { variants = [], sheets = null, maxJobs = 4, imgHome = null }) {
  const env = {}
  if (kind === "gen") {
    env.MAXJOBS = String(maxJobs)
    // Không đặt IMG_HOME = Codex dùng home mặc định (~/.codex) — đường của MỌI người
    // dùng từ 24/08/2026 (hồ sơ ảnh riêng đã bỏ). KITGEN_CODEX_HOME là cửa thoát
    // dev/test duy nhất; đây là path, không phải credential.
    const homeOverride = imgHome ?? process.env.KITGEN_CODEX_HOME
    if (homeOverride) {
      const raw = String(homeOverride)
      env.IMG_HOME = raw.startsWith("~") ? join(homedir(), raw.slice(1)) : raw
    }
    // KHÔNG truyền argv filter: styles.json đã thu hẹp đúng tập job (filter của gen.sh là substring)
    // bashCommand(): darwin/linux trả ĐÚNG {cmd:"bash", args:[abs], env:{}} như trước;
    // win32 trả bash.exe của Git for Windows + path dạng /c/… + PATH có coreutils.
    const b = bashCommand([join(projectDirAbs, "gen.sh")])
    // pythonEnv(): gen.sh có heredoc `python3 - <<PY` đọc styles.json (UTF-8, có tiếng
    // Việt). Trên Windows thiếu biến này là engine chết ngay dòng đầu. Non-win trả {}.
    return { cmd: b.cmd, args: b.args, env: { ...env, ...b.env, ...pythonEnv() } }
  }
  if (kind === "slice") {
    /* `--sheet=<id>` = CẮT LŨY TIẾN (slice.py: parse_cli). Không truyền `sheets` thì
       argv giống hệt bản cũ ⇒ pha cắt tổng cuối lượt không đổi một chữ. Chỉ nhận
       DANH TỪ có sẵn trong contract (caller là run-handle, không phải client). */
    const only = Array.isArray(sheets) && sheets.length ? sheets.map(s => `--sheet=${s}`) : []
    const p = pythonCommand([join(projectDirAbs, "slice.py"), ...variants, ...only])
    return { cmd: p.cmd, args: p.args, env: { ...env, ...pythonEnv() } }
  }
  /* KHÔNG CÒN `kind === "skeleton"`. Nó từng chạy `render-skeleton.mjs` cho nút "vẽ
     lại khung xương". Khung xương đã bỏ (xem khối đầu gen.sh), nên nhánh này không
     còn thứ gì để chạy — và `runs.mjs` cũng đã loại "skeleton" khỏi tập kind hợp lệ,
     tức request kiểu cũ bị từ chối Ở CỔNG với BAD_REQUEST chứ không rơi tới đây. */
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

/* MỘT CÂU cho CẢ LƯỢT CHẠY (BACKLOG #22).
   Vì sao phải có ở TẦNG AGENT chứ không để web tự gộp: chủ sản phẩm đã hai lần gặp
   "100% job chết mà nó chẳng báo gì cả" — mỗi ô tự nói lỗi của mình, không ai nói
   tổng. Câu này đi kèm run.json nên nó CÒN SỐNG sau khi đóng tab, và mọi bề mặt
   (banner project, thẻ Home, khối copy chẩn đoán) đọc CÙNG một chuỗi, không ai tự chế. */
const DIAGNOSIS_VI = {
  QUOTA_SUSPECTED: "nghi chạm giới hạn tạo ảnh",
  NOT_LOGGED_IN: "công cụ tạo ảnh chưa đăng nhập",
  NO_ARTIFACT: "không ghi được ảnh",
  TIMEOUT: "quá thời gian chờ",
  UNKNOWN: "lỗi chưa rõ nguyên nhân",
}

/** "10/10 job không ghi được ảnh" · "3/8 job: 2 không ghi được ảnh · 1 quá thời gian chờ". */
export function summarizeFailures(jobs) {
  const list = Array.isArray(jobs) ? jobs : []
  const failed = list.filter(j => j?.status === "failed")
  if (!failed.length) return null
  const byDiag = new Map()
  for (const j of failed) {
    const d = DIAGNOSIS_VI[j.diagnosis] ? j.diagnosis : "UNKNOWN"
    byDiag.set(d, (byDiag.get(d) ?? 0) + 1)
  }
  const head = `${failed.length}/${list.length} job`
  // Một nguyên nhân duy nhất ⇒ nói thẳng, không bắt người đọc giải mã dấu chấm giữa.
  if (byDiag.size === 1) return `${head} ${DIAGNOSIS_VI[[...byDiag.keys()][0]]}`
  const parts = [...byDiag.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${n} ${DIAGNOSIS_VI[d]}`)
  return `${head}: ${parts.join(" · ")}`
}

export { REPO_DIR }
