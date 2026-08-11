#!/usr/bin/env node
/* Copy các asset đã cắt sang Figma thành nhiều safe-frame root.

   Figma flatten wrapper trong suốt khi nó nằm bên trong một board. Vì vậy mỗi
   safe frame phải là ROOT của một H2D document; IMG raster nằm bên trong theo
   offset từ manifest nên decoration được tràn ra ngoài frame.

   node kit-gen/figma-export/copy-sprite-images.mjs \
     kit-gen/experiments/sprite-sheet-fairy/manifest.json rnd
*/
import { createRequire } from "node:module"
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const manifestPath = resolve(process.argv[2] ?? "")
if (!process.argv[2] || !existsSync(manifestPath)) {
  throw new Error("Cách dùng: node copy-sprite-images.mjs <manifest.json> [style-id]")
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
const styleId = process.argv[3] ?? Object.keys(manifest.styles ?? {})[0]
const assets = manifest.styles?.[styleId]?.assets ?? []
if (!assets.length) throw new Error(`Manifest không có asset cho style: ${styleId}`)

const tightRoot = resolve(dirname(manifestPath), "assets/tight")
const items = assets.map((asset, index) => {
  const path = resolve(tightRoot, asset.file)
  if (!existsSync(path)) throw new Error(`Không thấy asset: ${path}`)
  const scale = 0.5
  const [contentWidth, contentHeight] = asset.content
  const [contentX, contentY] = asset.content_at
  const [safeX, safeY, safeWidth, safeHeight] = asset.safe
  return {
    file: asset.file,
    dataUri: `data:image/png;base64,${readFileSync(path).toString("base64")}`,
    frameWidth: safeWidth * scale,
    frameHeight: safeHeight * scale,
    imageX: (contentX - safeX) * scale,
    imageY: (contentY - safeY) * scale,
    imageWidth: contentWidth * scale,
    imageHeight: contentHeight * scale,
    row: Math.floor(index / 4),
    col: index % 4,
  }
})

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

const cellWidth = 260
const cellHeight = 190
const pad = 32
const htmlItems = items.map((item) => {
  const left = pad + item.col * cellWidth + (cellWidth - item.frameWidth) / 2
  const top = pad + item.row * cellHeight + (cellHeight - item.frameHeight) / 2
  const name = item.file.replace(/\.png$/i, "")
  return `<div class="safe-frame" aria-label="${name}" style="position:absolute;` +
    `left:${left}px;top:${top}px;width:${item.frameWidth}px;height:${item.frameHeight}px;` +
    `overflow:visible;background:transparent">` +
    `<img alt="Image · ${name}" src="${item.dataUri}" style="position:absolute;` +
    `left:${item.imageX}px;top:${item.imageY}px;width:${item.imageWidth}px;` +
    `height:${item.imageHeight}px;display:block;max-width:none"></div>`
}).join("\n")

const { chromium } = requirePlaywright()
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: pad * 2 + cellWidth * 4, height: pad * 2 + cellHeight * 4 },
  deviceScaleFactor: 1,
})

try {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:white}
    #sprite-board{position:relative;width:${pad * 2 + cellWidth * 4}px;
      height:${pad * 2 + cellHeight * 4}px;background:transparent}
  </style><div id="sprite-board" aria-label="Sprite sheet · ${styleId}">${htmlItems}</div>`)
  await page.locator("img").evaluateAll((nodes) => Promise.all(nodes.map((node) => node.decode())))
  await page.addScriptTag({ content: readFileSync(resolve(HERE, "figma-h2d.global.js"), "utf8") })

  const result = await page.evaluate(async () => {
    const frames = [...document.querySelectorAll(".safe-frame")]
    const docs = []
    for (const frame of frames) docs.push(await figmaH2D.captureElement(frame))
    const structures = docs.map((doc) => ({
      frame: doc.root,
      image: doc.root.childNodes?.find((node) => node?.tag === "IMG"),
    }))
    if (structures.length !== 16) throw new Error(`Payload chỉ có ${structures.length}/16 frame`)
    if (structures.some(({ frame }) => frame?.tag !== "DIV")) {
      throw new Error("Có document root không phải DIV safe frame")
    }
    if (structures.some(({ image }) => !image)) throw new Error("Có frame thiếu IMG raster")
    const encoded = await figmaH2D.toFigmaClipboardHtml(docs, { source: "kitgen-sprite-images" })
    return {
      html: encoded.html,
      structures: structures.map(({ frame, image }) => ({
        frame: { tag: frame.tag, rect: frame.rect, label: frame.attributes?.["aria-label"] },
        image: { tag: image.tag, rect: image.rect },
      })),
    }
  })

  const out = resolve(HERE, ".captures")
  mkdirSync(out, { recursive: true })
  const htmlFile = resolve(out, `${styleId}.sprite-images.html`)
  const summaryFile = resolve(out, `${styleId}.sprite-images.json`)
  writeFileSync(htmlFile, result.html)
  writeFileSync(summaryFile, JSON.stringify({
    styleId,
    files: items.map((x) => x.file),
    structures: result.structures,
  }, null, 2))
  clipboardHtml(htmlFile)

  console.log(`✓ ${items.length} root document: Frame safe-zone → IMG raster`)
  console.log("✓ mọi frame clip content OFF; decoration giữ ngoài frame")
  console.log(`✓ ${summaryFile}`)
  console.log("✓ đã copy — mở Figma và bấm Cmd+V")
} finally {
  await browser.close()
}
