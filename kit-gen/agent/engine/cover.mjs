/* cover.mjs — `cover.sh` VIẾT LẠI BẰNG JS: MỘT ẢNH BÌA 16:9 CHO MỘT PROJECT.
 *
 * ĐÂY LÀ NHÁNH RIÊNG, KHÔNG PHẢI MỘT SHEET. Ảnh bìa không có lưới ô, không có khung
 * safe, không tách nền, không cắt ô — nó là một cảnh full-bleed. Trộn nó vào `gen.mjs`
 * là cách nhanh nhất để làm hỏng cái đang chạy tốt, nên nó đi bằng file riêng, y như
 * bản bash.
 *
 * Gọi:  runCover("<thư-mục-project>")
 *   đọc  : <project>/prompts/cover.txt  (+ .att: mỗi dòng một ảnh đính kèm)
 *   ghi  : <project>/cover/cover.png     (16:9 1600x900)
 *          <project>/cover/cover.raw.png (bản gốc 3:2 model trả về)
 *          <project>/logs/cover.log
 *   in   : "OK  cover …" hoặc "FAIL cover (…)"
 *
 * Prompt do AGENT dựng (`agent/lib/cover.mjs`) chứ không dựng ở đây — nội dung phụ
 * thuộc contract (màu thương hiệu, mascot) và cần kiểm bằng unit test.
 *
 * ╔══ HAI CHỖ `cover.sh` LỆCH KHỎI `gen.sh` — ĐÃ VÁ Ở BƯỚC ④ (16/09/2026) ══════╗
 * ║ ① Cổng model hỏi `codex debug models` mà KHÔNG đặt `CODEX_HOME=$IMG_HOME`,   ║
 * ║   trong khi lượt `codex exec` ngay dưới thì có. Đúng con bug mà `gen.sh` đã   ║
 * ║   vá ("SOI ĐÚNG HOME sẽ gen"): hồ sơ riêng biết model mà cổng hỏi hồ sơ mặc   ║
 * ║   định ⇒ MODEL_ARGS rỗng ⇒ âm thầm rơi về model/mức nghĩ của hồ sơ.           ║
 * ║ ② Lượt hạ cấp bỏ CẢ `-m` LẪN `-c model_reasoning_effort` — cũng là con bug mà ║
 * ║   `gen.sh` đã vá (thứ bị từ chối là cái TÊN, mức nghĩ vẫn hợp lệ; thả nổi thì ║
 * ║   rơi về mức "fast" của hồ sơ, tức bỏ luôn bước đọc SKILL.md).                ║
 * ║ Bước ③ CHÉP NGUYÊN cả hai để hai engine còn so được với nhau từng dòng. Bước  ║
 * ║ ④ vá, vì `cover.sh` sắp bị xoá (bước ⑤) và ảnh bìa không đáng phải giữ lại    ║
 * ║ hai con bug đã có tên. Hai chỗ vá được đánh dấu `① VÁ` / `② VÁ` dưới thân hàm.║
 * ╚════════════════════════════════════════════════════════════════════════════════╝
 */
import { spawn } from "node:child_process"
import { open, readFile, writeFile, appendFile, stat, copyFile, mkdir, rename } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import { decode, encode } from "./png.mjs"
import { pyRound } from "./pyjson.mjs"
import { resize } from "./resample.mjs"
import { codexBin, duH, mtimeEpoch, readEnv } from "./gen.mjs"

/** Khổ ảnh bìa của app. Model chỉ nhận 3:2 nên `cropCover` cắt DẢI GIỮA rồi co lại. */
export const TARGET_W = 1600
export const TARGET_H = 900

/** `IMG_HOME` của cover.sh có bóc `~` — `gen.sh` thì KHÔNG. Chép cả sự lệch ấy. */
function expandTilde(raw, home) {
  if (raw === "~") return home
  if (raw.startsWith("~/")) return join(home, raw.slice(2))
  return raw
}

