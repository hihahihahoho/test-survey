/* run-handle.mjs — một lượt chạy: spawn engine, phát event NDJSON, phán trạng thái job.
   Job PHÁN THEO SẢN PHẨM (mtime raw/<job>.png >= t0), KHÔNG theo exit code (gen.sh:167-176). */
import { spawn } from "node:child_process"
import { join } from "node:path"
import { ensureDir, exists, writeJsonAtomic, mtimeOf, stat, readFile, writeFile } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { redactLine } from "./redact.mjs"
import { projectDir } from "./projects-dir.mjs"
import { resolveEngine, prepareEngine, materializeStyles, buildCommand, diagnose } from "./engine.mjs"

const HEARTBEAT_MS = 15000
const MAX_BUFFER_EVENTS = 4000

export class RunHandle {
  constructor(store, run, dir, opts) {
    this.store = store
    this.ws = store.ws
    this.run = run
    this.id = run.id
    this.kind = run.kind
    this.dir = dir
    this.opts = opts
    this.events = []
    this.subs = new Set()
    this.child = null
    this.finished = false
    this.cancelled = false
    /* detached = "lượt chạy này KHÔNG còn quyền chạm đĩa nữa" (project đã bị move sang
       thùng rác). Khác với cancelled/finished: đó là trạng thái LOGIC của run, còn đây là
       trạng thái VẬT LÝ của thư mục đích. Xem detach(). */
    this.detached = false
    /* Promise của pha đang chạy, để cancel() ĐỢI child chết hẳn + ghi nốt run.json
       TRƯỚC khi caller (DELETE project) move thư mục đi. */
    this.phaseDone = null
    this.jobStart = new Map()
    this.t0 = Math.floor(Date.now() / 1000)
    this.durations = []
    this.hb = setInterval(() => this.emit({ type: "heartbeat" }), HEARTBEAT_MS)
    this.hb.unref?.()
  }

  /* writeJsonAtomic() gọi ensureDir(dirname) ⇒ nếu ghi SAU khi project đã bị move sang
     thùng rác thì nó DỰNG LẠI projects/<id>/runs/<runId>/ — thư mục ma làm hỏng Hoàn tác
     (restore trả 409 PROJECT_ID_TAKEN). Vì vậy detached là chốt chặn cuối. */
  async persist() {
    if (this.detached) return
    try {
      await writeJsonAtomic(join(this.dir, "run.json"), this.run)
    } catch (e) {
      /* CUỘC ĐUA CÒN SÓT của C-01: detach() có thể xảy ra GIỮA lúc writeJsonAtomic đang
         chạy (nó là 3 bước await: ensureDir → writeFile tmp → rename). Nếu DELETE move
         thư mục project đi sau bước writeFile mà trước bước rename thì rename ném ENOENT.
         Đây KHÔNG phải lỗi cần báo: thư mục đích đã sang thùng rác đúng như người dùng
         yêu cầu, và ta CỐ Ý không dựng lại nó. Nuốt đúng ENOENT/ENOTDIR, ném tiếp lỗi khác
         (hết đĩa, EACCES…) để không giấu sự cố thật.
         Trước bản vá này, lỗi thoát ra từ child.on('close') → unhandled rejection →
         CẢ TIẾN TRÌNH AGENT CHẾT. Đo được: crash 1/10 lần chạy test-agent.mjs. */
      if (e?.code === "ENOENT" || e?.code === "ENOTDIR") { this.detached = true; return }
      throw e
    }
  }

  /** Cắt mọi đường ghi xuống đĩa của lượt chạy này (project sắp/đã rời khỏi projects/).
   *  Event vẫn phát cho subscriber đang mở stream, chỉ KHÔNG chạm ổ đĩa nữa. */
  detach() {
    this.detached = true
    clearInterval(this.hb)
  }

  emit(ev) {
    this.run.seq += 1
    const line = { seq: this.run.seq, t: new Date().toISOString(), ...ev }
    if (typeof line.line === "string") line.line = redactLine(line.line)
    this.events.push(line)
    if (this.events.length > MAX_BUFFER_EVENTS) this.events.splice(0, this.events.length - MAX_BUFFER_EVENTS)
    const text = JSON.stringify(line) + "\n"
    // detached ⇒ thư mục đích không còn thuộc projects/; ghi tiếp sẽ tái tạo thư mục ma.
    if (!this.detached) writeFile(join(this.dir, "events.ndjson"), text, { flag: "a" }).catch(() => {})
    for (const s of this.subs) { try { s(line) } catch { /* subscriber chết */ } }
    return line
  }

