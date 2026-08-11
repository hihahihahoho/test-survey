/* http.mjs — helper phản hồi. Mọi JSON đi qua redactDeep trước khi ra dây
   (architecture §4.4-4: lớp chặn cuối cùng). */
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { extname } from "node:path"
import { redactDeep } from "./redact.mjs"
import { AgentError } from "./errors.mjs"

export const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8", ".zip": "application/zip", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".map": "application/json; charset=utf-8",
}

export function sendJson(res, status, obj, headers = {}) {
  const body = Buffer.from(JSON.stringify(redactDeep(obj) ?? null))
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...headers,
  })
  res.end(body)
}

export function sendText(res, status, text, headers = {}) {
  const body = Buffer.from(String(text))
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": body.length, ...headers })
  res.end(body)
}

export function sendEmpty(res, status, headers = {}) {
  res.writeHead(status, headers)
  res.end()
}

export function sendError(res, err, headers = {}) {
  const e = err instanceof AgentError ? err : new AgentError("INTERNAL", String(err?.message ?? err))
  // 413: bên gửi có thể còn đang bơm dữ liệu → đóng kết nối SAU KHI đã ghi xong response
  const extra = e.code === "TOO_LARGE" ? { Connection: "close" } : {}
  if (e.code === "TOO_LARGE") res.on("finish", () => { try { res.req?.destroy() } catch { /* đã đóng */ } })
  sendJson(res, e.status, e.toEnvelope(), { ...headers, ...extra, ...(e.headers ?? {}) })
}

/** Phục vụ 1 file trên đĩa (đã được sandbox trước đó). ETag = mtimeMs-size (§6.2 #41). */
export async function sendFile(res, abs, { headers = {}, req, download = null, cache = "no-cache" } = {}) {
  const st = await stat(abs)
  if (!st.isFile()) throw new AgentError("NOT_FOUND", "not a file")
  const etag = `"${Math.floor(st.mtimeMs)}-${st.size}"`
  const base = {
    "Content-Type": MIME[extname(abs).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": cache,
    ETag: etag,
    "Last-Modified": new Date(st.mtimeMs).toUTCString(),
    ...headers,
  }
  if (download) base["Content-Disposition"] = `attachment; filename="${download.replace(/[^\w.\-]/g, "_")}"`
  if (req && req.headers["if-none-match"] === etag) { res.writeHead(304, base); return res.end() }
  base["Content-Length"] = st.size
  res.writeHead(200, base)
  if (req?.method === "HEAD") return res.end()
  await new Promise((ok, err) => createReadStream(abs).on("error", err).on("end", ok).pipe(res))
}
