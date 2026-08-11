/* routes/app.mjs — §6.2 #6: PHỤC VỤ BUNDLE WEB tại /app/ (same-origin).
   Đây là ĐƯỜNG VÀO THỨ HAI đã chốt: cùng code, cùng API, chỉ khác đường vào; miễn nhiễm
   mixed-content vì trang là http và gọi http cùng origin.

   Thứ tự dò bundle (xem resolveBundleRoot):
     1. --app-root <path>          — chỉ định tường minh
     2. <workspace>/.kitgen/app    — bản do setup.sh cài
     3. <repo>/webapp/dist         — bản BUILD của React (stack mới)
     4. <repo>/web                 — bản vanilla (đường lùi, giữ nguyên không xoá)
   Không có bundle nào → trả trang giải thích + link, KHÔNG 404 câm. */
import { readFile } from "node:fs/promises"
import { dirname, join, resolve, extname } from "node:path"
import { fileURLToPath } from "node:url"
import { exists, isDir } from "../lib/fsx.mjs"
import { safeJoin } from "../lib/paths.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const AGENT_DIR = resolve(HERE, "..")
const REPO_ROOT = resolve(AGENT_DIR, "..")
const REPO_WEBAPP_DIST = resolve(REPO_ROOT, "webapp", "dist")
const REPO_WEB = resolve(REPO_ROOT, "web")

/** Ưu tiên bundle React đã build; rơi về bản vanilla nếu chưa build bao giờ.
 *  Điều kiện "hợp lệ" là có index.html — webapp/dist rỗng/nửa vời sẽ bị bỏ qua,
 *  người dùng vẫn vào được app cũ thay vì gặp trang trắng. */
export async function resolveBundleRoot(ws, override) {
  for (const c of [override, join(ws.kitgenDir, "app"), REPO_WEBAPP_DIST, REPO_WEB]) {
    if (c && (await isDir(c)) && (await exists(join(c, "index.html")))) return c
  }
  return null
}

/* Asset có vân tay nội dung → cache vĩnh viễn. Bắt CẢ HAI quy ước đặt tên:
     · Vite  : assets/index-BQq4Xy7z.js   (dấu "-", hash base64url có HOA/thường)
     · cũ    : js/app.a1b2c3d4.js         (dấu ".", hash hex)
   Không khớp ⇒ no-cache. Thà cache hụt còn hơn ghim nhầm file không hash
   (user sẽ kẹt bản cũ và không có cách nào ép tải lại). */
const HASHED_ASSET = /[.-][0-9a-zA-Z_-]{8,}\.(js|mjs|css|woff2?|png|svg|jpg|jpeg|gif|webp|avif|ico|map)$/

export function isHashedAsset(rel) {
  return HASHED_ASSET.test(String(rel))
}

export function register(r) {
  // `/app` và `/app/` cho ra cùng danh sách segment nên phải phân biệt bằng pathname thật
  r.get("/app/*", async ctx => {
    if (ctx.url.pathname === "/app") return { status: 302, headers: { Location: "/app/" } }
    const root = await resolveBundleRoot(ctx.registry.active, ctx.appRootOverride)
    if (!root) return { status: 200, html: notInstalledPage() }
    const rel = String(ctx.params.rest ?? "")
    // SPA: mọi đường dẫn không phải file thật → index.html (router phía client tự xử lý)
    if (!rel || rel.endsWith("/")) return await serveIndex(root)
    let abs
    try { abs = safeJoin(root, rel, { allowRoot: false }) }
    catch { return await spaOr404(root, rel) }
    if (!(await exists(abs)) || (await isDir(abs))) return await spaOr404(root, rel)
    // index.html gọi trực tiếp cũng phải được rewrite, không thì trắng trang y như deep link
    if (/(^|\/)index\.html$/.test(rel)) return await serveIndex(root)
    return {
      status: 200, file: abs,
      headers: { "Cache-Control": isHashedAsset(rel) ? "public, max-age=31536000, immutable" : "no-cache" },
    }
  })
}

/* SPA fallback ĐÚNG cho TanStack Router: route của app (`/app/p/tet26/design`) không có
   đuôi file ⇒ trả index.html để router client tự phân giải.
   NHƯNG đường dẫn CÓ ĐUÔI mà không tồn tại (`/app/assets/index-abc.js` gõ sai, bundle build
   thiếu) thì PHẢI 404 — trả index.html sẽ khiến trình duyệt nhận HTML với Content-Type
   text/html cho thẻ <script> và báo lỗi MIME khó hiểu, che mất lỗi build thật. */
