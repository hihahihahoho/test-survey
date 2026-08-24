/* ════════════════════════════════════════════════════════════════════════════
   codex-account.mjs — TÊN TÀI KHOẢN đang đăng nhập + NÚT ĐĂNG XUẤT.

   NỚI HỢP ĐỒNG CŨ, CÓ CHỦ ĐÍCH VÀ CÓ RANH GIỚI (quyết định của chủ sản phẩm,
   24/08/2026: "hiển thị tên tài khoản đăng nhập, và cho cả nút đăng xuất").
   ─────────────────────────────────────────────────────────────────────────────
   Luật cũ là "agent không đọc auth.json". Lý do thật của luật đó là: token không
   được đi qua tay agent. File này đọc auth.json NHƯNG giữ nguyên lý do thật ấy:

     · Thứ DUY NHẤT thoát ra khỏi hàm là: email, tên hiển thị, enum gói cước,
       enum auth_mode, nhãn home dạng `~/…`, boolean loggedIn.
     · access_token / refresh_token / id_token / account_id KHÔNG BAO GIỜ được
       trả ra, log ra, hay gán vào bất cứ object nào sống lâu hơn hàm này.
     · Email lấy bằng cách giải mã CỤC BỘ phần payload của id_token (base64,
       không gọi mạng, không verify chữ ký — đây là hiển thị, không phải xác thực).

   ĐĂNG XOÁT = `codex logout` — chính codex xoá credential của nó (auth.json,
   và keychain nếu nó cất ở đó). Agent không tự tay xoá file credential; nếu
   codex vắng mặt thì trả enum lý do chứ không làm liều.
   ════════════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { shortenPath } from "./redact.mjs"
import { killTree, winSpawnOpts, winShellOpts } from "./platform.mjs"
import { loginCodexHome } from "./codex-login.mjs"

/* Đọc muộn, cùng lý do với codex-login.mjs: test dựng agent trong cùng tiến trình. */
function codexBin() { return process.env.KITGEN_CODEX_BIN || "codex" }

const LOGOUT_TIMEOUT_MS = 15_000

/** Giải mã payload JWT tại chỗ. Trả object claims hoặc null — không bao giờ ném. */
function jwtClaims(token) {
  try {
    const part = String(token).split(".")[1]
    if (!part) return null
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/")
    const pad = "=".repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"))
  } catch { return null }
}

/**
 * Ai đang đăng nhập ở home mà lượt gen sẽ dùng?
 * KHÔNG spawn gì cả — chỉ đọc một file nhỏ. `loggedIn:false` gồm cả ca credential
 * nằm trong keychain: gen.sh kiểm `auth.json` nên với pipeline đó cũng LÀ chưa
 * đăng nhập — hai nơi phải kể cùng một câu chuyện.
 */
export async function codexAccount(cfg) {
  const home = loginCodexHome(cfg)
  const base = {
    loggedIn: false, email: null, name: null, planType: null, authMode: null,
    codexHomeLabel: shortenPath(home), checkedAt: new Date().toISOString(),
  }
  let raw
  try { raw = JSON.parse(await readFile(join(home, "auth.json"), "utf8")) }
  catch { return base }

  const claims = jwtClaims(raw?.tokens?.id_token)
  const authClaim = claims?.["https://api.openai.com/auth"]
  const apiKey = typeof raw?.OPENAI_API_KEY === "string" && raw.OPENAI_API_KEY !== ""
  return {
    ...base,
    loggedIn: Boolean(claims || apiKey),
    email: typeof claims?.email === "string" ? claims.email : null,
    name: typeof claims?.name === "string" ? claims.name : null,
    planType: authClaim && typeof authClaim.chatgpt_plan_type === "string" ? authClaim.chatgpt_plan_type : null,
    authMode: typeof raw?.auth_mode === "string" ? raw.auth_mode : (apiKey ? "apikey" : null),
  }
}

/**
 * Chạy `codex logout` trên đúng home đang chọn. Kết luận cuối cùng KHÔNG phải mã
 * thoát mà là "auth.json còn không" — route sẽ gọi lại `codexAccount` để trả lời;
 * `codex logout` khi vốn chưa đăng nhập thoát khác 0, mà kết cục thì vẫn đúng ý.
 */
export function codexLogout(cfg) {
  const home = loginCodexHome(cfg)
  const bin = codexBin()
  return new Promise(resolve => {
    let child
    try {
      child = spawn(bin, ["logout"], {
        stdio: "ignore",
        env: { ...process.env, CODEX_HOME: home },
        ...winSpawnOpts(),
        ...winShellOpts(bin),
      })
    } catch { resolve({ ran: false, reason: "NO_CODEX" }); return }
    const timer = setTimeout(() => {
      try { killTree(child) } catch { /* đã chết */ }
      resolve({ ran: false, reason: "TIMEOUT" })
    }, LOGOUT_TIMEOUT_MS)
    timer.unref?.()
    child.on("error", () => { clearTimeout(timer); resolve({ ran: false, reason: "NO_CODEX" }) })
    child.on("close", code => { clearTimeout(timer); resolve({ ran: true, exitCode: code }) })
  })
}
