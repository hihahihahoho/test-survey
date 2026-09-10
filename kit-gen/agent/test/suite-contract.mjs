/* suite-contract.mjs — §6.2 C: version + If-Match (412 thiếu / 409 lệch), validate V-01..V-08,
   element-lib chỉ-đọc.
   + #29 prompt-preview: xem nguyên văn prompt TRƯỚC khi tiêu quota (Prompt Studio).

   Lịch sử/khôi phục snapshot và validate dry-run KHÔNG còn route (dọn prompt-first):
   luật validate vẫn được canh, nhưng gọi thẳng `validateContract` thay vì qua HTTP. */
import { join } from "node:path"
import { CLIENT, PAGES, PORT, createBasicProject, describe, eq, fakeDoctor, includes, it, lsDir, makeClient, ok, waitFor } from "./harness.mjs"
import { createAgent } from "../server.mjs"
import { parseRefsManifest } from "../lib/prompt-refs.mjs"
import { contractToStylesV1 } from "../lib/engine.mjs"
import { validateContract } from "../lib/validate.mjs"

export async function run({ api, pid, wsRoot, agentDir }) {
  // ─────────────────────────────────────────── 6. CONTRACT version / If-Match
  describe("bản thiết kế (contract)")
  let version = 0
  await it("GET contract trả version + ETag", async () => {
    const r = await api("GET", `/api/projects/${pid}/contract`)
    eq(r.status, 200, "status")
    version = r.json.version
    eq(r.headers.etag, `"${version}"`, "ETag = version")
    eq(r.json.contract.schemaVersion, 4, "schema v4")
  })
  await it("PUT thiếu If-Match → 412 IF_MATCH_REQUIRED (không phải fallback)", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const r = await api("PUT", `/api/projects/${pid}/contract`, { body: { contract: g.json.contract } })
    eq(r.status, 412, "status")
    eq(r.json.error.code, "IF_MATCH_REQUIRED", "code")
  })
  await it("PUT đúng If-Match → 200, version +1, có snapshot", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = g.json.contract
    c.variants[0].style = "vibrant Vietnamese Tet, red & gold"
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 200, "status")
    eq(r.json.version, g.json.version + 1, "version tăng 1")
    ok(r.json.snapshot, "có snapshot")
    version = r.json.version
  })
  await it("PUT với version LỆCH → 409 CONTRACT_CONFLICT + serverVersion + diffSummary", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version - 1) }, body: { contract: g.json.contract },
    })
    eq(r.status, 409, "status")
    eq(r.json.error.code, "CONTRACT_CONFLICT", "code")
    eq(r.json.error.details.serverVersion, g.json.version, "serverVersion")
    ok(r.json.error.details.diffSummary, "có diffSummary")
    eq(r.json.error.hint, "reload-or-fork", "hint")
  })
  await it("PUT contract sai lưới (V-04) → 422 CONTRACT_INVALID, KHÔNG ghi đè", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].components.pop()                       // 15 ô cho lưới 4×4
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 422, "status")
    eq(r.json.error.code, "CONTRACT_INVALID", "code")
    ok(r.json.error.details.errors.some(e => e.code === "V-04"), "có lỗi V-04")
    const after = await api("GET", `/api/projects/${pid}/contract`)
    eq(after.json.contract.sheets[0].components.length, 16, "bản trên đĩa KHÔNG bị ghi đè")
    eq(after.json.version, g.json.version, "version không đổi")
  })
  await it("PUT sheet id trùng (V-03) và element trùng file (V-02) đều bị 422", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[1].id = c.sheets[0].id
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 422, "status")
    ok(r.json.error.details.errors.some(e => e.code === "V-03"), "có V-03")
  })
  await it("GET /api/element-lib là catalogue chỉ-đọc 42 element", async () => {
    const r = await api("GET", "/api/element-lib")
    eq(r.status, 200, "status")
    ok(r.json.elements.length >= 40, `có ${r.json.elements.length} element`)
    const w = await api("PUT", "/api/element-lib", { body: { elements: [] } })
    ok(w.status === 404 || w.status === 405, `không có đường ghi (status ${w.status})`)
  })

  /* ══ 6b. XEM TRƯỚC PROMPT (#29) ═══════════════════════════════════════════════
     Prompt do gen.sh lắp, nên bộ ca này lái ĐÚNG đường thật: agent copy engine vào
     project rồi spawn gen.sh với KITGEN_PROMPTS_ONLY=1. Engine ở đây là fixture
     `engine-fake` — nó dừng ở ĐÚNG chỗ bản thật dừng (sau khi ghi prompts/*.txt +
     *.att, trước vòng gọi codex), nên "không có ảnh nào trong raw/" ở dưới là bằng
     chứng thật chứ không phải suy diễn. Câu chữ của bản thật được canh ở tầng bash
     (test/gen-prompts-only.test.sh). */
  describe("xem trước prompt")
  const FIXTURES = join(agentDir, "test-fixtures")
  async function agentWithEngine(engineName) {
    const a = await createAgent({
      workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
      rateLimit: 5000, doctor: fakeDoctor(true),
    })
    a.state.port = PORT
    a.registry.active.engineDir = join(FIXTURES, engineName)
    const c = makeClient(a.server)
    return (m, p, o = {}) => c(m, p, { ...o, headers: { ...CLIENT, ...(o.headers ?? {}) } })
  }

  await it("POST prompt-preview trả prompt CÓ NỘI DUNG cho từng job, kèm ảnh đính kèm", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await createBasicProject(a, { name: "Xem truoc prompt", firstVariant: { id: "tet", vi: "Tết đỏ", bg: "magenta" } })
    const gid = created.json.project.id
    try {
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: {} })
      eq(r.status, 200, "status")
      ok(Array.isArray(r.json.jobs) && r.json.jobs.length >= 1, `có ${r.json.jobs?.length} job`)
      eq(r.json.missing, [], "không tấm nào dựng hụt")
      for (const j of r.json.jobs) {
        ok(j.job && j.variant && j.sheet, `job có đủ danh từ: ${JSON.stringify(j)}`)
        includes(j.prompt, `fake prompt for ${j.job}`, `prompt của ${j.job}`)
        // Không phải tên file, không phải chuỗi rỗng — đây là thứ người dùng sẽ đọc.
        ok(j.prompt.length > 20, `prompt của ${j.job} phải là VĂN BẢN, dài ${j.prompt.length}`)
        ok(Array.isArray(j.attachments) && j.attachments.length >= 1, "có danh sách ảnh kèm")
      }
      // KHÔNG gọi codex ⇒ không một ảnh nào được sinh ra, dù chỉ là ảnh giả.
      eq(await lsDir(join(wsRoot, "projects", gid, "raw")), [], "raw/ vẫn rỗng")
    } finally { await a("DELETE", `/api/projects/${gid}`) }
  })

  /* ══ ẢNH ĐI KÈM MỘT TẤM, VÀ VAI CỦA TỪNG TẤM ══════════════════════════════
     `attachments` là một cột đường dẫn trần: bày được tấm ảnh ra nhưng không nói
     được tấm nào là ảnh nhân vật, tấm nào là logo. Vai nằm ở bản kê `.refs` do
     ENGINE ghi ra — ca này khoá đúng mối nối ấy, kể cả nhánh engine đời cũ không
     có bản kê. */
  await it("prompt-preview trả `images` kèm vai lấy từ bản kê của engine", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await createBasicProject(a, { name: "Anh di kem", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    try {
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: {} })
      eq(r.status, 200, "status")
      for (const j of r.json.jobs) {
        ok(Array.isArray(j.images) && j.images.length >= 2, `tấm ${j.job} phải kê đủ ảnh`)
        eq(j.images[0].role, "character", "vai của ảnh đầu")
        eq(j.images[1].role, "brand", "vai của ảnh phong cách/thương hiệu")
        for (const i of j.images)
          ok(!i.path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(i.path),
            `ảnh phải là nhãn tương đối, thấy ${i.path}`)
        /* Danh sách ảnh và danh sách đính kèm kể CÙNG một câu chuyện: từ 10/09/2026
           mọi ảnh tham chiếu đều được đính thẳng vào lời gọi image_gen, không còn
           tấm nào đi vòng. Lệch nhau ở đây là màn xem trước nói dối. */
        eq(j.images.map(i => i.path), j.attachments, `ảnh kèm khớp bản kê ở ${j.job}`)
        ok(!j.prompt.includes("{{DESC:"), `prompt ${j.job} không được có dấu chỗ nào`)
      }
    } finally { await a("DELETE", `/api/projects/${gid}`) }
  })

  await it("engine đời cũ không có bản kê `.refs` ⇒ `images` rơi về `.att`, vai để TRỐNG", async () => {
    /* `engine-alpha` ghi `.att` mà không ghi `.refs` — đúng hình dạng đĩa của một
       máy có webapp mới mà engine chưa cập nhật (hai gói cập nhật riêng nhịp).
       Cửa xem trước phải bày đúng những tấm ảnh sẽ đính, KHÔNG đổ và KHÔNG bịa vai. */
    const a = await agentWithEngine("engine-alpha")
    const created = await createBasicProject(a, { name: "Engine cu", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    try {
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: {} })
      eq(r.status, 200, "status")
      ok(r.json.jobs.length >= 1, "vẫn có tấm để xem")
      for (const j of r.json.jobs) {
        eq(j.images.map(i => i.path), j.attachments, "bày đúng danh sách đính kèm")
        for (const i of j.images) eq(i.role, "", "không bịa vai nào")
      }
    } finally { await a("DELETE", `/api/projects/${gid}`) }
  })

  await it("bộ đọc bản kê: bỏ dòng rác, bỏ đường dẫn tuyệt đối, đọc được cả bản 3 cột đời cũ", async () => {
    const rows = parseRefsManifest([
      "character\trefs/lan.png",
      "brand\trefs/logo.png",
      "vai-la\trefs/gi-do.png",
      "character\t/etc/passwd",
      "character\tC:\\Windows\\hosts",
      "khong-co-tab",
      "",
      "attached\tpose\trefs/dang.png",
    ].join("\n"))
    eq(rows.map(r => r.path), ["refs/lan.png", "refs/logo.png", "refs/gi-do.png", "refs/dang.png"],
      "chỉ giữ đường dẫn tương đối")
    eq(rows.map(r => r.role), ["character", "brand", "", "pose"],
      "vai lạ về rỗng; bản 3 cột đời cũ vẫn đọc được vai ở cột giữa")
  })

  await it("prompt và ảnh kèm KHÔNG lộ đường dẫn tuyệt đối", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await createBasicProject(a, { name: "Khong lo path", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    try {
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: {} })
      eq(r.status, 200, "status")
      for (const j of r.json.jobs) {
        // engine-fake CỐ Ý nhét path tuyệt đối của project vào prompt (xem fixture):
        // nếu cửa ra quên redact thì ca này đỏ, chứ không phải chờ tới lúc có người dùng thật.
        ok(!j.prompt.includes(wsRoot), `prompt ${j.job} còn nguyên path workspace`)
        ok(!/(^|[\s"'(=])\/(Users|home|tmp|private|var)\//.test(j.prompt),
          `prompt ${j.job} còn path tuyệt đối: ${j.prompt.slice(0, 160)}`)
        for (const p of j.attachments) {
          ok(!p.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(p), `ảnh kèm phải là nhãn tương đối, thấy ${p}`)
          ok(!p.includes(wsRoot), `ảnh kèm lộ path workspace: ${p}`)
        }
      }
    } finally { await a("DELETE", `/api/projects/${gid}`) }
  })

  await it("body {contract} = xem trước bản ĐANG SỬA, KHÔNG ghi đè contract.json", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await createBasicProject(a, { name: "Ban dang sua", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    try {
      const g = await a("GET", `/api/projects/${gid}/contract`)
      const c = structuredClone(g.json.contract)
      c.sheets = c.sheets.slice(0, 1)                        // bản nháp: bớt tấm
      c.sheets[0].directive = "thêm chút tuyết rơi"
      c.sheets[0].promptOverride = ""
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: { contract: c } })
      eq(r.status, 200, "status")
      eq(r.json.jobs.length, 1, "chỉ dựng prompt cho tấm trong bản nháp")
      const after = await a("GET", `/api/projects/${gid}/contract`)
      eq(after.json.version, g.json.version, "version KHÔNG đổi — xem trước không phải là lưu")
      eq(after.json.contract.sheets.length, g.json.contract.sheets.length, "contract trên đĩa còn nguyên")
    } finally { await a("DELETE", `/api/projects/${gid}`) }
  })

  await it("contract sai lưới → 422 CONTRACT_INVALID, không spawn engine", async () => {
    const a = await agentWithEngine("engine-fake")
    const created = await createBasicProject(a, { name: "Contract sai luoi", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    try {
      const g = await a("GET", `/api/projects/${gid}/contract`)
      const c = structuredClone(g.json.contract)
      c.sheets[0].grid.cols = c.sheets[0].grid.cols + 1      // lệch số ô ⇒ assert của gen.sh sẽ chết
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: { contract: c } })
      eq(r.status, 422, "status")
      eq(r.json.error.code, "CONTRACT_INVALID", "code")
    } finally { await a("DELETE", `/api/projects/${gid}`) }
  })

  await it("đang có lượt chạy → 409 RUN_ACTIVE (hai tiến trình không giẫm chân nhau trên prompts/)", async () => {
    const a = await agentWithEngine("engine-slow")
    const created = await createBasicProject(a, { name: "Dang chay thi khong xem truoc", firstVariant: { id: "tet", vi: "Tết", bg: "magenta" } })
    const gid = created.json.project.id
    const run = await a("POST", `/api/projects/${gid}/runs`, { body: { kind: "gen", autoSliceAfterGen: false } })
    eq(run.status, 202, "run bắt đầu")
    try {
      const r = await a("POST", `/api/projects/${gid}/prompt-preview`, { body: {} })
      eq(r.status, 409, "status")
      eq(r.json.error.code, "RUN_ACTIVE", "code")
      eq(r.json.error.details.runId, run.json.runId, "nêu đúng lượt đang chạy")
    } finally {
      await a("POST", `/api/runs/${run.json.runId}/cancel`)
      await waitFor(async () => (await a("GET", `/api/runs/${run.json.runId}`)).json.status === "cancelled", 10000, "dừng")
      await a("DELETE", `/api/projects/${gid}`)
    }
  })

  /* contractToStylesV1 là MỐI NỐI DUY NHẤT giữa contract và thứ gen.sh đọc. Một field
     mới của Prompt Studio rơi ở đây thì mọi tầng khác vẫn xanh: contract lưu đúng, UI
     hiện đúng, prompt thì không có gì. Nên khoá bằng ca riêng, không dựa vào end-to-end. */
  await it("contractToStylesV1 TRUYỀN directive + promptOverride sang styles.json", () => {
    const contract = {
      schemaVersion: 4,
      variants: [{ id: "tet", vi: "Tết" }],
      sheets: [{
        id: "main", grid: { cols: 1, rows: 1 }, orient: "landscape",
        note: "ghi chú của template",
        directive: "vẽ thêm mưa xuân",
        promptOverride: "tôi tự viết trọn prompt tấm này",
        variants: ["tet"],
        components: [{ file: "01-btn", vi: "Nút", spec: "nút", skel: { shape: "rect", w: 0.8, h: 0.4 } }],
      }],
    }
    const styles = contractToStylesV1(contract)
    const sh = styles.sheets[0]
    eq(sh.directive, "vẽ thêm mưa xuân", "directive")
    eq(sh.promptOverride, "tôi tự viết trọn prompt tấm này", "promptOverride")
    eq(sh.note, "ghi chú của template", "note vẫn còn (không bị danh sách trắng nào cắt)")
    eq(sh.styles, ["tet"], "sheet.variants → sheet.styles như cũ")
    eq(sh.variants, undefined, "khoá cũ đã gỡ")
    // Lọc component thì vẫn phải lọc: engine v1 chỉ hiểu 4 khoá.
    eq(Object.keys(sh.components[0]).sort(), ["file", "skel", "spec", "vi"], "component vẫn chỉ 4 khoá")
    eq(sh.components[0].skel.shape, "rrect", "rect → rrect")
  })

  /* ══ `out`/`drawScale` PHẢI ĐI QUA DANH SÁCH TRẮNG CỦA COMPONENT ══════════════
     Lỗi 07/09/2026, chủ sản phẩm báo bằng câu "ra Figma vẫn không đúng size của mình".
     Chuỗi đứt ở ĐÚNG một chỗ: `contractToStylesV1` lọc component xuống 4 khoá, nên
     `styles.json` không có `out` ⇒ `gen.sh:583` không in "final size WxH, drawn at kx"
     (máy vẽ không biết cỡ thật) và `slice.py:498` không ghi `outSize` vào manifest ⇒
     `sheet-files.ts` rơi về `contractSafe`, tức khung Figma = cỡ MÁY VẼ, không phải cỡ
     NGƯỜI DÙNG. Mọi tầng khác vẫn xanh khi nó đứt — nên phải khoá tại đây. */
  await it("contractToStylesV1 TRUYỀN out + drawScale (nếu không, prompt mất cỡ thật và Figma sai size)", () => {
    const styles = contractToStylesV1({
      schemaVersion: 4,
      variants: [{ id: "tet", vi: "Tết" }],
      sheets: [{
        id: "ui", grid: { cols: 2, rows: 1 }, orient: "landscape", variants: ["tet"],
        components: [
          { file: "01-btn", vi: "Nút", spec: "nút", skel: { shape: "pill", w: 0.8, h: 0.3 }, out: { w: 112, h: 39 }, drawScale: 4.25 },
          { file: "02-nen", vi: "Nền", spec: "nền", skel: { shape: "rect", w: 1, h: 1 } },
        ],
      }],
    })
    const [btn, nen] = styles.sheets[0].components
    eq(btn.out, { w: 112, h: 39 }, "out đi tới engine")
    eq(btn.drawScale, 4.25, "drawScale đi tới engine")
    eq(Object.keys(btn).sort(), ["drawScale", "file", "out", "skel", "spec", "vi"], "đúng 6 khoá, không hơn")
    // Element KHÔNG khai cỡ vẫn phải sạch: `out: undefined` lọt xuống là `int(None)` giữa slice.py.
    eq("out" in nen, false, "element không khai cỡ ⇒ không có khoá out")
    eq("drawScale" in nen, false, "element không khai cỡ ⇒ không có khoá drawScale")
  })

  /* ══ CONTRACT ĐỜI CŨ CÒN `skel.matte` — LƯỢC ÊM, KHÔNG NỔ ════════════════════
     `matte` là cờ đời tách-nền-bằng-key: `gen.sh` in thêm một khối câu chữ theo nó,
     `slice.py` chọn nhánh giải ngược theo nó. Cả hai vế đã bỏ 08/09/2026 — độ trong
     của một ô nay chỉ là chữ trong `spec` (webapp `kit-core/lib/glaze.ts`).
     Nhưng contract ĐÃ LƯU trên máy người dùng vẫn mang khoá ấy, và một dự án cũ mở
     lên phải chạy được y như cũ: không lỗi validate, không cảnh báo, chỉ là khoá đó
     không đi tiếp sang styles.json. Ca này khoá đúng hai vế đó. */
  await it("contract đời cũ mang skel.matte ⇒ bị lược êm, không lỗi", async () => {
    const styles = contractToStylesV1({
      schemaVersion: 4,
      variants: [{ id: "tet", vi: "Tết" }],
      sheets: [{
        id: "ui", grid: { cols: 2, rows: 1 }, orient: "landscape", variants: ["tet"],
        components: [
          { file: "01-fx", vi: "Nổ sáng", spec: "a radial light burst", skel: { shape: "burst", w: 0.6, h: 0.9, free: true, matte: "glow" } },
          { file: "02-panel", vi: "Khay", spec: "a background panel", skel: { shape: "rect", w: 0.8, h: 0.8, matte: "vitmatte" } },
        ],
      }],
    })
    const [fx, panel] = styles.sheets[0].components
    eq("matte" in fx.skel, false, "matte glow bị lược khỏi styles.json")
    eq("matte" in panel.skel, false, "matte vitmatte cũng bị lược")
    eq(fx.skel.free, true, "phần còn lại của skel đi nguyên vẹn")
    eq(panel.skel.shape, "rrect", "rect → rrect vẫn chạy trên cùng đường")

    /* …và validate KHÔNG được coi đó là lỗi: người dùng mở dự án cũ ra phải sửa
       được nó, không bị chặn ở cửa. */
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const legacy = structuredClone(g.json.contract)
    legacy.sheets[0].components[0].skel.matte = "glow"
    const v = validateContract(legacy)
    eq(v.errors.filter(e => /matte/.test(e.path) || /matte/.test(e.message ?? "")).length, 0, "matte không sinh lỗi")
    eq(v.warnings.filter(e => /matte/.test(e.path) || /matte/.test(e.message ?? "")).length, 0, "matte cũng không sinh cảnh báo")
  })

  await it("contractToStylesV1 GỌT out rác — contract sửa tay không được biến thành int(None) giữa slice.py", () => {
    const of = c => contractToStylesV1({
      schemaVersion: 4, variants: [{ id: "tet", vi: "Tết" }],
      sheets: [{ id: "ui", grid: { cols: 1, rows: 1 }, orient: "landscape", variants: ["tet"], components: [c] }],
    }).sheets[0].components[0]
    const base = { file: "x", vi: "X", spec: "x", skel: { shape: "rect", w: 1, h: 1 } }
    eq("out" in of({ ...base, out: { w: 0, h: 39 } }), false, "cạnh 0 ⇒ bỏ")
    eq("out" in of({ ...base, out: { w: -5, h: 39 } }), false, "cạnh âm ⇒ bỏ")
    eq("out" in of({ ...base, out: "112x39" }), false, "out không phải object ⇒ bỏ")
    eq(of({ ...base, out: { w: 112.4, h: 39.6 } }).out, { w: 112, h: 40 }, "làm tròn về số nguyên px")
    eq("drawScale" in of({ ...base, drawScale: 0 }), false, "hệ số 0 ⇒ bỏ")
    eq("drawScale" in of({ ...base, drawScale: "nhiều" }), false, "hệ số không phải số ⇒ bỏ")
  })

  await it("validate: directive/promptOverride sai kiểu bị chặn, đúng kiểu thì không", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const good = structuredClone(g.json.contract)
    good.sheets[0].directive = "một câu chỉ đạo"
    good.sheets[0].promptOverride = "prompt tự soạn"
    eq(validateContract(good).errors.filter(e => /directive|promptOverride/.test(e.path)).length, 0, "chữ thì không chặn")

    const bad = structuredClone(g.json.contract)
    bad.sheets[0].directive = { text: "không phải chuỗi" }
    ok(validateContract(bad).errors.some(e => e.path.endsWith(".directive")), "sai kiểu thì chặn")
  })

}
