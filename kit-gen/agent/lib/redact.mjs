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
