/* gen.mjs — VÒNG GỌI CODEX CỦA `gen.sh`, VIẾT LẠI BẰNG JS.
 *
 * Tương ứng `gen.sh` từ dòng ~1287 (`run_one`) tới hết file, cộng phần đầu đọc biến
 * môi trường (model, effort, IMG_HOME, MAXJOBS). Phần LẮP PROMPT nằm ở `prompt.mjs`
 * (bước ①); ở đây chỉ còn việc gọi codex, đọc log, và PHÁN.
 *
 * ╔══ HỢP ĐỒNG LÀ STDOUT, KHÔNG PHẢI HÀM ═══════════════════════════════════════╗
 * ║ Tầng trên (`run-handle.mjs::parseGenLine`) không gọi hàm nào ở đây — nó đọc  ║
 * ║ TỪNG DÒNG CHỮ. Bốn mẫu dưới đây là hợp đồng, sai một ký tự là giao diện đứng ║
 * ║ im suốt cả lượt gen:                                                         ║
 * ║   prompt → prompts/<job>.txt (+N ảnh kèm)   → job chuyển sang "đang chạy"    ║
 * ║   OK  <job>  <cỡ>[  ghi chú]                → job xong, kéo ảnh về web       ║
 * ║   FAIL <job> (…)                            → job hỏng + chẩn đoán           ║
 * ║   ⏳ <job>: model quá tải — thử lại lần k…   → chỉ để người xem đọc           ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG dùng `bash`, `python3`, `stat`, `shasum`, `du`, `grep`, `tail` — đó là cả
 * lý do tồn tại của file này. Mỗi chỗ thay một lệnh ngoài đều ghi rõ nó thay gì.
 */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { open, readFile, appendFile, readdir, stat, copyFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { decode } from "./png.mjs"
import { pyFormatF } from "./pyjson.mjs"
import { listJobs } from "./prompt.mjs"
import { renderPrompts, match } from "./prompts-io.mjs"

/* ── NHỮNG LỆNH NGOÀI ĐÃ BỊ THAY ────────────────────────────────────────────── */

/** `mtime_epoch` của gen.sh (`stat -c %Y` / `stat -f %m`, thiếu file ⇒ 0). */
export async function mtimeEpoch(p) {
  try { return Math.floor((await stat(p)).mtimeMs / 1000) } catch { return 0 }
}

/** `file_hash`: sha256 của nội dung, hoặc CHUỖI RỖNG khi chưa có file.
 *  Rỗng phải KHÁC mọi băm thật — "chưa có ảnh" không bao giờ được nhầm thành
 *  "ảnh không đổi", vì hai ca ấy in ra hai câu khác hẳn nhau. */
export async function fileHash(p) {
  try { return createHash("sha256").update(await readFile(p)).digest("hex") } catch { return "" }
}

/**
 * `du -h <file> | cut -f1`.
 *
 * ⚠️ ĐÂY LÀ CHỖ KHÔNG KHỚP ĐƯỢC TUYỆT ĐỐI, và nói ra thì tốt hơn giả vờ:
 *  · `du` đo Ô ĐĨA ĐÃ CẤP (`st_blocks × 512`), không đo cỡ file. Node có
 *    `stat().blocks` trên POSIX; trên Windows nó là 0, nên ở đó phải ước lượng
 *    bằng cách làm tròn LÊN theo ô 4 KiB — đúng thứ mọi hệ tệp hiện đại làm.
 *  · Cách IN thì `du` của BSD (macOS) và của GNU (Linux, Git-Bash) khác nhau:
 *    BSD căn phải trong 4 ký tự (" 12K") và gọi 0 byte là "0B"; GNU không đệm
 *    và in "0". Bản này theo BSD — nền tảng mà `gen.sh` được viết và đo trên đó.
 *  Con số này CHỈ để người đọc liếc qua: `parseGenLine` không đọc nó.
 */
export function humanSize(bytes) {
  const U = ["B", "K", "M", "G", "T", "P", "E"]
  let s = 0, v = bytes
  while (v >= 1000 && s < U.length - 1) { v /= 1024; s++ }
  // `HN_DECIMAL`: dưới 10 thì một chữ số thập phân, từ 10 trở lên thì số nguyên.
  const txt = (s > 0 && v < 10 ? v.toFixed(1) : String(Math.round(v))) + U[s]
  return txt.padStart(4, " ")
}

export async function duH(p) {
  let st
  try { st = await stat(p) } catch { return humanSize(0) }
  const bytes = st.blocks > 0 ? st.blocks * 512 : Math.ceil(st.size / 4096) * 4096
  return humanSize(bytes)
}

/* ── PHÉP ĐO NỀN (`alpha_verdict`) ──────────────────────────────────────────── */

/** `"%.0f%%" % (x * 100)` của Python — làm tròn VỀ SỐ CHẴN, không phải lên. */
const pct = (x, prec = 0) => pyFormatF(x * 100, prec)

/** Ngưỡng của nhánh full-bleed (`FULL_BLEED_MAX_TRONG` trong khối python). */
export const FULL_BLEED_MAX_TRONG = 0.10

/**
 * `alpha_verdict "<file>" "<fullbleed>"` của gen.sh — NGUYÊN VĂN từng câu.
 *
 * Trả về chuỗi mở đầu bằng `ok ` / `bad ` / `skip `. Từ 09/09/2026 verdict "bad"
 * KHÔNG còn quyền gì (không thử lại, không loại ảnh, không đánh trượt job) — nó chỉ
 * là một ghi chú. Nhưng nó vẫn phải nói ĐÚNG, vì log và UI đọc nó.
 *
 * `skip` ở bản bash nghĩa là "máy không có Pillow". Ở bản JS không có Pillow nào để
 * mà thiếu, nên `skip` chỉ còn một nguyên nhân: KHÔNG GIẢI MÃ NỔI tấm PNG — và khi
 * ấy nó dùng đúng câu của bash cho ca "phép kiểm không chạy được".
 */
export async function alphaVerdict(file, fullBleed) {
  let im
  try { im = decode(await readFile(file)) } catch { return "skip không chạy được phép kiểm alpha" }

  if (!im.bands.includes("A")) {
    if (fullBleed) {
      return `ok full-bleed, ảnh đục hoàn toàn (mode=${im.mode}) — đúng yêu cầu phủ kín`
    }
    return `bad KHÔNG có kênh alpha (mode=${im.mode}). image_gen phải trả PNG RGBA — ` +
      "đường tách nền đã bỏ nên không có gì cứu được ảnh này."
  }

  // `Image.open(f).convert("RGBA").getchannel("A").histogram()` — png.mjs đã convert.
  const h = new Float64Array(256)
  for (let i = 3; i < im.data.length; i += 4) h[im.data[i]]++
  const n = (im.width * im.height) || 1
  let mid = 0
  for (let v = 1; v <= 254; v++) mid += h[v]        // `sum(h[1:255])` — KHÔNG có 255
  const trong = h[0] / n, mo = mid / n

  if (fullBleed) {
    if (trong > FULL_BLEED_MAX_TRONG) {
      return `bad sheet nền phải phủ KÍN ô mà ${pct(trong)}% pixel lại trong suốt — cảnh bị vẽ ` +
        "thụt vào, chừa khung rỗng quanh cạnh. Sinh lại."
    }
    return `ok full-bleed, trong suốt ${pct(trong)}% (phủ kín, đúng hợp đồng)`
  }
  if (trong < 0.02) {
    return "bad có kênh alpha nhưng gần như không chỗ nào trong suốt " +
      `(alpha=0 chỉ ${pct(trong, 2)}%) — model vẽ đè kín nền.`
  }
  if (mo < 0.005) {
    return `bad alpha CHỈ CÓ 0 và 255 (dải mờ ${pct(mo, 3)}%). Đó là dấu vân tay của một phép ` +
      "TÁCH NỀN bằng script, không phải alpha do image_gen vẽ — nhiều khả năng " +
      "model đã tự viết công cụ xoá nền. Sinh lại."
  }
  return `ok trong suốt ${pct(trong)}%, dải mờ ${pct(mo)}%`
}

/* ── LẮP TASK GỬI CODEX ─────────────────────────────────────────────────────── */

/** `case "$head1" in *PORTRAIT*|…` — ĐỌC NGƯỢC khổ ra từ chính prompt, không tính lại.
 *  Ba khổ là ba nhánh LOẠI TRỪ NHAU: dò "portrait" trước thì nhánh "square" không bao
 *  giờ tới (bẫy đã suýt dính — xem test/gen-canvas-size.test.sh). */
export function canvasOf(head3) {
  if (/PORTRAIT|portrait/.test(head3)) return { size: "1024x1536", orient: "portrait" }
  if (/SQUARE|square/.test(head3)) return { size: "1254x1254", orient: "square" }
  return { size: "1536x1024", orient: "landscape" }
}

/** `head -n3 file` rồi `$(…)`: ba dòng đầu, đã cắt xuống dòng ở cuối. */
const head3 = text => text.split("\n").slice(0, 3).join("\n").replace(/\n+$/, "")

/**
 * Khối chữ mà `run_one` gói quanh prompt trước khi đưa cho `codex exec`.
 *
 * ⚠️ TASK ĐỨNG GẦN LỜI GỌI TOOL HƠN PROMPT, nên khi hai bên nói ngược nhau thì
 * codex nghe task. Đó là lý do `fullBleed` phân nhánh CẢ BỐN đoạn nói về nền chứ
 * không chỉ lật chiều phép đo (sự cố r-0041, 15/09/2026).
 */
export function buildTask({ job, promptText, attPaths, rootOut, fullBleed }) {
  const { size, orient } = canvasOf(head3(promptText))

  let bgKw = 'background="transparent"'
  let pSkill = 'follow its transparent-image rule: call image_gen with background="transparent" (PNG output) so the tool itself returns a genuinely transparent background, and preserve the alpha channel it gives back.'
  let pRule = "One rule matters more than everything else: the transparency has to come from image_gen itself."
  let pFail = "If image_gen still hands you an opaque image after the one retry described below, just say so plainly and stop: a background cut out by hand is detected and rejected, and it wastes the whole run."
  let pCheck = "Before you reply, look at the image image_gen returned — it is shown to you in this conversation — and check that its alpha channel is real: genuinely empty pixels where the background should be, not a pattern painted onto opaque pixels to imitate transparency. This is a visual check by you; image_gen has no verification control and you do not need one. If the image came back opaque, call image_gen ONE more time with the same prompt and the same reference images, asking for background=\"transparent\" explicitly again, and save that second image to the path above."
  let pWant = "a transparent background"
  if (fullBleed) {
    bgKw = 'background="opaque"'
    pSkill = 'then treat this sheet as what it is — a FULL-FRAME background: call image_gen with background="opaque" (PNG output) so the tool returns an image that is solid from edge to edge, and do not ask it for transparency of any kind.'
    pRule = "One rule matters more than everything else: the image has to come from image_gen itself."
    pFail = "If image_gen still hands you an image with transparent areas after the one retry described below, just say so plainly and stop: a background flattened by hand is detected and rejected, and it wastes the whole run."
    pCheck = "Before you reply, look at the image image_gen returned — it is shown to you in this conversation — and check that the PNG is fully opaque edge to edge: no transparent or semi-transparent pixel anywhere, and no empty margin along any side. This is a visual check by you; image_gen has no verification control and you do not need one. If any part came back transparent, call image_gen ONE more time with the same prompt and the same reference images, asking for background=\"opaque\" explicitly again, and save that second image to the path above."
    pWant = "an opaque, full-frame background"
  }

  /* ╔══ VÌ SAO TASK PHẢI TỰ ĐỦ, KHÔNG ĐƯỢC DỰA VÀO VIỆC ĐỌC SKILL.md ═══════════╗
     ║ r-0021 máy Windows phuongna 22/09/2026 (3.0.9), cả ba tấm rc=0 mà không     ║
     ║ có ảnh, model tự thuật: «policy blocked reading the required SKILL.md, the  ║
     ║ workspace is read-only, and the available image_gen tool lacks explicit     ║
     ║ background, PNG, size, and alpha-verification controls. No file was         ║
     ║ created.» Codex trên Windows hạ sandbox xuống read-only nên mọi exec (kể cả ║
     ║ đọc SKILL.md) bị chặn; task thì đòi tham số mà tool không có; model suy ra  ║
     ║ «không làm được» và KHÔNG GỌI image_gen lần nào. Nên: (1) nói trước rằng    ║
     ║ bị chặn đọc/chạy là chuyện BÌNH THƯỜNG, không phải lý do dừng; (2) chép     ║
     ║ đúng luật cần thiết của SKILL.md vào đây — nền, PNG, khổ đi trong CHỮ gửi   ║
     ║ tool nếu tool không có tham số; (3) chép về raw/ mà bị từ chối thì đừng thử ║
     ║ lại, trả về đường dẫn tool đã ghi, engine tự vớt (xem `salvage`).          ║
     ╚══════════════════════════════════════════════════════════════════════════╝ */
  const pBlocked = `If this session refuses to read files or to run commands — a read-only sandbox, or a message such as "rejected: blocked by policy" — that is EXPECTED on some machines and is NOT a reason to stop or to report failure. Everything you need from the skill is already here: the built-in image_gen tool takes a prompt and referenced_image_paths; if it does not expose background, size or output-format parameters, ask for ${pWant}, PNG output and a ${size} (${orient}) canvas in the text you send it and carry on. Never answer that a parameter or a verification control is missing, never fall back to the CLI script, and never skip the image_gen call.`
  const pCopyBlocked = `If that copy is refused (read-only sandbox, "blocked by policy"), do NOT try again with another command and do NOT report a failure: the app collects the image itself from the folder image_gen saved it in. Just reply with the path image_gen reported.`

  /* `-i` chỉ đính ảnh vào CUỘC HỘI THOẠI — tool image_gen KHÔNG tự thấy chúng. Muốn
     ảnh tới tay tool thì đường dẫn phải được NÓI RA để model truyền vào
     `referenced_image_paths`. Bản cũ không nói ⇒ model gọi tool tay không. */
  const attNote = attPaths.length === 0 ? "" :
    "The reference images are attached to this conversation AND exist on disk at the exact paths listed below. " +
    "The prompt names each image by its ROLE (character reference photo, pose reference sheet, brand or inspiration images) — " +
    "match them by what the image shows, never by their position in this list. When you call image_gen you MUST pass ALL of these paths, " +
    "in this exact order, in its referenced_image_paths parameter. Never call it without them, and never claim the images are unavailable — they are right here:\n" +
    "\n--- REFERENCE IMAGES START ---\n" + attPaths.map(p => p + "\n").join("") +
    "--- REFERENCE IMAGES END ---\n\n"

  return `Use the imagegen skill and its built-in image_gen tool for this. If you have not read that skill yet, read its SKILL.md first and ${pSkill}

${pBlocked}

${pRule} You must not write, compile or run any program, script or tool of your own that removes, keys out, erases or otherwise edits the background or the alpha channel of the image — that includes Python, Swift, ffmpeg, ImageMagick, chroma keying, remove_chroma_key.py and the CLI fallback scripts/image_gen.py. Copying or moving the resulting file is fine. ${pFail}

${attNote}Generate ONE image with the built-in image_gen tool, passing ${bgKw} and PNG output. The output image MUST be exactly ${size} pixels (${orient}) — this is a hard requirement, not a preference; do not return any other aspect ratio. Use EXACTLY the prompt between the IMAGE PROMPT markers below. Then save/copy the generated PNG to exactly this path: ${rootOut}/raw/${job}.png (overwrite if it exists). Do not edit, crop or annotate the image. ${pCopyBlocked}

${pCheck} Never more than two image_gen calls for this job, and never repair the background yourself.

Reply with only the saved file path (or, if the copy was refused, the path image_gen reported).

--- IMAGE PROMPT START ---
${promptText.replace(/\n+$/, "")}
--- IMAGE PROMPT END ---`
}

/* ── GỌI CODEX ──────────────────────────────────────────────────────────────── */

/** `codex` trên PATH, hoặc đường dẫn mà bộ ca chỉ định (cùng lối với lib/codex-*.mjs). */
export const codexBin = () => process.env.KITGEN_CODEX_BIN || "codex"

/**
 * `… codex exec … >log 2>&1` (append = `>>`). Trả về mã thoát.
 *
 * `stdio` trỏ THẲNG vào fd của file log, y như phép chuyển hướng của bash — không
 * đi vòng qua bộ đệm của Node, nên log của các job chạy song song không trộn vào
 * nhau và không mất dòng nào khi tiến trình bị giết giữa chừng.
 *
 * `codex` không có trên PATH ⇒ bash in "command not found" VÀO CHÍNH LOG (phép
 * chuyển hướng đã có hiệu lực) rồi trả 127. Giữ nguyên cả hai, vì `diagnose()` của
 * agent đọc log ấy để phân biệt "thiếu codex" với "chạy xong mà không có ảnh".
 */
async function runCodex({ args, cwd, env, logPath, append }) {
  const fh = await open(logPath, append ? "a" : "w")
  try {
    return await new Promise(resolve => {
      let child
      try {
        child = spawn(codexBin(), args, { cwd, env, stdio: ["ignore", fh.fd, fh.fd] })
      } catch (e) {
        appendFile(logPath, `${codexBin()}: ${e?.message ?? e}\n`).catch(() => {})
        return resolve(127)
      }
      child.on("error", e => {
        appendFile(logPath, `${codexBin()}: command not found (${e?.message ?? e})\n`)
          .catch(() => {}).then(() => resolve(127))
      })
      child.on("close", code => resolve(code === null ? 1 : code))
    })
  } finally { await fh.close() }
}

/** `codex debug models` — cổng RẺ, chạy trên đĩa, không gọi mạng. Trả stdout (catalog)
 *  hoặc `null` khi không hỏi được. Hỏi MỘT lần rồi tra cả model chính lẫn model dự
 *  phòng trên cùng một bản: hai lần spawn là hai cơ hội để hai câu trả lời lệch nhau.
 *  Catalog chỉ chứng minh bản codex này BIẾT tên model; provider có chịu phục vụ hay
 *  không thì chỉ nhánh tự chữa trong `runOne` mới trả lời được. */
async function codexModelCatalog(env) {
  return await new Promise(resolve => {
    let out = ""
    let child
    try {
      child = spawn(codexBin(), ["debug", "models"], { env, stdio: ["ignore", "pipe", "ignore"] })
    } catch { return resolve(null) }
    child.stdout.on("data", d => { out += d })
    child.on("error", () => resolve(null))
    child.on("close", code => resolve(code === 0 ? out : null))
  })
}

const effortArgs = effort => (effort ? ["-c", `model_reasoning_effort="${effort}"`] : [])

/* ══ CHỌN MODEL: CHÍNH → DỰ PHÒNG → HỒ SƠ ══════════════════════════════════════
 *
 * 23/09/2026 mặc định lên `gpt-6-luna`. Nhưng tên đó MỚI: codex 0.154.0 trên máy dev
 * (`codex debug models`, catalog server kéo về `models_cache.json` với client_version
 * 0.154.0) chỉ liệt kê gpt-6-astra, gpt-5.6-sol/terra/luna, gpt-5.5 — KHÔNG có
 * gpt-6-luna; chuỗi `gpt-6-luna` chỉ có trong binary của @openai/codex 0.156.1. Nút
 * «Cập nhật» có chạy `codex update`, nhưng bước ấy có thể quá hạn 180s, bị tắt bằng
 * KITGEN_SKIP_CODEX_UPDATE, hoặc người dùng gen trước khi bấm cập nhật.
 *
 * Trước bản này, cổng chỉ có HAI nấc: biết model ⇒ `-m`, không biết ⇒ rơi thẳng về
 * model của HỒ SƠ — tức cái config.toml đang để, có máy là model đắt ở mức "xhigh".
 * Đổi mặc định sang một tên mới mà giữ hai nấc là đẩy MỌI máy codex cũ về nấc ấy.
 * Nên chen giữa một nấc: model dự phòng `gpt-5.6-luna` (mặc định cũ, đã chạy ổn),
 * vẫn ép `-m` và mức nghĩ.
 *
 * Nấc hồ sơ cũng GHIM MỨC NGHĨ: mức nghĩ độc lập với model (đúng lý do nhánh tự chữa
 * trong `runOne` giữ nó), để hồ sơ tự chọn cả hai là cho "xhigh" cơ hội quay lại.
 * `KITGEN_GEN_MODEL=""` thì KHÁC: đó là người dùng cố ý bảo "đừng ép gì" ⇒ không
 * `-m`, không mức nghĩ, như trước.
 *
 * @returns `{ modelArgs, model, retryArgs, retryModel, note }`
 *   · `model`      — tên sẽ gửi bằng `-m` (null = model của hồ sơ);
 *   · `retryArgs`  — cờ cho ĐÚNG MỘT lượt chạy lại khi provider từ chối `model`:
 *                    dự phòng nếu đang dùng model chính và codex biết dự phòng,
 *                    không thì bỏ `-m` và giữ mức nghĩ;
 *   · `note`       — câu nói cho người đang nhìn màn hình khi phải hạ nấc, hoặc null.
 */
export async function pickModel(cfg, env) {
  const { genModel: primary, genModelFallback: fb, genEffort } = cfg
  const eff = effortArgs(genEffort)
  if (!primary) return { modelArgs: [], model: null, retryArgs: [], retryModel: null, note: null }
  const catalog = (await codexModelCatalog(env)) ?? ""
  const knows = m => !!m && catalog.includes(`"${m}"`)
  const fallback = fb && fb !== primary ? fb : ""
  if (knows(primary)) {
    const viaFb = knows(fallback)
    return {
      modelArgs: ["-m", primary, ...eff], model: primary,
      retryArgs: viaFb ? ["-m", fallback, ...eff] : eff, retryModel: viaFb ? fallback : null,
      note: null,
    }
  }
  if (knows(fallback)) {
    return {
      modelArgs: ["-m", fallback, ...eff], model: fallback, retryArgs: eff, retryModel: null,
      note: `codex trên máy chưa biết model '${primary}' — dùng '${fallback}'. Bấm Cập nhật để nâng codex.`,
    }
  }
  return {
    modelArgs: eff, model: null, retryArgs: eff, retryModel: null,
    note: `codex không biết model '${primary}'${fallback ? ` lẫn '${fallback}'` : ""} — dùng model mặc định của hồ sơ.`,
  }
}

/** Nhãn của model trong log: tên, hoặc "model mặc định của hồ sơ". */
export const modelLabel = m => (m ? `'${m}'` : "model mặc định của hồ sơ")

const sleep = s => new Promise(r => { const t = setTimeout(r, s * 1000); t.unref?.() })

/** `${VAR-default}`: CHƯA ĐẶT thì lấy mặc định, ĐẶT RỖNG thì là rỗng (= tắt hẳn). */
const dashDefault = (v, d) => (v === undefined ? d : v)

/** Cắt tiền tố nếu có, đúng phép `${chuỗi#tiền tố}` của bash. */
const strip = (s, prefix) => (s.startsWith(prefix) ? s.slice(prefix.length) : s)

/**
 * Đọc mọi biến môi trường mà `gen.sh` đọc, một chỗ duy nhất.
 *
 * `GEN_BUSY_BACKOFF` tách theo KHOẢNG TRẮNG vì bash tách mảng bằng IFS; đặt nó
 * thành " " (chỉ khoảng trắng) cho mảng rỗng và khi ấy mọi lần lùi đều 20s —
 * chép nguyên nhánh `if (( ${#busy_waits[@]} > 0 ))`.
 */
export function readEnv(env = process.env) {
  const busyRaw = dashDefault(env.GEN_BUSY_RETRIES, "") || "3"
  const backoff = (env.GEN_BUSY_BACKOFF || "20 45 90").trim().split(/\s+/).filter(Boolean).map(Number)
  return {
    imgHome: env.IMG_HOME || "",
    /* `MAXJOBS=0` là ca DUY NHẤT bản này cố ý không chép: bash rơi vào
       `while (( $(jobs -pr | wc -l) >= 0 )); do sleep 0.5; done` — một vòng lặp
       KHÔNG BAO GIỜ thoát, và lượt gen treo im lặng tới khi ai đó bấm Dừng. Treo
       không phải một hành vi, nó là một chỗ hỏng; ở đây 0 đọc thành mặc định 4. */
    maxJobs: Number(env.MAXJOBS || "4") || 4,
    promptsOnly: env.KITGEN_PROMPTS_ONLY || "",
    /* gpt-6-luna cần codex ≥ ~0.156 — codex cũ hơn tự hạ về `genModelFallback`
       (xem `pickModel`). `KITGEN_GEN_MODEL_FALLBACK=""` tắt nấc dự phòng. */
    genModel: dashDefault(env.KITGEN_GEN_MODEL, "gpt-6-luna"),
    genModelFallback: dashDefault(env.KITGEN_GEN_MODEL_FALLBACK, "gpt-5.6-luna"),
    genEffort: dashDefault(env.KITGEN_GEN_EFFORT, "medium"),
    busyMax: /^[0-9]+$/.test(busyRaw) ? Number(busyRaw) : 3,
    busyWaits: backoff.every(Number.isFinite) ? backoff : [20, 45, 90],
    home: env.HOME || homedir(),
  }
}

/* ── ẢNH THAM CHIẾU ─────────────────────────────────────────────────────────── */

/**
 * Một ảnh kèm có ĐỌC ĐƯỢC không? Trả `null` khi lành, hoặc CÂU TIẾNG VIỆT/lời của
 * decoder nói vì sao hỏng.
 *
 * Ba mức nghiêm khắc khác nhau, và sự chênh lệch ấy là CỐ Ý:
 *  · PNG — giải mã ĐẦY ĐỦ. Đây là định dạng KitGen tự sinh và tự đính, cũng là đúng
 *    định dạng đã hỏng ngoài đời; nửa vời ở đây thì cả phép kiểm này vô nghĩa.
 *  · JPEG/WebP — chỉ soi chữ ký + cỡ + (JPEG) dấu kết EOI `FF D9`. KHÔNG viết thêm
 *    decoder: một decoder JPEG thuần JS là hàng nghìn dòng mà chưa một tấm JPEG nào
 *    hỏng ngoài đời, và code không ai cần là code không ai kiểm.
 *  · Còn lại — chữ ký lạ hoặc 0 byte: codex sẽ từ chối, nên ta từ chối trước.
 *
 * KHÔNG spawn gì cả: chặn một lượt codex bằng cách gọi một tiến trình con nữa là
 * đem đúng loại rủi ro mình đang tránh về đặt cạnh cửa.
 */
export async function refReason(path) {
  let buf
  try { buf = await readFile(path) } catch (e) { return `không đọc được (${e?.code ?? e?.message ?? e})` }
  if (buf.length === 0) return "file rỗng"
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    // `decode` inflate + bỏ filter thật ⇒ zlib gãy và byte filter lạ đều nổ ở đây.
    try { decode(buf); return null } catch (e) { return String(e?.message ?? e) }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    // EOI thiếu = file bị cắt giữa chừng — đúng hình dạng của một cú ghi dở dang.
    return (buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9) ? null : "JPEG cụt"
  }
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF"
      && buf.toString("latin1", 8, 12) === "WEBP") return null
  return "không phải PNG/JPG/WebP"
}

