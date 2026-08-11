/* routes/files.mjs — §6.2 F: #41 đọc asset trong project, #42 danh mục kit.
   THU HẸP so với v1: v1 phục vụ CẢ REPO qua static (lộ .git/config — đóng G2).
   Ở đây: chỉ trong `projects/<id>/`, chỉ file, chống traversal + symlink bằng safeJoin. */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, readJsonFile, walkFiles, stat } from "../lib/fsx.mjs"
import { safeJoin } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { normalizeWidth, thumbnail } from "../lib/thumbs.mjs"
import { imageSize } from "../lib/multipart.mjs"

/** Chỉ 6 thư mục dữ liệu được đọc; không bao giờ .history, không bao giờ file lạ ngoài whitelist. */
const READABLE_TOP = new Set(["raw", "kits", "refs", "skeleton", "prompts", "export"])
const READABLE_FILES = new Set(["project.json", "contract.json", "styles.json"])

export function register(r) {
  // #41 GET /api/projects/:id/files/*  (?w=256 bắt buộc cho lưới — đóng H4)
  r.get("/api/projects/:id/files/*", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const rel = String(ctx.params.rest ?? "")
    if (!rel) fail("BAD_REQUEST", "file path is required")
    const top = rel.split("/")[0]
    if (!READABLE_TOP.has(top) && !READABLE_FILES.has(rel))
      fail("PATH_ESCAPE", `only ${[...READABLE_TOP].join(", ")} and ${[...READABLE_FILES].join(", ")} are readable`)
    const abs = safeJoin(projectDir(ws, id), rel, { allowRoot: false })
    if (!(await exists(abs))) fail("NOT_FOUND", `file ${rel} not found`)
    const st = await stat(abs)
    if (!st.isFile()) fail("NOT_FOUND", `${rel} is not a file`)

    const w = normalizeWidth(ctx.url.searchParams.get("w"))
    if (w) {
      const t = await thumbnail(ws, abs, w)
      return { status: 200, file: t.path, headers: t.resized ? {} : { "X-KitGen-Thumb": "unavailable" } }
    }
    return { status: 200, file: abs }
  })

  // #42 GET kit — danh mục file đã cắt (từ kits/manifest.json của slice.py)
  r.get("/api/projects/:id/kit", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const dir = projectDir(ws, id)
    const mpath = join(dir, "kits", "manifest.json")
    if (!(await exists(mpath))) fail("KIT_NOT_CUT", "kits/manifest.json not found — nothing has been cut yet")
    const manifest = await readJsonFile(mpath)
    const variant = ctx.url.searchParams.get("variant")
      ?? Object.keys(manifest.styles ?? {})[0]
      ?? null
    if (!variant) fail("KIT_NOT_CUT", "manifest has no variant entry")
    const entry = (manifest.styles ?? {})[variant]
    if (!entry) fail("KIT_NOT_CUT", `variant ${variant} has not been cut`)

    const vdir = join(dir, "kits", variant)
    const files = []
    for (const abs of await walkFiles(vdir)) {
      if (!abs.endsWith(".png")) continue
      const name = abs.slice(vdir.length + 1)
      if (name === "atlas.png") continue
      const st = await stat(abs)
      let size = { w: null, h: null }
      try { const { readFile } = await import("node:fs/promises"); size = imageSize(await readFile(abs)) } catch { /* ignore */ }
      const meta = (entry.assets ?? []).find(a => (a.file ?? a.name) === name.replace(/\.png$/, "") || a.path === name)
      files.push({
        file: name.replace(/\.png$/, ""), path: `kits/${variant}/${name}`,
        w: size.w, h: size.h, bytes: st.size,
        sheet: meta?.sheet ?? null, cellIndex: meta?.cell ?? meta?.cellIndex ?? null,
        empty: st.size === 0,
        mtime: new Date(st.mtimeMs).toISOString(),
      })
    }
    files.sort((a, b) => a.file.localeCompare(b.file))
    const cutAt = files.reduce((m, f) => (f.mtime > m ? f.mtime : m), "")
    return { status: 200, json: { variant, cutAt: cutAt || null, files, sheets: entry.sheets ?? {} } }
  })
}
