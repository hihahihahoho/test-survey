/* runs.mjs — run-store first-class (architecture §3.3): trạng thái sống trên ĐĨA
   (`runs/<runId>/run.json`) nên đóng tab / restart agent vẫn đúng tiến độ (đóng D5, D8).
   Mỗi project tối đa 1 run → 409 RUN_CONFLICT kèm runId đang chạy (đóng E5).
   Job PHÁN THEO SẢN PHẨM (mtime raw/<job>.png >= t0), KHÔNG theo exit code (gen.sh:167-176). */
import { join } from "node:path"
import { ensureDir, exists, readJsonFile, writeJsonAtomic, readdir, mtimeOf, stat, copyFile } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { RE_RUN_ID, RE_JOB, assertMatch } from "./paths.mjs"
import { projectDir } from "./projects-dir.mjs"
import { readContract, contractJobs } from "./contract.mjs"
import { RunHandle } from "./run-handle.mjs"
import { redactLine } from "./redact.mjs"

/* ĐAI AN TOÀN THỨ HAI cho `errorTail` (BACKLOG #22).
 * `RunHandle.tidyTail()` đã redact TRƯỚC khi ghi xuống đĩa, nên về lý thuyết run.json
 * đã sạch. Nhưng `run.json` là FILE TRÊN ĐĨA: nó có thể do một bản agent CŨ HƠN ghi
 * ra, do người dùng chép từ máy khác sang, hoặc bị sửa tay. Đường ra API vì thế redact
 * lần nữa — rẻ (vài dòng chữ) và biến hợp đồng "không lộ path tuyệt đối" thành thứ
 * đúng theo CẤU TRÚC chứ không theo lịch sử của file.
 * Trả BẢN SAO NÔNG: `run` của handle đang chạy là state sống trong RAM, redact tại chỗ
 * sẽ ghi đè chính nó ở mỗi lần GET. */
export function sanitizeRun(run) {
  if (!run || typeof run !== "object") return run
  return {
    ...run,
    failSummary: run.failSummary ? redactLine(run.failSummary) : (run.failSummary ?? null),
    jobs: (run.jobs ?? []).map(j =>
      Array.isArray(j?.errorTail) ? { ...j, errorTail: j.errorTail.map(redactLine) } : j),
  }
}

/** QUÉT LƯỢT CHẠY MỒ CÔI LÚC KHỞI ĐỘNG.
 *
 *  `RunHandle` chỉ sống trong bộ nhớ của MỘT tiến trình agent. Tiến trình trước chết
 *  giữa lượt (kill -9, máy ngủ rồi mất tiến trình, cài bản mới) thì `run.json` còn nguyên
 *  `"running"` mà không còn ai chạy. Hậu quả đo được ở web: `isRunLive(status)` = true ⇒
 *  dải "Đang tạo ảnh…" quay MÃI MÃI với một nút Dừng chỉ trả về `RUN_NOT_FOUND`/409, và
 *  `state.activeRun` thì lại `null` (nó đọc handle trong RAM) — hai nguồn nói ngược nhau.
 *
 *  Boot là chỗ DUY NHẤT biết chắc "không job nào của lượt trước còn sống", nên dọn ở đây,
 *  cùng chỗ với `sweepOrphanCovers`. Ba việc, không hơn:
 *   ① NHẶT LẠI ẢNH ĐÃ TỐN QUOTA: `raw/<job>.png` ghi ra SAU khi lượt bắt đầu ⇒ job đó
 *     thực sự đã xong, dù `run.json` chưa kịp ghi. Chép sang `runs/<id>/artifacts/` để nó
 *     thành ảnh bất biến của lượt, đánh dấu `recovered` để không ai tưởng đây là bản gốc.
 *   ② Job không có ảnh → `queued` trong một run `cancelled` = "đã dừng", đúng ngữ nghĩa
 *     "chưa vẽ tới" (KHÔNG phải `failed`: agent chết không phải lỗi của bức ảnh).
 *   ③ Đánh dấu run `cancelled` + `interrupted: true` để web mời "Chạy tiếp phần thiếu".
 *  KHÔNG bao giờ xoá/ghi đè `raw/` — ảnh đã tốn quota là thứ đắt nhất trong thư mục này.
 */
