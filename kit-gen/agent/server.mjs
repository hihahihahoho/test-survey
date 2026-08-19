#!/usr/bin/env node
/* ============================================================================
   server.mjs — kit-gen local agent. Node stdlib thuần, KHÔNG dependency ngoài.

   Vai: NƠI DUY NHẤT được chạm ổ đĩa và spawn tiến trình (architecture §1.1-B).
   Bind 127.0.0.1 VÀ [::1], KHÔNG BAO GIỜ 0.0.0.0 (§3.4 lớp 1).
   React và API cùng chạy tại http://127.0.0.1:8765/app/ (same-origin).
   Bundle ưu tiên webapp/dist (React build), rơi về web/ nếu chưa build.

   Chạy:   node agent/server.mjs [--workspace <path>] [--port 8765]
                                 [--origin http://localhost:5173] [--allow-cli]
   Xem thêm: agent/README.md
   ========================================================================== */
import { createServer } from "node:http"
import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { realpathSync } from "node:fs"
import { platform } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { AgentError, toAgentError } from "./lib/errors.mjs"
import { sendJson, sendText, sendEmpty, sendError, sendFile } from "./lib/http.mjs"
import { shortenPath, redactLine } from "./lib/redact.mjs"
import {
  buildOriginAllowlist, buildHostAllowlist, checkHost, checkOrigin,
  checkClientHeader, corsHeaders, makeRateLimiter, readBody, readJson,
} from "./lib/security.mjs"
import { Router } from "./lib/router.mjs"
import { WorkspaceRegistry, defaultWorkspaceRoot } from "./lib/workspace.mjs"
import { doctor as realDoctor } from "./lib/doctor.mjs"
import { RunStore, sweepOrphanRuns } from "./lib/runs.mjs"
import { Uploads } from "./lib/uploads.mjs"
import { ConfirmCodes } from "./lib/confirm.mjs"
import { register as registerSystem } from "./routes/system.mjs"
import { register as registerSettings } from "./routes/settings.mjs"
import { register as registerProjects } from "./routes/projects.mjs"
import { register as registerContract } from "./routes/contract.mjs"
import { register as registerRefs } from "./routes/refs.mjs"
import { register as registerRuns } from "./routes/runs.mjs"
import { register as registerFiles } from "./routes/files.mjs"
import { register as registerCover } from "./routes/cover.mjs"
import { register as registerDocs } from "./routes/docs.mjs"
import { register as registerApp } from "./routes/app.mjs"
import { register as registerLibrary } from "./routes/library.mjs"
import { sweepOrphanCovers } from "./lib/cover.mjs"
import { readRuntimeVersion } from "./lib/update.mjs"
import { defaultKitgenHome } from "./lib/platform.mjs"
import { acquireInstanceLock, releaseInstanceLock } from "./lib/instance-lock.mjs"

/**
 * VERSION NỘI BỘ CỦA BUNDLE AGENT — **KHÔNG PHẢI** version bản phát hành.
 *
 * Tên cũ của hằng này là `VERSION`, và cái tên đó đã tốn của người dùng một lượt cập
 * nhật: `/health` trả nó ở field `version`, luồng chờ sau update lại so field đó với
 * version RELEASE (2.1.x) ⇒ cài xong vẫn báo "vẫn đang chạy bản 1.2.0". Số này chưa
 * bao giờ được bump và cũng KHÔNG nên bump theo release: nó chỉ đánh dấu đời của bộ
 * khung agent. Version thật của runtime đọc bằng `readRuntimeVersion()` (file VERSION
 * của bản đã cài → `webapp/package.json` khi chạy từ source) và đi ra `/health` ở field
 * `runtimeVersion`. Đặt tên PROTOCOL_VERSION để đời sau không lặp lại nhầm lẫn đó.
 */
export const PROTOCOL_VERSION = "1.2.0"
export const BUILD_ID = "agent-" + PROTOCOL_VERSION

