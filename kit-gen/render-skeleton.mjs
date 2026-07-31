#!/usr/bin/env node
/* Render skeleton.html → skeleton/<sheet>.png (1536×1024) bằng playwright.
   Thay bản vẽ PIL (skeleton.py — giữ làm fallback khi thiếu playwright). */
import { createRequire } from "node:module"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))

function requirePlaywright() {
  for (const c of [
    "/Users/tungnt2/Documents/work/design-v3/contract-pipeline/studio/package.json",
    resolve(HERE, "../package.json"),
  ]) {
    try { return createRequire(c)("playwright") } catch { /* thử tiếp */ }
  }
  throw new Error("Không tìm thấy playwright")
}

const cfg = JSON.parse(readFileSync(resolve(HERE, "styles.json"), "utf8"))
const { chromium } = requirePlaywright()
mkdirSync(resolve(HERE, "skeleton"), { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
try {
  await page.goto("file://" + resolve(HERE, "skeleton.html"))
  await page.evaluate(c => window.__build(c), cfg)
  for (const sh of cfg.sheets) {
    const out = resolve(HERE, "skeleton", `${sh.id}.png`)
    await page.locator(`#sheet-${sh.id}`).screenshot({ path: out })
    console.log("skeleton →", out)
  }
} finally {
  await browser.close()
}
