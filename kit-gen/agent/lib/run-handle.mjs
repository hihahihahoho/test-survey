/* run-handle.mjs — một lượt chạy: spawn engine, phát event NDJSON, phán trạng thái job.
   Job PHÁN THEO SẢN PHẨM (mtime raw/<job>.png >= t0), KHÔNG theo exit code (gen.sh:167-176). */
import { spawn } from "node:child_process"
import { join } from "node:path"
import { ensureDir, exists, writeJsonAtomic, mtimeOf, stat, readFile, writeFile, copyFile } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { redactLine } from "./redact.mjs"
import { projectDir } from "./projects-dir.mjs"
import { resolveEngine, prepareEngine, materializeStyles, buildCommand, diagnose, summarizeFailures } from "./engine.mjs"
import { maybeAutoCover } from "./cover.mjs"
import { thumbnail } from "./thumbs.mjs"
import { IS_WIN, pythonCommand, pythonSpawnOpts, killTree, winSpawnOpts } from "./platform.mjs"

const HEARTBEAT_MS = 15000
const MAX_BUFFER_EVENTS = 4000

/* ══ CHU TRÌNH TỪNG TẤM (15/08) ═══════════════════════════════════════════════
   TRƯỚC: gen đủ 10 tấm → mới cắt (một lượt slice.py cho cả lượt) → mới có thumbnail
   (sinh lười lúc web hỏi) → chủ sản phẩm ngồi nhìn 15 phút không thấy gì, và tấm nào
   xong sớm cũng không xem được.
   NAY: tấm nào gen xong thì ĐI HẾT chu trình của riêng nó ngay:
        ảnh → snapshot artifact → cắt hẹp (slice.py --sheet=) → thumbnail → `sheet.ready`.
   Pha cắt tổng cuối lượt VẪN CHẠY như lưới an toàn (idempotent: cắt lại từ raw ra đúng
   thứ đang nằm đó, và khối merge của slice.py giữ nguyên sheet không chạy lượt này).

   XẾP HÀNG MỘT LÀN, KHÔNG SONG SONG. Ba tấm gen xong cách nhau vài giây sẽ đẻ ra ba
   lượt slice.py chồng nhau; slice.py đọc–sửa–ghi `kits/manifest.json` nên chồng nhau =
   mất phần của nhau. slice.py đã có ổ khoá hệ điều hành (lớp bảo vệ cuối), nhưng xếp
   hàng ở đây là lớp thứ nhất: rẻ hơn, và giữ CPU cho việc chính. */
const SHEET_SLICE_TIMEOUT_MS = 15 * 60 * 1000

/* ══ WINDOWS: 'close' CÓ THỂ KHÔNG BAO GIỜ TỚI ═══════════════════════════════
   Node bắn 'exit' khi TIẾN TRÌNH CON chết, nhưng bắn 'close' khi MỌI ỐNG DẪN stdio
   đã hết dữ liệu. Trên Windows handle được THỪA KẾ: bash.exe khởi động codex/python,
   hai đứa cháu đó giữ nguyên đầu ghi của ống stdout/stderr, nên bash chết rồi mà ống
   vẫn mở — 'close' không tới, `phaseDone` không bao giờ settle, và lượt chạy đứng
   nguyên ở "đang chạy" VĨNH VIỄN (không có trần thời gian nào cho cả một pha).
   POSIX gần như không dính vì engine không để lại tiến trình cháu sống sau khi thoát,
   và mã cũ đã chạy thế nhiều tháng trên macOS ⇒ CHỈ vá cho win32, giữ nguyên từng chữ
   hành vi darwin/linux (hợp đồng của platform.mjs).
   Vá: 'exit' tới mà sau ngần này vẫn chưa có 'close' thì tự đóng ống và đóng sổ pha,
   kèm một dòng log NÓI RÕ vì sao — im lặng là thứ đã tốn của lượt CI đầu 74 phút. */
const WIN_PIPE_GRACE_MS = 5000
/** Bề rộng thumbnail mà lưới của web luôn hỏng (`?w=256`, xem features/kit/lib/image-source.ts). */
const THUMB_WIDTHS = [256]
/** Cover chạy NGOÀI pool của gen.sh ⇒ tổng số lượt codex đồng thời là maxJobs+1.
 *  maxJobs=1 nghĩa là người dùng đã chọn "đừng chạy nhiều cùng lúc" — tôn trọng
 *  lựa chọn đó: ở mức ấy ảnh bìa vẫn đợi tới cuối lượt như cũ. */