/** Trần kích thước body (§3.4 lớp 9). Vượt → 413 TOO_LARGE. */
const DEFAULT_LIMITS = { json: 25 << 20, upload: 200 << 20, refFile: 20 << 20 }
const MAX_REPLAY_BYTES = 4 * 1024 * 1024
/** Điều hướng TOP-LEVEL của trình duyệt (thanh địa chỉ, popup cầu dò, tải bundle /app/):
 *  không có header Origin và không thể thêm header tuỳ biến → miễn 2 lớp đó.
 *  An toàn vì: (a) vẫn kiểm Host + rate limit; (b) các đường này KHÔNG trả CORS header nên
 *  trang khác origin không đọc được nội dung; (c) bridge.html chỉ postMessage tới allowlist. */
const PUBLIC_PATHS = ["/bridge.html", "/app", "/favicon.ico"]
/** Gốc site — KHỚP CHÍNH XÁC, không phải tiền tố. Nếu để "/" vào PUBLIC_PATHS ở trên thì
 *  luật `startsWith(x + "/")` biến "//api/..." thành công khai; ở đây chỉ đúng một chuỗi
 *  "/" được miễn, và thứ duy nhất nó phục vụ là 302 sang /app/ (routes/app.mjs). */
const ROOT_PATHS = new Set(["/"])
const isPublicPath = p =>
  ROOT_PATHS.has(p) || PUBLIC_PATHS.some(x => p === x || p.startsWith(x + "/") || p.startsWith(x + "?"))

const ADJ = ["gray", "quiet", "brave", "warm", "swift", "calm", "bright", "clever"]
const ANIMAL = ["otter", "heron", "ibis", "lynx", "marten", "gecko", "sparrow", "tapir"]
function instanceLabel() {
  const r = randomBytes(2)
  return `${ADJ[r[0] % ADJ.length]}-${ANIMAL[r[1] % ANIMAL.length]}`
}

export function parseArgs(argv) {
  const out = { origins: [], allowCli: false, ports: null, workspaces: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => argv[++i]
    if (a === "--workspace" || a === "-w") out.workspaces.push(resolve(val()))
    else if (a === "--port" || a === "-p") out.port = Number(val())
    else if (a === "--origin") out.origins.push(val())
    else if (a === "--allow-cli") out.allowCli = true
    else if (a === "--app-root") out.appRoot = resolve(val())
    else if (a === "--help" || a === "-h") out.help = true
  }
  if (process.env.KITGEN_ORIGINS) out.origins.push(...process.env.KITGEN_ORIGINS.split(",").map(s => s.trim()).filter(Boolean))
  if (process.env.KITGEN_PORT) out.port ??= Number(process.env.KITGEN_PORT)
  if (process.env.KITGEN_ALLOW_CLI === "1") out.allowCli = true
  return out
}

const HELP = `kitgen-agent ${PROTOCOL_VERSION}

  node agent/server.mjs [tuỳ chọn]

  --workspace <path>   thư mục làm việc (lặp lại để khai nhiều workspace). Mặc định ~/KitGen
  --port <n>           cổng loopback. Mặc định 8765; cổng bận thì thoát rõ lỗi
  --origin <url>       thêm origin vào allowlist CORS (lặp lại được)
  --allow-cli          cho phép request KHÔNG có header Origin (curl của chính bạn)
  --app-root <path>    thư mục bundle giao diện phục vụ tại /app/
                       mặc định dò: <ws>/.kitgen/app → ../webapp/dist → ../web
  -h, --help           bản trợ giúp này

  Chỉ bind 127.0.0.1 và [::1]. KHÔNG BAO GIỜ 0.0.0.0.
`

