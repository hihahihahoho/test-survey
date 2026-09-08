/* suite-settings.mjs — TUỲ CHỌN NGƯỜI DÙNG SỐNG TRÊN ĐĨA (#/api/settings).
 *
 * Sự cố sinh ra nhóm ca này: người dùng bấm Cmd+F5 giữa lúc đang tạo ảnh và thấy như
 * "mất hết" — dữ liệu thật vẫn nằm nguyên trên đĩa, nhưng mọi tuỳ chọn giao diện thì chỉ
 * sống trong localStorage của MỘT origin. Nên ca ở đây kiểm đúng hai điều:
 *   ① tuỳ chọn đi vào `<workspace>/.kitgen/config.json` và đọc lại được;
 *   ② hợp đồng bảo mật của `lib/settings.mjs` không thủng — đường dẫn, chuỗi tự do và
 *      field lạ KHÔNG có cách nào lọt vào file đó qua ngả API.
 *
 * 08/09/2026 — bảng field còn ĐÚNG MỘT dòng `ui.theme` (Đợt 4). 10 field `ui.*` và cả
 * khối `prefs` đã bỏ vì web không còn gửi/đọc chúng, nên ca của chúng cũng đi theo. Thứ
 * KHÔNG được phép mất theo là hai ca tương thích ngược ở cuối file: config.json của bản
 * cũ (đầy khoá đã chết) phải đọc lên êm và PATCH kèm khoá cũ không được 400.
 */
import { join } from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { describe, it, eq, ok } from "./harness.mjs"

const CONFIG = ws => join(ws, ".kitgen", "config.json")
const readConfig = async ws => JSON.parse(await readFile(CONFIG(ws), "utf8"))

