/* suite-templates.mjs — TEMPLATE CỦA NGƯỜI DÙNG (lib/project-templates.mjs + routes/templates.mjs).
 *
 * Chủ sản phẩm: «sẽ có nút save template (bao gồm cả save ảnh, setting...), khi tạo mới
 * 1 project -> sẽ có thể chọn template sẵn». Ba lời hứa mà hỏng thì HỎNG CÂM:
 *   ① Template mang ĐỦ phần dựng (mọi thẻ + cài đặt + mọi ảnh đã đính) và KHÔNG mang
 *      kết quả đã vẽ (raw/kits/runs/contract…). Thiếu một ảnh là một pill trỏ vào hư
 *      không ở dự án mới — chỉ lộ ra lúc bấm Vẽ.
 *   ② Dự án mở từ template có ĐÚNG bản soạn đó và ảnh GIỐNG TỪNG BYTE, bìa trống.
 *   ③ Không gì dở dang: template ghi nguyên tử, dự án tạo hỏng thì bị dọn, id lạ là 400.
 *   ④ SỬA NỘI DUNG template qua một dự án làm việc VÔ HÌNH: mở / mở lại / lưu / huỷ; lưu là
 *      đổi chỗ nguyên tử (người đọc thấy trọn cũ hoặc trọn mới, agent chết giữa chừng thì
 *      lượt đọc sau đẩy nốt), dự án làm việc không lộ ra danh sách nào và không Vẽ được.
 */
import { cp, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, eq, it, ok, pathExists, lsDir, multipart, PNG_1x1 } from "./harness.mjs"
import { commitTemplateEdit, saveProjectAsTemplate, sweepTemplateEdits } from "../lib/project-templates.mjs"

/** Tài liệu composer hình dạng thật (docVersion 1) — ảnh nào cũng là `refs/<tên>`. */
function composerDoc() {
  return {
    docVersion: 1,
    updatedAt: "2026-09-01T08:00:00.000Z",
    composer: {
      themeValue: "Trò chơi nông trại",
      styleId: "cute-3d",
      brandColors: ["#ff8800", "#224466"],
      brandId: null,
      contextRefs: [{ path: "refs/inspo-1.png", note: "không khí" }],
      brandAssets: { logo: "refs/brand-1.png" },
      shapeAssets: { panel: "refs/shape-1.png" },
      contextMode: "images",
      blocks: [
        { id: "b1", kind: "uikit", mode: "list", maxPerSheet: 6, figmaFit: "core", cells: [{ id: "c1", shapeRef: "refs/shape-1.png" }] },
        { id: "b2", kind: "mascot", poses: [{ id: "p1", refPath: "refs/char-pose-1.png" }], poseSheet: { paths: ["refs/sub/sheet-1.png"] } },
        { id: "b3", kind: "background", doc: { type: "doc", content: [{ type: "pill", attrs: { path: "refs/char-lan.png" } }] } },
      ],
    },
  }
}

/** Bản soạn SAU KHI SỬA trong phiên sửa template: đổi chủ đề, bỏ thẻ thứ ba, ảnh ngữ cảnh
 *  trỏ vào một tấm MỚI tải lên (`refs/inspo-2.png` — agent tự đặt tên, xem routes/refs.mjs). */
function editedDoc() {
  const base = composerDoc()
  return {
    docVersion: 1,
    updatedAt: "2026-09-30T09:00:00.000Z",
    composer: {
      ...base.composer,
      themeValue: "Trò chơi nông trại — bản sửa",
      contextRefs: [{ path: "refs/inspo-2.png", note: "ảnh mới" }],
      blocks: base.composer.blocks.slice(0, 2),
    },
  }
}

/** Toàn bộ file dưới `root` → {đường tương đối: base64}, khoá đã xếp — so "y nguyên từng byte". */
async function snapshotDir(root) {
  const out = []
  async function rec(dir, rel) {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await rec(join(dir, e.name), r)
      else out.push([r, (await readFile(join(dir, e.name))).toString("base64")])
    }
  }
  await rec(root, "")
  return Object.fromEntries(out.sort((a, b) => a[0].localeCompare(b[0])))
}

/** Ảnh tham chiếu — nội dung KHÁC NHAU từng tấm để phép so từng byte có nghĩa. */
const REFS = {
  "char-lan.png": Buffer.concat([PNG_1x1, Buffer.from("lan")]),
  "inspo-1.png": Buffer.concat([PNG_1x1, Buffer.from("inspo")]),
  "brand-1.png": Buffer.concat([PNG_1x1, Buffer.from("brand")]),
  "shape-1.png": Buffer.concat([PNG_1x1, Buffer.from("shape")]),
  "char-pose-1.png": Buffer.concat([PNG_1x1, Buffer.from("pose")]),
  "sub/sheet-1.png": Buffer.concat([PNG_1x1, Buffer.from("sheet")]),
}

