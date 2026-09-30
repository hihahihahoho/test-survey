/* routes/templates.mjs — TEMPLATE CỦA NGƯỜI DÙNG (lib/project-templates.mjs).
 *
 *   POST   /api/projects/:id/save-template   chụp dự án thành template     → 201 {template}
 *   GET    /api/templates                    danh sách, mới lưu trước      → {items}
 *   GET    /api/templates/:id/cover          hình thu nhỏ (?w= như #41)    → png | 404
 *   PATCH  /api/templates/:id                đổi tên / mô tả               → {template}
 *   DELETE /api/templates/:id                xoá mềm vào thùng rác         → {ok:true}
 *
 * Đường TẠO dự án từ template là `POST /api/projects` + `fromTemplate` (routes/projects.mjs):
 * cùng một cửa tạo, cùng luật đặt id, cùng mã lỗi — không phải một cửa tạo thứ hai.
 *
 * Mọi `:id` template qua `RE_TEMPLATE_ID` TRƯỚC khi chạm đĩa (bên trong lib) ⇒ `..`,
 * `%2F`, chữ hoa, dấu chấm đầu đều là 400 chứ không bao giờ thành một đường dẫn.
 */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import {
  deleteTemplate, listTemplates, patchTemplate, readTemplate, saveProjectAsTemplate,
} from "../lib/project-templates.mjs"
import { normalizeWidth, thumbnail } from "../lib/thumbs.mjs"

export function register(r) {
  r.post("/api/projects/:id/save-template", async ctx => {
    const template = await saveProjectAsTemplate(ctx.registry.active, ctx.params.id, await ctx.json())
    return { status: 201, json: { template } }
  })

  r.get("/api/templates", async ctx => ({
    status: 200, json: { items: await listTemplates(ctx.registry.active) },
  }))

  /* Cùng đường phục vụ ảnh với #41 (`sendFile`: ETag, no-cache, HEAD) và cùng bộ co
     ảnh (`?w=128` cho ô 48px của hộp Tạo dự án). Không có ảnh bìa ⇒ 404 thật, để web
     vẽ ô giữ chỗ thay vì đợi. */
  r.get("/api/templates/:id/cover", async ctx => {
    const ws = ctx.registry.active
    const tpl = await readTemplate(ws, ctx.params.id)
    if (!tpl.hasCover) fail("NOT_FOUND", `template ${tpl.id} has no cover`)
    const abs = join(ws.templatesDir, tpl.id, "cover.png")
    const w = ctx.url.searchParams.has("w") ? normalizeWidth(ctx.url.searchParams.get("w")) : null
    if (w) {
      const t = await thumbnail(ws, abs, w)
      return { status: 200, file: t.path, headers: t.resized ? {} : { "X-KitGen-Thumb": "unavailable" } }
    }
    return { status: 200, file: abs }
  })

  r.patch("/api/templates/:id", async ctx => ({
    status: 200,
    json: { template: await patchTemplate(ctx.registry.active, ctx.params.id, await ctx.json()) },
  }))

  r.delete("/api/templates/:id", async ctx => ({
    status: 200, json: await deleteTemplate(ctx.registry.active, ctx.params.id),
  }))
}
