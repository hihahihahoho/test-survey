/* router.mjs — router tối giản: pattern "/api/projects/:id/files/*" → params.
   Không regex tự do từ client; mỗi param sau đó vẫn phải qua validate của paths.mjs. */
import { AgentError } from "./errors.mjs"

/** decodeURIComponent ném URIError với %-encoding hỏng (vd `%c0%ae` — overlong UTF-8 của kẻ tấn công).
 *  Để lọt ra ngoài thì thành 500 INTERNAL + ghi stderr: sai mã lỗi và biến đầu vào rác của
 *  client thành "lỗi máy chủ". Đầu vào hỏng là 400 BAD_REQUEST. */
function decodeSegment(s) {
  try { return decodeURIComponent(s) }
  catch { throw new AgentError("BAD_REQUEST", "path contains invalid percent-encoding") }
}

export class Router {
  constructor() { this.routes = [] }

  add(method, pattern, handler) {
    const parts = pattern.split("/").filter(Boolean)
    this.routes.push({ method, parts, handler, pattern })
    return this
  }
  get(p, h) { return this.add("GET", p, h) }
  post(p, h) { return this.add("POST", p, h) }
  put(p, h) { return this.add("PUT", p, h) }
  patch(p, h) { return this.add("PATCH", p, h) }
  delete(p, h) { return this.add("DELETE", p, h) }

  /** @returns {{handler, params}|null|"METHOD"} — "METHOD" = path khớp nhưng method sai. */
  match(method, pathname) {
    const segs = pathname.split("/").filter(Boolean).map(decodeSegment)
    let pathHit = false
    for (const r of this.routes) {
      const params = {}
      let ok = true
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i]
        if (p === "*") { params.rest = segs.slice(i).join("/"); ok = true; break }
        if (i >= segs.length) { ok = false; break }
        if (p.startsWith(":")) { params[p.slice(1)] = segs[i]; continue }
        if (p !== segs[i]) { ok = false; break }
      }
      if (ok && !r.parts.includes("*") && r.parts.length !== segs.length) ok = false
      if (!ok) continue
      pathHit = true
      if (r.method === method || (r.method === "GET" && method === "HEAD")) return { handler: r.handler, params }
    }
    return pathHit ? "METHOD" : null
  }
}