  subscribe(fn, fromSeq = 0) {
    for (const e of this.events) if (e.seq >= fromSeq) fn(e)
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  /** events từ đĩa cho client reconnect sau khi agent restart. */
  async replay(fromSeq) {
    if (this.events.length && this.events[0].seq <= fromSeq) return this.events.filter(e => e.seq >= fromSeq)
    const f = join(this.dir, "events.ndjson")
    if (!(await exists(f))) return []
    const raw = await readFile(f, "utf8")
    const out = []
    for (const l of raw.split("\n")) {
      if (!l.trim()) continue
      try { const e = JSON.parse(l); if (e.seq >= fromSeq) out.push(e) } catch { /* dòng cụt */ }
    }
    return out
  }

  /** Đã bị dừng (hoặc đã kết thúc) thì mọi bước sau KHÔNG được chạm đĩa nữa.
   *  Cửa sổ tử huyệt là quãng CHƯA spawn con: cancel() chỉ giết `this.child`, mà lúc đó
   *  child còn null ⇒ nếu launch() cứ đi tiếp thì nó dựng lại thư mục project vừa bị xoá
   *  (copy engine, ghi styles.json, ensureDir raw/logs/…) và ghi đè status về "running". */
  stopped() { return this.cancelled || this.finished }

  async launch() {
    if (this.stopped()) return
    const engineDir = await resolveEngine(this.ws)
    if (!engineDir) return this.failEnv("engine not installed (gen.sh not found)")
    if (this.stopped()) return
    const pdir = projectDir(this.ws, this.run.projectId)
    // engine neo đường dẫn theo thư mục chứa script → copy engine vào project (xem engine.mjs)
    try { await prepareEngine(engineDir, pdir) }
    catch (e) { return this.failEnv(String(e?.message ?? e)) }
    if (this.stopped()) return
    // styles.json thu hẹp đúng tập job đã chọn: filter của gen.sh là SUBSTRING nên không dùng argv
    const onlyJobs = this.run.jobs.map(j => ({ variant: j.variant, sheet: j.sheet }))
    await materializeStyles(pdir, this.opts.contract, onlyJobs.length ? onlyJobs : null)
    for (const d of ["raw", "logs", "prompts", "skeleton", "kits"]) await ensureDir(join(pdir, d))
    if (this.stopped()) return
    this.run.status = "running"
    await this.persist()
    this.emit({ type: "run.started", total: this.run.progress.total, maxJobs: this.run.maxJobs })
    await this.runPhase(this.run.kind, engineDir, pdir)
    if (this.cancelled) return this.finish("cancelled")
    if (this.run.kind === "gen" && this.opts.autoSliceAfterGen) {
      const okJobs = this.run.jobs.filter(j => j.status === "ok")
      if (okJobs.length) {
        this.run.phase = { index: 2, total: 2, name: "slice" }
        this.emit({ type: "phase.changed", phase: this.run.phase })
        await this.persist()
        await this.runPhase("slice", engineDir, pdir, [...new Set(okJobs.map(j => j.variant))])
      }
    }
    const failed = this.run.jobs.filter(j => j.status === "failed").length
    this.finish(failed ? "done-with-errors" : "done")
  }

  runPhase(kind, engineDir, pdir, variants = null) {
    if (this.stopped()) return Promise.resolve()      // đã dừng → không spawn thêm tiến trình
    const vs = variants ?? [...new Set(this.run.jobs.map(j => j.variant))]
    const { cmd, args, env } = buildCommand(kind, pdir,
      { variants: vs, maxJobs: this.run.maxJobs, imgHome: this.opts.imgHome })
    // Giữ promise để cancel() đợi được child chết + settleGenJobs()/persist() ghi xong.
    this.phaseDone = new Promise(done => {
      const child = spawn(cmd, args, {
        cwd: pdir, detached: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env, PATH: process.env.PATH },
      })
      this.child = child
      const onLine = (raw, level) => {
        const line = raw.trimEnd()
        if (!line) return
        this.emit({ type: "job.log", job: null, level, line })
        if (kind === "gen") this.parseGenLine(line)
      }
      lineReader(child.stdout, l => onLine(l, "info"))
      lineReader(child.stderr, l => onLine(l, "warn"))
      child.on("error", e => { this.emit({ type: "job.log", level: "error", line: `spawn failed: ${e.message}` }); done() })
      /* KHÔNG await được từ bên ngoài ⇒ mọi lỗi ở đây là UNHANDLED REJECTION và giết
         cả tiến trình agent. Bọc try/finally: done() phải chạy trong MỌI trường hợp,
         nếu không thì cancel({waitMs}) đợi phaseDone sẽ treo tới hết trần thời gian. */
      child.on("close", async code => {
        this.child = null
        try {
          this.emit({ type: "job.log", level: "info", line: `[${kind} exit ${code}]` })
          if (kind === "gen") await this.settleGenJobs()
          else if (kind === "slice") {
            this.run.progress.done = this.run.jobs.filter(j => j.status === "ok").length
            await this.persist()
          }
        } catch (e) {
          // Thư mục đã bị xoá giữa chừng là ca thường gặp và vô hại (xem persist).
          // Lỗi khác thì ghi ra stderr chứ không làm sập agent.
          if (e?.code !== "ENOENT" && e?.code !== "ENOTDIR")
            process.stderr.write(`[agent] run ${this.id}: ${redactLine(String(e?.message ?? e))}\n`)
        } finally { done() }
      })
    })
    return this.phaseDone
  }