export async function run({ api, wsRoot }) {
  describe("tuỳ chọn người dùng trên đĩa (/api/settings)")

  await it("GET trả bảng với giá trị mặc định", async () => {
    const r = await api("GET", "/api/settings")
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "dark", "ui.theme")
    eq(Object.keys(r.json.settings), ["ui"], "chỉ còn một nhóm — `prefs` đã bỏ")
    eq(Object.keys(r.json.settings.ui), ["theme"], "và một field duy nhất trong nhóm đó")
  })

  /* ════════ NHẬN NUÔI LẦN ĐẦU — chống xoá tuỳ chọn khi nâng cấp ════════
     Workspace tạo trước bảng này CHƯA có khối `ui`. Nếu API không nói ra điều đó, web sẽ
     tưởng mặc định là sự thật và ghi đè lên tuỳ chọn thật của người dùng ngay lần mở đầu
     tiên sau khi cập nhật. Ba ca dưới đây khoá đúng tín hiệu ấy lại. */

  await it("workspace CHƯA từng lưu tuỳ chọn ⇒ configured:false (mặc định KHÔNG phải sự thật)", async () => {
    await writeFile(CONFIG(wsRoot), '{"workspaceVersion": 1, "maxJobs": 4, "imageGen": {"mode": "unknown"}}\n')
    const r = await api("GET", "/api/settings")
    eq(r.json.configured, false, "configured")
  })

  await it("`maxJobs` ở gốc KHÔNG được tính là đã cấu hình", async () => {
    // CONFIG_DEFAULT ghi `maxJobs` cho cả workspace mới toanh ⇒ lấy nó làm dấu hiệu thì
    // workspace nào cũng hoá ra "đã cấu hình", và ca nhận nuôi sẽ không bao giờ chạy.
    await writeFile(CONFIG(wsRoot), '{"workspaceVersion": 1, "maxJobs": 6, "imageGen": {"mode": "unknown"}}\n')
    const r = await api("GET", "/api/settings")
    eq(r.json.configured, false, "configured")
  })

  await it("ghi một lần rồi thì configured:true — đĩa thành bên thắng", async () => {
    const w = await api("PATCH", "/api/settings", { body: { ui: { theme: "light" } } })
    eq(w.json.configured, true, "PATCH trả configured:true ngay")
    const r = await api("GET", "/api/settings")
    eq(r.json.configured, true, "GET sau đó cũng true")
    eq(r.json.settings.ui.theme, "light", "và giá trị là của người dùng")
  })

  await it("PATCH ghi xuống config.json và GET đọc lại đúng (sống qua reload)", async () => {
    const r = await api("PATCH", "/api/settings", { body: { ui: { theme: "system" } } })
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "system", "trả về bảng đã vá")

    const cfg = await readConfig(wsRoot)
    eq(cfg.ui.theme, "system", "config.json ui.theme")
    eq(cfg.maxJobs, 6, "`maxJobs` ở gốc là của workspace, /api/settings KHÔNG đụng vào")

    const again = await api("GET", "/api/settings")
    eq(again.json.settings.ui.theme, "system", "đọc lại sau khi ghi")
  })

  await it("PATCH rỗng KHÔNG dựng field cũ về mặc định", async () => {
    await api("PATCH", "/api/settings", { body: { ui: { theme: "light" } } })
    await api("PATCH", "/api/settings", { body: {} })
    const r = await api("GET", "/api/settings")
    eq(r.json.settings.ui.theme, "light", "field cũ còn nguyên")
  })

  await it("enum sai bị BỎ, không làm hỏng cả lần lưu", async () => {
    const r = await api("PATCH", "/api/settings", { body: { ui: { theme: "neon" } } })
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "light", "enum sai ⇒ giữ giá trị cũ")
  })

  /* ════════ HỢP ĐỒNG BẢO MẬT ════════ */

  await it("field LẠ không bao giờ ra đĩa", async () => {
    await api("PATCH", "/api/settings", { body: { ui: { authToken: "sk-live-abcdef" }, secrets: { a: 1 } } })
    const cfg = await readConfig(wsRoot)
    ok(!("authToken" in cfg.ui), "ui.authToken không được tồn tại")
    ok(!("secrets" in cfg), "nhóm lạ không được tồn tại")
    const raw = await readFile(CONFIG(wsRoot), "utf8")
    ok(!raw.includes("sk-live-abcdef"), "giá trị của field lạ KHÔNG được nằm trong file")
  })

  await it("ĐƯỜNG DẪN không có ô nào để lọt vào — bảng chỉ còn ENUM", async () => {
    const paths = ["/Users/ai/.codex/auth.json", "~/KitGen", "C:\\Users\\ai", "../../etc/passwd", "$HOME"]
    for (const p of paths) {
      await api("PATCH", "/api/settings", { body: { ui: { theme: p, workspacePath: p } } })
    }
    const raw = await readFile(CONFIG(wsRoot), "utf8")
    for (const p of paths) ok(!raw.includes(p), `KHÔNG được ghi ${JSON.stringify(p)}`)
    const r = await api("GET", "/api/settings")
    eq(r.json.settings.ui.theme, "light", "giá trị cũ còn nguyên")
  })

  await it("body không phải object ⇒ 400, config.json KHÔNG đổi", async () => {
    const before = await readFile(CONFIG(wsRoot), "utf8")
    const r = await api("PATCH", "/api/settings", { body: [1, 2, 3] })
    eq(r.status, 400, "status")
    eq(r.json.error.code, "BAD_REQUEST", "code")
    eq(await readFile(CONFIG(wsRoot), "utf8"), before, "file không được đụng tới")
  })

  await it("KHÔNG chạm `imageGen` — hồ sơ codex chỉ đổi qua /api/image-profile", async () => {
    const before = await readConfig(wsRoot)
    await api("PATCH", "/api/settings", { body: { imageGen: { mode: "img-home" }, ui: { theme: "dark" } } })
    const after = await readConfig(wsRoot)
    eq(after.imageGen, before.imageGen, "imageGen giữ nguyên")
    eq(after.ui.theme, "dark", "phần hợp lệ vẫn được ghi")
  })

  await it("config.json bị sửa tay thành rác ⇒ trả mặc định, không 500", async () => {
    await writeFile(CONFIG(wsRoot), '{"ui": 5, "prefs": "hỏng", "workspaceVersion": 1}\n')
    const r = await api("GET", "/api/settings")
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "dark", "về mặc định")
  })

  /* ════════ TƯƠNG THÍCH NGƯỢC — config.json do bản CŨ ghi ════════
     Máy người dùng bản trước còn `ui.density`, `ui.kitZoom`, cả khối `prefs`. Hai ca
     dưới khoá đúng cái hợp đồng đã hứa: lược bỏ ÊM, không crash và không 400. */

  await it("config.json bản CŨ (10 field ui.* + khối prefs) đọc lên êm, chỉ còn theme", async () => {
    await writeFile(CONFIG(wsRoot), JSON.stringify({
      workspaceVersion: 1, maxJobs: 6, imageGen: { mode: "unknown" },
      ui: {
        theme: "light", locale: "en", density: "compact", sidebarWidth: 320, railCollapsed: true,
        projectsView: "list", sortBy: "name", sortDir: "asc", filterChip: "running",
        collapsedSections: ["sheet-01"], lastTab: { design: "sheets" }, kitBackdrop: "dark", kitZoom: 150,
      },
      prefs: { maxJobs: 6, autoSliceAfterGen: false, confirmDestructive: false, showEmptyCells: false, logTail: 5000 },
    }, null, 2) + "\n")
    const r = await api("GET", "/api/settings")
    eq(r.status, 200, "status — không crash")
    eq(r.json.configured, true, "khối ui có mặt ⇒ đĩa là bên thắng")
    eq(r.json.settings.ui, { theme: "light" }, "chỉ field còn sống được trả về")
    eq(r.json.settings.prefs, undefined, "khối prefs không được dựng lại")
  })

  await it("PATCH kèm khoá của bản CŨ vẫn 200 — khoá lạ bị BỎ IM LẶNG, phần hợp lệ vẫn ghi", async () => {
    const r = await api("PATCH", "/api/settings", {
      body: { ui: { theme: "dark", density: "compact", kitZoom: 150 }, prefs: { maxJobs: 2 } },
    })
    eq(r.status, 200, "status — khoá lạ KHÔNG được làm hỏng cả lần lưu")
    eq(r.json.settings.ui, { theme: "dark" }, "chỉ theme được nhận")
    const cfg = await readConfig(wsRoot)
    eq(cfg.ui, { theme: "dark" }, "khối ui được ghi lại nguyên khối ⇒ rác cũ trong đó tự biến mất")
    eq(cfg.maxJobs, 6, "`maxJobs` ở gốc KHÔNG bị /api/settings kéo theo")
  })

  /* Nhiều ca ở trên cố ý viết đè config.json bằng tay. Trả nó về hình dạng lành lặn
     trước khi rời suite — nhóm ca chạy sau dùng chung workspace này. */
  await writeFile(CONFIG(wsRoot), JSON.stringify({ workspaceVersion: 1, maxJobs: 4, imageGen: { mode: "unknown" } }, null, 2) + "\n")
}
