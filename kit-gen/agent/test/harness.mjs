/* test/harness.mjs — bộ khung test dùng chung: runner nhỏ + transport trong bộ nhớ.
 *
 * GHI CHÚ TRUNG THỰC về cách nối: môi trường chạy test này CHẶN bind TCP
 * (`listen EPERM` cho cả 127.0.0.1 và unix socket — đã kiểm bằng lệnh thật).
 * Vì vậy test lái ĐÚNG `http.Server` thật của agent qua một cặp duplex trong bộ nhớ:
 * request đi qua nguyên HTTP parser của Node + toàn bộ pipeline (Host → Origin →
 * header ép preflight → rate limit → router → fs → spawn tiến trình).
 * Chỉ tầng vận chuyển TCP là không kiểm được ở đây; `listenLoopback` / `listenIpv6`
 * được kiểm bằng đọc mã (ca "agent chỉ bind loopback").
 */
import http from "node:http"
import { Duplex } from "node:stream"

export const PORT = 8765
export const PAGES = "https://kitgen.pages.dev"
export const CLIENT = { host: `127.0.0.1:${PORT}`, origin: PAGES, "x-kitgen-client": "1" }
export const CASE_TIMEOUT_MS = 25000

const results = []
let group = ""

export function describe(name) { group = name }

export async function it(name, fn) {
  const label = group ? `${group} › ${name}` : name
  let timer
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`hết ${CASE_TIMEOUT_MS}ms`)), CASE_TIMEOUT_MS) }),
    ])
    results.push({ label, ok: true })
  } catch (e) { results.push({ label, ok: false, err: e }) }
  finally { clearTimeout(timer) }
}

export function eq(actual, expected, what = "value") {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`)
}
export function ok(cond, msg) { if (!cond) throw new Error(msg ?? "expected truthy") }
export function includes(hay, needle, what = "text") {
  if (!String(hay).includes(needle))
    throw new Error(`${what}: expected to include ${JSON.stringify(needle)}, got ${JSON.stringify(String(hay).slice(0, 200))}`)
}

/** Bỏ comment để kiểm MÃ THỰC THI, không kiểm lời chú giải. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => !/^\s*(\/\/|\*)/.test(l)).join("\n")
}

export async function pathExists(p) {
  const { stat } = await import("node:fs/promises")
  try { await stat(p); return true } catch { return false }
}
export async function lsDir(p) {
  const { readdir } = await import("node:fs/promises")
  try { return (await readdir(p)).sort() } catch { return [] }
}
/** Chờ điều kiện đúng, tối đa timeout — dùng cho run chạy nền. */
export async function waitFor(fn, timeout, what) {
  const t0 = Date.now()
  for (;;) {
    if (await fn()) return
    if (Date.now() - t0 > timeout) throw new Error(`hết ${timeout}ms khi chờ: ${what}`)
    await new Promise(r => setTimeout(r, 100))
  }
}

export function socketPair() {
  const a = new Duplex({ read() {}, write(c, e, cb) { b.push(c); cb() }, final(cb) { b.push(null); cb() } })
  const b = new Duplex({ read() {}, write(c, e, cb) { a.push(c); cb() }, final(cb) { a.push(null); cb() } })
  for (const s of [a, b]) { s.setNoDelay = () => s; s.setKeepAlive = () => s; s.setTimeout = () => s }
  return [a, b]
}

/** Client HTTP thật, nối vào server qua cặp duplex. */
export function makeClient(server) {
  return function call(method, path, { headers = {}, body = null } = {}) {
    return new Promise((resolveP, rejectP) => {
      const [srv, cli] = socketPair()
      server.emit("connection", srv)
      const h = { ...headers }
      let payload = body
      if (body !== null && !Buffer.isBuffer(body) && typeof body !== "string") {
        payload = JSON.stringify(body)
        h["content-type"] ??= "application/json"
      }
      const req = http.request({ method, path, headers: h, createConnection: () => cli }, res => {
        const chunks = []
        res.on("data", c => chunks.push(c))
        res.on("end", () => {
          const buf = Buffer.concat(chunks)
          let json = null
          try { json = JSON.parse(buf.toString("utf8")) } catch { /* không phải JSON */ }
          resolveP({ status: res.statusCode, headers: res.headers, body: buf, text: buf.toString("utf8"), json })
        })
      })
      req.on("error", rejectP)
      req.end(payload ?? undefined)
    })
  }
}

/** Client đã gắn sẵn 3 header bắt buộc của §6.1. */
export function apiFor(server) {
  const call = makeClient(server)
  const api = (m, p, o = {}) => call(m, p, { ...o, headers: { ...CLIENT, ...(o.headers ?? {}) } })
  return { call, api }
}

/** doctor giả: test KHÔNG được phụ thuộc máy có codex/python hay không. */
export function fakeDoctor(imageGenAvailable) {
  return async ws => ({
    os: "test", node: { ok: true, version: process.versions.node },
    python: { ok: true, version: "3.12.0", venv: false, deps: { pillow: true, numpy: true, torch: false, transformers: false } },
    playwright: { ok: false, fallback: "skeleton.py (PIL)" },
    codex: { ok: true, version: "0.146.0" },
    imageGen: {
      mode: imageGenAvailable ? "img-home" : "unavailable", available: imageGenAvailable,
      codexHomeLabel: "~/.codex-img", authPresent: imageGenAvailable,
      verifiedAt: new Date().toISOString(), reason: imageGenAvailable ? null : "NOT_LOGGED_IN",
      needsFallbackHome: !imageGenAvailable,
    },
    workspace: { label: ws.label, writable: true, freeBytes: 1e11 },
    checkedAt: new Date().toISOString(),
  })
}

/** multipart/form-data thật (không dùng thư viện ngoài). */
export function multipart(fields) {
  const b = "----kitgentest" + Math.random().toString(16).slice(2)
  const parts = []
  for (const f of fields) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${f.name}"` +
      (f.filename ? `; filename="${f.filename}"` : "") + "\r\n" +
      (f.contentType ? `Content-Type: ${f.contentType}\r\n` : "") + "\r\n"))
    parts.push(Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data)))
    parts.push(Buffer.from("\r\n"))
  }
  parts.push(Buffer.from(`--${b}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` }
}

/** PNG 1×1 thật (để kiểm magic bytes + đọc kích thước). */
export const PNG_1x1 = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da630001000005000" +
  "10d0a2db40000000049454e44ae426082", "hex")

export function report() {
  const pass = results.filter(r => r.ok).length
  const fail = results.length - pass
  const W = Math.max(40, ...results.map(r => r.label.length)) + 8
  process.stdout.write("\n" + "─".repeat(W) + "\n")
  for (const r of results) {
    process.stdout.write(`${r.ok ? "PASS" : "FAIL"}  ${r.label}\n`)
    if (!r.ok) process.stdout.write(`      ↳ ${r.err?.message ?? r.err}\n`)
  }
  process.stdout.write("─".repeat(W) + "\n")
  process.stdout.write(`${pass}/${results.length} ca PASS · ${fail} FAIL\n\n`)
  return fail
}