async function spaOr404(root, rel) {
  if (extname(rel)) {
    const { AgentError } = await import("../lib/errors.mjs")
    throw new AgentError("NOT_FOUND", `asset not found in bundle: ${String(rel).slice(0, 120)}`)
  }
  return await serveIndex(root)
}

/* Bundle khai tài nguyên theo hai kiểu tuỳ đời:
     · Vite (base:"./")  →  ./assets/index-abc.js   — TƯƠNG ĐỐI theo URL tài liệu
     · vanilla cũ        →  /css/app.css            — TUYỆT ĐỐI từ gốc site
   Cả hai đều vỡ ở deep link nếu để nguyên:
     · tương đối: `/app/p/tet26/design` → trình duyệt xin `/app/p/tet26/assets/…` = 404
     · tuyệt đối: `/css/app.css` không nằm dưới tiền tố `/app/` = 404
   Nên ở đây dịch HẾT về tuyệt đối có tiền tố `/app/`. Làm tại agent, KHÔNG bắt bundle phải
   biết mình đang được phục vụ ở đâu — cùng một file dùng được cho cả hai đường vào.
   Chỉ đổi href/src của <link>/<script> và href của <base>; không chạm nội dung khác. */
export function rewriteIndexBase(html, prefix = "/app") {
  return String(html)
    // ./assets/x, assets/x  → /app/assets/x
    .replace(
      /(<(?:link|script)\b[^>]*\b(?:href|src)=")(?:\.\/)?((?:assets|css|js)\/[^"]*)(")/gi,
      (_m, a, path, b) => `${a}${prefix}/${path}${b}`,
    )
    // /assets/x, /css/x, /js/x → /app/assets/x
    .replace(
      /(<(?:link|script)\b[^>]*\b(?:href|src)=")(\/(?:assets|css|js)\/[^"]*)(")/gi,
      (_m, a, path, b) => `${a}${prefix}${path}${b}`,
    )
}

async function serveIndex(root) {
  const abs = join(root, "index.html")
  try {
    const html = await readFile(abs, "utf8")
    return {
      status: 200, html: rewriteIndexBase(html),
      headers: { "Cache-Control": "no-cache", "Content-Type": "text/html; charset=utf-8" },
    }
  } catch {
    // đọc không được thì vẫn phục vụ nguyên file (thà thiếu rewrite hơn là trắng trang)
    return { status: 200, file: abs, headers: { "Cache-Control": "no-cache" } }
  }
}

function notInstalledPage() {
  return `<!doctype html><html lang="vi"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kit-gen · chưa có bản giao diện tại máy</title>
<style>body{font:14px/1.6 ui-sans-serif,system-ui;background:#0B0E14;color:#E8ECF4;margin:0;padding:48px 24px}
main{max-width:640px;margin:0 auto}h1{font-size:24px;line-height:32px;margin:0 0 8px}
p{color:#9AA4B8}code{font:13px ui-monospace,Menlo,monospace;background:#12161F;border:1px solid #212734;border-radius:4px;padding:2px 6px;color:#E8ECF4}
.card{background:#12161F;border:1px solid #212734;border-radius:12px;padding:16px;margin-top:24px}</style>
<main>
<h1>Công cụ local đang chạy, nhưng chưa có bản giao diện tại máy</h1>
<p>Đường vào chính là trang web tĩnh; bản chạy tại máy (<code>/app/</code>) chỉ có khi bundle giao diện đã được build hoặc cài.</p>
<div class="card">
<p>Build bản React từ mã nguồn:</p>
<p><code>cd webapp &amp;&amp; npm install &amp;&amp; npm run build</code></p>
<p>Hoặc đặt bundle sẵn vào một trong các chỗ sau rồi tải lại trang:</p>
<p><code>&lt;workspace&gt;/.kitgen/app/index.html</code></p>
<p><code>&lt;repo&gt;/webapp/dist/index.html</code></p>
<p><code>&lt;repo&gt;/web/index.html</code></p>
<p>Hoặc chạy agent với <code>--app-root /đường/dẫn/bundle</code>.</p>
</div>
<p style="margin-top:24px">Kiểm tra công cụ local: <a style="color:#4C8DFF" href="/health">/health</a></p>
</main></html>`
}
