#!/usr/bin/env node
/* ============================================================================
   capture.mjs — chụp UI kit ra H2DDocument IR (nguyên liệu để đẩy sang Figma).

   Bê từ pipeline design-v3 (contract-pipeline/studio/scripts/capture.mjs) và
   rút gọn cho repo này. figma-h2d.global.js là bộ capture DOM→IR tự chủ
   (cùng vai trò với phần capture của extension html.to.design, không cần nó).

   Hai nguồn chụp:
     · figma.html — DOM mode: chụp thẳng từng .frame (mỗi frame → 1 file IR)
     · demo.html  — CANVAS Phaser: gọi cầu nối window.__figmaDOM() do demo
       expose — nó đọc DISPLAY LIST thật của scene đang chạy và dựng lại một
       bản DOM tương đương (div crop từ atlas + text node), rồi chụp bản đó.
       Canvas là hộp đen với mọi DOM capturer; display list thì không.

   Chạy (cần server: npm run dev, mặc định :8000):
     node kit-gen/figma-export/capture.mjs figma          # mọi style, mọi frame
     node kit-gen/figma-export/capture.mjs figma tet
     node kit-gen/figma-export/capture.mjs demo ipay      # chụp màn Home từ canvas
     BASE=http://localhost:8124 node ... (đổi port)

   Output: kit-gen/figma-export/.captures/<tên>.json (+ summary in ra console).
   Đường ra Figma từ IR (bước sau): figma-clip encoder (Kiwi clipboard, spec đã
   PoC ở design-v3 — code nằm máy anhnd13) hoặc đẩy qua Figma MCP.
   ========================================================================== */
import { createRequire } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? "http://localhost:8000"
const OUT = resolve(HERE, ".captures")
const STYLES = ["ipay", "candy", "tet"]

/* playwright mượn từ workspace design-v3 (đã có browser cache sẵn);
   fallback: node_modules của chính repo này nếu sau này cài riêng. */
function requirePlaywright() {
  const candidates = [
    "/Users/tungnt2/Documents/work/design-v3/contract-pipeline/studio/package.json",
    resolve(HERE, "../../package.json"),
  ]
  for (const c of candidates) {
    try { return createRequire(c)("playwright") } catch { /* thử tiếp */ }
  }
  throw new Error("Không tìm thấy playwright — cài trong design-v3 hoặc repo này")
}

const bundle = readFileSync(resolve(HERE, "figma-h2d.global.js"), "utf8")

const [, , mode = "figma", onlyStyle] = process.argv
const styles = onlyStyle ? [onlyStyle] : STYLES

async function settle(page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(600)
}

function summary(doc) {
  let nodes = 0, texts = 0, imgs = 0
  const walk = (n) => {
    nodes++
    if (n.tag === "IMG" || (n.styles?.backgroundImage ?? "").includes("url")) imgs++
    else if ((n.childNodes ?? []).some(c => c.nodeType === 3)) texts++
    ;(n.childNodes || n.children || []).forEach(walk)
  }
  walk(doc.root ?? doc)
  return { nodes, texts, imgs }
}

async function captureFigmaPage(page, style) {
  await page.goto(`${BASE}/kit-gen/figma.html?style=${style}`)
  await settle(page)
  await page.addScriptTag({ content: bundle })
  const frames = await page.evaluate(async () => {
    const out = []
    for (const stack of document.querySelectorAll(".stack")) {
      const name = stack.querySelector("small")?.textContent?.trim() ?? "frame"
      const frame = stack.querySelector(".frame")
      // eslint-disable-next-line no-undef
      out.push({ name, doc: await figmaH2D.captureElement(frame) })
    }
    return out
  })
  for (const { name, doc } of frames) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    const file = `${style}-${slug}.json`
    writeFileSync(resolve(OUT, file), JSON.stringify(doc))
    const s = summary(doc)
    console.log(`✓ ${file}: ${s.nodes} node (${s.imgs} ảnh, ${s.texts} text)`)
  }
}

async function captureDemoCanvas(page, style) {
  await page.goto(`${BASE}/kit-gen/demo.html`)
  await page.evaluate((st) => localStorage.setItem("kit-style", st), style)
  await page.goto(`${BASE}/kit-gen/demo.html`)
  // đợi Phaser qua Preload vào Home (canvas + scene Home active)
  await page.waitForFunction(() =>
    window.game?.scene?.isActive?.("Home"), null, { timeout: 20000 })
  await page.waitForTimeout(400)
  await page.addScriptTag({ content: bundle })
  const res = await page.evaluate(async () => {
    if (typeof window.__figmaDOM !== "function") return { error: "demo.html chưa có __figmaDOM()" }
    const root = window.__figmaDOM()           // dựng replica từ display list
    // eslint-disable-next-line no-undef
    const doc = await figmaH2D.captureElement(root)
    root.remove()
    return { doc }
  })
  if (res.error) { console.error("✗ " + res.error); return }
  const file = `${style}-canvas-home.json`
  writeFileSync(resolve(OUT, file), JSON.stringify(res.doc))
  const s = summary(res.doc)
  console.log(`✓ ${file}: ${s.nodes} node (${s.imgs} ảnh, ${s.texts} text) — từ display list Phaser`)
}

const { chromium } = requirePlaywright()
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 480, height: 1000 } })
try {
  for (const style of styles) {
    if (mode === "figma") await captureFigmaPage(page, style)
    else if (mode === "demo") await captureDemoCanvas(page, style)
    else throw new Error(`mode lạ: ${mode} (figma | demo)`)
  }
} finally {
  await browser.close()
}
console.log(`→ IR trong ${OUT}`)
