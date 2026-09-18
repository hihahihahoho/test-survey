/* suite-engine-prompt.mjs — BẢN JS CỦA ENGINE PHẢI RA ĐÚNG THỨ BẢN BASH RA.
 *
 * ╔══ HAI VIỆC, VÀ CHÚNG LÀ HAI VIỆC KHÁC NHAU ═════════════════════════════════╗
 * ║ ① SO TỪNG BYTE với golden — mốc dựng từ CHÍNH `gen.sh` chạy ở chế độ         ║
 * ║   `KITGEN_PROMPTS_ONLY=1` (xem `agent/test/engine-golden/make-golden.sh`).   ║
 * ║   Không so "có chứa", không so "gần giống": prompt là thứ người dùng trả     ║
 * ║   tiền để gửi đi, và một dấu phẩy lệch là một ảnh khác.                      ║
 * ║ ② HÌNH HỌC — 27 ca port thẳng từ `tests/test_geometry.py`. Bản JS của        ║
 * ║   `geometry.py` không được có phép làm tròn riêng: `round()` của Python làm  ║
 * ║   tròn về số CHẴN ở ca đúng .5 còn `Math.round` làm tròn LÊN, và lưới chia   ║
 * ║   hết một nửa pixel (1254/4 = 313.5) là ca THẬT.                            ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * GOLDEN ĐỎ THÌ SỬA BẢN JS, ĐỪNG DỰNG LẠI GOLDEN. Dựng lại golden để "cho nó
 * xanh" là tự tay xoá cái duy nhất đang canh chừng hai engine nói giống nhau.
 */
import { readdir, readFile, mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

import { describe, it, eq, ok, includes, rmTemp } from "./harness.mjs"
import * as G from "../engine/geometry.mjs"
import { buildPrompt, core_aspect, cell_sentence, inner_box, gutter_px, listJobs, pyStrip } from "../engine/prompt.mjs"
import { renderPrompts, match } from "../engine/cli.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ENGINE_DIR = join(HERE, "..", "engine")
const FIX = join(HERE, "..", "test-fixtures", "engine-golden")
const DONG_CUOI =
  "KITGEN_PROMPTS_ONLY: đã dựng xong prompt trong prompts/ — KHÔNG gọi codex, KHÔNG đụng raw/.\n"

/** Chạy engine JS trên một bản CHÉP của thư mục input của ca, trả file + stdout. */
async function chayCa(name) {
  const work = await mkdtemp(join(tmpdir(), `kitgen-engine-${name}-`))
  await cp(join(FIX, name, "input"), work, { recursive: true })
  const out = []
  await renderPrompts(work, [], s => out.push(s))
  const names = (await readdir(join(work, "prompts"))).sort()
  const files = {}
  for (const f of names) files[f] = await readFile(join(work, "prompts", f), "utf8")
  await rmTemp(work)
  return { files, names, stdout: out.join("\n") + (out.length ? "\n" : "") + DONG_CUOI }
}

/** Golden của ca: mọi file trong `expected/prompts` + stdout đã đóng băng. */
async function docGolden(name) {
  const dir = join(FIX, name, "expected", "prompts")
  const names = (await readdir(dir)).sort()
  const files = {}
  for (const f of names) files[f] = await readFile(join(dir, f), "utf8")
  return { files, names, stdout: await readFile(join(FIX, name, "expected", "stdout.txt"), "utf8") }
}

/** Dòng đầu tiên lệch nhau — báo "khác byte" mà không in cả trang prompt ra log. */
function lechODau(a, b) {
  const al = a.split("\n"), bl = b.split("\n")
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) {
      return `dòng ${i + 1}\n    golden: ${JSON.stringify(al[i])}\n    js    : ${JSON.stringify(bl[i])}`
    }
  }
  return "(chỉ khác ở ký tự cuối file)"
}

/** Tấm mẫu của `tests/test_geometry.py`: 3×3 trên khổ VUÔNG 1254 ⇒ ô 418×418 chẵn. */
function sheet3x3Square(w = 0.5, h = 0.345) {
  return {
    styles: [{ id: "demo", style: "flat ink" }],
    sheets: [{
      id: "ui", canvas: "square", grid: { cols: 3, rows: 3 },
      components: Array.from({ length: 9 }, (_, i) => ({
        file: `${String(i + 1).padStart(2, "0")}-x`, spec: `element ${i + 1}`,
        // `out` = cỡ người dùng đặt: nguồn DUY NHẤT của câu hình học trong prompt.
        out: { w: 245, h: 85 },
        skel: { shape: "rrect", w, h },
      })),
    }],
  }
}
const promptCuaTam = cfg => buildPrompt(cfg.styles[0], cfg.sheets[0]).text

