/* routes/cover.mjs — #43/#44: trạng thái ảnh bìa + tạo lại ảnh bìa.
 *
 * BYTE CỦA ẢNH KHÔNG ĐI QUA ĐÂY. Ảnh nằm ở `cover/cover.png` và được phục vụ bằng
 * ĐÚNG đường đọc file đã có (#41 `GET /api/projects/:id/files/cover/cover.png?w=256`,
 * xem routes/files.mjs): cùng chống traversal, cùng thumbnail, cùng ETag. Dựng một
 * đường phục vụ ảnh thứ hai chỉ để riêng ảnh bìa là nhân đôi bề mặt tấn công mà không
 * được thêm gì.
 *
 * Ảnh bìa là JOB PHỤ (xem lib/cover.mjs ①) nên nó KHÔNG nằm trong RunStore: không
 * chiếm suất "mỗi project một run", không xuất hiện trong lịch sử lượt chạy.
 */
import { fail } from "../lib/errors.mjs"
import { readProject } from "../lib/projects.mjs"
import { coverRunning, coverStatus, startCover } from "../lib/cover.mjs"

export function register(r) {
  // #43 — trạng thái ảnh bìa (none | running | ok | failed) + toạ độ vùng tiêu đề.
  r.get("/api/projects/:id/cover", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)
    return { status: 200, json: { cover: await coverStatus(ws, ctx.params.id) } }
  })

  // #44 — tạo lại ảnh bìa (nút "Tạo lại ảnh bìa" của S2b). 202 = đã nhận, chạy nền.
  r.post("/api/projects/:id/cover", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    const project = await readProject(ws, id)
    if (project.broken) fail("PROJECT_BROKEN", "cannot draw a cover for a broken project")

    if (coverRunning(ws, id))
      fail("COVER_RUNNING", `project ${id} is already drawing its cover`,
        { details: { startedAt: coverRunning(ws, id).startedAt } })

    // Chặn TRƯỚC KHI CHẠY khi không tạo được ảnh — cùng luật với lượt gen (#32),
    // để người dùng nhận đúng lý do thay vì một job nền chết câm sau 2 phút.
    const d = await ctx.doctor(ws)
    if (!d.imageGen.available)
      fail("IMAGEGEN_UNAVAILABLE", `image generation is not available (${d.imageGen.reason ?? "unknown"})`,
        { details: { reason: d.imageGen.reason ?? "UNKNOWN", mode: d.imageGen.mode, needsFallbackHome: d.imageGen.needsFallbackHome } })

    const started = await startCover(ws, id, {
      /* Hồ sơ ảnh riêng đã bỏ (24/08/2026) — chỉ còn cửa thoát dev/test. */
      imgHome: process.env.KITGEN_CODEX_HOME ?? null,
      force: true,
    })
    if (started.status === "skipped")
      fail("COVER_UNAVAILABLE", `cannot draw cover: ${started.reason}`, { details: { reason: started.reason } })

    return { status: 202, json: { cover: await coverStatus(ws, id) } }
  })
}