/**
 * Khối python cắt 16:9 của cover.sh, bằng JS.
 *
 * `int(round(...))` của Python làm tròn VỀ SỐ CHẴN ở ca đúng nửa chừng, nên dùng
 * `pyRound` chứ không `Math.round`: với 1536×1024 thì hai phép cho cùng kết quả,
 * nhưng một khổ model trả về lệch đi vài pixel là đủ để hai bản cắt hai chỗ khác nhau.
 *
 * @returns Buffer PNG 1600x900 (RGB, đúng `im.convert("RGB")` của bản cũ).
 */
export function cropCover(pngBuffer) {
  const im = decode(pngBuffer)
  const ratio = TARGET_W / TARGET_H
  const w = im.width, h = im.height
  let box
  if (w / h > ratio) {                       // rộng quá → cắt hai bên
    const nw = pyRound(h * ratio)
    const left = Math.floor((w - nw) / 2)
    box = [left, 0, left + nw, h]
  } else {                                   // cao quá → cắt trên dưới (ca 3:2 → 16:9)
    const nh = pyRound(w / ratio)
    const top = Math.floor((h - nh) / 2)
    box = [0, top, w, top + nh]
  }
  // `Image.open(src).convert("RGB")` — BỎ alpha, không ghép nền. Ảnh bìa luôn đục.
  const cw = box[2] - box[0], ch = box[3] - box[1]
  const rgb = { width: cw, height: ch, bands: 3, data: new Uint8Array(cw * ch * 3) }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((box[1] + y) * w + (box[0] + x)) * 4
      const d = (y * cw + x) * 3
      rgb.data[d] = im.data[s]; rgb.data[d + 1] = im.data[s + 1]; rgb.data[d + 2] = im.data[s + 2]
    }
  }
  const out = resize(rgb, TARGET_W, TARGET_H, "lanczos")
  // `encode` nhận RGBA nên trải lại bốn kênh rồi bảo nó ghi 3 kênh (color type 2).
  const rgba = new Uint8Array(TARGET_W * TARGET_H * 4)
  for (let i = 0; i < TARGET_W * TARGET_H; i++) {
    rgba[i * 4] = out.data[i * 3]; rgba[i * 4 + 1] = out.data[i * 3 + 1]
    rgba[i * 4 + 2] = out.data[i * 3 + 2]; rgba[i * 4 + 3] = 255
  }
  return encode({ width: TARGET_W, height: TARGET_H, data: rgba }, { channels: 3 })
}

/** `… codex exec … >log 2>&1` — y hệt `runCodex` của gen.mjs (xem chú thích ở đó). */
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

/** `codex debug models | grep -q "\"<model>\""` — HỎI ĐÚNG HOME SẼ VẼ (① VÁ, xem đầu file). */
async function codexKnowsModel(model, env = process.env) {
  return await new Promise(resolve => {
    let out = ""
    let child
    try { child = spawn(codexBin(), ["debug", "models"], { stdio: ["ignore", "pipe", "ignore"], env }) }
    catch { return resolve(false) }
    child.stdout.on("data", d => { out += d })
    child.on("error", () => resolve(false))
    child.on("close", code => resolve(code === 0 && out.includes(`"${model}"`)))
  })
}

const exists = p => stat(p).then(() => true, () => false)
const isFile = p => stat(p).then(s => s.isFile(), () => false)
const strip = (s, prefix) => (s.startsWith(prefix) ? s.slice(prefix.length) : s)

/**
 * `bash cover.sh <projectDir>`.
 *
 * @returns mã thoát: 2 (thiếu thư mục / thiếu prompt), 1 (hồ sơ chưa đăng nhập),
 *          0 cho MỌI ca còn lại — kể cả khi ảnh bìa hỏng. Thất bại của ảnh bìa
 *          KHÔNG BAO GIỜ là thất bại của lượt gen chính, và mã thoát là chỗ duy
 *          nhất nói được điều đó với `run-handle`.
 */
