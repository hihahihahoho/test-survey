/* suite-codex-login.mjs — NÚT ĐĂNG NHẬP (`codex login --device-auth`).
 *
 * BỘ CA NÀY CHỦ YẾU LÀ MỘT BỘ CA BẢO MẬT, không phải bộ ca tính năng. Tính năng thì
 * hỏng là thấy ngay (không có mã ⇒ không đăng nhập được). Thứ hỏng ÂM THẦM là hợp
 * đồng: một ngày nào đó ai đó thêm `errorTail` "cho dễ debug", hoặc nới danh sách
 * host "cho tiện", và app lặng lẽ trở thành bên đứng giữa người dùng và tài khoản
 * của họ — không ca nào đỏ, không ai biết.
 *
 * Nên ca đắt nhất ở đây là ca PHỦ ĐỊNH: đổ nguyên một token vào stdout của codex giả
 * rồi khẳng định KHÔNG một byte nào của nó có mặt trong bất kỳ response nào.
 *
 * WINDOWS: các ca có spawn dùng shim `/bin/sh` nên chỉ chạy trên darwin/linux. Phần
 * thuần hàm (`harvest`, `loginCodexHome`, ảnh chụp trạng thái) chạy ở mọi nền —
 * và đó cũng chính là chỗ chứa toàn bộ luật lọc.
 */
