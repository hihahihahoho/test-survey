/* Kiểm MỐI NỐI THẬT: chạy agent với workspace tạm trong /tmp, đi qua http.Server thật. */
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import http from "node:http"
import { Duplex } from "node:stream"
import { buildGraph } from "./asset-graph.mjs"

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const PORT = 8765
const PAGES = "https://kitgen.pages.dev"
let fails = 0, passes = 0

function socketPair() {
  const a = new Duplex({ read() {}, write(c, e, cb) { b.push(c); cb() }, final(cb) { b.push(null); cb() } })
  const b = new Duplex({ read() {}, write(c, e, cb) { a.push(c); cb() }, final(cb) { a.push(null); cb() } })
  for (const s of [a, b]) { s.setNoDelay = () => s; s.setKeepAlive = () => s; s.setTimeout = () => s }
  return [a, b]
}
function makeCall(server) {
  return (method, path, { headers = {}, body = null } = {}) => new Promise((res_, rej) => {
    const [srv, cli] = socketPair()
    server.emit("connection", srv)
    const h = { ...headers }
    let payload = body
    if (body !== null && !Buffer.isBuffer(body) && typeof body !== "string") {
      payload = JSON.stringify(body); h["content-type"] ??= "application/json"
    }
    const req = http.request({ method, path, headers: h, createConnection: () => cli }, res => {
      const cks = []
      res.on("data", c => cks.push(c))
      res.on("end", () => {
        const buf = Buffer.concat(cks)
        let json = null; try { json = JSON.parse(buf.toString("utf8")) } catch {}
        res_({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString("utf8"), json })
      })
    })
    req.on("error", rej); req.end(payload ?? undefined)
  })
}

const BROWSER = { host: `127.0.0.1:${PORT}` }                                   // điều hướng top-level
const CLIENT = { host: `127.0.0.1:${PORT}`, origin: PAGES, "x-kitgen-client": "1" }  // web tĩnh gọi API

