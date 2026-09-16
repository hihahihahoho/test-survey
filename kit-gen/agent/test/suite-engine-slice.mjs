/* suite-engine-slice.mjs — DAO CẮT JS PHẢI RA ĐÚNG THỨ DAO CẮT PYTHON RA.
 *
 * ╔══ BA VIỆC, VÀ CHÚNG LÀ BA VIỆC KHÁC NHAU ══════════════════════════════════╗
 * ║ ① GOLDEN — so với đầu ra THẬT của `slice.py` + Pillow trên cùng đầu vào     ║
 * ║   (`agent/test-fixtures/engine-golden-slice/`, dựng bằng                    ║
 * ║   `agent/test/engine-golden/make-golden-slice.sh`). So TỪNG PIXEL trên cả   ║
 * ║   bốn kênh, `kits/manifest.json` TỪNG BYTE, stdout TỪNG CHỮ, exit code.     ║
 * ║   Không so "gần giống": một byte alpha lệch là một sprite hỏng trong game.  ║
 * ║ ② CODEC PNG — 23 ca dựng ở mức byte, mỗi ca kèm đầu ra `convert("RGBA")`   ║
 * ║   của Pillow; cộng round-trip mã hoá→giải mã.                              ║
 * ║ ③ CA PORT TỪ PYTEST — `tests/test_slice_*.py` và `test/slice-orientation.  ║
 * ║   test.py` phát biểu những LUẬT mà golden không nói ra thành lời: dao cắt   ║
 * ║   không được HẠ một byte alpha nào, ngưỡng 240 là biên chính xác, sàn       ║
 * ║   lượng tử 4 dời HỘP chứ không sửa PIXEL, khổ sai thì KHÔNG được đem cắt.   ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * GOLDEN ĐỎ THÌ SỬA BẢN JS, ĐỪNG DỰNG LẠI GOLDEN. Dựng lại golden để "cho nó
 * xanh" là tự tay xoá cái duy nhất đang canh chừng hai engine cắt giống nhau.
 */
import { readdir, readFile, mkdtemp, mkdir, writeFile, cp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, it, eq, ok, rmTemp } from "./harness.mjs"
import { decode, encode } from "../engine/png.mjs"
import { Rgba } from "../engine/image.mjs"
import {
  runSlice, parseCli, snapSolidAlpha, alphaBbox, readSheet, orientationError,
  guessCoreBox, paintCoverage, measureCell, acquireManifestLock, dumpManifest,
  openImage, saveImage, SOLID_ALPHA, CONTENT_ALPHA, CORE_ALPHA, SystemExit,
} from "../engine/slice.mjs"
import { main as validateMain } from "../engine/validate.mjs"
import { pyLoads, pyDumps, F } from "../engine/pyjson.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIX = join(HERE, "..", "test-fixtures", "engine-golden-slice")
const PNGFIX = join(HERE, "..", "test-fixtures", "engine-golden-png")

/* ── tiện ích ────────────────────────────────────────────────────────────── */

async function walk(dir, base = "") {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await walk(join(dir, e.name), base + e.name + "/"))
    else out.push(base + e.name)
  }
  return out
}

/** Ảnh RGBA dựng trong bộ nhớ — thay cho `Image.new` của PIL trong bộ pytest. */
function cell(w, h, fill = [0, 0, 0, 0]) {
  const im = new Rgba(w, h)
  for (let i = 0; i < w * h; i++) im.data.set(fill, i * 4)
  return im
}
function fillRect(im, [x0, y0, x1, y1], px) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= im.width || y >= im.height) continue
      im.data.set(px, (y * im.width + x) * 4)
    }
  }
  return im
}
/* Ba hình mà bộ pytest vẽ bằng `ImageDraw`. KHÔNG cần trùng từng pixel với PIL:
   ca ở đây kiểm PHÉP ĐOÁN THÂN với dung sai ±4px, và thứ nó đo là hình học của
   hình (mép ngoài, độ cong, chỗ trang trí đậu) chứ không phải nét vẽ của PIL. Ca
   nào cần trùng từng pixel thì đã nằm ở khối golden, nơi ảnh do PIL sinh thật. */