const EARLY_COVER_MIN_MAXJOBS = 2

/* BẰNG CHỨNG ĐI KÈM LỖI (BACKLOG #22).
   Trước bản này, một job lỗi chỉ mang đúng một enum `diagnosis`. Với NO_ARTIFACT enum
   đó đọc là "chạy xong nhưng ảnh không được ghi" — ĐÚNG mà VÔ DỤNG: hai lần liên tiếp
   chủ sản phẩm phải nhờ người khác đào `events.ndjson` mới biết thật ra là `rc=127`
   (thiếu codex trên PATH) và `SyntaxError` (engine chết khi parse). Vài dòng cuối
   stderr/log của chính job đó là thứ phân biệt được hai ca ấy.
   BA TRẦN, cố ý nhỏ: đây là BẰNG CHỨNG, không phải nhật ký — nhật ký đầy đủ vẫn ở
   `GET /api/runs/:id/jobs/:job/log`. */
const ERROR_TAIL_LINES = 3          // "2-3 dòng cuối" của brief
const ERROR_TAIL_MAX_CHARS = 240    // một dòng codex lỗi có thể dài hàng KB
const STDERR_RING = 40              // đủ để lùi qua vài dòng rác cuối (progress bar…)

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
    /* Hàng đợi MỘT LÀN cho chu trình per-sheet (xem ghi chú đầu file). Mọi tác vụ nối
       đuôi vào đây; `drainSheetQueue()` đợi hàng cạn trước pha cắt tổng. */
    this.sheetQueue = Promise.resolve()
    /* Tiến trình con NGOÀI pha chính (slice hẹp). `this.child` là của pha đang chạy —
       ghi đè nó sẽ làm cancel() giết nhầm/bỏ sót. Giữ riêng để cancel() giết đủ. */
    this.sideChildren = new Set()
    /* Tấm đã CẮT XONG trong chu trình per-sheet. Lượt dọn sau khi Dừng đọc tập này để
       biết tấm nào còn nợ một lượt cắt (xem settleCancelledSheets). */
    this.slicedSheets = new Set()
    /* Dừng XONG có được dọn nốt phần đã trả tiền không? Người dùng bấm Dừng: CÓ.
       DELETE project: KHÔNG — thư mục sắp bị move sang thùng rác, mọi bút toán muộn
       vào đó là "thư mục ma" của C-01 (xem cancelAllForProject). */
    this.settleOnCancel = true
    this.coverKicked = false
    /* Vòng nhớ stderr của CẢ LƯỢT — lưới hứng cuối cùng khi job không có log riêng
       (engine chết trước khi kịp tạo `logs/<job>.log`: đúng ca `rc=127`/`SyntaxError`). */
    this.stderrTail = []
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
    /* Chu trình per-sheet của những tấm cuối có thể còn đang chạy khi gen.sh đã đóng.
       Đợi cho cạn TRƯỚC pha cắt tổng: hai lượt slice.py cùng lúc trên một manifest là
       đúng cuộc đua mà cả bản vá này sinh ra để tránh. */
    await this.drainSheetQueue()
    if (this.cancelled) {
      await this.settleCancelledSheets()
      return this.finish("cancelled")
    }
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
        // `env.PATH` CHỈ tồn tại trên win32 (bashCommand thêm coreutils của Git-Bash).
        // Trên darwin/linux buildCommand không bao giờ đặt PATH ⇒ biểu thức này = mã cũ.
        env: { ...process.env, ...env, PATH: env.PATH ?? process.env.PATH },
        ...winSpawnOpts(),
      })
      this.child = child
      const onLine = (raw, level) => {
        const line = raw.trimEnd()
        if (!line) return
        if (level !== "info") {
          this.stderrTail.push(line)
          if (this.stderrTail.length > STDERR_RING) this.stderrTail.shift()
        }
        this.emit({ type: "job.log", job: null, level, line })
        if (kind === "gen") this.parseGenLine(line)
      }
      lineReader(child.stdout, l => onLine(l, "info"))
      lineReader(child.stderr, l => onLine(l, "warn"))
      child.on("error", e => { onLine(`spawn failed: ${e.message}`, "error"); done() })
      /* KHÔNG await được từ bên ngoài ⇒ mọi lỗi ở đây là UNHANDLED REJECTION và giết
         cả tiến trình agent. Bọc try/finally: done() phải chạy trong MỌI trường hợp,
         nếu không thì cancel({waitMs}) đợi phaseDone sẽ treo tới hết trần thời gian. */
      let closed = false
      const onClose = async code => {
        if (closed) return          // trên POSIX chỉ có đúng một đường vào: 'close'
        closed = true
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
      }
      child.on("close", onClose)
      /* Lưới an toàn CHỈ CHO WINDOWS (xem WIN_PIPE_GRACE_MS ở đầu file). Trên
         darwin/linux khối này không tồn tại ⇒ đường chạy y hệt mã cũ. */
      if (IS_WIN) {
        child.on("exit", code => {
          const t = setTimeout(() => {
            if (closed) return
            onLine(`[${kind}] tien trinh da thoat nhung ong dan stdout/stderr chua dong sau ` +
              `${WIN_PIPE_GRACE_MS}ms - dong tay (tien trinh chau con giu handle?)`, "warn")
            try { child.stdout?.destroy() } catch { /* đã đóng */ }
            try { child.stderr?.destroy() } catch { /* đã đóng */ }
            onClose(code)
          }, WIN_PIPE_GRACE_MS)
          t.unref?.()
        })
      }
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
    if (status === "ok" && this.run.kind === "gen") {
      this.queueSheet(j)
      this.maybeEarlyCover()
    }
  }

  /* ══ CHU TRÌNH CỦA MỘT TẤM ══════════════════════════════════════════════════ */

  /** Nối chu trình của một tấm vào hàng đợi một làn. KHÔNG await (đang trong luồng
   *  đọc stdout của engine — chặn ở đây là chặn cả việc đọc tiến độ). */
  queueSheet(j) {
    this.sheetQueue = this.sheetQueue.then(() => this.finishSheet(j)).catch(e => {
      if (e?.code !== "ENOENT" && e?.code !== "ENOTDIR")
        process.stderr.write(`[agent] run ${this.id} sheet ${j.job}: ${redactLine(String(e?.message ?? e))}\n`)
    })
  }

  /** Đợi hàng đợi cạn. Vòng lặp vì tác vụ mới có thể được nối vào GIỮA lúc đang đợi
   *  (dòng `OK` cuối cùng của engine hoàn toàn có thể tới sau sự kiện 'close'). */
  async drainSheetQueue() {
    for (let i = 0; i < 200; i++) {
      const tail = this.sheetQueue
      await tail.catch(() => {})
      if (tail === this.sheetQueue) return
    }
  }

  /** gen xong MỘT tấm → snapshot artifact → cắt hẹp → thumbnail → `sheet.ready`.
   *
   *  KHÔNG rút lui khi `cancelled` (bản 15/08 có, và đó là lỗi): ảnh của tấm này ĐÃ
   *  TỐN QUOTA rồi. Bấm Dừng có nghĩa là "đừng vẽ thêm", không phải "vứt cái đã vẽ".
   *  Đo được trên engine giả: dừng lúc 2/6 tấm xong ⇒ tấm thứ hai nằm lại `raw/` mà
   *  KHÔNG BAO GIỜ được cắt — kể cả lượt "chạy tiếp phần thiếu" sau đó cũng không cứu,
   *  vì `styles.json` của lượt ấy đã thu hẹp về đúng phần thiếu. Chốt chặn thật sự là
   *  `detached` (thư mục đích không còn) và `finished` (lượt đã đóng sổ). */
  async finishSheet(j) {
    if (this.detached || this.finished) return
    const pdir = projectDir(this.ws, this.run.projectId)
    const png = join(pdir, "raw", `${j.job}.png`)
    if (!(await exists(png))) return
    await this.attachArtifact(pdir, j)
    const sliced = (this.run.kind === "gen" && this.opts.autoSliceAfterGen)
      ? await this.sliceSheet(pdir, j)
      : null
    if (sliced?.ok) this.slicedSheets.add(j.job)
    const thumb = await this.warmThumbs(pdir, j)
    if (this.detached) return
    await this.persist()
    /* SỰ KIỆN CHO WEB (tương thích ngược: web hiện bỏ qua type lạ — xem
       `webapp/src/lib/types/api.ts`, nhánh cuối của streamEventSchema).
       Nó nói MỘT điều mà `job.done` không nói được: tấm này đã có ẢNH ĐỌC ĐƯỢC
       (`artifact.path`) và đã CẮT xong, tức là màn "Ảnh gốc"/"Ảnh thật" có thể nạp
       lại đúng phần của tấm này mà không phải đợi cả lượt. */
    this.emit({
      type: "sheet.ready", job: j.job, variant: j.variant, sheet: j.sheet,
      artifact: j.artifact ? { path: j.artifact.path, bytes: j.artifact.bytes } : null,
      sliced, thumbs: thumb,
    })
  }

  /** DỌN NỐT PHẦN ĐÃ TRẢ TIỀN sau khi người dùng bấm Dừng.
   *
   *  "Dừng" ở kit-gen KHÔNG treo tiến trình (không SIGSTOP): nó là **ngừng phát job
   *  mới + giữ sạch những gì đã xong**. "Sạch" nghĩa là tấm đã có ảnh phải đi hết chu
   *  trình của nó — cắt ra `kits/`, có thumbnail, phát `sheet.ready` — y như lượt chạy
   *  bình thường. Tấm nào đã cắt trong lúc chạy thì bỏ qua (`slicedSheets`), nên đây
   *  chỉ là phần đuôi: tấm vừa xong đúng lúc bấm Dừng, và tấm có lượt cắt bị SIGTERM
   *  giết giữa chừng.
   *
   *  KHÔNG tốn một đơn vị quota nào: `slice.py` là PIL thuần, không gọi codex. */
  async settleCancelledSheets() {
    if (this.run.kind !== "gen" || !this.opts.autoSliceAfterGen) return
    for (const j of this.run.jobs) {
      if (!this.settleOnCancel || this.detached || this.finished) return
      if (j.status !== "ok" || this.slicedSheets.has(j.job)) continue
      await this.finishSheet(j).catch(e => {
        if (e?.code !== "ENOENT" && e?.code !== "ENOTDIR")
          process.stderr.write(`[agent] run ${this.id} dọn ${j.job}: ${redactLine(String(e?.message ?? e))}\n`)
      })
    }
  }

  /** Ảnh của lượt chạy = SNAPSHOT BẤT BIẾN trong runs/<id>/artifacts/ (+ kiểm hình học).
   *  Trước bản này việc đó chỉ xảy ra ở `settleGenJobs()` — tức là SAU KHI CẢ LƯỢT gen
   *  xong. Đó chính là lý do ô "Đã xong" trong tab Ảnh gốc là ô ĐEN giữa lượt: web đọc
   *  `job.artifact.path`, mà ô đó còn `null` cho tới cuối lượt.
   *  @returns {boolean} ảnh có phải do CHÍNH lượt này ghi ra không. */
  async attachArtifact(pdir, j) {
    const png = join(pdir, "raw", `${j.job}.png`)
    const mt = await mtimeOf(png)
    const fresh = mt > 0 && Math.floor(mt / 1000) >= this.t0
    if (!fresh || j.artifact || this.detached) return fresh
    const st = await stat(png).catch(() => null)
    const artifactsDir = join(this.dir, "artifacts")
    await ensureDir(artifactsDir)
    await copyFile(png, join(artifactsDir, `${j.job}.png`))
    const validation = await this.validateGeometry(pdir, png, j.job)
    j.artifact = {
      path: `runs/${this.id}/artifacts/${j.job}.png`,
      bytes: st?.size ?? 0,
      writtenAt: new Date(mt).toISOString(),
      validation,
    }
    return true
  }

  /** Cắt HẸP đúng một tấm: `slice.py <variant> --sheet=<sheet>`.
   *  Chạy NGOÀI `runPhase` vì pha chính (gen.sh) vẫn đang chạy — `this.child` và
   *  `this.phaseDone` thuộc về nó, ghi đè là cancel() giết nhầm tiến trình. */
  async sliceSheet(pdir, j) {
    if (this.detached || this.finished) return null
    const { cmd, args, env } = buildCommand("slice", pdir, { variants: [j.variant], sheets: [j.sheet] })
    const t0 = Date.now()
    const code = await new Promise(resolve => {
      let child
      try {
        child = spawn(cmd, args, {
          cwd: pdir, detached: true, stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, ...env, PATH: env.PATH ?? process.env.PATH },
          ...winSpawnOpts(),
        })
      } catch (e) { return resolve(`spawn: ${e?.message ?? e}`) }
      this.sideChildren.add(child)
      const timer = setTimeout(() => killTree(child, "SIGKILL"), SHEET_SLICE_TIMEOUT_MS)
      timer.unref?.()
      const onLine = (line, level) => {
        const s = line.trimEnd()
        if (s) this.emit({ type: "job.log", job: j.job, level, line: s })
      }
      lineReader(child.stdout, l => onLine(l, "info"))
      lineReader(child.stderr, l => onLine(l, "warn"))
      child.on("error", e => { clearTimeout(timer); this.sideChildren.delete(child); resolve(`spawn: ${e.message}`) })
      child.on("close", c => { clearTimeout(timer); this.sideChildren.delete(child); resolve(c) })
      // Cùng lưới an toàn win32 như runPhase: 'close' đợi ống dẫn, mà cháu trên Windows
      // giữ ống. Mọi thao tác dưới đây đều idempotent nên nếu 'close' tới trước thì vô hại.
      if (IS_WIN) {
        child.on("exit", c => {
          const t = setTimeout(() => {
            try { child.stdout?.destroy() } catch { /* đã đóng */ }
            try { child.stderr?.destroy() } catch { /* đã đóng */ }
            clearTimeout(timer); this.sideChildren.delete(child); resolve(c)
          }, WIN_PIPE_GRACE_MS)
          t.unref?.()
        })
      }
    })
    return { ok: code === 0, code, durationMs: Date.now() - t0 }
  }

  /** Sinh sẵn bản thu nhỏ (thumbs.mjs vốn sinh LƯỜI lúc web hỏi → ô trống chờ vài trăm ms
   *  mỗi ảnh, và với 10 tấm là 10 lần chờ). Sinh sẵn ở đây = mở tab là ảnh có ngay.
   *  Không có Pillow ⇒ thumbnail() trả về ảnh gốc; ở đây coi như "không hâm được", không lỗi. */
  async warmThumbs(pdir, j) {
    const out = []
    const targets = [join(pdir, "raw", `${j.job}.png`)]
    if (j.artifact) targets.push(join(this.dir, "artifacts", `${j.job}.png`))
    for (const abs of targets) {
      if (!(await exists(abs))) continue
      for (const w of THUMB_WIDTHS) {
        const t = await thumbnail(this.ws, abs, w).catch(() => null)
        if (t?.resized) out.push(w)
      }
    }
    return out.length ? [...new Set(out)] : null
  }

  /** ẢNH BÌA SỚM — kích ngay khi có tấm ĐẦU TIÊN xong, không đợi cả lượt (xem finish()).
   *
   *  ĐỦ NGUYÊN LIỆU CHƯA? `collectBranding()` (cover.mjs) lấy nhận diện theo thứ tự:
   *  ảnh ref người dùng tải lên → ref của tấm dáng → TẤM DÁNG ĐÃ SINH (`raw/<v>-pose-*.png`).
   *  Nếu lượt này CÓ tấm dáng mà nó chưa gen xong, kích ngay = vẽ bìa thiếu mascot —
   *  đổi 15 phút chờ lấy một tấm bìa sai nhận diện thì không đáng. Nên: lượt có tấm dáng
   *  thì đợi tấm dáng (vẫn sớm hơn hẳn cuối lượt), lượt không có thì kích ngay tấm đầu.
   *
   *  QUOTA: cover là ĐÚNG MỘT lượt codex cho cả run, chạy NGOÀI pool của gen.sh (cover.sh
   *  là tiến trình riêng, không đi qua vòng MAXJOBS) ⇒ đỉnh đồng thời là maxJobs+1 trong
   *  quãng vẽ bìa. Không "chờ slot rảnh" vì pool của gen.sh chỉ rảnh khi lượt SẮP XONG —
   *  chờ thế thì đúng bằng hành vi cũ. Người dùng chọn maxJobs=1 (tín hiệu "đừng chạy
   *  nhiều cùng lúc") thì giữ nguyên đường cũ: bìa vẽ sau khi lượt đóng sổ. */
  maybeEarlyCover() {
    if (this.coverKicked) return
    if (this.run.kind !== "gen") return
    if (this.cancelled || this.detached || this.finished) return
    if (this.run.maxJobs < EARLY_COVER_MIN_MAXJOBS) return
    const pose = this.run.jobs.filter(j => String(j.sheet ?? "").startsWith("pose-"))
    const settled = pose.every(j => j.status === "ok" || j.status === "failed")
    if (pose.length && !pose.some(j => j.status === "ok") && !settled) return
    this.coverKicked = true
    this.emit({ type: "job.log", level: "info", line: "vẽ ảnh bìa (job phụ, ngoài hàng đợi tạo ảnh)" })
    maybeAutoCover(this.ws, this.run.projectId, { imgHome: this.opts.imgHome }).catch(() => {})
  }

  eta() {
    if (!this.durations.length) return null
    const sorted = [...this.durations].sort((a, b) => a - b)
    const med = sorted[Math.floor(sorted.length / 2)]
    const left = this.run.jobs.filter(j => j.status === "queued" || j.status === "running").length
    return Math.round((med * left) / Math.max(1, this.run.maxJobs) / 1000)
  }

  /* ══ BẰNG CHỨNG LỖI — HỢP ĐỒNG BẢO MẬT ĐI QUA ĐÚNG MỘT CỬA ═══════════════════
     `tidyTail()` là cửa DUY NHẤT dựng `errorTail`, và nó luôn chạy `redactLine()`
     (che secret + `shortenPath` đường dẫn tuyệt đối — architecture §4.3-5) rồi mới
     cắt độ dài. Không có nhánh nào đi vòng qua nó: nếu thêm nguồn bằng chứng mới,
     hãy đổ vào đây chứ đừng gán thẳng `j.errorTail`.
     Cắt SAU khi redact là có chủ ý — cắt trước có thể xén đôi một token và làm
     mẫu `sk-…` không còn khớp, tức là để lọt đúng thứ ta đang chặn. */
  tidyTail(lines) {
    const out = []
    for (const raw of lines) {
      const line = redactLine(String(raw ?? "")).trim()
      if (!line) continue
      out.push(line.length > ERROR_TAIL_MAX_CHARS ? line.slice(0, ERROR_TAIL_MAX_CHARS) + "…" : line)
    }
    return out.slice(-ERROR_TAIL_LINES)
  }

  /** Vài dòng cuối stderr của CẢ LƯỢT (lưới hứng khi job không có log riêng). */
  runTail() { return this.tidyTail(this.stderrTail) }

  /** Bằng chứng của MỘT job: ưu tiên log riêng của nó, rồi mới tới stderr của lượt. */
  async errorTailFor(pdir, job) {
    for (const abs of [join(this.dir, "logs", `${job}.log`), join(pdir, "logs", `${job}.log`)]) {
      if (!(await exists(abs))) continue
      // Log job của engine là file nhỏ (mỗi job một file); vẫn chỉ giữ đuôi.
      const raw = await readFile(abs, "utf8").catch(() => "")
      const tail = this.tidyTail(raw.split("\n").slice(-STDERR_RING))
      if (tail.length) return tail
    }
    return this.runTail()
  }

  async validateGeometry(pdir, png, job) {
    const tool = join(pdir, "validate_output_geometry.py")
    if (!(await exists(tool))) return null
    const output = join(this.dir, "artifacts", `${job}.geometry.json`)
    const py = pythonCommand([tool, "--image", png, "--contract", join(pdir, "contract.json"), "--job", job, "--output", output])
    return new Promise(resolve => {
      // pythonSpawnOpts(): công cụ này đọc contract.json (UTF-8, tiếng Việt) — xem platform.mjs.
      const child = spawn(py.cmd, py.args, { cwd: pdir, stdio: ["ignore", "pipe", "pipe"], ...pythonSpawnOpts() })
      let text = ""
      child.stdout.on("data", b => { text += String(b) })
      child.on("error", () => resolve(null))
      child.on("close", () => {
        try { resolve(JSON.parse(text.trim())) } catch { resolve(null) }
      })
    })
  }

  /** Phán cuối theo SẢN PHẨM: raw/<job>.png ghi mới trong run này = thành công. */
  async settleGenJobs() {
    const pdir = projectDir(this.ws, this.run.projectId)
    for (const j of this.run.jobs) {
      // Tấm đã đi qua chu trình per-sheet thì `j.artifact` có sẵn — attachArtifact()
      // không chép/kiểm lại lần hai, chỉ trả lời "ảnh có phải của lượt này không".
      const fresh = await this.attachArtifact(pdir, j)
      if (fresh) {
        if (j.status !== "ok") {
          if (j.status === "failed") this.run.progress.failed = Math.max(0, this.run.progress.failed - 1)
          j.status = "ok"
          this.run.progress.done += 1
        }
      } else if (j.status !== "failed") {
        /* NGƯỜI DÙNG DỪNG THÌ KHÔNG CÓ AI "HỎNG".
           Bản trước chỉ tha cho job còn `queued`; job đang `running` lúc bấm Dừng bị
           SIGTERM giết ⇒ không có ảnh ⇒ bị ghi là `failed` + `NO_ARTIFACT` + errorTail.
           Trên màn hình đó là một thẻ ĐỎ "Chưa tạo được ảnh" cho việc mà chính người
           dùng vừa yêu cầu — và `failSummary` còn đọc thành "1/6 job không ghi được
           ảnh". Trong một run `cancelled`, `queued` đọc ra là "Đã dừng"
           (generated-results.ts `resultStateOf`), đúng chuyện đã xảy ra. */
        j.status = this.cancelled ? "queued" : "failed"
        if (j.status === "failed") {
          this.run.progress.failed += 1
          j.diagnosis = j.diagnosis ?? "NO_ARTIFACT"
        }
      }
    }
    /* Bằng chứng gắn ở ĐÂY vì đây là nơi NO_ARTIFACT ra đời: pha gen vừa đóng, log
       của từng job đã ghi xong, mà thư mục project thì vẫn còn (chưa qua finish()). */
    for (const j of this.run.jobs) {
      if (j.status !== "failed" || j.errorTail?.length) continue
      j.errorTail = await this.errorTailFor(pdir, j.job)
      // Enum lấy từ chính bằng chứng: `FAIL <job>` chỉ nói "ảnh không được ghi",
      // còn `rc=127` / `SyntaxError` nằm trong log riêng và mới là nguyên nhân thật.
      if (!j.diagnosis || j.diagnosis === "NO_ARTIFACT") {
        const better = diagnose(j.errorTail)
        if (better !== "UNKNOWN") j.diagnosis = better
      }
    }
    this.run.progress.done = this.run.jobs.filter(j => j.status === "ok").length
    this.run.progress.failed = this.run.jobs.filter(j => j.status === "failed").length
    this.run.failSummary = summarizeFailures(this.run.jobs)
    await this.persist()
  }

  /** Dừng lượt chạy.
   *
   *  NGỮ NGHĨA (chốt 16/08, xem agent/README.md "Dừng & chạy tiếp"): dừng = **ngừng phát
   *  job mới**, KHÔNG phải treo tiến trình. Lượt `codex exec` đang bay bị SIGTERM (nó
   *  không có nút tạm dừng), phần đã xong được giữ NGUYÊN và được dọn cho sạch
   *  (`settleCancelledSheets`). Chạy tiếp = một run MỚI với đúng danh sách job còn thiếu.
   *
   *  `settle = false`: chỉ dành cho DELETE project — sau khi cancel, thư mục project bị
   *  move sang thùng rác, nên tuyệt đối không được spawn thêm `slice.py` ghi vào đó.
   *  `waitMs > 0`: ĐỢI child chết hẳn và mọi bút toán xuống đĩa kết thúc trước khi trả về.
   *  Người gọi là DELETE project PHẢI đợi, nếu không sẽ có cuộc đua:
   *    cancel() gửi SIGTERM → trả về ngay → trashProject() move thư mục đi
   *    → child 'close' bắn muộn → settleGenJobs()/persist()/emit() ghi vào đường dẫn cũ
   *    → writeJsonAtomic ensureDir DỰNG LẠI projects/<id>/runs/ = thư mục ma
   *    → POST /api/trash/:id/restore trả 409 PROJECT_ID_TAKEN (nút Hoàn tác chết). */
  async cancel({ waitMs = 0, settle = true } = {}) {
    if (this.finished) fail("RUN_FINISHED", `run ${this.id} already finished`)
    this.cancelled = true
    if (!settle) this.settleOnCancel = false
    const killed = this.run.jobs.filter(j => j.status === "running").map(j => j.job)
    const kept = this.run.jobs.filter(j => j.status === "ok").length
    /* Danh sách để UI mời "Chạy tiếp N tấm còn thiếu" ngay trong toast, không bắt người
       dùng tự đối chiếu xem lượt vừa dừng còn nợ những tấm nào. */
    const missing = this.run.jobs.filter(j => j.status !== "ok").map(j => j.job)
    const hadChild = !!this.child
    // killTree: POSIX = ĐÚNG mã cũ (process.kill(-pid) rồi rơi về child.kill);
    // win32 = taskkill /T vì không có process group và codex là tiến trình CHÁU của bash.
    if (this.child?.pid) killTree(this.child, "SIGTERM")
    // Lượt cắt hẹp của chu trình per-sheet chạy NGOÀI `this.child` — không giết ở đây
    // thì nó sống tiếp sau khi người dùng đã bấm Dừng và còn ghi vào kits/ của project
    // (đúng mẫu bug C-01: bút toán muộn vào thư mục sắp bị move đi).
    for (const c of this.sideChildren) killTree(c, "SIGTERM")
    this.emit({ type: "job.log", level: "warn", line: "đã yêu cầu dừng lượt chạy" })
    if (!hadChild) {
      // Chưa spawn: launch() thấy stopped() sẽ tự rút, không dựng lại thư mục project.
      await this.finish("cancelled")
      return { runId: this.id, cancelled: true, killed, kept, missing }
    }
    if (waitMs > 0) {
      // Đợi pha hiện tại đóng sổ. Có trần thời gian để DELETE không treo vô hạn nếu
      // engine phớt lờ SIGTERM; hết trần thì SIGKILL rồi đợi thêm một nhịp ngắn.
      const timeout = new Promise(r => { const t = setTimeout(r, waitMs); t.unref?.() })
      // Đợi CẢ chu trình per-sheet: nó cũng ghi xuống đĩa (artifact, kits/, run.json).
      const settled = Promise.all([this.phaseDone ?? Promise.resolve(), this.drainSheetQueue()])
      await Promise.race([settled, timeout])
      if (this.child?.pid) {
        killTree(this.child, "SIGKILL")
        const grace = new Promise(r => { const t = setTimeout(r, 300); t.unref?.() })
        await Promise.race([this.phaseDone ?? Promise.resolve(), grace])
      }
      if (!this.finished) await this.finish("cancelled")
    }
    return { runId: this.id, cancelled: true, killed, kept, missing }
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
    /* LƯỚI HỨNG CUỐI. `settleGenJobs()` chỉ chạy cho pha gen chạy tới nơi; các đường
       còn lại (env-failed vì thiếu gen.sh, engine chết ngay khi spawn, pha slice hỏng)
       cũng phải mang bằng chứng — nếu không thì đúng lại cảnh "nó chẳng báo gì cả". */
    const runTail = this.runTail()
    for (const j of this.run.jobs) {
      if (j.status !== "failed") continue
      if (!j.errorTail?.length) j.errorTail = runTail
      if (!j.diagnosis) j.diagnosis = diagnose(j.errorTail)
    }
    const ok = this.run.jobs.filter(j => j.status === "ok").length
    const failed = this.run.jobs.filter(j => j.status === "failed").length
    this.run.progress.done = ok
    this.run.progress.failed = failed
    this.run.failSummary = summarizeFailures(this.run.jobs)
    await this.persist()
    this.emit({
      type: "run.finished", status, ok, failed, failSummary: this.run.failSummary ?? undefined,
      durationMs: Date.parse(this.run.finishedAt) - Date.parse(this.run.startedAt),
    })
    for (const s of this.subs) { try { s(null) } catch { /* ignore */ } }
    this.subs.clear()
    if (this.store.active.get(this.run.projectId) === this) this.store.active.delete(this.run.projectId)
    this.drawCoverIfFirstTime(status)
  }

  /** ẢNH BÌA — job PHỤ, bắt đầu SAU KHI lượt chạy đã đóng sổ.
   *
   *  Đặt ở đây, sau `persist()` và sau `run.finished`, là có chủ ý: lượt chạy đã kết
   *  thúc và đã được ghi xuống đĩa TRƯỚC khi việc vẽ bìa bắt đầu, nên dù việc vẽ bìa
   *  hỏng, treo, hay thiếu cover.sh thì trạng thái lượt chạy cũng không đổi một chữ.
   *  `maybeAutoCover` tự nuốt mọi lỗi (xem cover.mjs) — ở đây vẫn `catch` lần nữa vì
   *  hàm này không được await: một promise reject lọt ra là giết cả tiến trình agent. */
  drawCoverIfFirstTime(status) {
    if (this.run.kind !== "gen") return
    if (this.cancelled || this.detached) return
    if (status !== "done" && status !== "done-with-errors") return
    if (!this.run.jobs.some(j => j.status === "ok")) return
    maybeAutoCover(this.ws, this.run.projectId, { imgHome: this.opts.imgHome }).catch(() => {})
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

