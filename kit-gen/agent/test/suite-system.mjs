/* suite-system.mjs — §6.2 A (#1 /health, #2 /api/doctor, #3 /api/workspaces)
   + 9 lớp phòng thủ vận chuyển của architecture §3.4 (Host 421, Origin 403, ép preflight,
   không wildcard CORS, chỉ bind loopback). */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, eq, ok, includes, stripComments, PAGES, CLIENT } from "./harness.mjs"
import { PROTOCOL_VERSION } from "../server.mjs"
import { readRuntimeVersion } from "../lib/update.mjs"

/* Nhãn lệnh trả ra API ĐỔI THEO HỆ ĐIỀU HÀNH (lib/update.mjs: UPDATE_COMMAND /
   RESTART_COMMAND / UPDATE_LOG_LABEL) — trên Windows không có `~/.kitgen`.
   Ba hằng dưới đây ghim ĐÚNG CHỮ cho từng nền, KHÔNG import hằng của mã sản xuất
   (import vào thì ca kiểm chỉ còn tự nói với chính nó). Nhánh non-win giữ nguyên
   từng ký tự như trước. */
const WIN = process.platform === "win32"
const CMD_UPDATE  = WIN ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd update"  : "~/.kitgen/bin/kitgen update"
const CMD_RESTART = WIN ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd restart" : "~/.kitgen/bin/kitgen restart"
const LOG_UPDATE  = WIN ? "%LOCALAPPDATA%\\KitGen\\update.log"              : "~/.kitgen/update.log"

