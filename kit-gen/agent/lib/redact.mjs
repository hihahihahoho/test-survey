/* redact.mjs — lớp chặn cuối: KHÔNG BAO GIỜ để secret / đường dẫn tuyệt đối
   đi ra response, log stream, hay agent.log (architecture §4.3 + §4.4-4).
   Agent kiểm tra auth bằng existsSync, không mở file — nhưng log của codex có thể
   chứa token nên mọi dòng log đều phải qua redactLine(). */
import { homedir } from "node:os"

const HOME = homedir()

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_\-]{16,}/g, "<redacted:key>"],
  [/eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.?[A-Za-z0-9_\-]*/g, "<redacted:jwt>"],
  [/\b(bearer)\s+[A-Za-z0-9._\-]{8,}/gi, "$1 <redacted>"],
  [/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|experimental_bearer_token|client_secret|password)\b(\s*[:=]\s*)("?)[^\s"',}]{6,}\3/gi,
    "$1$2<redacted>"],
]

/** Rút gọn đường dẫn tuyệt đối → nhãn `~/…` (PII, architecture §4.3-5). */
export function shortenPath(p) {
  if (typeof p !== "string") return p
  let s = p
  if (HOME && s.startsWith(HOME)) s = "~" + s.slice(HOME.length)
  // đường dẫn tuyệt đối của user khác / /private/var… → chỉ giữ 2 đoạn cuối
  s = s.replace(/(^|[\s"'(=])\/(?:Users|home)\/[^/\s"')]+((?:\/[^\s"')]+)*)/g,
    (_m, pre, rest) => pre + "~" + (rest || ""))
  // gốc temp (/tmp, /private/…, /var/folders/…) không thuộc HOME nên nhánh trên
  // bỏ sót → rút về «…/2 đoạn cuối» để không bao giờ trả path tuyệt đối ra client
  s = s.replace(/(^|[\s"'(=])\/(?:tmp|private|var)((?:\/[^\s"')]+)+)/g,
    (_m, pre, rest) => pre + "…/" + rest.split("/").filter(Boolean).slice(-2).join("/"))
  /* ── win32 ─────────────────────────────────────────────────────────────────
     Trên Windows KHÔNG một dòng nào ở trên bắt được gì: path là `C:\Users\…`, còn
     `HOME` (homedir()) thường lệch với path thật vì %TEMP% dùng tên 8.3
     (`C:\Users\RUNNER~1\AppData\Local\Temp`) nên cả `startsWith(HOME)` cũng trượt
     ⇒ nhãn workspace và mọi dòng log lọt NGUYÊN đường dẫn tuyệt đối ra client
     (WINDOWS-PORT §9.5). Bốn phép thay dưới đây là bản dịch ĐÚNG THỨ TỰ của ba dòng
     POSIX ở trên, cộng một dòng cho path dạng MSYS (`/c/Users/…`) mà engine chạy
     trong Git-Bash in ra. GATE win32: darwin/linux không chạm một ký tự nào. */
  if (process.platform === "win32") {
    // ① gốc temp — phải đi TRƯỚC vì %TEMP% nằm trong chính thư mục nhà
    s = s.replace(/(^|[\s"'(=])[A-Za-z]:[\\/](?:[^\s"');]*?[\\/])?Temp[\\/]([^\s"');]+)/gi,
      (_m, pre, rest) => pre + "…\\" + rest.split(/[\\/]+/).filter(Boolean).slice(-2).join("\\"))
    // ② thư mục nhà của bất kỳ user nào → ~ (đối xứng với nhánh /Users|/home)
    s = s.replace(/(^|[\s"'(=])[A-Za-z]:[\\/]Users[\\/][^\\/\s"');]+((?:[\\/][^\s"');]+)*)/gi,
      (_m, pre, rest) => pre + "~" + (rest || ""))
    // ③ path dạng MSYS do bash của Git for Windows in ra: /c/Users/<user>/…
    s = s.replace(/(^|[\s"'(=])\/[A-Za-z]\/Users\/[^/\s"');]+((?:\/[^\s"');]+)*)/g,
      (_m, pre, rest) => pre + "~" + (rest || ""))
    // ④ path tuyệt đối còn sót (ổ đĩa khác, UNC) → chỉ giữ 2 đoạn cuối
    s = s.replace(/(^|[\s"'(=])(?:[A-Za-z]:[\\/]|\\\\)([^\s"');]+)/g,
      (_m, pre, rest) => pre + "…\\" + rest.split(/[\\/]+/).filter(Boolean).slice(-2).join("\\"))
  }
  return s
}

/** Che secret trong một dòng text tự do (log codex, message lỗi). */
export function redactLine(line) {
  let s = typeof line === "string" ? line : String(line ?? "")
  for (const [re, rep] of SECRET_PATTERNS) s = s.replace(re, rep)
  return shortenPath(s)
}

/** Quét sâu một object trước khi JSON.stringify ra response. */
export function redactDeep(value, depth = 0) {
  if (depth > 12) return null
  if (typeof value === "string") return redactLine(value)
  if (Array.isArray(value)) return value.map(v => redactDeep(v, depth + 1))
  if (value && typeof value === "object") {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (/^(auth|authorization|token|tokens|api[_-]?key|secret|password|env)$/i.test(k)) continue
      out[k] = redactDeep(v, depth + 1)
    }
    return out
  }
  return value
}

/** Có chứa secret không (dùng cho self-test). Bỏ qua chính nhãn `<redacted…>`
 *  để không tự báo động với chuỗi đã được che. */
export function looksSecret(s) {
  const stripped = String(s).replace(/<redacted[^>]*>/g, "")
  return SECRET_PATTERNS.some(([re]) => { re.lastIndex = 0; return re.test(stripped) })
}