  /** gen.sh in "OK  <job> …" / "FAIL <job> (…)" → cập nhật tiến độ realtime. */
  parseGenLine(line) {
    let m = /^OK\s+(\S+)/.exec(line)
    if (m) return this.markJob(m[1], "ok")
    m = /^FAIL\s+(\S+)/.exec(line)
    if (m) return this.markJob(m[1], "failed", line)
    m = /^prompt →\s+prompts\/(\S+)\.txt/.exec(line)
    if (m) {
      const j = this.run.jobs.find(x => x.job === m[1])
      if (j && j.status === "queued") { j.status = "running"; j.startedAt = new Date().toISOString(); this.emit({ type: "job.started", job: j.job }) }
    }
  }

  markJob(jobName, status, line = "") {
    const j = this.run.jobs.find(x => x.job === jobName)
    if (!j) return
    if (j.status === "ok" || j.status === "failed") return
    j.status = status
    j.durationMs = j.startedAt ? Date.now() - Date.parse(j.startedAt) : null
    if (status === "failed") { j.diagnosis = diagnose([line]); this.run.progress.failed += 1 }
    else this.run.progress.done += 1
    if (j.durationMs) this.durations.push(j.durationMs)
    this.run.progress.etaSeconds = this.eta()
    this.emit({
      type: "job.done", job: j.job, status: j.status,
      durationMs: j.durationMs, diagnosis: j.diagnosis ?? undefined,
    })
    this.emit({ type: "progress", ...this.run.progress })
    this.persist().catch(() => {})
  }

  eta() {
    if (!this.durations.length) return null
    const sorted = [...this.durations].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const left = this.run.jobs.filter(j => j.status === "queued" || j.status === "running").length
    return Math.round((med * left) / Math.max(1, this.run.maxJobs) / 1000)
  }

  /** Phán cuối theo SẢN PHẨM: raw/<job>.png ghi mới trong run này = thành công. */
  async settleGenJobs() {
    const pdir = projectDir(this.ws, this.run.projectId)
    for (const j of this.run.jobs) {
      const png = join(pdir, "raw", `${j.job}.png`)
      const mt = await mtimeOf(png)
      const fresh = mt > 0 && Math.floor(mt / 1000) >= this.t0
      if (fresh) {
        const st = await stat(png).catch(() => null)
        j.artifact = { path: `raw/${j.job}.png`, bytes: st?.size ?? 0, writtenAt: new Date(mt).toISOString() }
        if (j.status !== "ok") {
          if (j.status === "failed") this.run.progress.failed = Math.max(0, this.run.progress.failed - 1)
          j.status = "ok"
          this.run.progress.done += 1
        }
      } else if (j.status !== "failed") {
        j.status = this.cancelled && j.status === "queued" ? "queued" : "failed"
        if (j.status === "failed") {
          this.run.progress.failed += 1
          j.diagnosis = j.diagnosis ?? "NO_ARTIFACT"
        }
      }
    }
    this.run.progress.done = this.run.jobs.filter(j => j.status === "ok").length
    this.run.progress.failed = this.run.jobs.filter(j => j.status === "failed").length
    await this.persist()
  }

