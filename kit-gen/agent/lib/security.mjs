/* security.mjs — 9 lớp phòng thủ của architecture §3.4, không token.
   Thứ tự kiểm: Host (421) → Origin (403) → header ép preflight → rate limit (429) → body limit (413).
   KHÔNG BAO GIỜ dùng Access-Control-Allow-Origin: '*'. */
import { AgentError } from "./errors.mjs"

const PROTOCOL = 1

/** Origin allowlist: cấu hình được (Pages domain + localhost các cổng dò). */
export function buildOriginAllowlist({ port, extraOrigins = [], ports = [] }) {
  const set = new Set()
  const localHosts = ["127.0.0.1", "localhost", "[::1]"]
  for (const p of new Set([port, ...ports])) for (const h of localHosts) set.add(`http://${h}:${p}`)
  for (const h of localHosts) set.add(`http://${h}`)
  for (const o of extraOrigins) {
    const t = String(o).trim().replace(/\/+$/, "")
    if (t) set.add(t)
  }
  return set
}

/** Host header phải trỏ loopback đúng cổng → chống DNS-rebinding (lớp 4). */
export function checkHost(req, { port, hostAllowlist }) {
  const host = String(req.headers.host ?? "").toLowerCase()
  if (!host) throw new AgentError("BAD_HOST", "missing Host header")
  const ok = hostAllowlist.has(host)
  if (!ok) {
    throw new AgentError("BAD_HOST",
      `Host ${JSON.stringify(host)} is not a loopback name for port ${port}`,
      { hint: "use-127-0-0-1", details: { expected: [...hostAllowlist].slice(0, 6) } })
  }
}

export function buildHostAllowlist(port) {
  const s = new Set()
  for (const h of ["127.0.0.1", "localhost", "[::1]", "::1"]) { s.add(`${h}:${port}`); s.add(h) }
  return s
}

/** Sec-Fetch-Site do TRÌNH DUYỆT tự đặt (forbidden header name): JS trong trang KHÔNG
 *  ghi đè được, kể cả qua fetch/XHR. Vì vậy nó là bằng chứng đáng tin về nguồn gốc request,
 *  đúng ở chỗ header Origin lại vắng mặt.
 *    · same-origin  — request phát ra từ chính trang do agent phục vụ (/app/…)
 *    · none         — điều hướng top-level do người dùng gõ/bookmark (không có trang khởi xướng)
 *    · same-site / cross-site — có trang khác khởi xướng ⇒ KHÔNG được miễn trừ.
 *  curl/CLI không gửi header này ⇒ vẫn rơi vào nhánh --allow-cli như cũ, không nới lỏng gì. */
function secFetchSite(req) {
  const v = req.headers["sec-fetch-site"]
  return v === undefined ? null : String(v).trim().toLowerCase()
}

/** Phương thức "an toàn" theo chuẩn Fetch: trình duyệt KHÔNG kèm Origin cho GET/HEAD same-origin.
 *  Mọi phương thức ghi (POST/PATCH/PUT/DELETE) LUÔN có Origin ⇒ không bao giờ cần miễn trừ. */
const SAFE_METHOD = new Set(["GET", "HEAD"])

/** CAO-01 — vì sao phải có nhánh này.
 *  Bundle do CHÍNH agent phục vụ tại /app/ gọi GET /health. Theo chuẩn Fetch, trình duyệt
 *  KHÔNG gửi Origin cho request same-origin dùng phương thức an toàn. Logic cũ coi
 *  "thiếu Origin" == "gọi từ CLI" ⇒ trả 403 ORIGIN_NOT_ALLOWED ⇒ đường vào thứ hai
 *  (lá chắn cho mixed-content/Safari) CHẾT HOÀN TOÀN, app kẹt chế độ chỉ-đọc.
 *
 *  Miễn trừ CÓ ĐIỀU KIỆN, không nới lỏng bảo mật — phải thoả ĐỦ CẢ BA:
 *    1. Sec-Fetch-Site: same-origin  (trình duyệt đặt, JS không giả mạo được)
 *    2. phương thức an toàn GET/HEAD (đúng tập mà chuẩn cho phép vắng Origin)
 *    3. Host khớp allowlist loopback (đã kiểm ở checkHost TRƯỚC đó ⇒ chống DNS-rebinding)
 *  Trang khác origin muốn giả dạng: fetch của nó luôn nhận Sec-Fetch-Site: cross-site
 *  (hoặc same-site), và nó KHÔNG xoá được header đó. Các lớp còn lại (X-KitGen-Client,
 *  rate limit, body limit, safeJoin) giữ nguyên, không lớp nào bị bỏ qua. */
export function checkOrigin(req, { origins, allowCli, publicPath = false }) {
  const origin = req.headers.origin
  if (origin === undefined) {
    const site = secFetchSite(req)
    const safe = SAFE_METHOD.has(String(req.method ?? "GET").toUpperCase())
    // (1) app same-origin do chính agent phục vụ — ca CAO-01
    if (site === "same-origin" && safe) return null
    // (2) path CÔNG KHAI (/app/…, /bridge.html, /favicon.ico) — KHÔNG mở cho /api/* hay /health.
    //     Cho: điều hướng top-level trực tiếp (site "none": gõ URL/bookmark/window.open cầu dò)
    //     và CLI (site null: curl không gửi Sec-Fetch-Site) — giữ nguyên hành vi cũ.
    //     CHẶN: site "cross-site"/"same-site" — trang khác origin nhúng bundle làm iframe/subresource.
    //     Đây là SIẾT so với bản cũ (trước đây publicPath không-Origin được cho qua vô điều kiện).
    if (publicPath && safe && (site === null || site === "none" || site === "same-origin")) return null
    if (allowCli) return null
    throw new AgentError("ORIGIN_NOT_ALLOWED", "request without Origin header rejected (use --allow-cli to permit)",
      { hint: "run-with-allow-cli" })
  }
  const o = String(origin).replace(/\/+$/, "")
  if (o === "null" || !origins.has(o)) {
    throw new AgentError("ORIGIN_NOT_ALLOWED", `origin ${JSON.stringify(o)} is not in the allowlist`,
      { hint: "open-mirror-app", details: { allowed: [...origins].filter(x => !x.startsWith("http://127")).slice(0, 4) } })
  }
  return o
}