export async function run({ api, agent, wsRoot }) {
  describe("template người dùng")
  const projects = join(wsRoot, "projects")
  const templatesDir = join(wsRoot, ".kitgen", "templates")
  const trashDir = join(wsRoot, ".kitgen", "trash")
  const made = []          // dự án của suite này — dọn ở cuối

  const createBlank = async (name, extra = {}) => {
    const r = await api("POST", "/api/projects", {
      body: { name, template: "blank", firstVariant: { id: "phong-cach-1", vi: "Phong cách 1" }, tags: ["kg-workflow"], ...extra },
    })
    if (r.status === 201) made.push(r.json.project.id)
    return r
  }

  /* ── Đồ thử: một dự án «game» có đủ mọi loại thứ nằm trong thư mục dự án ── */
  let src = ""
  await it("dựng dự án nguồn: bản soạn composer + 6 ảnh + đủ loại kết quả đã vẽ", async () => {
    const r = await createBlank("App game nông trại", { tags: ["kg-workflow", "game"] })
    eq(r.status, 201, "tạo dự án")
    src = r.json.project.id
    eq((await api("PATCH", `/api/projects/${src}`, { body: { description: "Bộ UI game nông trại" } })).status, 200)
    eq((await api("PUT", `/api/projects/${src}/workflow-draft`, { body: { completed: false, draft: composerDoc() } })).status, 200)
    const dir = join(projects, src)
    for (const [rel, data] of Object.entries(REFS)) {
      await mkdir(join(dir, "refs", rel, ".."), { recursive: true })
      await writeFile(join(dir, "refs", rel), data)
    }
    // Kết quả đã vẽ + dẫn xuất — KHÔNG được theo vào template.
    for (const rel of ["raw/phong-cach-1-main.png", "kits/phong-cach-1/01-btn.png", "runs/r-0001/run.json",
      "prompts/main.txt", "logs/cover.log", ".history/raw/x.png"]) {
      await mkdir(join(dir, rel, ".."), { recursive: true })
      await writeFile(join(dir, rel), "KẾT QUẢ CŨ")
    }
    await mkdir(join(dir, "cover"), { recursive: true })
    await writeFile(join(dir, "cover", "cover.png"), Buffer.concat([PNG_1x1, Buffer.from("cover")]))
  })

  /* ── ① LƯU ───────────────────────────────────────────────────────────────── */
  let tpl = null
  await it("lưu làm template → 201; chép bản soạn + refs/ + bìa, KHÔNG chép kết quả đã vẽ", async () => {
    const r = await api("POST", `/api/projects/${src}/save-template`, { body: { name: "Game nông trại", description: "Khung sẵn cho game" } })
    eq(r.status, 201, "status")
    tpl = r.json.template
    ok(/^game-nong-trai-[0-9a-f]{4}$/.test(tpl.id), `id = slug + 4 hex: ${tpl.id}`)
    eq(tpl.name, "Game nông trại", "tên")
    eq(tpl.description, "Khung sẵn cho game", "mô tả")
    eq(tpl.sourceProjectId, src, "nguồn")
    eq(tpl.sourceProjectName, "App game nông trại", "tên nguồn")
    eq(tpl.stats.blocks, 3, "3 thẻ")
    eq(tpl.stats.refs, 6, "6 ảnh")
    ok(tpl.stats.bytes > 0, "có dung lượng")
    eq(tpl.hasCover, true, "có hình thu nhỏ")
    eq(tpl.tags, ["kg-workflow", "game"], "tag của dự án")

    const dir = join(templatesDir, tpl.id)
    eq(await lsDir(dir), ["cover.png", "refs", "template.json", "workflow-draft.json"], "ĐÚNG bốn thứ, không hơn")
    eq(JSON.parse(await readFile(join(dir, "workflow-draft.json"), "utf8")), composerDoc(), "bản soạn nguyên vẹn")
    for (const [rel, data] of Object.entries(REFS))
      ok((await readFile(join(dir, "refs", rel))).equals(data), `refs/${rel} giống từng byte`)
    ok((await readFile(join(dir, "cover.png"))).equals(Buffer.concat([PNG_1x1, Buffer.from("cover")])), "bìa")
    for (const gone of ["raw", "kits", "runs", "prompts", "logs", ".history", "contract.json", "project.json", "cover"])
      ok(!(await pathExists(join(dir, gone))), `KHÔNG có ${gone}`)
    const meta = JSON.parse(await readFile(join(dir, "template.json"), "utf8"))
    eq(meta.schemaVersion, 1, "schemaVersion")
    ok(meta.createdAt && meta.createdAt === meta.updatedAt, "createdAt = updatedAt lúc vừa lưu")
    ok(!(await readdir(templatesDir)).some(n => n.startsWith(".tmp-")), "không còn thư mục tạm")
  })

  await it("từ chối: dự án chưa có bản soạn / bản nháp wizard cũ / bản nháp hỏng ⇒ 422 NO_COMPOSER_DRAFT", async () => {
    const empty = (await createBlank("Chưa gõ gì")).json.project.id
    let r = await api("POST", `/api/projects/${empty}/save-template`, { body: { name: "X" } })
    eq(r.status, 422, "chưa lưu lần nào")
    eq(r.json.error.code, "NO_COMPOSER_DRAFT", "code")
    eq(r.json.error.details.reason, "missing", "reason")

    await api("PUT", `/api/projects/${empty}/workflow-draft`, { body: { completed: false, draft: { step: 3, kitName: "wizard cũ" } } })
    r = await api("POST", `/api/projects/${empty}/save-template`, { body: { name: "X" } })
    eq(r.status, 422, "bản nháp wizard")
    eq(r.json.error.details.reason, "legacy", "reason legacy")

    await writeFile(join(projects, empty, "workflow-draft.json"), "{ hỏng")
    r = await api("POST", `/api/projects/${empty}/save-template`, { body: { name: "X" } })
    eq(r.status, 422, "JSON hỏng")
    eq(r.json.error.details.reason, "broken", "reason broken")
    ok(!(await readdir(templatesDir)).some(n => n.startsWith("x-")), "không template nào được tạo")
  })

  await it("từ chối: tên rỗng / quá 80 ký tự ⇒ 400; dự án vắng ⇒ 404; id dự án lạ ⇒ 400", async () => {
    for (const name of ["", "   ", "a".repeat(81)]) {
      const r = await api("POST", `/api/projects/${src}/save-template`, { body: { name } })
      eq(r.status, 400, `tên ${JSON.stringify(name.slice(0, 5))}`)
      eq(r.json.error.code, "INVALID_NAME", "code")
    }
    eq((await api("POST", "/api/projects/khong-co-du-an-0000/save-template", { body: { name: "X" } })).status, 404, "vắng")
    eq((await api("POST", "/api/projects/UPPER/save-template", { body: { name: "X" } })).status, 400, "id lạ")
  })

  await it("refs/ vượt trần ⇒ TEMPLATE_TOO_LARGE, không để lại thư mục nào", async () => {
    const before = await lsDir(templatesDir)
    let err = null
    try { await saveProjectAsTemplate(agent.registry.active, src, { name: "Quá nặng" }, { maxBytes: 10 }) }
    catch (e) { err = e }
    eq(err?.code, "TEMPLATE_TOO_LARGE", "mã lỗi")
    eq(err?.status, 413, "HTTP 413")
    ok(err.details.bytes > 10 && err.details.maxBytes === 10, "nói rõ bao nhiêu")
    eq(await lsDir(templatesDir), before, "thư mục templates y nguyên")
  })

  /* ── DANH SÁCH ──────────────────────────────────────────────────────────── */
  let second = null
  await it("GET /api/templates — mới lưu trước", async () => {
    await new Promise(r => setTimeout(r, 5))
    const r2 = await api("POST", `/api/projects/${src}/save-template`, { body: { name: "Bản thứ hai" } })
    eq(r2.status, 201)
    second = r2.json.template
    eq(second.description, "", "mô tả trống khi không gửi")
    const r = await api("GET", "/api/templates")
    eq(r.status, 200, "status")
    eq(r.json.items.map(t => t.id), [second.id, tpl.id], "mới nhất trước")
  })

  await it("thư mục hỏng bị BỎ QUA (không 500, không hiện ở đâu); thư mục tạm của lượt chết giữa chừng không bao giờ hiện", async () => {
    const mk = async (name, files) => {
      await mkdir(join(templatesDir, name, "refs"), { recursive: true })
      for (const [f, data] of Object.entries(files)) await writeFile(join(templatesDir, name, f), data)
    }
    const goodMeta = id => JSON.stringify({ schemaVersion: 1, id, name: "Trông như thật", createdAt: "2030-01-01T00:00:00.000Z", stats: {} })
    const draft = JSON.stringify(composerDoc())
    await mk("json-hong-ab12", { "template.json": "{ hỏng", "workflow-draft.json": draft })
    await mk("thieu-ban-soan-ab12", { "template.json": goodMeta("thieu-ban-soan-ab12") })
    await mk("lech-id-ab12", { "template.json": goodMeta("id-khac-ab12"), "workflow-draft.json": draft })
    await mk("sai-phien-ban-ab12", { "template.json": JSON.stringify({ schemaVersion: 99, id: "sai-phien-ban-ab12", name: "x" }), "workflow-draft.json": draft })
    await writeFile(join(templatesDir, "file-le-ab12"), "không phải thư mục")
    // Lượt lưu chết TRƯỚC bước rename: nội dung đầy đủ, mốc "tương lai" để nếu lọt thì đứng đầu.
    const tmpName = ".tmp-chet-giua-chung-ab12-1-1"
    await mk(tmpName, { "template.json": goodMeta("chet-giua-chung-ab12"), "workflow-draft.json": draft })

    const r = await api("GET", "/api/templates")
    eq(r.status, 200, "không 500")
    eq(r.json.items.map(t => t.id), [second.id, tpl.id], "chỉ hai template thật")
    for (const bad of ["json-hong-ab12", "thieu-ban-soan-ab12", "lech-id-ab12", "sai-phien-ban-ab12"]) {
      const c = await api("GET", `/api/templates/${bad}/cover`)
      eq(c.status, 404, `${bad}: 404`)
      eq(c.json.error.code, "TEMPLATE_NOT_FOUND", `${bad}: code`)
      const f = await createBlank(`Từ ${bad}`, { fromTemplate: bad })
      eq(f.status, 404, `${bad}: không tạo dự án từ nó`)
    }
    ok(await pathExists(join(templatesDir, tmpName)), "thư mục tạm MỚI chưa bị dọn (có thể đang ghi)")
    const old = new Date(Date.now() - 2 * 3600e3)
    await utimes(join(templatesDir, tmpName), old, old)
    await api("GET", "/api/templates")
    ok(!(await pathExists(join(templatesDir, tmpName))), "thư mục tạm quá 1 giờ bị dọn")
    for (const bad of ["json-hong-ab12", "thieu-ban-soan-ab12", "lech-id-ab12", "sai-phien-ban-ab12"]) {
      eq((await api("DELETE", `/api/templates/${bad}`)).status, 200, `template hỏng vẫn xoá được: ${bad}`)
    }
    const { rm } = await import("node:fs/promises")
    await rm(join(templatesDir, "file-le-ab12"), { force: true })
  })

  await it("ảnh thu nhỏ: 200 image/png đúng bytes (và ?w=128); template không bìa ⇒ 404", async () => {
    const r = await api("GET", `/api/templates/${tpl.id}/cover`)
    eq(r.status, 200, "status")
    eq(r.headers["content-type"], "image/png", "Content-Type")
    ok(r.headers.etag, "có ETag như mọi ảnh")
    ok(r.body.equals(Buffer.concat([PNG_1x1, Buffer.from("cover")])), "đúng bytes")
    eq((await api("GET", `/api/templates/${tpl.id}/cover?w=128`)).status, 200, "bản thu nhỏ")

    const bare = (await createBlank("Không bìa", { tags: [] })).json.project.id
    await api("PUT", `/api/projects/${bare}/workflow-draft`, { body: { completed: false, draft: composerDoc() } })
    const t = await api("POST", `/api/projects/${bare}/save-template`, { body: { name: "Không bìa" } })
    eq(t.json.template.hasCover, false, "hasCover=false")
    eq(t.json.template.stats.refs, 0, "0 ảnh")
    eq(await lsDir(join(templatesDir, t.json.template.id, "refs")), [], "refs/ rỗng vẫn có")
    const c = await api("GET", `/api/templates/${t.json.template.id}/cover`)
    eq(c.status, 404, "không bìa ⇒ 404")
    eq((await api("DELETE", `/api/templates/${t.json.template.id}`)).status, 200, "dọn")
  })

  /* ── ② TẠO DỰ ÁN TỪ TEMPLATE ──────────────────────────────────────────── */
  await it("POST /api/projects + fromTemplate ⇒ bản soạn = composer của template, refs giống từng byte, bìa trống, tag gộp", async () => {
    const r = await createBlank("Game mới từ mẫu", { fromTemplate: tpl.id })
    eq(r.status, 201, "status")
    const p = r.json.project
    const dir = join(projects, p.id)
    eq(p.tags, ["kg-workflow", "game"], "tag web gửi ∪ tag template, không trùng")
    eq(p.description, "Khung sẵn cho game", "mô tả lấy từ template khi body không gửi")
    eq(p.cover ?? null, null, "project.cover trống")
    ok(!(await pathExists(join(dir, "cover", "cover.png"))), "KHÔNG chép ảnh bìa")
    eq(p.stats.sheets, 0, "bản thiết kế trống như mọi dự án mới")

    const d = await api("GET", `/api/projects/${p.id}/workflow-draft`)
    eq(d.status, 200)
    eq(d.json.draft.docVersion, 1, "docVersion 1 ⇒ màn soạn không hỏi «thay bản nháp cũ»")
    eq(d.json.draft.composer, composerDoc().composer, "composer y hệt template")
    ok(d.json.draft.updatedAt !== composerDoc().updatedAt, "mốc «đã lưu» là mốc MỚI, không phải ngày chụp template")
    ok(d.json.updatedAt, "project.json có workflow.updatedAt (qua saveWorkflowDraft)")
    eq(d.json.completed, false, "completed=false như mọi bản soạn composer")

    for (const [rel, data] of Object.entries(REFS))
      ok((await readFile(join(dir, "refs", rel))).equals(data), `refs/${rel} giống từng byte`)
    eq(await lsDir(join(dir, "raw")), [], "raw/ trống")
    eq(await lsDir(join(dir, "kits")), [], "kits/ trống")
    ok(!(await pathExists(join(dir, "template.json"))), "không lẫn file của template vào dự án")

    const refs = await api("GET", `/api/projects/${p.id}/refs`)
    eq(refs.json.items.map(i => i.name).sort(), ["brand-1.png", "char-lan.png", "char-pose-1.png", "inspo-1.png", "shape-1.png"], "ảnh phẳng liệt kê được qua API")

    const withDesc = await createBlank("Có mô tả riêng", { fromTemplate: tpl.id, description: "Của tôi" })
    eq(withDesc.json.project.description, "Của tôi", "body có mô tả thì body thắng")
  })

  await it("fromTemplate không tồn tại ⇒ 404 TEMPLATE_NOT_FOUND và KHÔNG có dự án nào được tạo", async () => {
    const before = await lsDir(projects)
    const r = await createBlank("Từ hư không", { fromTemplate: "khong-co-mau-0000" })
    eq(r.status, 404, "status")
    eq(r.json.error.code, "TEMPLATE_NOT_FOUND", "code")
    eq(await lsDir(projects), before, "projects/ y nguyên")
  })

  await it("chép hỏng giữa chừng (bản soạn trong template hỏng) ⇒ dự án dở dang bị dọn sạch", async () => {
    const broken = await api("POST", `/api/projects/${src}/save-template`, { body: { name: "Sẽ hỏng" } })
    const id = broken.json.template.id
    await writeFile(join(templatesDir, id, "workflow-draft.json"), "{ hỏng giữa chừng")
    const before = await lsDir(projects)
    const r = await createBlank("Dở dang", { fromTemplate: id })
    eq(r.status, 404, `template hỏng ⇒ 404, nhận ${r.status}`)
    eq(r.json.error.code, "TEMPLATE_NOT_FOUND", "code")
    eq(await lsDir(projects), before, "không còn thư mục dự án nào sót lại")
    eq((await api("DELETE", `/api/templates/${id}`)).status, 200, "dọn")
  })

  /* ── ③ ID LẠ ──────────────────────────────────────────────────────────── */
  await it("id template leo thư mục / sai khuôn ⇒ 400 BAD_REQUEST ở MỌI cửa, không chạm đĩa", async () => {
    /* `%2e%2e` trần bị URL chuẩn hoá thành thư mục cha TRƯỚC khi tới router (thành
       một route khác) — thứ phải chặn là `..` còn sống tới handler. */
    for (const bad of ["..%2F..%2Fprojects", "a%2F..%2F..%2Fsecret", ".hidden-ab12", "UPPER-ab12", "ab", "..%5Cx"]) {
      for (const [m, path, body] of [
        ["GET", `/api/templates/${bad}/cover`],
        ["PATCH", `/api/templates/${bad}`, { name: "x" }],
        ["DELETE", `/api/templates/${bad}`],
      ]) {
        const r = await api(m, path, body ? { body } : {})
        eq(r.status, 400, `${m} ${bad}`)
        eq(r.json.error.code, "BAD_REQUEST", `${m} ${bad} code`)
      }
    }
    for (const bad of ["../x", "a/b", ".tmp-x", "UPPER", "x"]) {
      const r = await createBlank("Id lạ", { fromTemplate: bad })
      eq(r.status, 400, `fromTemplate ${bad}`)
    }
  })

  /* ── ĐỔI TÊN + XOÁ ────────────────────────────────────────────────────── */
  await it("PATCH đổi tên/mô tả → giữ createdAt, đổi updatedAt; tên rỗng 400; vắng 404", async () => {
    const r = await api("PATCH", `/api/templates/${second.id}`, { body: { name: "  Đổi tên rồi  ", description: "mới" } })
    eq(r.status, 200, "status")
    eq(r.json.template.name, "Đổi tên rồi", "tên đã trim")
    eq(r.json.template.description, "mới", "mô tả")
    eq(r.json.template.createdAt, second.createdAt, "createdAt không đổi")
    ok(r.json.template.updatedAt >= second.updatedAt, "updatedAt tiến lên")
    eq((await api("PATCH", `/api/templates/${second.id}`, { body: { name: "" } })).status, 400, "tên rỗng")
    eq((await api("PATCH", "/api/templates/khong-co-mau-0000", { body: { name: "x" } })).status, 404, "vắng")
  })

  await it("DELETE → vào .kitgen/trash/template-…; biến khỏi danh sách; KHÔNG hiện ở thùng rác dự án", async () => {
    const r = await api("DELETE", `/api/templates/${second.id}`)
    eq(r.status, 200, "status")
    eq(r.json, { ok: true }, "thân")
    ok(!(await pathExists(join(templatesDir, second.id))), "rời thư mục templates")
    const inTrash = (await readdir(trashDir)).filter(n => n.startsWith("template-") && n.endsWith(second.id))
    eq(inTrash.length, 1, "nằm trong thùng rác")
    ok(/^template-\d{8}-\d{6}-/.test(inTrash[0]), `có mốc thời gian: ${inTrash[0]}`)
    ok((await stat(join(trashDir, inTrash[0], "workflow-draft.json"))).isFile(), "nội dung còn nguyên để cứu tay")
    const list = await api("GET", "/api/templates")
    ok(!list.json.items.some(t => t.id === second.id), "không còn trong danh sách")
    const trash = await api("GET", "/api/trash")
    ok(!trash.json.items.some(i => String(i.trashId).startsWith("template-")), "thùng rác DỰ ÁN không thấy template")
    /* id template và id dự án cùng khuôn slug-4hex: dự án (chưa từng có) mang đúng id
       ấy phải là 404 — không phải 410 «đang trong thùng rác». */
    eq((await api("GET", `/api/projects/${second.id}`)).status, 404, "không nhầm thành dự án đã xoá")
    eq((await api("DELETE", `/api/templates/${second.id}`)).status, 404, "xoá lần hai ⇒ 404")
  })

  await it("client đời cũ: POST /api/projects không có fromTemplate (hoặc rỗng) vẫn y như trước", async () => {
    const r = await createBlank("Dự án trống thường", { fromTemplate: "" })
    eq(r.status, 201, "status")
    eq(r.json.project.tags, ["kg-workflow"], "không gộp tag nào")
    const d = await api("GET", `/api/projects/${r.json.project.id}/workflow-draft`)
    eq(d.json.draft, null, "không bản nháp")
    eq(await lsDir(join(projects, r.json.project.id, "refs")), [], "refs/ trống")
  })

  /* ── ④ SỬA NỘI DUNG TEMPLATE ─────────────────────────────────────────────
     Một template riêng cho cả khối (không đụng `tpl`, thứ mà ca cuối cùng xoá). Mọi dự
     án làm việc đều bị dọn TRONG khối — không cái nào lọt vào `made`. */
  const ws = agent.registry.active
  const NEW_INSPO = Buffer.concat([PNG_1x1, Buffer.from("inspo-moi")])
  const NEW_SHAPE = Buffer.concat([PNG_1x1, Buffer.from("shape-moi")])
  const upload = (pid, kind, data) => {
    const mp = multipart([
      { name: "file", filename: "anh.png", contentType: "image/png", data },
      { name: "kind", data: kind },
    ])
    return api("POST", `/api/projects/${pid}/refs`, { headers: { "content-type": mp.contentType }, body: mp.body })
  }
  /** Mọi dự án trên đĩa đang NHẬN template `tplId` (đọc thẳng project.json, không qua API). */
  const claimsOf = async tplId => {
    const out = []
    for (const name of await lsDir(projects)) {
      try {
        const p = JSON.parse(await readFile(join(projects, name, "project.json"), "utf8"))
        if (p.templateEdit?.templateId === tplId) out.push(name)
      } catch { /* không phải dự án */ }
    }
    return out.sort()
  }
  const editingOf = async tplId => (await api("GET", "/api/templates")).json.items.find(t => t.id === tplId)?.editing
  const noLeftovers = async () =>
    ok(!(await readdir(templatesDir)).some(n => n.startsWith(".tmp-") || n.startsWith(".commit-")), "không còn .tmp-/.commit- nào")

  let edTpl = null
  let wid = ""
  await it("sửa template: dựng template để sửa (từ dự án nguồn) — editing: null", async () => {
    const r = await api("POST", `/api/projects/${src}/save-template`, { body: { name: "Mẫu để sửa", description: "Mô tả gốc" } })
    eq(r.status, 201, "status")
    edTpl = r.json.template
    eq(edTpl.editing, null, "template vừa lưu chưa có phiên sửa")
    eq(edTpl.stats.refs, 6, "6 ảnh")
  })

  await it("POST /api/templates/:id/edit ⇒ 200 {project, template, resumed:false}; dự án làm việc mang templateEdit, bản soạn + refs y hệt template", async () => {
    const countBefore = await ws.countProjects()
    const r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(r.status, 200, `status: ${r.text.slice(0, 300)}`)
    eq(r.json.resumed, false, "phiên mới")
    const p = r.json.project
    wid = p.id
    ok(/^mau-de-sua-[0-9a-f]{4}$/.test(wid), `id theo tên template: ${wid}`)
    eq(p.name, "Mẫu để sửa", "tên = tên template")
    eq(p.description, "Mô tả gốc", "mô tả = mô tả template")
    eq(p.tags, edTpl.tags, "tag = tag template")
    eq(p.templateEdit.templateId, edTpl.id, "templateEdit.templateId")
    eq(p.templateEdit.templateName, "Mẫu để sửa", "templateEdit.templateName")
    eq(p.templateEdit.templateUpdatedAt, edTpl.updatedAt, "templateEdit.templateUpdatedAt = updatedAt lúc mở")
    ok(Number.isFinite(Date.parse(p.templateEdit.startedAt)), "templateEdit.startedAt")
    ok(p.stats && p.state, "có stats + state như GET /api/projects/:id")
    eq(p.state.activeRun, null, "activeRun")
    const g = await api("GET", `/api/projects/${wid}`)
    eq(g.status, 200, "GET theo id chạy")
    eq(Object.keys(p).sort(), Object.keys(g.json.project).sort(), "CÙNG bộ khoá với GET /api/projects/:id")
    eq(g.json.project.templateEdit, p.templateEdit, "GET theo id cũng mang templateEdit")

    eq(r.json.template.id, edTpl.id, "template")
    eq(r.json.template.editing, { projectId: wid, startedAt: p.templateEdit.startedAt }, "template.editing")

    const d = await api("GET", `/api/projects/${wid}/workflow-draft`)
    eq(d.json.draft.composer, composerDoc().composer, "bản soạn = template")
    for (const [rel, data] of Object.entries(REFS))
      ok((await readFile(join(projects, wid, "refs", rel))).equals(data), `refs/${rel} giống từng byte`)
    ok(!(await pathExists(join(projects, wid, "cover", "cover.png"))), "không chép bìa")
    eq(await ws.countProjects(), countBefore, "số dự án (/health, /api/workspaces) không đổi")
  })

  await it("mở lại ⇒ resumed:true, ĐÚNG dự án cũ, không tạo cái thứ hai; GET /api/templates mang editing", async () => {
    const r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(r.status, 200, "status")
    eq(r.json.resumed, true, "resumed")
    eq(r.json.project.id, wid, "cùng dự án")
    eq(await claimsOf(edTpl.id), [wid], "đúng MỘT dự án làm việc trên đĩa")
    const list = await api("GET", "/api/templates")
    eq(list.json.items.find(t => t.id === edTpl.id).editing?.projectId, wid, "editing trong danh sách")
    ok(list.json.items.filter(t => t.id !== edTpl.id).every(t => t.editing === null), "template khác: editing null")
  })

  await it("dự án làm việc VÔ HÌNH: không ở GET /api/projects (mọi biến thể), không ở /api/trash", async () => {
    for (const q of ["", "?include=none", `?q=${encodeURIComponent("Mẫu để sửa")}`, "?tag=kg-workflow"]) {
      const r = await api("GET", `/api/projects${q}`)
      eq(r.status, 200, `status ${q}`)
      ok(!r.json.items.some(p => p.id === wid), `không có trong /api/projects${q}`)
    }
    ok(!(await api("GET", "/api/trash")).json.items.some(i => i.projectId === wid), "không ở thùng rác")
  })

  await it("route THEO ID vẫn chạy cho dự án làm việc: PUT workflow-draft, POST/DELETE refs, GET files", async () => {
    const d = await api("GET", `/api/projects/${wid}/workflow-draft`)
    const put = await api("PUT", `/api/projects/${wid}/workflow-draft`,
      { body: { completed: false, draft: editedDoc(), baseUpdatedAt: d.json.updatedAt } })
    eq(put.status, 200, `PUT bản soạn: ${put.text.slice(0, 200)}`)
    const u1 = await upload(wid, "inspo", NEW_INSPO)
    eq(u1.status, 201, "tải ảnh 1")
    eq(u1.json.name, "inspo-2.png", "agent đặt tên kế tiếp")
    const u2 = await upload(wid, "shape", NEW_SHAPE)
    eq(u2.status, 201, "tải ảnh 2")
    eq(u2.json.name, "shape-2.png", "tên ảnh 2")
    eq((await api("DELETE", `/api/projects/${wid}/refs/char-lan.png`)).status, 204, "xoá ảnh")
    const f = await api("GET", `/api/projects/${wid}/files/refs/inspo-2.png`)
    eq(f.status, 200, "đọc file")
    ok(f.body.equals(NEW_INSPO), "đúng bytes")
    const names = (await api("GET", `/api/projects/${wid}/refs`)).json.items.map(i => i.name)
    ok(names.includes("inspo-2.png") && names.includes("shape-2.png") && !names.includes("char-lan.png"), `refs: ${names}`)
    ok(!(await pathExists(join(templatesDir, edTpl.id, "refs", "inspo-2.png"))), "template CHƯA bị chạm trước khi lưu")
    ok(await pathExists(join(templatesDir, edTpl.id, "refs", "char-lan.png")), "ảnh bị xoá ở tờ nháp vẫn còn trong template")
  })

  await it("Vẽ / vẽ bìa / lưu thành template MỚI trong dự án làm việc ⇒ 409 TEMPLATE_EDIT_NO_RUN", async () => {
    for (const [path, body, action] of [
      [`/api/projects/${wid}/runs`, { kind: "gen" }, "run"],
      [`/api/projects/${wid}/runs`, { kind: "slice" }, "run"],
      [`/api/projects/${wid}/cover`, {}, "cover"],
      [`/api/projects/${wid}/save-template`, { name: "Tách ra" }, "save-template"],
    ]) {
      const r = await api("POST", path, { body })
      eq(r.status, 409, `${action} ${JSON.stringify(body)}`)
      eq(r.json.error.code, "TEMPLATE_EDIT_NO_RUN", `${action} code`)
      eq(r.json.error.details, { action, templateId: edTpl.id }, `${action} details`)
    }
    eq(await lsDir(join(projects, wid, "runs")), [], "không lượt chạy nào được tạo")
  })

  await it("đổi tên / mô tả template GIỮA phiên ⇒ phiên vẫn sống, mở lại vẫn đúng dự án", async () => {
    const r = await api("PATCH", `/api/templates/${edTpl.id}`, { body: { name: "Mẫu đã đổi tên", description: "Mô tả mới" } })
    eq(r.status, 200, "status")
    eq(r.json.template.editing?.projectId, wid, "PATCH trả editing")
    const again = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(again.json.resumed, true, "resumed")
    eq(again.json.project.id, wid, "cùng dự án")
  })

  await it("lưu HỎNG ⇒ template y nguyên TỪNG BYTE, phiên còn nguyên: bản soạn hỏng 422 / bản nháp wizard 422 / refs quá trần 413", async () => {
    const tdir = join(templatesDir, edTpl.id)
    const before = await snapshotDir(tdir)
    const trashBefore = await lsDir(trashDir)
    const draftFile = join(projects, wid, "workflow-draft.json")
    const good = await readFile(draftFile)

    await writeFile(draftFile, "{ hỏng")
    let r = await api("POST", `/api/templates/${edTpl.id}/edit/commit`)
    eq(r.status, 422, "JSON hỏng")
    eq(r.json.error.code, "NO_COMPOSER_DRAFT", "code")
    eq(r.json.error.details.reason, "broken", "reason")

    await writeFile(draftFile, JSON.stringify({ step: 2, kitName: "wizard cũ" }))
    r = await api("POST", `/api/templates/${edTpl.id}/edit/commit`)
    eq(r.status, 422, "bản nháp wizard")
    eq(r.json.error.details.reason, "legacy", "reason legacy")

    await writeFile(draftFile, good)
    let err = null
    try { await commitTemplateEdit(ws, edTpl.id, { maxBytes: 10 }) } catch (e) { err = e }
    eq(err?.code, "TEMPLATE_TOO_LARGE", "quá trần")
    eq(err?.status, 413, "HTTP 413")

    eq(await snapshotDir(tdir), before, "template y nguyên từng byte")
    eq(await lsDir(trashDir), trashBefore, "không bản nào vào thùng rác")
    await noLeftovers()
    eq(await claimsOf(edTpl.id), [wid], "phiên còn nguyên")
  })

  await it("LƯU ⇒ 200: bản soạn + refs thay TỪNG BYTE; giữ tên (đã đổi)/mô tả/tag/bìa/createdAt/nguồn; updatedAt tiến; stats tính lại; dự án làm việc biến mất; bản cũ vào thùng rác", async () => {
    const tdir = join(templatesDir, edTpl.id)
    const beforeMeta = JSON.parse(await readFile(join(tdir, "template.json"), "utf8"))
    const oldCover = await readFile(join(tdir, "cover.png"))
    const etagBefore = (await api("GET", `/api/templates/${edTpl.id}/cover`)).headers.etag
    const wantDraft = JSON.parse(await readFile(join(projects, wid, "workflow-draft.json"), "utf8"))
    const wantRefs = await snapshotDir(join(projects, wid, "refs"))
    const trashBefore = (await lsDir(trashDir)).filter(n => n.startsWith("template-") && n.includes(edTpl.id))

    const r = await api("POST", `/api/templates/${edTpl.id}/edit/commit`)
    eq(r.status, 200, `status: ${r.text.slice(0, 300)}`)
    const t = r.json.template
    eq(t.id, edTpl.id, "id")
    eq(t.name, "Mẫu đã đổi tên", "tên ĐÃ ĐỔI giữa phiên không bị mất")
    eq(t.description, "Mô tả mới", "mô tả đã đổi")
    eq(t.tags, edTpl.tags, "tag")
    eq(t.createdAt, edTpl.createdAt, "createdAt không đổi")
    eq(t.sourceProjectId, src, "nguồn")
    eq(t.sourceProjectName, "App game nông trại", "tên nguồn")
    ok(Date.parse(t.updatedAt) > Date.parse(beforeMeta.updatedAt), `updatedAt tiến: ${beforeMeta.updatedAt} → ${t.updatedAt}`)
    eq(t.hasCover, true, "vẫn có bìa")
    eq(t.editing, null, "hết phiên")
    eq(t.stats.blocks, 2, "stats.blocks tính lại")
    eq(t.stats.refs, 7, "stats.refs tính lại (6 − 1 + 2)")
    const files = await snapshotDir(tdir)
    const sum = Object.entries(files).filter(([rel]) => rel !== "template.json")
      .reduce((n, [, b64]) => n + Buffer.from(b64, "base64").length, 0)
    eq(t.stats.bytes, sum, "stats.bytes = refs + bản soạn + bìa")

    eq(await lsDir(tdir), ["cover.png", "refs", "template.json", "workflow-draft.json"], "ĐÚNG bốn thứ")
    eq(JSON.parse(await readFile(join(tdir, "workflow-draft.json"), "utf8")), wantDraft, "bản soạn = bản của tờ nháp")
    eq(await snapshotDir(join(tdir, "refs")), wantRefs, "refs giống từng byte với tờ nháp")
    ok(!(await pathExists(join(tdir, "refs", "char-lan.png"))), "ảnh đã xoá ở tờ nháp rời template")
    ok((await readFile(join(tdir, "cover.png"))).equals(oldCover), "bìa giữ nguyên bytes")
    eq((await api("GET", `/api/templates/${edTpl.id}/cover`)).headers.etag, etagBefore, "ETag bìa không đổi (giữ mốc sửa)")

    ok(!(await pathExists(join(projects, wid))), "dự án làm việc biến mất khỏi đĩa")
    eq((await api("GET", `/api/projects/${wid}`)).status, 404, "404 theo id")
    eq(await claimsOf(edTpl.id), [], "không còn dự án nào nhận template")
    ok(!(await lsDir(trashDir)).some(n => n.endsWith(wid)), "dự án làm việc KHÔNG vào thùng rác")

    const trashNow = (await lsDir(trashDir)).filter(n => n.startsWith("template-") && n.includes(edTpl.id))
    eq(trashNow.length, trashBefore.length + 1, "bản cũ vào thùng rác")
    const old = join(trashDir, trashNow.find(n => !trashBefore.includes(n)))
    ok(/template-\d{8}-\d{6}-/.test(old), "cùng khuôn tên với xoá template (tự dọn sau 30 ngày)")
    eq(JSON.parse(await readFile(join(old, "workflow-draft.json"), "utf8")), composerDoc(), "bản soạn CŨ còn để cứu tay")
    ok((await readFile(join(old, "refs", "char-lan.png"))).equals(REFS["char-lan.png"]), "ảnh CŨ còn để cứu tay")
    ok(!(await api("GET", "/api/trash")).json.items.some(i => String(i.trashId).startsWith("template-")), "thùng rác DỰ ÁN không thấy")
    await noLeftovers()

    const item = (await api("GET", "/api/templates")).json.items.find(x => x.id === edTpl.id)
    eq(item.name, "Mẫu đã đổi tên", "danh sách: tên")
    eq(item.editing, null, "danh sách: hết phiên")
    eq(item.stats, t.stats, "danh sách: stats mới")
  })

  await it("dự án MỚI mở từ template vừa lưu nhận bản soạn + refs MỚI, và là dự án thường", async () => {
    const r = await createBlank("Từ mẫu đã sửa", { fromTemplate: edTpl.id })
    eq(r.status, 201, "status")
    const pid = r.json.project.id
    eq(r.json.project.templateEdit, undefined, "không mang dấu phiên sửa")
    ok((await api("GET", "/api/projects")).json.items.some(p => p.id === pid), "hiện ở danh sách")
    const d = await api("GET", `/api/projects/${pid}/workflow-draft`)
    eq(d.json.draft.composer, editedDoc().composer, "bản soạn MỚI")
    ok((await readFile(join(projects, pid, "refs", "inspo-2.png"))).equals(NEW_INSPO), "ảnh MỚI")
    ok(!(await pathExists(join(projects, pid, "refs", "char-lan.png"))), "không còn ảnh đã xoá")
  })

  await it("lưu khi KHÔNG có phiên ⇒ 404 TEMPLATE_EDIT_NOT_FOUND; mở phiên template vắng ⇒ 404 TEMPLATE_NOT_FOUND; id lạ ⇒ 400 ở cả ba cửa", async () => {
    let r = await api("POST", `/api/templates/${edTpl.id}/edit/commit`)
    eq(r.status, 404, "đã lưu rồi")
    eq(r.json.error.code, "TEMPLATE_EDIT_NOT_FOUND", "code")
    r = await api("POST", "/api/templates/khong-co-mau-0000/edit/commit")
    eq(r.status, 404, "template vắng")
    eq(r.json.error.code, "TEMPLATE_EDIT_NOT_FOUND", "code (template vắng)")
    r = await api("POST", "/api/templates/khong-co-mau-0000/edit")
    eq(r.status, 404, "mở phiên template vắng")
    eq(r.json.error.code, "TEMPLATE_NOT_FOUND", "code")
    const before = await lsDir(projects)
    for (const bad of ["..%2F..%2Fprojects", "a%2F..%2F..%2Fsecret", ".hidden-ab12", "UPPER-ab12", "ab"]) {
      for (const [m, path] of [
        ["POST", `/api/templates/${bad}/edit`],
        ["POST", `/api/templates/${bad}/edit/commit`],
        ["DELETE", `/api/templates/${bad}/edit`],
      ]) {
        const x = await api(m, path)
        eq(x.status, 400, `${m} ${path}`)
        eq(x.json.error.code, "BAD_REQUEST", `${m} ${path} code`)
      }
    }
    eq(await lsDir(projects), before, "không dự án nào được tạo")
  })

  await it("HUỶ ⇒ xoá hẳn dự án làm việc (không thùng rác), template không bị chạm; gọi lại / template lạ vẫn {ok:true}", async () => {
    const tdir = join(templatesDir, edTpl.id)
    const before = await snapshotDir(tdir)
    const trashBefore = await lsDir(trashDir)
    const r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(r.json.resumed, false, "phiên cũ đã lưu ⇒ phiên MỚI")
    const w2 = r.json.project.id
    ok(w2 !== wid, "dự án làm việc mới")
    eq(r.json.project.templateEdit.templateName, "Mẫu đã đổi tên", "tên template HIỆN TẠI")
    eq((await api("GET", `/api/projects/${w2}/workflow-draft`)).json.draft.composer, editedDoc().composer, "tờ nháp mới = nội dung đã lưu")
    const d0 = await api("GET", `/api/projects/${w2}/workflow-draft`)
    eq((await api("PUT", `/api/projects/${w2}/workflow-draft`, { body: { completed: false, draft: composerDoc(), baseUpdatedAt: d0.json.updatedAt } })).status, 200)
    eq((await upload(w2, "inspo", NEW_SHAPE)).status, 201, "tải ảnh vào tờ nháp")

    const d = await api("DELETE", `/api/templates/${edTpl.id}/edit`)
    eq(d.status, 200, "status")
    eq(d.json, { ok: true }, "thân")
    ok(!(await pathExists(join(projects, w2))), "dự án làm việc biến mất")
    eq(await lsDir(trashDir), trashBefore, "KHÔNG gì vào thùng rác")
    eq(await lsDir(join(wsRoot, ".kitgen", "cache", "template-edit-discard")), [], "chỗ xoá tạm không còn rác")
    eq(await snapshotDir(tdir), before, "template không bị chạm")
    eq((await api("DELETE", `/api/templates/${edTpl.id}/edit`)).json, { ok: true }, "gọi lại ⇒ vẫn ok")
    const unknown = await api("DELETE", "/api/templates/khong-co-mau-0000/edit")
    eq([unknown.status, unknown.json], [200, { ok: true }], "template lạ ⇒ vẫn ok")
    eq(await editingOf(edTpl.id), null, "hết phiên")
  })

  await it("DELETE /api/projects/:id trên dự án làm việc ⇒ huỷ phiên: xoá hẳn, trashId null, không vào thùng rác", async () => {
    const w3 = (await api("POST", `/api/templates/${edTpl.id}/edit`)).json.project.id
    const trashBefore = await lsDir(trashDir)
    const d = await api("DELETE", `/api/projects/${w3}`)
    eq(d.status, 200, "status")
    eq([d.json.ok, d.json.trashId, d.json.discarded], [true, null, true], "thân")
    ok(!(await pathExists(join(projects, w3))), "biến mất")
    eq(await lsDir(trashDir), trashBefore, "không vào thùng rác")
    eq((await api("GET", `/api/projects/${w3}`)).status, 404, "404 — không phải 410 «trong thùng rác»")
    eq(await editingOf(edTpl.id), null, "hết phiên")
  })

  await it("XOÁ template đang có phiên sửa ⇒ dự án làm việc cũng biến mất (không vào thùng rác)", async () => {
    const t = await api("POST", `/api/projects/${src}/save-template`, { body: { name: "Mẫu sẽ xoá" } })
    const id = t.json.template.id
    const w = (await api("POST", `/api/templates/${id}/edit`)).json.project.id
    ok(await pathExists(join(projects, w)), "có dự án làm việc")
    eq((await api("DELETE", `/api/templates/${id}`)).status, 200, "xoá template")
    ok(!(await pathExists(join(projects, w))), "dự án làm việc đi theo")
    eq(await claimsOf(id), [], "không còn gì nhận template đã xoá")
    ok(!(await lsDir(trashDir)).some(n => n.endsWith(w)), "dự án làm việc không vào thùng rác")
    ok((await lsDir(trashDir)).some(n => n.startsWith("template-") && n.includes(id)), "template thì vào thùng rác như cũ")
  })

  let liveId = ""
  await it("phiên hỏng không làm sập gì: thư mục bị xoá TAY ⇒ hết phiên; hai dự án cùng nhận ⇒ chọn cái MỚI NHẤT, cái kia bị dọn khi mở phiên", async () => {
    let r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    const w1 = r.json.project.id
    await rm(join(projects, w1), { recursive: true, force: true })
    eq(await editingOf(edTpl.id), null, "xoá tay ⇒ không còn phiên")
    r = await api("POST", `/api/templates/${edTpl.id}/edit/commit`)
    eq(r.status, 404, "lưu ⇒ 404")
    eq(r.json.error.code, "TEMPLATE_EDIT_NOT_FOUND", "code")
    r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(r.json.resumed, false, "mở lại ⇒ phiên mới")
    const w2 = r.json.project.id
    ok(w2 !== w1, "id mới")

    /* Chép tay (hoặc agent chết giữa hai lượt mở) ⇒ HAI dự án nhận cùng template. */
    const dup = "ban-sao-tay-ab12"
    await cp(join(projects, w2), join(projects, dup), { recursive: true })
    const pj = JSON.parse(await readFile(join(projects, dup, "project.json"), "utf8"))
    pj.id = dup
    pj.templateEdit.startedAt = new Date(Date.parse(pj.templateEdit.startedAt) + 60_000).toISOString()
    await writeFile(join(projects, dup, "project.json"), JSON.stringify(pj))
    eq(await editingOf(edTpl.id), { projectId: dup, startedAt: pj.templateEdit.startedAt }, "editing = cái MỚI NHẤT")
    const items = (await api("GET", "/api/projects")).json.items
    ok(!items.some(p => p.id === dup || p.id === w2), "cả hai đều vô hình")
    r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq([r.json.resumed, r.json.project.id], [true, dup], "mở lại ⇒ cái mới nhất")
    ok(!(await pathExists(join(projects, w2))), "cái cũ hơn bị dọn")
    eq(await claimsOf(edTpl.id), [dup], "còn đúng một")
    liveId = dup
  })

  await it("quét lúc khởi động: dọn dự án làm việc MỒ CÔI / ĐỜI CŨ / DỞ DANG; phiên sống còn nguyên", async () => {
    const mkClaim = async (id, templateEdit, { draft = true } = {}) => {
      await mkdir(join(projects, id, "refs"), { recursive: true })
      await writeFile(join(projects, id, "project.json"),
        JSON.stringify({ schemaVersion: 1, id, name: "Giả", slug: id, tags: [], templateEdit }))
      if (draft) await writeFile(join(projects, id, "workflow-draft.json"), JSON.stringify(composerDoc()))
    }
    const now = new Date(Date.now() + 3600e3).toISOString()        // "mới hơn" phiên sống — vẫn không được chọn
    await mkClaim("mo-coi-ab12", { templateId: "khong-con-mau-ab12", startedAt: now, templateRevision: 0 })
    await mkClaim("doi-cu-ab12", { templateId: edTpl.id, startedAt: now, templateRevision: 0 })   // template đã lưu 1 lần ⇒ đời 1
    await mkClaim("do-dang-ab12", { templateId: edTpl.id, startedAt: now, templateRevision: 1 }, { draft: false })
    eq((await editingOf(edTpl.id))?.projectId, liveId, "đời cũ / dở dang không bao giờ là phiên sống")
    const items = (await api("GET", "/api/projects")).json.items
    ok(!items.some(p => ["mo-coi-ab12", "doi-cu-ab12", "do-dang-ab12"].includes(p.id)), "vô hình")

    const swept = await sweepTemplateEdits(ws)
    eq(swept.sort(), ["do-dang-ab12", "doi-cu-ab12", "mo-coi-ab12"], "dọn đúng ba")
    for (const id of swept) ok(!(await pathExists(join(projects, id))), `${id} biến mất`)
    ok(await pathExists(join(projects, liveId)), "phiên sống còn nguyên")
    eq((await api("DELETE", `/api/templates/${edTpl.id}/edit`)).json, { ok: true }, "dọn phiên")
    eq(await claimsOf(edTpl.id), [], "sạch")
  })

  await it("agent chết GIỮA hai lần rename của lượt lưu ⇒ lượt đọc kế tiếp đẩy nốt bản mới vào chỗ; chết TRƯỚC khi chạm bản cũ ⇒ bản dựng bị bỏ", async () => {
    const tdir = join(templatesDir, edTpl.id)
    const staged = join(templatesDir, `.commit-${edTpl.id}`)
    const crashTrash = []
    const stage = async name => {
      await cp(tdir, staged, { recursive: true })
      const m = JSON.parse(await readFile(join(staged, "template.json"), "utf8"))
      await writeFile(join(staged, "template.json"), JSON.stringify({ ...m, name }))
    }
    const moveOldAway = async () => {
      const dst = join(trashDir, `template-20260930-000000-${edTpl.id}-crash${crashTrash.length}`)
      await rename(tdir, dst)
      crashTrash.push(dst)
    }

    // (a) ③ xong, ④ chưa: bản cũ đã sang thùng rác, bản mới TRỌN VẸN nằm đợi ⇒ liệt kê đẩy vào
    await stage("Bản mới đang đợi")
    await moveOldAway()
    let item = (await api("GET", "/api/templates")).json.items.find(t => t.id === edTpl.id)
    eq(item?.name, "Bản mới đang đợi", "danh sách: template KHÔNG biến mất, là bản mới")
    ok(!(await pathExists(staged)), ".commit- đã vào chỗ")

    // (b) ② xong, ③ chưa: bản cũ còn nguyên ⇒ bản dựng là đồ bỏ
    await stage("Đồ bỏ")
    item = (await api("GET", "/api/templates")).json.items.find(t => t.id === edTpl.id)
    eq(item?.name, "Bản mới đang đợi", "bản đang ở chỗ thắng")
    ok(!(await pathExists(staged)), "đồ bỏ bị dọn")

    // (c) cửa ĐỌC ĐƠN (ảnh bìa, đổi tên, mở phiên) cũng tự hồi phục, không 404
    await stage("Hồi phục qua ảnh bìa")
    await moveOldAway()
    eq((await api("GET", `/api/templates/${edTpl.id}/cover`)).status, 200, "ảnh bìa 200")
    ok(await pathExists(tdir), "đã vào chỗ")
    await stage("Hồi phục lúc khởi động")
    await moveOldAway()
    await sweepTemplateEdits(ws)
    eq(JSON.parse(await readFile(join(tdir, "template.json"), "utf8")).name, "Hồi phục lúc khởi động", "khởi động cũng đẩy vào")
    await noLeftovers()
    for (const d of crashTrash) await rm(d, { recursive: true, force: true })
  })

  /* Khoảnh khắc template VẮNG MẶT (giữa hai lần rename) chỉ dài vài mili-giây — phép thử
     đua ngẫu nhiên ở ca sau KHÔNG trúng nó (đã thử: gỡ cổng đọc/đổi chỗ đi, ca đó vẫn
     xanh). Ca này GIỮ khoảnh khắc ấy mở 250 ms qua `betweenRenames` rồi bắn đủ loại lượt
     đọc vào giữa: có cổng thì chúng đứng đợi và thấy bản mới; không có thì 404 / thiếu. */
  await it("hai khoảnh khắc nguy hiểm của lượt lưu, GIỮ MỞ 250 ms: đổi tên chen sau khi đã đọc meta KHÔNG bị đè mất; template VẮNG MẶT giữa hai lần rename ⇒ mọi lượt đọc đứng đợi rồi thấy bản MỚI, không ai thấy 404", async () => {
    const tdir = join(templatesDir, edTpl.id)
    const r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(r.json.resumed, false, "phiên mới")
    const w = r.json.project.id
    const d = await api("GET", `/api/projects/${w}/workflow-draft`)
    const docW = { ...editedDoc(), composer: { ...editedDoc().composer, themeValue: "BẢN TRONG KHE" } }
    eq((await api("PUT", `/api/projects/${w}/workflow-draft`, { body: { completed: false, draft: docW, baseUpdatedAt: d.json.updatedAt } })).status, 200)

    let absentDuringWindow = null
    let reads = null
    let renamed = null
    const t = await commitTemplateEdit(ws, edTpl.id, {
      /* Meta của bản mới ĐÃ dựng xong từ tên cũ. Đổi tên lọt vào đây mà không xếp hàng
         sau lượt lưu là bị bản mới đè mất ngay ở bước đổi chỗ. */
      beforeSwap: async () => {
        renamed = api("PATCH", `/api/templates/${edTpl.id}`, { body: { name: "Tên đổi trước khi đổi chỗ" } })
        await new Promise(res => setTimeout(res, 250))
      },
      betweenRenames: async () => {
        absentDuringWindow = !(await pathExists(tdir))
        reads = Promise.all([
          api("GET", "/api/templates"),
          api("GET", `/api/templates/${edTpl.id}/cover`),
          createBlank("Tạo trong khe", { fromTemplate: edTpl.id }),
          api("PATCH", `/api/templates/${edTpl.id}`, { body: { description: "Đổi trong khe" } }),
        ])
        await new Promise(res => setTimeout(res, 250))   // đủ cho một lượt đọc KHÔNG bị chặn chạy xong
      },
    })
    eq(absentDuringWindow, true, "đúng là template đang vắng mặt lúc bắn lượt đọc")
    eq(t.editing, null, "lưu xong")
    const [list, cover, created, patched] = await reads
    ok(list.json.items.some(x => x.id === edTpl.id), "danh sách thấy template")
    eq(cover.status, 200, "ảnh bìa 200")
    eq(created.status, 201, `tạo dự án từ template: ${created.text.slice(0, 200)}`)
    const theme = (await api("GET", `/api/projects/${created.json.project.id}/workflow-draft`)).json.draft.composer.themeValue
    eq(theme, "BẢN TRONG KHE", "dự án tạo trong khe nhận bản MỚI")
    const rn = await renamed
    eq(rn.status, 200, "đổi tên chen giữa lượt lưu")
    eq(JSON.parse(await readFile(join(tdir, "template.json"), "utf8")).name, "Tên đổi trước khi đổi chỗ", "tên đổi giữa chừng KHÔNG bị bản mới đè mất")
    eq(patched.status, 200, "đổi mô tả trong khe: đợi lượt lưu xong rồi ghi")
    eq(patched.json.template.description, "Đổi trong khe", "không bị bản mới đè mất")
    eq(JSON.parse(await readFile(join(tdir, "template.json"), "utf8")).description, "Đổi trong khe", "trên đĩa cũng thế")
    await noLeftovers()
  })

  await it("lưu CHEN giữa các lượt đọc: danh sách / ảnh bìa / tạo dự án từ template luôn thấy TRỌN bản cũ hoặc TRỌN bản mới", async () => {
    const r = await api("POST", `/api/templates/${edTpl.id}/edit`)
    eq(r.json.resumed, false, "phiên mới")
    const w = r.json.project.id
    const docB = { ...editedDoc(), composer: { ...editedDoc().composer, themeValue: "BẢN B" } }
    const d = await api("GET", `/api/projects/${w}/workflow-draft`)
    eq((await api("PUT", `/api/projects/${w}/workflow-draft`, { body: { completed: false, draft: docB, baseUpdatedAt: d.json.updatedAt } })).status, 200)
    const B_INSPO = Buffer.concat([PNG_1x1, Buffer.from("B")])
    await writeFile(join(projects, w, "refs", "inspo-2.png"), B_INSPO)

    const jobs = [api("POST", `/api/templates/${edTpl.id}/edit/commit`).then(x => ({ kind: "commit", x }))]
    for (let i = 0; i < 10; i++) {
      jobs.push(api("GET", "/api/templates").then(x => ({ kind: "list", x })))
      jobs.push(api("GET", `/api/templates/${edTpl.id}/cover`).then(x => ({ kind: "cover", x })))
      if (i < 4) jobs.push(createBlank(`Chen ${i}`, { fromTemplate: edTpl.id }).then(x => ({ kind: "create", x })))
    }
    const out = await Promise.all(jobs)
    eq(out[0].x.status, 200, `lưu: ${out[0].x.text.slice(0, 200)}`)
    let sawA = 0, sawB = 0
    for (const { kind, x } of out.slice(1)) {
      if (kind === "list") ok(x.json.items.some(t => t.id === edTpl.id), "template LUÔN có trong danh sách")
      if (kind === "cover") eq(x.status, 200, "ảnh bìa LUÔN 200")
      if (kind === "create") {
        eq(x.status, 201, `tạo dự án: ${x.text.slice(0, 200)}`)
        const pid = x.json.project.id
        const theme = (await api("GET", `/api/projects/${pid}/workflow-draft`)).json.draft.composer.themeValue
        const isB = theme === "BẢN B"
        const refB = (await readFile(join(projects, pid, "refs", "inspo-2.png"))).equals(B_INSPO)
        eq(refB, isB, `cặp bản soạn/refs khớp nhau (chủ đề «${theme}»)`)
        if (isB) sawB++; else sawA++
      }
    }
    ok(sawA + sawB === 4, `4 dự án (cũ ${sawA}, mới ${sawB})`)
    ok(!(await pathExists(join(projects, w))), "dự án làm việc đã dọn")
    await noLeftovers()
    /* Dọn template của khối — ngay sau một loạt đọc chen: không fd nào còn giữ thư mục
       của nó (Windows mới là nơi phán ca này). */
    const del = await api("DELETE", `/api/templates/${edTpl.id}`)
    eq(del.status, 200, `xoá template: ${del.text.slice(0, 200)}`)
  })

  /* ── XOÁ TEMPLATE ĐÃ ĐƯỢC DÙNG (runner Windows 30/09/2026, bản 3.0.15) ─────────
     Template này đã được xem bìa (GET cover) và đã dùng để mở dự án. `sendFile` bản cũ để
     fd của cover.png mở mãi khi client đóng kết nối trước lúc ReadStream đọc tới EOF (bộ
     ca này đúng như thế) ⇒ Windows không cho đổi tên thư mục ⇒ DELETE trả 423 sau cả cửa
     sổ thử lại 4,5 s. Trên macOS/Linux ca này xanh cả với bản cũ; chỉ runner Windows phán. */
  await it("xoá template VỪA xem bìa + vừa mở dự án ⇒ 200 (Windows: không file nào còn bị giữ)", async () => {
    for (const id of made) eq((await api("DELETE", `/api/projects/${id}`)).status, 200, `dọn dự án ${id}`)
    const r = await api("DELETE", `/api/templates/${tpl.id}`)
    eq(r.status, 200, `xoá template: ${r.text.slice(0, 300)}`)
    ok(!(await pathExists(join(templatesDir, tpl.id))), "rời thư mục templates")
  })
}
