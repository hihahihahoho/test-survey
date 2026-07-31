#!/usr/bin/env node
/* ============================================================================
   copy-figma.mjs — chụp màn game và đưa lên clipboard để DÁN THẲNG vào Figma.
   KHÔNG cần plugin, KHÔNG cần extension.

   node kit-gen/figma-export/copy-figma.mjs [style] [--h2d|--dom|--svg] [--screen Home]

   --h2d  (mặc định) — clipboard định dạng figh2d/figmeta mà Figma parse khi
       Cmd+V thành NODE THẬT (frame + image fill + text layer). Encoder là
       package figma-h2d của open-design-vnpay (vendored figma-h2d.global.js —
       cùng bundle vẫn dùng để capture IR). Nguồn: display list Phaser →
       __figmaDOM() replica → captureElement → toFigmaClipboardHtml → NSPasteboard
       flavor public.html (viết bằng JXA, không giới hạn kích thước như osascript -e).

   --dom — như --h2d nhưng nguồn là figma.html (DOM flex THẬT, không phải canvas)
       → Figma dựng được cấu trúc layout tốt hơn hẳn từ styles flexbox.
       Chọn frame bằng --screen (Loading|Home|Choose|Result|Task).

   --svg — đường cũ: SVG lên clipboard, paste ra layer + text sửa được nhưng
       KHÔNG có Auto Layout, ảnh nằm trong shape. Giữ để đối chứng.

   Prereq: server đang chạy (python3 -m http.server), BASE trỏ đúng.
   ========================================================================== */
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? "http://localhost:8000"
const OUT = resolve(HERE, ".captures")

const args = process.argv.slice(2)
const style = args.find(a => !a.startsWith("--")) ?? "ipay"
const mode = args.includes("--svg") ? "svg" : args.includes("--dom") ? "dom" : "h2d"
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

function pbcopyText(text) {
  const r = spawnSync("pbcopy", [], { input: text })
  if (r.status !== 0) throw new Error("pbcopy lỗi")
}

/* Đưa HTML lên clipboard đúng flavor public.html (Figma đọc text/html khi paste).
   pbcopy chỉ set plain text; osascript -e «data HTML…» thì vướng ARG_MAX với
   payload vài MB → JXA đọc từ file, không giới hạn. */
function pbcopyHtml(htmlFile) {
  const jxa = `
    ObjC.import('AppKit');
    const pb = $.NSPasteboard.generalPasteboard;
    pb.clearContents;
    const html = $.NSString.stringWithContentsOfFileEncodingError(
      '${htmlFile}', $.NSUTF8StringEncoding, null);
    pb.setStringForType(html, $.NSPasteboardTypeHTML);
    pb.setStringForType('', $.NSPasteboardTypeString);
  `
  const r = spawnSync("osascript", ["-l", "JavaScript", "-e", jxa], { encoding: "utf8" })
  if (r.status !== 0) throw new Error("JXA clipboard lỗi: " + r.stderr)
}

const bundle = readFileSync(resolve(HERE, "figma-h2d.global.js"), "utf8")
const { chromium } = requirePlaywright()
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 480, height: 1000 } })

async function gotoDemo() {
  await page.goto(`${BASE}/kit-gen/demo.html`)
  await page.evaluate(st => localStorage.setItem("kit-style", st), style)
  await page.goto(`${BASE}/kit-gen/demo.html`)
  await page.waitForFunction(sc => window.game?.scene?.isActive?.(sc), screen, { timeout: 20000 })
  await page.waitForTimeout(400)
}

try {
  if (mode === "svg") {
    await gotoDemo()
    const svg = await page.evaluate(() => window.__figmaSVG())
    const file = resolve(OUT, `${style}-${screen.toLowerCase()}.svg`)
    writeFileSync(file, svg)
    pbcopyText(svg)
    const uses = (svg.match(/<image /g) ?? []).length
    const texts = (svg.match(/<text /g) ?? []).length
    console.log(`✓ ${file}`)
    console.log(`✓ ĐÃ COPY SVG (${(svg.length / 1024 / 1024).toFixed(1)}MB): ` +
      `${uses} sprite + ${texts} text — sang Figma bấm Cmd+V`)
  } else {
    let html
    if (mode === "h2d") {
      await gotoDemo()
      await page.addScriptTag({ content: bundle })
      html = await page.evaluate(async () => {
        const root = window.__figmaDOM()
        const doc = await figmaH2D.captureElement(root)
        root.remove()
        const { html } = await figmaH2D.toFigmaClipboardHtml([doc], { source: "kit-gen-demo" })
        return html
      })
    } else { // dom — figma.html, DOM flex thật
      await page.goto(`${BASE}/kit-gen/figma.html?style=${style}`)
      await page.waitForLoadState("networkidle")
      await page.waitForTimeout(600)
      await page.addScriptTag({ content: bundle })
      html = await page.evaluate(async (sc) => {
        for (const stack of document.querySelectorAll(".stack")) {
          const name = stack.querySelector("small")?.textContent?.trim() ?? ""
          if (!name.toLowerCase().includes(sc.toLowerCase())) continue
          const doc = await figmaH2D.captureElement(stack.querySelector(".frame"))
          const { html } = await figmaH2D.toFigmaClipboardHtml([doc], { source: "kit-gen-dom" })
          return html
        }
        throw new Error("không thấy frame " + sc)
      }, screen)
    }
    const file = resolve(OUT, `${style}-${screen.toLowerCase()}.${mode}.html`)
    writeFileSync(file, html)
    pbcopyHtml(file)
    console.log(`✓ ${file}`)
    console.log(`✓ ĐÃ COPY figh2d (${(html.length / 1024 / 1024).toFixed(1)}MB, nguồn ${mode}) ` +
      `— sang Figma bấm Cmd+V, sẽ ra node thật`)
  }
} finally {
  await browser.close()
}
