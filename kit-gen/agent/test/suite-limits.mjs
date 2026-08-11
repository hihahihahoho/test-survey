/* suite-limits.mjs — trần body (413) theo cả Content-Length và dòng dữ liệu thật,
   rate limit thô (429). architecture §3.4 lớp 9. */
import http from "node:http"
import { describe, it, eq, ok, socketPair, makeClient, CLIENT, PAGES, PORT } from "./harness.mjs"
import { createAgent } from "../server.mjs"

export async function run({ api, call, wsRoot, pid }) {
  // ─────────────────────────────────────────── 7. BODY LIMIT / RATE LIMIT
  describe("giới hạn")
  await it("body quá lớn (khai Content-Length) → 413 TOO_LARGE", async () => {
    const r = await call("PUT", `/api/projects/${pid}/contract`, {
      headers: { ...CLIENT, "if-match": "1", "content-length": String(26 << 20) },
      body: JSON.stringify({ contract: {} }),
    })
    eq(r.status, 413, "status")
    eq(r.json.error.code, "TOO_LARGE", "code")
    ok(r.json.error.details.limitBytes > 0, "có limitBytes")
  })
  await it("body vượt trần theo DÒNG DỮ LIỆU THẬT (không khai Content-Length) → 413", async () => {
    // agent riêng với trần 64 KB để không phải bơm 200 MB trong test
    const tiny = await createAgent({
      workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {}, rateLimit: 500,
      limits: { json: 64 << 10, upload: 64 << 10, refFile: 64 << 10 },
    })
    tiny.state.port = PORT
    eq(tiny.limits.upload, 64 << 10, "trần đã áp")
    const r = await new Promise(resolveP => {
      const [srv, cli] = socketPair()
      tiny.server.emit("connection", srv)
      const req = http.request({
        method: "POST", path: "/api/uploads",
        headers: { ...CLIENT, "content-type": "application/octet-stream", "transfer-encoding": "chunked" },
        createConnection: () => cli,
      }, res => {
        const bufs = []
        res.on("data", c => bufs.push(c))
        res.on("end", () => {
          const b = Buffer.concat(bufs).toString("utf8")
          let j = null; try { j = JSON.parse(b) } catch { /* không phải JSON */ }
          resolveP({ status: res.statusCode, json: j })
        })
      })
      req.on("error", () => resolveP({ status: 0, json: null }))
      const chunk = Buffer.alloc(16 << 10, 0x61)
      let n = 0
      const pump = () => {
        if (n++ >= 32) { try { req.end() } catch { /* đã bị huỷ */ } return }   // 512 KB > trần 64 KB
        let alive = true
        try { alive = req.write(chunk) } catch { return }
        if (alive) setImmediate(pump); else req.once("drain", pump)
      }
      pump()
    })
    eq(r.status, 413, `status (nhận ${r.status})`)
    eq(r.json?.error?.code, "TOO_LARGE", "code")
  })
  await it("rate limit thô → 429 RATE_LIMITED", async () => {
    const strict = await createAgent({ workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {}, rateLimit: 5 })
    strict.state.port = PORT
    const callStrict = makeClient(strict.server)
    let got429 = null
    for (let i = 0; i < 12; i++) {
      const r = await callStrict("GET", "/health", { headers: CLIENT })
      if (r.status === 429) { got429 = r; break }
    }
    ok(got429, "phải có ít nhất 1 lần 429")
    eq(got429.json.error.code, "RATE_LIMITED", "code")
    eq(got429.headers["retry-after"], "2", "Retry-After")
  })

}
