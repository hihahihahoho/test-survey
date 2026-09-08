/* routes/runs.mjs — §6.2 E: #32..#40. Chạy gen/slice + stream NDJSON + dừng
   + log/prompt từng lượt + lịch sử ảnh raw 3 đời. */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, readFile, stat, mtimeOf, ensureDir, removeTree, writeFileAtomic } from "../lib/fsx.mjs"
import { RE_JOB, RE_RUN_ID, assertMatch, safeSegment } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { sanitizeRun } from "../lib/runs.mjs"
import { readContract } from "../lib/contract.mjs"
import { validateContract } from "../lib/validate.mjs"
import {
  RE_RAW_HISTORY_ID, archiveRaw, listRawHistory, rawHistoryDir, rawHistoryName,
} from "../lib/raw-history.mjs"

const QUOTA_PER_JOB = [3, 5]

export function register(r) {
  // #32 POST runs
  r.post("/api/projects/:id/runs", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const body = await ctx.json()
    const kind = String(body.kind ?? "gen")

    const { contract } = await readContract(ws, id)
    const v = validateContract(contract)
    if (v.errors.length)
      fail("CONTRACT_INVALID", `contract has ${v.errors.length} error(s), cannot run`, { details: { errors: v.errors } })

    if (kind === "gen") {
      // Chặn TRƯỚC KHI CHẠY nếu không tạo được ảnh (đóng E1 tại gốc)
      const d = await ctx.doctor(ws)
      if (!d.imageGen.available)
        fail("IMAGEGEN_UNAVAILABLE", `image generation is not available (${d.imageGen.reason ?? "unknown"})`,
          { details: { reason: d.imageGen.reason ?? "UNKNOWN", mode: d.imageGen.mode, needsFallbackHome: d.imageGen.needsFallbackHome } })
    }

    const handle = await ctx.runs.start(id, {
      kind,
      jobs: body.jobs,
      maxJobs: body.maxJobs,
      autoSliceAfterGen: body.autoSliceAfterGen !== false,
    })
    const n = handle.run.jobs.length
    return {
      status: 202,
      json: {
        runId: handle.id,
        jobs: handle.run.jobs.map(j => ({ job: j.job, status: j.status })),
        estimate: {
          seconds: [Math.round((n / handle.run.maxJobs) * 90), Math.round((n / handle.run.maxJobs) * 150)],
          quotaUnits: [n * QUOTA_PER_JOB[0], n * QUOTA_PER_JOB[1]],
        },
      },
    }
  })

  // #33 list runs của project
  r.get("/api/projects/:id/runs", async ctx => {
    const limit = Math.min(50, Math.max(1, Number(ctx.url.searchParams.get("limit") ?? 20) || 20))
    const items = await ctx.runs.list(ctx.params.id, limit)
    return { status: 200, json: { items: items.map(sanitizeRun) } }
  })

  // #34 GET run (nguồn của fallback poll 2s)
  r.get("/api/runs/:runId", async ctx => {
    const { run } = await ctx.runs.find(ctx.params.runId)
    return { status: 200, json: sanitizeRun(run) }
  })

  // #35 stream NDJSON
  r.get("/api/runs/:runId/stream", async ctx => {
    const from = Math.max(0, Number(ctx.url.searchParams.get("from") ?? 0) || 0)
    const found = await ctx.runs.find(ctx.params.runId)
    return { status: 200, ndjson: { found, from } }
  })

  // #36 cancel
  r.post("/api/runs/:runId/cancel", async ctx => {
    const { handle, run } = await ctx.runs.find(ctx.params.runId)
    if (!handle || handle.finished) fail("RUN_FINISHED", `run ${run.id} already finished`)
    return { status: 200, json: await handle.cancel() }
  })

  // #39 lịch sử ảnh raw (3 đời)
  r.get("/api/projects/:id/raw/:job/history", async ctx => {
    const ws = ctx.registry.active
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    /* Liệt kê nằm ở `lib/raw-history.mjs` — CHUNG với chỗ CẤT (`run-handle.launch`)
       và chỗ XOÁ (#39.1). Ba nơi tự viết lại cùng một mẫu tên file là ba cơ hội để
       bản cất được mà không bao giờ hiện ra. */
    const items = await listRawHistory(ws, ctx.params.id, job)
    const cur = join(projectDir(ws, ctx.params.id), "raw", `${job}.png`)
    if (await exists(cur)) {
      const st = await stat(cur)
      items.push({ id: "current", at: new Date(st.mtimeMs).toISOString(), bytes: st.size, current: true })
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
    return { status: 200, json: { items } }
  })

  /* #39.1 XOÁ MỘT BẢN LỊCH SỬ.
     ╔══ BA CHỐT CHẶN, KHÔNG BỚT CÁI NÀO ═══════════════════════════════════════╗
     ║ ① `hid` phải khớp `r-<số>` — `safeSegment` chặn `..` và dấu phân cách,    ║
     ║   `RE_RAW_HISTORY_ID` chặn phần còn lại. Đường dẫn đích được DỰNG LẠI từ  ║
     ║   `job` + `hid` đã kiểm, không bao giờ ghép chuỗi của client vào path.    ║
     ║ ② Id `current` bị từ chối THẲNG: nó không phải file trong `.history/`, và ║
     ║   xoá "bản đang dùng" là xoá `raw/<job>.png` — đầu vào của bước cắt, thứ  ║
     ║   nút này KHÔNG BAO GIỜ được phép chạm tới. Từ chối bằng một mã riêng để  ║
     ║   web nói được lý do thay vì "không tìm thấy".                            ║
     ║ ③ Không xoá giữa lượt chạy: `#40` đã chặn vậy, và cùng lý do — engine có  ║
     ║   thể đang ghi vào đúng thư mục này.                                      ║
     ╚═══════════════════════════════════════════════════════════════════════════╝ */
  r.delete("/api/projects/:id/raw/:job/history/:hid", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    await readProject(ws, id)
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const hid = safeSegment(ctx.params.hid, "historyId")
    if (hid === "current")
      fail("HISTORY_CURRENT", "the version in use cannot be deleted", { details: { job } })
    assertMatch(RE_RAW_HISTORY_ID, hid, "BAD_REQUEST", "historyId")
    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished) fail("RUN_ACTIVE", `run ${active.id} is active`, { details: { runId: active.id } })
    const abs = join(rawHistoryDir(ws, id), rawHistoryName(job, hid))
    if (!(await exists(abs))) fail("NOT_FOUND", `raw history ${hid} for ${job} not found`)
    await removeTree(abs)
    return { status: 200, json: { deleted: true, id: hid } }
  })

  // #40 khôi phục ảnh raw từ lịch sử
  r.post("/api/projects/:id/raw/:job/restore", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished) fail("RUN_ACTIVE", `run ${active.id} is active`, { details: { runId: active.id } })
    const body = await ctx.json()
    const historyId = safeSegment(body.historyId, "historyId")
    assertMatch(RE_RUN_ID, historyId, "BAD_REQUEST", "historyId")
    const pdir = projectDir(ws, id)
    const src = join(pdir, ".history", "raw", `${job}@${historyId}.png`)
    if (!(await exists(src))) fail("NOT_FOUND", `raw history ${historyId} for ${job} not found`)
    const dst = join(pdir, "raw", `${job}.png`)
    await ensureDir(join(pdir, "raw"))
    /* ĐỌC NGUỒN VÀO BỘ NHỚ TRƯỚC KHI CẤT — thứ tự này không phải ngẫu nhiên.
       `archiveRaw` cất bản đang dùng rồi TỈA lịch sử về 3 đời; nếu lịch sử đã đủ 3 thì
       bản bị tỉa có thể chính là `src` mà ta sắp chép về. Chép sau khi tỉa là `ENOENT`
       ở giữa một thao tác đã ghi đè xong một nửa. Giữ bytes trong tay thì tỉa gì cũng
       không ảnh hưởng. Ảnh một tấm cỡ MB — rẻ hơn nhiều so với một trạng thái nửa vời.
       Cất bằng đúng hàm mà lượt gen dùng: bản cũ ở đây ghi tên `<job>@restore-<ms>.png`,
       một dạng mà `#39` KHÔNG liệt kê được (mẫu của nó là `r-<số>`), nên bản vừa bị ghi
       đè biến mất khỏi thanh phiên bản ngay lúc người dùng cần nó nhất: để bấm quay lại. */
    const bytes = await readFile(src)
    await archiveRaw(ws, id, job)
    await writeFileAtomic(dst, bytes)
    return { status: 200, json: { restored: true, mtime: new Date(await mtimeOf(dst)).toISOString() } }
  })
}
