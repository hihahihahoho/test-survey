/* routes/refs.mjs — §6.2 D: #29..#31 (ảnh tham chiếu của project).
   Client KHÔNG BAO GIỜ gửi path (đóng G1): AGENT tự đặt tên `char-<slug>.png` / `inspo-<n>.png`
   / `brand-<n>.png`, trả về đường dẫn TƯƠNG ĐỐI trong project. Kiểm magic bytes, không tin Content-Type. */
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, ensureDir, readdir, stat, writeFileAtomic, removeTree } from "../lib/fsx.mjs"
import { safeJoin, safeSegment } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { readContract } from "../lib/contract.mjs"
import { refUsage } from "../lib/validate.mjs"
import { parseMultipart, sniff, imageSize } from "../lib/multipart.mjs"
import { slugify } from "../lib/projects.mjs"
import { refAlpha, refAlphaOne } from "../lib/ref-alpha.mjs"

const IMAGE_EXT = new Set(["png", "jpg", "webp"])
const KINDS = new Set(["character", "inspo", "brand"])

/* ══ MÔ TẢ CHO MÁY VẼ — `refs/<tên ảnh>.desc.txt` ══════════════════════════════
   `gen.sh` tả một tấm ảnh đục thành chữ rồi cất ngay CẠNH ẢNH, với một dòng khoá
   ở đầu file:
       # sha256:<băm nội dung ảnh> role:<vai> v2      ← engine tả
       # sha256:<băm nội dung ảnh> role:<vai> user    ← NGƯỜI DÙNG gõ
   Token cuối là cả sự khác nhau: bản của engine hết hạn khi `DESC_V` đổi (câu hỏi
   đã khác thì câu trả lời cũ vô nghĩa), còn bản của người dùng CHỈ hết hạn khi
   chính tấm ảnh đổi. Họ sửa vì bản máy tả sai con vật của họ — một lượt nâng phiên
   bản câu hỏi mà xoá chữ ấy đi là bắt họ gõ lại, mãi mãi.
   KHÔNG có số phiên bản trong dòng của người dùng, có chủ ý: agent không được biết
   `DESC_V` của engine, và nó cũng không cần biết — `desc_fresh`/`desc_line_fresh`
   thấy token `user` là dừng đọc phiên bản. */
const DESC_ROLES = new Set(["character", "style", "layout"])
/* Trần chữ. gen.sh xin 120-200 từ; 8000 ký tự rất rộng cho người muốn viết kỹ, mà
   vẫn chặn được một cú dán nhầm cả một file vào ô soạn. */
const DESC_MAX = 8000
/* File cache của mô tả nằm CHUNG thư mục với ảnh, nên danh sách ref phải lọc chúng
   ra — nếu không, mỗi tấm ảnh có mô tả sẽ mọc thêm một "tấm ảnh" tên
   `char-lan.png.desc.txt` trong lưới ảnh tham chiếu. */
const DESC_SUFFIX = ".desc.txt"