/** Xây app (dùng được cả trong test: trả server chưa listen). */
export async function createAgent(opts = {}) {
  const cliWorkspaces = opts.workspaces?.length ? opts.workspaces : []
  const activeRoot = cliWorkspaces[0] ?? defaultWorkspaceRoot()
  const registry = new WorkspaceRegistry(cliWorkspaces, activeRoot)
  /* /health chạy định kỳ, kể cả trong lúc installer đang chép runtime. Không được
     quét đĩa trong request này: một workspace lớn + I/O tranh chấp đủ làm client cũ
     timeout 1,2s, rồi kết luận nhầm agent đã restart. Đếm project một lần lúc boot,
     sau đó làm mới nền; health luôn trả snapshot gần nhất. */
  const healthProjectCounts = new Map()
  const healthProjectAt = new Map()
  const healthProjectRefresh = new Map()
  for (const w of registry.map.values()) {
    await w.init()
    /* Job vẽ bìa chỉ sống trong Map bộ nhớ của tiến trình này (lib/cover.mjs). Tiến trình
       TRƯỚC chết giữa lúc vẽ (update, reboot, kill) thì cover.json còn nguyên "running"
       mà không còn ai chạy — UI quay vòng vĩnh viễn. Boot là chỗ DUY NHẤT biết chắc
       "không job nào của lượt trước còn sống", nên dọn ở đây. KHÔNG được ném: một
       workspace hỏng quyền đọc không đáng để agent không khởi động nổi. */
    await sweepOrphanCovers(w).catch(() => {})
    /* Cùng lý do, cho LƯỢT CHẠY: `run.json` còn "running" mà tiến trình chủ của nó đã
       chết ⇒ web quay vòng vĩnh viễn. Quét dọn + nhặt lại ảnh đã tốn quota (lib/runs.mjs). */
    await sweepOrphanRuns(w).catch(() => {})
    healthProjectCounts.set(w.id, await w.countProjects().catch(() => 0))
    healthProjectAt.set(w.id, Date.now())
  }

  const refreshHealthProjectCount = (ws, force = false) => {
    const now = Date.now()
    const at = healthProjectAt.get(ws.id) ?? 0
    if (!force && (healthProjectRefresh.has(ws.id) || now - at < 5000)) return
    healthProjectAt.set(ws.id, now)
    const pending = ws.countProjects()
      .then(n => healthProjectCounts.set(ws.id, n))
      .catch(() => {})
      .finally(() => healthProjectRefresh.delete(ws.id))
    healthProjectRefresh.set(ws.id, pending)
  }
  const healthProjectCount = (ws, force = false) => {
    refreshHealthProjectCount(ws, force)
    return healthProjectCounts.get(ws.id) ?? 0
  }

  /* Đọc MỘT LẦN lúc boot, không đọc lại mỗi nhịp /health: file VERSION chỉ đổi khi bản
     mới được cài, mà cài xong thì tiến trình này đã bị thay bằng tiến trình khác. */
  const runtimeVersion = await readRuntimeVersion().catch(() => null)

  const label = instanceLabel()
  const confirm = new ConfirmCodes(opts.print ?? (s => process.stdout.write(String(s) + "\n")))
  let runs = new RunStore(registry.active)
  let uploads = new Uploads(registry.active)

  const router = new Router()
  registerSystem(router)
  registerSettings(router)
  registerProjects(router)
  registerContract(router)
  registerRefs(router)
  registerRuns(router)
  registerFiles(router)
  registerCover(router)
  registerDocs(router)
  registerLibrary(router)
  registerApp(router)

  const LIMITS = { ...DEFAULT_LIMITS, ...(opts.limits ?? {}) }
  /* `runtimeVersion` nằm trong `state` (chứ không phải một const đóng kín trong closure)
     vì test phải giả lập được "tiến trình đang chạy bản X" — ca cài-xong-chưa-restart
     không dựng lại được bằng cách nào khác trong một process duy nhất. */
  const state = { port: opts.port ?? 8765, runtimeVersion }
  const kitgenHome = opts.kitgenHome
  // Hai bucket: API (thao tác thật) và đọc tĩnh (/app/* + files/*). Xem makeRateLimiter.
  const rate = makeRateLimiter({
    limit: Number(opts.rateLimit ?? 20), windowMs: 1000,
    staticLimit: opts.staticRateLimit !== undefined ? Number(opts.staticRateLimit) : null,
  })

  function origins() {
    return buildOriginAllowlist({
      port: state.port,
      ports: [state.port, state.port + 1, state.port + 2, 8765, 8766, 8767],
      extraOrigins: opts.origins ?? [],
    })
  }

  const server = createServer(async (req, res) => {
    let origin = null
    try {
      const url = new URL(req.url, `http://127.0.0.1:${state.port}`)
      const originSet = origins()

      // ── lớp bảo mật, đúng thứ tự ───────────────────────────────────────────
      checkHost(req, { port: state.port, hostAllowlist: buildHostAllowlist(state.port) })
      const publicPath = isPublicPath(url.pathname)
      // CAO-01: KHÔNG còn miễn trừ mù cho publicPath. checkOrigin tự phán theo Sec-Fetch-Site
      // (header trình duyệt đặt, JS không giả mạo được) — xem chú thích trong security.mjs.
      origin = checkOrigin(req, { origins: originSet, allowCli: opts.allowCli === true, publicPath })
      rate(url.pathname)

      if (req.method === "OPTIONS") return sendEmpty(res, 204, corsHeaders(origin))
      if (!publicPath) checkClientHeader(req, { publicPaths: [], pathname: url.pathname })

      const hit = router.match(req.method, url.pathname)
      if (hit === null) throw new AgentError("NOT_FOUND", `no route for ${req.method} ${url.pathname}`)
      if (hit === "METHOD") throw new AgentError("METHOD_NOT_ALLOWED", `${req.method} not allowed on ${url.pathname}`)

      const ctx = {
        req, res, url, params: hit.params, registry, runs, uploads, confirm,
        origins: originSet, limits: LIMITS, version: PROTOCOL_VERSION, runtimeVersion: state.runtimeVersion, buildId: BUILD_ID,
        kitgenHome,
        instanceLabel: label, appRootOverride: opts.appRoot ?? null,
        doctor: opts.doctor ?? realDoctor,
        healthProjectCount,
        json: () => readJson(req, { limit: LIMITS.json }),
        body: limit => readBody(req, { limit: limit ?? LIMITS.json }),
        reveal: revealInFinder,
        onWorkspaceChange: ws => {
          runs = new RunStore(ws)
          uploads.dispose().catch(() => {})
          uploads = new Uploads(ws)
        },
      }
      const out = await hit.handler(ctx)
      await respond(res, out, corsHeaders(origin), req)
    } catch (err) {
      const e = toAgentError(err, shortenPath)
      if (e.status >= 500) process.stderr.write(`[agent] ${redactLine(e.message)}\n`)
      sendError(res, e, corsHeaders(origin))
    }
  })

  server.on("clientError", (err, socket) => {
    try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n") } catch { /* socket đã chết */ }
  })

  return {
    server, registry, state, confirm, limits: LIMITS,
    get runs() { return runs }, instanceLabel: label, origins,
    /* Test hook nội bộ: dựng một lượt quét đĩa chậm mà không mở thêm API. */
    healthProjectCount,
    get runtimeVersion() { return state.runtimeVersion },
  }
}

