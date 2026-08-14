/* suite-settings.mjs — TUỲ CHỌN NGƯỜI DÙNG SỐNG TRÊN ĐĨA (#/api/settings).
 *
 * Sự cố sinh ra nhóm ca này: người dùng bấm Cmd+F5 giữa lúc đang tạo ảnh và thấy như
 * "mất hết" — dữ liệu thật vẫn nằm nguyên trên đĩa, nhưng mọi tuỳ chọn giao diện thì chỉ
 * sống trong localStorage của MỘT origin. Nên ca ở đây kiểm đúng hai điều:
 *   ① tuỳ chọn đi vào `<workspace>/.kitgen/config.json` và đọc lại được;
 *   ② hợp đồng bảo mật của `lib/settings.mjs` không thủng — đường dẫn, chuỗi tự do và
 *      field lạ KHÔNG có cách nào lọt vào file đó qua ngả API.
 */
import { join } from "node:path"
import { readFile } from "node:fs/promises"
import { describe, it, eq, ok } from "./harness.mjs"

const CONFIG = ws => join(ws, ".kitgen", "config.json")
const readConfig = async ws => JSON.parse(await readFile(CONFIG(ws), "utf8"))

export async function run({ api, wsRoot }) {
  describe("tuỳ chọn người dùng trên đĩa (/api/settings)")

  await it("GET trả đủ hai nhóm với giá trị mặc định", async () => {
    const r = await api("GET", "/api/settings")
    eq(r.status, 200, "status")
    const s = r.json.settings
    eq(s.ui.theme, "dark", "ui.theme")
    eq(s.ui.projectsView, "grid", "ui.projectsView")
    eq(s.prefs.maxJobs, 4, "prefs.maxJobs")
    eq(s.prefs.autoSliceAfterGen, true, "prefs.autoSliceAfterGen")
  })

  /* ════════ NHẬN NUÔI LẦN ĐẦU — chống xoá tuỳ chọn khi nâng cấp ════════
     Mọi workspace đang tồn tại đều CHƯA có khối ui/prefs. Nếu API không nói ra điều đó,
     web sẽ tưởng mặc định là sự thật và ghi đè lên tuỳ chọn thật của người dùng ngay lần
     mở đầu tiên sau khi cập nhật. Ba ca dưới đây khoá đúng tín hiệu ấy lại. */

  await it("workspace CHƯA từng lưu tuỳ chọn ⇒ configured:false (mặc định KHÔNG phải sự thật)", async () => {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(CONFIG(wsRoot), '{"workspaceVersion": 1, "maxJobs": 4, "imageGen": {"mode": "unknown"}}\n')
    const r = await api("GET", "/api/settings")
    eq(r.json.configured, false, "configured")
  })

  await it("`maxJobs` ở gốc KHÔNG được tính là đã cấu hình", async () => {
    // CONFIG_DEFAULT ghi `maxJobs` cho cả workspace mới toanh ⇒ lấy nó làm dấu hiệu thì
    // workspace nào cũng hoá ra "đã cấu hình", và ca nhận nuôi sẽ không bao giờ chạy.
    const { writeFile } = await import("node:fs/promises")
    await writeFile(CONFIG(wsRoot), '{"workspaceVersion": 1, "maxJobs": 6, "imageGen": {"mode": "unknown"}}\n')
    const r = await api("GET", "/api/settings")
    eq(r.json.configured, false, "configured")
    eq(r.json.settings.prefs.maxJobs, 6, "vẫn đọc được con số kiểu cũ")
  })

  await it("ghi một lần rồi thì configured:true — đĩa thành bên thắng", async () => {
    const w = await api("PATCH", "/api/settings", { body: { ui: { theme: "light" } } })
    eq(w.json.configured, true, "PATCH trả configured:true ngay")
    const r = await api("GET", "/api/settings")
    eq(r.json.configured, true, "GET sau đó cũng true")
    eq(r.json.settings.ui.theme, "light", "và giá trị là của người dùng")
  })

  await it("PATCH ghi xuống config.json và GET đọc lại đúng (sống qua reload)", async () => {
    const r = await api("PATCH", "/api/settings", {
      body: { ui: { theme: "light", projectsView: "list" }, prefs: { autoSliceAfterGen: false } },
    })
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "light", "trả về bảng đã vá")

    const cfg = await readConfig(wsRoot)
    eq(cfg.ui.theme, "light", "config.json ui.theme")
    eq(cfg.ui.projectsView, "list", "config.json ui.projectsView")
    eq(cfg.prefs.autoSliceAfterGen, false, "config.json prefs.autoSliceAfterGen")

    const again = await api("GET", "/api/settings")
    eq(again.json.settings.ui.theme, "light", "đọc lại sau khi ghi")
    eq(again.json.settings.prefs.autoSliceAfterGen, false, "đọc lại prefs")
  })

  await it("PATCH là VÁ MỘT PHẦN — field không gửi giữ nguyên", async () => {
    await api("PATCH", "/api/settings", { body: { ui: { density: "compact" } } })
    const r = await api("GET", "/api/settings")
    eq(r.json.settings.ui.density, "compact", "field vừa vá")
    eq(r.json.settings.ui.theme, "light", "field cũ KHÔNG bị dựng về mặc định")
  })

  await it("số ngoài khoảng bị KẸP chứ không từ chối (giao diện tự sửa theo)", async () => {
    const r = await api("PATCH", "/api/settings", { body: { prefs: { maxJobs: 99, logTail: 1 } } })
    eq(r.status, 200, "status")
    eq(r.json.settings.prefs.maxJobs, 8, "maxJobs kẹp về trần 8")
    eq(r.json.settings.prefs.logTail, 200, "logTail kẹp về sàn 200")
  })

  await it("`maxJobs` ở GỐC config.json được giữ đồng bộ với prefs", async () => {
    await api("PATCH", "/api/settings", { body: { prefs: { maxJobs: 2 } } })
    const cfg = await readConfig(wsRoot)
    eq(cfg.maxJobs, 2, "maxJobs gốc")
    eq(cfg.prefs.maxJobs, 2, "prefs.maxJobs")
  })

  await it("enum sai bị BỎ, không làm hỏng cả lần lưu", async () => {
    const r = await api("PATCH", "/api/settings", { body: { ui: { theme: "neon", density: "comfortable" } } })
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "light", "enum sai ⇒ giữ giá trị cũ")
    eq(r.json.settings.ui.density, "comfortable", "field hợp lệ cùng lần gửi VẪN được ghi")
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

  await it("ĐƯỜNG DẪN không lọt qua được ô mã (ID_RE)", async () => {
    const paths = ["/Users/ai/.codex/auth.json", "~/KitGen", "C:\\Users\\ai", "../../etc/passwd", "$HOME"]
    await api("PATCH", "/api/settings", {
      body: { ui: { collapsedSections: paths, lastTab: { "/etc/passwd": "sheets", design: "~/secret" } } },
    })
    const r = await api("GET", "/api/settings")
    eq(r.json.settings.ui.collapsedSections, [], "mọi đường dẫn bị loại")
    eq(r.json.settings.ui.lastTab, {}, "khoá và giá trị dạng đường dẫn đều bị loại")
    const raw = await readFile(CONFIG(wsRoot), "utf8")
    for (const p of paths) ok(!raw.includes(p), `KHÔNG được ghi ${JSON.stringify(p)}`)
  })

  await it("mã hợp lệ do ứng dụng sinh thì ĐI QUA (không phải chặn tất)", async () => {
    await api("PATCH", "/api/settings", {
      body: { ui: { collapsedSections: ["sheet-01", "mascot", "sheet-01"], lastTab: { design: "sheets" } } },
    })
    const r = await api("GET", "/api/settings")
    eq(r.json.settings.ui.collapsedSections, ["sheet-01", "mascot"], "giữ thứ tự, bỏ trùng")
    eq(r.json.settings.ui.lastTab, { design: "sheets" }, "bảng tab")
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
    await api("PATCH", "/api/settings", { body: { imageGen: { mode: "img-home" }, ui: { kitZoom: 150 } } })
    const after = await readConfig(wsRoot)
    eq(after.imageGen, before.imageGen, "imageGen giữ nguyên")
    eq(after.ui.kitZoom, 150, "phần hợp lệ vẫn được ghi")
  })

  await it("config.json bị sửa tay thành rác ⇒ trả mặc định, không 500", async () => {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(CONFIG(wsRoot), '{"ui": 5, "prefs": "hỏng", "workspaceVersion": 1}\n')
    const r = await api("GET", "/api/settings")
    eq(r.status, 200, "status")
    eq(r.json.settings.ui.theme, "dark", "về mặc định")
    eq(r.json.settings.prefs.maxJobs, 4, "về mặc định")
  })

  await it("workspace CŨ chỉ có `maxJobs` ở gốc ⇒ con số đó KHÔNG bị mất", async () => {
    const { writeFile } = await import("node:fs/promises")
    await writeFile(CONFIG(wsRoot), '{"workspaceVersion": 1, "maxJobs": 6, "imageGen": {"mode": "unknown"}}\n')
    const r = await api("GET", "/api/settings")
    eq(r.json.settings.prefs.maxJobs, 6, "đọc được maxJobs kiểu cũ ở gốc")
  })

  /* Hai ca cuối cố ý viết đè config.json bằng tay. Trả nó về hình dạng lành lặn trước
     khi rời suite — nhóm ca chạy sau dùng chung workspace này. */
  const { writeFile } = await import("node:fs/promises")
  await writeFile(CONFIG(wsRoot), JSON.stringify({ workspaceVersion: 1, maxJobs: 4, imageGen: { mode: "unknown" } }, null, 2) + "\n")
}
