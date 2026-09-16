/* suite-engine-gen.mjs — VÒNG GỌI CODEX CỦA BẢN JS PHẢI PHÁN GIỐNG BẢN BASH.
 *
 * ╔══ BA TẦNG, VÀ CHÚNG CANH BA THỨ KHÁC NHAU ══════════════════════════════════╗
 * ║ ① PORT TỪNG CA CỦA BỘ TEST SHELL. Mỗi ca ở đây có một ca anh em trong        ║
 * ║   `test/gen-*.test.sh`; ca shell trích `run_one` từ `gen.sh` rồi chạy, ca này ║
 * ║   gọi `runOne` của JS — cùng codex giả, cùng câu hỏi, cùng câu trả lời phải   ║
 * ║   nhận. Sửa `gen.mjs` mà làm hỏng nhánh nào thì ĐỎ ở đây; sửa `gen.sh` mà làm ║
 * ║   hỏng nhánh ấy thì đỏ ở kia. Hai bộ ca, hai engine, cùng một hợp đồng.       ║
 * ║ ② SO TRỰC TIẾP HAI ENGINE. Chạy `bash gen.sh` THẬT và `node cli.mjs gen`      ║
 * ║   trên cùng một fixture với cùng một codex giả, rồi so stdout từng dòng. Đây  ║
 * ║   là ca đắt nhất và cũng là ca duy nhất không tin lời ai: nó ĐO.              ║
 * ║ ③ ẢNH: cover crop 16:9 và thumbnail, so với mốc Pillow đã đóng băng.          ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG GỌI CODEX THẬT. `codex` giả là một script Node có shebang, ghi đúng những
 * gì ca cần (argv, task, ảnh) — không mạng, không quota. `GEN_BUSY_BACKOFF="0 0 0"`
 * nên vòng lùi không ngồi chờ một giây thật nào.
 *
 * WINDOWS: mọi ca có spawn đều cần shebang, nên chúng bỏ qua trên win32 — đúng lối
 * của `suite-codex-login.mjs`, và nói thẳng ra chứ không giả vờ xanh.
 */
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, it, eq, ok, includes, rmTemp } from "./harness.mjs"
import { encode, decode } from "../engine/png.mjs"
import { resize, thumbnailSize, reduce } from "../engine/resample.mjs"
import { thumbnail } from "../engine/thumbs.mjs"
import { cropCover, runCover } from "../engine/cover.mjs"
import {
  alphaVerdict, buildTask, canvasOf, duH, humanSize, prepare, runOne, runGen,
} from "../engine/gen.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, "..", "..")
const ENGINE = join(REPO, "agent", "engine")
const FIX = join(REPO, "agent", "test-fixtures", "engine-golden")
const FIX_RS = join(REPO, "agent", "test-fixtures", "engine-resample")
const IS_WIN = process.platform === "win32"

/* ── ẢNH MẪU ────────────────────────────────────────────────────────────────
   Cùng ba tấm mà `test/gen-fullbleed-alpha.test.sh` dựng bằng Pillow, dựng lại
   bằng `png.mjs`. Chúng khác nhau ĐÚNG ở kênh alpha, và đó là cả phép thử. */
function pngKin() {                        // RGBA đục hoàn toàn — tấm nền ĐÚNG hợp đồng
  const d = new Uint8Array(64 * 64 * 4)
  for (let i = 0; i < 64 * 64; i++) { d[i * 4] = 200; d[i * 4 + 1] = 80; d[i * 4 + 2] = 40; d[i * 4 + 3] = 255 }
  return encode({ width: 64, height: 64, data: d })
}
function pngRong() {                       // 50% alpha=0 — cảnh bị vẽ thụt vào
  const d = new Uint8Array(64 * 64 * 4)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4
    if (y < 32) continue                   // nửa trên trong suốt hẳn
    d[i] = 200; d[i + 1] = 80; d[i + 2] = 40; d[i + 3] = 255
  }
  return encode({ width: 64, height: 64, data: d })
}
function pngUi() {                         // có alpha=0 LẪN dải mờ liên tục
  const d = new Uint8Array(64 * 64 * 4)
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4
    const dist = Math.max(Math.abs(x - 32), Math.abs(y - 32))
    d[i] = 30; d[i + 1] = 120; d[i + 2] = 220
    d[i + 3] = dist < 12 ? 255 : Math.max(0, 255 - (dist - 12) * 24)
  }
  return encode({ width: 64, height: 64, data: d })
}
function pngRgb() {                        // KHÔNG có kênh alpha
  const d = new Uint8Array(8 * 8 * 4)
  for (let i = 0; i < 64; i++) { d[i * 4] = 10; d[i * 4 + 1] = 20; d[i * 4 + 2] = 30; d[i * 4 + 3] = 255 }
  return encode({ width: 8, height: 8, data: d }, { channels: 3 })
}

/* ── CODEX GIẢ ──────────────────────────────────────────────────────────────
   Một script Node. Nó đọc biến môi trường để biết phải cư xử thế nào — y hệt
   `$MODE` của các ca shell — và ghi sổ mọi lần bị gọi. */
const FAKE_CODEX = `#!/usr/bin/env node
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from "node:fs"
const a = process.argv.slice(2)
if (a[0] === "debug") {
  // Cổng model phải hỏi ĐÚNG hồ sơ sẽ vẽ: ghi lại CODEX_HOME mà nó được gọi kèm.
  if (process.env.HOME_LOG) writeFileSync(process.env.HOME_LOG, process.env.CODEX_HOME || "")
  process.stdout.write(JSON.stringify({ models: [{ slug: "gpt-5.6-luna" }] })); process.exit(0)
}
// CHỈ GHI CỜ, bỏ đối số cuối (khối task nhiều dòng). Bộ ca shell ghi cả task rồi
// soi bằng \`tail -1\`, nên khẳng định "lượt chạy lại đã bỏ -m" của nó thật ra đang
// soi dòng cuối của TASK — một khẳng định luôn đúng, tức không khẳng định gì.
if (process.env.ARGV_LOG) appendFileSync(process.env.ARGV_LOG, "ARGV: " + a.slice(0, -1).join(" ") + "\\n")
if (process.env.TASK_LOG) writeFileSync(process.env.TASK_LOG, a[a.length - 1])
let n = 0
if (process.env.CALLS) {
  n = Number(readFileSync(process.env.CALLS, "utf8").trim() || "0") + 1
  writeFileSync(process.env.CALLS, String(n))
}
// Đích suy ra từ chính argv (\`-o logs/<job>.last.txt\`) nên codex giả phục vụ được
// lượt nhiều job — cwd của nó là thư mục project ở CẢ hai engine.
const oi = a.indexOf("-o")
const m = oi >= 0 ? /logs[\\/](.+)\.last\.txt$/.exec(a[oi + 1]) : null
const dst = process.env.DST || "raw/" + (m ? m[1] : "job1") + ".png"
const BUSY = "ERROR: Selected model is at capacity. Please try a different model."
switch (process.env.MODE) {
  case "ok": break
  case "reject":                                   // từ chối khi có -m, nhận khi không
    if (a.includes("-m")) { console.log("unknown model requested"); process.exit(1) }
    break
  case "other": console.log("429 rate limit"); process.exit(1)
  case "busy-then-ok":
    if (n >= 3) { writeFileSync(dst, "anh-moi-" + n); console.log("saved " + dst); break }
    console.log(BUSY); process.exit(1)
  case "busy-then-other":                          // lượt 1 quá tải, lượt 2 hỏng vì LÝ DO KHÁC
    if (n === 1) { console.log(BUSY); process.exit(1) }
    console.log("429 rate limit"); process.exit(1)
  case "busy-forever": console.log(BUSY); process.exit(1)
  case "fresh": writeFileSync(dst, "anh-moi-" + process.hrtime.bigint()); break
  case "copy": writeFileSync(dst, readFileSync(dst)); break   // mtime mới, byte y hệt
  case "none": break
  case "src": copyFileSync(process.env.SRC, dst); break
  case "cover": copyFileSync(process.env.SRC, "cover/cover.raw.png"); break
  case "salvage":                                  // sinh ảnh nhưng KHÔNG copy về đích
    console.log("saved to generated_images/" + process.env.SALVAGE_NAME + ".png"); break
}
process.exit(0)
`

