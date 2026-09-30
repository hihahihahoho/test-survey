/* routes/templates.mjs — TEMPLATE CỦA NGƯỜI DÙNG (lib/project-templates.mjs).
 *
 *   POST   /api/projects/:id/save-template   chụp dự án thành template     → 201 {template}
 *   GET    /api/templates                    danh sách, mới lưu trước      → {items}
 *   GET    /api/templates/:id/cover          hình thu nhỏ (?w= như #41)    → png | 404
 *   PATCH  /api/templates/:id                đổi tên / mô tả               → {template}
 *   DELETE /api/templates/:id                xoá mềm vào thùng rác         → {ok:true}
 *
 *   POST   /api/templates/:id/edit           mở / mở lại phiên sửa nội dung → {project, template, resumed}
 *   POST   /api/templates/:id/edit/commit    lưu phiên sửa vào template     → {template}
 *   DELETE /api/templates/:id/edit           huỷ phiên sửa (idempotent)     → {ok:true}
 *
 * Đường TẠO dự án từ template là `POST /api/projects` + `fromTemplate` (routes/projects.mjs):
 * cùng một cửa tạo, cùng luật đặt id, cùng mã lỗi — không phải một cửa tạo thứ hai.
 *
 * Phiên sửa nội dung = một DỰ ÁN LÀM VIỆC vô hình (xem đầu lib/project-templates.mjs). Màn
 * soạn sửa nó qua đúng các route `/api/projects/:id/…` đã có; ba route `edit` ở đây chỉ mở,
 * lưu và huỷ phiên. Mọi item của `GET /api/templates` (và mọi `template` trả về) mang
 * `editing: {projectId, startedAt} | null` — phiên đang mở, để web vẽ nhãn «đang sửa» và
 * dẫn thẳng về tờ nháp thay vì mở tờ thứ hai.
 *
 * Mọi `:id` template qua `RE_TEMPLATE_ID` TRƯỚC khi chạm đĩa (bên trong lib) ⇒ `..`,
 * `%2F`, chữ hoa, dấu chấm đầu đều là 400 chứ không bao giờ thành một đường dẫn.
 */
import { createHash } from "node:crypto"
import {
  commitTemplateEdit, deleteTemplate, discardTemplateEdit, listTemplates, patchTemplate, readTemplate,
  readTemplateCover, saveProjectAsTemplate, startTemplateEdit,
} from "../lib/project-templates.mjs"
import { applyActiveRun, computeState, readProject } from "../lib/projects.mjs"
import { normalizeWidth } from "../lib/thumbs.mjs"

export function register(r) {
  r.post("/api/projects/:id/save-template", async ctx => {
    const template = await saveProjectAsTemplate(ctx.registry.active, ctx.params.id, await ctx.json())
    return { status: 201, json: { template } }
  })

  r.get("/api/templates", async ctx => ({
    status: 200, json: { items: await listTemplates(ctx.registry.active) },
  }))

  /* Cùng bộ co ảnh với #41 (`?w=128` cho ô 48px của hộp Tạo dự án), cùng no-cache. Không
     có ảnh bìa ⇒ 404 thật, để web vẽ ô giữ chỗ thay vì đợi. Ảnh GỐC đi ra từ bộ nhớ chứ
     không qua `sendFile`: nó đã được đọc trọn dưới cổng đọc của lib — lý do ở
     `readTemplateCover`. Bản thu nhỏ nằm trong cache (ngoài thư mục template) nên vẫn đi
     `sendFile` như mọi ảnh.
     ETag của ảnh gốc dựng từ NỘI DUNG, không từ mtime: lưu phiên sửa chép bìa sang thư mục
     mới (mtime mới, bytes y nguyên) — ETag theo mtime bắt trình duyệt tải lại một tấm ảnh
     không đổi sau mỗi lần lưu. Băm vài MB mỗi lần hỏi là rẻ; bản thu nhỏ mới là đường nóng. */
  r.get("/api/templates/:id/cover", async ctx => {
    const w = ctx.url.searchParams.has("w") ? normalizeWidth(ctx.url.searchParams.get("w")) : null
    const c = await readTemplateCover(ctx.registry.active, ctx.params.id, w)
    if (c.file) return { status: 200, file: c.file }
    const etag = `"${createHash("sha256").update(c.buffer).digest("hex").slice(0, 24)}-${c.buffer.length}"`
    const headers = {
      "Content-Type": "image/png", "Cache-Control": "no-cache", ETag: etag,
      "Last-Modified": new Date(c.mtimeMs).toUTCString(),
      ...(w ? { "X-KitGen-Thumb": "unavailable" } : {}),
    }
    if (ctx.req.headers["if-none-match"] === etag) return { status: 304, headers }
    return { status: 200, buffer: c.buffer, headers }
  })

  r.patch("/api/templates/:id", async ctx => ({
    status: 200,
    json: { template: await patchTemplate(ctx.registry.active, ctx.params.id, await ctx.json()) },
  }))

  r.delete("/api/templates/:id", async ctx => ({
    status: 200, json: await deleteTemplate(ctx.registry.active, ctx.params.id),
  }))

  /* `project` CÙNG HÌNH với `GET /api/projects/:id` (readProject + computeState + activeRun)
     — web đổ thẳng nó vào cache dự án rồi mở màn soạn, không phải hỏi lại. Nó mang
     `templateEdit: {templateId, templateName, startedAt, templateUpdatedAt, …}` để màn soạn
     biết mình đang sửa template nào (đổi nút «Vẽ» thành «Lưu vào template»). */
  r.post("/api/templates/:id/edit", async ctx => {
    const ws = ctx.registry.active
    const { projectId, resumed } = await startTemplateEdit(ws, ctx.params.id)
    const project = await readProject(ws, projectId)
    Object.assign(project, await computeState(ws, projectId, project))
    applyActiveRun(project, ctx.runs.activeForProject(projectId))
    return { status: 200, json: { project, template: await readTemplate(ws, ctx.params.id), resumed } }
  })

  r.post("/api/templates/:id/edit/commit", async ctx => ({
    status: 200, json: { template: await commitTemplateEdit(ctx.registry.active, ctx.params.id) },
  }))

  r.delete("/api/templates/:id/edit", async ctx => ({
    status: 200, json: await discardTemplateEdit(ctx.registry.active, ctx.params.id),
  }))
}