function check(name, cond, detail = "") {
  if (cond) { passes++; console.log(`  ✓ ${name}`) }
  else { fails++; console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`) }
  return cond
}
const hdr = s => console.log(`\n── ${s} ${"─".repeat(Math.max(0, 74 - s.length))}`)

const ws = await mkdtemp(join(tmpdir(), "kitgen-int-"))
console.log(`workspace tạm: ${ws}  (KHÔNG dùng dữ liệu thật)`)

const { createAgent } = await import(ROOT + "/agent/server.mjs")
const printed = []
const agent = await createAgent({ workspaces: [ws], port: PORT, print: s => printed.push(String(s)) })
const call = makeCall(agent.server)

/* ───────── 1. HEALTH ───────── */
hdr("1 · /health (đường vào web tĩnh: có Origin + X-KitGen-Client)")
{
  const r = await call("GET", "/health", { headers: CLIENT })
  console.log(`  HTTP ${r.status} · X-KitGen-Protocol: ${r.headers["x-kitgen-protocol"]}`)
  console.log("  body:", JSON.stringify(r.json))
  check("200 + ok:true", r.status === 200 && r.json?.ok === true)
  check("protocol=1 ở header và body", r.headers["x-kitgen-protocol"] === "1" && r.json?.protocol === 1)
  check("có workspaceId/Label/Fingerprint (§6.2 #1)", !!(r.json?.workspaceId && r.json?.workspaceLabel && r.json?.workspaceFingerprint))
  check("KHÔNG lộ đường dẫn tuyệt đối", !JSON.stringify(r.json).includes("/Users/") && !JSON.stringify(r.json).includes(ws),
    JSON.stringify(r.json?.workspaceLabel))
  const noOrigin = await call("GET", "/health", { headers: { host: `127.0.0.1:${PORT}`, "x-kitgen-client": "1" } })
  console.log(`  không Origin → HTTP ${noOrigin.status} ${noOrigin.json?.error?.code ?? ""}`)
  check("không Origin → 403 (§3.4 lớp 2)", noOrigin.status === 403)
}

/* ───────── 2. SAME-ORIGIN /app/ ───────── */
hdr("2 · ĐƯỜNG VÀO SAME-ORIGIN /app/ — index.html + MỌI tài nguyên nó tham chiếu")
{
  const idx = await call("GET", "/app/", { headers: BROWSER })
  console.log(`  GET /app/ → HTTP ${idx.status} · ${idx.headers["content-type"]} · ${idx.body.length} byte`)
  check("/app/ trả index.html (200, text/html)", idx.status === 200 && /text\/html/.test(idx.headers["content-type"] ?? ""))
  check("/app/ KHÔNG cần header client (điều hướng top-level)", idx.status === 200)

  const { seen, missing } = buildGraph(ROOT + "/web")
  console.log(`  đồ thị tài nguyên từ index.html: ${seen.size} file · thiếu trên đĩa: ${missing.length}`)
  const bad = []
  for (const [rel, info] of seen) {
    const r = await call("GET", "/app/" + rel, { headers: BROWSER })
    const ct = String(r.headers["content-type"] ?? "")
    const wantJs = rel.endsWith(".js") || rel.endsWith(".mjs")
    const wantCss = rel.endsWith(".css")
    const mimeOk = wantJs ? /javascript/.test(ct) : wantCss ? /text\/css/.test(ct) : true
    if (r.status !== 200 || !mimeOk) bad.push(`${rel} → ${r.status} ${ct}`)
  }
  check(`tất cả ${seen.size} tài nguyên tải được qua /app/ với MIME đúng`, bad.length === 0, bad.slice(0, 8).join(" | "))

  // SPA fallback + phân giải tài nguyên ĐÚNG như trình duyệt làm với deep link (F5 giữa màn)
  for (const docPath of ["/app/", "/app/p/tet26-abc/design?tab=styles", "/app/p/tet26/runs/r-0032"]) {
    const doc = await call("GET", docPath, { headers: BROWSER })
    const isHtml = /text\/html/.test(String(doc.headers["content-type"] ?? ""))
    console.log(`  tài liệu ${docPath} → HTTP ${doc.status} ${doc.headers["content-type"]}`)
    check(`deep link ${docPath} trả index.html (SPA fallback)`, doc.status === 200 && isHtml)
    const refs = [...doc.text.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/gi)]
      .map(m => m[1]).filter(u => !u.startsWith("data:"))
    const bad = []
    for (const ref of refs) {
      const abs = new URL(ref, new URL(docPath, `http://127.0.0.1:${PORT}`)).pathname
      const got = await call("GET", abs, { headers: BROWSER })
      const ct = String(got.headers["content-type"] ?? "")
      console.log(`    ${ref} → ${abs} → ${got.status} ${ct}`)
      if (got.status !== 200 || /text\/html/.test(ct)) bad.push(`${ref}→${abs} ${got.status} ${ct}`)
    }
    check(`tài nguyên của ${docPath} phân giải ra FILE THẬT (không rơi về index.html ⇒ trang trắng)`,
      refs.length >= 2 && bad.length === 0, bad.join(" | "))
  }

  const esc = await call("GET", "/app/../agent/server.mjs", { headers: BROWSER })
  console.log(`  GET /app/../agent/server.mjs → HTTP ${esc.status} · ${String(esc.headers["content-type"])}`)
  check("/app/* không đọc được file ngoài bundle", !esc.text.includes("createAgent"))
}