/** Dựng `codex` giả trong `dir`, trả về đường dẫn (dùng làm KITGEN_CODEX_BIN). */
async function fakeCodex(dir) {
  const bin = join(dir, "codex.mjs")
  await writeFile(bin, FAKE_CODEX, "utf8")
  await chmod(bin, 0o755)
  return bin
}

/** Project tối thiểu đúng như `run_one` cần đọc (không cần styles.json). */
async function miniProject(root, { prompt = "một prompt ảnh\n", fullBleed = false } = {}) {
  for (const d of ["prompts", "raw", "logs"]) await mkdir(join(root, d), { recursive: true })
  await writeFile(join(root, "prompts/job1.txt"), prompt, "utf8")
  await writeFile(join(root, "prompts/job1.att"), "", "utf8")
  if (fullBleed) await writeFile(join(root, "prompts/job1.fullbleed"), "1\n", "utf8")
  else await rm(join(root, "prompts/job1.fullbleed"), { force: true })
}

/** Chạy `runOne` một lượt, trả `{ out, log, calls }`. */
async function runCase(work, envExtra = {}) {
  const lines = []
  const env = {
    ...process.env,
    GEN_BUSY_BACKOFF: "0 0 0",
    DST: join(work, "raw/job1.png"),
    ARGV_LOG: join(work, "argv.txt"),
    CALLS: join(work, "calls.txt"),
    ...envExtra,
  }
  await writeFile(env.CALLS, "0", "utf8")
  await writeFile(env.ARGV_LOG, "", "utf8")
  const prevEnv = {}
  for (const k of ["DST", "ARGV_LOG", "CALLS", "MODE", "SRC", "TASK_LOG", "SALVAGE_NAME"]) {
    prevEnv[k] = process.env[k]
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]
  }
  try {
    const { ctx } = await prepare(work, { env, print: s => lines.push(s) })
    await runOne(ctx, "job1")
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
  return {
    out: lines.join("\n"),
    log: await readFile(join(work, "logs/job1.log"), "utf8").catch(() => ""),
    argv: await readFile(join(work, "argv.txt"), "utf8").catch(() => ""),
    calls: Number((await readFile(join(work, "calls.txt"), "utf8").catch(() => "0")).trim()),
  }
}

/** Đếm số lần một chuỗi xuất hiện — thay `grep -c`. */
const count = (hay, needle) => hay.split(needle).length - 1

/** Chạy một lệnh, gom stdout/stderr/mã thoát. */
function exec(cmd, args, opts = {}) {
  return new Promise(done => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts })
    let out = "", err = ""
    c.stdout.on("data", d => { out += d })
    c.stderr.on("data", d => { err += d })
    c.on("error", e => done({ code: -1, out, err: err + String(e) }))
    c.on("close", code => done({ code, out, err }))
  })
}