async function respond(res, out, headers, req) {
  if (!out) return sendEmpty(res, 204, headers)
  const h = { ...headers, ...(out.headers ?? {}) }
  if (out.status === 204) return sendEmpty(res, 204, h)
  if (out.status === 302) return sendEmpty(res, 302, h)
  if (out.status === 304) return sendEmpty(res, 304, h)
  if (out.ndjson) return streamNdjson(res, out.ndjson, h)
  if (out.file) return sendFile(res, out.file, { headers: h, req })
  if (out.buffer) {
    res.writeHead(out.status ?? 200, { "Content-Length": out.buffer.length, ...h })
    return res.end(out.buffer)
  }
  if (out.html) {
    // mặc định no-store, nhưng route được quyền tự khai (bundle /app/ dùng no-cache theo R14)
    return sendText(res, out.status ?? 200, out.html,
      { "Cache-Control": "no-store", ...h, "Content-Type": "text/html; charset=utf-8" })
  }
  if (out.text !== undefined) return sendText(res, out.status ?? 200, out.text, h)
  return sendJson(res, out.status ?? 200, out.json ?? {}, h)
}

/** #35 — NDJSON chunked. Client giữ lastSeq, mất kết nối thì ?from=lastSeq+1. */
async function streamNdjson(res, { found, from }, headers) {
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
    ...headers,
  })
  const write = ev => { if (!res.writableEnded) res.write(JSON.stringify(ev) + "\n") }
  const past = found.handle ? await found.handle.replay(from) : await replayFromDisk(found.dir, from)
  for (const e of past) write(e)
  if (!found.handle || found.handle.finished) {
    if (found.run?.status && !past.some(e => e.type === "run.finished")) {
      write({ seq: found.run.seq ?? past.length, t: new Date().toISOString(), type: "run.finished", status: found.run.status, ok: found.run.progress?.done ?? 0, failed: found.run.progress?.failed ?? 0 })
    }
    return res.end()
  }
  const seen = new Set(past.map(e => e.seq))
  const off = found.handle.subscribe(ev => {
    if (ev === null) { if (!res.writableEnded) res.end(); return }
    if (ev.seq < from || seen.has(ev.seq)) return
    write(ev)
  }, from)
  res.on("close", off)
}

