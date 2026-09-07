/* suite-runs.mjs — §6.2 E: run-store trên đĩa, chặn trước bằng doctor, UNKNOWN_JOB,
   RUN_CONFLICT, stream NDJSON + reconnect ?from=, dừng run, gen→auto-slice bằng engine giả. */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  describe, it, eq, ok, includes, waitFor, pathExists, lsDir,
  makeClient, fakeDoctor, CLIENT, PAGES, PORT,
} from "./harness.mjs"
import { createAgent } from "../server.mjs"
import { buildCommand } from "../lib/engine.mjs"

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

  /* ══ BA ĐỜI ẢNH GỐC — v1, v2, và quyền XOÁ BẢN CŨ ═══════════════════════════
     Chủ sản phẩm: "gen lại nó phải ver 1 2 chứ, cho phép xoá ver cũ". Trước bản này
     thanh phiên bản đứng ở "v1" vĩnh viễn vì KHÔNG AI ghi vào `.history/raw/`:
     `gen.sh` dặn codex đè thẳng lên `raw/<job>.png`, còn agent chỉ chép snapshot ra
     `runs/<id>/artifacts/` SAU khi ảnh mới đã ghi — bản cũ mất trước đó. Nay
     `run-handle.launch()` cất bản cũ NGAY TRƯỚC khi spawn engine.
     Ca này chạy engine giả HAI lượt trên cùng một tấm và đòi thấy đời thứ hai. */
  await it("[phiên bản] gen lượt hai ⇒ bản cũ vào lịch sử (v1 + v2), xoá được bản cũ, KHÔNG xoá được bản đang dùng", async () => {
    const { api: aH } = await agentWithEngine("engine-fake")
    const created = await aH("POST", "/api/projects", {
      body: { name: "Ba doi anh", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const gid = created.json.project.id
    const genOnce = async () => {
      const r = await aH("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", jobs: ["tet-main"], autoSliceAfterGen: false } })
      eq(r.status, 202, "run 202")
      await aH("GET", `/api/runs/${r.json.runId}/stream?from=0`)   // đóng khi run.finished
    }
    try {
      await genOnce()
      const h1 = await aH("GET", `/api/projects/${gid}/raw/tet-main/history`)
      eq(h1.status, 200, "đọc được lịch sử")
      eq(h1.json.items.length, 1, "lượt ĐẦU chưa có gì để cất ⇒ chỉ bản đang dùng")
      eq(h1.json.items[0].current, true, "và nó là bản đang dùng")

      await genOnce()
      const h2 = await aH("GET", `/api/projects/${gid}/raw/tet-main/history`)
      eq(h2.json.items.length, 2, "lượt HAI ⇒ hai đời (v1 cũ + v2 đang dùng)")
      eq(h2.json.items.filter(i => i.current).length, 1, "đúng một bản đang dùng")
      const old = h2.json.items.find(i => !i.current)
      ok(/^r-\d+$/.test(old.id), `id bản cũ ${old.id} đúng dạng r-<ms>`)
      ok(old.bytes > 0, "bản cũ có bytes thật, không phải file rỗng")

      // ① BẢN ĐANG DÙNG KHÔNG XOÁ ĐƯỢC — đó là `raw/<job>.png`, đầu vào của bước cắt.
      const cur = await aH("DELETE", `/api/projects/${gid}/raw/tet-main/history/current`)
      eq(cur.status, 409, "xoá bản đang dùng ⇒ 409")
      eq(cur.json.error.code, "HISTORY_CURRENT", "có mã riêng để web nói đúng lý do")

      // ② ID LẠ / TRAVERSAL bị chặn TRƯỚC khi chạm đĩa.
      eq((await aH("DELETE", `/api/projects/${gid}/raw/tet-main/history/r-abc`)).status, 400, "id sai dạng ⇒ 400")
      /* `..` ĐÃ RỖNG NGHĨA TỪ ĐƯỜNG ĐI: router khớp `/history/..` là 404 (không có route
         nào tên đó sau khi chuẩn hoá). Ca này khoá cái quan trọng hơn — dạng ĐÃ MÃ HOÁ,
         thứ đi lọt qua chuẩn hoá URL rồi mới rơi vào tay handler: nó phải chết ở
         `safeSegment`/`RE_RAW_HISTORY_ID`, KHÔNG bao giờ thành một đường dẫn trên đĩa. */
      const escape = await aH("DELETE", `/api/projects/${gid}/raw/tet-main/history/${encodeURIComponent("../../contract.json")}`)
      ok(escape.status === 400, `thoát thư mục ⇒ 400, nhận ${escape.status}`)
      ok(await pathExists(join(wsRoot, "projects", gid, "contract.json")), "contract.json KHÔNG bị đụng tới")
      eq((await aH("DELETE", `/api/projects/${gid}/raw/tet-main/history/r-1`)).status, 404, "id đúng dạng mà không có ⇒ 404")

      // ③ XOÁ THẬT: bản cũ biến mất, bản đang dùng còn nguyên trên đĩa.
      const del = await aH("DELETE", `/api/projects/${gid}/raw/tet-main/history/${old.id}`)
      eq(del.status, 200, "xoá bản cũ ⇒ 200")
      eq(del.json.deleted, true, "báo đã xoá")
      const h3 = await aH("GET", `/api/projects/${gid}/raw/tet-main/history`)
      eq(h3.json.items.length, 1, "chỉ còn bản đang dùng")
      eq(h3.json.items[0].current, true, "và nó vẫn là bản đang dùng")
      eq((await aH("GET", `/api/projects/${gid}/files/raw/tet-main.png`)).status, 200,
        "ảnh gốc đang dùng KHÔNG hề bị đụng tới")
    } finally {
      await aH("DELETE", `/api/projects/${gid}`)
    }
  })

  /* ── CẮT LŨY TIẾN (15/08) ─────────────────────────────────────────────────
     Chủ sản phẩm ngồi xem một lượt gen THẬT: 10 tấm, mỗi tấm vài phút, và KHÔNG có
     gì hiện ra cho tới khi tấm cuối xong — vì cả ba việc hậu kỳ đều xếp sau lượt:
     cắt (một lượt slice.py cho cả lượt), thumbnail (sinh lười lúc web hỏi), ảnh bìa
     (sau `run.finished`). Tệ nhất là ô "Đã xong" trong tab Ảnh gốc lại là ô ĐEN:
     web đọc `job.artifact.path`, mà ô đó chỉ được điền trong `settleGenJobs()` —
     tức là sau khi CẢ pha gen đóng.
     Ca này khoá lời hứa mới: mỗi tấm tự đi hết chu trình của nó, NGAY GIỮA LƯỢT. */
  await it("[cắt lũy tiến] tấm xong sớm ra ngay: artifact + cắt + thumbnail GIỮA lượt, không đợi hết run", async () => {
    /* argv của lượt cắt hẹp là HỢP ĐỒNG với slice.py thật (`parse_cli`): sai một chữ
       ở cờ là engine cắt CẢ TẤM thay vì một tấm, mà test bằng engine giả sẽ không thấy. */
    const narrow = buildCommand("slice", "/tmp/p", { variants: ["tet"], sheets: ["main"] })
    eq(narrow.args.slice(-2), ["tet", "--sheet=main"], "argv cắt hẹp")
    eq(buildCommand("slice", "/tmp/p", { variants: ["tet"] }).args.slice(-1), ["tet"],
      "không truyền sheets ⇒ argv y hệt bản cũ (pha cắt tổng không đổi)")

    const { api: a9 } = await agentWithEngine("engine-fake")
    const created = await a9("POST", "/api/projects", {
      body: { name: "Cat luy tien", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const gid = created.json.project.id
    const run = await a9("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 2, autoSliceAfterGen: true } })
    eq(run.status, 202, "run 202")
    const rid = run.json.runId

    /* ① BẰNG CHỨNG SỐNG: giữa lượt (run vẫn "running") đã có tấm mang artifact.
       Đây chính là ô đen "Đã xong" của tab Ảnh gốc — nó đen vì `artifact` còn null. */
    let midRun = null
    await waitFor(async () => {
      const r = (await a9("GET", `/api/runs/${rid}`)).json
      const ready = r.jobs.find(j => j.status === "ok" && j.artifact?.path)
      if (ready && (r.status === "running" || r.status === "queued")) {
        midRun = { job: ready.job, path: ready.artifact.path, status: r.status }
        return true
      }
      return false
    }, 20000, "artifact xuất hiện GIỮA lượt chạy")
    ok(midRun, "phải bắt được artifact giữa lượt")
    // …và ảnh ĐỌC ĐƯỢC ngay lúc đó, cả bản đầy đủ lẫn bản thu nhỏ của lưới
    const mid = await a9("GET", `/api/projects/${gid}/files/${midRun.path}`)
    eq(mid.status, 200, "ảnh của tấm xong sớm đọc được ngay giữa lượt")

    const stream = await a9("GET", `/api/runs/${rid}/stream?from=0`)      // đóng khi run.finished
    const evs = stream.text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
    const ready = evs.filter(e => e.type === "sheet.ready")
    eq(ready.length, 2, "mỗi tấm xong có đúng một sheet.ready (3 tấm, 1 tấm lỗi)")
    ok(ready.every(e => e.job && e.variant && e.sheet), "sheet.ready nêu job/variant/sheet")
    ok(ready.every(e => e.artifact?.path), "sheet.ready mang đường dẫn ảnh để web nạp thẳng")
    ok(ready.every(e => e.sliced?.ok), `mỗi tấm được cắt ngay: ${JSON.stringify(ready.map(e => e.sliced))}`)

    /* ② THỨ TỰ mới là thứ chứng minh "ra sớm": sheet.ready của tấm ĐẦU phải tới
       TRƯỚC khi tấm CUỐI gen xong, và trước cả pha cắt tổng. */
    const doneEvents = evs.filter(e => e.type === "job.done")
    ok(ready[0].seq < doneEvents[doneEvents.length - 1].seq,
      "tấm đầu phải xong chu trình TRƯỚC khi tấm cuối gen xong (nếu không thì vẫn là cắt cuối lượt)")
    const slicePhase = evs.find(e => e.type === "phase.changed" && e.phase.name === "slice")
    ok(slicePhase && ready.every(e => e.seq < slicePhase.seq), "sheet.ready phải tới trước pha cắt tổng")

    /* ③ LƯỚI AN TOÀN cuối lượt KHÔNG được phá thứ đã cắt: manifest vẫn đủ cả hai tấm
       (đây cũng là ca chống 'lượt cắt hẹp sau ghi đè mất phần của lượt trước'). */
    const kit = await a9("GET", `/api/projects/${gid}/kit?variant=tet`)
    eq(kit.status, 200, "kit 200")
    const sheets = [...new Set(kit.json.files.map(f => f.sheet))].sort()
    eq(sheets, ["main", "tall"], "manifest giữ đủ mọi tấm đã cắt, không tấm nào bị ghi đè mất")
    await a9("DELETE", `/api/projects/${gid}`)
  })

  /* ── HAI NHỊP CỦA CHU TRÌNH PER-SHEET (25/08) ─────────────────────────────
     BÁO LỖI: "gen ảnh xong 1 lúc lâu mới load", lưới "lác lác".
     NGUYÊN NHÂN ĐÃ ĐO: bản cắt-lũy-tiến ở trên vẫn gói SÁU việc vào MỘT hàm tuần tự
     (`finishSheet`), và `j.artifact` — thứ DUY NHẤT web đọc để biết có ảnh — được gán ở
     GIỮA, sau một lượt python kiểm hình học KHÔNG CÓ TRẦN và trước một lượt `slice.py`.
     Thêm nữa mọi tấm nối chung MỘT hàng đợi, nên tấm thứ n phải đợi hậu kỳ của n−1 tấm
     trước mới tới lượt được gán ảnh. Hậu quả đúng như lời than: ảnh nằm sẵn trên đĩa
     hàng chục giây trước khi web thấy, và tấm nào lọt hàng đợi trước thì hiện trước.
     LỜI HỨA MỚI: nhịp 1 (`sheet.image`) phát NGAY khi engine ghi xong ảnh — ngoài hàng
     đợi, không spawn tiến trình nào; nhịp 2 (`sheet.ready`) giữ nguyên hợp đồng cũ.
     Fixture `engine-slowpost` làm hậu kỳ chậm CÓ CHỦ Ý; không có khoảng trống đó thì ca
     này xanh cả với bản cũ lẫn bản mới, tức là không chứng minh được gì. */
  await it("[hai nhịp] sheet.image tới TRƯỚC khi cắt xong; artifact xuống đĩa ngay nhịp 1", async () => {
    const SLICE_MS = 1200
    const prevSlice = process.env.KITGEN_TEST_SLICE_DELAY_MS
    const prevGeo = process.env.KITGEN_GEOMETRY_TIMEOUT_MS
    process.env.KITGEN_TEST_SLICE_DELAY_MS = String(SLICE_MS)
    /* Kiểm hình học của fixture này TREO VĨNH VIỄN. Trần thật là 30s — không ngồi đợi
       được trong một ca có trần 25s, nên hạ bằng cửa thoát dev/test. Thứ ca đo là HÀNH
       VI khi chạm trần, không phải con số 30. */
    process.env.KITGEN_GEOMETRY_TIMEOUT_MS = "600"
    try {
      const { api: aS } = await agentWithEngine("engine-slowpost")
      const created = await aS("POST", "/api/projects", {
        body: { name: "Hai nhip", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
      })
      const gid = created.json.project.id
      const run = await aS("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", maxJobs: 2, autoSliceAfterGen: true } })
      eq(run.status, 202, "run 202")
      const rid = run.json.runId

      /* ① ARTIFACT XUỐNG ĐĨA Ở NHỊP 1, KHÔNG PHẢI TRONG RAM.
         Đọc THẲNG `run.json` chứ không qua API: nếu nhịp 1 chỉ `emit()` mà quên
         `persist()`, thì người mở lại app (hoặc agent khởi động lại) mất sạch — mà đó
         đúng là cách chủ sản phẩm gặp lỗi này. Và tại đúng khoảnh khắc ấy `kits/` phải
         CÒN TRỐNG: đó là bằng chứng ảnh không hề đợi lượt cắt nào. */
      const runJson = join(wsRoot, "projects", gid, "runs", rid, "run.json")
      let luc1 = null
      await waitFor(async () => {
        const r = JSON.parse(await readFile(runJson, "utf8").catch(() => "{}"))
        const co = (r.jobs ?? []).find(j => j.artifact?.path)
        if (!co) return false
        luc1 = { job: co.job, path: co.artifact.path, kitCoChua: await pathExists(join(wsRoot, "projects", gid, "kits", "manifest.json")) }
        return true
      }, 15000, "artifact xuất hiện trong run.json")
      ok(luc1, "phải bắt được artifact trên đĩa")
      eq(luc1.kitCoChua, false, "lúc ảnh đã có trên đĩa thì lượt cắt CHƯA xong — ảnh không đợi cắt")
      // …và đọc được ngay qua API, đúng cái mà thẻ sheet sẽ xin
      const anh1 = await aS("GET", `/api/projects/${gid}/files/${luc1.path}`)
      eq(anh1.status, 200, "ảnh nhịp 1 đọc được ngay")
      /* CACHE: `runs/<id>/artifacts/` là SNAPSHOT bất biến (tạo lại ⇒ runId mới ⇒ URL mới)
         ⇒ trình duyệt được giữ mãi, và đó là thứ chặn lưới nhấp nháy mỗi lần refetch.
         `raw/` thì NGƯỢC LẠI: file sống, lượt gen sau ghi đè ngay tại chỗ — giữ cache ở
         đó là hiện ảnh CŨ sau khi người dùng vừa bấm "Tạo lại". */
      includes(anh1.headers["cache-control"], "immutable", "ảnh của lượt chạy là bất biến")
      const anhRaw = await aS("GET", `/api/projects/${gid}/files/raw/${luc1.job}.png`)
      eq(anhRaw.headers["cache-control"], "no-cache", "raw/ là file SỐNG ⇒ không được cache")

      const stream = await aS("GET", `/api/runs/${rid}/stream?from=0`)   // đóng khi run.finished
      const evs = stream.text.trim().split("\n").filter(Boolean).map(l => JSON.parse(l))
      const images = evs.filter(e => e.type === "sheet.image")
      const readys = evs.filter(e => e.type === "sheet.ready")
      ok(images.length >= 2, `phải có sheet.image cho từng tấm, thấy ${images.length}`)
      ok(images.every(e => e.artifact?.path && e.variant && e.sheet),
        "sheet.image mang đủ artifact.path + variant + sheet để web vẽ ngay")

      /* ② THỨ TỰ VÀ KHOẢNG CÁCH — đây mới là phần chứng minh.
         Cùng một tấm: nhịp 1 phải tới trước nhịp 2, và cách nhau ÍT NHẤT bằng thời gian
         cắt. Bản cũ (một nhịp) không có sheet.image nào, và nếu ai đó "thêm cho có" bằng
         cách phát nó ở cuối finishSheet thì khoảng cách này sẽ là ~0 và ca đỏ. */
      for (const im of images) {
        const rd = readys.find(e => e.job === im.job)
        ok(rd, `tấm ${im.job} phải có cả hai nhịp`)
        ok(im.seq < rd.seq, `${im.job}: sheet.image (seq ${im.seq}) phải tới trước sheet.ready (seq ${rd.seq})`)
        const cach = Date.parse(rd.t) - Date.parse(im.t)
        ok(cach >= SLICE_MS * 0.5,
          `${im.job}: ảnh phải tới sớm hơn hẳn lúc cắt xong, thấy cách ${cach}ms (cắt tốn ${SLICE_MS}ms)`)
      }
      /* Tấm ĐẦU phải có ảnh trước khi tấm CUỐI gen xong — nếu không thì người xem vẫn
         ngồi đợi cả lượt, đúng thứ đang phải chữa. */
      const jobDone = evs.filter(e => e.type === "job.done")
      ok(images[0].seq < jobDone[jobDone.length - 1].seq, "ảnh tấm đầu tới trước khi tấm cuối gen xong")

      /* ③ KIỂM HÌNH HỌC TREO KHÔNG ĐƯỢC GIẾT LƯỢT CHẠY.
         Trước bản vá, công cụ này nằm ngay trước phép gán artifact và không có trần:
         nó treo = ảnh không bao giờ hiện VÀ run không bao giờ đóng sổ. */
      const fin = evs.find(e => e.type === "run.finished")
      ok(fin, "run vẫn đóng sổ dù kiểm hình học treo")
      eq(fin.status, "done", "mọi tấm đều ok — kiểm hình học hỏng KHÔNG làm tấm nào thành lỗi")
      ok(evs.some(e => e.type === "job.log" && /kiểm hình học quá/.test(e.line ?? "")),
        "phải NÓI RA là đã bỏ qua kiểm hình học — im lặng là thứ tốn cả buổi để đào")
      const got = await aS("GET", `/api/runs/${rid}`)
      ok(got.json.jobs.every(j => j.artifact?.path), "mọi tấm vẫn giữ đủ artifact")
      ok(got.json.jobs.every(j => j.artifact?.validation === null),
        "hết giờ ⇒ validation null (không kiểm được), KHÔNG phải một kết luận giả")
      await aS("DELETE", `/api/projects/${gid}`)
    } finally {
      if (prevSlice === undefined) delete process.env.KITGEN_TEST_SLICE_DELAY_MS
      else process.env.KITGEN_TEST_SLICE_DELAY_MS = prevSlice
      if (prevGeo === undefined) delete process.env.KITGEN_GEOMETRY_TIMEOUT_MS
      else process.env.KITGEN_GEOMETRY_TIMEOUT_MS = prevGeo
    }
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

  /* ── THANH HẠN MỨC PHẢI ĐỘNG (07/09/2026) ─────────────────────────────────
     Lời phàn nàn nguyên văn của chủ sản phẩm: "ý là nó phải động chứ không phải
     tĩnh". Con số 0% là THẬT, cái sai là nó đứng im: `/api/usage` cache 5 phút và
     chỉ login/logout/`?refresh=1` mới dọn, nên vẽ xong cả lượt mà số vẫn y nguyên —
     đúng lúc người dùng nhìn nó chằm chằm. Ca này khoá cả hai nửa của sự thật:
     cache CÓ THẬT (không phải vừa sửa vừa bỏ luôn cache), và một lượt chạy đóng sổ
     là ĐỦ để lần đọc kế tiếp thấy số mới — không cần bấm, không đợi hết 5 phút. */
  await it("lượt chạy xong ⇒ hạn mức Codex đọc lại ngay, không đợi hết cache 5 phút", async () => {
    const { api: aU } = await agentWithEngine("engine-fake")
    const home = join(wsRoot, "..", "codex-home-run-usage")
    const day = join(home, "sessions", "2026", "09", "04")
    await mkdir(day, { recursive: true })
    const file = join(day, "rollout-2026-09-04T00-00-00-ddd.jsonl")
    const evt = used => JSON.stringify({
      timestamp: "2026-09-04T00:00:00.000Z", type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          limit_id: "codex", plan_type: "prolite", secondary: null,
          primary: { used_percent: used, window_minutes: 10080, resets_at: 1788763415 },
          credits: { has_credits: false, unlimited: false, balance: "0" },
        },
      },
    })
    await writeFile(file, evt(10) + "\n")
    process.env.KITGEN_CODEX_HOME = home
    let gid = null
    try {
      eq((await aU("GET", "/api/usage")).json.primary.remainingPercent, 90, "số đọc lần đầu")
      /* Giả lập đúng thứ codex làm khi chạy: ghi thêm một dòng `rate_limits` mới. */
      await writeFile(file, evt(10) + "\n" + evt(42) + "\n")
      eq((await aU("GET", "/api/usage")).json.primary.remainingPercent, 90,
        "chưa chạy gì ⇒ vẫn số cũ — cache là thật, ca này không phải xanh vì cache đã bị bỏ")

      const created = await aU("POST", "/api/projects", {
        body: { name: "Han muc phai dong", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
      })
      gid = created.json.project.id
      const run = await aU("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
      eq(run.status, 202, "run 202")
      await aU("GET", `/api/runs/${run.json.runId}/stream?from=0`)   // đóng khi run.finished

      eq((await aU("GET", "/api/usage")).json.primary.remainingPercent, 58,
        "lượt chạy đóng sổ ⇒ cache bị dọn ⇒ lần hỏi kế tiếp thấy con số mới (không cần ?refresh=1)")
    } finally {
      delete process.env.KITGEN_CODEX_HOME
      if (gid) await aU("DELETE", `/api/projects/${gid}`)
    }
  })

}
