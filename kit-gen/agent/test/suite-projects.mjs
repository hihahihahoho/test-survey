/* suite-projects.mjs — §6.2 B: CRUD project trọn vòng + thùng rác 30 ngày + phục hồi
   + mã xác nhận 4 số ngoài băng (§3.4 lớp 8) + export .zip. */
import { mkdir, writeFile, readFile, readdir, utimes } from "node:fs/promises"
import { join } from "node:path"
import { createBasicProject, describe, eq, includes, it, ok, readZip, rmTemp } from "./harness.mjs"

export async function run({ api, agent, wsRoot }) {
  // ─────────────────────────────────────────── 3. PROJECT CRUD trọn vòng
  describe("project CRUD")
  let projectId = null
  await it("danh sách rỗng lúc đầu, có ETag", async () => {
    const r = await api("GET", "/api/projects")
    eq(r.status, 200, "status")
    eq(r.json.items.length, 0, "0 project")
    ok(r.headers.etag, "có ETag")
  })
  await it("POST tạo project → 201, slug bỏ dấu; lắp bộ khung mẫu vào là 3 sheet 25 ô", async () => {
    const r = await createBasicProject(api, { name: "Tết 2026 — VietinBank iPay", firstVariant: { vi: "Tết đỏ", bg: "magenta" }, tags: ["tet", "banking"] })
    eq(r.status, 201, "status")
    projectId = r.json.project.id
    ok(/^tet-2026-vietinbank-ipay-[0-9a-f]{4}$/.test(projectId), `id có hậu tố hex: ${projectId}`)
    eq(r.json.project.stats.sheets, 3, "3 sheet")
    eq(r.json.project.stats.components, 25, "25 ô")
    eq(r.json.project.stats.variants, 1, "1 phong cách")
    eq(r.json.project.name, "Tết 2026 — VietinBank iPay", "tên có dấu giữ nguyên")
  })
  await it("GET project trả state.jobs (nguồn của ma trận S2)", async () => {
    const r = await api("GET", `/api/projects/${projectId}`)
    eq(r.status, 200, "status")
    eq(Object.keys(r.json.project.state.jobs).length, 3, "3 job (1 phong cách × 3 sheet)")
    eq(r.json.project.state.jobs["tet-do-main"] ?? r.json.project.state.jobs[Object.keys(r.json.project.state.jobs)[0]], "never", "job chưa gen = never")
    eq(r.json.project.state.stale, true, "project mới là stale")
    eq(r.json.project.workflow.completed, true, "project API cũ mặc định đã hoàn tất workflow")
  })
  await it("lưu và khôi phục wizard draft trong file của đúng project", async () => {
    const saved = await api("PUT", `/api/projects/${projectId}/workflow-draft`, { body: { completed: false, draft: { step: 3, brief: "Tết xanh" } } })
    eq(saved.status, 200)
    eq(saved.json.completed, false)
    const read = await api("GET", `/api/projects/${projectId}/workflow-draft`)
    eq(read.json.draft, { step: 3, brief: "Tết xanh" })
    const project = await api("GET", `/api/projects/${projectId}`)
    eq(project.json.project.workflow.completed, false)
    const done = await api("PUT", `/api/projects/${projectId}/workflow-draft`, { body: { completed: true, draft: read.json.draft } })
    eq(done.json.completed, true)
  })
  await it("PATCH đổi tên/tag → thư mục KHÔNG đổi", async () => {
    const r = await api("PATCH", `/api/projects/${projectId}`, { body: { name: "Tết 2026 (đã đổi)", tags: ["tet"] } })
    eq(r.status, 200, "status")
    eq(r.json.project.name, "Tết 2026 (đã đổi)", "tên mới")
    eq(r.json.project.id, projectId, "id/thư mục không đổi")
  })
  await it("PATCH tên rỗng bị 400 INVALID_NAME", async () => {
    const r = await api("PATCH", `/api/projects/${projectId}`, { body: { name: "   " } })
    eq(r.status, 400, "status")
    eq(r.json.error.code, "INVALID_NAME", "code")
  })
  await it("POST tạo project với slug trùng → 409 PROJECT_ID_TAKEN + gợi ý", async () => {
    const r = await api("POST", "/api/projects", { body: { name: "Trùng", slug: projectId, template: "blank", firstVariant: { vi: "V1" } } })
    eq(r.status, 409, "status")
    eq(r.json.error.code, "PROJECT_ID_TAKEN", "code")
    ok(r.json.error.details.suggestion, "có gợi ý")
  })
  /* `basic`/`import`/`from-project` đã rời khỏi sản phẩm 08/09/2026. Một client bản cũ
     gửi lại tên đó phải NGHE THẤY 400, chứ không nhận về một dự án rỗng trông y như
     thành công rồi ngồi hỏi 25 ô mẫu của mình đâu. */
  await it("template ngoài `blank` → 400 BAD_REQUEST (không im lặng tạo dự án rỗng)", async () => {
    for (const template of ["basic", "import", "from-project"]) {
      const r = await api("POST", "/api/projects", { body: { name: `Mẫu ${template}`, template, firstVariant: { vi: "V1" } } })
      eq(r.status, 400, `status của template ${template}`)
      eq(r.json.error.code, "BAD_REQUEST", "code")
    }
    const after = await api("GET", "/api/projects")
    ok(!after.json.items.some(x => x.name.startsWith("Mẫu ")), "không dự án nào được tạo")
  })
  await it("nhân bản project (contract+refs) → 201, project mới độc lập", async () => {
    const r = await api("POST", `/api/projects/${projectId}/duplicate`, {
      body: { name: "Tết 2026 (bản sao)", include: ["contract", "refs"], variants: "all" },
    })
    eq(r.status, 201, "status")
    ok(r.json.project.id !== projectId, "id khác")
    eq(r.json.project.stats.sheets, 3, "copy đủ 3 sheet")
    const del = await api("DELETE", `/api/projects/${r.json.project.id}`)
    eq(del.status, 200, "dọn bản sao")
  })
  await it("GET project không tồn tại → 404 PROJECT_NOT_FOUND", async () => {
    const r = await api("GET", "/api/projects/khong-co-dau-a1b2")
    eq(r.status, 404, "status")
    eq(r.json.error.code, "PROJECT_NOT_FOUND", "code")
  })
  await it("project.json hỏng → thẻ broken, KHÔNG biến mất im lặng", async () => {
    const badId = "hong-json-0001"
    await mkdir(join(wsRoot, "projects", badId), { recursive: true })
    await writeFile(join(wsRoot, "projects", badId, "project.json"), '{"name":"x",,}')
    const list = await api("GET", "/api/projects")
    const found = list.json.items.find(p => p.id === badId)
    ok(found, "vẫn xuất hiện trong danh sách")
    eq(found.broken, true, "broken=true")
    eq(found.error.code, "PROJECT_BROKEN", "error.code")
    const one = await api("GET", `/api/projects/${badId}`)
    eq(one.status, 422, "GET một project hỏng = 422")
    await rmTemp(join(wsRoot, "projects", badId))
  })
  await it("dọn cache dẫn xuất KHÔNG chạm contract.json", async () => {
    const before = await api("GET", `/api/projects/${projectId}/contract`)
    const r = await api("POST", `/api/projects/${projectId}/clean`, { body: { targets: ["skeleton", "prompts"] } })
    eq(r.status, 200, "status")
    const after = await api("GET", `/api/projects/${projectId}/contract`)
    eq(after.json.version, before.json.version, "version contract không đổi")
    eq(after.json.contract.sheets.length, 3, "contract còn nguyên")
  })
  await it("export .zip đọc lại được, chứa contract.json", async () => {
    const r = await api("GET", `/api/projects/${projectId}/export.zip?include=contract,refs`)
    eq(r.status, 200, "status")
    includes(r.headers["content-disposition"], ".zip", "Content-Disposition")
    const entries = await readZip(r.body)
    ok(entries.some(e => e.name.endsWith("contract.json")), "có contract.json")
    ok(entries.some(e => e.name.endsWith("project.json")), "có project.json")
  })

  await it("export .zip LỌC THEO PHONG CÁCH (?variant=) — kits/<v>/ và raw/<v>-*.png", async () => {
    // NEEDS-d2p2 §4.2: tab Xuất của S5 cho chọn phong cách; trước đây zip luôn chứa mọi phong cách.
    const g = await api("GET", `/api/projects/${projectId}/contract`)
    const con = g.json.contract
    if (!con.variants.some(v => v.id === "vang")) {
      con.variants.push({ id: "vang", vi: "Vàng", bg: "magenta", style: "gold" })
      for (const sh of con.sheets) sh.variants = con.variants.map(v => v.id)
      const put = await api("PUT", `/api/projects/${projectId}/contract`,
        { headers: { "if-match": String(g.json.version) }, body: { contract: con } })
      eq(put.status, 200, "thêm phong cách thứ hai")
    }
    const v1 = con.variants[0].id
    const dir = join(wsRoot, "projects", projectId)
    const write = async (rel, data) => {
      await mkdir(join(dir, rel, ".."), { recursive: true })
      await writeFile(join(dir, rel), data)
    }
    await write(`kits/${v1}/01-btn.png`, "KIT-1")
    await write("kits/vang/01-btn.png", "KIT-2")
    await write("kits/manifest.json", "{}")
    await write(`raw/${v1}-main.png`, "RAW-1")
    await write("raw/vang-main.png", "RAW-2")

    const all = await api("GET", `/api/projects/${projectId}/export.zip?include=contract,kits,raw`)
    const allNames = (await readZip(all.body)).map(e => e.name)
    ok(allNames.some(n => n.includes(`kits/${v1}/`)), "không lọc: có phong cách 1")
    ok(allNames.some(n => n.includes("kits/vang/")), "không lọc: có phong cách 2")

    const only = await api("GET", `/api/projects/${projectId}/export.zip?include=contract,kits,raw&variant=vang`)
    eq(only.status, 200, "status")
    includes(only.headers["content-disposition"], "-vang-", "tên file có phong cách")
    const names = (await readZip(only.body)).map(e => e.name)
    ok(names.some(n => n.includes("kits/vang/01-btn.png")), "giữ kit của phong cách đã chọn")
    ok(!names.some(n => n.includes(`kits/${v1}/`)), `KHÔNG được chứa kits/${v1}/: ${names.join(", ")}`)
    ok(names.some(n => n.endsWith("raw/vang-main.png")), "giữ raw của phong cách đã chọn")
    ok(!names.some(n => n.endsWith(`raw/${v1}-main.png`)), "KHÔNG chứa raw của phong cách khác")
    ok(names.some(n => n.endsWith("contract.json")), "vẫn có bản thiết kế")
  })
  await it("export .zip với phong cách KHÔNG có trong bản thiết kế → 422 UNKNOWN_VARIANT", async () => {
    const r = await api("GET", `/api/projects/${projectId}/export.zip?include=kits&variant=khong-ton-tai`)
    eq(r.status, 422, "status")
    eq(r.json.error.code, "UNKNOWN_VARIANT", "code")
    ok(Array.isArray(r.json.error.details.unknown), "nói rõ cái nào lạ")
  })
  await it("nút 'Tải .zip': ĐÚNG một request `export.zip?include=kits` là ra file thật", async () => {
    /* Blind-test bấm nút mà không có file nào rơi xuống. Nguyên nhân ở web (ghép nhầm
       `export.zip` vào đường `/files/`), nhưng phía agent phải có ca khoá lại ĐÚNG cái
       request mà nút gửi đi — không variant, chỉ `include=kits` — để đời sau đổi route
       hay đổi mặc định `include` thì đỏ ở đây chứ không đỏ trong tay người dùng. */
    const r = await api("GET", `/api/projects/${projectId}/export.zip?include=kits`)
    eq(r.status, 200, "status")
    eq(r.headers["content-type"], "application/zip", "Content-Type")
    includes(r.headers["content-disposition"], "attachment;", "phải là attachment")
    includes(r.headers["content-disposition"], ".zip", "tên file .zip")
    ok(Number(r.headers["content-length"]) > 0, "Content-Length > 0")
    ok(r.body.length > 0 && r.body[0] === 0x50 && r.body[1] === 0x4b, "byte đầu là magic 'PK'")
    const names = (await readZip(r.body)).map(e => e.name)
    ok(names.some(n => n.includes("kits/")), `có ảnh đã cắt: ${names.join(", ")}`)
    ok(!names.some(n => n.startsWith(`${projectId}/raw/`)), "include=kits thì KHÔNG kèm raw")
  })
  await it("đường dẫn SAI mà web từng gửi (`/files/` bọc cả đường API) phải BÁO LỖI, không im lặng", async () => {
    /* Hình dạng cũ: /api/projects/<id>/files/api/projects/<id>/export.zip%3Finclude%3Dkits
       Nó trả 400 PATH_ESCAPE — tức bug là THẤY ĐƯỢC ở tầng agent; thứ đã nuốt nó là web.
       Giữ ca này để không ai "nới" READABLE_TOP rồi biến 400 thành 200 zip rỗng. */
    const bad = `/api/projects/${projectId}/files/` +
      encodeURIComponent(`/api/projects/${projectId}/export.zip?include=kits`)
    const r = await api("GET", bad)
    ok(r.status >= 400, `phải lỗi, nhận ${r.status}`)
    ok(r.json?.error?.code !== undefined, "có mã lỗi đọc được")
  })

  // ─────────────────────────────────────────── 4. TRASH + restore
  describe("thùng rác")
  let trashId = null
  await it("DELETE → chuyển vào .trash/ (KHÔNG rm thẳng), có hạn 30 ngày", async () => {
    const r = await api("DELETE", `/api/projects/${projectId}`)
    eq(r.status, 200, "status")
    trashId = r.json.trashId
    ok(/^\d{8}-\d{6}-/.test(trashId), `trashId có timestamp: ${trashId}`)
    const days = (Date.parse(r.json.restoreBefore) - Date.now()) / 864e5
    ok(days > 29 && days < 31, `hạn ~30 ngày, đang là ${days.toFixed(1)}`)
    const stillOnDisk = await readFile(join(wsRoot, ".kitgen", "trash", trashId, "contract.json"), "utf8")
    ok(stillOnDisk.includes("sheets"), "file thật vẫn nằm trong .trash/")
    const list = await api("GET", "/api/projects")
    ok(!list.json.items.some(p => p.id === projectId), "biến mất khỏi danh sách project")
  })
  await it("GET project đã xoá → 410 PROJECT_IN_TRASH", async () => {
    const r = await api("GET", `/api/projects/${projectId}`)
    eq(r.status, 410, "status")
    eq(r.json.error.code, "PROJECT_IN_TRASH", "code")
  })
  await it("GET /api/trash liệt kê đúng bản đã xoá", async () => {
    const r = await api("GET", "/api/trash")
    eq(r.status, 200, "status")
    const item = r.json.items.find(i => i.trashId === trashId)
    ok(item, "có trong thùng rác")
    eq(item.projectId, projectId, "projectId")
    ok(item.bytes > 0, "có dung lượng")
  })
  await it("phục hồi từ thùng rác → project trở lại nguyên vẹn", async () => {
    const r = await api("POST", `/api/trash/${trashId}/restore`)
    eq(r.status, 200, "status")
    eq(r.json.project.id, projectId, "cùng id")
    eq(r.json.project.stats.sheets, 3, "còn đủ 3 sheet")
    const c = await api("GET", `/api/projects/${projectId}/contract`)
    eq(c.json.contract.sheets.length, 3, "contract nguyên vẹn")
  })
  await it("xoá vĩnh viễn cần đúng cụm xác nhận và đúng projectId", async () => {
    const d = await api("DELETE", `/api/projects/${projectId}`)
    const tid = d.json.trashId
    const missing = await api("DELETE", `/api/trash/${tid}?purge=1`, { headers: { "x-kitgen-project": projectId } })
    eq(missing.status, 412, "thiếu xác nhận → 412")
    const wrongProject = await api("DELETE", `/api/trash/${tid}?purge=1`, { headers: { "x-kitgen-project": "project-khac", "x-kitgen-confirm": "xac-nhan" } })
    eq(wrongProject.status, 403, "sai project → 403")
    eq(wrongProject.json.error.code, "CONFIRM_INVALID", "code")
    const good = await api("DELETE", `/api/trash/${tid}?purge=1`, { headers: { "x-kitgen-project": projectId, "x-kitgen-confirm": "xac-nhan" } })
    eq(good.status, 204, "đúng project và xác nhận → 204")
    const list = await api("GET", "/api/trash")
    ok(!list.json.items.some(i => i.trashId === tid), "đã rời thùng rác")
  })

  // ─────────────────────────────────────────── 3b. BẢN NHÁP: LỊCH SỬ + CHỐNG GHI ĐÈ
  /* Sự cố 23/09/2026 (test-vcb-d6fd): GET bản nháp hỏng, web vẫn cho sửa trên màn
     trắng, cú sửa đầu PUT đè composer rỗng lên `workflow-draft.json` — và `.history/`
     không có gì của bản nháp để cứu. Hai lớp của agent: cất bản cũ trước khi đè, và
     409 khi tab cầm mốc cũ định ghi đè bản mới hơn. */
  describe("bản nháp — lịch sử + chống ghi đè")
  let dp = null
  const draftFile = () => join(wsRoot, "projects", dp, "workflow-draft.json")
  const histDir = () => join(wsRoot, "projects", dp, ".history", "draft")
  /** Lùi mtime của bản nháp hiện hành 2 giờ ⇒ nó là bản "nằm yên" của phiên trước. */
  const ageDraft = async () => { const t = new Date(Date.now() - 2 * 3600e3); await utimes(draftFile(), t, t) }
  const history = async () => (await api("GET", `/api/projects/${dp}/workflow-draft/history`)).json.items
  const put = (draft, extra = {}) => api("PUT", `/api/projects/${dp}/workflow-draft`, { body: { completed: false, draft, ...extra } })

  await it("ghi đè bản nháp đã có ⇒ bản cũ được cất vào .history/draft, đọc lại được qua API", async () => {
    const r = await createBasicProject(api, { name: "Bản nháp có lịch sử", firstVariant: { vi: "V1" } })
    eq(r.status, 201, "tạo dự án")
    dp = r.json.project.id
    eq((await put({ docVersion: 1, v: "A" })).status, 200, "lưu A")
    eq((await history()).length, 0, "lần lưu đầu: chưa có gì bị đè ⇒ chưa có bản cất")
    eq((await put({ docVersion: 1, v: "B" })).status, 200, "lưu B")
    const items = await history()
    eq(items.length, 1, "một bản cất")
    ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}\.[0-9]{3}Z$/.test(items[0].name), `tên đúng kiểu mốc: ${items[0].name}`)
    ok(items[0].size > 0 && !Number.isNaN(Date.parse(items[0].updatedAt)), "có size + updatedAt")
    const one = await api("GET", `/api/projects/${dp}/workflow-draft/history/${items[0].name}`)
    eq(one.status, 200, "đọc một bản")
    eq(one.json.draft, { docVersion: 1, v: "A" }, "bản cất là A — thứ vừa bị đè")
  })

  await it("hai lượt tự lưu liền nhau giữa lúc gõ ⇒ KHÔNG cất thêm (20 suất không cháy trong một phút)", async () => {
    eq((await put({ docVersion: 1, v: "C" })).status, 200)
    eq((await history()).length, 1, "vẫn một bản cất")
  })

  await it("bản nằm yên của phiên trước LUÔN được cất; nội dung trùng bản cất gần nhất thì không cất lại", async () => {
    await ageDraft()
    eq((await put({ docVersion: 1, v: "D" })).status, 200)
    let items = await history()
    eq(items.length, 2, "C nằm yên ⇒ được cất")
    eq((await api("GET", `/api/projects/${dp}/workflow-draft/history/${items[0].name}`)).json.draft.v, "C", "mới nhất trước")
    await ageDraft()
    eq((await put({ docVersion: 1, v: "D" })).status, 200)
    items = await history()
    eq(items.length, 3, "D nằm yên, khác C ⇒ cất")
    await ageDraft()
    eq((await put({ docVersion: 1, v: "E" })).status, 200)
    eq((await history()).length, 3, "D trùng từng byte với bản cất mới nhất ⇒ không cất lần hai")
  })

  await it("tỉa còn đúng 20 bản mới nhất", async () => {
    await mkdir(histDir(), { recursive: true })
    for (let i = 0; i < 25; i++)
      await writeFile(join(histDir(), `2020-01-01T0000${String(i).padStart(2, "0")}.000Z.json`), JSON.stringify({ old: i }))
    await ageDraft()
    eq((await put({ docVersion: 1, v: "F" })).status, 200)
    const names = (await readdir(histDir())).filter(f => f.endsWith(".json")).sort()
    eq(names.length, 20, "20 file")
    ok(!names.includes("2020-01-01T000000.000Z.json"), "bản cũ nhất bị tỉa")
    const items = await history()
    eq(items.length, 20, "API cũng thấy 20")
    eq((await api("GET", `/api/projects/${dp}/workflow-draft/history/${items[0].name}`)).json.draft.v, "E", "bản mới nhất còn nguyên")
  })

  await it("tên bản cất lạ / leo thư mục ⇒ 400, không đọc ra ngoài .history/draft", async () => {
    /* `%2e%2e` trần thì URL tự chuẩn hoá thành thư mục cha TRƯỚC khi tới router (ra
       GET bản nháp, 200) — không phải lỗ. Thứ phải chặn là `..` còn sống tới handler. */
    for (const bad of ["..%2F..%2Fproject.json", "%2e%2e%2Fproject.json", "..%5Cproject.json", "2026-01-01T000000.000Z.json", "project", "2026-01-01T000000Z"]) {
      const r = await api("GET", `/api/projects/${dp}/workflow-draft/history/${bad}`)
      eq(r.status, 400, `status cho ${bad}`)
      eq(r.json.error.code, "BAD_REQUEST", `code cho ${bad}`)
    }
    const missing = await api("GET", `/api/projects/${dp}/workflow-draft/history/2019-01-01T000000.000Z`)
    eq(missing.status, 404, "đúng dạng mà không có ⇒ 404")
    eq((await api("GET", "/api/projects/khong-co-du-an/workflow-draft/history")).status, 404, "dự án vắng ⇒ 404")
  })

  await it("cất lịch sử hỏng thì VẪN lưu, và agent la lên trong log", async () => {
    const { rm } = await import("node:fs/promises")
    await rm(histDir(), { recursive: true, force: true })
    await writeFile(histDir(), "không phải thư mục")          // ensureDir/copy chắc chắn hỏng
    await ageDraft()
    const lines = []
    const orig = process.stderr.write
    process.stderr.write = (chunk, ...rest) => { lines.push(String(chunk)); return true }
    let r
    try { r = await put({ docVersion: 1, v: "G" }) } finally { process.stderr.write = orig }
    eq(r.status, 200, "lượt lưu không bị chặn")
    eq(JSON.parse(await readFile(draftFile(), "utf8")).v, "G", "đĩa có bản mới")
    ok(lines.some(l => l.includes("lịch sử bản nháp") && l.includes(dp)), `có dòng cảnh báo: ${lines.join("|")}`)
    await rm(histDir(), { force: true })
  })

  await it("baseUpdatedAt cũ hơn đĩa ⇒ 409 DRAFT_CONFLICT kèm mốc của đĩa, và đĩa KHÔNG đổi", async () => {
    const u1 = (await api("GET", `/api/projects/${dp}/workflow-draft`)).json.updatedAt
    const a = await put({ docVersion: 1, v: "tab1" }, { baseUpdatedAt: u1 })
    eq(a.status, 200, "tab 1 lưu với mốc đúng")
    const u2 = a.json.updatedAt
    ok(u2 !== u1 && Date.parse(u2) > Date.parse(u1), "mốc tăng")
    const b = await put({ docVersion: 1, v: "tab2-cu" }, { baseUpdatedAt: u1 })
    eq(b.status, 409, "tab 2 cầm mốc cũ")
    eq(b.json.error.code, "DRAFT_CONFLICT", "code")
    eq(b.json.error.details.updatedAt, u2, "details.updatedAt = mốc đĩa")
    eq(JSON.parse(await readFile(draftFile(), "utf8")).v, "tab1", "đĩa giữ bản của tab 1")
    const n = await put({ docVersion: 1, v: "chua-tung-thay" }, { baseUpdatedAt: null })
    eq(n.status, 409, "null = 'tôi chưa thấy lượt lưu nào' ⇒ cũng là xung đột khi đĩa đã có mốc")
    const bad = await put({ docVersion: 1 }, { baseUpdatedAt: 123 })
    eq(bad.status, 400, "mốc không phải chuỗi ⇒ 400")
    const c = await put({ docVersion: 1, v: "tab1-tiep" }, { baseUpdatedAt: u2 })
    eq(c.status, 200, "mốc khớp ⇒ lưu tiếp")
  })

  await it("hai PUT cùng mốc bay song song ⇒ đúng MỘT lượt qua, lượt kia 409", async () => {
    const u = (await api("GET", `/api/projects/${dp}/workflow-draft`)).json.updatedAt
    const [x, y] = await Promise.all([
      put({ docVersion: 1, v: "x" }, { baseUpdatedAt: u }),
      put({ docVersion: 1, v: "y" }, { baseUpdatedAt: u }),
    ])
    eq([x.status, y.status].sort(), [200, 409], "một qua, một bị chặn")
  })

  await it("client đời cũ KHÔNG gửi baseUpdatedAt ⇒ vẫn lưu như trước (tương thích ngược)", async () => {
    const r = await put({ docVersion: 1, v: "client-cu" })
    eq(r.status, 200, "status")
    eq(JSON.parse(await readFile(draftFile(), "utf8")).v, "client-cu", "đã ghi")
  })

  // project mới cho các nhóm test sau
  let pid = null
  await it("tạo lại project để test contract/refs/run", async () => {
    const r = await createBasicProject(api, { name: "Kiểm thử hợp đồng", firstVariant: { id: "tet", vi: "Tết đỏ", bg: "magenta" } })
    eq(r.status, 201, "status")
    pid = r.json.project.id
  })

  return { pid }
}
