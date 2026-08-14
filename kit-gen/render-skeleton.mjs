#!/usr/bin/env node
/* ============================================================================
   render-skeleton.mjs — styles.json → skeleton/<sheet>.png (1536×1024, hoặc
   1024×1536 cho sheet portrait). Ảnh này được gen.sh đính kèm cho codex làm
   reference bố cục, nên nó PHẢI deterministic: cùng contract ⇒ cùng ảnh.

   KIẾN TRÚC (đổi 14/08 — BACKLOG #15):
     hình học nằm ở skeleton-svg.js  →  chuỗi SVG  →  @resvg/resvg-wasm  →  PNG

   Trước đây file này mở skeleton.html bằng Playwright/Chromium rồi chụp màn hình.
   Bộ cài vì thế nặng 790,9 MB (`playwright-browsers` 772,7 MB) và mang theo binary
   `.node` mà phần mềm diệt virus hay chặn nhầm. Nay chỉ còn Node stdlib + một gói
   wasm 2,4 MB, không trình duyệt, không file nhị phân riêng cho từng nền tảng.

   Số đo đối chứng (32 sheet / 229 ô / 50,3 triệu pixel, spike 14/08):
     · tỉ lệ "khối lượng mực" so với ảnh Playwright = 1,000091 (+0,009%)
     · dịch nguyên pixel tốt nhất = (0,0) trên 32/32 sheet
     · khác bit 1,30% — toàn bộ là khử răng cưa ở biên (Skia vs tiny-skia);
       nới ≤1px + ngưỡng 16/255 thì còn 0,238%
   Ngưỡng hồi quy được khoá trong tests/test_skeleton_svg.py.

   KHÔNG CÒN ĐƯỜNG LÙI, VÀ ĐÓ LÀ CHỦ Ý. Bản PIL (skeleton.py) đã bị xoá: đo trên
   cùng contract nó lệch 17,6% khối lượng mực và vẽ SAI HẲN dáng pose (map
   "pose"→figure). Một khung xương sai âm thầm còn tệ hơn một lượt gen fail: ảnh
   gen ra sẽ lệch bố cục mà không ai biết vì sao. Render hỏng ⇒ thoát khác 0 ⇒
   gen.sh dừng.

   Dùng:  node render-skeleton.mjs [styles.json] [outDir]
          (mặc định: <thư mục script>/styles.json → <thư mục script>/skeleton)
   ========================================================================== */
import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/* silhouettes.js và skeleton-svg.js là script cổ điển gán vào globalThis (để
   skeleton.html nạp được bằng <script src>). Nạp đúng bản NẰM CẠNH file này —
   agent copy cả engine vào thư mục project rồi chạy bản copy đó. */
require(resolve(HERE, "silhouettes.js"))
require(resolve(HERE, "skeleton-svg.js"))
const { sheetToSvg } = globalThis.KITSKEL

/* ── Tìm @resvg/resvg-wasm ────────────────────────────────────────────────────
   Gói được cài trong prefix riêng của KitGen (`<KITGEN_HOME>/tools`) chứ không
   phải toàn cục, và file này chạy từ thư mục project chứ không phải từ repo, nên
   phải dò vài chỗ. Thứ tự: biến môi trường (test/CI) → prefix của installer →
   mặc định theo nền tảng → node_modules quanh chính file này (dev trong repo,
   kèm cả NODE_PATH mà bin/kitgen đã đặt sẵn). */
function resvgAnchors() {
  const home = process.env.KITGEN_HOME
    || (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA || process.env.USERPROFILE || "", "KitGen")
      : join(homedir(), ".kitgen"))
  return [
    process.env.KITGEN_RESVG_DIR,      // thư mục CHỨA node_modules, không phải gói
    join(home, "tools"),
    join(homedir(), ".kitgen", "tools"),
    HERE,
  ].filter(Boolean).map(d => join(d, "package.json"))
}

function loadResvg() {
  const tried = []
  for (const anchor of resvgAnchors()) {
    try {
      const req = createRequire(anchor)
      const mod = req("@resvg/resvg-wasm")
      const wasm = readFileSync(req.resolve("@resvg/resvg-wasm/index_bg.wasm"))
      return { mod, wasm, from: dirname(anchor) }
    } catch (e) { tried.push(`${dirname(anchor)} (${e.code || e.message})`) }
  }
  throw new Error(
    "Không tìm thấy @resvg/resvg-wasm — không render được khung xương.\n" +
    "Cài lại bằng:  npm install --prefix \"$HOME/.kitgen/tools\" @resvg/resvg-wasm\n" +
    "Đã thử: " + tried.join(" · "))
}

const cfgPath = process.argv[2] ? resolve(process.argv[2]) : resolve(HERE, "styles.json")
const outDir = process.argv[3] ? resolve(process.argv[3]) : resolve(HERE, "skeleton")
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"))

const { mod, wasm } = loadResvg()
await mod.initWasm(wasm)
mkdirSync(outDir, { recursive: true })

for (const sh of cfg.sheets) {
  const svg = sheetToSvg(sh)
  // fitTo "original" = giữ đúng width/height khai báo trong SVG, không co giãn
  const png = new mod.Resvg(svg, { fitTo: { mode: "original" } }).render().asPng()
  const out = join(outDir, `${sh.id}.png`)
  writeFileSync(out, png)
  console.log("skeleton →", out)
}