function roundedRect(im, [x0, y0, x1, y1], r, px) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x < x0 + r ? x0 + r - x : x > x1 - r ? x - (x1 - r) : 0
      const dy = y < y0 + r ? y0 + r - y : y > y1 - r ? y - (y1 - r) : 0
      if (dx * dx + dy * dy <= r * r) im.data.set(px, (y * im.width + x) * 4)
    }
  }
  return im
}
/** `d.rectangle(box, outline=…, width=w)` — viền dày `w` VÀO TRONG hộp. */
function outline(im, [x0, y0, x1, y1], w, px) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < x0 + w || x > x1 - w || y < y0 + w || y > y1 - w) im.data.set(px, (y * im.width + x) * 4)
    }
  }
  return im
}
/** `d.ellipse(box, outline=…, width=w)` — vành khuyên dày `w` vào trong ellipse. */
function ellipseOutline(im, [x0, y0, x1, y1], w, px) {
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2
  const cx = x0 + rx, cy = y0 + ry
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry
      const ui = (x - cx) / (rx - w), vi = (y - cy) / (ry - w)
      if (u * u + v * v <= 1 && ui * ui + vi * vi > 1) im.data.set(px, (y * im.width + x) * 4)
    }
  }
  return im
}

/** Hộp CẢ CỤM như `measure_cell` đo nó: bbox α ≥ 128 → [x, y, w, h]. */
function safeOf(im) {
  const b = alphaBbox(im, CORE_ALPHA)
  return b && [b[0], b[1], b[2] - b[0], b[3] - b[1]]
}
function near(got, want, tol = 4) {
  ok(got !== null && got !== undefined, "không đoán được thân, mà ca này phải đoán được")
  for (let i = 0; i < want.length; i++) {
    ok(Math.abs(got[i] - want[i]) <= tol, `số thứ ${i}: [${got}] ≠ [${want}] (±${tol})`)
  }
}

/* ── ① GOLDEN ────────────────────────────────────────────────────────────── */

async function chayCaGolden(name) {
  const cdir = join(FIX, name)
  const box = await mkdtemp(join(tmpdir(), `kitgen-slice-${name}-`))
  await cp(join(cdir, "raw"), join(box, "raw"), { recursive: true })
  await cp(join(cdir, "styles.json"), join(box, "styles.json"))
  return { box, cdir, steps: JSON.parse(await readFile(join(cdir, "steps.json"), "utf8")) }
}

async function caGolden(name) {
  const { box, cdir, steps } = await chayCaGolden(name)
  try {
    // ĐỐI CHIẾU NGAY SAU TỪNG LƯỢT, không gom lại cuối: manifest bị lượt sau GHI ĐÈ,
    // và chính khối merge «giữ sheet không chạy lượt này» là thứ ca lũy tiến canh.
    for (let i = 0; i < steps.length; i++) {
      let out = "", errText = ""
      const { code } = runSlice(steps[i], { root: box, write: s => { out += s }, err: s => { errText += s } })
      const wantOut = await readFile(join(cdir, "expected", `step-${i}.stdout.txt`), "utf8")
      const wantCode = Number((await readFile(join(cdir, "expected", `step-${i}.exit.txt`), "utf8")).trim())
      eq(out, wantOut, `stdout lượt ${i} (argv ${JSON.stringify(steps[i])})${errText ? ` [stderr: ${errText}]` : ""}`)
      eq(code, wantCode, `exit code lượt ${i}`)
      const wm = join(cdir, "expected", `step-${i}.manifest.json`)
      if (await exists(wm)) {
        eq(await readFile(join(box, "kits", "manifest.json"), "utf8"),
          await readFile(wm, "utf8"), `kits/manifest.json sau lượt ${i}`)
      }
    }
    const ek = join(cdir, "expected", "kits")
    if (await exists(ek)) {
      const want = (await walk(ek)).sort()
      const gotDir = join(box, "kits")
      const got = (await exists(gotDir) ? await walk(gotDir) : []).filter(f => f.endsWith(".png")).sort()
      eq(got.join("\n"), want.join("\n"), "danh sách ảnh đã cắt")
      for (const f of want) {
        const a = decode(await readFile(join(ek, f)))
        const b = decode(await readFile(join(gotDir, f)))
        eq(`${b.width}x${b.height}`, `${a.width}x${a.height}`, `khổ ${f}`)
        let lech = -1
        for (let k = 0; k < a.data.length; k++) if (a.data[k] !== b.data[k]) { lech = k; break }
        ok(lech < 0, lech < 0 ? "" : `${f}: pixel #${(lech / 4) | 0} kênh ${"RGBA"[lech % 4]}: `
          + `${b.data[lech]} ≠ ${a.data[lech]} (bản Python)`)
      }
    }
  } finally { await rmTemp(box) }
}