export async function runCover(projectDir, opts = {}) {
  const print = opts.print ?? (s => process.stdout.write(s + "\n"))
  const envCfg = readEnv(opts.env ?? process.env)
  const home = envCfg.home || homedir()

  if (!projectDir || !(await stat(projectDir).then(s => s.isDirectory(), () => false))) {
    print("FAIL cover (thiếu thư mục project: cover.sh <project-dir>)")
    return 2
  }
  const root = projectDir
  for (const d of ["cover", "logs", "prompts"]) await mkdir(join(root, d), { recursive: true })

  if (!(await isFile(join(root, "prompts/cover.txt")))) {
    print("FAIL cover (thiếu prompts/cover.txt — agent chưa dựng prompt)")
    return 2
  }

  const imgHome = envCfg.imgHome ? expandTilde(envCfg.imgHome, home) : ""
  if (imgHome && !(await isFile(join(imgHome, "auth.json")))) {
    print(`FAIL cover (profile Codex riêng chưa đăng nhập: CODEX_HOME=${imgHome} codex login)`)
    return 1
  }

  /* `env` dựng Ở ĐÂY chứ không ở sát lượt `codex exec` như bản bash: cổng model ngay
     dưới phải hỏi ĐÚNG cái home sẽ vẽ (① VÁ). Nội dung không đổi một khoá nào. */
  const env = imgHome ? { ...process.env, CODEX_HOME: imgHome } : { ...process.env }

  let modelArgs = []
  if (envCfg.genModel && await codexKnowsModel(envCfg.genModel, env)) {
    modelArgs = ["-m", envCfg.genModel]
    if (envCfg.genEffort) modelArgs.push("-c", `model_reasoning_effort="${envCfg.genEffort}"`)
  }

  const RAW = join(root, "cover/cover.raw.png")
  const OUT = join(root, "cover/cover.png")
  const logPath = join(root, "logs/cover.log")

  /* KHỔ ẢNH LÀ CON SỐ, KHÔNG PHẢI LỜI ĐỀ NGHỊ. Ảnh bìa còn nhạy hơn sheet: nó bị cắt
     dải giữa 3:2 → 16:9, nên model trả khổ khác là ảnh méo hoặc mất đầu nhân vật —
     mà cover là job phụ, hỏng cũng không kéo run xuống "done-with-errors" nên chẳng
     ai để ý. Xem test/gen-canvas-size.test.sh: chuỗi "if supported" bị cấm quay lại. */
  const promptText = await readFile(join(root, "prompts/cover.txt"), "utf8")
  const task = `Generate ONE image with your image generation tool. The output image MUST be exactly 1536x1024 pixels (landscape) — this is a hard requirement, not a preference; do not return any other aspect ratio. Use EXACTLY the prompt between the IMAGE PROMPT markers below. The attached images, if any, are the project's own brand / mascot references named in the prompt. Then save/copy the generated PNG to exactly this path: ${RAW} (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
${promptText.replace(/\n+$/, "")}
--- IMAGE PROMPT END ---`

  /* `.att` của cover KHÔNG gọt `\r` (bản bash không gọt), và đường dẫn KHÔNG được
     liệt kê trong task — ảnh bìa không đi qua `referenced_image_paths`. Hai chỗ khác
     `gen.sh`, chép nguyên cả hai. */
  const attArgs = []
  const attRaw = await readFile(join(root, "prompts/cover.att"), "utf8").catch(() => "")
  for (const line of attRaw.split("\n")) {
    if (!line) continue
    const abs = join(root, line)
    if (await isFile(abs)) attArgs.push("-i", abs)
  }

  const t0 = Math.floor(Date.now() / 1000)
  const args = extra => [
    "exec", ...extra,
    "-s", "workspace-write",
    "-C", root,
    "--skip-git-repo-check",
    ...attArgs,
    "-o", "logs/cover.last.txt",
    task,
  ]

  let rc = await runCodex({ args: args(modelArgs), cwd: root, env, logPath, append: false })

  const logText = () => readFile(logPath, "utf8").catch(() => "")
  // Provider từ chối model ⇒ hạ xuống model của hồ sơ, chạy lại ĐÚNG MỘT LẦN. Chỉ thử
  // lại khi chưa có ảnh mới — có ảnh rồi mà chạy lại là tốn thêm một lần sinh ảnh.
  if (modelArgs.length > 0 && rc !== 0 && (await mtimeEpoch(RAW)) < t0 &&
      /unknown model|model not (found|supported)|unsupported model|invalid model|does not (exist|support)|model_not_found/i
        .test(await logText())) {
    await appendFile(logPath,
      `model '${envCfg.genModel}' bị provider từ chối — chạy lại bằng model mặc định của hồ sơ\n`)
    /* ② VÁ: BỎ `-m`, GIỮ mức nghĩ — y hệt `gen.mjs::runOne`. Thứ bị provider từ chối là
       cái TÊN MODEL; mức nghĩ độc lập với model và luôn hợp lệ. Thả nổi nó thì lượt
       chạy lại rơi về mức của hồ sơ, mà hồ sơ có thể đang để "fast" — mức bỏ luôn bước
       đọc SKILL.md, tức đúng thứ vừa phải trả giá để có. */
    const retryEffort = envCfg.genEffort ? ["-c", `model_reasoning_effort="${envCfg.genEffort}"`] : []
    rc = await runCodex({ args: args(retryEffort), cwd: root, env, logPath, append: true })
  }

  // VỚT ẢNH — y hệt gen.sh: codex ≥0.147 nhiều lần sinh xong nhưng không tự copy về đích.
  if ((await mtimeEpoch(RAW)) < t0) {
    const ghome = join(imgHome || join(home, ".codex"), "generated_images")
    const hits = (await logText()).match(/generated_images\/[^"' \n]*\.png/g)
    const rel = hits ? hits[hits.length - 1] : null
    if (rel) {
      const src = join(ghome, strip(rel, "generated_images/"))
      if (await isFile(src)) {
        try {
          await copyFile(src, RAW)
          await appendFile(logPath, `vớt ${rel} → cover/cover.raw.png (model không tự copy về đích)\n`)
        } catch { /* `cp -f` hỏng thì vế `&&` không chạy */ }
      }
    }
  }

  /* PHÁN THEO MTIME, không theo băm — khác `gen.sh`, và cũng chép nguyên. Ảnh bìa chỉ
     có một tấm nên ca "model chép lại ảnh cũ rồi báo thành công" không đắt bằng, và
     đổi phép phán ở đây là đổi hành vi mà không ca nào canh. */
  if ((await mtimeEpoch(RAW)) < t0) {
    print(`FAIL cover (rc=${rc}, ảnh không được ghi mới — xem logs/cover.log)`)
    return 0    // thất bại của ảnh bìa KHÔNG BAO GIỜ là thất bại của lượt gen chính
  }

  try {
    const png = cropCover(await readFile(RAW))
    await writeFile(OUT + ".tmp", png)
    await rename(OUT + ".tmp", OUT)          // `os.replace` — thay NGUYÊN TỬ, không nửa file
    print(`crop 16:9 → ${OUT}`)
    print(`OK  cover  ${await duH(OUT)}`)
  } catch (e) {
    /* ⚠️ CÂU CHỮ CỦA BẢN CŨ, VÀ NÓ NÓI SAI NGUYÊN NHÂN Ở BẢN NÀY. Bash rơi vào đây
       khi máy thiếu Pillow; bản JS không có Pillow nào để thiếu, nên nó chỉ rơi vào
       đây khi KHÔNG GIẢI MÃ NỔI tấm PNG model trả về. Giữ nguyên chuỗi vì đó là hợp
       đồng stdout với `agent/test/suite-cover.mjs`; lý do thật nằm trong log ngay
       dưới, nơi bản bash cũng để stderr của python (`2>>logs/cover.log`). */
    await appendFile(logPath, `cắt 16:9 hỏng: ${String(e?.stack ?? e)}\n`).catch(() => {})
    try {
      await copyFile(RAW, OUT)
      print("OK  cover  (chưa cắt 16:9 — thiếu Pillow, dùng bản gốc)")
    } catch {
      print("FAIL cover (không ghi được cover/cover.png)")
    }
  }
  return 0
}
