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

/** Chỉ các thư mục dữ liệu được đọc; không bao giờ .history, không bao giờ file lạ ngoài whitelist.
 *  `cover` = ảnh bìa tự sinh (cover/cover.png + cover.json). Nhật ký thô của lượt vẽ bìa CỐ Ý
 *  nằm ở `logs/` — thư mục KHÔNG đọc được từ web — vì log codex có đường dẫn tuyệt đối của máy. */
const READABLE_TOP = new Set(["raw", "kits", "refs", "skeleton", "prompts", "export", "runs", "cover"])
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
      /* `slice.py:963` ghi `asset.file` KÈM đuôi (`"01-btn-pill-red.png"`), còn bản cũ
         ở đây so khớp với tên ĐÃ CẮT đuôi ⇒ không bao giờ khớp ⇒ mọi file trả về
         `sheet: null`, và web không xếp được ô đã cắt về đúng nhóm/sheet.
         Cắt đuôi ở CẢ HAI VẾ. `tight/<file>.png` là bản ôm sát của cùng ô, nên nó dùng
         chung meta với bản canvas — so khớp theo tên cơ sở, không theo đường dẫn. */
      const bare = name.replace(/\.png$/, "")
      const stem = bare.slice(bare.lastIndexOf("/") + 1)
      const meta = (entry.assets ?? []).find(a =>
        String(a.file ?? a.name ?? "").replace(/\.png$/, "") === stem || a.path === name)
      files.push({
        file: bare, path: `kits/${variant}/${name}`,
        w: size.w, h: size.h, bytes: st.size,
        sheet: meta?.sheet ?? null,
        /* ⚠️ `meta.cell` của `slice.py` là KÍCH THƯỚC ô `[w, h]`, KHÔNG phải chỉ số ô.
           Bản cũ viết `meta?.cell ?? meta?.cellIndex` nên khi meta đối chiếu được (sau
           bản vá ở trên) `cellIndex` sẽ là một MẢNG — sai kiểu, và schema web
           (`z.number()`) sẽ ném, giết luôn cả danh mục kit. Chỉ nhận số. */
        cellIndex: typeof meta?.cellIndex === "number" ? meta.cellIndex : null,
        /* HÌNH HỌC SAFE ZONE đi kèm file, không nằm lại trong manifest.
           `figma-export/copy-sprite-images.mjs:41-48` dựng frame Figma bằng ĐÚNG bốn số
           này: frame = `safe`, ảnh đặt lệch `content_at - safe` để decoration tràn ra
           ngoài frame mà vẫn hiện (Clip content = off). Không trả ra đây thì webapp
           không có cách nào copy sang Figma đúng chuẩn — nó chỉ còn bitmap phẳng. */
        safe: meta?.safe ?? null,
        contentAt: meta?.content_at ?? null,
        content: meta?.content ?? null,
        canvas: meta?.canvas ?? null,
        cell: meta?.cell && Array.isArray(meta.cell) ? meta.cell : null,
        bleed: meta?.bleed ?? null,
        empty: st.size === 0,
        mtime: new Date(st.mtimeMs).toISOString(),
      })
    }
    files.sort((a, b) => a.file.localeCompare(b.file))
    const cutAt = files.reduce((m, f) => (f.mtime > m ? f.mtime : m), "")
    return { status: 200, json: { variant, cutAt: cutAt || null, files, sheets: entry.sheets ?? {} } }
  })
}