async function caValidate(name) {
  const vdir = join(FIX, name, "expected", "validate")
  for (const f of (await readdir(vdir)).filter(x => x.endsWith(".json"))) {
    const job = f.replace(/\.json$/, "")
    let out = ""
    const code = validateMain([
      "--image", join(FIX, name, "raw", `${job}.png`),
      "--contract", join(FIX, name, "contract.json"), "--job", job,
    ], { write: s => { out += s } })
    eq(out, await readFile(join(vdir, f), "utf8"), `validate ${job}: stdout`)
    eq(code, Number((await readFile(join(vdir, `${job}.exit.txt`), "utf8")).trim()), `validate ${job}: exit code`)
  }
}

const exists = p => stat(p).then(() => true, () => false)

/* ── chạy ────────────────────────────────────────────────────────────────── */

export async function run() {
  const cases = (await readdir(FIX)).sort()

  describe("engine-js/cắt · golden")
  ok(cases.length >= 10, `golden phải có ít nhất 10 ca, đang có ${cases.length}`)
  for (const name of cases) {
    await it(`${name}: ảnh từng pixel + manifest từng byte + stdout từng chữ`, () => caGolden(name))
  }

  describe("engine-js/hình học đầu ra · golden")
  for (const name of cases) {
    if (!(await exists(join(FIX, name, "expected", "validate")))) continue
    await it(`${name}: validate_output_geometry ra đúng JSON + exit code`, () => caValidate(name))
  }

  /* ── ② CODEC PNG ───────────────────────────────────────────────────────── */

  describe("engine-js/codec PNG")
  const wantPng = JSON.parse(await readFile(join(PNGFIX, "expected.json"), "utf8"))

  await it("giải mã 23 tổ hợp color type / bit depth / tRNS / Adam7 đúng như Pillow", async () => {
    const names = Object.keys(wantPng).sort()
    eq(names.length >= 20, true, "số ca codec")
    for (const name of names) {
      const want = wantPng[name]
      const got = decode(await readFile(join(PNGFIX, `${name}.png`)))
      eq(`${got.width}x${got.height}`, `${want.size[0]}x${want.size[1]}`, `${name}: khổ`)
      eq(got.bands.join(","), want.bands.join(","), `${name}: getbands()`)
      eq([...got.data].join(","), want.rgba.join(","), `${name}: pixel sau convert("RGBA")`)
    }
  })

  await it("mã hoá → giải mã lại là phép đồng nhất (RGBA giữ alpha, RGB ép 255)", async () => {
    for (const name of Object.keys(wantPng)) {
      const src = decode(await readFile(join(PNGFIX, `${name}.png`)))
      const rgba = decode(encode(src, { channels: 4 }))
      eq([...rgba.data].join(","), [...src.data].join(","), `${name}: vòng RGBA`)
      const rgb = decode(encode(src, { channels: 3 }))
      const want = [...src.data]
      for (let i = 3; i < want.length; i += 4) want[i] = 255
      eq([...rgb.data].join(","), want.join(","), `${name}: vòng RGB`)
    }
  })

  await it("ảnh lớn có mọi filter vẫn vào-ra nguyên vẹn", () => {
    const W = 137, H = 89
    const im = new Rgba(W, H)
    let s = 1234567
    for (let i = 0; i < im.data.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; im.data[i] = (s >>> 8) & 0xff }
    const back = decode(encode(im, { channels: 4 }))
    eq(`${back.width}x${back.height}`, `${W}x${H}`, "khổ")
    eq([...back.data].join(","), [...im.data].join(","), "pixel")
  })

  await it("file không phải PNG thì NÉM, không trả ảnh rỗng", () => {
    let threw = false
    try { decode(Buffer.from("KHÔNG PHẢI PNG ĐÂU NHÉ")) } catch { threw = true }
    ok(threw, "decode() nuốt mất một file hỏng")
  })

  /* ── ③ CA PORT TỪ PYTEST ───────────────────────────────────────────────── */

  describe("engine-js/cắt · khổ sai thì KHÔNG đem cắt (port test/slice-orientation.test.py)")
  await it("khổ đúng lọt, khổ sai bị bắt, chữ lạ rơi về landscape", () => {
    const hople = (label, orient, w, h, canvas) =>
      ok(orientationError(orient, w, h, canvas) === null, `${label} lẽ ra phải hợp lệ`)
    const bat = (label, orient, w, h, canvas) =>
      ok(orientationError(orient, w, h, canvas) !== null, `${label} lẽ ra phải bị bắt`)
    hople("landscape 1536x1024", "landscape", 1536, 1024)
    hople("portrait 1024x1536", "portrait", 1024, 1536)
    hople("orient thiếu ⇒ landscape", null, 1536, 1024)
    hople("landscape 1520x1024 (lệch nhẹ)", "landscape", 1520, 1024)
    bat("landscape mà nhận ảnh DỌC", "landscape", 1024, 1536)
    bat("portrait mà nhận ảnh NGANG", "portrait", 1536, 1024)
    bat("landscape mà nhận ảnh VUÔNG", "landscape", 1024, 1024)
    bat("portrait mà nhận ảnh VUÔNG", "portrait", 1024, 1024)
    bat("cao 0px (chia cho 0)", "landscape", 1536, 0)
    hople("canvas=square + ảnh 1254x1254", null, 1254, 1254, "square")
    hople("canvas=square + ảnh 1024x1024 (so TỈ LỆ)", null, 1024, 1024, "square")
    bat("canvas=square mà nhận ảnh NGANG", null, 1536, 1024, "square")
    bat("canvas=square mà nhận ảnh DỌC", null, 1024, 1536, "square")
    hople("canvas THẮNG orient khi khai cả hai", "portrait", 1254, 1254, "square")
    hople("canvas gõ sai ⇒ rơi về landscape, không ném", null, 1536, 1024, "squre")
    const msg = orientationError("landscape", 1024, 1536)
    for (const want of ["landscape", "1536x1024", "1024x1536"]) {
      ok(msg.includes(want), `câu lỗi thiếu '${want}': ${msg}`)
    }
  })

  describe("engine-js/cắt · alpha đục hẳn (port tests/test_slice_alpha_solid.py)")
  const hang = (...alphas) => {
    const im = new Rgba(alphas.length, 1)
    alphas.forEach((a, x) => im.data.set([200, 80, 40, a], x * 4))
    return im
  }
  const alphaCua = im => [...snapSolidAlpha(im).channelA().data]

  await it("gần đục 251..254 được kéo về 255", () => {
    eq(alphaCua(hang(251, 252, 253, 254, 255)).join(","), "255,255,255,255,255")
  })
  await it("kính và quầng sáng KHÔNG bị đụng tới", () => {
    const mo = [0, 1, 32, 64, 96, 128, 180, 239]
    eq(alphaCua(hang(...mo)).join(","), mo.join(","))
  })
  await it("ngưỡng 240 là biên chính xác", () => {
    eq(alphaCua(hang(239, 240)).join(","), "239,255")
    eq(SOLID_ALPHA, 240, "SOLID_ALPHA")
  })
  await it("chỉ động vào kênh α, màu RGB không đổi một byte", () => {
    const px = snapSolidAlpha(hang(252, 100, 0)).data
    eq([0, 1, 2].map(x => px.slice(x * 4, x * 4 + 3).join(",")).join(" | "),
      "200,80,40 | 200,80,40 | 200,80,40")
  })
  await it("phép nắn CHỈ TĂNG alpha, không bao giờ hạ", () => {
    const vao = []
    for (let v = 0; v < 256; v += 7) vao.push(v)
    vao.push(239, 240, 254, 255)
    const ra = alphaCua(hang(...vao))
    vao.forEach((truoc, i) => ok(ra[i] >= truoc, `alpha ${truoc} bị hạ xuống ${ra[i]}`))
  })

  describe("engine-js/cắt · đoán hộp thân (port tests/test_slice_core.py)")
  const CELL = 640
  const vienThuoc = () => {
    const im = cell(CELL, CELL)
    roundedRect(im, [85, 240, 554, 399], 80, [200, 60, 60, 255])
    for (const x0 of [25, 555]) fillRect(im, [x0, 275, x0 + 59, 364], [40, 140, 60, 255])
    fillRect(im, [240, 232, 379, 239], [240, 250, 255, 255])
    return im
  }

  await it("viên thuốc + holly hai đầu ⇒ vẫn ra đúng thân 470x160", () => {
    const im = vienThuoc()
    near(safeOf(im), [25, 232, 590, 168], 1)
    const got = guessCoreBox(im.channelA(), 470 / 160, safeOf(im))
    near(got, [85, 240, 470, 160])
    ok(paintCoverage(im.channelA(), got) > 0.9, "độ phủ thân đặc phải > 0,9")
  })

  await it("thân kính α=64 vẫn là THÂN (ngưỡng có sơn là 32, không phải 128)", () => {
    const im = cell(CELL, CELL)
    fillRect(im, [110, 250, 529, 389], [120, 200, 255, 64])
    outline(im, [110, 250, 529, 389], 4, [255, 255, 255, 255])
    for (const x0 of [60, 530]) fillRect(im, [x0, 275, x0 + 49, 364], [40, 140, 60, 255])
    const got = guessCoreBox(im.channelA(), 420 / 140, safeOf(im))
    near(got, [110, 250, 420, 140])
    ok(paintCoverage(im.channelA(), got) > 0.9, "ruột kính bị đọc thành rỗng")
  })

  await it("thân RỖNG RUỘT không bị coi là đoán hỏng", () => {
    const im = cell(CELL, CELL)
    ellipseOutline(im, [120, 120, 519, 519], 40, [90, 60, 200, 255])
    for (const [x0, y0] of [[95, 95], [455, 95], [95, 455], [455, 455]]) {
      fillRect(im, [x0, y0, x0 + 69, y0 + 69], [40, 140, 60, 255])
    }
    const got = guessCoreBox(im.channelA(), 1.0, safeOf(im))
    near(got, [120, 120, 400, 400])
    ok(paintCoverage(im.channelA(), got) < 0.5, "vòng rỗng mà đo ra đặc")
  })

  await it("bốn lối rơi về null của guessCoreBox", () => {
    const nut = cell(CELL, CELL)
    roundedRect(nut, [120, 250, 519, 389], 40, [200, 60, 60, 255])
    eq(guessCoreBox(nut.channelA(), 400 / 140, safeOf(nut)), null, "nút không trang trí ⇒ thân ≈ cụm")
    const im = vienThuoc()
    eq(guessCoreBox(im.channelA(), null, safeOf(im)), null, "không có tỉ lệ")
    eq(guessCoreBox(im.channelA(), 0, safeOf(im)), null, "tỉ lệ 0")
    const thanh = cell(CELL, CELL)
    fillRect(thanh, [20, 290, 619, 349], [60, 160, 90, 255])
    eq(guessCoreBox(thanh.channelA(), 1.0, safeOf(thanh)), null, "xin hình vuông trên cụm 10:1")
    eq(guessCoreBox(cell(CELL, CELL).channelA(), 2.0, [0, 0, CELL, CELL]), null, "ô trống")
    for (const bad of [null, [], [1, 2], [0, 0, 0, 10], [0, 0, 10, -1], ["a", 0, 1, 1]]) {
      eq(guessCoreBox(im.channelA(), 2.0, bad), null, `hộp cụm rác ${JSON.stringify(bad)}`)
    }
  })

  await it("paintCoverage đếm đúng và không nổ với hộp rác", () => {
    const im = cell(CELL, CELL)
    fillRect(im, [100, 100, 199, 199], [0, 0, 0, 255])
    eq(paintCoverage(im.channelA(), [100, 100, 100, 100]), 1.0, "ô đặc hoàn toàn")
    eq(paintCoverage(im.channelA(), [100, 100, 200, 100]), 0.5, "nửa đặc nửa trống")
    eq(paintCoverage(im.channelA(), [0, 0, 0, 10]), null, "hộp rộng 0")
    eq(paintCoverage(im.channelA(), null), null, "hộp null")
  })

  describe("engine-js/cắt · CLI + ổ khoá + ghi nguyên tử (port tests/test_slice_cli.py)")
  await it("parseCli tách đúng style và sheet, và NÉM với cờ lạ", () => {
    const show = ([s, sh]) => `${[...s].sort().join("|")} :: ${sh === null ? "null" : [...sh].sort().join("|")}`
    eq(show(parseCli([])), " :: null")
    eq(show(parseCli(["tet", "ipay"])), "ipay|tet :: null")
    eq(show(parseCli(["tet", "--sheet=main"])), "tet :: main")
    eq(show(parseCli(["--sheet=main", "--sheet=tall"])), " :: main|tall")
    eq(show(parseCli(["tet", "--sheets=main,tall"])), "tet :: main|tall")
    let threw = null
    try { parseCli(["--khong-ton-tai"]) } catch (e) { threw = e }
    ok(threw instanceof SystemExit, "cờ lạ phải thoát chứ không im lặng bỏ qua")
    ok(threw.message.includes("'--khong-ton-tai'"), `câu lỗi phải nhắc chính cờ ấy: ${threw?.message}`)
  })

  await it("ổ khoá ĐỘC QUYỀN: lượt thứ hai trong cùng thư mục phải chờ rồi bỏ cuộc", async () => {
    const box = await mkdtemp(join(tmpdir(), "kitgen-slice-lock-"))
    try {
      const kits = join(box, "kits")
      const fd = acquireManifestLock(kits, 900)
      ok(await exists(join(kits, ".manifest.node.lock")), "chưa tạo file khoá")
      let threw = null
      try { acquireManifestLock(kits, 0.2, 20) } catch (e) { threw = e }
      ok(threw instanceof SystemExit,
        "lượt thứ hai VẪN giành được khoá ⇒ hai lượt cắt sẽ ăn mất phần của nhau")
      fd.release()
      const again = acquireManifestLock(kits, 1)
      ok(again !== null, "khoá đã nhả mà vẫn không xin được")
      again.release()
    } finally { await rmTemp(box) }
  })

  await it("ghi manifest NGUYÊN TỬ, không để lại file cụt", async () => {
    const box = await mkdtemp(join(tmpdir(), "kitgen-slice-atomic-"))
    try {
      await mkdir(join(box, "kits"), { recursive: true })
      const p = join(box, "kits", "manifest.json")
      dumpManifest(p, new Map([["styles", new Map([["v1", new Map([["cut", 3]])]])]]))
      eq(pyLoads(await readFile(p, "utf8")).get("styles").get("v1").get("cut"), 3, "đọc lại được")
      ok(!(await exists(p + ".tmp")), "file tạm còn sót — ghi chưa qua rename")
      dumpManifest(p, new Map([["styles", new Map([["v2", new Map()]])]]))
      ok(pyLoads(await readFile(p, "utf8")).get("styles").has("v2"), "lượt ghi sau không thay được file")
    } finally { await rmTemp(box) }
  })

  describe("engine-js/cắt · dao cắt không gặm ruột (port tests/test_slice_alpha*.py)")
  await it("mọi mức alpha đi ra nguyên vẹn, RGB không đổi, hộp không ôm sương", async () => {
    const box = await mkdtemp(join(tmpdir(), "kitgen-slice-ruot-"))
    try {
      // Ô ① thân đặc bọc kín một ruột bán trong suốt + một pixel α=4 lẻ loi;
      // ô ② TOÀN sương α=1..3. Đúng hai hình của `test_slice_alpha` / `_haze`.
      const W = 240, H = 160, CW = 120, RGB = [200, 100, 50]
      const ALPHAS = [255, 250, 242, 239, 230, 200, 180, 128, 100, 93, 86, 64, 32, 8, 1]
      const im = new Rgba(W, H)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) im.data.set([...RGB, 1 + ((x + y) % 3)], (y * W + x) * 4)
      fillRect(im, [30, 40, 79, 109], [...RGB, 255])
      ALPHAS.forEach((a, i) => im.data.set([...RGB, a], ((48 + ((i / 5) | 0) * 8) * W + 38 + (i % 5) * 8) * 4))
      im.data.set([...RGB, 4], (20 * W + 10) * 4)
      await mkdir(join(box, "raw"), { recursive: true })
      saveImage(im, join(box, "raw", "kit-ui.png"))
      await writeFile(join(box, "styles.json"), pyDumps({
        styles: [{ id: "kit", vi: "kit" }],
        sheets: [{
          id: "ui", grid: { cols: 2, rows: 1 }, canvas: "landscape",
          components: [1, 2].map(i => ({ file: `0${i}-o`, vi: "o", spec: "o", skel: { shape: "rrect", w: 0.8, h: 0.6 } })),
        }],
      }))
      let out = ""
      const { code } = runSlice([], { root: box, write: s => { out += s }, err: s => { out += s } })
      eq(code, 0, `slice chết:\n${out}`)

      const raw = openImage(join(box, "raw", "kit-ui.png")).rgba
      const o1 = openImage(join(box, "kits", "kit", "01-o.png")).rgba
      eq(`${o1.width}x${o1.height}`, `${CW}x${H}`, "canvas phải bằng ĐÚNG một ô")
      let haAlpha = 0, doiMau = 0
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < CW; x++) {
          const s = (y * W + x) * 4, d = (y * CW + x) * 4
          if (o1.data[d + 3] < raw.data[s + 3]) haAlpha++
          const muon = raw.data[s + 3] >= 240 ? 255 : raw.data[s + 3]
          if (o1.data[d + 3] !== muon) haAlpha++
          for (let c = 0; c < 3; c++) if (o1.data[d + c] !== raw.data[s + c]) doiMau++
        }
      }
      eq(haAlpha, 0, "có pixel bị HẠ alpha ⇒ dao cắt đang gặm ruột")
      eq(doiMau, 0, "kênh màu bị sửa ⇒ có un-mix/premultiply lén")

      const m = pyLoads(await readFile(join(box, "kits", "manifest.json"), "utf8"))
      const assets = m.get("styles").get("kit").get("assets")
      const a1 = assets.find(a => a.get("file") === "01-o.png")
      ok(a1.get("content_at")[0] > 0 && a1.get("content_at")[1] > 0,
        `hộp nội dung bắt đầu ở mép ô ⇒ sương α≤3 lại được tính là nội dung: ${a1.get("content_at")}`)
      const [l, t] = a1.get("content_at"), [cw2, ch2] = a1.get("content")
      ok(l <= 10 && 10 < l + cw2 && t <= 20 && 20 < t + ch2,
        "pixel α=4 bị bỏ ra ngoài hộp ⇒ ngưỡng đã bị nâng quá tay")
      const a2 = assets.find(a => a.get("file") === "02-o.png")
      eq(a2.get("content").join(","), `${CW},${H}`, "ô toàn sương ⇒ hộp lùi về bbox sương = cả ô")
      ok(!m.get("styles").get("kit").get("empty_cells").includes("02-o"),
        "ô toàn sương bị gọi là TRỐNG — nó vẫn có alpha")
      ok(out.includes("chỉ là sương mờ"), `không có dòng cảnh báo nào cho ô toàn sương:\n${out}`)

      // Sàn lượng tử dời HỘP, KHÔNG sửa PIXEL: pixel sương lọt vào hộp vẫn nguyên.
      const tight = openImage(join(box, "kits", "kit", "tight", "01-o.png")).rgba
      let lech = 0
      for (let y = 0; y < tight.height; y++) {
        for (let x = 0; x < tight.width; x++) {
          const s = ((t + y) * W + l + x) * 4, d = (y * tight.width + x) * 4
          const muon = [raw.data[s], raw.data[s + 1], raw.data[s + 2], raw.data[s + 3] >= 240 ? 255 : raw.data[s + 3]]
          for (let c = 0; c < 4; c++) if (tight.data[d + c] !== muon[c]) lech++
        }
      }
      eq(lech, 0, "pixel bên trong crop bị đổi ⇒ CONTENT_ALPHA đã hoá thành phép làm sạch nền")
      eq(CONTENT_ALPHA, 4, "CONTENT_ALPHA")
    } finally { await rmTemp(box) }
  })

  describe("engine-js/cắt · full-bleed (port tests/test_slice_fullbleed.py)")
  await it("phần model CHỪA vẫn TRONG SUỐT, và mép khử răng cưa giữ alpha trung gian", () => {
    const W = 200, H = 120
    const im = new Rgba(W, H)
    const art = (x, y) => [30 + ((y / 2) | 0), 60 + ((x * 7) % 50), 20 + ((y / 4) | 0)]
    for (let y = 0; y < H; y++) {
      const edge = 8 + (y % 4)
      for (let x = 0; x < W; x++) {
        const [r, g, b] = art(x, y)
        im.data.set(x < edge ? [0, 0, 0, 0] : x === edge ? [r, g, b, 128] : [r, g, b, 255], (y * W + x) * 4)
      }
    }
    const [sheet] = readSheet({ rgba: im, bands: ["R", "G", "B", "A"] })
    const out = sheet.crop([0, 0, W, H])
    eq(`${out.width}x${out.height}`, `${W}x${H}`, "full-bleed nghĩa là ô CHÍNH LÀ asset")
    const [r, g, b] = art(150, 60)
    eq([...out.data.slice((60 * W + 150) * 4, (60 * W + 150) * 4 + 4)].join(","), `${r},${g},${b},255`, "ruột tranh bị đổi")
    for (let y = 0; y < H; y += 7) {
      eq(out.data[(y * W) * 4 + 3], 0, `mép trái y=${y} phải trong suốt, không hoá đen`)
    }
    let coDaiMo = false
    for (let y = 0; y < H; y += 3) { const a = out.data[(y * W + 8 + (y % 4)) * 4 + 3]; if (a > 0 && a < 255) coDaiMo = true }
    ok(coDaiMo, "không còn dải mờ — mép mềm đã bị nắn về 0/255")
  })

  await it("tấm phủ kín không chỗ nào trong suốt ⇒ mode rgb, KHÔNG tự chế alpha", () => {
    const W = 40, H = 30
    const im = new Rgba(W, H)
    for (let i = 0; i < W * H; i++) im.data.set([10, 20, 30, 255], i * 4)
    const [, mode] = readSheet({ rgba: im, bands: ["R", "G", "B", "A"] })
    eq(mode, "rgb", "tấm đục hoàn toàn vẫn bị gọi là alpha")
  })

  describe("engine-js/cắt · sổ đo")
  await it("measureCell tính lệch MỘT PHÍA: lõi tràn ra ngoài khung không phải lỗi", () => {
    const im = cell(100, 100)
    fillRect(im, [10, 30, 89, 69], [0, 0, 0, 255])          // lõi 80x40 tại (10,30)
    const led = measureCell(im, [20, 20, 60, 60], 15, { w: 2, h: 1 })
    eq(led.safe.join(","), "10,30,80,40", "safe")
    eq(led.sizeDeviation.get("undershootPx").get("left"), 0, "lõi tràn trái ⇒ không phải thiếu")
    eq(led.sizeDeviation.get("overflowPx").get("left"), 10, "phần tràn phải được ghi lại")
    eq(led.sizeDeviation.get("undershootPx").get("top"), 10, "lõi thụt trên ⇒ đúng là thiếu")
    eq(led.sizeDeviation.get("maxEdgePx"), 10, "maxEdgePx lấy theo phần THIẾU")
    eq(led.aspectDeviation.get("value").v, 0.0, "lõi 2:1 trên cỡ 2:1 ⇒ lệch 0")
  })

  await it("ô không có contractSafe thì không bịa số đo", () => {
    const im = cell(50, 50)
    fillRect(im, [10, 10, 39, 39], [0, 0, 0, 255])
    const led = measureCell(im, null, 15, null)
    eq(led.sizeDeviation.get("maxEdgePx"), null, "maxEdgePx")
    eq(led.sizeDeviation.get("flagged"), false, "ô không đo được KHÔNG phải ô hỏng")
    eq(led.aspectDeviation.get("value"), null, "aspectDeviation.value")
  })

  await it("manifest ghi ra số thực TRÒN đúng kiểu Python (1.0 chứ không 1)", () => {
    eq(pyDumps(new Map([["coreCoverage", F(1.0)], ["value", F(0.0)], ["cut", 3]])),
      '{"coreCoverage": 1.0, "value": 0.0, "cut": 3}')
  })
}
