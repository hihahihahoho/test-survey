/* suite-import.mjs — bundle /app/ same-origin (#6), cầu dò /bridge.html (#5),
   và kiểm KHÔNG rò secret.
   Phần "nhập một chiều" (#19 uploads / #20 import/preview) đã bỏ cùng trình nhập zip. */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, it, eq, ok, includes, pathExists, rmTemp, CLIENT, PAGES, PORT } from "./harness.mjs"

export async function run({ api, call, agentDir, wsRoot }) {
  // ─────────────────────────────────────────── 10. bundle /app/ · /bridge.html · redact
  /* ── CAO-01 (QA-UX, bằng chứng Network panel Chrome 151) ───────────────────
     App tải từ /app/ gọi GET /health bị agent trả 403 ORIGIN_NOT_ALLOWED ⇒ đường vào
     thứ hai (lá chắn mixed-content/Safari) CHẾT, app kẹt chế độ chỉ-đọc.
     Nguyên nhân: security.mjs coi "thiếu Origin" == "gọi từ CLI". Nhưng theo chuẩn Fetch,
     trình duyệt KHÔNG gửi Origin cho GET/HEAD same-origin.
     Test cũ không bắt được vì harness LUÔN tự đặt Origin ⇒ không bao giờ chạm nhánh đó.
     Bộ header dưới đây chép ĐÚNG những gì Chrome gửi (có sec-fetch-site, KHÔNG có origin). */
  describe("CAO-01 · app /app/ gọi API same-origin không có Origin")

  /** Đúng bộ header Chrome gửi khi bundle tại /app/ fetch API cùng origin. */
  const chromeSameOrigin = {
    host: CLIENT.host,
    "x-kitgen-client": "1",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    // CỐ Ý KHÔNG có `origin` — đây chính là điều kiện tái hiện lỗi.
  }

  await it("app tải từ /app/ gọi được /health mà KHÔNG cần --allow-cli", async () => {
    const r = await call("GET", "/health", { headers: chromeSameOrigin })
    eq(r.status, 200, "phải 200 — 403 nghĩa là CAO-01 hồi quy, app kẹt chế độ chỉ-đọc")
    eq(r.json.app, "kitgen-agent", "đúng thân JSON của /health")
    eq(r.json.protocol, 1, "protocol")
  })

  await it("app /app/ gọi được /api/* same-origin (không chỉ /health)", async () => {
    const r = await call("GET", "/api/projects", { headers: chromeSameOrigin })
    eq(r.status, 200, "GET /api/projects phải 200")
    ok(Array.isArray(r.json.items), "trả danh sách project")
  })

  await it("same-origin không Origin KHÔNG được trả Access-Control-Allow-Origin", async () => {
    const r = await call("GET", "/health", { headers: chromeSameOrigin })
    eq(r.status, 200, "status")
    ok(!r.headers["access-control-allow-origin"],
      "same-origin thì không cần CORS header; trả ra là vô tình mở cho trang khác đọc")
  })

  /* ── Miễn trừ KHÔNG được nới lỏng bảo mật: 4 ca chặn ───────────────────── */
  await it("cross-site không Origin vẫn bị 403 (trang độc hại không giả mạo được Sec-Fetch-Site)", async () => {
    const r = await call("GET", "/health", {
      headers: { host: CLIENT.host, "x-kitgen-client": "1", "sec-fetch-site": "cross-site" },
    })
    eq(r.status, 403, "cross-site phải bị chặn")
    eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
  })

  await it("same-site không Origin vẫn bị 403 (chỉ same-origin mới được miễn)", async () => {
    const r = await call("GET", "/health", {
      headers: { host: CLIENT.host, "x-kitgen-client": "1", "sec-fetch-site": "same-site" },
    })
    eq(r.status, 403, "same-site phải bị chặn")
  })

  await it("GHI (POST/DELETE) same-origin không Origin vẫn bị 403 — miễn trừ chỉ cho GET/HEAD", async () => {
    for (const m of ["POST", "PATCH", "DELETE"]) {
      const r = await call(m, "/api/projects", { headers: chromeSameOrigin, body: { name: "x" } })
      eq(r.status, 403, `${m} phải bị chặn (chuẩn Fetch: request ghi LUÔN có Origin)`)
    }
  })

  await it("curl trần (không Origin, không Sec-Fetch-Site) vẫn bị 403 khi chưa --allow-cli", async () => {
    const r = await call("GET", "/health", { headers: { host: CLIENT.host, "x-kitgen-client": "1" } })
    eq(r.status, 403, "hành vi CLI giữ nguyên như cũ, không bị nới")
    eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
  })

  await it("same-origin vẫn phải có X-KitGen-Client (lớp ép preflight KHÔNG bị bỏ qua)", async () => {
    const r = await call("GET", "/api/projects", {
      headers: { host: CLIENT.host, "sec-fetch-site": "same-origin" },
    })
    eq(r.status, 403, "thiếu header client vẫn chặn")
    eq(r.json.error.code, "CLIENT_HEADER_REQUIRED", "code")
  })

  await it("same-origin nhưng Host sai vẫn bị 421 (chống DNS-rebinding còn nguyên)", async () => {
    const r = await call("GET", "/health", {
      headers: { ...chromeSameOrigin, host: "rebind.attacker.test" },
    })
    eq(r.status, 421, "Host không loopback phải bị chặn TRƯỚC cả Origin")
    eq(r.json.error.code, "BAD_HOST", "code")
  })

  /* ── §B3 (blind-test 2.1.17) · GỐC "/" ĐƯA VÀO APP ────────────────────────
     Người dùng gõ `localhost:8765` và nhận về JSON ORIGIN_NOT_ALLOWED — trông y như
     app hỏng, dù app đang chạy ngon ở /app/. Ba ca dưới khoá cả hành vi MỚI lẫn
     phần contract bảo mật KHÔNG được đổi theo. */
  describe("§B3 · gốc / đưa vào /app/")

  await it("gõ localhost:PORT vào thanh địa chỉ ⇒ 302 sang /app/, KHÔNG phải JSON lỗi", async () => {
    // Điều hướng top-level thật của trình duyệt: không Origin, Sec-Fetch-Site: none.
    const r = await call("GET", "/", {
      headers: { host: CLIENT.host, "sec-fetch-site": "none", "sec-fetch-mode": "navigate" },
    })
    eq(r.status, 302, "phải 302 — 403 nghĩa là §B3 hồi quy")
    eq(r.headers.location, "/app/", "Location")
  })

  await it("curl trần vào / cũng được đưa sang /app/ (không cần --allow-cli)", async () => {
    const r = await call("GET", "/", { headers: { host: CLIENT.host } })
    eq(r.status, 302, "status")
    eq(r.headers.location, "/app/", "Location")
  })

  await it("miễn trừ của / KHÔNG lan sang /api/* — contract bảo mật giữ nguyên", async () => {
    for (const p of ["/api/projects", "/health"]) {
      const r = await call("GET", p, { headers: { host: CLIENT.host, "sec-fetch-site": "none" } })
      eq(r.status, 403, `${p} vẫn phải 403`)
      eq(r.json.error.code, "ORIGIN_NOT_ALLOWED", "code")
    }
  })

  await it("/ chỉ mở cho phương thức an toàn và cho điều hướng, không cho trang khác nhúng", async () => {
    const cross = await call("GET", "/", { headers: { host: CLIENT.host, "sec-fetch-site": "cross-site" } })
    eq(cross.status, 403, "trang khác origin nhúng / vẫn bị chặn")
    const post = await call("POST", "/", { headers: { host: CLIENT.host }, body: { x: 1 } })
    eq(post.status, 403, "POST / không được miễn Origin")
  })

  describe("bundle /app/ và bridge")
  await it("GET /app/ phục vụ được (same-origin, không cần header client)", async () => {
    const r = await call("GET", "/app/", { headers: { host: CLIENT.host, origin: `http://127.0.0.1:${PORT}` } })
    eq(r.status, 200, "status")
    includes(r.headers["content-type"], "text/html", "trả HTML")
    ok(r.text.length > 100, "có nội dung, không phải 404 câm")
  })
  await it("/app/ phục vụ ĐÚNG bundle web khi có index.html (đường vào thứ 2)", async () => {
    // Bundle thật của web/ do người khác sở hữu và có thể chưa có index.html.
    // Ca này dựng một bundle tối giản trong /tmp rồi trỏ agent vào bằng --app-root,
    // để chứng minh đường vào same-origin hoạt động THẬT, không chỉ trả trang giải thích.
    const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const bundle = await mkdtemp(join(tmpdir(), "kitgen-bundle-"))
    await writeFile(join(bundle, "index.html"), "<!doctype html><title>kit-gen app</title><div id=app>DẤU HIỆU BUNDLE</div>")
    await mkdir(join(bundle, "js"), { recursive: true })
    await writeFile(join(bundle, "js", "app.a1b2c3d4.js"), "export const x = 1")

    const { createAgent } = await import("../server.mjs")
    const { apiFor, fakeDoctor } = await import("./harness.mjs")
    const a = await createAgent({
      workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
      rateLimit: 5000, doctor: fakeDoctor(false), appRoot: bundle,
    })
    a.state.port = PORT
    const { call: c } = apiFor(a.server)
    const local = { host: CLIENT.host, origin: `http://127.0.0.1:${PORT}` }

    const root = await c("GET", "/app/", { headers: local })
    eq(root.status, 200, "GET /app/ = 200")
    includes(root.text, "DẤU HIỆU BUNDLE", "phục vụ đúng index.html của bundle")
    eq(root.headers["cache-control"], "no-cache", "index.html không được cache (architecture R14)")

    const asset = await c("GET", "/app/js/app.a1b2c3d4.js", { headers: local })
    eq(asset.status, 200, "asset 200")
    includes(asset.headers["content-type"], "text/javascript", "MIME của ES module")
    includes(asset.headers["cache-control"], "immutable", "asset có hash → cache dài")

    const spa = await c("GET", "/app/p/tet26/design", { headers: local })
    eq(spa.status, 200, "đường dẫn SPA rơi về index.html")
    includes(spa.text, "DẤU HIỆU BUNDLE", "nội dung là index.html")

    const redir = await c("GET", "/app", { headers: local })
    eq(redir.status, 302, "/app → 302")
    eq(redir.headers.location, "/app/", "Location")

    const escape = await c("GET", "/app/js/../../../../etc/passwd", { headers: local })
    ok(!escape.text.includes("root:"), "không rò /etc/passwd qua /app/")
    await rmTemp(bundle)
  })

  /* ── Bundle REACT build (Vite) tại /app/ ───────────────────────────────────
     Stack mới sinh ra `assets/index-<hash>.js` với base:"./" ⇒ index.html tham chiếu
     TƯƠNG ĐỐI. Deep link của TanStack Router (/app/p/:id/design) sẽ xin sai đường nếu
     agent không rewrite. Ca này dựng một dist Vite giả ĐÚNG hình dạng thật để kiểm. */
  await it("BUNDLE VITE: SPA fallback đúng cho TanStack Router + rewrite asset tương đối", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const dist = await mkdtemp(join(tmpdir(), "kitgen-vite-"))
    await mkdir(join(dist, "assets"), { recursive: true })
    // index.html y hệt Vite sinh ra với base:"./"
    await writeFile(join(dist, "index.html"),
      '<!doctype html><html lang="vi"><head><meta charset="UTF-8">' +
      '<script type="module" crossorigin src="./assets/index-BQq4Xy7z.js"></script>' +
      '<link rel="stylesheet" crossorigin href="./assets/index-Ca1b2C3d.css">' +
      '</head><body><div id="root">DẤU HIỆU REACT</div></body></html>')
    await writeFile(join(dist, "assets", "index-BQq4Xy7z.js"), "export const app = 1")
    await writeFile(join(dist, "assets", "index-Ca1b2C3d.css"), ":root{color-scheme:dark}")

    const { createAgent } = await import("../server.mjs")
    const { apiFor, fakeDoctor } = await import("./harness.mjs")
    const a = await createAgent({
      workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
      rateLimit: 5000, doctor: fakeDoctor(false), appRoot: dist,
    })
    a.state.port = PORT
    const { call: c } = apiFor(a.server)
    const local = { host: CLIENT.host, origin: `http://127.0.0.1:${PORT}` }

    // 1. index.html được rewrite ./assets → /app/assets (nếu không, deep link 404)
    const root = await c("GET", "/app/", { headers: local })
    eq(root.status, 200, "GET /app/ = 200")
    includes(root.text, "DẤU HIỆU REACT", "phục vụ đúng index.html của dist")
    includes(root.text, 'src="/app/assets/index-BQq4Xy7z.js"', "script rewrite về /app/")
    includes(root.text, 'href="/app/assets/index-Ca1b2C3d.css"', "css rewrite về /app/")
    ok(!/(src|href)="\.\/assets/.test(root.text), "KHÔNG còn đường dẫn tương đối ./assets")
    eq(root.headers["cache-control"], "no-cache", "index.html no-cache (R14)")

    // 2. asset có hash kiểu Vite (dấu "-", hash có chữ HOA) → immutable
    const js = await c("GET", "/app/assets/index-BQq4Xy7z.js", { headers: local })
    eq(js.status, 200, "asset js 200")
    includes(js.headers["content-type"], "text/javascript", "MIME module")
    includes(js.headers["cache-control"], "immutable", "hash kiểu Vite phải được nhận là immutable")
    const css = await c("GET", "/app/assets/index-Ca1b2C3d.css", { headers: local })
    includes(css.headers["cache-control"], "immutable", "css có hash → immutable")

    // 3. SPA fallback: MỌI route của TanStack Router trả index.html
    for (const route of ["/app/p/tet26/design", "/app/p/tet26/runs/r-0032", "/app/settings", "/app/setup"]) {
      const r = await c("GET", route, { headers: local })
      eq(r.status, 200, `${route} phải 200`)
      includes(r.text, "DẤU HIỆU REACT", `${route} trả index.html`)
      includes(r.text, 'src="/app/assets/index-BQq4Xy7z.js"', `${route}: asset vẫn trỏ tuyệt đối`)
    }

    // 4. file CÓ ĐUÔI mà không tồn tại → 404, KHÔNG trả index.html
    //    (trả HTML cho thẻ <script> sẽ thành lỗi MIME che mất lỗi build thật)
    const missing = await c("GET", "/app/assets/khong-ton-tai-abcdef12.js", { headers: local })
    eq(missing.status, 404, "asset thiếu phải 404 chứ không phải index.html")
    ok(!missing.text.includes("DẤU HIỆU REACT"), "KHÔNG được trả index.html cho file có đuôi")

    // 5. vẫn không đọc được file ngoài bundle
    const escape = await c("GET", "/app/../../../../etc/passwd", { headers: local })
    ok(!escape.text.includes("root:"), "không rò /etc/passwd")

    // 6. đúng ca CAO-01 trên chính bundle React: gọi /health không Origin
    const health = await c("GET", "/health", {
      headers: { host: CLIENT.host, "x-kitgen-client": "1", "sec-fetch-site": "same-origin" },
    })
    eq(health.status, 200, "bundle React gọi /health same-origin phải 200")

    await rmTemp(dist)
  })

  await it("BUNDLE VITE: dist thiếu index.html → rơi về bundle khác, KHÔNG trang trắng", async () => {
    const { mkdtemp } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const empty = await mkdtemp(join(tmpdir(), "kitgen-empty-"))
    const { resolveBundleRoot } = await import("../routes/app.mjs")
    const ws = { kitgenDir: join(wsRoot, ".kitgen") }
    const picked = await resolveBundleRoot(ws, empty)
    ok(picked !== empty, "dist rỗng (không index.html) KHÔNG được chọn làm bundle")
    await rmTemp(empty)
  })

  await it("/app/* KHÔNG đọc được file ngoài bundle", async () => {
    const r = await call("GET", "/app/../../../etc/passwd", { headers: { host: CLIENT.host, origin: `http://127.0.0.1:${PORT}` } })
    ok(!r.text.includes("root:"), "không rò /etc/passwd")
  })
  await it("/bridge.html chỉ postMessage tới origin trong allowlist", async () => {
    const good = await call("GET", `/bridge.html?o=${encodeURIComponent(PAGES)}`, { headers: { host: CLIENT.host } })
    eq(good.status, 200, "status")
    includes(good.text, PAGES, "target là origin đã duyệt")
    const bad = await call("GET", "/bridge.html?o=https://evil.example.com", { headers: { host: CLIENT.host } })
    ok(!bad.text.includes("evil.example.com"), "KHÔNG postMessage tới origin lạ")
    includes(bad.text, "const TARGET = null", "TARGET = null")
  })

  describe("không rò thông tin nhạy cảm")
  await it("redact xoá token/JWT/API key khỏi log", async () => {
    const { redactLine, looksSecret } = await import("../lib/redact.mjs")
    const samples = [
      "Authorization: Bearer sk-proj-AAAAAAAAAAAAAAAAAAAAAAAA",
      'refresh_token="1//0gAAAAAAAAAAAAAAAAAAAA"',
      "id_token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef",
      "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx",
    ]
    for (const s of samples) {
      const out = redactLine(s)
      ok(!looksSecret(out), `còn secret sau redact: ${out}`)
      includes(out, "redacted", "có nhãn redacted")
    }
  })
  await it("mọi response của phiên test không chứa /Users/ hay chuỗi secret", async () => {
    const probes = ["/health", "/api/doctor", "/api/workspaces", "/api/projects", "/api/trash", "/api/element-lib", "/api/codex/account", "/api/usage"]
    for (const p of probes) {
      const r = await api("GET", p)
      ok(!/\/Users\/[a-z]/i.test(r.text), `${p} rò đường dẫn tuyệt đối`)
      ok(!/sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{8,}\./.test(r.text), `${p} rò secret`)
    }
  })
  await it("doctor không đọc auth.json — đăng nhập hỏi chính codex; nơi DUY NHẤT được đọc là codex-account.mjs", async () => {
    /* Hợp đồng mới 24/08/2026: doctor xác định đăng nhập bằng mã thoát của
       `codex login status` (kể cả ca credential nằm keychain), tuyệt không mở file.
       codex-account.mjs là NGOẠI LỆ CÓ CHỦ ĐÍCH (quyết định chủ sản phẩm: hiện
       email/gói cước) — và ngoại lệ đó bị khoá bởi probe HTTP ở ca trên: response
       của /api/codex/account không được chứa token. */
    const src = await readFile(join(agentDir, "lib", "doctor.mjs"), "utf8")
    ok(!/readFile[^\n]*auth\.json|readFileSync[^\n]*auth\.json/.test(src), "doctor không đọc nội dung auth.json")
    includes(src, '"login", "status"', "đăng nhập hỏi chính codex, không đoán qua file")
    for (const f of ["doctor.mjs", "usage.mjs", "codex-login.mjs"]) {
      const s = await readFile(join(agentDir, "lib", f), "utf8")
      ok(!/readFile[^\n]*auth\.json/.test(s), `${f} không đọc auth.json`)
    }
  })

}