export async function run() {
  // ══════════════════════════════════════════ 1. SO TỪNG BYTE VỚI GOLDEN
  describe("engine JS › prompt giống bản bash TỪNG BYTE")

  const cases = (await readdir(FIX, { withFileTypes: true }))
    .filter(d => d.isDirectory()).map(d => d.name).sort()

  await it("có đủ bộ ca golden (≥ 12 ca, dựng từ chính gen.sh)", async () => {
    ok(cases.length >= 12, `chỉ có ${cases.length} ca golden — mốc quá mỏng để tin`)
    for (const name of cases) {
      const g = await docGolden(name)
      ok(g.names.some(f => f.endsWith(".txt")), `ca ${name} không có prompt nào`)
    }
  })

  for (const name of cases) {
    await it(`ca «${name}» — mọi file prompt trùng golden`, async () => {
      const got = await chayCa(name)
      const want = await docGolden(name)
      // Danh sách file trước: thừa một `.fullbleed` mồ côi là tắt phép kiểm alpha
      // của đúng tấm cần nó nhất, và thiếu một `.refs` là màn xem trước mất vai ảnh.
      eq(got.names, want.names, `${name}: danh sách file trong prompts/`)
      for (const f of want.names) {
        if (got.files[f] !== want.files[f]) {
          throw new Error(`${name}/${f} khác golden — ${lechODau(want.files[f], got.files[f])}`)
        }
      }
      eq(got.stdout, want.stdout, `${name}: stdout`)
    })
  }

  // ══════════════════════════════════════════ 2. CỬA VÀO THẬT (cli.mjs)
  describe("engine JS › cli.mjs")

  await it("`node cli.mjs prompts <dir>` ghi đúng file và in đúng dòng kết", async () => {
    const work = await mkdtemp(join(tmpdir(), "kitgen-engine-cli-"))
    await cp(join(FIX, "ui-1x1", "input"), work, { recursive: true })
    const r = await new Promise(done => {
      const c = spawn(process.execPath, [join(ENGINE_DIR, "cli.mjs"), "prompts", work],
        { stdio: ["ignore", "pipe", "pipe"] })
      let out = "", err = ""
      c.stdout.on("data", d => { out += d })
      c.stderr.on("data", d => { err += d })
      c.on("close", code => done({ code, out, err }))
    })
    eq(r.code, 0, "mã thoát")
    includes(r.out, "prompt → prompts/tet-don.txt (+0 ảnh kèm)", "dòng prompt")
    includes(r.out, DONG_CUOI.trim(), "dòng kết")
    const want = await docGolden("ui-1x1")
    eq(await readFile(join(work, "prompts", "tet-don.txt"), "utf8"),
       want.files["tet-don.txt"], "prompt ghi ra đĩa")
    // `mkdir -p raw logs prompts` của gen.sh: bước ③ và agent đều trông vào đó.
    for (const d of ["raw", "logs", "prompts"]) {
      ok((await readdir(work)).includes(d), `thiếu thư mục ${d}/`)
    }
    await rmTemp(work)
  })

  await it("lưới sai số ô ⇒ NÉM, mã thoát 1, và vẫn in dòng kết như bash", async () => {
    // `assert len(comps) == cols * rows` của gen.sh (~443). Ở chế độ xem trước, bash
    // in dòng kết RỒI mới `exit "$py_rc"` — một lượt hỏng phải nhận ra bằng MÃ THOÁT
    // chứ không bằng sự vắng mặt của một dòng chữ.
    const work = await mkdtemp(join(tmpdir(), "kitgen-engine-bad-"))
    await writeFile(join(work, "styles.json"), JSON.stringify({
      styles: [{ id: "v", style: "x" }],
      sheets: [{ id: "s", canvas: "square", grid: { cols: 2, rows: 2 },
                 components: [{ file: "a", spec: "a", skel: { shape: "rrect", w: .5, h: .5 } }] }],
    }), "utf8")
    const r = await new Promise(done => {
      const c = spawn(process.execPath, [join(ENGINE_DIR, "cli.mjs"), "prompts", work],
        { stdio: ["ignore", "pipe", "pipe"] })
      let out = "", err = ""
      c.stdout.on("data", d => { out += d })
      c.stderr.on("data", d => { err += d })
      c.on("close", code => done({ code, out, err }))
    })
    eq(r.code, 1, "mã thoát")
    includes(r.err, "1 component ≠ lưới 2x2", "lời báo lỗi")
    includes(r.out, DONG_CUOI.trim(), "dòng kết vẫn in")
    await rmTemp(work)
  })

  await it("filter là SUBSTRING, đúng phép so của `match()` trong gen.sh", async () => {
    // Bẫy đã có thật: truyền "tet-main" mà gen.sh chạy luôn "tet-main2" ⇒ đổ quota oan.
    // Agent vì thế KHÔNG dùng argv filter cho pha gen (nó thu hẹp bằng styles.json).
    ok(match("tet-main2", ["tet-main"]), "substring phải khớp — đây là hành vi của bản cũ")
    ok(match("a-b", []), "không filter = nhận tất")
    ok(!match("noel-ui", ["tet"]), "không khớp thì loại")
    const work = await mkdtemp(join(tmpdir(), "kitgen-engine-filter-"))
    await cp(join(FIX, "multi-style-sheetbreaks", "input"), work, { recursive: true })
    const out = []
    await renderPrompts(work, ["noel-"], s => out.push(s))
    const got = (await readdir(join(work, "prompts"))).filter(f => f.endsWith(".txt")).sort()
    eq(got, ["noel-chi-noel.txt", "noel-ui.txt", "noel-ui2.txt"], "chỉ job khớp filter")
    eq(out.length, 3, "số dòng stdout")
    await rmTemp(work)
  })

  await it("thứ tự job là HỢP ĐỒNG: style ngoài, sheet trong, `sheet.styles` khoanh vùng", async () => {
    const cfg = JSON.parse(
      await readFile(join(FIX, "multi-style-sheetbreaks", "input", "styles.json"), "utf8"))
    eq(listJobs(cfg).map(j => j.job),
      ["tet-ui", "tet-ui2", "tet-chi-tet", "noel-ui", "noel-ui2", "noel-chi-noel"], "thứ tự job")
  })

  await it("dấu `.fullbleed` chỉ đóng cho tấm ĐỤC, và bị XOÁ khi tấm hết full-bleed", async () => {
    // Dấu nói với tầng bash đúng một điều — "tấm này phải ĐỤC" — và nó lái cả câu
    // chữ gửi codex lẫn chiều của phép đo alpha. Một dấu mồ côi sống qua lượt sau sẽ
    // tắt phép kiểm alpha của đúng tấm cần nó nhất.
    const work = await mkdtemp(join(tmpdir(), "kitgen-engine-fb-"))
    await cp(join(FIX, "bg-multi-scenes", "input"), work, { recursive: true })
    await renderPrompts(work, [], () => {})
    ok((await readdir(join(work, "prompts"))).includes("tet-canh.fullbleed"), "tấm đục phải có dấu")
    // Lớp có `skel.alpha` thì KHÔNG được đóng dấu: nó sẽ bị đi xin background="opaque"
    // rồi bị bắt vẽ lại vì "còn pixel trong suốt".
    const cfg = JSON.parse(await readFile(join(work, "styles.json"), "utf8"))
    for (const c of cfg.sheets[0].components) c.skel.alpha = true
    await writeFile(join(work, "styles.json"), JSON.stringify(cfg), "utf8")
    await renderPrompts(work, [], () => {})
    ok(!(await readdir(join(work, "prompts"))).includes("tet-canh.fullbleed"),
      "dấu mồ côi phải bị xoá khi tấm không còn là nền đục")
    await rmTemp(work)
  })

  // ══════════════════════════════════════════ 3. HÌNH HỌC (27 ca, port từ test_geometry.py)
  describe("engine JS › hình học (port tests/test_geometry.py)")

  await it("đủ ba khổ và kèm cả chuỗi header", () => {
    eq(Object.keys(G.CANVAS).sort(), ["landscape", "portrait", "square"], "tập khổ")
    eq(G.CANVAS.square, [1254, 1254, "SQUARE 1254x1254", "square 1:1"], "dòng bảng khổ vuông")
  })

  await it("canvas thắng orient, và chữ lạ rơi về landscape", () => {
    eq(G.canvas_of({ canvas: "square" }).slice(0, 2), [1254, 1254], "canvas")
    eq(G.canvas_of({ canvas: "square", orient: "portrait" }).slice(0, 2), [1254, 1254], "canvas thắng orient")
    eq(G.canvas_of({ orient: "portrait" }).slice(0, 2), [1024, 1536], "orient đời cũ")
    eq(G.canvas_of({}).slice(0, 2), [1536, 1024], "mặc định")
    eq(G.canvas_of({ canvas: "squre" }).slice(0, 2), [1536, 1024], "gõ sai không giết lượt gen")
  })

  await it("ô vuông 1254 chia 3 ra 418 chẵn", () => {
    eq(G.cell_size(1254, 1254, 3, 3), [418, 418], "cell_size")
    eq(G.cell_box(1254, 1254, 3, 3, 0), [0, 0, 418, 418], "ô 1")
    eq(G.cell_box(1254, 1254, 3, 3, 4), [418, 418, 836, 836], "ô 5")
    eq(G.cell_box(1254, 1254, 3, 3, 8), [836, 836, 1254, 1254], "ô 9")
  })

  await it("ô không chia hết vẫn bám mép, không trôi", () => {
    // 1536/5 = 307,2. Cộng dồn `col * CW` sẽ làm ô cuối kết thúc ở 1535.
    eq(G.cell_size(1536, 1024, 5, 1)[0], 307, "CW")
    eq(G.cell_box(1536, 1024, 5, 1, 4)[0], 1229, "x0 ô cuối")
    eq(G.cell_box(1536, 1024, 5, 1, 4)[2], 1536, "x1 ô cuối bám mép")
  })

  await it("safe_box căn giữa ô", () => {
    eq(G.safe_box(1254, 1254, 3, 3, 0, { shape: "rrect", w: 0.5, h: 0.345 }),
      [104, 137, 313, 281], "ô 1")
    eq(G.safe_box(1254, 1254, 3, 3, 4, { shape: "rrect", w: 0.5, h: 0.345 }),
      [104 + 418, 137 + 418, 313 + 418, 281 + 418], "ô 5 = ô 1 dịch đúng một ô")
  })

  await it("anchor:bottom đẩy xuống đáy, chừa 4 phần trăm", () => {
    const box = G.safe_box(1254, 1254, 3, 3, 0, { shape: "figure", w: 0.5, h: 0.5, anchor: "bottom" })
    eq(box[1], 192, "dy = 418 - 209 - 17")
    eq(box[3], 192 + 209, "y1")
  })

  await it("GUARD ÂM: `contentSafe` đã chết, KHÔNG còn đè lên skel", () => {
    const skel = { shape: "rrect", w: 0.5, h: 0.5, contentSafe: { w: 0.9, h: 0.9 } }
    eq(G.safe_box(1254, 1254, 3, 3, 0, skel),
      G.safe_box(1254, 1254, 3, 3, 0, { shape: "rrect", w: 0.5, h: 0.5 }), "bị bỏ qua")
    ok(!("safe_spec_of" in G), "không được mọc lại hàm đọc contentSafe")
  })

  await it("ô full và ô trống KHÔNG có safe zone; `free` rơi về safe", () => {
    const cfg = sheet3x3Square()
    cfg.sheets[0].components[0].skel = { shape: "full", w: 1, h: 1 }
    cfg.sheets[0].components[1].skel = { shape: "empty" }
    cfg.sheets[0].components[2].skel = { shape: "rrect", w: 0.5, h: 0.5, free: true }
    const geo = G.sheet_geometry(cfg.sheets[0])
    eq(geo[0].kind, "full", "kind ô full")
    eq(geo[0].safe, null, "full không có safe")
    eq(geo[1].kind, "empty", "kind ô trống")
    eq(geo[1].safe, null, "trống không có safe")
    // `slice.py` chưa bao giờ có nhánh "bám lõi đo được" — `free` chỉ còn là nhãn.
    eq(geo[2].kind, "safe", "free rơi về safe")
    eq(geo[2].safe, G.safe_box(1254, 1254, 3, 3, 2, { shape: "rrect", w: 0.5, h: 0.5 }), "hộp safe")
  })

  await it("row/col đếm từ 1 cho NGƯỜI, index đếm từ 0 cho MÁY", () => {
    const geo = G.sheet_geometry(sheet3x3Square().sheets[0])
    eq([geo[0].row, geo[0].col], [1, 1], "ô 1")
    eq([geo[4].row, geo[4].col], [2, 2], "ô 5")
    eq([geo[8].row, geo[8].col], [3, 3], "ô 9")
    eq(geo.map(g => g.index), [0, 1, 2, 3, 4, 5, 6, 7, 8], "index")
  })

  await it("hộp SAFE ZONE không quay lại prompt, nhưng hộp THỤT VÀO thì có", () => {
    const txt = promptCuaTam(sheet3x3Square())
    for (const chet of ["safe zone x=", "stays inside x=", "drawn at", "final size",
                        "crop box", "its cell is"]) {
      ok(!txt.includes(chet), `hộp safe zone quay lại prompt: ${chet}`)
    }
    for (const dong of txt.split("\n")) {
      if (/x=\d+\.\.\d+/.test(dong)) {
        ok(dong.includes("its box is x="), `một cặp toạ độ KHÔNG PHẢI hộp thụt vào lọt vào prompt: ${dong}`)
      }
    }
    eq(txt.split(" — its box is x=").length - 1, 9, "chín ô ⇒ chín hộp")
    // Số tính lại bằng chính module, không gõ tay.
    const [iw, ih] = G.cell_inner(...G.cell_size(1254, 1254, 3, 3))
    const dx = Math.floor((418 - iw) / 2), dy = Math.floor((418 - ih) / 2)
    includes(txt, `its box is x=${dx}..${dx + iw}, y=${dy}..${dy + ih} (${iw}x${ih} px);`
      + " everything of this element, rim and ornaments included, stays inside that box", "hộp thụt vào")
  })

  await it("mỗi ô mang tỉ lệ của `out`, không phải tỉ lệ của ô", () => {
    const txt = promptCuaTam(sheet3x3Square())
    const re = /^(\d+)\) .*? — core aspect ([\d.]+):([\d.]+) \(([^)]*)\)/gm
    const found = [...txt.matchAll(re)]
    eq(found.length, 9, "thiếu ô nào là ô đó không có hợp đồng hình học")
    // 245x85 = 2,88 ⇒ 2.9:1. Tỉ lệ của Ô (hộp max-fit) là 1,45 — ra 1.4 là đọc nhầm nguồn.
    for (const m of found) eq([m[2], m[3]], ["2.9", "1"], `ô ${m[1]}: tỉ lệ không phải tỉ lệ của out`)
  })

  await it("tỉ lệ được TẢ BẰNG CHỮ chứ không chỉ bằng ký hiệu", () => {
    const m = /^(\d+)\) .*? — core aspect ([\d.]+):([\d.]+) \(([^)]*)\)/m.exec(promptCuaTam(sheet3x3Square()))
    eq(m[4], "about three times wider than tall", "lời tả")
  })

  await it("ô CAO HƠN RỘNG đổi vế số cho model dễ đọc", () => {
    const cfg = sheet3x3Square()
    for (const c of cfg.sheets[0].components) c.out = { w: 100, h: 160 }
    const m = /^(\d+)\) .*? — core aspect ([\d.]+):([\d.]+) \(([^)]*)\)/m.exec(promptCuaTam(cfg))
    eq([m[2], m[3], m[4]], ["1", "1.6", "taller than wide, about 2:3"], "vế số + lời tả")
  })

  await it("geometry VẪN LÀ nguồn của dao cắt dù prompt thôi đọc nó", () => {
    const skel = sheet3x3Square().sheets[0].components[0].skel
    eq(G.safe_box(1254, 1254, 3, 3, 0, skel), [104, 137, 313, 281], "hộp cắt")
  })

  await it("prompt không còn một chữ nào về khung xương", () => {
    const txt = promptCuaTam(sheet3x3Square())
    for (const chet of ["skeleton", "silhouette", "attached image is the geometry",
                        "guide box", "gray", "INNER CROP BOX"]) {
      ok(!txt.includes(chet), `prompt còn dấu vết khung xương: ${chet}`)
    }
  })

  await it("bộ lắp prompt GỌI module hình học, không chép công thức ra", async () => {
    // Ca chống TÁI PHÁT: cả sự cố lệch-1px sinh ra từ đúng một thói quen — viết lại
    // `round(col * cell_w)` ngay tại chỗ cho tiện.
    const src = await readFile(join(ENGINE_DIR, "prompt.mjs"), "utf8")
    for (const goi of ['import * as geometry from "./geometry.mjs"',
                       "geometry.cell_inner(", "geometry.cell_size(", "geometry.sheet_geometry("]) {
      includes(src, goi, `prompt.mjs phải gọi ${goi}`)
    }
  })

  await it("KHÔNG có bản lề thứ hai và bảng khổ thứ hai trong bộ lắp prompt", async () => {
    // Bỏ chú thích trước khi soi: chú thích ĐƯỢC QUYỀN trích lại con số để giải thích.
    const code = (await readFile(join(ENGINE_DIR, "prompt.mjs"), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l)).join("\n")
    for (const chep of ["0.10", "0.20", "1536", "1024", "1254", "0.04"]) {
      ok(!code.includes(chep), `prompt.mjs gõ tay con số ${chep} — bản thật ở geometry.mjs`)
    }
  })

  await it("phần trăm lề điều khiển qua HÀM chứ không qua hằng rời", async () => {
    const src = await readFile(join(ENGINE_DIR, "geometry.mjs"), "utf8")
    includes(src, "export function cell_margin_ratio(skel)", "hàm chọn lề")
    for (const fn of ["cell_inner", "max_fit_box", "draw_scale", "draw_box"]) {
      includes(src, `export function ${fn}(cell_w, cell_h`, `chữ ký ${fn}`)
    }
    // Bốn hàm ấy phải cùng nhận `margin` mặc định — không ai được tự chọn số.
    eq(src.split("margin = CELL_MARGIN_RATIO").length - 1, 4, "số hàm nhận margin mặc định")
  })

  await it("khung trong và hộp lớn nhất", () => {
    eq(G.cell_inner(313, 313), [250, 250], "ô 313 ⇒ khung trong 250")
    eq(G.max_fit_box(313, 313, 1.0), [250, 250], "vuông")
    eq(G.max_fit_box(313, 313, 3.909), [250, 64], "thanh 3,9:1")
    const [w, h] = G.max_fit_box(384, 256, 3.0)
    ok(w <= G.cell_inner(384, 256)[0] && h <= G.cell_inner(384, 256)[1], "ô không vuông vẫn gọn cả hai cạnh")
  })

  await it("hệ số làm tròn XUỐNG theo bước 0,25", () => {
    // 502/120 = 4,18 ⇒ 4,0. Làm tròn LÊN (4,25) là cho hộp vượt lề.
    eq(G.draw_scale(627, 627, 120, 52), 4.0, "hệ số")
    eq(G.draw_box(627, 627, 120, 52), [480, 208, 4.0], "hộp vẽ")
    for (const [ow, oh] of [[120, 52], [195, 195], [40, 40], [250, 90]]) {
      const k = G.draw_scale(313, 313, ow, oh)
      ok(k >= 1, `${ow}x${oh}: k < 1`)
      ok(Math.abs(k * 4 - Math.round(k * 4)) < 1e-6, `${ow}x${oh}: ${k} không phải bội của 0,25`)
    }
    const k = G.draw_scale(313, 313, 304, 78)
    ok(Math.abs(k * 20 - Math.round(k * 20)) < 1e-6, "dưới 1 thì bước 0,05")
  })

  await it("không bao giờ tràn lề và không méo tỉ lệ", () => {
    const [aw, ah] = G.cell_inner(313, 313)
    for (const [ow, oh] of [[120, 52], [195, 195], [304, 78], [8, 4096], [1254, 1254]]) {
      const [w, h] = G.draw_box(313, 313, ow, oh)
      ok(w <= aw, `${ow}x${oh} tràn lề ngang`)
      ok(h <= ah, `${ow}x${oh} tràn lề dọc`)
      ok(Math.abs(w / h - ow / oh) <= Math.max(0.06, (ow / oh) * 0.03), `${ow}x${oh} méo tỉ lệ`)
    }
  })

  await it("cỡ đầu ra LỚN HƠN ô thì hệ số tụt dưới 1, tỉ lệ vẫn giữ", () => {
    const [w, h, k] = G.draw_box(313, 313, 304, 78)
    ok(k < 1, "k phải tụt dưới 1")
    ok(Math.abs(w / h - 304 / 78) <= 0.2, "tỉ lệ không được bóp")
  })

  await it("ô KHÔNG trang trí không đổi một pixel nào", () => {
    eq(G.cell_margin_ratio({}), G.CELL_MARGIN_RATIO, "skel rỗng")
    eq(G.cell_margin_ratio({ decor: false }), G.CELL_MARGIN_RATIO, "decor false")
    eq(G.cell_margin_ratio(null), G.CELL_MARGIN_RATIO, "skel thiếu hẳn")
    eq(G.cell_margin_ratio({ shape: "pill", w: 0.8 }), G.CELL_MARGIN_RATIO, "contract đời cũ")
  })

  await it("ô CÓ trang trí chừa lề gấp đôi", () => {
    eq(G.cell_margin_ratio({ decor: true }), G.CELL_MARGIN_RATIO_DECOR, "decor true")
    eq(G.CELL_MARGIN_RATIO_DECOR, 0.20, "giá trị")
  })

  await it("safe zone tụt từ 78% xuống 60% ô", () => {
    const cell = 627
    const thuong = G.cell_inner(cell, cell, G.cell_margin_ratio({}))
    const trangTri = G.cell_inner(cell, cell, G.cell_margin_ratio({ decor: true }))
    ok(Math.abs(thuong[0] / cell - 0.80) < 0.005, "lề thường ⇒ 80%")
    ok(Math.abs(trangTri[0] / cell - 0.60) < 0.005, "lề trang trí ⇒ 60%")
    eq(Math.floor((cell - thuong[0]) / 2), 62, "chỗ chừa mỗi bên, lề thường")
    eq(Math.floor((cell - trangTri[0]) / 2), 125, "chỗ chừa mỗi bên, lề trang trí")
  })

  await it("hộp vẽ của ô trang trí nhỏ hơn và vẫn đúng tỉ lệ", () => {
    for (const [ow, oh] of [[245, 85], [195, 195], [270, 207]]) {
      const [w0] = G.draw_box(627, 627, ow, oh, G.cell_margin_ratio({}))
      const [w1, h1] = G.draw_box(627, 627, ow, oh, G.cell_margin_ratio({ decor: true }))
      ok(w1 < w0, `${ow}x${oh}: hộp vẽ không nhỏ lại`)
      ok(Math.abs(w1 / h1 - ow / oh) <= Math.max(0.06, (ow / oh) * 0.03), `${ow}x${oh}: méo tỉ lệ`)
    }
  })

  await it("LỀ DECOR KHÔNG lọt vào prompt — hộp in ra dùng MỘT lề duy nhất", () => {
    // `inner_box` của gen.sh gọi thẳng `CELL_MARGIN_RATIO`, không qua
    // `cell_margin_ratio`: hộp hứa với model là một, dù ô có trang trí hay không.
    const a = sheet3x3Square(), b = sheet3x3Square()
    for (const c of b.sheets[0].components) c.skel.decor = true
    eq(promptCuaTam(a), promptCuaTam(b), "prompt phải giống hệt nhau")
    eq(inner_box([0, 0, 418, 418], { decor: true }), inner_box([0, 0, 418, 418], {}), "inner_box")
  })

  // ══════════════════════════════════════════ 4. PHÉP DỊCH PYTHON→JS
  describe("engine JS › phép của Python mà JS không có sẵn")

  await it("`round()` của Python làm tròn về số CHẴN, không làm tròn LÊN", () => {
    // Đây là bẫy đắt nhất của cả bản port: 1254/4 = 313.5 là ca THẬT.
    eq([G.pyRound(0.5), G.pyRound(1.5), G.pyRound(2.5), G.pyRound(3.5)], [0, 2, 2, 4], "ca .5")
    eq(G.cell_size(1254, 1254, 4, 4), [314, 314], "1254/4 = 313,5 ⇒ 314 (chẵn gần nhất)")
    eq(G.pyRound(2.4), 2, "dưới nửa")
    eq(G.pyRound(2.6), 3, "trên nửa")
  })

  await it("`f\"{x:g}\"` cắt số 0 vô nghĩa: 4.0 → «4», 3.9 → «3.9»", () => {
    eq(core_aspect({ w: 400, h: 100 }), "core aspect 4:1 (about four times wider than tall)", "4.0")
    eq(core_aspect({ w: 245, h: 85 }), "core aspect 2.9:1 (about three times wider than tall)", "2.9")
    eq(core_aspect({ w: 100, h: 100 }), "core aspect 1:1 (square)", "vuông")
    eq(core_aspect({ w: 1600, h: 200 }), "core aspect 8:1 (a long thin bar, 8 times wider than tall)", "quá 5,5")
    eq(core_aspect({ w: 0, h: 10 }), null, "cỡ 0 ⇒ không có câu tỉ lệ")
    eq(core_aspect(null), null, "thiếu out")
    eq(core_aspect({ w: "x", h: 1 }), null, "giá trị rác ⇒ không ném, chỉ bỏ câu")
  })

  await it("`cell_sentence` — hint là cụm danh từ, không phải một câu", () => {
    eq(cell_sentence("square 1:1 cell"), "Each cell is square.", "vuông")
    eq(cell_sentence("landscape 3:2 cell"), "Each cell is landscape, 3:2.", "ngang")
    eq(cell_sentence("cell containing ONE full-body character"),
      "Each cell contains ONE full-body character.", "cụm 'cell containing'")
    eq(cell_sentence("cell"), "", "danh từ trần ⇒ không có câu")
    eq(cell_sentence(""), "", "rỗng")
    eq(cell_sentence("wide banner cell"), "Each cell is wide banner.", "cắt đuôi ' cell'")
  })

  await it("rãnh trống lấy từ lề THƯỜNG và là cạnh HẸP HƠN", () => {
    eq(gutter_px(627, 627), 62, "ô vuông 627")
    const [cw, ch] = G.cell_size(1536, 1024, 2, 2)
    eq(gutter_px(cw, ch), Math.min(Math.floor((cw - G.cell_inner(cw, ch)[0]) / 2),
      Math.floor((ch - G.cell_inner(cw, ch)[1]) / 2)), "ô không vuông lấy cạnh hẹp hơn")
  })

  await it("`strip()` cắt ĐÚNG tập ký tự trắng của Python, không của JS", () => {
    // Đo bằng lệnh thật: Python còn cắt \x1c-\x1f và \x85 mà JS giữ; JS cắt \ufeff
    // (BOM) mà Python giữ. Một `note` dán từ Word mang BOM là đủ để hai engine in ra
    // hai prompt khác nhau, LẶNG LẼ — mà hợp đồng ở đây là từng byte.
    eq(pyStrip("\u001c a \u0085"), "a", "ký tự Python cắt mà JS không")
    eq(pyStrip("\ufeff a \ufeff"), "\ufeff a \ufeff", "BOM: Python GIỮ, nên ta cũng giữ")
    eq(pyStrip("  b\t\n"), "b", "ký tự trắng thường")
  })

  // ══════════════════════════════════════════ 3b. ẢNH KHUNG CỦA MỘT Ô
  describe("engine JS › ảnh khung của một ô (shapeRef)")

  /* Tấm 1×1 gọn nhất có thể: ca này nói về MỘT trường mới, nên mọi thứ khác phải
     đứng yên để chỗ lệch duy nhất là chỗ đang đo. */
  const tamMotO = (extra = {}) => ({
    styles: [{ id: "demo", style: "flat ink" }],
    sheets: [{
      id: "ui", canvas: "square", grid: { cols: 1, rows: 1 },
      components: [{
        file: "01-khung", vi: "Khung nhiệm vụ", spec: "a quest frame",
        out: { w: 240, h: 160 }, skel: { shape: "rrect", w: .6, h: .4 }, ...extra,
      }],
    }],
  })

  await it("KHÔNG có `shapeRef` ⇒ prompt y HỆT bản trước — không một byte thừa", () => {
    // Đây là vế quan trọng hơn của cả nhóm: bộ golden 12 ca chứng minh điều này cho
    // dữ liệu thật, ca này chứng minh cho đúng cặp trường vừa thêm.
    const p0 = buildPrompt(tamMotO().styles[0], tamMotO().sheets[0])
    const p1 = buildPrompt(tamMotO({ shapeNote: "có mô tả mà không có ảnh" }).styles[0],
                           tamMotO({ shapeNote: "có mô tả mà không có ảnh" }).sheets[0])
    eq(p1.text, p0.text, "mô tả trơ trọi KHÔNG được tự sinh ra câu nào")
    eq(p0.att, [], "không ảnh kèm")
    ok(!p0.text.includes("ELEMENT SHAPE REFERENCE"), "không có ảnh thì không nhắc tới ảnh khung")
    ok(!p0.text.includes("shape as in the attached reference"), "dòng của ô cũng không mọc thêm cụm nào")
  })

  await it("có `shapeRef` ⇒ ảnh vào `.att` ĐÚNG MỘT LẦN và prompt nói ra vai của nó", () => {
    const cfg = tamMotO({ shapeRef: "refs/shape-1.png", shapeNote: "khung nhiệm vụ ba cạnh" })
    const p = buildPrompt(cfg.styles[0], cfg.sheets[0])
    eq(p.att, ["refs/shape-1.png"], "`.att` có đúng một đường dẫn")
    eq(p.attRoles, [["shape", "refs/shape-1.png"]], "vai của nó là `shape`, cho màn xem trước")
    includes(p.text, "## Element shape references", "có section riêng")
    includes(p.text,
      "ELEMENT SHAPE REFERENCE for cell 1 (Khung nhiệm vụ): khung nhiệm vụ ba cạnh."
      + " Copy its silhouette, proportions and part layout; take NOTHING else from it"
      + " — not its style, colours, text or level of finish.", "câu đầy đủ")
    includes(p.text, "1) a quest frame (shape as in the attached reference) — core aspect",
      "dòng của ô tự nói nó có ảnh khung")
  })

  await it("hai ô dùng CHUNG một tấm ⇒ một `-i`, nhưng HAI câu (mỗi ô một mô tả)", () => {
    // codex tính token theo từng `-i`: đính hai lần cùng một tấm là trả tiền hai lần
    // cho một tấm ảnh. Câu thì vẫn phải hai, vì hai ô là hai món khác nhau.
    const cfg = {
      styles: [{ id: "demo", style: "flat ink" }],
      sheets: [{
        id: "ui", canvas: "square", grid: { cols: 2, rows: 1 },
        components: [
          { file: "01-a", vi: "Khung A", spec: "frame A", skel: { shape: "rrect", w: .6, h: .4 },
            shapeRef: "refs/shape-1.png", shapeNote: "khung dọc" },
          { file: "02-b", vi: "Khung B", spec: "frame B", skel: { shape: "rrect", w: .6, h: .4 },
            shapeRef: "refs/shape-1.png", shapeNote: "khung ngang" },
        ],
      }],
    }
    const p = buildPrompt(cfg.styles[0], cfg.sheets[0])
    eq(p.att, ["refs/shape-1.png"], "khử trùng lặp")
    eq(p.text.split("ELEMENT SHAPE REFERENCE").length - 1, 2, "hai câu")
    includes(p.text, "for cell 1 (Khung A): khung dọc.", "ô 1")
    includes(p.text, "for cell 2 (Khung B): khung ngang.", "ô 2")
  })

  await it("mô tả đã có dấu chấm ⇒ KHÔNG mọc thêm cái thứ hai", () => {
    const cfg = tamMotO({ shapeRef: "refs/shape-1.png", shapeNote: "một cái khiên." })
    includes(buildPrompt(cfg.styles[0], cfg.sheets[0]).text,
      "(Khung nhiệm vụ): một cái khiên. Copy its silhouette", "một dấu chấm")
  })

  await it("hình học KHÔNG đọc `shapeRef` — dao cắt cắt y như cũ", () => {
    // Trường mới nằm trên component, cạnh `skel`. Nếu nó lọt vào phép tính hộp thì ô
    // có ảnh khung sẽ bị cắt lệch so với ô không có, và không ai đọc ra vì sao.
    const a = G.sheet_geometry(tamMotO().sheets[0])
    const b = G.sheet_geometry(tamMotO({ shapeRef: "refs/shape-1.png", shapeNote: "x" }).sheets[0])
    eq(b, a, "geometry giống hệt")
  })

  await it("`bool()` của Python: mảng rỗng và object rỗng là SAI", async () => {
    // `bool(b.get("refs"))` với `refs: []` phải ra false, không thì mọi contract có
    // mảng rỗng đều mọc thêm section «Palette» và một danh sách ảnh kèm rỗng.
    const cfg = {
      styles: [{ id: "v", style: "flat", brand: { refs: [] }, inspo: [] }],
      sheets: [{ id: "s", canvas: "square", grid: { cols: 1, rows: 1 }, cell_hint: "cell",
                 components: [{ file: "a", spec: "a plate", out: {},
                                skel: { shape: "rrect", w: .5, h: .5 } }] }],
    }
    const p = buildPrompt(cfg.styles[0], cfg.sheets[0])
    ok(!p.text.includes("## Palette"), "mảng refs rỗng không được đẻ ra section Palette")
    ok(!p.text.includes("reference image"), "không có ảnh nào thì không nhắc tới ảnh")
    eq(p.att, [], "không có ảnh kèm")
    eq(p.attText, "\n", "`.att` rỗng vẫn là một dòng trắng, đúng như bản cũ")
  })
}
