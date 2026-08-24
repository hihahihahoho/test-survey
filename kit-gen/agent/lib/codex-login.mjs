/* ════════════════════════════════════════════════════════════════════════════
   codex-login.mjs — NÚT ĐĂNG NHẬP: chạy `codex login --device-auth`, bóc ra ĐÚNG
   HAI THỨ (link + mã dùng một lần) rồi đưa cho web hiện lên.

   VÌ SAO CÓ FILE NÀY, VÀ VÌ SAO NÓ KHÔNG PHÁ HỢP ĐỒNG CŨ
   ─────────────────────────────────────────────────────────────────────────────
   Bản cũ cố ý KHÔNG có endpoint nào chạm tới `codex login`: web chỉ in ra chuỗi
   lệnh cho user tự gõ trong Terminal. Lý do của luật đó chưa bao giờ là "cấm chạy
   lệnh" — mà là **agent không được đứng giữa user và thông tin đăng nhập của họ**.
   Bắt người dùng mở Terminal chỉ là cách rẻ nhất để đảm bảo điều đó, không phải
   là mục đích.

   `--device-auth` giữ nguyên ranh giới ấy mà bỏ được cái giá kia:
     · KHÔNG có mật khẩu, KHÔNG có callback localhost. Người dùng đăng nhập trên
       trang của OpenAI, trong trình duyệt của họ.
     · Token do CHÍNH codex ghi thẳng vào `auth.json`. Agent không nhận, không đọc,
       không chuyển tiếp, không thấy nó một lần nào.
     · Thứ duy nhất đi qua tay agent là **link công khai + mã 8 ký tự sống 15 phút**
       — thứ mà người dùng sẽ tự tay gõ vào trang web kia. Nó không mở được gì cả
       nếu không có phiên trình duyệt của chính họ.

   LỌC THEO DANH SÁCH TRẮNG, KHÔNG PHẢI THEO DANH SÁCH ĐEN
   ─────────────────────────────────────────────────────────────────────────────
   Chỗ chết người của một tính năng kiểu này là "hứng stdout rồi che secret đi".
   Che thì phải ĐOÁN ĐÚNG mọi hình dạng của secret — sai một dạng là lộ. Ở đây làm
   ngược lại: stdout/stderr của tiến trình con KHÔNG BAO GIỜ được giữ lại. Mỗi
   dòng chạy qua đúng hai biểu thức (URL thuộc host cho phép; mã dạng XXXX-XXXX)
   và **chỉ hai thứ khớp được đó mới sống sót**; toàn bộ phần còn lại rơi vào hư
   vô ngay trong hàm `harvest()`. Không có `lines.push`, không có `agent.log`,
   không có `errorTail`. Codex có in nhầm token ra màn hình thì ở đây cũng không
   có chỗ nào chứa nó.

   MÃ DÙNG MỘT LẦN KHÔNG PHẢI THỨ ĐỂ LƯU
   ─────────────────────────────────────────────────────────────────────────────
   `userCode` chỉ tồn tại trong RAM, chỉ trong lúc trạng thái là `waiting`, và bị
   XOÁ ngay khi phiên rời khỏi trạng thái đó (xong / hỏng / huỷ / hết hạn). Không
   ghi đĩa, không vào log, không vào chẩn đoán.

   MỘT PHIÊN MỘT LÚC. Bấm nút hai lần không đẻ ra hai con codex — lần bấm sau nhận
   lại đúng phiên đang chờ. Đây không phải tối ưu: hai phiên device-auth song song
   sẽ hiện hai mã khác nhau và người dùng chắc chắn gõ nhầm một trong hai.
   ════════════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { shortenPath } from "./redact.mjs"
import { killTree, winSpawnOpts, winShellOpts } from "./platform.mjs"
import { resolveCodexHome } from "./doctor.mjs"

/* ĐỌC MUỘN, không phải hằng số lúc nạp module: bộ ca dựng agent trong CÙNG tiến trình,
   nên một `const` ở đây sẽ chốt cứng "codex" trước khi ca kịp trỏ sang shim, và mọi ca
   dưới đây sẽ lặng lẽ gọi codex THẬT của máy. */
function codexBin() { return process.env.KITGEN_CODEX_BIN || "codex" }

/** Mã device-auth sống 15 phút. Cho dư một phút rồi cắt — quá hạn mà vẫn treo tiến
 *  trình con thì người dùng ngồi nhìn một cái mã đã chết. */