/** Lớp 3: ép preflight bằng header tuỳ biến — web độc hại không bắn được "simple request". */
export function checkClientHeader(req, { publicPaths, pathname }) {
  if (publicPaths.some(p => pathname === p || pathname.startsWith(p))) return
  if (String(req.headers["x-kitgen-client"] ?? "") !== "1")
    throw new AgentError("CLIENT_HEADER_REQUIRED", "missing X-KitGen-Client: 1 header", { hint: "add-client-header" })
}

/** CORS response headers cho origin đã được duyệt (không '*', không credentials). */
export function corsHeaders(origin) {
  const h = {
    "X-KitGen-Protocol": String(PROTOCOL),
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  }
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin
    h["Access-Control-Allow-Methods"] = "GET,POST,PATCH,PUT,DELETE,OPTIONS"
    h["Access-Control-Allow-Headers"] = "Content-Type, X-KitGen-Client, If-Match, If-None-Match, X-KitGen-Confirm"
    h["Access-Control-Expose-Headers"] = "ETag, X-KitGen-Protocol, Content-Disposition, Content-Length"
    h["Access-Control-Max-Age"] = "600"
    // Private Network Access / Local Network Access (Chromium) — architecture R2
    h["Access-Control-Allow-Private-Network"] = "true"
  }
  return h
}

/** Đường dẫn CHỈ-ĐỌC tài nguyên tĩnh: bundle /app/* và đọc file/thumbnail trong project.
 *  Một trang mở ra nạp cả trăm ES module (bundle không có build step) và lưới kit có thể
 *  xin ~100 thumbnail cùng lúc ⇒ dùng chung bucket 20 req/s với API là TỰ CHẶN CHÍNH MÌNH. */
const STATIC_READ = [/^\/app(\/|$)/, /^\/api\/projects\/[^/]+\/files\//, /^\/favicon\.ico$/]
export function isStaticRead(pathname) {
  return STATIC_READ.some(re => re.test(String(pathname)))
}

/** Rate limit thô: cửa sổ trượt 1s. HAI BUCKET riêng (lớp 9):
 *   · `api`    — mặc định 20 req/s: đủ cho thao tác thật của người dùng, chặn vòng lặp lỗi.
 *   · `static` — hào phóng hơn nhiều (mặc định 30×): chỉ đọc file trong bundle/project,
 *                không spawn tiến trình, không ghi đĩa ⇒ không phải bề mặt tấn công đáng giá.
 *  Vẫn là trần: kể cả bucket static cũng có giới hạn, không mở toang. */
export function makeRateLimiter({ limit = 20, windowMs = 1000, staticLimit = null } = {}) {
  const buckets = { api: [], static: [] }
  const limits = { api: limit, static: staticLimit ?? limit * 30 }
  return function take(pathname = "") {
    const kind = isStaticRead(pathname) ? "static" : "api"
    const cap = limits[kind]
    const now = Date.now()
    const hits = buckets[kind].filter(t => now - t < windowMs)
    buckets[kind] = hits
    if (hits.length >= cap)
      throw new AgentError("RATE_LIMITED", `rate limit ${cap}/${windowMs}ms exceeded (${kind})`,
        { hint: "retry-after-2s", headers: { "Retry-After": "2" } })
    hits.push(now)
  }
}

/** Đọc body có TRẦN cứng → 413 trước khi nạp hết vào RAM.
 *  Quan trọng: khi vượt trần thì KHÔNG destroy socket ngay — nếu destroy trước khi
 *  response 413 được ghi ra thì client không nhận được gì (treo). Pause input để tạo
 *  backpressure; sendError sẽ đóng kết nối chỉ sau khi response đã flush xong. */
export function readBody(req, { limit }) {
  return new Promise((ok, err) => {
    const declared = Number(req.headers["content-length"] ?? NaN)
    if (Number.isFinite(declared) && declared > limit)
      return err(new AgentError("TOO_LARGE", `body ${declared} > limit ${limit}`, { details: { limitBytes: limit } }))
    const chunks = []
    let total = 0
    let over = false
    req.on("data", c => {
      total += c.length
      if (!over && total > limit) {
        over = true
        chunks.length = 0
        req.pause()
        err(new AgentError("TOO_LARGE", `body > limit ${limit}`, { details: { limitBytes: limit } }))
        return
      }
      if (over) return
      chunks.push(c)
    })
    req.on("end", () => { if (!over) ok(Buffer.concat(chunks)) })
    req.on("error", e => { if (!over) err(e) })
    req.on("aborted", () => { if (!over) err(new AgentError("BAD_REQUEST", "request aborted")) })
  })
}

export async function readJson(req, { limit }) {
  const buf = await readBody(req, { limit })
  if (!buf.length) return {}
  try { return JSON.parse(buf.toString("utf8")) }
  catch (e) { throw new AgentError("BAD_REQUEST", "body is not valid JSON") }
}

export { PROTOCOL }
