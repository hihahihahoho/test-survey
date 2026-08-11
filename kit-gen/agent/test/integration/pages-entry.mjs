/* Mô phỏng Cloudflare Pages: file thật thì trả file, còn lại rơi về /index.html (mã 200)
   — đúng luật trong dist/_redirects. Kiểm deep link không vỡ tài nguyên. */
import { readFile, stat } from "node:fs/promises"
import { dirname, extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const DIST = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dist")
const MIME = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png" }

async function serve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0])
  const abs = join(DIST, normalize(clean))
  if (!abs.startsWith(DIST)) return { status: 403, ct: "" }
  try {
    const st = await stat(abs)
    if (st.isFile()) return { status: 200, ct: MIME[extname(abs)] ?? "application/octet-stream", body: await readFile(abs, "utf8") }
  } catch { /* không phải file thật */ }
  return { status: 200, ct: "text/html", body: await readFile(join(DIST, "index.html"), "utf8"), fallback: true }
}

let pass = 0, fail = 0
const check = (n, c, d="") => { if (c) { pass++; console.log(`  ✓ ${n}`) } else { fail++; console.log(`  ✗ ${n} ${d}`) } }

console.log("ĐƯỜNG VÀO CLOUDFLARE PAGES (dist/ + _redirects SPA 200)\n")
for (const docPath of ["/", "/p/tet26-abc/design?tab=styles", "/p/tet26/runs/r-0032", "/settings", "/setup"]) {
  const doc = await serve(docPath)
  const refs = [...doc.body.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/gi)].map(m => m[1]).filter(u => !u.startsWith("data:"))
  console.log(`tài liệu ${docPath} → ${doc.status} ${doc.ct}${doc.fallback ? " (SPA fallback)" : ""} · khai ${JSON.stringify(refs)}`)
  const bad = []
  for (const ref of refs) {
    const abs = new URL(ref, new URL(docPath, "https://kitgen.pages.dev")).pathname
    const got = await serve(abs)
    console.log(`    ${ref} → ${abs} → ${got.status} ${got.ct}${got.fallback ? " ← RƠI VỀ index.html!" : ""}`)
    if (got.fallback || got.status !== 200) bad.push(abs)
  }
  check(`tài nguyên của ${docPath} ra file thật`, refs.length >= 2 && bad.length === 0, bad.join(", "))
}
// đồ thị module: import bên trong js/ phân giải theo URL MODULE nên phải luôn đúng
const boot = await serve("/js/boot.js")
check("boot.js là JS thật (không phải HTML)", /javascript/.test(boot.ct))
const seen = new Set(["/js/boot.js"]); const q = ["/js/boot.js"]; let n = 0
while (q.length) {
  const u = q.shift(); const r = await serve(u)
  if (r.fallback || r.status !== 200) { fail++; console.log(`  ✗ 404 ngầm: ${u}`); continue }
  n++
  const dir = u.slice(0, u.lastIndexOf("/"))
  for (const re of [/(?:^|\n)\s*import\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g, /(?:^|\n)\s*export\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    for (const m of r.body.matchAll(re)) if (m[1].startsWith(".")) {
      const p = new URL(m[1], `https://x${dir}/`).pathname
      if (!seen.has(p)) { seen.add(p); q.push(p) }
    }
  }
}
check(`toàn bộ đồ thị module (${n} file) tải được, không file nào rơi về index.html`, n > 100)
// CSS @import
const app = await serve("/css/app.css")
check("css/app.css là text/css thật", /text\/css/.test(app.ct))
let cssN = 0
for (const m of app.body.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)) {
  const p = new URL(m[1], "https://x/css/").pathname
  const r = await serve(p)
  if (r.fallback || !/text\/css/.test(r.ct)) { fail++; console.log(`  ✗ ${p} → ${r.ct}`) } else cssN++
}
check(`${cssN} file CSS con của app.css tải được`, cssN >= 10)
console.log(`\nKẾT QUẢ PAGES: ${pass} pass · ${fail} FAIL`)
process.exit(fail ? 1 : 0)