export async function sweepOrphanRuns(ws) {
  const ents = await readdir(ws.projectsDir, { withFileTypes: true }).catch(() => [])
  const swept = []
  for (const e of ents) {
    if (!e.isDirectory()) continue
    const pdir = join(ws.projectsDir, e.name)
    const runsDir = join(pdir, "runs")
    for (const name of (await readdir(runsDir).catch(() => []))) {
      if (!RE_RUN_ID.test(name)) continue
      const dir = join(runsDir, name)
      let run = null
      try { run = await readJsonFile(join(dir, "run.json")) } catch { continue }
      if (run?.status !== "running" && run?.status !== "queued") continue
      const t0 = Math.floor((Date.parse(run.startedAt ?? "") || 0) / 1000)
      for (const j of run.jobs ?? []) {
        if (j.status === "ok" && j.artifact) continue
        const png = join(pdir, "raw", `${j.job}.png`)
        const mt = await mtimeOf(png)
        if (mt > 0 && Math.floor(mt / 1000) >= t0) {
          if (!j.artifact) {
            await ensureDir(join(dir, "artifacts"))
            await copyFile(png, join(dir, "artifacts", `${j.job}.png`)).catch(() => null)
            const st = await stat(png).catch(() => null)
            j.artifact = {
              path: `runs/${run.id}/artifacts/${j.job}.png`,
              bytes: st?.size ?? 0, writtenAt: new Date(mt).toISOString(), validation: null,
            }
          }
          j.status = "ok"
          j.recovered = true
        } else if (j.status !== "failed") {
          j.status = "queued"
        }
      }
      run.status = "cancelled"
      run.interrupted = true
      run.finishedAt = run.finishedAt ?? new Date().toISOString()
      run.progress = {
        ...(run.progress ?? {}),
        done: (run.jobs ?? []).filter(j => j.status === "ok").length,
        failed: (run.jobs ?? []).filter(j => j.status === "failed").length,
        etaSeconds: null,
      }
      await writeJsonAtomic(join(dir, "run.json"), run).catch(() => null)
      swept.push(`${e.name}/${run.id}`)
    }
  }
  return swept
}

export class RunStore {
  constructor(ws) {
    this.ws = ws
    this.active = new Map()   // projectId → RunHandle
    this.byId = new Map()     // runId → RunHandle
  }

  activeForProject(projectId) { return this.active.get(projectId) ?? null }

  async nextRunId(projectId) {
    const dir = join(projectDir(this.ws, projectId), "runs")
    await ensureDir(dir)
    const ents = await readdir(dir).catch(() => [])
    let max = 0
    for (const e of ents) { const m = /^r-(\d+)$/.exec(e); if (m) max = Math.max(max, Number(m[1])) }
    return `r-${String(max + 1).padStart(4, "0")}`
  }

  /** Tạo run: validate jobs là DANH TỪ có trong contract (đóng E7 — v1 dùng substring filter). */
  async start(projectId, { kind, jobs, maxJobs = 4, autoSliceAfterGen = true, imgHome = null }) {
    const existing = this.active.get(projectId)
    if (existing && !existing.finished) {
      fail("RUN_CONFLICT", `project ${projectId} already has run ${existing.id}`, {
        details: {
          runId: existing.id, kind: existing.kind, startedAt: existing.run.startedAt,
          progress: existing.run.progress,
        },
      })
    }
    if (!["gen", "slice", "skeleton"].includes(kind)) fail("BAD_REQUEST", `invalid run kind ${kind}`)

    const { contract } = await readContract(this.ws, projectId)
    const known = new Map(contractJobs(contract).map(j => [j.job, j]))
    let selected = []
    if (kind === "skeleton") {
      selected = []
    } else {
      const want = Array.isArray(jobs) && jobs.length ? jobs.map(String) : [...known.keys()]
      const unknown = want.filter(j => !known.has(j))
      if (unknown.length) fail("UNKNOWN_JOB", `unknown jobs: ${unknown.join(", ")}`, { details: { unknown } })
      for (const j of want) assertMatch(RE_JOB, j, "BAD_REQUEST", "job")
      selected = want.map(j => known.get(j))
    }

    // CODEX_HOME riêng cho job ảnh là FALLBACK, chỉ dùng khi doctor báo mode img-home
    const cfg = await this.ws.config()
    const runId = await this.nextRunId(projectId)
    const dir = join(projectDir(this.ws, projectId), "runs", runId)
    await ensureDir(join(dir, "logs"))

    const total = kind === "skeleton" ? 1 : selected.length
    const phases = kind === "gen" && autoSliceAfterGen ? 2 : 1
    const run = {
      id: runId, projectId, kind, status: "queued",
      startedAt: new Date().toISOString(), finishedAt: null, maxJobs: Math.min(Math.max(1, Number(maxJobs) || 4), 8),
      phase: { index: 1, total: phases, name: kind },
      progress: { done: 0, total, failed: 0, etaSeconds: null },
      jobs: selected.map(j => ({
        job: j.job, variant: j.variant, sheet: j.sheet, status: "queued",
        startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: null,
        /* BACKLOG #22 — 2-3 dòng cuối stderr/log của job, ĐÃ redact. Khai sẵn `null`
           để hình dạng run.json không đổi giữa chừng lượt chạy. */
        errorTail: null,
      })),
      /** Một câu gộp cho cả lượt ("10/10 job không ghi được ảnh"). Xem summarizeFailures. */
      failSummary: null,
      seq: 0,
    }
    const handle = new RunHandle(this, run, dir, {
      autoSliceAfterGen, contract,
      imgHome: imgHome ?? (cfg.imageGen?.mode === "img-home" ? cfg.imageGen.codexHome : null),
    })
    this.active.set(projectId, handle)
    this.byId.set(runId, handle)
    await handle.persist()
    await writeJsonAtomic(join(projectDir(this.ws, projectId), "runs", "latest.json"), { runId })
    handle.launch().catch(async e => { await handle.failEnv(String(e?.message ?? e)) })
    return handle
  }

