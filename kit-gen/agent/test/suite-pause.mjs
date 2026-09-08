/* suite-pause.mjs — DỪNG GIỮA CHỪNG rồi CHẠY TIẾP PHẦN THIẾU (16/08).
 *
 * ══ VÌ SAO CÓ BỘ CA NÀY ═════════════════════════════════════════════════════
 * Chủ sản phẩm đang xem một lượt gen THẬT chạy dở và hỏi đúng một câu: *"pause resume
 * có được không"*. Câu trả lời trung thực là **không có pause đúng nghĩa và sẽ không
 * có**: một lượt `codex exec` đang bay không có nút tạm dừng, còn treo tiến trình kiểu
 * SIGSTOP chỉ làm phía kia rớt phiên rồi vẫn mất lượt. Thứ kit-gen có — và phải chạy
 * cho ăn khớp — là cặp:
 *
 *   DỪNG      = ngừng phát tấm mới; tấm đang bay bị SIGTERM; **giữ sạch phần đã xong**
 *               (ảnh còn nguyên, ĐƯỢC CẮT, có thumbnail, không bị gọi là "hỏng").
 *   CHẠY TIẾP = một run MỚI với đúng danh sách tấm còn thiếu (`jobs:[…]` của #32).
 *               Agent thu hẹp `styles.json` về đúng tập ấy ⇒ tấm cũ KHÔNG bị vẽ lại.
 *
 * Ba lỗ hổng đo được bằng chính bộ ca này (engine giả, không tốn quota) trước khi vá:
 *  ① tấm gen xong ĐÚNG LÚC bấm Dừng nằm lại `raw/` mà không bao giờ được cắt —
 *    `finishSheet()` rút lui khi thấy `cancelled`, và pha cắt tổng thì bị bỏ qua;
 *  ② tấm đang bay lúc bấm Dừng bị ghi `failed` + `NO_ARTIFACT` ⇒ màn hình hiện thẻ ĐỎ
 *    "Chưa tạo được ảnh" cho việc mà chính người dùng vừa yêu cầu;
 *  ③ agent chết giữa lượt (kill -9, máy ngủ) ⇒ `run.json` kẹt `"running"` vĩnh viễn:
 *    web quay vòng "Đang tạo ảnh…" với nút Dừng chỉ trả 409, còn ảnh đã tốn quota thì
 *    không ai settle. `sweepOrphanRuns()` lúc boot đóng ca này.
 */
import { readFile, writeFile, mkdir, stat, utimes } from "node:fs/promises"
import { join } from "node:path"
import {
  describe, it, eq, ok, waitFor, pathExists, lsDir,
  makeClient, fakeDoctor, CLIENT, PAGES, PORT, createBasicProject,
} from "./harness.mjs"
import { createAgent } from "../server.mjs"
import { sweepOrphanRuns } from "../lib/runs.mjs"

/* Engine giả "chậm đều": mọi tấm đều xanh, cách nhau một nhịp đủ để bấm Dừng ở GIỮA.
   0.35s × 6 tấm ≈ 2s một lượt — đủ chậm để cửa sổ "đang chạy dở" là thật, đủ nhanh để
   không kéo dài bộ ca. */
process.env.KITGEN_FAKE_STEP = process.env.KITGEN_FAKE_STEP ?? "0.35"