/* ── MỘT JOB ────────────────────────────────────────────────────────────────── */

/**
 * `run_one <job>` — một lượt codex (kèm hai nhánh tự chữa), rồi PHÁN.
 *
 * `ctx` mang những thứ mà bản bash để ở biến toàn cục: `root`, `rootOut`,
 * `modelArgs` (+ `model`/`retryArgs`/`retryModel` của `pickModel`), `imgHome`, `busy*`,
 * và `print` (thay `echo` ra stdout).
 */
export async function runOne(ctx, job) {
  const { root, rootOut, modelArgs, genEffort, imgHome, busyMax, busyWaits, print } = ctx
  /* ctx dựng tay (không qua `prepare`) thì chưa có các khoá của `pickModel`: suy ra
     y như hành vi trước 23/09/2026 — model là cái đứng sau `-m`, chạy lại bỏ `-m`. */
  const mi = modelArgs.indexOf("-m")
  const usedModel = ctx.model !== undefined ? ctx.model : (mi >= 0 ? modelArgs[mi + 1] : null)
  const retryArgs = ctx.retryArgs ?? effortArgs(genEffort)
  const retryModel = ctx.retryModel ?? null
  const P = p => join(root, p)
  const rawPng = P(`raw/${job}.png`)
  const logRel = `logs/${job}.log`
  const logPath = P(logRel)

  /* Dấu full-bleed phải đọc TRƯỚC khi dựng task: nó lái cả câu chữ gửi codex lẫn
     chiều của phép đo alpha, không chỉ phép đo như bản trước 15/09/2026. */
  const fb = await stat(P(`prompts/${job}.fullbleed`)).then(() => true, () => false)

  const promptText = await readFile(P(`prompts/${job}.txt`), "utf8").catch(() => "")

  /* Đọc `.att` TRƯỚC khi dựng task. Gọt `\r` là phòng thủ thật, không phải nghi lễ:
     file `.att` do bản engine cũ sinh trên Windows còn CRLF, và thiếu dòng gọt ấy thì
     phép kiểm tồn tại fail LẶNG LẼ ⇒ mọi ảnh đính kèm rơi hết. */
  const attPaths = []
  const attArgs = []
  const attRels = []
  const attRaw = await readFile(P(`prompts/${job}.att`), "utf8").catch(() => "")
  for (let line of attRaw.split("\n")) {
    line = line.replace(/\r$/, "")
    if (!line) continue
    const abs = join(root, line)
    if (!(await stat(abs).then(s => s.isFile(), () => false))) continue
    attArgs.push("-i", abs)
    attPaths.push(abs)
    attRels.push(line)
  }

  /* ── ẢNH THAM CHIẾU HỎNG ⇒ CHẶN TRƯỚC KHI ĐỐT TOKEN ─────────────────────────
     SỰ CỐ WINDOWS (KitGen 3.0.6): ba job, mỗi job ~40k token và hai phút, rồi tool ảnh
     của codex mới từ chối cái ảnh kèm — «failed to decode image …: Unknown filter
     method 7». Cùng đúng file ấy, lần đọc khác lại than «Corrupt deflate stream» hay
     «filter method 254»: BYTE TRÊN MÁY ẤY ĐANG ĐỔI, và nguyên nhân gốc vẫn chưa rõ.
     Người dùng chỉ nhận được «không ghi được ảnh», không một tên file nào.
     Phép kiểm này KHÔNG chữa nguyên nhân — nó trả lại hai thứ đã mất: TÊN FILE HỎNG
     và 40k token. Nó phải đứng ở ĐÂY, trước `buildTask`/`runCodex`, vì sau đó thì
     tiền đã tiêu rồi.
     Vì sao GIẢI MÃ THẬT chứ không liếc chữ ký: đúng những lỗi codex bắt (zlib gãy,
     byte filter lạ) nằm SAU một chữ ký PNG hoàn toàn hợp lệ. `decode()` của png.mjs
     inflate IDAT rồi bỏ filter TỪNG DÒNG, nên nó vấp đúng chỗ decoder của codex vấp.
     Giá đo được trên corpus golden: một tấm 1536×1024 hết ~55 ms — rẻ hơn một lượt
     codex bốn bậc độ lớn, nên không có lý do nào để đi đường tắt. */
  for (let i = 0; i < attPaths.length; i++) {
    const why = await refReason(attPaths[i])
    if (!why) continue
    /* MỘT file hỏng là đủ để dừng: lượt chạy này chắc chắn không ra ảnh, và liệt kê
       tiếp chỉ làm loãng cái tên mà người dùng cần đi sửa. */
    await appendFile(logPath, `ảnh tham chiếu hỏng: ${attRels[i]} — ${why}\n`)
    print(`FAIL ${job} (rc=0, ảnh tham chiếu hỏng: ${attRels[i]} — xem ${logRel})`)
    return
  }

  const task = buildTask({ job, promptText, attPaths, rootOut, fullBleed: fb })

  const t0 = Math.floor(Date.now() / 1000)
  // Băm ảnh cũ TRƯỚC khi gọi codex — phép phán cuối so byte, không so mtime.
  const h0 = await fileHash(rawPng)
  const env = imgHome ? { ...process.env, CODEX_HOME: imgHome } : { ...process.env }

  const baseArgs = extra => [
    "exec", ...extra,
    "-s", "workspace-write",
    "-C", root,
    "--skip-git-repo-check",
    ...attArgs,
    "-o", `logs/${job}.last.txt`,
    task,
  ]

  let rc = await runCodex({ args: baseArgs(modelArgs), cwd: root, env, logPath, append: false })
  /* Mốc của LƯỢT GẦN NHẤT trong log. Mọi lượt sau đều ghi NỐI, nên soi cả file thì
     lời than "at capacity" của lượt trước còn nằm đó mãi và vòng thử lại sẽ đọc một
     vết cũ thành một sự cố mới, quay vòng cho tới khi hết lượt. */
  let logFrom = 1
  const logText = () => readFile(logPath, "utf8").catch(() => "")
  const logTail = async () => (await logText()).split("\n").slice(logFrom - 1).join("\n")
  const countLines = async () => {
    // `wc -l` đếm KÝ TỰ XUỐNG DÒNG, không đếm dòng cụt cuối file.
    const t = await logText()
    let n = 0
    for (let i = 0; i < t.length; i++) if (t[i] === "\n") n++
    return n
  }

  /* ── PROVIDER TỪ CHỐI TÊN MODEL ⇒ HẠ MỘT NẤC, ĐÚNG MỘT LẦN ──────────────
     Nấc hạ do `pickModel` chọn sẵn: đang dùng model chính mà codex biết model dự
     phòng ⇒ chạy lại bằng dự phòng; còn lại ⇒ model của hồ sơ. Vẫn ĐÚNG MỘT lượt:
     dự phòng mà cũng bị từ chối thì dừng, không leo thang tiếp.
     Chỉ thử lại khi CHƯA CÓ ẢNH MỚI: có ảnh rồi mà chạy lại là tốn thêm một lượt
     sinh ảnh chẳng để làm gì. Điều kiện là có `-m` chứ không phải "có cờ": nấc hồ sơ
     chỉ mang mức nghĩ, và chạy lại y nguyên cờ ấy thì chẳng hạ được gì. */
  let curArgs = modelArgs
  if (usedModel && rc !== 0 && (await mtimeEpoch(rawPng)) < t0 &&
      /unknown model|model not (found|supported)|unsupported model|invalid model|does not (exist|support)|model_not_found/i
        .test(await logText())) {
    await appendFile(logPath,
      `model '${usedModel}' bị provider từ chối — chạy lại bằng ${modelLabel(retryModel)}\n`)
    /* BỎ `-m` (hoặc đổi sang dự phòng), GIỮ mức nghĩ. Thứ bị từ chối là TÊN MODEL;
       mức nghĩ độc lập với model và luôn hợp lệ. Thả nổi mức nghĩ thì lượt chạy lại
       rơi về hồ sơ, mà hồ sơ có thể đang để "fast" — mức bỏ luôn bước đọc SKILL.md,
       đúng thứ vừa phải trả giá. */
    curArgs = retryArgs
    logFrom = (await countLines()) + 1
    rc = await runCodex({ args: baseArgs(curArgs), cwd: root, env, logPath, append: true })
  }

  /* ── MÁY VẼ QUÁ TẢI ⇒ NGỦ RỒI GỌI LẠI, CÙNG MODEL ────────────────────────
     Khác hẳn khối trên: ở đó cái TÊN bị từ chối (chờ bao lâu cũng vậy), ở đây tên vẫn
     đúng, chỉ là cỗ máy đang đầy — một trạng thái TẠM THỜI. Đổi model để lách qua là
     âm thầm giao cho người dùng một tấm ảnh vẽ bằng model họ KHÔNG chọn.
     KHÔNG bắt "429"/"rate limit": đó là hạn mức của TÀI KHOẢN, thử lại sau 20 giây chỉ
     tốn thêm một lần bị từ chối. */
  let busyK = 0
  while (busyK < busyMax && rc !== 0 && (await mtimeEpoch(rawPng)) < t0 &&
         /at capacity|overloaded|503/i.test(await logTail())) {
    let nap = 20
    if (busyWaits.length > 0) nap = busyK < busyWaits.length ? busyWaits[busyK] : busyWaits[busyWaits.length - 1]
    busyK += 1
    // Hai bản của CÙNG một câu: một cho người mổ log của job, một cho người đang ngồi
    // nhìn màn hình. Dòng stdout phải mang TÊN JOB (stdout là của cả lượt chạy) và cố ý
    // KHÔNG mở đầu bằng OK/FAIL/prompt để không bị nhận nhầm thành một phán quyết.
    await appendFile(logPath, `model quá tải — thử lại lần ${busyK} sau ${nap}s\n`)
    print(`⏳ ${job}: model quá tải — thử lại lần ${busyK} sau ${nap}s`)
    await sleep(nap)
    logFrom = (await countLines()) + 1
    /* `curArgs`, KHÔNG phải `modelArgs`: sau một lượt hạ nấc, gọi lại bằng cái tên vừa
       bị từ chối là chắc chắn hỏng lần nữa. */
    rc = await runCodex({ args: baseArgs(curArgs), cwd: root, env, logPath, append: true })
  }

  /* ── VỚT ẢNH (codex ≥0.147) ──────────────────────────────────────────────
     Có khi model sinh ảnh xong nhưng KHÔNG tự copy về đích: tool báo cho model một
     đường dẫn `generated_images` không tồn tại trên máy này, hoặc model chỉ trả lời
     đường dẫn rồi thôi. Đường dẫn không tồn tại thật (container remote) thì không vớt
     được — để phán FAIL như cũ, KHÔNG đoán mò một ảnh khác. */
  if ((await mtimeEpoch(rawPng)) < t0) {
    const ghome = join(imgHome || join(ctx.home, ".codex"), "generated_images")
    /** Chép về đích và ghi ĐÚNG một dòng log; false = không có gì để vớt. */
    const salvage = async (src, note) => {
      if (!(await stat(src).then(f => f.isFile(), () => false))) return false
      try {
        await copyFile(src, rawPng)
        await appendFile(logPath, `${note}\n`)
        return true
      } catch { return false }  // `cp -f` hỏng ⇒ bash bỏ qua vế `&&`, không vớt được thì thôi
    }

    // `grep -oE` khớp TRONG MỘT DÒNG, nên lớp ký tự phải loại cả xuống dòng.
    /* HAI DẤU GẠCH, VÌ CODEX IN ĐƯỜNG DẪN CỦA HỆ ĐIỀU HÀNH CHỨ KHÔNG PHẢI CỦA URL:
       trên Windows nó là `C:\…\.codex\generated_images\<session>\exec-….png`, và khi
       đường dẫn ấy nằm trong một thông báo lỗi của codex thì nó còn là chuỗi Debug
       của Rust nên MỖI dấu gạch bị nhân lên 8 lần. Mẫu chỉ có `/` thì cửa vớt IM LẶNG
       không bao giờ mở trên Windows — đúng chỗ người dùng thật đang ngồi.
       `rel` giữ nguyên chữ codex đã in (để ghi log cho khớp), còn phần đuôi thì tách
       theo CẢ HAI dấu — `+` nuốt luôn cả cụm gạch nhân bản — rồi `join` lại thành
       đường dẫn của MÁY NÀY. Dấu nháy và dấu cách bị loại khỏi lớp ký tự chính là thứ
       giữ cho vế `-Destination '…\raw\chinh-nen.png'` (cũng kết thúc bằng .png!)
       không bị nuốt chung vào một match. */
    const hits = (await logText()).match(/generated_images[\/\\][^"' \n]*\.png/g)
    const rel = hits ? hits[hits.length - 1] : null
    let saved = false
    if (rel) {
      const parts = rel.slice("generated_images".length).split(/[\/\\]+/).filter(Boolean)
      saved = await salvage(join(ghome, ...parts), `vớt ${rel} → raw/${job}.png (model không tự copy về đích)`)
    }

    /* ── DÂY AN TOÀN THỨ HAI: THEO SESSION ID ───────────────────────────────────
       SỰ CỐ 17/09/2026 (Windows, codex 0.154, job `chinh-nen`): header log ghi
       `sandbox: read-only` DÙ engine truyền `-s workspace-write` — codex tự hạ cấp,
       và với `approval: never` thì MỌI exec đều «rejected: blocked by policy». Model
       sinh được ảnh, bị chặn lúc Copy-Item, rồi vẫn trả lời bằng đường dẫn đích ⇒
       codex thoát 0, không có raw/<job>.png, người dùng nhận một thẻ đỏ "chưa rõ
       nguyên nhân" trong khi ẢNH ĐANG NẰM SẴN trong .codex.
       Khi đường dẫn không đọc được (log bị cắt, thông báo đổi dạng), vẫn còn một
       DANH TỪ chắc chắn: `session id:` ở đầu log, và codex cất ảnh dưới
       `generated_images/<session id>/`. Chỉ nhận thư mục của CHÍNH lượt này và chỉ
       nhận ảnh mới hơn `t0` — ảnh của session khác là ĐOÁN MÒ, thà FAIL còn hơn
       đăng nhầm tấm của job khác. */
    if (!saved) {
      const sid = [...(await logTail()).matchAll(/^session id:\s*(\S+)\s*$/gim)].pop()?.[1]
      if (sid && /^[A-Za-z0-9._-]+$/.test(sid)) {
        const dir = join(ghome, sid)
        const names = await readdir(dir).catch(() => [])
        let best = null
        for (const name of names) {
          if (!/\.png$/i.test(name)) continue
          const m = await mtimeEpoch(join(dir, name))
          if (m < t0) continue                       // tàn dư của lượt trước, không phải sản phẩm lượt này
          if (!best || m > best.m) best = { name, m }
        }
        if (best) {
          await salvage(join(dir, best.name),
            `vớt generated_images/${sid}/${best.name} → raw/${job}.png (theo session id)`)
        }
      }
    }
  }

  /* ── PHÁN THEO SẢN PHẨM, KHÔNG TIN MÃ THOÁT ───────────────────────────────
     codex hay sập vì lỗi API transient SAU khi đã lưu ảnh xong (đã dính: badge ❌ oan,
     auto-slice bị bỏ qua). NHƯNG "sản phẩm" phải là ẢNH MỚI, không phải file mới được
     sờ vào: khi tool tạo ảnh bị chặn, model đã có lần TỰ CHÉP ảnh cũ vào đúng đích rồi
     báo thành công (413.302 token cho hai lượt "OK" kiểu ấy, 21/08/2026). Nên so BĂM
     NỘI DUNG — và cũng vì `date +%s` chỉ tới GIÂY, hai lượt sát nhau có cùng dấu thời
     gian nên mtime đổ oan cho model là "chép file cũ". */
  const h1 = await fileHash(rawPng)
  if (!h1) {
    print(`FAIL ${job} (rc=${rc}, không có raw/${job}.png — xem logs/${job}.log)`)
    return
  }
  if (h1 === h0) {
    print(`FAIL ${job} (rc=${rc}, ảnh KHÔNG ĐỔI so với trước lượt chạy — model không sinh ảnh ` +
      `mới; có khi nó chép lại file cũ rồi báo thành công; xem logs/${job}.log)`)
    return
  }

  /* Có ảnh MỚI — nhưng "mới" chưa phải "đúng hợp đồng". Phép đo nền đứng ở đây vì đây
     là chỗ RẺ NHẤT và SỚM NHẤT để bắt; từ 09/09/2026 nó chỉ GHI NHẬN, không chặn.
     Nhãn phải theo ĐÚNG thứ vừa đo: tấm full-bleed trượt vì lý do NGƯỢC LẠI (trong
     suốt quá nhiều), dán chữ "đục" lên đó là nói sai hẳn nguyên nhân. */
  const av = await alphaVerdict(rawPng, fb)
  const nhan = fb ? "nền" : "nền đục"
  if (av.startsWith("bad")) {
    await appendFile(logPath, `${nhan}: ${strip(av, "bad ")} — chỉ ghi nhận, không chặn\n`)
  }
  const size = await duH(rawPng)
  const tail = rc !== 0 ? `  (codex rc=${rc} sau khi đã lưu ảnh — bỏ qua)` : ""
  if (av.startsWith("skip")) print(`OK  ${job}  ${size}${tail}  [${strip(av, "skip ")}]`)
  else if (av.startsWith("bad")) print(`OK  ${job}  ${size}${tail}  [${nhan}: ${strip(av, "bad ")}]`)
  else print(`OK  ${job}  ${size}  ${strip(av, "ok ")}${tail}`)
}

/* ── CẢ LƯỢT ────────────────────────────────────────────────────────────────── */

/** `date +%H:%M:%S` theo giờ ĐỊA PHƯƠNG, hai chữ số mỗi ô. */
function hhmmss(d = new Date()) {
  const p = n => String(n).padStart(2, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * `mkdir -p` + CỔNG MODEL + CỔNG ĐĂNG NHẬP — tức mọi thứ `gen.sh` làm TRƯỚC khối
 * python, gói lại thành một `ctx` để `runOne` khỏi phải đọc biến toàn cục.
 *
 * Hai cổng này đều HỎI CODEX, nên ở chế độ xem trước prompt chúng bị tắt: máy chưa
 * cài / chưa đăng nhập vẫn phải xem được prompt, nếu không thì đúng lúc cần chẩn
 * đoán nhất lại là lúc không xem được gì.
 *
 * @returns `{ ctx, fatal }` — `fatal` là ca "hồ sơ Codex riêng chưa đăng nhập",
 *          ca DUY NHẤT `gen.sh` thoát khác 0.
 */
export async function prepare(projectDir, { env, print, rootOut } = {}) {
  const cfgEnv = readEnv(env ?? process.env)
  const say = print ?? (s => process.stdout.write(s + "\n"))
  for (const d of ["raw", "logs", "prompts"]) await mkdir(join(projectDir, d), { recursive: true })

  // SOI ĐÚNG HOME SẼ GEN. Bug cũ: `IMG_HOME` được đặt mà cổng này vẫn hỏi home mặc
  // định ⇒ MODEL_ARGS rỗng ⇒ âm thầm rơi về model/mức nghĩ của hồ sơ.
  const childEnv = cfgEnv.imgHome ? { ...process.env, CODEX_HOME: cfgEnv.imgHome } : { ...process.env }
  /* Catalog TĨNH, nằm sẵn trên máy: nó chỉ chứng minh bản codex này BIẾT tên model,
     KHÔNG chứng minh provider của người dùng chịu phục vụ. Đây là cửa RẺ; cửa thật
     là nhánh tự chữa trong `runOne`.
     PHẢI đặt cả effort: `model_reasoning_effort` trong config.toml của người dùng áp
     lên BẤT KỲ model nào, và có máy đang để "xhigh" — đốt token cho một việc mà nghĩ
     nhiều không làm ảnh đẹp hơn (ảnh do tool vẽ). `pickModel` lo cả hai. */
  let pick = { modelArgs: [], model: null, retryArgs: [], retryModel: null, note: null }
  if (!cfgEnv.promptsOnly) pick = await pickModel(cfgEnv, childEnv)
  if (pick.note) say(pick.note)
  if (!cfgEnv.promptsOnly && cfgEnv.imgHome &&
      !(await stat(join(cfgEnv.imgHome, "auth.json")).then(() => true, () => false))) {
    say(`FATAL: profile Codex riêng chưa đăng nhập. Chạy: CODEX_HOME=${cfgEnv.imgHome} codex login`)
    return { ctx: null, fatal: true }
  }
  return {
    fatal: false,
    ctx: {
      root: projectDir, rootOut: rootOut ?? projectDir, print: say,
      modelArgs: pick.modelArgs, model: pick.model,
      retryArgs: pick.retryArgs, retryModel: pick.retryModel,
      genModel: cfgEnv.genModel, genEffort: cfgEnv.genEffort, imgHome: cfgEnv.imgHome,
      busyMax: cfgEnv.busyMax, busyWaits: cfgEnv.busyWaits, home: cfgEnv.home,
    },
  }
}

/**
 * Toàn bộ `gen.sh` chạy với cwd = `projectDir`.
 *
 * @returns mã thoát (0, hoặc 1 khi hồ sơ Codex riêng chưa đăng nhập).
 *
 * ⚠️ `ls -la raw/` — dòng CUỐI CÙNG của `gen.sh` — KHÔNG được chép lại. Nó in một
 * bảng có tên chủ sở hữu, nhóm, ngày giờ theo locale và "total" theo block của hệ
 * tệp: không có cách nào để hai bản trùng nhau trên hai máy, và không ai đọc nó
 * (`parseGenLine` bỏ qua). Chép một thứ không thể trùng là tự đẻ ra một lời hứa sai.
 */
export async function runGen(projectDir, filters = [], opts = {}) {
  const print = opts.print ?? (s => process.stdout.write(s + "\n"))
  const cfgEnv = readEnv(opts.env ?? process.env)
  const root = projectDir
  /* `ROOT_OUT` = ROOT ở mọi nơi trừ Git-Bash, nơi `cygpath -m` đổi `/c/…` thành
     `C:/…`. Đường dẫn ấy nằm BÊN TRONG chuỗi văn bản của task nên MSYS không tự đổi
     hộ, và Windows hiểu `/c/Users/…` là gốc ổ đĩa ⇒ ảnh ghi vào `C:\\c\\Users\\…`.
     Node trên Windows vốn đã dùng `C:\\…`, nên ở đây không còn gì để đổi. */
  const rootOut = opts.rootOut ?? root

  const { ctx, fatal } = await prepare(root, { env: opts.env, print, rootOut })
  if (fatal) return 1

  /* ── DỰNG PROMPT ────────────────────────────────────────────────────────────
     KHÔNG lọc theo `filters`: khối python của `gen.sh` chạy TRƯỚC chỗ đọc `$@` nên nó
     dựng prompt cho MỌI job, và chỉ vòng gọi codex mới lọc. Hai bản phải giống nhau
     ở cả chỗ này, vì tầng agent phát `job.started` theo chính những dòng ấy. */
  let pyRc = 0
  let pyErr = null
  try {
    await renderPrompts(root, [], print)
  } catch (e) {
    pyErr = String(e?.message ?? e).split("\n")[0]
    process.stderr.write(String(e?.stack ?? e) + "\n")
    pyRc = 1
  }

  if (cfgEnv.promptsOnly) {
    print("KITGEN_PROMPTS_ONLY: đã dựng xong prompt trong prompts/ — KHÔNG gọi codex, KHÔNG đụng raw/.")
    return pyRc
  }

  /* ══ CHỖ BẢN JS SỬA MỘT BUG CỦA `gen.sh` (bước ④, 16/09/2026) ═══════════════
     `py_rc` của bash chỉ có quyền ở nhánh xem-trước ngay trên. Ở lượt gen THẬT, khối
     python chết giữa chừng (vd `assert` lưới sai số ô) KHÔNG dừng được gì: bash chạy
     tiếp vào vòng gọi codex với những prompt CŨ hoặc KHÔNG CÓ, rồi TIÊU QUOTA cho
     chúng — tiền thật, cho một prompt không ai dựng nổi.
     Bước ③ chép nguyên con bug ấy để hai engine còn so được với nhau. Bước ④ sửa, và
     sửa ở ĐÂY là đủ vì `gen.sh` sắp bị xoá (bước ⑤): hỏng ở khâu dựng prompt thì
     DỪNG TRƯỚC vòng gọi codex, nói ra bằng một dòng đọc được, và thoát KHÁC 0.
     Mã 3 (không phải 1) để phân biệt với ca "hồ sơ Codex chưa đăng nhập" — xem bảng
     mã thoát ở đầu `cli.mjs`. `markJob` của agent bỏ qua dòng này (không có job nào
     tên `dựng-prompt`), nên nó chỉ là bằng chứng cho người đọc log; mọi job của lượt
     rơi vào NO_ARTIFACT với đúng stderr ở trên làm bằng chứng. */
  if (pyRc !== 0) {
    print(`FAIL dựng-prompt (khối dựng prompt chết giữa chừng: ${pyErr ?? "không rõ"}` +
      " — KHÔNG gọi codex, KHÔNG tiêu quota; xem stderr)")
    return 3
  }

  /* DÒNG NÀY ĐI THẲNG LÊN MÀN HÌNH NGƯỜI DÙNG, NÊN NÓ PHẢI NÓI ĐÚNG SỐ. Trước
     15/09/2026 nó nói "chạy song song" bất kể MAXJOBS, và khi mổ run r-0059
     (maxJobs=1) thì chính lời tường thuật sai ấy làm cả hai người đọc log tin rằng
     hai job đã chạy chồng lên nhau. */
  const loc = filters.length ? ` (lọc: ${filters.join(" ")})` : ""
  print(cfgEnv.maxJobs > 1
    ? `Bắt đầu ${hhmmss()} — chạy tối đa ${cfgEnv.maxJobs} tấm cùng lúc${loc}`
    : `Bắt đầu ${hhmmss()} — chạy lần lượt từng tấm${loc}`)

  /* Danh sách job của `gen.sh` đến từ một lượt `python3 -c` RIÊNG ở cuối file, nên
     styles.json hỏng ở đó chỉ làm ống dẫn rỗng — bash đọc không được dòng nào, vòng
     lặp không chạy, rồi in "Xong". Giữ đúng sự im lặng ấy chứ không ném ra ngoài:
     lượt gen không có job nào KHÁC HẲN lượt gen sập giữa chừng, và agent phân biệt
     hai ca đó bằng mã thoát. */
  let jobs = []
  try {
    const cfg = JSON.parse(await readFile(join(root, "styles.json"), "utf8"))
    jobs = listJobs(cfg).map(j => j.job).filter(j => match(j, filters))
  } catch (e) {
    process.stderr.write(String(e?.stack ?? e) + "\n")
  }

  /* Hàng đợi MAXJOBS làn. Bản bash đếm `jobs -pr` rồi `sleep 0.5` vì bash 3.2 không
     có `wait -n`; ở đây `Promise.race` làm đúng việc ấy mà không có nửa giây chờ
     suông nào — với MAXJOBS nhỏ, những nửa giây ấy cộng lại là hàng chục giây, và
     người ngồi xem đọc nó ra là "gen xong một lúc lâu mới thấy tấm sau". */
  const running = new Set()
  for (const job of jobs) {
    const p = runOne(ctx, job).catch(e => {
      // Một job ném KHÔNG được phép giết cả lượt: bản bash chạy mỗi job trong một
      // tiến trình con riêng, nên ở đó một job chết cũng chỉ là một job chết.
      print(`FAIL ${job} (rc=1, engine lỗi: ${String(e?.message ?? e)})`)
    }).finally(() => running.delete(p))
    running.add(p)
    if (running.size >= cfgEnv.maxJobs) await Promise.race(running)
  }
  await Promise.all(running)
  print(`Xong ${hhmmss()}`)
  return 0
}