  async get(projectId, runId) {
    const h = this.byId.get(runId)
    if (h) return h.run
    assertMatch(RE_RUN_ID, runId, "BAD_REQUEST", "runId")
    const f = join(projectDir(this.ws, projectId), "runs", runId, "run.json")
    if (!(await exists(f))) fail("RUN_NOT_FOUND", `run ${runId} not found`)
    return readJsonFile(f)
  }

  /** Tìm run theo id trong mọi project (endpoint #34/#35/#36 không có :id). */
  async find(runId) {
    assertMatch(RE_RUN_ID, runId, "BAD_REQUEST", "runId")
    const h = this.byId.get(runId)
    if (h) return { run: h.run, handle: h, dir: h.dir, projectId: h.run.projectId }
    const ents = await readdir(this.ws.projectsDir, { withFileTypes: true }).catch(() => [])
    for (const e of ents) {
      if (!e.isDirectory()) continue
      const dir = join(this.ws.projectsDir, e.name, "runs", runId)
      if (await exists(join(dir, "run.json")))
        return { run: await readJsonFile(join(dir, "run.json")), handle: null, dir, projectId: e.name }
    }
    fail("RUN_NOT_FOUND", `run ${runId} not found`)
  }

  async list(projectId, limit = 20) {
    const dir = join(projectDir(this.ws, projectId), "runs")
    const ents = (await readdir(dir).catch(() => [])).filter(n => RE_RUN_ID.test(n)).sort().reverse().slice(0, limit)
    const out = []
    for (const n of ents) {
      try { out.push(await readJsonFile(join(dir, n, "run.json"))) } catch { /* bỏ run hỏng */ }
    }
    return out
  }

  /** Dùng bởi DELETE project: dừng RỒI ĐỢI hẳn, cuối cùng CẮT đường ghi đĩa (detach).
   *  Nếu chỉ cancel() không đợi, tiến trình con chết muộn sẽ ghi lại vào projects/<id>/
   *  vừa được move sang thùng rác ⇒ thư mục ma + nút Hoàn tác trả 409 (xem run-handle.cancel). */
  async cancelAllForProject(projectId) {
    const h = this.active.get(projectId)
    if (!h || h.finished) {
      // Đã kết thúc nhưng vẫn có thể còn bút toán muộn đang bay → vẫn phải cắt đường ghi.
      h?.detach()
      return []
    }
    /* `settle: false` — khác hẳn nút Dừng của người dùng. Ở đó ta còn cắt nốt tấm đã
       tốn quota (settleCancelledSheets); ở đây thư mục project sắp bị move sang thùng
       rác, nên spawn thêm một lượt slice.py ghi vào đó chính là "thư mục ma" của C-01. */
    const r = await h.cancel({ waitMs: 5000, settle: false })
    h.detach()
    return [r.runId]
  }
}

