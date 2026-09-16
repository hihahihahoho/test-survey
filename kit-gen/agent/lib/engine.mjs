/* engine.mjs — adapter mỏng sang ENGINE JS (`agent/engine/`).
 *
 * ╔══ BƯỚC ④, 16/09/2026: AGENT THÔI SPAWN bash/python ════════════════════════╗
 * ║ TRƯỚC: engine là `gen.sh` + `slice.py` + `geometry.py`, và cả ba neo đường   ║
 * ║ dẫn theo THƯ MỤC CHỨA SCRIPT (`cd "$(dirname "$0")"` / `HERE = dirname(     ║
 * ║ abspath(__file__))`). Agent vì thế phải COPY engine vào từng project để      ║
 * ║ HERE = project — mỗi project mang theo một bản sao engine.                   ║
 * ║ NAY: engine là JS, nằm trong gói agent, và nhận `<projectDir>` bằng argv.    ║
 * ║   · `prepareEngine` KHÔNG chép file nào nữa (project chỉ còn là DỮ LIỆU);    ║
 * ║   · `buildCommand` trả `node <engineDir>/cli.mjs <lệnh> <projectDir> …`;     ║
 * ║   · `resolveEngine` tìm `cli.mjs`, không tìm `gen.sh`.                       ║
 * ║ `gen.sh`/`slice.py` VẪN CÒN trong repo tới bước ⑤ (xoá cùng installer),      ║
 * ║ nhưng KHÔNG còn đường nào của agent chạy tới chúng.                          ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * CHỐNG "ĐỔ QUOTA OAN": filter của `gen` là SUBSTRING (`prompts-io.mjs::match`), nên
 * truyền "tet-main" sẽ chạy luôn "tet-main2". Vì vậy pha gen KHÔNG dùng argv filter:
 * agent ghi styles.json **thu hẹp đúng tập job đã chọn** (đóng E7). Pha slice thì dùng
 * argv vì `slice.mjs` so khớp TẬP CHÍNH XÁC (`!ONLY.has(sid)`).
 */
import { spawn } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"
import { exists, writeJsonAtomic, ensureDir } from "./fsx.mjs"
import { IS_WIN, killTree, winSpawnOpts } from "./platform.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_DIR = resolve(HERE, "..", "..")

/** Cửa vào của engine JS — file DUY NHẤT mà agent spawn. */
export const ENGINE_CLI_NAME = "cli.mjs"

/** Thư mục engine đi kèm gói agent (`agent/engine`). Đây là engine của mọi máy thật;
 *  `ws.engineDir` chỉ thắng khi ở đó có một bản engine JS mới hơn do installer đặt. */
const BUILTIN_ENGINE_DIR = resolve(HERE, "..", "engine")

/* DANH SÁCH FILE ENGINE PHẢI CHÉP VÀO PROJECT: KHÔNG CÒN CÁI NÀO, và đó là cả điểm
   của bước ④. Trước đây nó là `gen.sh` · `slice.py` · `geometry.py` · `element-lib.json`
   · `validate_output_geometry.py`. Engine JS đọc đúng MỘT file dữ liệu trong project —
   `styles.json` — và file ấy do `materializeStyles()` ghi ra chứ không chép từ đâu cả
   (đã soi: `prompts-io.mjs`, `prompt.mjs`, `gen.mjs`, `slice.mjs` không mở file nào
   khác của engine; `element-lib.json` do `lib/templates.mjs` đọc THẲNG từ engineDir,
   chưa bao giờ đọc bản chép trong project). Hằng số ở lại để nói ra điều đó thành lời
   thay vì để lại một khoảng trống không ai giải thích. */
export const ENGINE_FILES = []

/** Tìm engine: bản cài trong workspace (.kitgen/engine) trước, rồi bản đi kèm agent.
 *  `null` là "máy này không có engine nào" — trên máy thật KHÔNG BAO GIỜ xảy ra
 *  (engine nằm trong chính gói agent đang chạy), nhưng test trỏ `ws.engineDir` sang
 *  một engine giả và route vẫn phải có câu trả lời cho ca "không tìm thấy". */