const SESSION_TTL_MS = 16 * 60_000

/** Chưa bóc được link + mã trong ngần này thì coi như `codex` không nói dạng mình
 *  hiểu (bản quá cũ, hoặc lỗi ngay lúc khởi động) — trả lý do rõ ràng thay vì để
 *  cái nút quay mãi. */
const HANDSHAKE_TIMEOUT_MS = 45_000

/** HOST ĐƯỢC PHÉP hiện thành link bấm được. Bất cứ URL nào khác — kể cả https —
 *  đều bị bỏ, vì cái link này sẽ được mở trong trình duyệt của người dùng và
 *  chính agent là bên đề nghị họ bấm vào. */
const ALLOWED_HOSTS = new Set([
  "auth.openai.com",
  "chatgpt.com",
  "platform.openai.com",
  "openai.com",
])

const URL_RE = /https:\/\/[A-Za-z0-9.-]+(?:\/[^\s"'<>]*)?/g
/** Mã dùng một lần của device-auth: hai cụm chữ-số IN HOA nối bằng gạch ngang. */
const CODE_RE = /\b([A-Z0-9]{4,8}-[A-Z0-9]{4,8})\b/

/** Trạng thái: idle · starting · waiting · done · failed · cancelled */
let session = null

/** CODEX_HOME duy nhất — cùng một phép giải như doctor/gen (`resolveCodexHome`),
 *  để nút này đăng nhập vào ĐÚNG cái home mà lượt gen sẽ dùng. Hồ sơ ảnh riêng đã
 *  bị bỏ (24/08/2026); tham số cfg giữ lại cho tương thích chữ ký, không đọc nữa. */
export function loginCodexHome(_cfg) {
  return resolveCodexHome()
}

/* HOME MỚI TINH thì ghi config.toml TRƯỚC LƯỢT ĐĂNG NHẬP ĐẦU TIÊN.
   `cli_auth_credentials_store = "file"` để credential ra `auth.json` (thay vì
   keychain) — nhờ đó thẻ "tài khoản đang đăng nhập" đọc được email. Doctor thì
   không phụ thuộc file này nữa (nó hỏi thẳng `codex login status`).
   CHỈ khi config.toml CHƯA TỒN TẠI: máy đã có codex từ trước là của người dùng,
   một byte cũng không sửa. */
const FRESH_HOME_CONFIG = `# Sinh boi KitGen truoc luot dang nhap dau tien.
model_provider = "openai"
cli_auth_credentials_store = "file"

[features]
image_generation = true
`

function ensureCodexHomeConfig(home) {
  try {
    mkdirSync(home, { recursive: true })
    const path = join(home, "config.toml")
    if (!existsSync(path)) writeFileSync(path, FRESH_HOME_CONFIG, "utf8")
  } catch { /* login vẫn chạy; doctor sẽ nói thật nếu đăng nhập không thành */ }
}

/** Chỉ giữ URL nằm trong host cho phép. Trả `null` nếu dòng không có cái nào. */
function pickUrl(line) {
  for (const raw of line.match(URL_RE) ?? []) {
    // dấu câu cuối câu hay dính vào URL khi codex in trong một câu văn
    const clean = raw.replace(/[.,;:)\]]+$/, "")
    let u
    try { u = new URL(clean) } catch { continue }
    if (u.protocol !== "https:") continue
    if (!ALLOWED_HOSTS.has(u.hostname)) continue
    return u.toString()
  }
  return null
}

/** MÁY LỌC. Nhận một khúc stdout/stderr, giữ lại đúng hai thứ, quên phần còn lại.
 *  Cố ý là một hàm thuần trên `state` để suite test gọi thẳng được mà không cần
 *  spawn codex thật. */
export function harvest(state, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (!state.verificationUrl) {
      const url = pickUrl(line)
      if (url) state.verificationUrl = url
    }
    if (!state.userCode) {
      const m = CODE_RE.exec(line)
      /* Một URL rút gọn dạng .../ABCD-1234 cũng khớp CODE_RE. Chỉ nhận mã từ dòng
         KHÔNG phải là link, để không bao giờ hiện một mẩu URL ra như "mã". */
      if (m && !/https?:\/\//.test(line)) state.userCode = m[1]
    }
  }
  return state
}