export async function run({ wsRoot, agentDir }) {
  const FIXTURES = join(agentDir, "test-fixtures")

  async function agentWithEngine(engineName) {
    const a = await createAgent({
      workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
      rateLimit: 5000, doctor: fakeDoctor(true),
    })
    a.state.port = PORT
    a.registry.active.engineDir = join(FIXTURES, engineName)
    const c = makeClient(a.server)
    return { agent: a, api: (m, p, o = {}) => c(m, p, { ...o, headers: { ...CLIENT, ...(o.headers ?? {}) } }) }
  }

  /** Project 2 biến thể × 3 tấm = 6 lượt: đủ để "dừng ở giữa" là một câu có nghĩa. */
  async function project(api, name) {
    const created = await createBasicProject(api, { name, firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    const cpath = join(wsRoot, "projects", gid, "contract.json")
    const c = JSON.parse(await readFile(cpath, "utf8"))
    const v2 = structuredClone(c.variants[0])
    v2.id = "thu"; v2.vi = "Thu"
    c.variants.push(v2)
    await writeFile(cpath, JSON.stringify(c))
    return gid
  }

  const manifestSheets = async gid => {
    const p = join(wsRoot, "projects", gid, "kits", "manifest.json")
    if (!(await pathExists(p))) return {}
    const m = JSON.parse(await readFile(p, "utf8"))
    return Object.fromEntries(Object.entries(m.styles).map(([k, v]) => [k, Object.keys(v.sheets).sort()]))
  }
  const untilDone = async (api, rid, n) =>
    waitFor(async () => (await api("GET", `/api/runs/${rid}`)).json.progress.done >= n, 20000, `${n} tấm xong`)
  const untilClosed = async (api, rid) =>
    waitFor(async () => {
      const s = (await api("GET", `/api/runs/${rid}`)).json.status
      return s !== "running" && s !== "queued"
    }, 20000, "lượt đóng sổ")

  describe("dừng & chạy tiếp")

  /* ── (a) DỪNG: PHẦN ĐÃ TRẢ TIỀN PHẢI SẠCH ────────────────────────────────── */
  await it("[dừng] tấm đã xong được GIỮ và ĐƯỢC CẮT; tấm đang bay không bị gọi là hỏng", async () => {
    const { api } = await agentWithEngine("engine-stepped")
    const gid = await project(api, "Dung giua chung 6 tam")
    const r = await api("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 1, autoSliceAfterGen: true } })
    eq(r.status, 202, "run 202")
    eq(r.json.jobs.length, 6, "6 lượt = 2 biến thể × 3 tấm")
    const rid = r.json.runId

    await untilDone(api, rid, 2)
    const cancel = await api("POST", `/api/runs/${rid}/cancel`)
    eq(cancel.status, 200, "cancel 200")
    ok(cancel.json.kept >= 2, `giữ ${cancel.json.kept} tấm đã xong`)
    ok(cancel.json.missing.length >= 3,
      `#36 nói luôn còn thiếu những tấm nào (${cancel.json.missing.length}) — UI mời "Chạy tiếp N tấm"`)
    await untilClosed(api, rid)

    const got = (await api("GET", `/api/runs/${rid}`)).json
    eq(got.status, "cancelled", "lượt đóng sổ ở đúng trạng thái cancelled")
    const okJobs = got.jobs.filter(j => j.status === "ok")
    ok(okJobs.length >= 2, `${okJobs.length} tấm ok`)

    // ① KHÔNG ai bị gọi là hỏng: người dùng dừng thì không có lỗi nào cả
    eq(got.jobs.filter(j => j.status === "failed").length, 0,
      "tấm đang bay lúc bấm Dừng KHÔNG được ghi là failed (nó không hỏng, nó bị dừng)")
    eq(got.failSummary, null, "không dựng câu tổng kết lỗi cho một lượt bị dừng tay")
    ok(got.jobs.every(j => j.status === "ok" || j.status === "queued"),
      `chỉ còn ok|queued, thấy ${got.jobs.map(j => j.status).join(",")}`)

    // ② ẢNH ĐÃ TỐN QUOTA còn nguyên + có snapshot bất biến của lượt
    for (const j of okJobs) {
      ok(await pathExists(join(wsRoot, "projects", gid, "raw", `${j.job}.png`)), `raw/${j.job}.png còn`)
      eq(j.artifact?.path, `runs/${rid}/artifacts/${j.job}.png`, `artifact của ${j.job}`)
      ok(await pathExists(join(wsRoot, "projects", gid, j.artifact.path)), `snapshot ${j.job} trên đĩa`)
    }

    // ③ VÀ ĐÃ ĐƯỢC CẮT — đây là chỗ bản cũ thủng: tấm xong đúng lúc bấm Dừng bị bỏ lại
    //    thô mãi mãi, vì lượt "chạy tiếp" sau đó chỉ cắt phần của chính nó.
    const sheets = await manifestSheets(gid)
    for (const j of okJobs)
      ok((sheets[j.variant] ?? []).includes(j.sheet),
        `tấm ${j.job} đã tốn quota mà KHÔNG có trong manifest: ${JSON.stringify(sheets)}`)
    ok((await lsDir(join(wsRoot, "projects", gid, "kits", "tet"))).length > 1, "kits/tet có file cắt ra")

    // ④ không còn "run ma": web đọc activeRun = null, không quay vòng vô tận
    eq((await api("GET", `/api/projects/${gid}`)).json.project.state.activeRun, null, "activeRun về null")

    // ⑤ sự kiện sheet.ready phát cho ĐỦ tấm đã xong (web nạp lại đúng phần của tấm đó)
    const evs = (await readFile(join(wsRoot, "projects", gid, "runs", rid, "events.ndjson"), "utf8"))
      .trim().split("\n").map(l => JSON.parse(l))
    const ready = new Set(evs.filter(e => e.type === "sheet.ready" && e.sliced?.ok).map(e => e.job))
    for (const j of okJobs) ok(ready.has(j.job), `thiếu sheet.ready(đã cắt) cho ${j.job}`)
    await api("DELETE", `/api/projects/${gid}`)
  })

  /* ── (b) CHẠY TIẾP: CHỈ PHẦN THIẾU, KHÔNG ĐỐT LẠI QUOTA ──────────────────── */
  await it("[chạy tiếp] chỉ vẽ phần còn thiếu; ảnh cũ KHÔNG bị vẽ lại; manifest gộp đúng", async () => {
    const { api } = await agentWithEngine("engine-stepped")
    const gid = await project(api, "Chay tiep phan thieu")
    const r = await api("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 1, autoSliceAfterGen: true } })
    const rid = r.json.runId
    await untilDone(api, rid, 2)
    await api("POST", `/api/runs/${rid}/cancel`)
    await untilClosed(api, rid)

    const first = (await api("GET", `/api/runs/${rid}`)).json
    const kept = first.jobs.filter(j => j.status === "ok").map(j => j.job)
    const missing = first.jobs.filter(j => j.status !== "ok").map(j => j.job)
    ok(missing.length >= 3, `còn ${missing.length} tấm thiếu`)

    const rawDir = join(wsRoot, "projects", gid, "raw")
    const before = {}
    for (const j of kept) before[j] = (await stat(join(rawDir, `${j}.png`))).mtimeMs
    /* Lùi mtime 2s: máy nhanh có thể ghi lại file trong cùng một mili-giây và phép so
       sánh "không đổi" sẽ mù. Lùi ra ⇒ nếu lượt sau ĐỘNG vào thì thấy ngay. */
    for (const j of kept) {
      const t = new Date(before[j] - 2000)
      await utimes(join(rawDir, `${j}.png`), t, t)
      before[j] = t.getTime()
    }

    const r2 = await api("POST", `/api/projects/${gid}/runs`, {
      body: { kind: "gen", maxJobs: 1, jobs: missing, autoSliceAfterGen: true },
    })
    eq(r2.status, 202, "chạy tiếp 202")
    eq(r2.json.jobs.length, missing.length, "đúng số tấm còn thiếu, không hơn")
    await untilClosed(api, r2.json.runId)
    const second = (await api("GET", `/api/runs/${r2.json.runId}`)).json
    eq(second.status, "done", "lượt chạy tiếp xong sạch")

    // ① QUOTA: ảnh cũ không bị chạm tới
    for (const j of kept)
      eq(Math.round((await stat(join(rawDir, `${j}.png`))).mtimeMs), Math.round(before[j]),
        `raw/${j}.png bị vẽ lại — đốt quota của tấm đã trả tiền`)
    // ② styles.json của lượt sau thu hẹp đúng phần thiếu (đường E7, không dùng FILTERS substring)
    const styles = JSON.parse(await readFile(join(wsRoot, "projects", gid, "styles.json"), "utf8"))
    const pairs = new Set()
    for (const s of styles.styles)
      for (const sh of styles.sheets)
        if (!sh.styles || sh.styles.includes(s.id)) pairs.add(`${s.id}-${sh.id}`)
    eq([...pairs].sort(), [...missing].sort(), "styles.json = ĐÚNG tập tấm còn thiếu")
    // ③ manifest gộp: tấm của lượt trước VÀ lượt này đều còn
    const sheets = await manifestSheets(gid)
    for (const j of [...kept, ...missing]) {
      const [variant, ...rest] = j.split("-")
      ok((sheets[variant] ?? []).includes(rest.join("-")), `manifest mất ${j}: ${JSON.stringify(sheets)}`)
    }
    await api("DELETE", `/api/projects/${gid}`)
  })

  /* ── (e) CUỘC ĐUA: BẤM DỪNG HAI LẦN / DỪNG ĐÚNG LÚC TẤM CUỐI ĐANG SETTLE ─── */
  await it("[đua] bấm Dừng hai lần liên tiếp: lần hai không làm hỏng gì, không có run ma", async () => {
    const { api } = await agentWithEngine("engine-stepped")
    const gid = await project(api, "Bam dung hai lan")
    const r = await api("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 1 } })
    const rid = r.json.runId
    await untilDone(api, rid, 1)
    const [c1, c2] = await Promise.all([
      api("POST", `/api/runs/${rid}/cancel`),
      api("POST", `/api/runs/${rid}/cancel`),
    ])
    ok([200, 409].includes(c1.status) && [200, 409].includes(c2.status),
      `hai lần dừng cùng lúc trả ${c1.status}/${c2.status} — chỉ được 200 hoặc 409 RUN_FINISHED`)
    await untilClosed(api, rid)
    const got = (await api("GET", `/api/runs/${rid}`)).json
    eq(got.status, "cancelled", "vẫn đúng một trạng thái cuối")
    ok(got.finishedAt, "có finishedAt — không kẹt lại như run đang chạy")

    // bấm lần thứ ba khi đã đóng sổ: phải là 409 nói rõ, không phải 500
    const c3 = await api("POST", `/api/runs/${rid}/cancel`)
    eq(c3.status, 409, "dừng một lượt đã xong = 409")
    eq(c3.json.error.code, "RUN_FINISHED", "code")
    // và chạy tiếp vẫn mở được ngay sau đó (không còn RUN_CONFLICT)
    const missing = got.jobs.filter(j => j.status !== "ok").map(j => j.job)
    const r2 = await api("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 1, jobs: missing.slice(0, 1) } })
    eq(r2.status, 202, "dừng xong là chạy tiếp được ngay, không vướng RUN_CONFLICT")
    await api("POST", `/api/runs/${r2.json.runId}/cancel`).catch(() => null)
    await untilClosed(api, r2.json.runId)
    await api("DELETE", `/api/projects/${gid}`)
  })

  await it("[đua] dừng ĐÚNG LÚC tấm cuối đang settle: ảnh vừa xong vẫn được cắt", async () => {
    /* Cửa sổ tử huyệt: dòng `OK <job>` vừa được đọc, chu trình per-sheet của tấm đó vừa
       được xếp hàng, thì SIGTERM tới. Bản cũ vứt luôn cả chu trình ấy. Lặp vài vòng vì
       đây là cuộc đua — chạy một lần rất dễ lọt. */
    const { api } = await agentWithEngine("engine-stepped")
    for (let i = 0; i < 3; i++) {
      const gid = await project(api, `Dung dung luc settle ${i}`)
      const r = await api("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 1, autoSliceAfterGen: true } })
      const rid = r.json.runId
      await untilDone(api, rid, 1)
      await new Promise(res => setTimeout(res, i * 15))   // xê dịch mép cửa sổ mỗi vòng
      await api("POST", `/api/runs/${rid}/cancel`)
      await untilClosed(api, rid)
      const got = (await api("GET", `/api/runs/${rid}`)).json
      const sheets = await manifestSheets(gid)
      for (const j of got.jobs.filter(x => x.status === "ok"))
        ok((sheets[j.variant] ?? []).includes(j.sheet),
          `vòng ${i}: ${j.job} đã tốn quota mà không được cắt (${JSON.stringify(sheets)})`)
      await api("DELETE", `/api/projects/${gid}`)
    }
  })

  /* ── (d) AGENT CHẾT GIỮA LƯỢT ────────────────────────────────────────────── */
  await it("[agent chết] run mồ côi được quét lúc boot: hết 'running' ma, nhặt lại ảnh đã tốn quota", async () => {
    const { api, agent } = await agentWithEngine("engine-stepped")
    const gid = await project(api, "Agent chet giua luot")
    const pdir = join(wsRoot, "projects", gid)

    /* Dựng ĐÚNG hiện trường sau `kill -9`: run.json còn "running", một tấm đã có ảnh
       trong raw/ (tiến trình engine kịp ghi trước khi agent chết) nhưng chưa ai settle,
       một tấm đang chạy, phần còn lại đang xếp hàng. */
    const rid = "r-9001"
    const dir = join(pdir, "runs", rid)
    await mkdir(dir, { recursive: true })
    const startedAt = new Date(Date.now() - 60000).toISOString()
    await mkdir(join(pdir, "raw"), { recursive: true })
    await writeFile(join(pdir, "raw", "tet-main.png"), "PNGFAKE")
    const orphan = {
      id: rid, projectId: gid, kind: "gen", status: "running",
      startedAt, finishedAt: null, maxJobs: 1,
      phase: { index: 1, total: 2, name: "gen" },
      progress: { done: 0, total: 3, failed: 0, etaSeconds: null },
      jobs: [
        { job: "tet-main", variant: "tet", sheet: "main", status: "running", startedAt, durationMs: null, artifact: null, recovered: false, diagnosis: null, errorTail: null },
        { job: "tet-tall", variant: "tet", sheet: "tall", status: "running", startedAt, durationMs: null, artifact: null, recovered: false, diagnosis: null, errorTail: null },
        { job: "tet-bg-home", variant: "tet", sheet: "bg-home", status: "queued", startedAt: null, durationMs: null, artifact: null, recovered: false, diagnosis: null, errorTail: null },
      ],
      failSummary: null, seq: 12,
    }
    await writeFile(join(dir, "run.json"), JSON.stringify(orphan))

    const swept = await sweepOrphanRuns(agent.registry.active)
    ok(swept.includes(`${gid}/${rid}`), `quét phải nêu ${gid}/${rid}, thấy ${JSON.stringify(swept)}`)

    const got = (await api("GET", `/api/runs/${rid}`)).json
    eq(got.status, "cancelled", "run mồ côi KHÔNG được để nguyên 'running' (web quay vòng vĩnh viễn)")
    eq(got.interrupted, true, "đánh dấu đứt gánh để web mời chạy tiếp")
    ok(got.finishedAt, "có finishedAt")
    const main = got.jobs.find(j => j.job === "tet-main")
    eq(main.status, "ok", "tấm ĐÃ CÓ ẢNH được nhặt lại — không bắt người dùng trả quota lần hai")
    eq(main.recovered, true, "đánh dấu recovered")
    eq(main.artifact?.path, `runs/${rid}/artifacts/tet-main.png`, "có snapshot artifact")
    ok(await pathExists(join(pdir, main.artifact.path)), "snapshot nằm thật trên đĩa")
    eq(got.jobs.find(j => j.job === "tet-tall").status, "queued",
      "tấm đang bay lúc agent chết = chưa vẽ, KHÔNG phải hỏng")
    eq(got.jobs.filter(j => j.status === "failed").length, 0, "agent chết không biến tấm nào thành lỗi")
    eq(got.progress.done, 1, "tiến độ đếm lại theo sự thật trên đĩa")

    // ẢNH GỐC KHÔNG BỊ ĐỤNG TỚI — thứ đắt nhất trong thư mục project
    eq(await readFile(join(pdir, "raw", "tet-main.png"), "utf8"), "PNGFAKE", "raw/ nguyên vẹn")
    // quét lần hai không đổi gì (idempotent, boot nào cũng chạy)
    eq((await sweepOrphanRuns(agent.registry.active)).includes(`${gid}/${rid}`), false, "quét lần hai bỏ qua")

    // và chạy tiếp được ngay đúng phần thiếu
    const missing = got.jobs.filter(j => j.status !== "ok").map(j => j.job)
    eq(missing.sort(), ["tet-bg-home", "tet-tall"], "phần thiếu = đúng hai tấm chưa có ảnh")
    const r2 = await api("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 1, jobs: missing } })
    eq(r2.status, 202, "chạy tiếp không vướng RUN_CONFLICT của run ma")
    await api("POST", `/api/runs/${r2.json.runId}/cancel`).catch(() => null)
    await untilClosed(api, r2.json.runId)
    await api("DELETE", `/api/projects/${gid}`)
  })
}