export async function run() {
  // ══════════════════════════════════════════ 0. HÀM THUẦN
  describe("engine JS › gen: hàm thuần")

  await it("khổ ảnh đọc NGƯỢC ra từ prompt, ba nhánh loại trừ nhau", () => {
    // Bẫy đã suýt dính ở bản bash: dò "portrait" trước thì nhánh "square" không bao
    // giờ tới. `canvasOf` phải giữ đúng thứ tự `case` của gen.sh.
    eq(canvasOf("Canvas orientation: LANDSCAPE 1536x1024."), { size: "1536x1024", orient: "landscape" })
    eq(canvasOf("## Canvas\nPORTRAIT 1024x1536"), { size: "1024x1536", orient: "portrait" })
    eq(canvasOf("## Canvas\nSQUARE 1254x1254"), { size: "1254x1254", orient: "square" })
    eq(canvasOf("no orientation line here"), { size: "1536x1024", orient: "landscape" },
      "không khai gì ⇒ rơi về NGANG, không phải im lặng")
  })

  await it("`du -h` in đúng kiểu BSD: một chữ số thập phân dưới 10, căn phải 4 ký tự", () => {
    // Đo bằng `du -h` thật trên macOS (xem chú thích `humanSize`).
    eq(humanSize(0), "  0B")
    eq(humanSize(4096), "4.0K")
    eq(humanSize(8192), "8.0K")
    eq(humanSize(12288), " 12K")
    eq(humanSize(102400), "100K")
    eq(humanSize(999424), "976K")
    eq(humanSize(1048576), "1.0M")
    eq(humanSize(1503232), "1.4M")
    eq(humanSize(12001280), " 11M")
  })

  if (process.platform === "darwin") {
    await it("`duH` trùng ĐÚNG output của `du -h` thật (chỉ đo được trên macOS)", async () => {
      /* Ca này KHÔNG chạy trên Linux/Windows, và nói thẳng ra: `du` của GNU in khác
         (không đệm, và gọi 0 byte là "0"), nên khẳng định ở đó sẽ là khẳng định sai.
         Nơi duy nhất đo được là nơi `gen.sh` được viết và đo trên đó. */
      const dir = await mkdtemp(join(tmpdir(), "kitgen-du-"))
      for (const n of [0, 1, 4096, 4097, 10000, 100000, 999000, 1500000]) {
        const f = join(dir, `f${n}`)
        await writeFile(f, Buffer.alloc(n))
        const real = (await exec("du", ["-h", f])).out.split("\t")[0]
        eq(await duH(f), real, `du -h cho ${n} byte`)
      }
      await rmTemp(dir)
    })
  }

  await it("TASK phân nhánh theo dấu full-bleed — cả bốn đoạn nói về nền", async () => {
    // Port test/gen-fullbleed-alpha.test.sh, phần "TASK gửi codex phân nhánh".
    const common = { job: "job1", promptText: "Canvas orientation: LANDSCAPE 1536x1024.", attPaths: [], rootOut: "/p" }
    const nen = buildTask({ ...common, fullBleed: true })
    includes(nen, 'call image_gen with background="opaque" (PNG output)', "tấm nền gọi nền ĐỤC")
    includes(nen, 'passing background="opaque" and PNG output', "nhắc lại đúng từ khoá ở lượt vẽ")
    includes(nen, "a FULL-FRAME background", "nói thẳng đây là tấm phủ kín khung")
    includes(nen, "fully opaque edge to edge", "bước tự kiểm đối chiếu NGƯỢC LẠI")
    includes(nen, "no empty margin along any side", "nêu cả ca chừa lề")
    includes(nen, "Never more than two image_gen calls", "trần hai lượt vẫn còn")
    includes(nen, "remove_chroma_key.py", "lệnh cấm tự sửa ảnh vẫn còn")
    for (const bad of ['background="transparent"', "transparent-image rule", "alpha channel is real",
      "preserve the alpha channel"]) {
      ok(!nen.includes(bad), `task của tấm nền không được còn xin nền trong suốt: ${bad}`)
    }
    const ui = buildTask({ ...common, fullBleed: false })
    includes(ui, 'call image_gen with background="transparent" (PNG output)', "tấm thường vẫn xin nền trong suốt")
    includes(ui, "alpha channel is real", "vẫn đúng câu tự kiểm cũ")
    includes(ui, "a background cut out by hand is detected and rejected", "vẫn đúng câu dừng cũ")
    ok(!ui.includes('background="opaque"'), "tấm thường KHÔNG được xin nền đục")
    // Port test/gen-canvas-size.test.sh: khổ là SỐ, và không kèm đường lui.
    includes(ui, "exactly 1536x1024 pixels", "nêu đích danh khổ")
    includes(ui, "(landscape)", "nói rõ hướng")
    includes(ui, "hard requirement", "nói rõ đây là ràng buộc cứng")
    ok(!ui.includes("if supported"), "đường lui 'if supported' không được phép quay lại")
  })

  await it("đường dẫn ảnh kèm được NÓI RA trong task, không chỉ đính `-i`", () => {
    // `-i` chỉ đính vào hội thoại; tool image_gen không tự thấy. Bản cũ không nói ⇒
    // model gọi tool tay không rồi than "Please reattach the two reference images".
    const t = buildTask({
      job: "j", promptText: "x", attPaths: ["/p/refs/a.png", "/p/refs/b.png"], rootOut: "/p", fullBleed: false,
    })
    includes(t, "--- REFERENCE IMAGES START ---\n/p/refs/a.png\n/p/refs/b.png\n--- REFERENCE IMAGES END ---",
      "hai đường dẫn, đúng thứ tự, giữa hai mốc")
    includes(t, "referenced_image_paths parameter", "nêu đích danh tham số của tool")
    ok(!buildTask({ job: "j", promptText: "x", attPaths: [], rootOut: "/p", fullBleed: false })
      .includes("REFERENCE IMAGES"), "không có ảnh kèm thì không có khối nào")
  })

  // ══════════════════════════════════════════ 1. PHÉP ĐO NỀN
  describe("engine JS › gen: alpha_verdict")

  await it("tấm thường: ba phép theo đúng thứ tự của bản python", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kitgen-av-"))
    const w = async (n, buf) => { const p = join(dir, n); await writeFile(p, buf); return p }
    eq((await alphaVerdict(await w("kin.png", pngKin()), false)).startsWith("bad"), true)
    includes(await alphaVerdict(join(dir, "kin.png"), false), "vẽ đè kín nền", "ảnh đục")
    includes(await alphaVerdict(await w("ui.png", pngUi()), false), "dải mờ", "ảnh có alpha thật")
    ok((await alphaVerdict(join(dir, "ui.png"), false)).startsWith("ok "), "alpha thật ⇒ ok")
    includes(await alphaVerdict(await w("rgb.png", pngRgb()), false), "KHÔNG có kênh alpha", "PNG không alpha")
    includes(await alphaVerdict(join(dir, "rgb.png"), false), "(mode=RGB)", "nêu đích danh mode")
    await rmTemp(dir)
  })

  await it("tấm full-bleed: phép kiểm LẬT NGƯỢC, không buộc tội oan", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kitgen-avfb-"))
    const w = async (n, buf) => { const p = join(dir, n); await writeFile(p, buf); return p }
    const kin = await alphaVerdict(await w("kin.png", pngKin()), true)
    ok(kin.startsWith("ok "), `tấm nền đục kín phải ĐẠT, nhận: ${kin}`)
    includes(kin, "phủ kín", "nói rõ nó được xét theo luật full-bleed")
    const rong = await alphaVerdict(await w("rong.png", pngRong()), true)
    ok(rong.startsWith("bad"), "50% trong suốt trên tấm nền là hỏng")
    includes(rong, "phủ KÍN", "nói đúng nguyên nhân NGƯỢC LẠI")
    includes(await alphaVerdict(await w("rgb.png", pngRgb()), true), "đúng yêu cầu phủ kín",
      "RGB đục trên tấm nền cũng ĐẠT")
    await rmTemp(dir)
  })

  await it("PNG hỏng ⇒ 'skip', không bịa một lời buộc tội", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kitgen-avbad-"))
    await writeFile(join(dir, "x.png"), Buffer.from("không phải PNG"))
    eq(await alphaVerdict(join(dir, "x.png"), false), "skip không chạy được phép kiểm alpha")
    await rmTemp(dir)
  })

  // ══════════════════════════════════════════ 2. PORT BỘ CA SHELL
  if (IS_WIN) {
    describe("engine JS › gen: vòng chạy codex")
    await it("[bỏ qua trên Windows] codex giả cần shebang", async () => { ok(true) })
  } else {
    describe("engine JS › gen: vòng chạy codex (port test/gen-*.test.sh)")

    /** Dựng thư mục làm việc + codex giả, trả `work`. */
    async function fresh(opts) {
      const work = await mkdtemp(join(tmpdir(), "kitgen-gen-"))
      await miniProject(work, opts)
      process.env.KITGEN_CODEX_BIN = await fakeCodex(work)
      return work
    }

    await it("model có, provider nhận ⇒ gọi 1 lần, argv có -m và effort", async () => {
      const work = await fresh()
      const r = await runCase(work, { MODE: "ok" })
      eq(r.calls, 1, "chỉ gọi codex một lần")
      includes(r.argv, "-m gpt-5.6-luna", "argv có -m")
      includes(r.argv, 'model_reasoning_effort="medium"', "argv có effort medium")
      await rmTemp(work)
    })

    await it("provider TỪ CHỐI model ⇒ chạy lại KHÔNG có -m, nhưng GIỮ mức nghĩ", async () => {
      const work = await fresh()
      const r = await runCase(work, { MODE: "reject" })
      eq(r.calls, 2, "gọi hai lần (lần đầu + hạ cấp)")
      const last = r.argv.trim().split("\n").pop()
      ok(!last.includes("-m "), "lần chạy lại đã bỏ -m")
      // gen.sh vá 15/09: bản cũ bỏ CẢ cụm MODEL_ARGS nên lượt hai rơi về mức nghĩ của
      // hồ sơ, mà hồ sơ có thể đang để "fast" — mức bỏ luôn bước đọc SKILL.md.
      includes(last, 'model_reasoning_effort="medium"', "mức nghĩ vẫn được ghim ở lượt hai")
      includes(r.log, "bị provider từ chối", "log ghi lại vì sao có lượt hai")
      await rmTemp(work)
    })

    await it("hỏng vì lý do KHÁC (429) ⇒ KHÔNG được thử lại", async () => {
      const work = await fresh()
      const r = await runCase(work, { MODE: "other" })
      eq(r.calls, 1, "chỉ gọi một lần")
      await rmTemp(work)
    })

    await it("KITGEN_GEN_MODEL='' ⇒ không truyền model nào (tắt hẳn bằng biến rỗng)", async () => {
      const work = await fresh()
      const r = await runCase(work, { MODE: "ok", KITGEN_GEN_MODEL: "" })
      ok(!r.argv.includes("-m "), "vẫn truyền -m dù đã tắt")
      await rmTemp(work)
    })

    await it("quá tải hai lần rồi vẽ được ⇒ job OK, không ai phải bấm lại", async () => {
      const work = await fresh()
      const r = await runCase(work, { MODE: "busy-then-ok" })
      eq(r.calls, 3, "1 lần đầu + 2 lần thử lại")
      includes(r.out, "OK  job1", "job kết thúc OK")
      eq(count(r.log, "model quá tải — thử lại lần"), 2, "log job có đúng 2 dòng thử lại")
      includes(r.log, "thử lại lần 1 sau 0s", "đánh số lần thử lại 1")
      includes(r.log, "thử lại lần 2 sau 0s", "đánh số lần thử lại 2")
      includes(r.out, "job1: model quá tải", "dòng ấy cũng ra stdout, KÈM TÊN JOB")
      // CÙNG model ở mọi lượt: `gpt-5.6-luna` là lựa chọn có chủ đích, lách sang model
      // khác là âm thầm giao tấm ảnh vẽ bằng model người dùng KHÔNG chọn.
      eq(count(r.argv, "-m gpt-5.6-luna"), 3, "mọi lượt đều kèm -m gpt-5.6-luna")
      eq(count(r.argv, 'model_reasoning_effort="medium"'), 3, "mọi lượt đều ghim effort")
      await rmTemp(work)
    })

    await it("quá tải mãi ⇒ hết lượt thử thì FAIL, bằng chứng còn nguyên trong log", async () => {
      const work = await fresh()
      const r = await runCase(work, { MODE: "busy-forever" })
      eq(r.calls, 4, "1 lần đầu + 3 lần thử lại")
      includes(r.out, "FAIL job1", "vẫn phải FAIL, không giả vờ xong")
      includes(r.log.toLowerCase(), "at capacity", "agent đọc log ấy ra MODEL_BUSY")
      await rmTemp(work)
    })

    await it("GEN_BUSY_RETRIES=0 ⇒ tắt hẳn vòng thử lại; =1 ⇒ đúng một lần thêm", async () => {
      let work = await fresh()
      let r = await runCase(work, { MODE: "busy-forever", GEN_BUSY_RETRIES: "0" })
      eq(r.calls, 1, "chỉ gọi codex một lần")
      includes(r.out, "FAIL job1", "FAIL ngay")
      await rmTemp(work)
      work = await fresh()
      r = await runCase(work, { MODE: "busy-forever", GEN_BUSY_RETRIES: "1", GEN_BUSY_BACKOFF: "0" })
      eq(r.calls, 2, "1 lần đầu + 1 lần thử lại")
      await rmTemp(work)
    })

    await it("vết 'at capacity' của lượt TRƯỚC không được đọc thành sự cố mới", async () => {
      /* `logFrom` là cả lý do khối ấy tồn tại: mọi lượt sau đều ghi NỐI vào cùng một
         log, nên soi CẢ FILE thì lời than cũ còn nằm đó mãi và vòng thử lại quay tới
         khi hết lượt — tiêu ba lượt codex cho một sự cố đã đổi nguyên nhân.
         Ca này: lượt 1 quá tải, lượt 2 hỏng vì 429. Đọc đúng phần log của lượt gần
         nhất thì DỪNG ở 2; đọc cả file thì đi tiếp tới 4. */
      const work = await fresh()
      const r = await runCase(work, { MODE: "busy-then-other" })
      eq(r.calls, 2, "dừng ngay khi lượt mới hỏng vì lý do khác")
      eq(count(r.log, "at capacity"), 1, "vết cũ vẫn nằm nguyên trong log, chỉ là không còn được đọc")
      includes(r.out, "FAIL job1", "và job vẫn FAIL")
      await rmTemp(work)
    })

    await it("'OK' chỉ được cấp khi thật sự có ẢNH MỚI (so băm, không so mtime)", async () => {
      // Port test/gen-fake-ok.test.sh — sự cố 21/08/2026: model chép lại artifact cũ
      // vào đúng đích rồi báo thành công; mtime mới tinh, 413.302 token, không ảnh mới.
      const work = await fresh()
      let r = await runCase(work, { MODE: "fresh" })
      includes(r.out, "OK  job1", "sinh được ảnh đầu tiên ⇒ OK")
      r = await runCase(work, { MODE: "fresh" })
      includes(r.out, "OK  job1", "nội dung đổi ⇒ OK")
      r = await runCase(work, { MODE: "copy" })
      includes(r.out, "FAIL job1", "chép lại ảnh cũ ⇒ FAIL")
      includes(r.out, "KHÔNG ĐỔI", "nói rõ lý do")
      r = await runCase(work, { MODE: "none" })
      includes(r.out, "FAIL job1", "không ghi gì ⇒ cũng FAIL")
      includes(r.out, "KHÔNG ĐỔI", "CÙNG một câu — từ chỗ đứng của engine, hai ca ấy là một")
      await rm(join(work, "raw/job1.png"), { force: true })
      r = await runCase(work, { MODE: "none" })
      includes(r.out, "không có raw/job1.png", "không có file đích nào ⇒ câu khác hẳn")
      await rmTemp(work)
    })

    await it("dấu full-bleed lái CẢ task GỬI ĐI lẫn chiều phép đo", async () => {
      // Port test/gen-fullbleed-alpha.test.sh, chạy qua đúng `runOne`.
      const work = await fresh({ prompt: "Canvas orientation: LANDSCAPE 1536x1024.\n", fullBleed: true })
      const src = join(work, "kin.png")
      await writeFile(src, pngKin())
      let r = await runCase(work, { MODE: "src", SRC: src, TASK_LOG: join(work, "task.txt") })
      includes(r.out, "OK  job1", "tấm nền đục kín KHÔNG bị phạt oan")
      includes(r.out, "full-bleed", "nói rõ nó được xét theo luật full-bleed")
      includes(await readFile(join(work, "task.txt"), "utf8"), 'background="opaque"',
        "task gửi codex cũng đổi theo dấu")

      await writeFile(join(work, "rong.png"), pngRong())
      r = await runCase(work, { MODE: "src", SRC: join(work, "rong.png") })
      includes(r.out, "OK  job1", "phép đo KHÔNG chặn ai cả (chốt 09/09/2026)")
      includes(r.out, "phủ KÍN", "nói đúng nguyên nhân")
      includes(r.out, "[nền: ", "nhãn KHÔNG dán chữ 'đục' cho ca ngược")

      await rm(join(work, "prompts/job1.fullbleed"), { force: true })
      await rm(join(work, "raw/job1.png"), { force: true })
      r = await runCase(work, { MODE: "src", SRC: src })
      includes(r.out, "OK  job1", "ảnh đục vẫn được đăng")
      includes(r.out, "vẽ đè kín nền", "luật cũ giữ nguyên từng chữ cho tấm thường")
      includes(r.out, "[nền đục: ", "nhãn nói đúng thứ vừa đo")
      await rmTemp(work)
    })

    await it("VỚT ẢNH: model sinh xong mà không copy về đích ⇒ engine tự vớt", async () => {
      const work = await fresh()
      const ghome = join(work, "codexhome")
      await mkdir(join(ghome, "generated_images"), { recursive: true })
      await writeFile(join(ghome, "auth.json"), "{}", "utf8")
      await writeFile(join(ghome, "generated_images", "abc.png"), pngUi())
      const r = await runCase(work, { MODE: "salvage", SALVAGE_NAME: "abc", IMG_HOME: ghome })
      includes(r.out, "OK  job1", "vớt được thì job vẫn OK")
      includes(r.log, "vớt generated_images/abc.png", "log nói rõ đã vớt")
      ok(await stat(join(work, "raw/job1.png")).then(() => true, () => false), "ảnh đã về đích")
      await rmTemp(work)
    })

    await it("đường dẫn generated_images KHÔNG tồn tại ⇒ không đoán mò ảnh khác", async () => {
      const work = await fresh()
      const ghome = join(work, "codexhome2")
      await mkdir(join(ghome, "generated_images"), { recursive: true })
      await writeFile(join(ghome, "auth.json"), "{}", "utf8")
      const r = await runCase(work, { MODE: "salvage", SALVAGE_NAME: "khong-co", IMG_HOME: ghome })
      includes(r.out, "FAIL job1", "không vớt được thì FAIL như cũ")
      ok(!r.log.includes("vớt "), "và không ghi một dòng vớt nào")
      await rmTemp(work)
    })

    await it("hồ sơ Codex riêng chưa đăng nhập ⇒ FATAL, thoát 1, KHÔNG gọi codex", async () => {
      const work = await mkdtemp(join(tmpdir(), "kitgen-auth-"))
      await cp(join(FIX, "ui-1x1", "input"), work, { recursive: true })
      process.env.KITGEN_CODEX_BIN = await fakeCodex(work)
      const lines = []
      const rc = await runGen(work, [], {
        print: s => lines.push(s),
        env: { ...process.env, IMG_HOME: join(work, "khong-co-ho-so"), MAXJOBS: "1" },
      })
      eq(rc, 1, "mã thoát")
      includes(lines.join("\n"), "FATAL: profile Codex riêng chưa đăng nhập", "câu báo")
      ok(!lines.some(l => l.startsWith("prompt →")), "chưa dựng prompt nào — thoát TRƯỚC khối ấy")
      await rmTemp(work)
    })

    await it("KITGEN_PROMPTS_ONLY=1 ⇒ dựng prompt rồi DỪNG, không gọi codex lần nào", async () => {
      const work = await mkdtemp(join(tmpdir(), "kitgen-po-"))
      await cp(join(FIX, "ui-1x1", "input"), work, { recursive: true })
      process.env.KITGEN_CODEX_BIN = await fakeCodex(work)
      const calls = join(work, "calls.txt")
      await writeFile(calls, "0", "utf8")
      const lines = []
      const rc = await runGen(work, [], {
        print: s => lines.push(s),
        env: { ...process.env, KITGEN_PROMPTS_ONLY: "1", CALLS: calls },
      })
      eq(rc, 0, "mã thoát")
      const out = lines.join("\n")
      includes(out, "prompt → prompts/tet-don.txt (+0 ảnh kèm)", "vẫn dựng prompt")
      includes(out, "KITGEN_PROMPTS_ONLY: đã dựng xong prompt", "dòng kết")
      ok(!out.includes("Bắt đầu "), "KHÔNG vào vòng gọi codex")
      eq((await readFile(calls, "utf8")).trim(), "0", "codex không bị gọi lần nào")
      eq((await readdir(join(work, "raw"))).length, 0, "KHÔNG đụng raw/")
      await rmTemp(work)
    })

    await it("MAXJOBS: 1 nói 'lần lượt từng tấm', >1 nói đúng con số", async () => {
      // Dòng này đi thẳng lên màn hình người dùng. Trước 15/09/2026 nó nói "chạy song
      // song" bất kể MAXJOBS, và chính lời tường thuật sai ấy làm hai người đọc log
      // r-0059 tin rằng maxJobs bị phớt lờ.
      const mk = async () => {
        const work = await mkdtemp(join(tmpdir(), "kitgen-mj-"))
        await cp(join(FIX, "multi-style-sheetbreaks", "input"), work, { recursive: true })
        process.env.KITGEN_CODEX_BIN = await fakeCodex(work)
        return work
      }
      let work = await mk()
      let lines = []
      await runGen(work, ["noel-ui2"], {
        print: s => lines.push(s),
        env: { ...process.env, MAXJOBS: "1", MODE: "none", GEN_BUSY_RETRIES: "0" },
      })
      ok(lines.some(l => /^Bắt đầu \d\d:\d\d:\d\d — chạy lần lượt từng tấm \(lọc: noel-ui2\)$/.test(l)),
        `MAXJOBS=1 phải nói "lần lượt": ${lines.find(l => l.startsWith("Bắt đầu"))}`)
      // Prompt dựng cho MỌI job (y như bản bash), nhưng chỉ job khớp filter mới chạy.
      eq(lines.filter(l => l.startsWith("prompt →")).length, 6, "dựng prompt cho cả 6 job")
      eq(lines.filter(l => l.startsWith("FAIL ")).length, 1, "chỉ một job đi qua vòng codex")
      includes(lines.join("\n"), "FAIL noel-ui2", "và đúng job đã lọc")
      await rmTemp(work)

      work = await mk()
      lines = []
      await runGen(work, [], {
        print: s => lines.push(s),
        env: { ...process.env, MAXJOBS: "4", MODE: "none", GEN_BUSY_RETRIES: "0" },
      })
      ok(lines.some(l => /^Bắt đầu \d\d:\d\d:\d\d — chạy tối đa 4 tấm cùng lúc$/.test(l)),
        `MAXJOBS=4 phải nói đúng con số: ${lines.find(l => l.startsWith("Bắt đầu"))}`)
      eq(lines.filter(l => l.startsWith("FAIL ")).length, 6, "cả 6 job đều đi qua vòng codex")
      ok(lines[lines.length - 1].startsWith("Xong "), "dòng cuối là Xong")
      await rmTemp(work)
    })

    /* ══ HAI CON BUG CỦA `cover.sh`, VÁ Ở BƯỚC ④ ═════════════════════════════════
       Bước ③ chép nguyên chúng (xem đầu `engine/cover.mjs`); ca này là cái khoá để
       chúng không quay lại. Cả hai đều VÔ HÌNH nếu chỉ nhìn ảnh bìa: lượt vẽ vẫn ra
       một tấm, chỉ là bằng model/mức nghĩ mà không ai chọn. */
    await it("cover: cổng model hỏi ĐÚNG home sẽ vẽ, và lượt hạ cấp GIỮ mức nghĩ", async () => {
      const w = await mkdtemp(join(tmpdir(), "kitgen-cov-bug-"))
      const bin = await fakeCodex(w)
      for (const d of ["cover", "logs", "prompts"]) await mkdir(join(w, d), { recursive: true })
      await writeFile(join(w, "prompts/cover.txt"), "một prompt ảnh bìa\n", "utf8")
      // Hồ sơ ảnh RIÊNG, đã đăng nhập: đúng hình dạng mà bug ① chỉ lộ ra ở đó.
      const home = join(w, "codex-home")
      await mkdir(home, { recursive: true })
      await writeFile(join(home, "auth.json"), "{}", "utf8")

      const argvLog = join(w, "argv.txt")
      const homeLog = join(w, "home.txt")
      await writeFile(argvLog, "", "utf8")
      const vars = {
        KITGEN_CODEX_BIN: bin, IMG_HOME: home, MODE: "reject",
        ARGV_LOG: argvLog, HOME_LOG: homeLog,
      }
      const prev = {}
      for (const [k, v] of Object.entries(vars)) { prev[k] = process.env[k]; process.env[k] = v }
      const lines = []
      try {
        await runCover(w, { env: { ...process.env }, print: s2 => lines.push(s2) })
      } finally {
        for (const [k, v] of Object.entries(prev)) {
          if (v === undefined) delete process.env[k]; else process.env[k] = v
        }
      }

      // ① `codex debug models` phải được hỏi VỚI CODEX_HOME của hồ sơ ảnh.
      eq(await readFile(homeLog, "utf8"), home, "cổng model soi đúng home sẽ vẽ")

      const calls = (await readFile(argvLog, "utf8")).trim().split("\n").filter(Boolean)
      eq(calls.length, 2, "một lượt bị từ chối + đúng một lượt hạ cấp")
      includes(calls[0], "-m gpt-5.6-luna", "lượt đầu có tên model")
      includes(calls[0], 'model_reasoning_effort="medium"', "và có mức nghĩ")
      // ② Hạ cấp bỏ TÊN MODEL, nhưng mức nghĩ thì không việc gì phải bỏ.
      ok(!calls[1].includes("-m "), "lượt hạ cấp KHÔNG còn -m")
      includes(calls[1], 'model_reasoning_effort="medium"', "lượt hạ cấp vẫn GIỮ mức nghĩ")
      await rmTemp(w)
    })

    await it("khối dựng prompt CHẾT giữa chừng: bản JS DỪNG TRƯỚC vòng gọi codex", async () => {
      /* ⚠️ ĐÂY LÀ CHỖ HAI ENGINE CỐ Ý KHÁC NHAU, VÀ ĐÓ LÀ CẢ Ý NGHĨA CỦA CA NÀY.
         `gen.sh` để `py_rc` chỉ có quyền ở nhánh xem-trước prompt: ở lượt gen thật,
         `assert` lưới sai số ô giết khối python GIỮA CHỪNG mà không dừng được gì —
         bash chạy tiếp vào vòng gọi codex với những prompt CŨ hoặc KHÔNG CÓ, và TIÊU
         QUOTA cho chúng. Bước ③ chép nguyên con bug để so được hai bản; bước ④ vá ở
         bản JS (xem `runGen`), vì bản bash sắp bị xoá.
         Ca này vì thế KHÔNG so stdout hai bên nữa. Nó đòi đúng ba điều ở bản JS:
         KHÔNG có dòng phán quyết nào của một job, codex KHÔNG hề được gọi, và mã
         thoát KHÁC 0 (3 = "prompt chết", phân biệt với 1 = "chưa đăng nhập"). */
      const seed = await mkdtemp(join(tmpdir(), "kitgen-bad-seed-"))
      const codexSrc = await fakeCodex(seed)
      const styles = JSON.stringify({
        styles: [{ id: "v", style: "x" }],
        sheets: [{
          id: "s", canvas: "square", grid: { cols: 2, rows: 2 },
          components: [{ file: "a", spec: "a", skel: { shape: "rrect", w: 0.5, h: 0.5 } }],
        }],
      }, null, 2)

      const jw = await mkdtemp(join(tmpdir(), "kitgen-bad-js-"))
      await writeFile(join(jw, "styles.json"), styles, "utf8")
      const calls = join(jw, "calls.txt")
      await writeFile(calls, "0", "utf8")
      const jsEnv = {
        ...process.env, KITGEN_CODEX_BIN: codexSrc, MAXJOBS: "1", MODE: "none",
        GEN_BUSY_RETRIES: "0", CALLS: calls,
      }
      delete jsEnv.DST
      const js = await exec(process.execPath, [join(ENGINE, "cli.mjs"), "gen", jw], { cwd: jw, env: jsEnv })

      eq(js.code, 3, "mã thoát — KHÁC 0, và là mã riêng của ca prompt chết")
      ok(!/^OK /m.test(js.out), "không job nào được tuyên OK")
      ok(!/^FAIL v-s/m.test(js.out), "KHÔNG gọi codex cho job không có prompt")
      includes(js.out, "FAIL dựng-prompt", "nói thẳng hỏng ở khâu dựng prompt")
      includes(js.out, "component ≠ lưới", "và nói luôn lý do trên chính dòng ấy")
      includes(js.out, "KHÔNG tiêu quota", "và nói thẳng rằng không tiêu quota")
      includes(js.err, "component ≠ lưới", "bằng chứng thật vẫn ra stderr, không bị nuốt")
      eq((await readFile(calls, "utf8")).trim(), "0", "codex giả KHÔNG hề bị gọi lần nào")
      ok(!(await readdir(join(jw, "prompts")).catch(() => [])).some(f => f.endsWith(".txt")),
        "và không có prompt nào được ghi ra để mà gửi đi")
      await rmTemp(jw); await rmTemp(seed)
    })

    // Trả PATH của codex về như cũ: bộ ca sau không được thừa kế một con codex giả.
    delete process.env.KITGEN_CODEX_BIN
  }

  // ══════════════════════════════════════════ 3. SO TRỰC TIẾP VỚI gen.sh
  describe("engine JS › gen: so TRỰC TIẾP với gen.sh trên cùng codex giả")

  /* Thiếu Pillow thì `alpha_verdict` của bash trả "skip" cho MỌI ảnh, còn bản JS vẫn
     đo thật — hai bên nói khác nhau vì máy thiếu thư viện, không vì engine sai. Một ca
     không chạy được phải TỰ KHAI, chứ không được giả vờ xanh. */
  const canRunBash = !IS_WIN && (await exec("python3", ["-c", "import PIL"])).code === 0

  if (!canRunBash) {
    await it("[bỏ qua] máy này không chạy được gen.sh (cần bash + python3)", async () => { ok(true) })
  } else {
    /**
     * Chuẩn hoá stdout trước khi so. Ba thứ bị gạt, và mỗi thứ có lý do:
     *  · giờ `HH:MM:SS` — hai lượt chạy ở hai thời điểm;
     *  · cỡ file sau `OK  <job>` — `du -h` của BSD/GNU in khác nhau (xem `humanSize`);
     *  · khối `ls -la raw/` mà `gen.sh` in ở dòng cuối — bản JS cố ý KHÔNG chép.
     */
    const norm = out => out
      .split("\n")
      .filter(l => !/^(total |[-dlbcps][rwxSsTt-]{9})/.test(l))     // ls -la
      .map(l => l.replace(/\d\d:\d\d:\d\d/, "<giờ>"))
      .map(l => l.replace(/^(OK {2}\S+) +\S+/, "$1  <cỡ>"))
      .join("\n").replace(/\n+$/, "")

    /** Chép engine bash vào một thư mục làm việc, đúng hình dạng agent dựng trên máy thật. */
    async function bashWork(fixture, codexSrc) {
      const work = await mkdtemp(join(tmpdir(), "kitgen-cmp-bash-"))
      await cp(join(FIX, fixture, "input"), work, { recursive: true })
      await cp(join(REPO, "gen.sh"), join(work, "gen.sh"))
      await cp(join(REPO, "geometry.py"), join(work, "geometry.py"))
      await chmod(join(work, "gen.sh"), 0o755)
      await cp(codexSrc, join(work, "codex"))
      await chmod(join(work, "codex"), 0o755)
      return work
    }

    /** Ảnh tham chiếu mà `.att` của ca trỏ tới. Có mặt thật thì `-i` mới được đính và
     *  đường dẫn mới được liệt kê trong task — nhánh đắt nhất của `run_one`. */
    async function seedRefs(dir, names) {
      if (!names.length) return
      await mkdir(join(dir, "refs"), { recursive: true })
      for (const n of names) await writeFile(join(dir, "refs", n), pngUi())
    }

    const REFS = ["shared.png", "layout.png", "brand-logo.png", "inspo-1.jpg"]
    for (const [fixture, mode, refs] of [
      ["ui-1x1", "src", []],
      ["bg-multi-scenes", "src", []],
      ["multi-style-sheetbreaks", "none", []],
      ["inspo-brand-refs", "src", REFS],          // .att có ảnh THẬT ⇒ `-i` + khối REFERENCE IMAGES
    ]) {
      await it(`ca «${fixture}» (MODE=${mode}) — stdout của hai engine trùng từng dòng`, async () => {
        const seed = await mkdtemp(join(tmpdir(), "kitgen-cmp-seed-"))
        const codexSrc = await fakeCodex(seed)
        const src = join(seed, "anh.png")
        await writeFile(src, pngUi())

        // ① bash gen.sh — codex giả nằm trong PATH, đúng lối của bộ ca shell.
        const bw = await bashWork(fixture, codexSrc)
        await seedRefs(bw, refs)
        // codex giả nằm trong PATH — đúng lối của bộ ca shell. Nó tự suy đích ra từ
        // `-o logs/<job>.last.txt` nên không cần `DST`, và phục vụ được lượt nhiều job.
        const shEnv = {
          ...process.env, PATH: `${bw}:${process.env.PATH}`,
          MAXJOBS: "1", MODE: mode, SRC: src, GEN_BUSY_RETRIES: "0",
        }
        delete shEnv.KITGEN_CODEX_BIN
        delete shEnv.DST
        const sh = await exec("bash", ["./gen.sh"], { cwd: bw, env: shEnv })

        // ② node cli.mjs gen
        const jsEnv = { ...process.env }
        delete jsEnv.DST
        const jw = await mkdtemp(join(tmpdir(), "kitgen-cmp-js-"))
        await cp(join(FIX, fixture, "input"), jw, { recursive: true })
        await seedRefs(jw, refs)
        const js = await exec(process.execPath, [join(ENGINE, "cli.mjs"), "gen", jw], {
          cwd: jw,
          env: { ...jsEnv, KITGEN_CODEX_BIN: codexSrc, MAXJOBS: "1", MODE: mode, SRC: src, GEN_BUSY_RETRIES: "0" },
        })

        eq(js.code, sh.code, "mã thoát")
        const a = norm(sh.out), b = norm(js.out)
        if (a !== b) {
          const al = a.split("\n"), bl = b.split("\n")
          for (let i = 0; i < Math.max(al.length, bl.length); i++) {
            if (al[i] !== bl[i]) {
              throw new Error(`${fixture}: stdout lệch ở dòng ${i + 1}\n` +
                `    gen.sh: ${JSON.stringify(al[i])}\n    js    : ${JSON.stringify(bl[i])}`)
            }
          }
        }
        eq(b, a, `${fixture}: stdout`)

        /* STDOUT GIỐNG NHAU CHƯA ĐỦ khi ca có ảnh tham chiếu: khối chữ gửi CHO CODEX
           mới là thứ tốn tiền, và nó chứa đường dẫn tuyệt đối của từng ảnh. So luôn
           `logs/<job>.last.txt`? Không — codex giả không ghi file ấy. So bằng cách
           bắt chính task: chạy lại một lượt với TASK_LOG cho cả hai bên. */
        if (refs.length) {
          /* Thay CẢ hai cách viết cùng một thư mục. Trên macOS `/var` là symlink tới
             `/private/var`: bash lấy `pwd` từ `getcwd()` (biến PWD thừa kế không khớp
             thư mục thật) nên nó viết `/private/var/…`, còn Node giữ `/var/…`. Hai
             chuỗi, một thư mục — và nếu không gạt thì ca đỏ vì symlink của hệ điều
             hành chứ không vì engine. */
          const grab = async (dir, cmd, env) => {
            const tl = join(dir, "task.txt")
            await exec(cmd[0], cmd[1], { cwd: dir, env: { ...env, TASK_LOG: tl } })
            const real = await realpath(dir)
            return (await readFile(tl, "utf8")).split(real).join("<project>").split(dir).join("<project>")
          }
          const tSh = await grab(bw, ["bash", ["./gen.sh"]], shEnv)
          const tJs = await grab(jw, [process.execPath, [join(ENGINE, "cli.mjs"), "gen", jw]],
            { ...jsEnv, KITGEN_CODEX_BIN: codexSrc, MAXJOBS: "1", MODE: mode, SRC: src, GEN_BUSY_RETRIES: "0" })
          includes(tSh, "--- REFERENCE IMAGES START ---", "ca này phải có ảnh kèm thật")
          eq(tJs, tSh, `${fixture}: khối task gửi codex`)
        }
        await rmTemp(bw); await rmTemp(jw); await rmTemp(seed)
      })
    }

    await it("cover: `bash cover.sh` và `node cli.mjs cover` ra cùng stdout và CÙNG PIXEL", async () => {
      const seed = await mkdtemp(join(tmpdir(), "kitgen-cov-seed-"))
      const codexSrc = await fakeCodex(seed)
      const src = join(FIX_RS, "src.png")

      /** Dựng một project chỉ có đúng thứ `cover.sh` cần đọc. */
      async function mk(withScript) {
        const w = await mkdtemp(join(tmpdir(), "kitgen-cov-"))
        for (const d of ["cover", "logs", "prompts"]) await mkdir(join(w, d), { recursive: true })
        await writeFile(join(w, "prompts/cover.txt"), "một prompt ảnh bìa\n", "utf8")
        if (withScript) {
          await cp(join(REPO, "cover.sh"), join(w, "cover.sh"))
          await chmod(join(w, "cover.sh"), 0o755)
          await cp(codexSrc, join(w, "codex"))
          await chmod(join(w, "codex"), 0o755)
        }
        return w
      }

      const bw = await mk(true)
      const shEnv = { ...process.env, PATH: `${bw}:${process.env.PATH}`, MODE: "cover", SRC: src }
      delete shEnv.KITGEN_CODEX_BIN
      delete shEnv.DST
      const sh = await exec("bash", [join(bw, "cover.sh"), bw], { cwd: bw, env: shEnv })

      const jw = await mk(false)
      const jsEnv = { ...process.env, KITGEN_CODEX_BIN: codexSrc, MODE: "cover", SRC: src }
      delete jsEnv.DST
      const js = await exec(process.execPath, [join(ENGINE, "cli.mjs"), "cover", jw], { cwd: jw, env: jsEnv })

      eq(js.code, sh.code, "mã thoát")
      // Hai lượt chạy ở hai thư mục tạm khác nhau, và `du -h` in khác nhau giữa BSD/GNU.
      const norm = (out, dir) => out.split("\n")
        .map(l => l.split(dir).join("<project>"))
        .map(l => l.replace(/^(OK {2}cover) +\S+$/, "$1  <cỡ>"))
        .join("\n").replace(/\n+$/, "")
      eq(norm(js.out, jw), norm(sh.out, bw), "stdout")
      includes(sh.out, "OK  cover", "bản bash phải đi tới nhánh cắt được (máy này có Pillow)")

      const a = decode(await readFile(join(bw, "cover/cover.png")))
      const b = decode(await readFile(join(jw, "cover/cover.png")))
      eq([b.width, b.height, b.bands], [a.width, a.height, a.bands], "khổ + số kênh")
      let lech = 0
      for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) lech++
      eq(lech, 0, `số byte pixel lệch (Pillow vs JS) — ${a.width}x${a.height}`)
      await rmTemp(bw); await rmTemp(jw); await rmTemp(seed)
    })
  }

  // ══════════════════════════════════════════ 4. ẢNH: cover + thumbnail
  describe("engine JS › ảnh: cover 16:9 · thumbnail")

  await it("cropCover cắt DẢI GIỮA của 3:2 rồi co về đúng 1600x900", async () => {
    // 1536x1024 → nh = round(1536 / (16/9)) = 864 → box (0, 80, 1536, 944).
    const w = 1536, h = 1024
    const d = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      d[i] = (x * 7 + y * 3) % 256; d[i + 1] = (x + y * 5) % 256; d[i + 2] = (x ^ y) % 256; d[i + 3] = 255
    }
    const out = decode(cropCover(encode({ width: w, height: h, data: d })))
    eq([out.width, out.height], [1600, 900], "khổ đích")
    eq(out.bands, ["R", "G", "B"], "`convert(\"RGB\")` — ảnh bìa luôn đục, không có alpha")
  })

  await it("thumbnail giữ đúng tỉ lệ theo `round_aspect` của Pillow, không phải làm tròn thường", () => {
    // 1536x1024 xuống khung 256 ra cao 171, KHÔNG phải 170: Pillow thử cả floor lẫn
    // ceil rồi chọn bên giữ tỉ lệ sát hơn. Lệch một pixel ở đây là lệch cả lưới web.
    eq(thumbnailSize(1536, 1024, [256, 1024]), [256, 171])
    eq(thumbnailSize(1536, 1024, [128, 512]), [128, 85])
    eq(thumbnailSize(1024, 1536, [256, 1024]), [256, 384], "tấm DỌC bị bề rộng khống chế")
    eq(thumbnailSize(64, 64, [256, 1024]), null, "ảnh đã nhỏ hơn khung ⇒ Pillow không đụng gì")
  })

  await it("thumbnail ra đúng khổ, đúng RGBA, và không phóng to ảnh nhỏ", () => {
    const w = 1536, h = 1024
    const d = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) { d[i * 4] = i % 256; d[i * 4 + 1] = 99; d[i * 4 + 2] = 7; d[i * 4 + 3] = i % 2 ? 255 : 0 }
    const big = encode({ width: w, height: h, data: d })
    for (const [want, size] of [[128, [128, 85]], [256, [256, 171]], [512, [512, 341]]]) {
      const t = decode(thumbnail(big, want))
      eq([t.width, t.height], size, `thumbnail ${want}px`)
      eq(t.bands, ["R", "G", "B", "A"], "`convert('RGBA')`")
    }
    const small = decode(thumbnail(pngUi(), 256))
    eq([small.width, small.height], [64, 64], "ảnh 64x64 xin 256 ⇒ giữ nguyên, KHÔNG phóng to")
  })

  await it("cover + thumbnail trùng TỪNG PIXEL với Pillow (mốc đã đóng băng)", async () => {
    /* Mốc do `agent/test/engine-golden/make-resample-golden.py` dựng bằng Pillow thật.
       Nó là sha256 của MẢNG PIXEL chứ không phải của file PNG: Pillow và `png.mjs`
       chọn filter/zlib khác nhau nên hai file mang cùng một tấm ảnh vẫn khác byte —
       so file thì đỏ vì lý do chẳng liên quan gì tới phép nội suy.
       ĐỎ Ở ĐÂY THÌ SỬA BẢN JS, ĐỪNG DỰNG LẠI MỐC. */
    const g = JSON.parse(await readFile(join(FIX_RS, "pillow.json"), "utf8"))
    const sha = buf => createHash("sha256").update(buf).digest("hex")
    /** Mảng pixel đúng thứ tự `im.tobytes()` của Pillow (RGB 3 byte, RGBA 4 byte). */
    const bytesOf = (im, bands) => {
      const out = Buffer.alloc(im.width * im.height * bands)
      for (let i = 0, n = im.width * im.height; i < n; i++) {
        for (let c = 0; c < bands; c++) out[i * bands + c] = im.data[i * 4 + c]
      }
      return out
    }
    const src = await readFile(join(FIX_RS, "src.png"))
    const srcRgb = await readFile(join(FIX_RS, "src-rgb.png"))

    eq(sha(bytesOf(decode(cropCover(src)), 3)), g.cases.cover,
      `cover 16:9 (LANCZOS) phải trùng Pillow ${g.pillow} từng pixel`)

    for (const [name, buf] of [["rgba", src], ["rgb", srcRgb]]) {
      for (const want of [32, 64, 128]) {
        const t = decode(thumbnail(buf, want))
        eq([t.width, t.height], g.cases[`thumb-${name}-${want}-size`], `khổ thumb-${name}-${want}`)
        eq(sha(bytesOf(t, 4)), g.cases[`thumb-${name}-${want}`], `pixel thumb-${name}-${want}`)
      }
    }
  })

  await it("lõi resample là số nguyên 22 bit của Pillow, không phải float của JS", () => {
    /* Ca canh chừng hằng số: đổi `PRECISION_BITS`, đổi `clip8`, hay đổi phép làm tròn
       hệ số đều lộ ra ngay ở một tấm 4x1 dựng tay. Con số dưới đây lấy từ chính bản
       đã đo trùng từng byte với Pillow 11.3 trên fixture 1536x1024. */
    const im = { width: 4, height: 1, bands: 3, data: new Uint8Array([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]) }
    // Đo bằng Pillow 11.3 trên đúng tấm này. KHÔNG phải 127/127: cửa sổ bộ lọc rộng
    // hơn một pixel nên hai ô ra hai giá trị LỆCH NHAU, và đó mới là dấu vân tay.
    eq([...resize(im, 2, 1, "bilinear").data], [109, 109, 109, 146, 146, 146], "BILINEAR")
    eq([...resize(im, 2, 1, "lanczos").data], [101, 101, 101, 154, 154, 154], "LANCZOS")
    // `reduce` đi đường khác hẳn: cộng sẵn nửa ô rồi mới cắt ⇒ làm tròn NỬA LÊN.
    const r = reduce({ width: 2, height: 1, bands: 3, data: new Uint8Array([0, 0, 0, 255, 255, 255]) }, 2, 1)
    eq([...r.data], [128, 128, 128], "reduce cộng `amend` trước ⇒ 128, không phải 127")
  })
}
