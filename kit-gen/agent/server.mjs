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
import { platform } from "node:os"
import { resolve } from "node:path"

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
import { RunStore } from "./lib/runs.mjs"
import { Uploads } from "./lib/uploads.mjs"
import { ConfirmCodes } from "./lib/confirm.mjs"
import { register as registerSystem } from "./routes/system.mjs"
import { register as registerProjects } from "./routes/projects.mjs"
import { register as registerContract } from "./routes/contract.mjs"
import { register as registerRefs } from "./routes/refs.mjs"
import { register as registerRuns } from "./routes/runs.mjs"
import { register as registerFiles } from "./routes/files.mjs"
import { register as registerDocs } from "./routes/docs.mjs"
import { register as registerApp } from "./routes/app.mjs"

export const VERSION = "1.2.0"
export const BUILD_ID = "agent-" + VERSION

/** Trần kích thước body (§3.4 lớp 9). Vượt → 413 TOO_LARGE. */
const DEFAULT_LIMITS = { json: 25 << 20, upload: 200 << 20, refFile: 20 << 20 }
/** Điều hướng TOP-LEVEL của trình duyệt (thanh địa chỉ, popup cầu dò, tải bundle /app/):
 *  không có header Origin và không thể thêm header tuỳ biến → miễn 2 lớp đó.
 *  An toàn vì: (a) vẫn kiểm Host + rate limit; (b) các đường này KHÔNG trả CORS header nên
 *  trang khác origin không đọc được nội dung; (c) bridge.html chỉ postMessage tới allowlist. */
const PUBLIC_PATHS = ["/bridge.html", "/app", "/favicon.ico"]
const isPublicPath = p => PUBLIC_PATHS.some(x => p === x || p.startsWith(x + "/") || p.startsWith(x + "?"))

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

const HELP = `kitgen-agent ${VERSION}

  node agent/server.mjs [tuỳ chọn]

  --workspace <path>   thư mục làm việc (lặp lại để khai nhiều workspace). Mặc định ~/KitGen
  --port <n>           cổng bắt đầu dò. Mặc định 8765 (dò 8765→8766→8767…)
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
  for (const w of registry.map.values()) await w.init()

  const label = instanceLabel()
  const confirm = new ConfirmCodes(opts.print ?? (s => process.stdout.write(String(s) + "\n")))
  let runs = new RunStore(registry.active)
  let uploads = new Uploads(registry.active)

  const router = new Router()
  registerSystem(router)
  registerProjects(router)
  registerContract(router)
  registerRefs(router)
  registerRuns(router)
  registerFiles(router)
  registerDocs(router)
  registerApp(router)

  const LIMITS = { ...DEFAULT_LIMITS, ...(opts.limits ?? {}) }
  const state = { port: opts.port ?? 8765 }
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
        origins: originSet, limits: LIMITS, version: VERSION, buildId: BUILD_ID,
        instanceLabel: label, appRootOverride: opts.appRoot ?? null,
        doctor: opts.doctor ?? realDoctor,
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

  return { server, registry, state, confirm, limits: LIMITS, get runs() { return runs }, instanceLabel: label, origins }
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
  const { readFile, exists } = await import("./lib/fsx.mjs")
  const { join } = await import("node:path")
  const f = join(dir, "events.ndjson")
  if (!(await exists(f))) return []
  const out = []
  for (const l of (await readFile(f, "utf8")).split("\n")) {
    if (!l.trim()) continue
    try { const e = JSON.parse(l); if (e.seq >= from) out.push(e) } catch { /* dòng cụt */ }
  }
  return out
}

function revealInFinder(dir) {
  const cmd = platform() === "darwin" ? "open" : platform() === "linux" ? "xdg-open" : null
  if (!cmd) return Promise.resolve(false)
  return new Promise(ok => execFile(cmd, [dir], err => ok(!err)))
}

/** Bind loopback IPv4 + IPv6, dò cổng lên nếu bận. KHÔNG BAO GIỜ 0.0.0.0. */
export function listenLoopback(server, startPort, tries = 8) {
  return new Promise((ok, err) => {
    let port = startPort
    let left = tries
    const attempt = () => {
      const onErr = e => {
        server.removeListener("error", onErr)
        if ((e.code === "EADDRINUSE" || e.code === "EACCES") && --left > 0) { port += 1; attempt() }
        else err(e)
      }
      server.once("error", onErr)
      server.listen({ host: "127.0.0.1", port, ipv6Only: false }, () => {
        server.removeListener("error", onErr)
        ok(port)
      })
    }
    attempt()
  })
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) { process.stdout.write(HELP); return }
  const agent = await createAgent(opts)
  const port = await listenLoopback(agent.server, opts.port ?? 8765)
  agent.state.port = port

  // Listener thứ hai cho [::1]: `localhost` trên nhiều máy phân giải ra ::1 TRƯỚC;
  // không bind thì user gặp ECONNREFUSED khó hiểu (architecture §3.1). Cùng handler, cùng phòng thủ.
  const v6 = await listenIpv6(agent.server, port)

  const ws = agent.registry.active
  process.stdout.write([
    ``,
    `  kitgen-agent ${VERSION} · ${agent.instanceLabel}`,
    `  http://127.0.0.1:${port}          (API cho web tĩnh)`,
    `  http://127.0.0.1:${port}/app/     (bản chạy tại máy — same-origin)`,
    v6 ? `  http://[::1]:${port}              (IPv6 loopback)` : `  [::1] không bind được (chỉ IPv4)`,
    `  thư mục làm việc: ${ws.label}`,
    `  origin cho phép : ${[...agent.origins()].filter(o => !o.startsWith("http://127")).join(", ") || "(chỉ loopback)"}`,
    ``,
  ].join("\n"))

  const bye = async () => { process.stdout.write("\n  đang dừng agent…\n"); process.exit(0) }
  process.on("SIGINT", bye)
  process.on("SIGTERM", bye)
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

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => {
  process.stderr.write(`[agent] không khởi động được: ${redactLine(String(e?.message ?? e))}\n`)
  process.exit(1)
})
