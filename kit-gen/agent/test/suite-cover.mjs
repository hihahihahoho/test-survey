/* suite-cover.mjs — ẢNH BÌA (#43/#44) + móc tự động sau lượt gen.
 *
 * Bốn điều bộ ca này khoá lại, đều là chốt đã hứa với chủ sản phẩm:
 *  ① ảnh bìa ĐỌC ĐƯỢC qua đúng đường đọc file đã có (#41), có thumbnail;
 *  ② prompt NEO VÀO BRANDING GỐC (màu thương hiệu + mascot) và KHÔNG chứa style
 *    đang chỉnh bên trong — đây là điểm dễ bị "sửa cho tiện" nhất về sau;
 *  ③ prompt nêu ĐÚNG TOẠ ĐỘ vùng tiêu đề và CẤM vẽ chữ;
 *  ④ ảnh bìa hỏng KHÔNG kéo lượt gen xuống thất bại, và không cướp ảnh bìa user tự chọn.
 */
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import {
  describe, it, eq, ok, includes, waitFor, pathExists,
  makeClient, fakeDoctor, CLIENT, PAGES, PORT,
} from "./harness.mjs"
import { createAgent } from "../server.mjs"
import {
  TITLE_ZONE, COVER_REL, buildCoverPrompt, titleZonePixels, collectBranding,
} from "../lib/cover.mjs"

/** Contract nhỏ có đủ chất liệu nhận diện: màu thương hiệu, mascot, tấm dáng, style "bẫy". */
const BRANDED = {
  schemaVersion: 4,
  characterPoses: ["idle"],
  variants: [{
    id: "chinh",
    vi: "Bản gốc",
    style: "STYLE_DANG_THU_NGHIEM neon cyberpunk hologram",
    bg: "pure vivid magenta #FF00FF",
    brand: { mode: "colors", primary: "#0F62FE", secondary: "#F6C453", refs: [] },
    characters: [{ id: "nhan-vat", vi: "Sóc Vàng", ref: null, poses: ["idle"] }],
    inspo: ["refs/inspo-1.png"],
  }],
  sheets: [{
    id: "pose-nhan-vat",
    grid: { cols: 1, rows: 1 },
    orient: "portrait",
    variants: ["chinh"],
    components: [{
      file: "01-pose-idle", vi: "Sóc Vàng: idle",
      spec: "a cheerful golden squirrel mascot standing straight, round soft body, big friendly eyes, holding a coin",
      skel: { shape: "rrect", w: 0.7, h: 0.9 },
    }],
  }],
}

