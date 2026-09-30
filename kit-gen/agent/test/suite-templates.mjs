/* suite-templates.mjs — TEMPLATE CỦA NGƯỜI DÙNG (lib/project-templates.mjs + routes/templates.mjs).
 *
 * Chủ sản phẩm: «sẽ có nút save template (bao gồm cả save ảnh, setting...), khi tạo mới
 * 1 project -> sẽ có thể chọn template sẵn». Ba lời hứa mà hỏng thì HỎNG CÂM:
 *   ① Template mang ĐỦ phần dựng (mọi thẻ + cài đặt + mọi ảnh đã đính) và KHÔNG mang
 *      kết quả đã vẽ (raw/kits/runs/contract…). Thiếu một ảnh là một pill trỏ vào hư
 *      không ở dự án mới — chỉ lộ ra lúc bấm Vẽ.
 *   ② Dự án mở từ template có ĐÚNG bản soạn đó và ảnh GIỐNG TỪNG BYTE, bìa trống.
 *   ③ Không gì dở dang: template ghi nguyên tử, dự án tạo hỏng thì bị dọn, id lạ là 400.
 */
import { mkdir, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, eq, it, ok, pathExists, lsDir, PNG_1x1 } from "./harness.mjs"
import { saveProjectAsTemplate } from "../lib/project-templates.mjs"

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

  // Dọn: dự án của suite này vào thùng rác, template còn lại vào thùng rác.
  for (const id of made) await api("DELETE", `/api/projects/${id}`)
  await api("DELETE", `/api/templates/${tpl.id}`)
}
