/* Dựng đồ thị tài nguyên thật từ web/index.html: link/script → CSS @import → ES import graph. */
import { readFileSync, existsSync, statSync } from "node:fs"
import { dirname, join, normalize, posix, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"



export function buildGraph(webRoot) {
  const WEB = resolve(webRoot)
  const seen = new Map()   // relPath -> {kind, from, exists}
  const missing = []
  const queue = []

  const html = readFileSync(join(WEB, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "")
  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) push(m[1], "index.html", "css")
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) push(m[1], "index.html", "js")

  function push(spec, fromRel, kind) {
    if (/^(data:|https?:|#|mailto:)/.test(spec)) return
    const base = dirname(fromRel)
    const rel = posix.normalize(posix.join(base === "." ? "" : base, spec.replace(/^\.\//, "").replace(/[?#].*$/, "")))
    if (rel.startsWith("..")) { missing.push({ rel, from: fromRel, why: "thoát ra ngoài web/" }); return }
    if (seen.has(rel)) return
    const abs = join(WEB, rel)
    const ok = existsSync(abs) && statSync(abs).isFile()
    seen.set(rel, { kind, from: fromRel, exists: ok })
    if (!ok) { missing.push({ rel, from: fromRel, why: "không tồn tại trên đĩa" }); return }
    queue.push({ rel, abs, kind })
  }

  while (queue.length) {
    const { rel, abs, kind } = queue.shift()
    const src = readFileSync(abs, "utf8")
    if (kind === "css") {
      for (const m of src.matchAll(/@import\s+url\(["']?([^"')]+)["']?\)/g)) push(m[1], rel, "css")
      for (const m of src.matchAll(/url\(["']?(?!data:)([^"')]+)["']?\)/g)) {
        if (!/@import/.test(m[0])) push(m[1], rel, "asset")
      }
    } else if (kind === "js") {
      // static import / export-from / dynamic import với chuỗi literal
      const res = [
        /(?:^|\n)\s*import\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g,
        /(?:^|\n)\s*export\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g,
        /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
        /import\(\s*['"]([^'"]+)['"]\s*\)/g,
      ]
      for (const re of res) for (const m of src.matchAll(re)) {
        if (m[1].startsWith(".") || m[1].startsWith("/")) push(m[1], rel, "js")
      }
    }
  }
  return { seen, missing }
}

if (process.argv[1]?.endsWith("asset-graph.mjs")) {
  const { seen, missing } = buildGraph(process.argv[2]
    ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "web"))
  const byKind = {}
  for (const [, v] of seen) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1
  console.log(`web/index.html → đồ thị tài nguyên: ${seen.size} file`, JSON.stringify(byKind))
  if (missing.length === 0) console.log("THIẾU: 0 — mọi đường dẫn tài nguyên tồn tại thật")
  else { console.log(`THIẾU ${missing.length}:`); for (const m of missing) console.log(`  ✗ ${m.rel}  (tham chiếu từ ${m.from}) — ${m.why}`) }
  process.exit(missing.length ? 1 : 0)
}