export async function run({ api, wsRoot, agentDir }) {
  describe("ảnh bìa")

  /* ── 1. Prompt: chất liệu, toạ độ, cấm chữ (thuần hàm, không cần ổ đĩa) ── */

  await it("prompt neo vào BRANDING GỐC — có màu thương hiệu + mascot, KHÔNG có style đang chỉnh", async () => {
    const { prompt, branding } = await buildCoverPrompt({
      project: { name: "Tết 2026" }, contract: BRANDED, hasFile: async () => false,
    })
    includes(prompt, "#0F62FE", "màu thương hiệu chính")
    includes(prompt, "#F6C453", "màu thương hiệu phụ")
    includes(prompt, "Sóc Vàng", "tên mascot")
    includes(prompt, "golden squirrel", "mô tả mascot lấy từ tấm dáng")
    ok(!prompt.includes("STYLE_DANG_THU_NGHIEM"),
      "prompt KHÔNG được kéo theo style đang chỉnh bên trong — ảnh bìa phải là nhận diện gốc")
    ok(!prompt.includes("inspo-1.png"), "KHÔNG đính ảnh inspo của style")
    eq(branding.variantId, "chinh", "lấy variant ĐẦU TIÊN làm bản gốc")
  })

  await it("prompt nêu ĐÚNG TOẠ ĐỘ vùng tiêu đề, dặn chừa trống và CẤM vẽ chữ", async () => {
    const { prompt } = await buildCoverPrompt({
      project: { name: "X" }, contract: BRANDED, hasFile: async () => false,
    })
    const z = titleZonePixels()
    eq([z.x0, z.x1, z.y0, z.y1], [92, 952, 339, 685], "toạ độ vùng tiêu đề trên canvas 1536x1024")
    eq([z.cutTop, z.cutBottom], [80, 80], "dải bị cắt khi về 16:9")
    includes(prompt, `x=${z.x0} to x=${z.x1}`, "toạ độ ngang trong prompt")
    includes(prompt, `y=${z.y0} to y=${z.y1}`, "toạ độ dọc trong prompt")
    includes(prompt, "TITLE PLATE", "gọi tên vùng chừa")
    // Đúng lối viết safe-zone v15: NÓI HẬU QUẢ, không ra lệnh suông (handoff §5.3)
    includes(prompt, "software composites the project's REAL title text", "giải thích hậu quả")
    includes(prompt, "will be thrown away and regenerated", "hậu quả nếu vùng chừa bị lấp")
    includes(prompt, "ABSOLUTELY NO TEXT", "cấm vẽ chữ")
    includes(prompt, "CROP CONSEQUENCE", "báo trước việc cắt về 16:9")
    // Cover KHÔNG dùng hợp đồng spritesheet: không grid, không chroma-key, không tách nền
    includes(prompt, "no chroma-key colour", "nói rõ không dùng nền chroma-key")
    ok(!/STRICT grid/.test(prompt), "KHÔNG kéo theo luật lưới của sprite sheet")
    includes(prompt, "FULL-BLEED", "nền tràn viền")
  })

  await it("mascot: ưu tiên ảnh thật, và tấm dáng ĐÃ SINH được dùng khi chưa có ảnh ref", async () => {
    const only = new Set(["raw/chinh-pose-nhan-vat.png"])
    const b = await collectBranding(BRANDED, async p => only.has(p))
    eq(b.attachments, ["raw/chinh-pose-nhan-vat.png"], "vớt tấm dáng đã sinh của bản gốc")

    const withRef = structuredClone(BRANDED)
    withRef.variants[0].characters[0].ref = "refs/mascot.png"
    const all = new Set(["refs/mascot.png", "raw/chinh-pose-nhan-vat.png"])
    const b2 = await collectBranding(withRef, async p => all.has(p))
    eq(b2.attachments[0], "refs/mascot.png", "ảnh nhân vật người dùng tải lên đứng trước")

    const escape = await collectBranding(
      { variants: [{ id: "v", characters: [{ ref: "../../etc/passwd" }] }], sheets: [] },
      async () => true)
    eq(escape.attachments, [], "đường dẫn thoát ra ngoài bị loại thẳng")
  })

  await it("hai file toạ độ (agent ↔ webapp) KHÔNG được lệch nhau", async () => {
    // Chữ do webapp ghép vào; agent dặn model chừa chỗ. Lệch số = chữ đè lên mascot mà
    // không ca test nào đỏ. Nên đọc THẲNG file của webapp và so bằng số.
    const src = await readFile(join(agentDir, "..", "webapp", "src", "features", "home", "lib", "cover-title.ts"), "utf8")
    const m = /TITLE_ZONE\s*=\s*\{\s*x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*w:\s*([\d.]+),\s*h:\s*([\d.]+)/.exec(src)
    ok(m, "đọc được TITLE_ZONE của webapp")
    eq([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])],
      [TITLE_ZONE.x, TITLE_ZONE.y, TITLE_ZONE.w, TITLE_ZONE.h], "toạ độ hai bên phải bằng nhau")
    includes(src, `"${COVER_REL}"`, "webapp dùng đúng đường dẫn ảnh bìa của agent")
  })

  /* ── 2. Endpoint + móc tự động, chạy bằng engine giả (KHÔNG tốn quota) ── */

  const FIXTURES = join(agentDir, "test-fixtures")
  async function agentWithEngine(engineName, imageGen = true) {
    const a = await createAgent({
      workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
      rateLimit: 5000, doctor: fakeDoctor(imageGen),
    })
    a.state.port = PORT
    a.registry.active.engineDir = join(FIXTURES, engineName)
    const c = makeClient(a.server)
    return (m, p, o = {}) => c(m, p, { ...o, headers: { ...CLIENT, ...(o.headers ?? {}) } })
  }

  await it("chưa vẽ lần nào → GET cover = none (không phải lỗi)", async () => {
    const created = await api("POST", "/api/projects", {
      body: { name: "Bia chua ve", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id
    const r = await api("GET", `/api/projects/${id}/cover`)
    eq(r.status, 200, "status")
    eq(r.json.cover.status, "none", "chưa có bìa")
    eq(r.json.cover.path, null, "chưa có đường dẫn")
    eq(r.json.cover.titleZone, TITLE_ZONE, "trả toạ độ vùng tiêu đề cho web")
    await api("DELETE", `/api/projects/${id}`)
  })

  await it("POST cover → 202, vẽ xong thì đọc được qua #41 và project.cover tự trỏ vào nó", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await a("POST", "/api/projects", {
      body: { name: "Bia tu ve", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id

    const start = await a("POST", `/api/projects/${id}/cover`)
    eq(start.status, 202, "202 — đã nhận, chạy nền")
    eq(start.json.cover.status, "running", "đang vẽ")

    await waitFor(async () => (await a("GET", `/api/projects/${id}/cover`)).json.cover.status === "ok", 15000, "vẽ xong")
    const done = await a("GET", `/api/projects/${id}/cover`)
    eq(done.json.cover.path, COVER_REL, "đường dẫn ảnh bìa")
    ok(done.json.cover.updatedAt, "có mốc thời gian")

    ok(await pathExists(join(wsRoot, "projects", id, COVER_REL)), "ảnh nằm trong project")
    const prompt = await readFile(join(wsRoot, "projects", id, "prompts", "cover.txt"), "utf8")
    includes(prompt, "TITLE PLATE", "prompt đã dùng được lưu lại để soi")

    // Ảnh đi ra web bằng ĐÚNG đường đọc file đã có, kể cả bản thu nhỏ của lưới
    const img = await a("GET", `/api/projects/${id}/files/${COVER_REL}`)
    eq(img.status, 200, "#41 đọc được ảnh bìa")
    const thumb = await a("GET", `/api/projects/${id}/files/${COVER_REL}?w=256`)
    eq(thumb.status, 200, "#41 ?w=256 cho lưới thẻ")

    const p = await a("GET", `/api/projects/${id}`)
    eq(p.json.project.cover, COVER_REL, "project.cover trỏ vào ảnh bìa tự sinh")

    // Nhật ký thô KHÔNG được lộ ra web (log codex chứa đường dẫn tuyệt đối của máy)
    const log = await a("GET", `/api/projects/${id}/files/logs/cover.log`)
    eq(log.status, 400, "logs/ vẫn nằm ngoài whitelist đọc")
    eq(log.json.error.code, "PATH_ESCAPE", "code")

    await a("DELETE", `/api/projects/${id}`)
  })

  await it("lượt gen đầu tiên tự kéo theo ảnh bìa — và ảnh bìa hỏng KHÔNG làm hỏng lượt gen", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await a("POST", "/api/projects", {
      body: { name: "Gen roi co bia", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id
    const run = await a("POST", `/api/projects/${id}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
    eq(run.status, 202, "run 202")
    await a("GET", `/api/runs/${run.json.runId}/stream?from=0`)     // giữ tới run.finished

    const got = await a("GET", `/api/runs/${run.json.runId}`)
    eq(got.json.status, "done-with-errors", "trạng thái lượt gen do CHÍNH nó quyết định")
    ok(!("cover" in got.json), "ảnh bìa KHÔNG chen vào bản ghi lượt chạy")

    await waitFor(async () => (await a("GET", `/api/projects/${id}/cover`)).json.cover.status === "ok",
      15000, "ảnh bìa tự vẽ sau lượt gen")
    await a("DELETE", `/api/projects/${id}`)
  })

  await it("KHÔNG vẽ đè lên ảnh bìa user tự chọn, và KHÔNG vẽ lại khi đã có bìa", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await a("POST", "/api/projects", {
      body: { name: "Bia cua nguoi dung", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id
    const picked = await a("PATCH", `/api/projects/${id}`, { body: { cover: "kits/tet/01-btn.png" } })
    eq(picked.json.project.cover, "kits/tet/01-btn.png", "user đã tự chọn ảnh bìa")

    const run = await a("POST", `/api/projects/${id}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
    await a("GET", `/api/runs/${run.json.runId}/stream?from=0`)
    await new Promise(r => setTimeout(r, 400))

    const p = await a("GET", `/api/projects/${id}`)
    eq(p.json.project.cover, "kits/tet/01-btn.png", "lựa chọn của người dùng KHÔNG bị job nền cướp")
    eq(await pathExists(join(wsRoot, "projects", id, COVER_REL)), false, "cũng không vẽ ngầm một ảnh thừa")
    await a("DELETE", `/api/projects/${id}`)
  })

  await it("engine chưa có cover.sh → 409 COVER_UNAVAILABLE (không phải 500, không job ma)", async () => {
    // engine-slow cố ý KHÔNG có cover.sh: đúng cảnh máy đang chạy bản engine cũ.
    const b = await agentWithEngine("engine-slow")
    const created = await b("POST", "/api/projects", {
      body: { name: "Engine cu khong co bia", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id
    const r = await b("POST", `/api/projects/${id}/cover`)
    eq(r.status, 409, "thiếu cover.sh → 409 chứ không phải 500")
    eq(r.json.error.code, "COVER_UNAVAILABLE", "code")
    const st = await b("GET", `/api/projects/${id}/cover`)
    eq(st.json.cover.status, "none", "không để lại job treo")
    await b("DELETE", `/api/projects/${id}`)
  })

  await it("vẽ bìa thất bại (engine không ghi ảnh) → failed, KHÔNG đặt project.cover", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await a("POST", "/api/projects", {
      body: { name: "Bia loi", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id
    // Fixture bỏ qua khi prompt chứa dấu hiệu này. Agent ghi đè prompt mỗi lần chạy, nên
    // dấu hiệu được nhét vào TÊN dự án — thứ chắc chắn đi vào prompt qua mô tả mascot.
    await writeFile(join(wsRoot, "projects", id, "contract.json"), JSON.stringify({
      ...BRANDED,
      sheets: [{
        ...BRANDED.sheets[0], variants: ["tet"],
        components: [{ ...BRANDED.sheets[0].components[0], spec: "COVER_FIXTURE_FAIL " + BRANDED.sheets[0].components[0].spec }],
      }],
      variants: [{ ...BRANDED.variants[0], id: "tet" }],
    }))
    const start = await a("POST", `/api/projects/${id}/cover`)
    eq(start.status, 202, "nhận việc")
    await waitFor(async () => (await a("GET", `/api/projects/${id}/cover`)).json.cover.status === "failed",
      15000, "job bìa kết thúc bằng failed")
    const st = await a("GET", `/api/projects/${id}/cover`)
    eq(st.json.cover.path, null, "không có ảnh")
    eq(st.json.cover.error, "NO_ARTIFACT", "chẩn đoán")
    const p = await a("GET", `/api/projects/${id}`)
    eq(p.json.project.cover, null, "KHÔNG trỏ project.cover vào một ảnh không tồn tại")
    await a("DELETE", `/api/projects/${id}`)
  })

  await it("chưa tạo được ảnh (chưa đăng nhập codex) → 409 IMAGEGEN_UNAVAILABLE, chặn TRƯỚC khi chạy", async () => {
    const a = await agentWithEngine("engine-fake", false)
    const created = await a("POST", "/api/projects", {
      body: { name: "Chua dang nhap", template: "basic", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } },
    })
    const id = created.json.project.id
    const r = await a("POST", `/api/projects/${id}/cover`)
    eq(r.status, 409, "status")
    eq(r.json.error.code, "IMAGEGEN_UNAVAILABLE", "code")
    ok(r.json.error.details.reason, "nêu lý do")
    eq(await pathExists(join(wsRoot, "projects", id, "prompts", "cover.txt")), false, "chưa dựng prompt vì đã chặn từ đầu")
    await a("DELETE", `/api/projects/${id}`)
  })
}