export async function resolveEngine(ws) {
  for (const dir of [ws.engineDir, BUILTIN_ENGINE_DIR]) {
    if (dir && await exists(join(dir, ENGINE_CLI_NAME))) return dir
  }
  return null
}

/** Trước đây: chép engine vào project để HERE = project. Nay KHÔNG CHÉP GÌ — chỉ đảm
 *  bảo thư mục project có mặt. Giữ chữ ký cũ vì ba caller (`run-handle`, `sheet-kits`,
 *  `renderPromptsOnly`) đều gọi nó ngay trước khi ghi `styles.json`, và "thư mục có
 *  tồn tại không" vẫn là câu hỏi phải trả lời ở đúng chỗ ấy. */
export async function prepareEngine(engineDir, projectDirAbs) {
  await ensureDir(projectDirAbs)
  return []
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
/* `matte` BỊ LƯỢC Ở ĐÂY (08/09/2026). Nó là cờ đời tách-nền-bằng-key: `gen.sh` in
   thêm một khối câu chữ theo nó, `slice.py` chọn nhánh giải ngược theo nó. Cả hai
   vế đã bỏ — độ trong của một ô nay chỉ là chữ trong `spec`. Contract ĐÃ LƯU của
   người dùng vẫn còn khoá ấy và vẫn phải chạy được: nó không bị coi là lỗi, không
   bị cảnh báo, chỉ đơn giản không đi tiếp sang styles.json. (`validate.mjs` chưa
   bao giờ kiểm `matte` nên ở đó không có gì để bỏ.) */
function engineSkel(skel) {
  const s = skel ?? DEFAULT_SKEL_V1
  const mapped = SHAPE_TO_ENGINE[s.shape]
  const out = mapped ? { ...s, shape: mapped } : s
  if (!("matte" in out)) return out
  const { matte: _drop, ...rest } = out
  return rest
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
      /* `fingerprint` là SỔ GHI CHÉP CỦA AGENT (xem `lib/fingerprints.mjs`), không
         phải đầu vào của engine. Gọt ở đây để một trường nội bộ không bao giờ đi
         vào `styles.json` — thứ `gen.sh` đọc để dựng prompt. */
      delete out.fingerprint
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
   MỘT NGUỒN SỰ THẬT DUY NHẤT. Prompt được lắp trong engine (`engine/prompt.mjs`), nên
   bất kỳ bản "dựng lại prompt" nào ở tầng agent cũng là bản SAO CHÉP — và bản sao thì trôi khỏi
   bản gốc trong im lặng, đúng lúc người dùng đang tin nó để sửa câu chữ. Vì vậy
   xem trước = CHẠY THẬT engine, chỉ chặn nó lại trước vòng gọi codex.
   Rẻ và tất định: chỉ có khung xương + văn bản, không mạng, không quota.

   TRẦN THỜI GIAN là bắt buộc: đây là đường ĐỒNG BỘ của một request HTTP, không
   phải run-store có nút Dừng. Hết giờ thì giết cả cây tiến trình rồi vẫn TRẢ VỀ
   những gì đã kịp ghi — caller tự quyết. */
export const PROMPTS_ONLY_TIMEOUT_MS = 60_000

/** Chạy engine ở chế độ chỉ-dựng-prompt. Không ném: trả về phán quyết để caller xử. */
export async function renderPromptsOnly(engineDir, projectDirAbs, contract, { timeoutMs = PROMPTS_ONLY_TIMEOUT_MS } = {}) {
  await prepareEngine(engineDir, projectDirAbs)
  await materializeStyles(projectDirAbs, contract)
  for (const d of ["prompts", "logs"]) await ensureDir(join(projectDirAbs, d))
  const { cmd, args, env } = buildCommand("gen", projectDirAbs, { maxJobs: 1, engineDir })
  return new Promise(done => {
    let child
    try {
      child = spawn(cmd, args, {
        cwd: projectDirAbs, detached: !IS_WIN, stdio: ["ignore", "pipe", "pipe"],
        // KITGEN_PROMPTS_ONLY là CÔNG TẮC DUY NHẤT khác với một lượt gen thật — mọi
        // biến còn lại phải y hệt, không thì "xem trước" lại xem một thứ khác với thứ
        // sẽ chạy. (Từ bước ④ không còn PATH riêng nào để giữ: tiến trình con là
        // chính `process.execPath`, không đi qua shell.)
        env: { ...process.env, ...env, KITGEN_PROMPTS_ONLY: "1" },
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

/**
 * argv cho từng pha. Client chỉ gửi DANH TỪ; argv do agent dựng, không có chuỗi shell
 * nào của client — và từ bước ④ cũng không có SHELL nào: `cmd` luôn là `process.execPath`
 * (chính binary node đang chạy agent), nên không còn phụ thuộc vào PATH, vào `bash` của
 * Git for Windows, hay vào một `python3` mà máy người dùng có thể không có.
 *
 * `engineDir` mặc định là engine đi kèm agent; test trỏ nó sang engine giả.
 */
export function buildCommand(kind, projectDirAbs, {
  variants = [], sheets = null, maxJobs = 4, imgHome = null, engineDir = null,
} = {}) {
  const cli = join(engineDir ?? BUILTIN_ENGINE_DIR, ENGINE_CLI_NAME)
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
    // KHÔNG truyền argv filter: styles.json đã thu hẹp đúng tập job (filter của `gen`
    // là substring — xem khối đầu file).
    return { cmd: process.execPath, args: [cli, "gen", projectDirAbs], env }
  }
  if (kind === "slice") {
    /* `--sheet=<id>` = CẮT LŨY TIẾN (`slice.mjs: parseCli`). Không truyền `sheets` thì
       argv giống hệt bản cũ ⇒ pha cắt tổng cuối lượt không đổi một chữ. Chỉ nhận
       DANH TỪ có sẵn trong contract (caller là run-handle, không phải client). */
    const only = Array.isArray(sheets) && sheets.length ? sheets.map(s => `--sheet=${s}`) : []
    return { cmd: process.execPath, args: [cli, "slice", projectDirAbs, ...variants, ...only], env }
  }
  if (kind === "validate") {
    /* `validate_output_geometry.py` cũ. Caller truyền cờ đã dựng sẵn (`--image …`);
       ở đây chỉ nối `<projectDir>` vào đầu cho cùng hình dạng với hai lệnh trên. */
    return { cmd: process.execPath, args: [cli, "validate", projectDirAbs, ...variants], env }
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
  /* THỨ TỰ LÀ MỘT PHÁN QUYẾT, KHÔNG PHẢI THÓI QUEN GÕ PHÍM.
     QUOTA đứng TRƯỚC MODEL_BUSY vì hai câu chuyện nghe giống nhau mà cách chữa
     ngược nhau: hết lượt thì thử lại NGAY chỉ tốn thêm một lần bị từ chối (phải
     chờ hạn mức đặt lại), còn máy vẽ quá tải thì thử lại sau vài phút là xong.
     Mẫu QUOTA cố tình KHÔNG có chữ "capacity": «Selected model is at capacity»
     là lời của NHÀ CUNG CẤP về cỗ máy của họ, không phải về hạn mức của tài khoản
     — nuốt nhầm nó thì người dùng được khuyên đi chờ hạn mức mà hạn mức vẫn đầy. */
  if (/rate limit|429|quota|usage limit|too many requests/.test(hay)) return "QUOTA_SUSPECTED"
  /* SỰ CỐ 15/09/2026 (r-0059, job `chinh-ui2`): log codex kết bằng ĐÚNG hai dòng
     «ERROR: Selected model is at capacity. Please try a different model.», không
     một ảnh nào được sinh — mà UI chỉ nói được "1/2 job lỗi chưa rõ nguyên nhân".
     Hay gặp nhất khi bấm vẽ lại CẢ THẺ: nhiều lượt liên tiếp đập vào cùng một model. */
  if (/at capacity|capacity|overloaded|service unavailable|503|temporarily unavailable/.test(hay)) return "MODEL_BUSY"
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
  MODEL_BUSY: "máy vẽ đang quá tải, thử lại sau ít phút",
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
