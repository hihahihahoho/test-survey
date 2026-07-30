#!/usr/bin/env node
/* ============================================================================
   copy-figma.mjs — chụp MÀN GAME ĐANG CHẠY (canvas Phaser) và đưa lên
   clipboard để dán vào Figma. KHÔNG cần plugin, KHÔNG cần extension.

   node kit-gen/figma-export/copy-figma.mjs [style] [--svg|--kiwi] [--screen Home]

   --svg  (mặc định) — chạy được NGAY HÔM NAY:
       display list Phaser → __figmaSVG() → SVG (mỗi frame nướng thành data-URL
       crop riêng, tint nướng luôn vào ảnh; chữ là <text>) → pbcopy.
       (Không dùng <symbol>/<use> crop atlas chung: Chrome không clip nội dung
       symbol lồng use → sprite kéo theo hàng xóm trong atlas — đã dính.)
       Sang Figma Cmd+V: mỗi sprite một layer, text thành text layer sửa được.
       Giới hạn so với đường Kiwi: không Auto Layout, ảnh là fill trong shape.

   --kiwi — clipboard định dạng gốc Figma (node thật + Auto Layout), theo spec
       open-design-vnpay đã PoC end-to-end. CẦN folder figma-clip-poc từ máy
       anhnd13 (~/Documents/figma-skill/figma-clip-poc) — đặt vào một trong các
       đường dẫn KIWI_CANDIDATES dưới đây là flag này tự chạy.

   Prereq: server đang chạy (npm run dev / python3 -m http.server), BASE trỏ đúng.
   ========================================================================== */
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? "http://localhost:8000"
const OUT = resolve(HERE, ".captures")

const KIWI_CANDIDATES = [
  resolve(HERE, "figma-clip-poc"),                                  // đặt PoC vào đây
  "/Users/tungnt2/Documents/work/figma-clip-poc",
  "/Users/tungnt2/Documents/work/open-design-vnpay/packages/figma-clip/dist/index.mjs",
]

const args = process.argv.slice(2)
const style = args.find(a => !a.startsWith("--")) ?? "ipay"
const kiwi = args.includes("--kiwi")
const screen = args.includes("--screen") ? args[args.indexOf("--screen") + 1] : "Home"

function requirePlaywright() {
  for (const c of [
    "/Users/tungnt2/Documents/work/design-v3/contract-pipeline/studio/package.json",
    resolve(HERE, "../../package.json"),
  ]) {
    try { return createRequire(c)("playwright") } catch { /* thử tiếp */ }
  }
  throw new Error("Không tìm thấy playwright")
}

function pbcopy(text) {
  const r = spawnSync("pbcopy", [], { input: text })
  if (r.status !== 0) throw new Error("pbcopy lỗi")
}

if (kiwi) {
  const found = KIWI_CANDIDATES.find(existsSync)
  if (!found) {
    console.error(
      "✗ --kiwi chưa chạy được trên máy này: thiếu encoder figma-clip.\n" +
      "  PoC đã verify end-to-end nằm ở máy anhnd13: ~/Documents/figma-skill/figma-clip-poc\n" +
      "  → xin folder đó, đặt vào: " + KIWI_CANDIDATES[0] + "\n" +
      "  (bộ chuyển IR có sẵn: design-v3/contract-pipeline/studio/scripts/h2d-to-figclip.mjs)\n" +
      "  Trong lúc chờ, dùng --svg: paste ra layer thật, chỉ thiếu Auto Layout.")
    process.exit(2)
  }
  console.error("figma-clip tìm thấy ở " + found + " — đường kiwi chưa được lắp tự động, báo Claude lắp nốt.")
  process.exit(2)
}

/* ---------------- SVG path ---------------- */
const { chromium } = requirePlaywright()
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 480, height: 1000 } })
try {
  await page.goto(`${BASE}/kit-gen/demo.html`)
  await page.evaluate(st => localStorage.setItem("kit-style", st), style)
  await page.goto(`${BASE}/kit-gen/demo.html`)
  await page.waitForFunction(sc => window.game?.scene?.isActive?.(sc), screen, { timeout: 20000 })
  await page.waitForTimeout(400)
  const svg = await page.evaluate(() => window.__figmaSVG())
  const file = resolve(OUT, `${style}-${screen.toLowerCase()}.svg`)
  writeFileSync(file, svg)
  pbcopy(svg)
  const uses = (svg.match(/<image /g) ?? []).length
  const texts = (svg.match(/<text /g) ?? []).length
  console.log(`✓ ${file}`)
  console.log(`✓ ĐÃ COPY vào clipboard (${(svg.length / 1024 / 1024).toFixed(1)}MB): ` +
    `${uses} sprite + ${texts} text — sang Figma bấm Cmd+V`)
} finally {
  await browser.close()
}