/** Ảnh chụp AN TOÀN để trả ra HTTP. `userCode` chỉ đi kèm khi đang thực sự chờ. */
function snapshot(s) {
  if (!s) return { status: "idle", verificationUrl: null, userCode: null, codexHomeLabel: null, startedAt: null, expiresAt: null, reason: null }
  return {
    status: s.status,
    verificationUrl: s.status === "waiting" ? s.verificationUrl : null,
    userCode: s.status === "waiting" ? s.userCode : null,
    codexHomeLabel: s.codexHomeLabel,
    startedAt: s.startedAt,
    expiresAt: s.status === "waiting" ? s.expiresAt : null,
    reason: s.reason,
  }
}

function settle(s, status, reason = null) {
  if (s.status === "done" || s.status === "failed" || s.status === "cancelled") return
  s.status = status
  s.reason = reason
  s.finishedAt = new Date().toISOString()
  // Rời khỏi `waiting` ⇒ mã dùng một lần không còn lý do gì để tồn tại.
  s.userCode = null
  s.verificationUrl = null
  clearTimeout(s.ttlTimer)
  clearTimeout(s.handshakeTimer)
}

/** Bắt đầu (hoặc nhận lại) một phiên đăng nhập.
 *  @param cfg config của workspace — chỉ để biết CODEX_HOME nào, không đọc gì khác. */
export function startLogin(cfg) {
  if (session && (session.status === "starting" || session.status === "waiting")) {
    return snapshot(session)
  }
  const home = loginCodexHome(cfg)
  ensureCodexHomeConfig(home)
  const s = {
    status: "starting",
    verificationUrl: null,
    userCode: null,
    codexHomeLabel: shortenPath(home),
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    finishedAt: null,
    reason: null,
    child: null,
    ttlTimer: null,
    handshakeTimer: null,
  }
  session = s

  const bin = codexBin()
  let child
  try {
    child = spawn(bin, ["login", "--device-auth"], {
      // stdin đóng: luồng device-auth không hỏi gì, và một tiến trình con đang chờ
      // gõ phím sẽ treo mãi mà không ai thấy.
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CODEX_HOME: home },
      ...winSpawnOpts(),
      ...winShellOpts(bin),
    })
  } catch {
    settle(s, "failed", "NO_CODEX")
    return snapshot(s)
  }
  s.child = child

  const onData = buf => {
    if (s.status !== "starting" && s.status !== "waiting") return
    harvest(s, buf)
    if (s.status === "starting" && s.verificationUrl && s.userCode) {
      s.status = "waiting"
      clearTimeout(s.handshakeTimer)
    }
  }
  child.stdout?.on("data", onData)
  child.stderr?.on("data", onData)

  child.on("error", () => settle(s, "failed", "NO_CODEX"))
  child.on("close", code => {
    /* Mã thoát là bằng chứng DUY NHẤT ở đây: 0 = codex đã tự ghi auth.json xong.
       Agent không mở file đó ra để "xác nhận" — doctor sẽ tự thấy ở lượt kiểm sau. */
    if (code === 0) settle(s, "done")
    else settle(s, "failed", s.verificationUrl || s.userCode ? "DECLINED" : "SPAWN_FAILED")
  })

  s.handshakeTimer = setTimeout(() => {
    if (s.status !== "starting") return
    try { killTree(child) } catch { /* đã chết */ }
    settle(s, "failed", "NO_DEVICE_CODE")
  }, HANDSHAKE_TIMEOUT_MS)
  s.handshakeTimer.unref?.()

  s.ttlTimer = setTimeout(() => {
    if (s.status !== "starting" && s.status !== "waiting") return
    try { killTree(child) } catch { /* đã chết */ }
    settle(s, "failed", "EXPIRED")
  }, SESSION_TTL_MS)
  s.ttlTimer.unref?.()

  return snapshot(s)
}

export function loginStatus() { return snapshot(session) }

export function cancelLogin() {
  if (!session) return snapshot(null)
  if (session.status === "starting" || session.status === "waiting") {
    try { killTree(session.child) } catch { /* đã chết */ }
    settle(session, "cancelled")
  }
  return snapshot(session)
}

/** Chỉ dùng cho test — quên sạch phiên hiện tại. */
export function _resetLogin() {
  if (session?.child) { try { killTree(session.child) } catch { /* đã chết */ } }
  if (session) { clearTimeout(session.ttlTimer); clearTimeout(session.handshakeTimer) }
  session = null
}
