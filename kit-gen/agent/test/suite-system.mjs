/* suite-system.mjs — §6.2 A (#1 /health, #2 /api/doctor, #3 /api/workspaces)
   + 9 lớp phòng thủ vận chuyển của architecture §3.4 (Host 421, Origin 403, ép preflight,
   không wildcard CORS, chỉ bind loopback). */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, eq, ok, includes, stripComments, PAGES, CLIENT } from "./harness.mjs"
import { VERSION } from "../server.mjs"

export async function run({ api, call, agentDir, tmp }) {
  // ─────────────────────────────────────────── 1. HEALTH
  describe("health")
  await it("GET /health trả 200, protocol=1, không lộ đường dẫn tuyệt đối", async () => {
    const r = await api("GET", "/health")
    eq(r.status, 200, "status")
    eq(r.json.app, "kitgen-agent", "app")
    eq(r.json.protocol, 1, "protocol")
    eq(r.headers["x-kitgen-protocol"], "1", "X-KitGen-Protocol header")
    eq(r.json.version, VERSION, "version")
    ok(r.json.workspaceId.startsWith("ws_"), "workspaceId opaque")
    ok(!r.text.includes(tmp), `KHÔNG được chứa đường dẫn tuyệt đối: ${r.json.workspaceLabel}`)
    ok(!/\/Users\//.test(r.text), "không chứa /Users/")
  })
  await it("GET /api/doctor chỉ trả enum + boolean, không có nội dung auth", async () => {
    const r = await api("GET", "/api/doctor")
    eq(r.status, 200, "status")
    ok(typeof r.json.imageGen.available === "boolean", "imageGen.available là boolean")
    ok(["default-home", "img-home", "profile-overlay", "unavailable", "unknown"].includes(r.json.imageGen.mode), "mode là enum")
    ok(!/auth_mode|access_token|refresh_token|id_token|sk-/.test(r.text), "không có field auth nào")
    ok(typeof r.json.workspace.writable === "boolean", "workspace.writable")
  })
  await it("GET /api/workspaces trả id đục, không trả path", async () => {
    const r = await api("GET", "/api/workspaces")
    eq(r.status, 200, "status")
    ok(r.json.items.length >= 1, "có ≥1 workspace")
    ok(r.json.items.every(w => !("path" in w) && !("root" in w)), "không có field path/root")
    eq(r.json.activeId, r.json.items.find(w => w.active).id, "activeId khớp")
  })
  await it("GET /api/update đọc manifest tĩnh, không phụ thuộc GitHub API", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: "99.0.0", archive: "https://example.test/kitgen-runtime-99.0.0.tar.gz",
    }), { status: 200, headers: { "content-type": "application/json" } })
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.ok, true, "ok")
      eq(r.json.latestVersion, "99.0.0", "latest version")
      eq(r.json.available, true, "update available")
      eq(r.json.updateCommand, "~/.kitgen/bin/kitgen update", "lệnh cập nhật thủ công")
      ok(!/\/Users\//.test(r.text), "không trả đường dẫn tuyệt đối")
    } finally { globalThis.fetch = original }
  })
  await it("GET /api/update biết version ĐANG CHẠY, không mặc định 0.0.0", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: "0.0.1", archive: "https://example.test/kitgen-runtime-0.0.1.tar.gz",
    }), { status: 200, headers: { "content-type": "application/json" } })
    try {
      const r = await api("GET", "/api/update")
      ok(/^\d+\.\d+\.\d+/.test(r.json.currentVersion), `currentVersion là semver: ${r.json.currentVersion}`)
      ok(r.json.currentVersion !== "0.0.0", "KHÔNG lùi về 0.0.0 (nếu lùi thì lúc nào cũng báo có bản mới)")
      eq(r.json.available, false, "manifest cũ hơn ⇒ không có bản mới")
    } finally { globalThis.fetch = original }
  })
  await it("mất mạng KHÔNG thành lỗi 500 — trả ok:false + reason enum", async () => {
    const original = globalThis.fetch
    globalThis.fetch = async () => { throw new TypeError("fetch failed") }
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.ok, false, "ok")
      eq(r.json.reason, "OFFLINE", "reason là enum")
      eq(r.json.latestVersion, null, "không bịa version mới nhất")
      eq(r.json.available, false, "không đổ oan là có bản mới")
      ok(!/fetch failed/.test(r.text), "không lộ chuỗi lỗi thô của Node ra client")
    } finally { globalThis.fetch = original }
  })

  // ─────────────────────────────────────────── 2. CORS / HOST / preflight
  describe("bảo mật vận chuyển")
  await it("Origin lạ bị 403 ORIGIN_NOT_ALLOWED (kể cả GET)", async () => {
    const r = await call("GET", "/health", { headers: { ...CLIENT, origin: "https://evil.example.com" } })
    eq(r.status, 403, "status")
    eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
    ok(!r.headers["access-control-allow-origin"], "KHÔNG được trả Allow-Origin cho origin lạ")
  })
  await it("KHÔNG BAO GIỜ dùng Access-Control-Allow-Origin: *", async () => {
    const r = await api("GET", "/health")
    eq(r.headers["access-control-allow-origin"], PAGES, "phản chiếu đúng origin đã duyệt")
    ok(!stripComments(readFileSync(join(agentDir, "lib", "security.mjs"), "utf8")).includes('"*"'), "mã nguồn không có wildcard origin")
  })
  await it("Host sai (DNS-rebinding) bị 421 BAD_HOST", async () => {
    const r = await call("GET", "/health", { headers: { ...CLIENT, host: "kitgen.attacker.test" } })
    eq(r.status, 421, "status")
    eq(r.json.error.code, "BAD_HOST", "code")
  })
  await it("Host là tên miền lạ trỏ 127.0.0.1 cũng bị 421", async () => {
    const r = await call("GET", "/health", { headers: { ...CLIENT, host: "rebind.local:8765" } })
    eq(r.status, 421, "status")
  })
  await it("thiếu X-KitGen-Client bị 403 (ép preflight)", async () => {
    const r = await call("GET", "/api/projects", { headers: { host: CLIENT.host, origin: PAGES } })
    eq(r.status, 403, "status")
    eq(r.json.error.code, "CLIENT_HEADER_REQUIRED", "code")
  })
  await it("request không có Origin bị 403 khi chưa --allow-cli", async () => {
    const r = await call("GET", "/health", { headers: { host: CLIENT.host, "x-kitgen-client": "1" } })
    eq(r.status, 403, "status")
    eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
  })
  await it("OPTIONS preflight trả 204 + đủ header CORS, không credentials", async () => {
    const r = await api("OPTIONS", "/api/projects")
    eq(r.status, 204, "status")
    eq(r.headers["access-control-allow-origin"], PAGES, "allow-origin")
    includes(r.headers["access-control-allow-headers"], "X-KitGen-Client", "allow-headers")
    ok(!r.headers["access-control-allow-credentials"], "KHÔNG có Allow-Credentials")
  })
  await it("agent chỉ bind loopback: mọi listen() có host loopback tường minh, không 0.0.0.0", async () => {
    const src = stripComments(readFileSync(join(agentDir, "server.mjs"), "utf8"))
    const calls = [...src.matchAll(/\.listen\(([^\n]*)/g)].map(m => m[1])
    ok(calls.length >= 2, `phải có ≥2 lời gọi listen, thấy ${calls.length}`)
    for (const c of calls) {
      ok(/host:\s*"(127\.0\.0\.1|::1)"/.test(c), `listen KHÔNG khai host loopback tường minh: ${c}`)
      ok(!c.includes("0.0.0.0"), `listen bind 0.0.0.0: ${c}`)
    }
    ok(calls.some(c => c.includes('"127.0.0.1"')), "có bind 127.0.0.1")
    ok(calls.some(c => c.includes('"::1"')), "có bind [::1]")
  })

}