/* ───────── 3. VÒNG CRUD THẬT ───────── */
hdr("3 · MỘT VÒNG THẬT: tạo project → ghi contract → đọc lại → xoá vào .trash → phục hồi")
let pid = null, trashId = null
{
  const c = await call("POST", "/api/projects", {
    headers: CLIENT,
    body: { name: "Tết 2026 — Kiểm mối nối", template: "basic", firstVariant: { vi: "Tết", bg: "magenta" }, tags: ["tet"] },
  })
  pid = c.json?.project?.id
  console.log(`  POST /api/projects → HTTP ${c.status} · id=${pid} · sheets=${c.json?.project?.stats?.sheets} · jobs=${c.json?.project?.stats?.jobs}`)
  check("201 + project.id + stats/state (§6.2 #8)", c.status === 201 && !!pid && !!c.json.project.state)

  const g0 = await call("GET", `/api/projects/${pid}/contract`, { headers: CLIENT })
  console.log(`  GET contract → HTTP ${g0.status} · version=${g0.json?.version} · ETag=${g0.headers.etag} · sheets=${g0.json?.contract?.sheets?.length}`)
  check("GET #22 trả {version,contract} + ETag", g0.status === 200 && g0.headers.etag === `"${g0.json.version}"`)

  const noMatch = await call("PUT", `/api/projects/${pid}/contract`, { headers: CLIENT, body: { contract: g0.json.contract } })
  console.log(`  PUT thiếu If-Match → HTTP ${noMatch.status} ${noMatch.json?.error?.code}`)
  check("PUT thiếu If-Match → 412 IF_MATCH_REQUIRED (§6.5-4)", noMatch.status === 412 && noMatch.json?.error?.code === "IF_MATCH_REQUIRED")

  const edited = structuredClone(g0.json.contract)
  edited.sheets[0].components[0].vi = "Nút đỏ ĐÃ SỬA (kiểm mối nối)"
  const put = await call("PUT", `/api/projects/${pid}/contract`, {
    headers: { ...CLIENT, "if-match": String(g0.json.version) }, body: { contract: edited },
  })
  console.log(`  PUT contract (If-Match: ${g0.json.version}) → HTTP ${put.status} · version=${put.json?.version} · snapshot=${put.json?.snapshot}`)
  check("PUT #23 → version tăng + có snapshot", put.status === 200 && put.json.version === g0.json.version + 1 && !!put.json.snapshot)

  const stale = await call("PUT", `/api/projects/${pid}/contract`, {
    headers: { ...CLIENT, "if-match": String(g0.json.version) }, body: { contract: edited },
  })
  console.log(`  PUT lại với version cũ → HTTP ${stale.status} ${stale.json?.error?.code} · serverVersion=${stale.json?.error?.details?.serverVersion}`)
  check("version lệch → 409 CONTRACT_CONFLICT + serverVersion", stale.status === 409 && stale.json?.error?.code === "CONTRACT_CONFLICT")

  const g1 = await call("GET", `/api/projects/${pid}/contract`, { headers: CLIENT })
  check("đọc lại thấy đúng dữ liệu vừa ghi",
    g1.json?.contract?.sheets?.[0]?.components?.[0]?.vi === "Nút đỏ ĐÃ SỬA (kiểm mối nối)",
    JSON.stringify(g1.json?.contract?.sheets?.[0]?.components?.[0]))
  console.log(`  đọc lại: version=${g1.json.version} · components[0].vi=${g1.json.contract.sheets[0].components[0].vi}`)

  const del = await call("DELETE", `/api/projects/${pid}`, { headers: CLIENT })
  trashId = del.json?.trashId
  console.log(`  DELETE /api/projects/${pid} → HTTP ${del.status} · trashId=${trashId} · bytes=${del.json?.bytes} · restoreBefore=${del.json?.restoreBefore}`)
  check("xoá MỀM: 200 + trashId + restoreBefore (§4.4)", del.status === 200 && !!trashId && !!del.json.restoreBefore)

  const gone = await call("GET", `/api/projects/${pid}`, { headers: CLIENT })
  console.log(`  GET project đã xoá → HTTP ${gone.status} ${gone.json?.error?.code}`)
  check("project đã xoá → 410 PROJECT_IN_TRASH", gone.status === 410 && gone.json?.error?.code === "PROJECT_IN_TRASH")

  const tl = await call("GET", "/api/trash", { headers: CLIENT })
  console.log(`  GET /api/trash → HTTP ${tl.status} · items=${tl.json?.items?.length} · ${JSON.stringify(tl.json?.items?.[0]?.name)}`)
  check("thùng rác có mục vừa xoá", tl.status === 200 && tl.json.items.some(i => i.trashId === trashId))

  const res = await call("POST", `/api/trash/${trashId}/restore`, { headers: CLIENT })
  console.log(`  POST /api/trash/${trashId}/restore → HTTP ${res.status} · id=${res.json?.project?.id}`)
  check("phục hồi → 200 + project trở lại", res.status === 200 && res.json?.project?.id === pid)

  const back = await call("GET", `/api/projects/${pid}/contract`, { headers: CLIENT })
  check("PHỤC HỒI KHÔNG MẤT DỮ LIỆU: contract vẫn là bản đã sửa",
    back.status === 200 && back.json.contract.sheets[0].components[0].vi === "Nút đỏ ĐÃ SỬA (kiểm mối nối)")
  console.log(`  sau phục hồi: version=${back.json?.version} · vi=${back.json?.contract?.sheets?.[0]?.components?.[0]?.vi}`)
}