import { chmod, mkdtemp, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { describe, it, eq, includes, ok, rmTemp, waitFor } from "./harness.mjs"
import { _resetLogin, harvest, loginCodexHome } from "../lib/codex-login.mjs"

const IS_WIN = process.platform === "win32"

/** Khối chữ mà `codex login --device-auth` thật in ra (chép nguyên dạng đã dò 20/08). */
const REAL_OUTPUT = [
  "1. Open this link in your browser and sign in to your account",
  "   https://auth.openai.com/codex/device",
  "2. Enter this one-time code (expires in 15 minutes)",
  "   3P0N-7GY2Q",
].join("\n")

function fresh() {
  return { verificationUrl: null, userCode: null }
}

export async function run({ api, wsRoot }) {
  describe("Đăng nhập Codex bằng mã thiết bị")

  /* ── A. MÁY LỌC: chỉ hai thứ sống sót ─────────────────────────────────── */

  await it("bóc đúng link + mã từ output thật của codex", async () => {
    const s = harvest(fresh(), REAL_OUTPUT)
    eq(s.verificationUrl, "https://auth.openai.com/codex/device", "link")
    eq(s.userCode, "3P0N-7GY2Q", "mã dùng một lần")
  })

  await it("KHÔNG giữ lại gì ngoài hai trường đó — stdout không có chỗ nào để đọng", async () => {
    const s = harvest(fresh(), `${REAL_OUTPUT}\nsk-proj-AAAABBBBCCCCDDDDEEEEFFFF\ntoken: xyzzy-123456\n`)
    eq(Object.keys(s).sort().join(","), "userCode,verificationUrl", "đúng 2 khoá, không hơn")
    eq(JSON.stringify(s).includes("sk-proj"), false, "không đọng token")
    eq(JSON.stringify(s).includes("xyzzy"), false, "không đọng dòng lạ")
  })

  await it("link phải là https VÀ thuộc host cho phép — app là bên mời user bấm vào nó", async () => {
    eq(harvest(fresh(), "  http://auth.openai.com/codex/device").verificationUrl, null, "http trần bị bỏ")
    eq(harvest(fresh(), "  https://auth.openai.com.evil.tld/x").verificationUrl, null, "host giả mạo bị bỏ")
    eq(harvest(fresh(), "  https://pastebin.com/raw/abc").verificationUrl, null, "host lạ bị bỏ")
    eq(harvest(fresh(), "  https://chatgpt.com/device").verificationUrl, "https://chatgpt.com/device", "host cho phép")
  })

  await it("dấu câu dính đuôi link không làm hỏng link", async () => {
    eq(harvest(fresh(), "Mở https://auth.openai.com/codex/device.").verificationUrl,
      "https://auth.openai.com/codex/device", "cắt dấu chấm cuối câu")
  })

  await it("KHÔNG nhặt mã ra từ một mẩu URL — mã và link là hai thứ khác nhau", async () => {
    /* Bẫy thật: URL rút gọn dạng .../ABCD-1234 khớp y hệt biểu thức của mã. Nhặt nhầm
       thì UI hiện một mẩu đường dẫn ra như "mã đăng nhập" và người dùng gõ nó sang
       trang kia, thất bại, rồi kết luận app hỏng. */
    const s = harvest(fresh(), "  https://auth.openai.com/codex/ABCD-1234")
    eq(s.userCode, null, "không lấy mã từ dòng có link")
    eq(s.verificationUrl, "https://auth.openai.com/codex/ABCD-1234", "vẫn lấy được link")
  })

  await it("giữ NGUYÊN thứ bắt được đầu tiên — codex in lại lần hai không đổi mã đang hiện", async () => {
    const s = harvest(fresh(), REAL_OUTPUT)
    harvest(s, "   https://auth.openai.com/other\n   ZZZZ-9999")
    eq(s.userCode, "3P0N-7GY2Q", "mã không bị ghi đè giữa chừng")
    eq(s.verificationUrl, "https://auth.openai.com/codex/device", "link không bị ghi đè")
  })

  /* ── B. ĐĂNG NHẬP ĐÚNG CÁI HOME MÀ LƯỢT GEN SẼ DÙNG ───────────────────── */

  await it("hồ sơ riêng ⇒ CODEX_HOME của hồ sơ đó; mặc định ⇒ ~/.codex", async () => {
    eq(loginCodexHome({ imageGen: { mode: "img-home" } }), join(homedir(), ".codex-img"), "img-home mặc định")
    eq(loginCodexHome({ imageGen: { mode: "img-home", codexHome: "~/.codex-alt" } }),
      join(homedir(), ".codex-alt"), "img-home có khai codexHome")
    eq(loginCodexHome({ imageGen: { mode: "default-home" } }), join(homedir(), ".codex"), "mặc định")
    eq(loginCodexHome(null), join(homedir(), ".codex"), "không có config")
  })

  /* ── C. HỢP ĐỒNG HTTP ─────────────────────────────────────────────────── */

  await it("GET khi chưa bấm gì ⇒ idle, không mã, không path tuyệt đối", async () => {
    _resetLogin()
    const r = await api("GET", "/api/codex/login")
    eq(r.status, 200, "status")
    eq(r.json.status, "idle", "trạng thái")
    eq(r.json.userCode, null, "không mã")
    eq(r.json.verificationUrl, null, "không link")
  })

  if (IS_WIN) {
    await it("[bỏ qua trên Windows] ca có spawn dùng shim /bin/sh", async () => { ok(true) })
    return
  }

  /** Dựng một `codex` giả in ra `text` rồi treo (để phiên ở trạng thái chờ). */
  async function shim(dir, text) {
    const bin = join(dir, "codex")
    await writeFile(bin, `#!/bin/sh\ncat <<'EOF'\n${text}\nEOF\nexec sleep 20\n`)
    await chmod(bin, 0o755)
    return bin
  }

  await it("POST ⇒ chờ, trả ĐÚNG link + mã; DELETE ⇒ huỷ và mã biến mất", async () => {
    const dir = await mkdtemp(join(wsRoot, "codex-login-"))
    const prev = process.env.KITGEN_CODEX_BIN
    try {
      _resetLogin()
      process.env.KITGEN_CODEX_BIN = await shim(dir, REAL_OUTPUT)

      const start = await api("POST", "/api/codex/login", { body: {} })
      eq(start.status, 202, "POST 202")

      /* `waitFor` của harness trả `undefined` — nó chỉ chờ, không mang kết quả về.
         Nên bắt lấy ảnh chụp cuối cùng qua biến ngoài. */
      let waiting = null
      await waitFor(async () => {
        const r = await api("GET", "/api/codex/login")
        if (r.json.status === "waiting") { waiting = r.json; return true }
        return false
      }, 8000, "phiên vào trạng thái chờ")
      eq(waiting.verificationUrl, "https://auth.openai.com/codex/device", "link")
      eq(waiting.userCode, "3P0N-7GY2Q", "mã")
      ok(typeof waiting.expiresAt === "string", "có hạn dùng để UI đếm ngược")
      /* Nhãn home LUÔN dạng ~/… — path tuyệt đối chứa tên user là PII (arch §4.3-5). */
      ok(!waiting.codexHomeLabel.startsWith("/"), `nhãn home rút gọn: ${waiting.codexHomeLabel}`)

      /* Bấm nút lần hai KHÔNG đẻ phiên mới: hai mã khác nhau cùng hiện là bảo đảm
         người dùng gõ nhầm một trong hai. */
      const again = await api("POST", "/api/codex/login", { body: {} })
      eq(again.json.userCode, "3P0N-7GY2Q", "vẫn là phiên đang chờ, không phải mã mới")

      const cancelled = await api("DELETE", "/api/codex/login")
      eq(cancelled.json.status, "cancelled", "đã huỷ")
      eq(cancelled.json.userCode, null, "mã dùng một lần biến mất khỏi agent")
      const after = await api("GET", "/api/codex/login")
      eq(after.json.userCode, null, "và không quay lại ở lần đọc sau")
    } finally {
      _resetLogin()
      if (prev === undefined) delete process.env.KITGEN_CODEX_BIN
      else process.env.KITGEN_CODEX_BIN = prev
      await rmTemp(dir)
    }
  })

  await it("codex in cả TOKEN ra stdout ⇒ không một byte nào của nó lọt ra response", async () => {
    const SECRET = "sk-proj-DEADBEEFDEADBEEFDEADBEEF"
    const dir = await mkdtemp(join(wsRoot, "codex-login-leak-"))
    const prev = process.env.KITGEN_CODEX_BIN
    try {
      _resetLogin()
      process.env.KITGEN_CODEX_BIN = await shim(dir,
        `${REAL_OUTPUT}\naccess_token=${SECRET}\nAuthorization: Bearer ${SECRET}\n`)

      await api("POST", "/api/codex/login", { body: {} })
      let waiting = null
      await waitFor(async () => {
        const r = await api("GET", "/api/codex/login")
        if (r.json.status === "waiting") { waiting = r.json; return true }
        return false
      }, 8000, "phiên vào trạng thái chờ")

      /* Không phải "đã che" — mà là KHÔNG CÓ CHỖ NÀO ĐỂ CHỨA. Agent không giữ stdout,
         nên kể cả một dạng secret mà bộ lọc `redactLine` chưa biết cũng không có
         đường đi ra. */
      const body = JSON.stringify(waiting)
      eq(body.includes(SECRET), false, "token không có trong response")
      eq(body.includes("DEADBEEF"), false, "kể cả một mẩu của nó")
      eq(body.includes("Bearer"), false, "không có dòng header nào lọt ra")
      eq(waiting.userCode, "3P0N-7GY2Q", "vẫn bóc đúng mã")
      await api("DELETE", "/api/codex/login")
    } finally {
      _resetLogin()
      if (prev === undefined) delete process.env.KITGEN_CODEX_BIN
      else process.env.KITGEN_CODEX_BIN = prev
      await rmTemp(dir)
    }
  })

  await it("codex thoát 0 mà chưa in mã nào ⇒ hỏng CÓ TÊN, không phải nút quay mãi", async () => {
    const dir = await mkdtemp(join(wsRoot, "codex-login-mute-"))
    const prev = process.env.KITGEN_CODEX_BIN
    try {
      _resetLogin()
      const bin = join(dir, "codex")
      await writeFile(bin, "#!/bin/sh\nexit 7\n")
      await chmod(bin, 0o755)
      process.env.KITGEN_CODEX_BIN = bin

      await api("POST", "/api/codex/login", { body: {} })
      let done = null
      await waitFor(async () => {
        const r = await api("GET", "/api/codex/login")
        if (r.json.status === "failed") { done = r.json; return true }
        return false
      }, 8000, "phiên kết thúc bằng thất bại")
      eq(done.reason, "SPAWN_FAILED", "lý do là enum, không phải log")
      eq(done.userCode, null, "không mã")
      includes(Object.keys(done).join(","), "reason", "UI có cái để hiện câu tiếng Việt")
    } finally {
      _resetLogin()
      if (prev === undefined) delete process.env.KITGEN_CODEX_BIN
      else process.env.KITGEN_CODEX_BIN = prev
      await rmTemp(dir)
    }
  })

  await it("codex thoát 0 SAU khi đã đưa mã ⇒ xong, và mã lập tức hết giá trị hiển thị", async () => {
    const dir = await mkdtemp(join(wsRoot, "codex-login-ok-"))
    const prev = process.env.KITGEN_CODEX_BIN
    try {
      _resetLogin()
      const bin = join(dir, "codex")
      await writeFile(bin, `#!/bin/sh\ncat <<'EOF'\n${REAL_OUTPUT}\nEOF\nsleep 1\nexit 0\n`)
      await chmod(bin, 0o755)
      process.env.KITGEN_CODEX_BIN = bin

      await api("POST", "/api/codex/login", { body: {} })
      let done = null
      await waitFor(async () => {
        const r = await api("GET", "/api/codex/login")
        if (r.json.status === "done") { done = r.json; return true }
        return false
      }, 10000, "phiên báo xong")
      eq(done.userCode, null, "xong rồi thì mã không còn lý do tồn tại")
      eq(done.verificationUrl, null, "link cũng vậy")
      eq(done.reason, null, "xong thì không có lý do hỏng")
    } finally {
      _resetLogin()
      if (prev === undefined) delete process.env.KITGEN_CODEX_BIN
      else process.env.KITGEN_CODEX_BIN = prev
      await rmTemp(dir)
    }
  })
}