export function register(r) {
  // #29 GET refs
  r.get("/api/projects/:id/refs", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)
    const dir = join(projectDir(ws, ctx.params.id), "refs")
    await ensureDir(dir)
    const { contract } = await readContract(ws, ctx.params.id).catch(() => ({ contract: null }))
    const items = []
    for (const name of (await readdir(dir).catch(() => []))) {
      if (name.endsWith(DESC_SUFFIX)) continue         // mô tả cho máy vẽ, không phải một tấm ảnh
      const abs = join(dir, name)
      const st = await stat(abs).catch(() => null)
      if (!st?.isFile()) continue
      let size = { w: null, h: null }
      try { size = imageSize(await readFile(abs)) } catch { /* ảnh lạ */ }
      items.push({
        name, bytes: st.size, w: size.w, h: size.h,
        mtime: new Date(st.mtimeMs).toISOString(),
        usedBy: contract ? refUsage(contract, name) : [],
      })
    }
    /* NỀN CỦA TỪNG ẢNH — đo MỘT lượt cho cả danh sách (xem `ref-alpha.mjs`).
       Đây là thứ quyết định ảnh ấy được ĐÍNH THẲNG cho máy vẽ hay phải đi qua một
       lượt codex tả thành chữ, nên nó là thông tin của người dùng, không phải chi
       tiết nội bộ của engine. */
    const alpha = await refAlpha(items.map(it => join(dir, it.name)))
    for (const it of items) it.alpha = alpha.get(join(dir, it.name)) === true
    return { status: 200, json: { items } }
  })

  r.get("/api/projects/:id/refs/:name/file", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)
    const name = safeSegment(ctx.params.name, "ref name")
    const abs = safeJoin(join(projectDir(ws, ctx.params.id), "refs"), name, { allowRoot: false })
    if (!(await exists(abs))) fail("REF_NOT_FOUND", `ref ${name} not found`)
    return { status: 200, file: abs, headers: { "Cache-Control": "private, max-age=3600" } }
  })

  // #30 POST refs (multipart, ≤20 MB) — agent đặt tên
  r.post("/api/projects/:id/refs", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)
    const parts = parseMultipart(await ctx.body(ctx.limits.upload), ctx.req.headers["content-type"])
    const file = parts.find(p => p.name === "file" && p.filename !== null)
    if (!file) fail("BAD_REQUEST", "multipart field `file` is required")
    if (file.data.length > ctx.limits.refFile)
      fail("TOO_LARGE", `file ${file.data.length} > ${ctx.limits.refFile}`, { details: { limitBytes: ctx.limits.refFile } })
    const kindRaw = parts.find(p => p.name === "kind")?.data.toString("utf8").trim() ?? "inspo"
    if (!KINDS.has(kindRaw)) fail("BAD_REQUEST", `kind must be one of ${[...KINDS].join("|")}`)
    const sn = sniff(file.data)
    if (!sn || !IMAGE_EXT.has(sn.ext))
      fail("BAD_TYPE", "file is not a PNG/JPG/WebP image (magic bytes check failed)",
        { details: { accepted: ["image/png", "image/jpeg", "image/webp"] } })

    const dir = join(projectDir(ws, ctx.params.id), "refs")
    await ensureDir(dir)
    const hintName = parts.find(p => p.name === "hintName")?.data.toString("utf8") ?? file.filename ?? ""
    const name = await pickRefName(dir, kindRaw, hintName, sn.ext)
    await writeFileAtomic(join(dir, name), file.data)
    const size = imageSize(file.data)
    /* `alpha` ngay trong câu trả lời của lượt tải lên: pill vừa nhận về tấm ảnh là
       nói được ngay nó sẽ đi đường nào tới máy vẽ, không phải đợi một lượt
       `GET /refs` nữa mới biết. */
    const alpha = await refAlphaOne(join(dir, name))
    return {
      status: 201,
      json: { name, path: `refs/${name}`, bytes: file.data.length, w: size.w, h: size.h, kind: kindRaw, alpha },
    }
  })

  /* ══ MÔ TẢ CHO MÁY VẼ — ĐỌC VÀ SỬA ═════════════════════════════════════════
     Ảnh ĐỤC không đính được vào lời gọi image_gen (đính là mất nền trong suốt của
     cả sheet), nên `gen.sh` tả nó thành chữ bằng một lượt codex rồi dán đoạn chữ
     ấy vào prompt. Đoạn chữ đó là thứ QUYẾT ĐỊNH nhân vật vẽ ra có giống hay
     không — mà cho tới bản này thì người dùng không có cửa nào đọc nó, chứ đừng
     nói sửa. Hai route dưới đây mở đúng cái cửa ấy. */

  r.get("/api/projects/:id/refs/:name/desc", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)
    const { img, cache, name } = descPaths(ws, ctx.params.id, ctx.params.name)
    if (!(await exists(img))) fail("REF_NOT_FOUND", `ref ${name} not found`)
    return { status: 200, json: { name, ...(await readDesc(cache, img)) } }
  })

  r.put("/api/projects/:id/refs/:name/desc", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)
    const { img, cache, name } = descPaths(ws, ctx.params.id, ctx.params.name)
    if (!(await exists(img))) fail("REF_NOT_FOUND", `ref ${name} not found`)
    const body = await ctx.json()
    const text = typeof body?.text === "string" ? body.text.trim() : null
    if (text === null) fail("BAD_REQUEST", "field `text` (string) is required")
    if (text.length > DESC_MAX)
      fail("TOO_LARGE", `description ${text.length} > ${DESC_MAX}`, { details: { limitChars: DESC_MAX } })

    /* CHỮ RỖNG = "trả lại cho máy tả". Không phải một lỗi, và cũng không phải một
       mô tả rỗng: đóng đinh một file rỗng vào cache là bịt luôn đường tả của
       engine cho tấm ảnh ấy, mãi mãi. Xoá file đi thì lượt Vẽ tới tả lại như mới. */
    if (text === "") {
      if (await exists(cache)) await removeTree(cache)
      return { status: 200, json: { name, ...(await readDesc(cache, img)) } }
    }

    const roleRaw = typeof body?.role === "string" && body.role ? body.role : null
    if (roleRaw !== null && !DESC_ROLES.has(roleRaw))
      fail("BAD_REQUEST", `role must be one of ${[...DESC_ROLES].join("|")}`)
    /* Vai không nói ra ⇒ giữ vai của bản đang có; chưa có gì thì đoán theo tên do
       chính agent đặt (`char-…` là ảnh nhân vật). Đoán sai thì gen.sh thấy khoá
       lệch vai và tả lại — chậm một lượt, không sai một chữ nào. */
    const cur = await readDesc(cache, img)
    const role = roleRaw ?? cur.role ?? (name.startsWith("char-") ? "character" : "style")
    const key = `# sha256:${await fileSha(img)} role:${role} user`
    await writeFileAtomic(cache, `${key}\n${text}\n`)
    return { status: 200, json: { name, ...(await readDesc(cache, img)) } }
  })

  // #31 DELETE ref — 409 nếu contract còn tham chiếu (V-08)
  r.delete("/api/projects/:id/refs/:name", async ctx => {
    const ws = ctx.registry.active
    const name = safeSegment(ctx.params.name, "ref name")
    const dir = join(projectDir(ws, ctx.params.id), "refs")
    const abs = safeJoin(dir, name, { allowRoot: false })
    if (!(await exists(abs))) fail("REF_NOT_FOUND", `ref ${name} not found`)
    const force = ctx.url.searchParams.get("force") === "1"
    const { contract } = await readContract(ws, ctx.params.id).catch(() => ({ contract: null }))
    const usedBy = contract ? refUsage(contract, name) : []
    if (usedBy.length && !force)
      fail("REF_IN_USE", `ref ${name} is used in ${usedBy.length} place(s)`, { details: { usedBy } })
    await removeTree(abs)
    return { status: 204 }
  })

}