  /** Dừng lượt chạy.
   *  `waitMs > 0`: ĐỢI child chết hẳn và mọi bút toán xuống đĩa kết thúc trước khi trả về.
   *  Người gọi là DELETE project PHẢI đợi, nếu không sẽ có cuộc đua:
   *    cancel() gửi SIGTERM → trả về ngay → trashProject() move thư mục đi
   *    → child 'close' bắn muộn → settleGenJobs()/persist()/emit() ghi vào đường dẫn cũ
   *    → writeJsonAtomic ensureDir DỰNG LẠI projects/<id>/runs/ = thư mục ma
   *    → POST /api/trash/:id/restore trả 409 PROJECT_ID_TAKEN (nút Hoàn tác chết). */
  async cancel({ waitMs = 0 } = {}) {
    if (this.finished) fail("RUN_FINISHED", `run ${this.id} already finished`)
    this.cancelled = true
    const killed = this.run.jobs.filter(j => j.status === "running").map(j => j.job)
    const kept = this.run.jobs.filter(j => j.status === "ok").length
    const hadChild = !!this.child
    if (this.child?.pid) {
      try { process.kill(-this.child.pid, "SIGTERM") } catch { try { this.child.kill("SIGTERM") } catch { /* đã chết */ } }
    }
    this.emit({ type: "job.log", level: "warn", line: "đã yêu cầu dừng lượt chạy" })
    if (!hadChild) {
      // Chưa spawn: launch() thấy stopped() sẽ tự rút, không dựng lại thư mục project.
      await this.finish("cancelled")
      return { runId: this.id, cancelled: true, killed, kept }
    }
    if (waitMs > 0) {
      // Đợi pha hiện tại đóng sổ. Có trần thời gian để DELETE không treo vô hạn nếu
      // engine phớt lờ SIGTERM; hết trần thì SIGKILL rồi đợi thêm một nhịp ngắn.
      const timeout = new Promise(r => { const t = setTimeout(r, waitMs); t.unref?.() })
      await Promise.race([this.phaseDone ?? Promise.resolve(), timeout])
      if (this.child?.pid) {
        try { process.kill(-this.child.pid, "SIGKILL") } catch { try { this.child.kill("SIGKILL") } catch { /* đã chết */ } }
        const grace = new Promise(r => { const t = setTimeout(r, 300); t.unref?.() })
        await Promise.race([this.phaseDone ?? Promise.resolve(), grace])
      }
      if (!this.finished) await this.finish("cancelled")
    }
    return { runId: this.id, cancelled: true, killed, kept }
  }

  async failEnv(message) {
    this.emit({ type: "job.log", level: "error", line: message })
    await this.finish("env-failed")
  }

  async finish(status) {
    if (this.finished) return
    this.finished = true
    clearInterval(this.hb)
    this.run.status = status
    this.run.finishedAt = new Date().toISOString()
    for (const j of this.run.jobs) if (j.status === "queued" || j.status === "running") j.status = status === "cancelled" ? "queued" : "failed"
    const ok = this.run.jobs.filter(j => j.status === "ok").length
    const failed = this.run.jobs.filter(j => j.status === "failed").length
    this.run.progress.done = ok
    this.run.progress.failed = failed
    await this.persist()
    this.emit({
      type: "run.finished", status, ok, failed,
      durationMs: Date.parse(this.run.finishedAt) - Date.parse(this.run.startedAt),
    })
    for (const s of this.subs) { try { s(null) } catch { /* ignore */ } }
    this.subs.clear()
    if (this.store.active.get(this.run.projectId) === this) this.store.active.delete(this.run.projectId)
  }
}

function lineReader(stream, onLine) {
  let buf = ""
  stream.setEncoding("utf8")
  stream.on("data", chunk => {
    buf += chunk
    let i
    while ((i = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1) }
    if (buf.length > 8192) { onLine(buf); buf = "" }
  })
  stream.on("end", () => { if (buf.trim()) onLine(buf) })
}

