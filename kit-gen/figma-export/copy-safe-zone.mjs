#!/usr/bin/env node
/* Đưa một asset safe-zone lên clipboard Figma dưới dạng:
   - một frame 120×52 chỉ giữ contract/hitbox, clipContent=false;
   - một IMG raster nằm trong frame bằng offset âm. Artwork là image node,
     tuyệt đối không phải một frame được giả làm ảnh.

   node kit-gen/figma-export/copy-safe-zone.mjs \
     kit-gen/experiments/safe-zone-button/button-fairy.json

   Frame lấy đúng `frame.width × frame.height`, overflow visible tương đương
   clipContent=false. Image con dùng offset âm trong manifest nên decoration tràn
   ngoài frame mà không làm đổi kích thước layout/hitbox.
*/
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, ".captures")
const manifestPath = resolve(process.argv[2] ?? "")

if (!process.argv[2] || !existsSync(manifestPath)) {
  throw new Error("Cách dùng: node copy-safe-zone.mjs <asset-manifest.json>")
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const assetPath = resolve(dirname(manifestPath), manifest.asset ?? "")
if (!existsSync(assetPath)) throw new Error(`Không thấy asset: ${assetPath}`)
if (manifest.frame?.clipContent !== false) throw new Error("Manifest phải đặt frame.clipContent=false")

const frame = manifest.frame
const image = manifest.figma?.image
for (const [name, value] of Object.entries({
  frameWidth: frame?.width,
  frameHeight: frame?.height,
  imageX: image?.x,
  imageY: image?.y,
  imageWidth: image?.width,
  imageHeight: image?.height,
})) {
  if (!Number.isFinite(value)) throw new Error(`Geometry thiếu/sai: ${name}`)
}

function requirePlaywright() {
  for (const candidate of [
    resolve(HERE, "../webapp/package.json"),
    resolve(process.cwd(), "kit-gen/webapp/package.json"),
    resolve(process.cwd(), "package.json"),
    resolve(HERE, "../../package.json"),
  ]) {
    try { return createRequire(candidate)("playwright") } catch { /* thử tiếp */ }
  }
  throw new Error("Không tìm thấy Playwright")
}

function clipboardHtml(htmlFile) {
  const safePath = JSON.stringify(htmlFile)
  const jxa = `
    ObjC.import('AppKit');
    const pb = $.NSPasteboard.generalPasteboard;
    pb.clearContents;
    const html = $.NSString.stringWithContentsOfFileEncodingError(
      ${safePath}, $.NSUTF8StringEncoding, null);
    pb.setStringForType(html, $.NSPasteboardTypeHTML);
    pb.setStringForType('', $.NSPasteboardTypeString);
  `
  const result = spawnSync("osascript", ["-l", "JavaScript", "-e", jxa], { encoding: "utf8" })
  if (result.status !== 0) throw new Error(`Không ghi được clipboard: ${result.stderr}`)
}

const mime = extname(assetPath).toLowerCase() === ".webp" ? "image/webp" : "image/png"
const dataUri = `data:${mime};base64,${readFileSync(assetPath).toString("base64")}`
const bundle = readFileSync(resolve(HERE, "figma-h2d.global.js"), "utf8")
const { chromium } = requirePlaywright()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 600, height: 400 }, deviceScaleFactor: 1 })

try {
  await page.setContent(`<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;padding:120px;background:#fff}
      #safe-frame{position:relative;width:${frame.width}px;height:${frame.height}px;
        overflow:visible;background:transparent}
      #safe-frame>img{position:absolute;display:block;max-width:none;
        left:${image.x}px;top:${image.y}px;width:${image.width}px;height:${image.height}px}
    </style>
    <div id="safe-frame" aria-label="Button ${frame.width}×${frame.height}">
      <img alt="Image" src="${dataUri}">
    </div>`)
  await page.locator("#safe-frame img").evaluate((node) => node.decode())

  const geometry = await page.locator("#safe-frame").evaluate((root) => {
    const frameRect = root.getBoundingClientRect()
    const imageRect = root.querySelector("img").getBoundingClientRect()
    return {
      frame: { width: frameRect.width, height: frameRect.height },
      image: {
        x: imageRect.x - frameRect.x,
        y: imageRect.y - frameRect.y,
        width: imageRect.width,
        height: imageRect.height,
      },
      overflow: getComputedStyle(root).overflow,
    }
  })
  const close = (actual, expected) => Math.abs(actual - expected) <= 0.01
  if (!close(geometry.frame.width, frame.width) || !close(geometry.frame.height, frame.height)) {
    throw new Error(`Frame DOM sai: ${JSON.stringify(geometry.frame)}`)
  }
  for (const key of ["x", "y", "width", "height"]) {
    if (!close(geometry.image[key], image[key])) {
      throw new Error(`Image DOM sai ${key}: ${geometry.image[key]} != ${image[key]}`)
    }
  }
  if (geometry.overflow !== "visible") throw new Error(`Frame đang clip: overflow=${geometry.overflow}`)

  await page.addScriptTag({ content: bundle })
  const result = await page.evaluate(async () => {
    const root = document.querySelector("#safe-frame")
    const doc = await figmaH2D.captureElement(root)
    const imageNode = doc.root.childNodes.find((node) => node?.tag === "IMG")
    if (!imageNode) throw new Error("Payload Figma thiếu IMG raster node")
    const encoded = await figmaH2D.toFigmaClipboardHtml([doc], { source: "kitgen-safe-zone" })
    return { doc, html: encoded.html }
  })

  mkdirSync(OUT, { recursive: true })
  const stem = manifest.asset.replace(/\.[^.]+$/, "")
  const irFile = resolve(OUT, `${stem}.safe-zone.json`)
  const htmlFile = resolve(OUT, `${stem}.safe-zone.html`)
  writeFileSync(irFile, JSON.stringify({ geometry, document: result.doc }, null, 2))
  writeFileSync(htmlFile, result.html)
  clipboardHtml(htmlFile)

  console.log(`✓ frame ${frame.width}×${frame.height}, clip content OFF`)
  console.log("✓ artwork là IMG raster node, không phải frame")
  console.log(`✓ image x=${image.x}, y=${image.y}, ${image.width}×${image.height}`)
  console.log(`✓ ${irFile}`)
  console.log(`✓ đã copy node Figma — mở Figma và bấm Cmd+V`)
} finally {
  await browser.close()
}
