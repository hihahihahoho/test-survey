/* routes/runs.mjs — §6.2 E: #32..#40. Chạy gen/slice/skeleton + stream NDJSON + dừng
   + log/prompt từng lượt + lịch sử ảnh raw 3 đời. */
import { join } from "node:path"
import { fail } from "../lib/errors.mjs"
import { exists, readFile, readdir, stat, mtimeOf, ensureDir, copyFile, readTailFile } from "../lib/fsx.mjs"
import { redactLine } from "../lib/redact.mjs"
import { RE_JOB, RE_RUN_ID, assertMatch, safeSegment } from "../lib/paths.mjs"
import { projectDir, readProject } from "../lib/projects.mjs"
import { sanitizeRun } from "../lib/runs.mjs"
import { readContract } from "../lib/contract.mjs"
import { validateContract } from "../lib/validate.mjs"

const QUOTA_PER_JOB = [3, 5]
const MAX_LOG_READ_BYTES = 4 * 1024 * 1024

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

  // #37 log 1 lượt (đã redact)
  r.get("/api/runs/:runId/jobs/:job/log", async ctx => {
    const { dir, projectId } = await ctx.runs.find(ctx.params.runId)
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const tail = Math.min(20000, Math.max(1, Number(ctx.url.searchParams.get("tail") ?? 2000) || 2000))
    const candidates = [
      join(dir, "logs", `${job}.log`),
      join(projectDir(ctx.registry.active, projectId), "logs", `${job}.log`),
    ]
    for (const abs of candidates) {
      if (!(await exists(abs))) continue
      const raw = await readTailFile(abs, MAX_LOG_READ_BYTES)
      const lines = raw.split("\n")
      const text = lines.slice(Math.max(0, lines.length - tail)).map(redactLine).join("\n")
      return { status: 200, text, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    }
    fail("LOG_NOT_FOUND", `log for job ${job} not found`)
  })

  // #38 prompt đã dùng
  r.get("/api/runs/:runId/jobs/:job/prompt", async ctx => {
    const { projectId } = await ctx.runs.find(ctx.params.runId)
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const pdir = projectDir(ctx.registry.active, projectId)
    const txt = join(pdir, "prompts", `${job}.txt`)
    if (!(await exists(txt))) fail("NOT_FOUND", `prompt for job ${job} not found`)
    const prompt = redactLine(await readFile(txt, "utf8"))
    let attachments = []
    const att = join(pdir, "prompts", `${job}.att`)
    if (await exists(att))
      attachments = (await readFile(att, "utf8")).split("\n").map(s => s.trim()).filter(Boolean)
    return { status: 200, json: { prompt, attachments } }
  })

  // #39 lịch sử ảnh raw (3 đời)
  r.get("/api/projects/:id/raw/:job/history", async ctx => {
    const ws = ctx.registry.active
    const job = assertMatch(RE_JOB, ctx.params.job, "BAD_REQUEST", "job")
    const dir = join(projectDir(ws, ctx.params.id), ".history", "raw")
    await ensureDir(dir)
    const items = []
    for (const name of (await readdir(dir).catch(() => []))) {
      const m = new RegExp(`^${job}@(r-\\d+)\\.png$`).exec(name)
      if (!m) continue
      const st = await stat(join(dir, name)).catch(() => null)
      if (!st) continue
      items.push({ id: m[1], at: new Date(st.mtimeMs).toISOString(), bytes: st.size, current: false })
    }
    const cur = join(projectDir(ws, ctx.params.id), "raw", `${job}.png`)
    if (await exists(cur)) {
      const st = await stat(cur)
      items.push({ id: "current", at: new Date(st.mtimeMs).toISOString(), bytes: st.size, current: true })
    }
    items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
    return { status: 200, json: { items } }
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
    if (await exists(dst)) {
      await ensureDir(join(pdir, ".history", "raw"))
      await copyFile(dst, join(pdir, ".history", "raw", `${job}@restore-${Date.now()}.png`))
    }
    await copyFile(src, dst)
    return { status: 200, json: { restored: true, mtime: new Date(await mtimeOf(dst)).toISOString() } }
  })
}