export async function run({ api, call, agent, agentDir, tmp, wsRoot }) {
  // ─────────────────────────────────────────── 1. HEALTH
  describe("health")
  await it("GET /health trả 200, protocol=1, không lộ đường dẫn tuyệt đối", async () => {
    const r = await api("GET", "/health")
    eq(r.status, 200, "status")
    eq(r.json.app, "kitgen-agent", "app")
    eq(r.json.protocol, 1, "protocol")
    eq(r.headers["x-kitgen-protocol"], "1", "X-KitGen-Protocol header")
    eq(r.json.version, PROTOCOL_VERSION, "version")
    ok(r.json.workspaceId.startsWith("ws_"), "workspaceId opaque")
    ok(!r.text.includes(tmp), `KHÔNG được chứa đường dẫn tuyệt đối: ${r.json.workspaceLabel}`)
    ok(!/\/Users\//.test(r.text), "không chứa /Users/")
  })

  /* P2-12: field `version` là đời KHUNG agent, KHÔNG BAO GIỜ là version bản phát hành.
     Luồng chờ sau update so version release ⇒ phải có field riêng nói đúng số đó,
     nếu không "cập nhật thành công" mãi mãi bị đọc thành "vẫn đang chạy bản 1.2.0". */
  await it("GET /health trả runtimeVersion = version BẢN PHÁT HÀNH, tách khỏi version khung", async () => {
    const r = await api("GET", "/health")
    const real = await readRuntimeVersion()
    ok("runtimeVersion" in r.json, "health phải có field runtimeVersion")
    eq(r.json.runtimeVersion, real, "runtimeVersion đúng bằng readRuntimeVersion()")
    ok(r.json.runtimeVersion !== PROTOCOL_VERSION,
      `runtimeVersion (${r.json.runtimeVersion}) KHÔNG được là version khung (${PROTOCOL_VERSION})`)
    ok(/^\d+\.\d+\.\d+/.test(String(r.json.runtimeVersion)), "trông như một version phát hành")
  })
  await it("GET /api/doctor chỉ trả enum + boolean, không có nội dung auth", async () => {
    const r = await api("GET", "/api/doctor")
    eq(r.status, 200, "status")
    ok(typeof r.json.imageGen.available === "boolean", "imageGen.available là boolean")
    ok(["default-home", "img-home", "profile-overlay", "unavailable", "unknown"].includes(r.json.imageGen.mode), "mode là enum")
    ok(!/auth_mode|access_token|refresh_token|id_token|sk-/.test(r.text), "không có field auth nào")
    ok(typeof r.json.workspace.writable === "boolean", "workspace.writable")
  })
  // ─────────────────────────────────────────── 1b. HỒ SƠ TẠO ẢNH (persist)
  describe("hồ sơ tạo ảnh")
  const configPath = join(wsRoot, ".kitgen", "config.json")
  const readConfig = () => JSON.parse(readFileSync(configPath, "utf8"))

  await it("PATCH /api/image-profile separate ghi bền imageGen vào .kitgen/config.json", async () => {
    const r = await api("PATCH", "/api/image-profile", { body: { mode: "separate" } })
    eq(r.status, 200, "status")
    eq(r.json.profile, "img-home", "profile")
    eq(r.json.mode, "separate", "mode")
    eq(r.json.codexHomeLabel, "~/.codex-img", "nhãn rút gọn, không phải path tuyệt đối")
    const cfg = readConfig()
    eq(cfg.imageGen, { mode: "img-home", codexHome: "~/.codex-img" }, "config đã lưu")
    ok(!/\/Users\//.test(r.text), "không trả đường dẫn tuyệt đối")
  })
  await it("PATCH /api/image-profile default XOÁ HẲN codexHome (không để sót IMG_HOME cũ)", async () => {
    const r = await api("PATCH", "/api/image-profile", { body: { mode: "default" } })
    eq(r.status, 200, "status")
    eq(r.json.profile, "default-home", "profile")
    const cfg = readConfig()
    eq(cfg.imageGen, { mode: "default-home" }, "config chỉ còn mode")
    ok(!("codexHome" in cfg.imageGen), "codexHome đã biến mất")
  })
  await it("PATCH /api/image-profile mode lạ bị 400, KHÔNG đụng vào config", async () => {
    await api("PATCH", "/api/image-profile", { body: { mode: "separate" } })
    const r = await api("PATCH", "/api/image-profile", { body: { mode: "~/.evil-home" } })
    eq(r.status, 400, "status")
    eq(r.json.error.code, "BAD_REQUEST", "code")
    eq(readConfig().imageGen.mode, "img-home", "config giữ nguyên giá trị hợp lệ trước đó")
    await api("PATCH", "/api/image-profile", { body: { mode: "default" } })
  })
  await it("doctor trả imageGen.profile theo lựa chọn đã lưu (enum, không phải path)", async () => {
    const { doctor } = await import("../lib/doctor.mjs")
    const ws = agent.registry.active
    await api("PATCH", "/api/image-profile", { body: { mode: "separate" } })
    const d1 = await doctor(ws, { refresh: true })
    eq(d1.imageGen.profile, "img-home", "profile sau khi chọn hồ sơ riêng")
    eq(d1.imageGen.codexHomeLabel, "~/.codex-img", "nhãn rút gọn")
    await api("PATCH", "/api/image-profile", { body: { mode: "default" } })
    const d2 = await doctor(ws, { refresh: true })
    eq(d2.imageGen.profile, "default-home", "profile sau khi về mặc định")
    eq(d2.imageGen.codexHomeLabel, "~/.codex", "nhãn rút gọn của home mặc định")
  })

  // ─────────────────────────────────────────── 1c. QUOTA CÒN LẠI (/api/usage)
  describe("usage / quota")
  {
    /* Fixture = một $CODEX_HOME giả với đúng hình dạng thật của rollout:
       một dòng hội thoại (KHÔNG được lọt ra ngoài) + hai dòng `token_count`, dòng
       sau mới là số đúng. `KITGEN_CODEX_HOME` chỉ tồn tại cho test. */
    const fakeHome = join(tmp, "codex-home")
    const day = join(fakeHome, "sessions", "2026", "08", "13")
    mkdirSync(day, { recursive: true })
    mkdirSync(join(fakeHome, "sessions", "2026", "08", "12"), { recursive: true })
    const evt = (usedPercent, resetsAt) => JSON.stringify({
      timestamp: "2026-08-13T09:00:24.138Z", type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          limit_id: "codex", plan_type: "plus",
          primary: { used_percent: usedPercent, window_minutes: 10080, resets_at: resetsAt },
          secondary: null,
        },
      },
    })
    writeFileSync(join(day, "rollout-2026-08-13T16-19-42-aaa.jsonl"), [
      JSON.stringify({ type: "response_item", payload: { type: "message", content: "MẬT KHẨU NGÂN HÀNG" } }),
      evt(1, 1787207428),
      evt(2, 1787207428),
    ].join("\n") + "\n")

    await it("GET /api/usage đọc rate_limits của lượt gần nhất, trả % CÒN LẠI", async () => {
      process.env.KITGEN_CODEX_HOME = fakeHome
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        eq(r.status, 200, "status")
        eq(r.json.ok, true, "ok")
        eq(r.json.primary.usedPercent, 2, "lấy bản ghi CUỐI trong file, không phải bản đầu")
        eq(r.json.primary.remainingPercent, 98, "% còn lại")
        eq(r.json.primary.windowMinutes, 10080, "cửa sổ tuần")
        eq(r.json.primary.resetsAt, new Date(1787207428 * 1000).toISOString(), "mốc reset dạng ISO")
        eq(r.json.plan, "plus", "gói cước là enum của server")
        ok(typeof r.json.observedAt === "string", "nói rõ số này quan sát lúc nào")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })
    await it("GET /api/usage KHÔNG mang theo nội dung hội thoại hay đường dẫn tuyệt đối", async () => {
      process.env.KITGEN_CODEX_HOME = fakeHome
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        ok(!r.text.includes("MẬT KHẨU"), "nội dung rollout KHÔNG được lọt ra client")
        ok(!/\/Users\/|\/private\/|\/tmp\//.test(r.text), `không có path tuyệt đối: ${r.text}`)
        ok(!/access_token|refresh_token|id_token|sk-/.test(r.text), "không có field auth nào")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })
    await it("home không có số liệu ⇒ 200 + ok:false + reason enum (không 500, không bịa số)", async () => {
      process.env.KITGEN_CODEX_HOME = join(tmp, "codex-home-empty")
      try {
        const r = await api("GET", "/api/usage?refresh=1")
        eq(r.status, 200, "status")
        eq(r.json.ok, false, "ok")
        ok(["NO_CODEX_HOME", "NO_SESSIONS", "NO_DATA"].includes(r.json.reason), `reason là enum: ${r.json.reason}`)
        eq(r.json.primary, null, "KHÔNG bịa số phần trăm")
      } finally { delete process.env.KITGEN_CODEX_HOME }
    })
  }

  describe("health")
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
      eq(r.json.updateCommand, CMD_UPDATE, "lệnh cập nhật thủ công")
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
  /* ══════════════════════════════════════════════════════════════════════════
     BACKLOG #20 — CÀI XONG NHƯNG KHÔNG KHỞI ĐỘNG LẠI (máy chủ SP, 14/08).
     Symlink `current` đã trỏ bản mới, tiến trình agent vẫn là bản cũ. /health 200,
     /api/update vẫn "có bản mới" ⇒ user đọc thành "update hỏng", cài lại vô ích.
     Dựng lại đúng hiện trường: đĩa có 9.9.9, tiến trình khai 2.1.20.
     ══════════════════════════════════════════════════════════════════════════ */
  await it("cài xong mà tiến trình vẫn bản cũ ⇒ restartRequired + lệnh khởi động lại", async () => {
    const fakeHome = join(tmp, "kitgen-home-stale")
    mkdirSync(join(fakeHome, "current"), { recursive: true })
    writeFileSync(join(fakeHome, "current", "VERSION"), "9.9.9\n")
    const originalHome = process.env.KITGEN_HOME
    const originalVersion = agent.state.runtimeVersion
    const originalFetch = globalThis.fetch
    process.env.KITGEN_HOME = fakeHome
    agent.state.runtimeVersion = "2.1.20"
    globalThis.fetch = async () => new Response(JSON.stringify({
      version: "9.9.9", archive: "https://example.test/kitgen-runtime-9.9.9.tar.gz",
    }), { status: 200, headers: { "content-type": "application/json" } })
    try {
      const r = await api("GET", "/api/update")
      eq(r.status, 200, "status")
      eq(r.json.currentVersion, "2.1.20", "version ĐANG CHẠY là của tiến trình, không phải của đĩa")
      eq(r.json.installedVersion, "9.9.9", "version ĐÃ CÀI đọc qua symlink current")
      eq(r.json.restartRequired, true, "trạng thái lỗi rõ, không im lặng nửa vời")
      eq(r.json.restartCommand, CMD_RESTART, "lệnh chữa, dạng nhãn rút gọn")
      ok(!/\/Users\/|kitgen-home-stale/.test(r.text), "không lộ đường dẫn tuyệt đối")
    } finally {
      globalThis.fetch = originalFetch
      agent.state.runtimeVersion = originalVersion
      if (originalHome === undefined) delete process.env.KITGEN_HOME; else process.env.KITGEN_HOME = originalHome
    }
  })
  await it("restartRequired KHÔNG bật khi đĩa và tiến trình cùng một bản (99,9% số lần)", async () => {
    const fakeHome = join(tmp, "kitgen-home-fresh")
    mkdirSync(join(fakeHome, "current"), { recursive: true })
    writeFileSync(join(fakeHome, "current", "VERSION"), "2.1.20\n")
    const originalHome = process.env.KITGEN_HOME
    const originalVersion = agent.state.runtimeVersion
    const originalFetch = globalThis.fetch
    process.env.KITGEN_HOME = fakeHome
    agent.state.runtimeVersion = "2.1.20"
    globalThis.fetch = async () => { throw new TypeError("fetch failed") }
    try {
      const r = await api("GET", "/api/update")
      eq(r.json.ok, false, "mất mạng")
      eq(r.json.restartRequired, false, "không đổ oan là phải khởi động lại")
      // Mất mạng KHÔNG được che mất ca cài-xong-chưa-restart: số này đọc từ đĩa.
      eq(r.json.installedVersion, "2.1.20", "vẫn đọc được bản đã cài dù manifest hỏng")
    } finally {
      globalThis.fetch = originalFetch
      agent.state.runtimeVersion = originalVersion
      if (originalHome === undefined) delete process.env.KITGEN_HOME; else process.env.KITGEN_HOME = originalHome
    }
  })
  await it("POST /api/update ghi nhật ký ra file và tách hẳn session (không tự giết mình)", async () => {
    const fakeHome = join(tmp, "kitgen-home-spawn")
    mkdirSync(fakeHome, { recursive: true })
    const calls = []
    const fake = { on() {}, unref() {} }
    const { scheduleUpdate } = await import("../lib/update.mjs")
    const out = scheduleUpdate({
      kitgenHome: fakeHome,
      spawnImpl: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return fake },
    })
    eq(calls.length, 1, "có spawn installer")
    eq(calls[0].opts.detached, true, "detached: installer phải sống sót khi launchd giết job")
    ok(Array.isArray(calls[0].opts.stdio), "stdio đi vào file, KHÔNG còn 'ignore'")
    ok(typeof calls[0].opts.stdio[1] === "number", "stdout là fd của update.log")
    eq(out.logLabel, LOG_UPDATE, "nhãn nhật ký rút gọn cho UI")
    const log = readFileSync(join(fakeHome, "update.log"), "utf8")
    ok(/kitgen update/.test(log), `update.log có dòng mở đầu: ${log}`)
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