async function replayFromDisk(dir, from) {
  const { readTailFile, exists } = await import("./lib/fsx.mjs")
  const { join } = await import("node:path")
  const f = join(dir, "events.ndjson")
  if (!(await exists(f))) return []
  const out = []
  const raw = await readTailFile(f, MAX_REPLAY_BYTES)
  for (const l of raw.split("\n")) {
    if (!l.trim()) continue
    try { const e = JSON.parse(l); if (e.seq >= from) out.push(e) } catch { /* dòng cụt */ }
  }
  return out
}

function revealInFinder(dir) {
  // Windows: explorer.exe TRẢ EXIT CODE 1 kể cả khi mở thư mục thành công (hành vi có
  // tài liệu từ lâu của shell Windows) ⇒ phán theo `err` là luôn báo NOT_SUPPORTED oan.
  // Chỉ coi lỗi spawn (ENOENT) là thất bại.
  if (platform() === "win32") {
    return new Promise(ok => {
      const child = execFile("explorer.exe", [dir], () => { /* mã thoát không đáng tin */ })
      child.on("error", () => ok(false))
      child.on("spawn", () => ok(true))
    })
  }
  const cmd = platform() === "darwin" ? "open" : platform() === "linux" ? "xdg-open" : null
  if (!cmd) return Promise.resolve(false)
  return new Promise(ok => execFile(cmd, [dir], err => ok(!err)))
}

/** Bind đúng một cổng loopback. Cổng bận là lỗi khởi động, KHÔNG dò cổng kế tiếp:
 * dò cổng tạo nhiều agent cùng lúc sau update/startup, làm sai health check và tích
 * luỹ RAM/handle. KHÔNG BAO GIỜ 0.0.0.0. */
