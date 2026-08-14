/* suite-runs.mjs — §6.2 E: run-store trên đĩa, chặn trước bằng doctor, UNKNOWN_JOB,
   RUN_CONFLICT, stream NDJSON + reconnect ?from=, dừng run, gen→auto-slice bằng engine giả. */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  describe, it, eq, ok, includes, waitFor, pathExists, lsDir,
  makeClient, fakeDoctor, CLIENT, PAGES, PORT,
} from "./harness.mjs"
import { createAgent } from "../server.mjs"

export async function run({ api, wsRoot, agentDir, pid }) {
  // ─────────────────────────────────────────── 9. RUNS
  describe("lượt chạy")
  await it("chạy gen khi chưa tạo được ảnh → 409 IMAGEGEN_UNAVAILABLE (chặn TRƯỚC khi chạy)", async () => {
    const r = await api("POST", `/api/projects/${pid}/runs`, { body: { kind: "gen", jobs: ["tet-main"] } })
    eq(r.status, 409, "status")
    eq(r.json.error.code, "IMAGEGEN_UNAVAILABLE", "code")
    ok(r.json.error.details.reason, "có reason enum")
  })
  await it("job lạ → 422 UNKNOWN_JOB (jobs là DANH TỪ đối chiếu contract, không phải substring)", async () => {
    const r = await api("POST", `/api/projects/${pid}/runs`, { body: { kind: "slice", jobs: ["tet-khong-co"] } })
    eq(r.status, 422, "status")
    eq(r.json.error.code, "UNKNOWN_JOB", "code")
    eq(r.json.error.details.unknown, ["tet-khong-co"], "liệt kê job lạ")
  })
  await it("contract sai → run bị chặn bằng 422 CONTRACT_INVALID", async () => {
    const bad = await api("POST", "/api/projects", { body: { name: "Contract xấu", template: "blank", firstVariant: { id: "v1", vi: "V1" } } })
    const bpid = bad.json.project.id
    const g = await api("GET", `/api/projects/${bpid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets.push({ id: "xau", grid: { cols: 2, rows: 2 }, orient: "landscape", components: [], variants: [] })
    // ghi trực tiếp lên đĩa để mô phỏng file bị sửa ngoài UI
    await writeFile(join(wsRoot, "projects", bpid, "contract.json"), JSON.stringify(c))
    const r = await api("POST", `/api/projects/${bpid}/runs`, { body: { kind: "slice" } })
    eq(r.status, 422, "status")
    eq(r.json.error.code, "CONTRACT_INVALID", "code")
    await api("DELETE", `/api/projects/${bpid}`)
  })
  await it("run slice thật chạy được, có RUN_CONFLICT khi xin run thứ hai, cancel được", async () => {
    const r = await api("POST", `/api/projects/${pid}/runs`, { body: { kind: "slice" } })
    eq(r.status, 202, "status")
    const runId = r.json.runId
    ok(/^r-\d{4}$/.test(runId), `runId ${runId}`)
    ok(r.json.estimate.quotaUnits.length === 2, "có ước lượng quota")

    const conflict = await api("POST", `/api/projects/${pid}/runs`, { body: { kind: "slice" } })
    if (conflict.status === 409) {
      eq(conflict.json.error.code, "RUN_CONFLICT", "code")
      ok(conflict.json.error.details.runId, "nêu run đang chạy")
    }
    const got = await api("GET", `/api/runs/${runId}`)
    eq(got.status, 200, "đọc được run")
    eq(got.json.id, runId, "id khớp")

    const stream = await api("GET", `/api/runs/${runId}/stream?from=0`)
    eq(stream.status, 200, "stream 200")
    includes(stream.headers["content-type"], "application/x-ndjson", "content-type NDJSON")
    const events = stream.text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
    ok(events.length >= 1, `có ${events.length} event`)
    ok(events.every(e => typeof e.seq === "number" && typeof e.t === "string"), "event có seq + t")
    ok(events.some(e => e.type === "run.started"), "có run.started")
    ok(events.some(e => e.type === "run.finished"), "có run.finished")

    const list = await api("GET", `/api/projects/${pid}/runs`)
    ok(list.json.items.some(x => x.id === runId), "có trong danh sách run")

    const cancel = await api("POST", `/api/runs/${runId}/cancel`)
    eq(cancel.status, 409, "run đã xong thì cancel = 409")
    eq(cancel.json.error.code, "RUN_FINISHED", "code")
  })
  await it("run.json sống trên ĐĨA → đọc lại được sau khi agent mất state trong RAM", async () => {
    const fresh = await createAgent({ workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {}, rateLimit: 500 })
    fresh.state.port = PORT
    const c2 = makeClient(fresh.server)
    const runs = await c2("GET", `/api/projects/${pid}/runs`, { headers: CLIENT })
    ok(runs.json.items.length >= 1, "agent mới vẫn thấy run cũ trên đĩa")
    const rid = runs.json.items[0].id
    const one = await c2("GET", `/api/runs/${rid}`, { headers: CLIENT })
    eq(one.status, 200, "đọc được run của agent trước")
    const st = await c2("GET", `/api/runs/${rid}/stream?from=0`, { headers: CLIENT })
    eq(st.status, 200, "replay được event từ đĩa")
  })
  await it("log của job không tồn tại → 404 LOG_NOT_FOUND", async () => {
    const runs = await api("GET", `/api/projects/${pid}/runs`)
    const rid = runs.json.items[0].id
    const r = await api("GET", `/api/runs/${rid}/jobs/tet-main/log`)
    ok([200, 404].includes(r.status), `status ${r.status}`)
    if (r.status === 404) eq(r.json.error.code, "LOG_NOT_FOUND", "code")
  })


  // ─────────────────────────────────────────── 9b. GEN THẬT (engine giả, KHÔNG tốn quota)
  describe("chạy engine thật")
  const FIXTURES = join(agentDir, "test-fixtures")

  /** Agent riêng, trỏ vào một engine fixture trong agent/test-fixtures/. */
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

  await it("gen → auto-slice: SPAWN engine thật, phán theo SẢN PHẨM, stream đủ event", async () => {
    const { api: a3 } = await agentWithEngine("engine-fake")
    const created = await a3("POST", "/api/projects", {
      body: { name: "Chay thu engine", template: "basic", firstVariant: { id: "tet", vi: "Tết đỏ", bg: "magenta" } },
    })
    eq(created.status, 201, "tạo project")
    const gid = created.json.project.id

    const run = await a3("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 2, autoSliceAfterGen: true } })
    eq(run.status, 202, "run 202")
    eq(run.json.jobs.length, 3, "3 lượt (1 phong cách × 3 sheet)")
    eq(run.json.estimate.quotaUnits, [9, 15], "ước lượng quota = 3 lượt × 3–5")
    const rid = run.json.runId

    // stream giữ mở tới khi run.finished → cũng là cách chờ run xong
    const stream = await a3("GET", `/api/runs/${rid}/stream?from=0`)
    eq(stream.status, 200, "stream 200")
    includes(stream.headers["content-type"], "application/x-ndjson", "content-type NDJSON")
    const evs = stream.text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
    ok(evs.some(e => e.type === "run.started"), "có run.started")
    ok(evs.some(e => e.type === "job.started"), "có job.started")
    ok(evs.some(e => e.type === "job.done" && e.status === "ok"), "có job.done ok")
    ok(evs.some(e => e.type === "job.done" && e.status === "failed"), "có job.done failed")
    ok(evs.some(e => e.type === "phase.changed" && e.phase.name === "slice"), "có pha 2 = slice (X9)")
    ok(evs.every((e, i) => i === 0 || e.seq > evs[i - 1].seq), "seq tăng đơn điệu")
    const fin = evs.find(e => e.type === "run.finished")
    ok(fin, "có run.finished")
    eq(fin.status, "done-with-errors", "có lượt lỗi ⇒ KHÔNG BAO GIỜ báo done trơn (đóng E1)")
    eq([fin.ok, fin.failed], [2, 1], "2 xong / 1 lỗi")

    const got = await a3("GET", `/api/runs/${rid}`)
    eq(got.json.status, "done-with-errors", "run.json trên đĩa khớp")
    const okJob = got.json.jobs.find(j => j.status === "ok")
    eq(okJob.artifact?.path, `runs/${rid}/artifacts/${okJob.job}.png`, "artifact của run là snapshot bất biến")
    ok(await pathExists(join(wsRoot, "projects", gid, okJob.artifact.path)), "snapshot artifact tồn tại trên đĩa")
    ok(okJob.artifact.writtenAt, "có artifact.writtenAt — phán theo sản phẩm, không theo exit code")
    const badJob = got.json.jobs.find(j => j.status === "failed")
    ok(["QUOTA_SUSPECTED", "NOT_LOGGED_IN", "NO_ARTIFACT", "TIMEOUT", "UNKNOWN"].includes(badJob.diagnosis),
      `job lỗi có chẩn đoán enum: ${badJob.diagnosis}`)

    // reconnect bằng ?from=<seq>: không mất, không lặp
    const half = Math.floor(evs.length / 2)
    const again = await a3("GET", `/api/runs/${rid}/stream?from=${evs[half].seq}`)
    const evs2 = again.text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
    eq(evs2[0].seq, evs[half].seq, "resume đúng từ seq yêu cầu")
    eq(evs2.length, evs.length - half, "không lặp event trước đó")

    // pha 2 đã cắt thật → đọc được danh mục kit
    const kit = await a3("GET", `/api/projects/${gid}/kit?variant=tet`)
    eq(kit.status, 200, "kit 200")
    ok(kit.json.files.length >= 20, `đã cắt ${kit.json.files.length} file`)
    ok(kit.json.files.every(f => f.path.startsWith("kits/tet/")), "path tương đối trong project")
    ok(kit.json.files.every(f => f.sheet !== null), "mỗi file biết sheet nguồn")
    // HỒI QUY: manifest thật ghi `file` KÈM đuôi .png ⇒ đối chiếu phải cắt đuôi ở CẢ HAI
    // vế. Sai chỗ này thì mọi file trả `sheet:null` và web xếp hết ô vào nhóm "Khác".
    ok(kit.json.files.some(f => f.file.startsWith("tight/")), "bản ôm sát tight/ cũng có trong danh mục")
    ok(kit.json.files.filter(f => f.file.startsWith("tight/")).every(f => f.sheet !== null),
      "bản tight/ dùng chung meta của ô, vẫn biết sheet")
    // Hình học safe zone phải ĐI TỚI web, nếu không đường copy sang Figma không dựng
    // được frame đúng chuẩn (figma-export/copy-sprite-images.mjs:41-48).
    const withSafe = kit.json.files.find(f => !f.file.startsWith("tight/"))
    eq(JSON.stringify(withSafe.safe), "[111,123,300,102]", "safe zone của ô đi kèm file")
    eq(JSON.stringify(withSafe.contentAt), "[137,120]", "offset ruột đi kèm file")
    // `cell` của manifest là KÍCH THƯỚC [w,h] — không được nhét vào cellIndex (số)
    ok(kit.json.files.every(f => f.cellIndex === null || typeof f.cellIndex === "number"),
      "cellIndex chỉ nhận số, không nhận mảng kích thước ô")

    // trạng thái job theo bảng 7 trạng thái §5.7
    const st = (await a3("GET", `/api/projects/${gid}`)).json.project.state.jobs
    eq(st["tet-bg-home"], "never", "lượt lỗi → chưa có ảnh")
    ok(["ok", "uncut"].includes(st["tet-main"]), `lượt xong → ${st["tet-main"]}`)

    // đọc được prompt + log của một lượt từ UI (đóng D7 / §3.3)
    const prompt = await a3("GET", `/api/runs/${rid}/jobs/tet-main/prompt`)
    eq(prompt.status, 200, "đọc được prompt đã dùng")
    includes(prompt.json.prompt, "fake prompt", "nội dung prompt")
    const log = await a3("GET", `/api/runs/${rid}/jobs/tet-main/log?tail=50`)
    eq(log.status, 200, "đọc được log của lượt")
    includes(log.text, "fake log", "nội dung log")

    // ảnh đã sinh đọc được qua #41, và thumbnail không làm vỡ đường đọc
    const img = await a3("GET", `/api/projects/${gid}/files/raw/tet-main.png`)
    eq(img.status, 200, "đọc được raw/tet-main.png")
    ok(img.headers.etag, "có ETag mtime-size")

    // engine được COPY vào project (HERE = project) → KHÔNG ghi vào engine gốc
    includes(await readFile(join(wsRoot, "projects", gid, "styles.json"), "utf8"), '"styles"',
      "styles.json v1 nằm TRONG project")
    ok(!(await pathExists(join(FIXTURES, "engine-fake", "styles.json"))), "KHÔNG ghi styles.json vào engine gốc")
    ok(!(await pathExists(join(FIXTURES, "engine-fake", "raw"))), "KHÔNG ghi raw/ vào engine gốc")
    ok(!(await pathExists(join(FIXTURES, "engine-fake", "kits"))), "KHÔNG ghi kits/ vào engine gốc")
    await a3("DELETE", `/api/projects/${gid}`)
  })

  /* ── BACKLOG #22 ──────────────────────────────────────────────────────────
     "RUN FAIL MÀ KHÔNG AI THẤY". Chủ sản phẩm dính hai lần trong một ngày: 100% job
     chết, app "chẳng báo gì cả", và nguyên nhân thật (`rc=127`, `SyntaxError`) chỉ
     lòi ra khi có người đào `events.ndjson` bằng tay.
     Ca này khoá cả hai nửa của bản vá phía agent:
       ① mỗi job lỗi mang `errorTail` = 2–3 dòng cuối log/stderr CỦA CHÍNH NÓ;
       ② cả lượt mang `failSummary` gộp, và `stats.lastRun` của project cũng biết.
     Và khoá HỢP ĐỒNG BẢO MẬT: engine giả cố tình in ra một khoá `sk-…` và một đường
     dẫn tuyệt đối; cả hai PHẢI biến mất trước khi ra khỏi API. */
  await it("[#22] job lỗi mang errorTail đã redact + run có failSummary gộp", async () => {
    const { api: a8 } = await agentWithEngine("engine-fake")
    const created = await a8("POST", "/api/projects", {
      body: { name: "Bang chung loi", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const gid = created.json.project.id
    const run = await a8("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
    eq(run.status, 202, "run 202")
    const rid = run.json.runId
    await a8("GET", `/api/runs/${rid}/stream?from=0`)      // stream đóng khi run.finished

    const got = await a8("GET", `/api/runs/${rid}`)
    eq(got.json.status, "done-with-errors", "1 job chết ⇒ done-with-errors")

    // ① BẰNG CHỨNG THEO JOB
    const bad = got.json.jobs.find(j => j.status === "failed")
    ok(bad, "có job lỗi")
    eq(bad.diagnosis, "NO_ARTIFACT", "chẩn đoán vẫn là NO_ARTIFACT")
    ok(Array.isArray(bad.errorTail), `errorTail phải là mảng, thấy ${JSON.stringify(bad.errorTail)}`)
    ok(bad.errorTail.length >= 1 && bad.errorTail.length <= 3, `2–3 dòng cuối, thấy ${bad.errorTail.length}`)
    includes(bad.errorTail.join("\n"), "rc=127",
      "nguyên nhân THẬT phải đi kèm — khỏi phải đào events.ndjson")
    ok(got.json.jobs.filter(j => j.status === "ok").every(j => !j.errorTail?.length),
      "job xong KHÔNG mang errorTail")

    // ①b HỢP ĐỒNG BẢO MẬT — redact.mjs là cửa duy nhất
    const tail = bad.errorTail.join("\n")
    ok(!/sk-KITGENTESTKEY/.test(tail), `khoá bị lộ nguyên văn: ${tail}`)
    ok(!tail.includes(wsRoot), `đường dẫn tuyệt đối của workspace bị lộ: ${tail}`)
    ok(!/(^|\s)\/(Users|home|var|private|tmp)\//.test(tail), `còn path tuyệt đối: ${tail}`)

    // ② TỔNG KẾT CẢ LƯỢT
    eq(got.json.failSummary, "1/3 job không ghi được ảnh", "failSummary gộp theo chẩn đoán")
    const list = await a8("GET", `/api/projects/${gid}/runs`)
    eq(list.json.items.find(x => x.id === rid).failSummary, "1/3 job không ghi được ảnh",
      "danh sách lượt chạy cũng mang failSummary")

    // ③ THẺ HOME đọc được trạng thái lượt gần nhất mà KHÔNG phải gọi API runs
    const proj = (await a8("GET", `/api/projects/${gid}`)).json.project
    eq(proj.stats.lastRun.status, "done-with-errors", "stats.lastRun biết lượt vừa rồi hỏng")
    eq(proj.stats.lastRun.fail, 1, "đếm đúng số job đỏ")
    eq(proj.stats.lastRun.total, 3, "biết tổng số job của lượt")
    eq(proj.stats.lastRun.failSummary, "1/3 job không ghi được ảnh", "thẻ Home dùng CÙNG một câu")
    await a8("DELETE", `/api/projects/${gid}`)
  })

  await it("styles.json sinh ra THU HẸP đúng tập lượt đã chọn (filter gen.sh là substring)", async () => {
    const { api: a5 } = await agentWithEngine("engine-fake")
    const created = await a5("POST", "/api/projects", {
      body: { name: "Chon mot luot", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const gid = created.json.project.id
    const run = await a5("POST", `/api/projects/${gid}/runs`, {
      body: { kind: "gen", jobs: ["tet-main"], autoSliceAfterGen: false },
    })
    eq(run.status, 202, "run 202")
    await a5("GET", `/api/runs/${run.json.runId}/stream?from=0`)
    const styles = JSON.parse(await readFile(join(wsRoot, "projects", gid, "styles.json"), "utf8"))
    eq(styles.sheets.map(s => s.id), ["main"], "chỉ có sheet main — KHÔNG kéo theo tall/bg-home")
    const rawDir = await lsDir(join(wsRoot, "projects", gid, "raw"))
    eq(rawDir, ["tet-main.png"], "chỉ 1 ảnh được sinh, không đổ quota oan cho lượt khác")
    await a5("DELETE", `/api/projects/${gid}`)
  })

  await it("state.jobs có running/queued + state.activeRun theo TỪNG project khi đang chạy (N3)", async () => {
    // NEEDS-setup-projects.md N3: chip "Đang chạy N" của S1 và badge ⚡done/total ở thẻ project.
    // /health.activeRuns chỉ là TỔNG toàn workspace nên không biết của project nào.
    const { api: a6 } = await agentWithEngine("engine-slow")
    const created = await a6("POST", "/api/projects", {
      body: { name: "Dang chay bao nhieu", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const gid = created.json.project.id
    const before = await a6("GET", `/api/projects/${gid}`)
    eq(before.json.project.state.activeRun, null, "chưa chạy ⇒ activeRun = null")

    const run = await a6("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
    eq(run.status, 202, "run bắt đầu")
    try {
      // #9 một project
      const one = await a6("GET", `/api/projects/${gid}`)
      const st = one.json.project.state
      ok(st.activeRun && st.activeRun.runId === run.json.runId, `activeRun phải nêu runId, thấy ${JSON.stringify(st.activeRun)}`)
      ok(Number.isFinite(st.activeRun.total) && st.activeRun.total > 0, "activeRun.total là số lượt")
      const live = Object.values(st.jobs).filter(v => v === "running" || v === "queued")
      ok(live.length > 0, `state.jobs phải có running/queued, thấy ${JSON.stringify(st.jobs)}`)

      // #7 danh sách (nguồn của chip S1) — và ETag phải khác lúc rảnh
      const list = await a6("GET", "/api/projects")
      const mine = list.json.items.find(p => p.id === gid)
      ok(mine.state.activeRun?.runId === run.json.runId, "danh sách cũng nêu activeRun của đúng project")
      const others = list.json.items.filter(p => p.id !== gid)
      ok(others.every(p => !p.state?.activeRun), "project khác KHÔNG bị đánh dấu đang chạy")
    } finally {
      await a6("POST", `/api/runs/${run.json.runId}/cancel`)
      await waitFor(async () => (await a6("GET", `/api/runs/${run.json.runId}`)).json.status === "cancelled", 10000, "dừng")
      const after = await a6("GET", `/api/projects/${gid}`)
      eq(after.json.project.state.activeRun, null, "run xong ⇒ activeRun về null")
      await a6("DELETE", `/api/projects/${gid}`)
    }
  })

  await it("dừng run đang chạy → 200, ảnh của lượt đã xong vẫn được giữ", async () => {
    const { api: a4 } = await agentWithEngine("engine-slow")
    const created = await a4("POST", "/api/projects", {
      body: { name: "Dung giua chung", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const gid = created.json.project.id
    const run = await a4("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
    eq(run.status, 202, "run bắt đầu")
    const rid = run.json.runId

    const busy = await a4("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen" } })
    eq(busy.status, 409, "run thứ hai bị chặn")
    eq(busy.json.error.code, "RUN_CONFLICT", "code")
    eq(busy.json.error.details.runId, rid, "nêu đúng run đang chạy (UI có nút [Xem lượt đó])")

    await waitFor(async () => (await a4("GET", `/api/runs/${rid}`)).json.progress.done >= 1, 10000, "lượt đầu xong")
    const cancel = await a4("POST", `/api/runs/${rid}/cancel`)
    eq(cancel.status, 200, "cancel 200")
    eq(cancel.json.cancelled, true, "đã dừng")
    ok(cancel.json.kept >= 1, `giữ ${cancel.json.kept} lượt đã xong`)
    await waitFor(async () => (await a4("GET", `/api/runs/${rid}`)).json.status === "cancelled", 10000, "run → cancelled")
    includes(await readFile(join(wsRoot, "projects", gid, "raw", "tet-main.png"), "utf8"), "PNGFAKE",
      "ảnh của lượt đã xong KHÔNG bị xoá")
    await a4("DELETE", `/api/projects/${gid}`)
  })

  /* ── C-01 (QA LEAD) ───────────────────────────────────────────────────────
     XOÁ PROJECT TRONG LÚC ĐANG SINH ẢNH.
     Bug thật đã tái lập 7/30 lần: DELETE gọi cancel() nhưng KHÔNG ĐỢI tiến trình con
     chết. Child 'close' bắn muộn → settleGenJobs()/persist()/emit() ghi vào đường dẫn
     projects/<id>/runs/ VỪA được move sang thùng rác; writeJsonAtomic gọi ensureDir nên
     nó DỰNG LẠI thư mục ⇒ "thư mục ma" ⇒ POST /api/trash/:id/restore trả 409
     PROJECT_ID_TAKEN ⇒ NÚT HOÀN TÁC CỦA TOAST 10s CHẾT (phá vỡ §1.1-1 "mọi thao tác
     đều có đường về"). Lặp nhiều vòng vì đây là CUỘC ĐUA, chạy 1 lần dễ lọt. */
  await it("[C-01] xoá project khi đang chạy: KHÔNG có thư mục ma, Hoàn tác luôn được", async () => {
    const { api: a7 } = await agentWithEngine("engine-slow")
    const ROUNDS = 6
    for (let i = 0; i < ROUNDS; i++) {
      const created = await a7("POST", "/api/projects", {
        body: { name: `Xoa khi dang chay ${i}`, template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
      })
      const gid = created.json.project.id
      const run = await a7("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
      eq(run.status, 202, "run bắt đầu")
      // xoá đúng lúc engine vừa spawn (cửa sổ tử huyệt đo được là ~5–15ms)
      await new Promise(r => setTimeout(r, 8 + i))
      const del = await a7("DELETE", `/api/projects/${gid}`)
      eq(del.status, 200, "DELETE 200")
      await new Promise(r => setTimeout(r, 600))     // để child 'close' kịp bắn
      eq(await pathExists(join(wsRoot, "projects", gid)), false,
        `vòng ${i}: projects/${gid} bị DỰNG LẠI sau khi đã xoá (thư mục ma)`)
      const back = await a7("POST", `/api/trash/${del.json.trashId}/restore`)
      eq(back.status, 200, `vòng ${i}: Hoàn tác phải chạy được, nhận ${back.status} ${back.json?.error?.code ?? ""}`)
      await a7("DELETE", `/api/projects/${gid}`)
    }
  })

}
