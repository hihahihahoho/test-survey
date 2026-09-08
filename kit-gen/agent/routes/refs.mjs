/* routes/refs.mjs — §6.2 D: #29..#31 (ảnh tham chiếu của project).
   Client KHÔNG BAO GIỜ gửi path (đóng G1): AGENT tự đặt tên `char-<slug>.png` / `inspo-<n>.png`
   / `brand-<n>.png`, trả về đường dẫn TƯƠNG ĐỐI trong project. Kiểm magic bytes, không tin Content-Type. */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, ensureDir, readdir, stat, writeFileAtomic, removeTree } from "../lib/fsx.mjs"
import { safeJoin, safeSegment } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { readContract } from "../lib/contract.mjs"
import { refUsage } from "../lib/validate.mjs"
import { parseMultipart, sniff, imageSize } from "../lib/multipart.mjs"
import { slugify } from "../lib/projects.mjs"

const IMAGE_EXT = new Set(["png", "jpg", "webp"])
const KINDS = new Set(["character", "inspo", "brand"])

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
      const abs = join(dir, name)
      const st = await stat(abs).catch(() => null)
      if (!st?.isFile()) continue
      let size = { w: null, h: null }
      try { const { readFile } = await import("node:fs/promises"); size = imageSize(await readFile(abs)) } catch { /* ảnh lạ */ }
      items.push({
        name, bytes: st.size, w: size.w, h: size.h,
        mtime: new Date(st.mtimeMs).toISOString(),
        usedBy: contract ? refUsage(contract, name) : [],
      })
    }
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
    return {
      status: 201,
      json: { name, path: `refs/${name}`, bytes: file.data.length, w: size.w, h: size.h, kind: kindRaw },
    }
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