export function listenLoopback(server, startPort) {
  return new Promise((ok, err) => {
    const onErr = e => {
      server.removeListener("error", onErr)
      if (e?.code === "EADDRINUSE" || e?.code === "EACCES") {
        e.code = e.code === "EACCES" ? "KITGEN_PORT_UNAVAILABLE" : "KITGEN_PORT_IN_USE"
        e.port = startPort
        e.message = `KitGen agent khong khoi dong duoc: cong ${startPort} dang bi chiem. ` +
          "Dung ban agent dang chay roi thu lai; khong tu dong doi sang cong khac."
      }
      err(e)
    }
    server.once("error", onErr)
    server.listen({ host: "127.0.0.1", port: startPort, ipv6Only: false }, () => {
      server.removeListener("error", onErr)
      ok(startPort)
    })
  })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { process.stdout.write(HELP); return }
  const instance = acquireInstanceLock({ kitgenHome: opts.kitgenHome ?? defaultKitgenHome() })
  try {
    const agent = await createAgent(opts)
    const port = await listenLoopback(agent.server, opts.port ?? 8765)
    agent.state.port = port

    // Listener thứ hai cho [::1]: `localhost` trên nhiều máy phân giải ra ::1 TRƯỚC;
    // không bind thì user gặp ECONNREFUSED khó hiểu (architecture §3.1). Cùng handler, cùng phòng thủ.
    const v6 = await listenIpv6(agent.server, port)

    const ws = agent.registry.active
    process.stdout.write([
      ``,
      // Dòng banner nói VERSION BẢN PHÁT HÀNH trước (thứ người dùng đối chiếu khi update),
      // protocol chỉ là chú thích kỹ thuật đứng sau.
      `  kitgen-agent ${agent.runtimeVersion ?? "(source)"} · protocol ${PROTOCOL_VERSION} · ${agent.instanceLabel}`,
      `  http://127.0.0.1:${port}          (API cho web tĩnh)`,
      `  http://127.0.0.1:${port}/app/     (bản chạy tại máy — same-origin)`,
      v6 ? `  http://[::1]:${port}              (IPv6 loopback)` : `  [::1] không bind được (chỉ IPv4)`,
      `  thư mục làm việc: ${ws.label}`,
      `  origin cho phép : ${[...agent.origins()].filter(o => !o.startsWith("http://127")).join(", ") || "(chỉ loopback)"}`,
      ``,
    ].join("\n"))

    const bye = async () => {
      process.stdout.write("\n  đang dừng agent…\n")
      releaseInstanceLock(instance)
      process.exit(0)
    }
    process.on("SIGINT", bye)
    process.on("SIGTERM", bye)
    process.on("exit", () => releaseInstanceLock(instance))
  } catch (e) {
    releaseInstanceLock(instance)
    throw e
  }
}

/** Bind [::1] và đẩy request sang chính handler của server chính. */
export async function listenIpv6(mainServer, port) {
  const handler = mainServer.listeners("request")[0]
  if (!handler) return null
  const s = createServer(handler)
  return new Promise(ok => {
    s.on("error", () => ok(null))
    s.listen({ host: "::1", port, ipv6Only: true }, () => ok(s))
  })
}

/* "Có phải file này đang được chạy trực tiếp không?"
   `file://${argv[1]}` KHÔNG BAO GIỜ khớp trên Windows: import.meta.url ở đó là
   `file:///C:/…` (ba gạch + ổ đĩa) còn argv[1] là `C:\…`. Hậu quả nếu bỏ qua:
   `node server.mjs` chạy xong mà KHÔNG bao giờ gọi main() — agent im lặng không
   lắng nghe cổng nào, không một dòng lỗi. Nhánh mới GATE win32 để so sánh trên
   darwin/linux giữ nguyên từng ký tự. */
const argv1 = process.argv[1] ?? ""
const realpathOrNull = value => {
  try { return realpathSync(value) } catch { return null }
}
const argvReal = realpathOrNull(argv1)
const moduleReal = realpathOrNull(fileURLToPath(import.meta.url))
const isMainByRealpath = Boolean(argvReal && moduleReal && argvReal === moduleReal)
const isMainModule = isMainByRealpath || import.meta.url === `file://${argv1}` ||
  (process.platform === "win32" && argv1 !== "" && import.meta.url === pathToFileURL(argv1).href)
const looksLikeAgentEntry = argv1 !== "" && basename(argv1) === basename(fileURLToPath(import.meta.url)) &&
  basename(dirname(argv1)).toLowerCase() === "agent"
if (!isMainModule && looksLikeAgentEntry) {
  process.stderr.write(`[agent] entrypoint khong khop sau khi giai lien ket: ${argv1}; agent se khong chay\n`)
  process.exit(1)
}
if (isMainModule) main().catch(e => {
  process.stderr.write(`[agent] không khởi động được: ${redactLine(String(e?.message ?? e))}\n`)
  process.exit(1)
})
