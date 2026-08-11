/* paths.mjs — sandbox đường dẫn. KHÔNG DÙNG REGEX để chống traversal
   (bài học studio-server.mjs dòng 62: `/^refs\//` thua symlink và thua ../).
   Cách đúng: path.resolve → so prefix theo TỪNG ĐOẠN → realpath cả đích và
   tổ tiên gần nhất đang tồn tại → so prefix lại lần nữa (chặn symlink trỏ ra ngoài). */
import { realpathSync } from "node:fs"
import { isAbsolute, resolve, sep, dirname, normalize } from "node:path"
import { fail } from "./errors.mjs"

/** So prefix THỰC SỰ theo ranh giới đoạn, không phải startsWith chuỗi thô
 *  (nếu không thì `/ws-evil` sẽ lọt khi base là `/ws`). */
export function isInside(base, target) {
  const b = resolve(base), t = resolve(target)
  if (t === b) return true
  return t.startsWith(b.endsWith(sep) ? b : b + sep)
}

/** realpath của tổ tiên tồn tại gần nhất + phần đuôi chưa tồn tại. */
function realpathBestEffort(p) {
  let cur = resolve(p)
  const tail = []
  for (;;) {
    try { return resolve(realpathSync(cur), ...[...tail].reverse()) }
    catch {
      const parent = dirname(cur)
      if (parent === cur) return resolve(p)   // tới root mà vẫn không có → dùng nguyên
      tail.push(cur.slice(parent.length + 1))
      cur = parent
    }
  }
}

/**
 * Giải một đường dẫn TƯƠNG ĐỐI do client gửi, trong phạm vi `base`.
 * Chặn: `..`, đường dẫn tuyệt đối, `%2e%2e` (đã decode trước khi vào đây),
 * NUL byte, và symlink trỏ ra ngoài base.
 * @returns đường dẫn tuyệt đối đã realpath, chắc chắn nằm trong base.
 */
export function safeJoin(base, relRaw, { allowRoot = true } = {}) {
  const baseReal = realpathBestEffort(base)
  let rel = String(relRaw ?? "")
  if (rel.includes("\0")) fail("PATH_ESCAPE", "path contains NUL byte")
  // client tuyệt đối không được gửi path tuyệt đối
  if (isAbsolute(rel)) fail("PATH_ESCAPE", "absolute path is not accepted")
  rel = rel.replace(/^\/+/, "")
  if (!rel || rel === ".") {
    if (!allowRoot) fail("PATH_ESCAPE", "empty relative path")
    return baseReal
  }
  // kiểm từng đoạn: bất kỳ `..` nào là từ chối thẳng (không "làm sạch" âm thầm)
  for (const seg of normalize(rel).split(/[\\/]+/)) {
    if (seg === "..") fail("PATH_ESCAPE", "parent traversal is not accepted")
  }
  const joined = resolve(baseReal, rel)
  if (!isInside(baseReal, joined)) fail("PATH_ESCAPE", "resolved path escapes base")
  const real = realpathBestEffort(joined)
  if (!isInside(baseReal, real)) fail("PATH_ESCAPE", "symlink escapes base")
  return real
}

/** Tên một đoạn (project id, ref name, snapshot, runId, job): không có separator. */
export function safeSegment(name, what = "name") {
  const s = String(name ?? "")
  if (!s || s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0"))
    fail("BAD_REQUEST", `invalid ${what}`)
  return s
}

/** ID project / variant / sheet: allowlist ký tự (đây là VALIDATE, không phải chống traversal). */
export const RE_PROJECT_ID = /^[a-z0-9][a-z0-9-]{2,47}$/
export const RE_SLUG = /^[a-z0-9][a-z0-9-]{2,47}$/
export const RE_SHEET_ID = /^[a-z0-9-]{2,32}$/
export const RE_VARIANT_ID = /^[a-z0-9-]{2,24}$/
export const RE_COMPONENT_FILE = /^[0-9]{2}-[a-z0-9-]+$/
export const RE_DOC_ID = /^f-[a-z0-9-]{2,32}$/
export const RE_RUN_ID = /^r-[0-9]{4,8}$/
export const RE_JOB = /^[a-z0-9-]{2,24}-[a-z0-9-]{2,32}$/
export const RE_TRASH_ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9-]{3,48}$/
export const RE_SNAPSHOT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z$/

export function assertMatch(re, value, code, what) {
  if (!re.test(String(value ?? ""))) fail(code, `invalid ${what}: ${JSON.stringify(String(value ?? "").slice(0, 64))}`)
  return String(value)
}