/* ───────── 4. LUỒNG AGENT-CHƯA-CHẠY / hợp đồng lỗi ───────── */
hdr("4 · hợp đồng lỗi §6.1 và các mã UI phụ thuộc")
{
  const nf = await call("GET", "/api/projects/khong-ton-tai-abc", { headers: CLIENT })
  console.log(`  GET project lạ → HTTP ${nf.status} · envelope=${JSON.stringify(nf.json)}`)
  check("404 đúng envelope {error:{code,message}}", nf.status === 404 && nf.json?.error?.code === "PROJECT_NOT_FOUND")
  const badHost = await call("GET", "/health", { headers: { ...CLIENT, host: "evil.example.com" } })
  console.log(`  Host sai → HTTP ${badHost.status} ${badHost.json?.error?.code}`)
  check("Host sai → 421 BAD_HOST (chống DNS-rebinding)", badHost.status === 421)
  const badOrigin = await call("GET", "/health", { headers: { ...CLIENT, origin: "https://evil.example.com" } })
  console.log(`  Origin lạ → HTTP ${badOrigin.status} ${badOrigin.json?.error?.code}`)
  check("Origin lạ → 403 ORIGIN_NOT_ALLOWED", badOrigin.status === 403)
  const noClient = await call("GET", "/health", { headers: { host: `127.0.0.1:${PORT}`, origin: PAGES } })
  console.log(`  thiếu X-KitGen-Client → HTTP ${noClient.status} ${noClient.json?.error?.code}`)
  check("thiếu header ép preflight → 403", noClient.status === 403)
}

/* ───────── 5. RÒ RỈ ───────── */
hdr("5 · không rò thông tin nhạy cảm")
{
  const all = []
  for (const p of ["/health", "/api/doctor", "/api/workspaces", "/api/projects", "/api/trash"]) {
    const r = await call("GET", p, { headers: CLIENT })
    all.push(`${p} ${r.status} ${r.text}`)
  }
  const blob = all.join("\n")
  check("không có /Users/ trong mọi response", !blob.includes("/Users/"))
  check("không có đường dẫn workspace thật", !blob.includes(ws))
  check("không có chuỗi kiểu secret (sk-/Bearer/eyJ)", !/\bsk-[A-Za-z0-9]{8}|Bearer\s+[A-Za-z0-9]|eyJ[A-Za-z0-9]/.test(blob))
  const doctor = all.find(s => s.startsWith("/api/doctor"))
  console.log("  /api/doctor:", doctor.slice(0, 400))
}

console.log(`\n${"═".repeat(78)}\nKẾT QUẢ MỐI NỐI: ${passes} pass · ${fails} FAIL\n${"═".repeat(78)}`)
await rm(ws, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
