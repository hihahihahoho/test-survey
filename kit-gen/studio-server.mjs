#!/usr/bin/env node
/* ============================================================================
   studio-server.mjs — backend cho studio.html (soạn contract → gen → slice).

   Chạy:  node kit-gen/studio-server.mjs   → mở http://localhost:8125/kit-gen/studio.html

   API:
     POST /api/save-contract  {contract}            → backup + ghi styles.json
     POST /api/upload         {path, dataURL}       → ghi file (refs/..., chỉ trong kit-gen)
     POST /api/gen            {filters: ["tet-main", ...]}  → chạy ./gen.sh nền
     GET  /api/gen-status                           → {running, log}
     POST /api/slice                                → chạy python3 slice.py, trả stdout
   Static: phục vụ cả repo (demo.html, preview.html, kits/... dùng chung server).
   ========================================================================== */
import { createServer } from "node:http"
import { spawn, spawnSync } from "node:child_process"
import { createReadStream, existsSync, statSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs"
import { dirname, resolve, join, normalize, extname } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))       // kit-gen/
const ROOT = resolve(HERE, "..")                           // repo root
const PORT = Number(process.env.PORT ?? 8125)

// Clone mới không có styles.json (gitignore — repo chỉ giữ bộ trắng):
// nhân bản từ contract mẫu để studio chạy được ngay
if (!existsSync(join(HERE, "styles.json")) && existsSync(join(HERE, "styles.example.json")))
  copyFileSync(join(HERE, "styles.example.json"), join(HERE, "styles.json"))

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".css": "text/css", ".svg": "image/svg+xml" }

let genChild = null
let genLog = ""

function body(req) {
  return new Promise((ok, err) => {
    let data = ""
    req.on("data", c => { data += c })
    req.on("end", () => { try { ok(data ? JSON.parse(data) : {}) } catch (e) { err(e) } })
  })
}
const send = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json" })
  res.end(JSON.stringify(obj))
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  try {
    if (req.method === "POST" && url.pathname === "/api/save-contract") {
      const { contract } = await body(req)
      if (!contract?.sheets || !contract?.styles) return send(res, 400, { error: "contract thiếu sheets/styles" })
      const dst = join(HERE, "styles.json")
      copyFileSync(dst, join(HERE, "styles.json.bak"))
      writeFileSync(dst, JSON.stringify(contract, null, 2))
      return send(res, 200, { ok: true, backup: "styles.json.bak" })
    }
    if (req.method === "POST" && url.pathname === "/api/upload") {
      const { path, dataURL } = await body(req)
      const dst = normalize(join(HERE, path))
      if (!dst.startsWith(HERE) || !/^refs\//.test(path)) return send(res, 400, { error: "chỉ ghi vào kit-gen/refs/" })
      mkdirSync(dirname(dst), { recursive: true })
      writeFileSync(dst, Buffer.from(dataURL.split(",")[1], "base64"))
      return send(res, 200, { ok: true, path })
    }
    if (req.method === "POST" && url.pathname === "/api/gen") {
      if (genChild) return send(res, 409, { error: "gen đang chạy" })
      const { filters = [] } = await body(req)
      genLog = `$ ./gen.sh ${filters.join(" ")}\n`
      genChild = spawn("./gen.sh", filters, { cwd: HERE })
      genChild.stdout.on("data", d => { genLog += d })
      genChild.stderr.on("data", d => { genLog += d })
      genChild.on("exit", code => { genLog += `\n[exit ${code}]`; genChild = null })
      return send(res, 200, { ok: true })
    }
    if (url.pathname === "/api/gen-status")
      return send(res, 200, { running: !!genChild, log: genLog.slice(-8000) })
    if (url.pathname === "/api/stale") {
      // kit đã cắt có cũ hơn raw không? (Copy-Figma dùng để tự slice khi cần)
      const sid = url.searchParams.get("style") ?? ""
      if (!/^[\w-]+$/.test(sid)) return send(res, 400, { error: "style?" })
      const { readdirSync } = await import("node:fs")
      const newest = (dir, pre = "") => {
        try {
          return Math.max(0, ...readdirSync(dir)
            .filter(f => f.startsWith(pre) && f.endsWith(".png"))
            .map(f => statSync(join(dir, f)).mtimeMs))
        } catch { return 0 }
      }
      const rawAt = newest(join(HERE, "raw"), sid + "-")
      const kitAt = newest(join(HERE, "kits", sid))
      return send(res, 200, { stale: rawAt > kitAt, rawAt, kitAt })
    }
    if (req.method === "POST" && url.pathname === "/api/slice") {
      const { styles = [] } = await body(req)
      const r = spawnSync("python3", ["slice.py", ...styles], { cwd: HERE, encoding: "utf8", timeout: 300000 })
      return send(res, 200, { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") })
    }
    // static
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)))
    if (path.startsWith(ROOT) && existsSync(path) && statSync(path).isFile()) {
      // no-cache: asset đổi sau mỗi lần slice/gen — browser phải revalidate,
      // không thì Copy-Figma nhúng bản ảnh cũ trong cache (đã dính)
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream",
                           "cache-control": "no-cache" })
      return createReadStream(path).pipe(res)
    }
    res.writeHead(404); res.end("404")
  } catch (e) {
    send(res, 500, { error: String(e) })
  }
}).listen(PORT, () =>
  console.log(`studio → http://localhost:${PORT}/kit-gen/studio.html`))