/**
 * Ba đường dẫn của một mô tả, đi qua ĐÚNG cửa an toàn mà mọi route refs dùng.
 *
 * `safeSegment` chặn `..`, `/`, `\` và mọi thứ không phải một tên tệp; tên file
 * cache là `<tên ảnh>.desc.txt` nên nó thừa hưởng nguyên phép chặn ấy. Vẫn cho cả
 * hai đi qua `safeJoin(..., { allowRoot: false })`: một tên đã sạch mà vẫn kiểm
 * lần nữa là rẻ, còn một cửa quên kiểm thì đắt (bài học `refs/../gen.sh`).
 */
function descPaths(ws, projectId, rawName) {
  const name = safeSegment(rawName, "ref name")
  const dir = join(projectDir(ws, projectId), "refs")
  return {
    name,
    img: safeJoin(dir, name, { allowRoot: false }),
    cache: safeJoin(dir, name + DESC_SUFFIX, { allowRoot: false }),
  }
}

async function fileSha(abs) {
  return createHash("sha256").update(await readFile(abs)).digest("hex")
}

/**
 * Đọc mô tả đang nằm cạnh ảnh, kèm hai điều người dùng cần biết về nó.
 *
 *  · `user`  — chữ này do NGƯỜI gõ (token cuối dòng khoá là `user`), nên lượt Vẽ
 *    tới sẽ KHÔNG tả đè lên nó.
 *  · `stale` — dòng khoá băm một tấm ảnh KHÁC tấm đang có. Nghĩa là ảnh đã bị thay
 *    sau khi mô tả này được viết ⇒ engine sẽ tả lại. Nói ra chứ không lặng lẽ trả
 *    về chữ cũ: đó là chữ tả một con vật không còn ở đây nữa.
 */
async function readDesc(cache, img) {
  const raw = await readFile(cache, "utf8").catch(() => null)
  if (raw === null) return { exists: false, text: "", user: false, role: null, stale: false }
  const rows = raw.split("\n")
  const parts = (rows[0] ?? "").trim().split(/\s+/)
  const ok = parts[0] === "#" && (parts[1] ?? "").startsWith("sha256:") && (parts[2] ?? "").startsWith("role:")
  const role = ok ? parts[2].slice("role:".length) : null
  const user = ok && parts[parts.length - 1] === "user"
  const hash = ok ? parts[1].slice("sha256:".length) : ""
  const stale = !ok || hash !== (await fileSha(img).catch(() => ""))
  return { exists: true, text: rows.slice(1).join("\n").trim(), user, role, stale }
}

async function pickRefName(dir, kind, hint, ext) {
  if (kind === "character") {
    const base = slugify(String(hint).replace(/\.[a-z0-9]+$/i, "")) || "char"
    let name = `char-${base}.${ext}`
    let n = 2
    while (await exists(join(dir, name))) name = `char-${base}-${n++}.${ext}`
    return name
  }
  const prefix = kind === "brand" ? "brand" : "inspo"
  let n = 1
  let name = `${prefix}-${n}.${ext}`
  while (await exists(join(dir, name))) name = `${prefix}-${++n}.${ext}`
  return name
}
