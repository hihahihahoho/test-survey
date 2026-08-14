/* ════════════════════════════════════════════════════════════════════════════
   platform.mjs — LỚP ĐỆM WINDOWS (EXPERIMENTAL, chưa chạy thử trên máy Win).

   HỢP ĐỒNG BẤT DI BẤT DỊCH CỦA FILE NÀY:
     Trên darwin/linux MỌI hàm ở đây phải trả về ĐÚNG thứ mà mã cũ đã hard-code
     ("bash", "python3", process.kill(-pid, sig), {} cho options). Không một nhánh
     nào được đổi hành vi ngoài `process.platform === "win32"`. Nếu đời sau sửa file
     này, kiểm lại bằng `node agent/test-agent.mjs` (phải xanh 100% trên macOS).

   VÌ SAO CẦN:
     · engine là gen.sh / cover.sh (bash) + slice.py (python3) — Windows không có
       sẵn thứ nào. Bash lấy từ Git for Windows (bundled), python từ python.org.
     · Node spawn KHÔNG dùng shell nên không chạy được `.cmd` (Node ≥18.20 chặn hẳn
       để vá CVE-2024-27980) ⇒ npm-bin của codex trên Windows cần shell: true.
     · Không có process group POSIX ⇒ `process.kill(-pid)` vô nghĩa; phải taskkill /T.
   ════════════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"

export const IS_WIN = process.platform === "win32"

/* ── 1. Đường dẫn ────────────────────────────────────────────────────────── */

/**
 * Đường dẫn Windows → dạng MSYS mà bash của Git for Windows hiểu.
 *   C:\Users\a\gen.sh → /c/Users/a/gen.sh
 * BẮT BUỘC: gen.sh chạy `cd "$(dirname "$0")"`. Với `$0 = C:\...\gen.sh` thì
 * `dirname` trả "." (không có dấu "/" nào) ⇒ engine sẽ neo sai thư mục.
 * Trên non-win đây là hàm đồng nhất.
 */
export function toBashPath(p) {
  if (!IS_WIN) return String(p)
  let s = String(p).replace(/\\/g, "/")
  const m = /^([A-Za-z]):\//.exec(s)
  if (m) s = "/" + m[1].toLowerCase() + "/" + s.slice(m[0].length)
  return s
}

/* ── 2. Bash (Git for Windows) ───────────────────────────────────────────── */

/** Vị trí bash.exe theo thứ tự ưu tiên. KITGEN_BASH do installer ghi ra config. */
function bashCandidates() {
  const out = []
  if (process.env.KITGEN_BASH) out.push(process.env.KITGEN_BASH)
  const bases = [
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : null,
  ]
  for (const b of bases) if (b) out.push(join(b, "Git", "bin", "bash.exe"))
  out.push("C:\\Program Files\\Git\\bin\\bash.exe")
  return out
}

let bashCache
/** bash.exe tuyệt đối, hoặc null nếu máy chưa cài Git for Windows. */
export function findBash() {
  if (!IS_WIN) return "bash"
  if (bashCache !== undefined) return bashCache
  bashCache = null
  for (const p of bashCandidates()) {
    try { if (existsSync(p)) { bashCache = p; break } } catch { /* ổ đĩa lỗi */ }
  }
  return bashCache
}

/**
 * PATH cho tiến trình bash con.
 * Git for Windows để bash.exe ở <Git>\bin nhưng coreutils (grep, sed, date, du,
 * cp, wc, tail…) ở <Git>\usr\bin — thứ KHÔNG có trong PATH của Windows. Chạy
 * bash.exe với PATH nguyên bản là gen.sh chết ngay dòng `date +%s`.
 * Thêm cả <KITGEN_HOME>\bin để shim `python3` (installer sinh ra) được thấy.
 */
function bashEnvPath(bashExe) {
  const gitRoot = dirname(dirname(bashExe))
  const home = process.env.KITGEN_HOME || null
  const dirs = [
    // shim `python3` do installer sinh (Windows không có lệnh tên python3)
    home ? join(home, "bin") : null,
    // gen.sh dòng 19 gọi `node render-skeleton.mjs`
    home ? join(home, "tools", "node") : null,
    // gen.sh/cover.sh gọi `codex` — npm sinh script không đuôi ở .bin, bash chạy được
    home ? join(home, "tools", "node_modules", ".bin") : null,
    process.env.KITGEN_CODEX_BIN ? dirname(process.env.KITGEN_CODEX_BIN) : null,
    // coreutils (grep/sed/date/du/cp/wc/tail) — KHÔNG nằm trong PATH của Windows
    join(gitRoot, "usr", "bin"),
    join(gitRoot, "mingw64", "bin"),
    join(gitRoot, "bin"),
  ].filter(Boolean)
  return dirs.join(";") + ";" + (process.env.PATH ?? "")
}

/**
 * Lệnh chạy một script bash. `paths` là CÁC ĐƯỜNG DẪN (script + tham số path).
 * @returns {{cmd:string, args:string[], env:Object}} env rỗng trên non-win.
 * Không tìm thấy bash.exe → vẫn trả "bash" để spawn ném ENOENT và đi vào nhánh
 * `child.on("error")` sẵn có (báo lỗi cho người dùng, không làm sập agent).
 */
export function bashCommand(paths) {
  if (!IS_WIN) return { cmd: "bash", args: paths, env: {} }
  const bash = findBash()
  if (!bash) return { cmd: "bash", args: paths, env: {} }
  return { cmd: bash, args: paths.map(toBashPath), env: { PATH: bashEnvPath(bash) } }
}

/* ── 3. Python ───────────────────────────────────────────────────────────── */

/**
 * Windows KHÔNG có lệnh `python3` (python.org cài `python.exe` + launcher `py`).
 * Installer ghi KITGEN_PYTHON = đường dẫn tuyệt đối tới python.exe của venv.
 */
export function pythonCommand(args = []) {
  if (!IS_WIN) return { cmd: "python3", args }
  return { cmd: process.env.KITGEN_PYTHON || "python", args }
}

/* ── 4. spawn/exec options ───────────────────────────────────────────────── */

/** Cửa sổ console đen nhấp nháy mỗi lần spawn là lỗi UX trên Windows. */
export function winSpawnOpts() {
  return IS_WIN ? { windowsHide: true } : {}
}

/**
 * npm trên Windows sinh bin dạng `codex.cmd`. Node ≥18.20 TỪ CHỐI spawn .cmd/.bat
 * khi không có shell (vá CVE-2024-27980) ⇒ phải bật shell cho đúng những file đó.
 * Chỉ dùng cho lệnh + tham số do CHÍNH AGENT dựng, không bao giờ từ client.
 */
export function winShellOpts(cmd) {
  return IS_WIN && /\.(cmd|bat)$/i.test(String(cmd)) ? { shell: true, windowsHide: true } : {}
}

/* ── 5. Giết cả cây tiến trình ───────────────────────────────────────────── */

/**
 * POSIX: y hệt mã cũ — `process.kill(-pid, sig)` rồi rơi về `child.kill(sig)`.
 * Windows: không có process group ⇒ `taskkill /PID <pid> /T` (thêm /F cho SIGKILL).
 * Bắt buộc phải /T: codex là tiến trình CHÁU của bash, giết mỗi bash thì codex
 * vẫn chạy tiếp và vẫn đốt quota sau khi người dùng đã bấm Dừng.
 */
export function killTree(child, sig = "SIGTERM") {
  if (!child?.pid) return
  if (IS_WIN) {
    const args = ["/PID", String(child.pid), "/T"]
    if (sig === "SIGKILL") args.push("/F")
    try {
      const t = spawn("taskkill", args, { stdio: "ignore", windowsHide: true })
      t.on("error", () => { try { child.kill() } catch { /* đã chết */ } })
      t.unref()
    } catch { try { child.kill() } catch { /* đã chết */ } }
    return
  }
  try { process.kill(-child.pid, sig) } catch { try { child.kill(sig) } catch { /* đã chết */ } }
}

/* ── 6. Thư mục cài đặt ──────────────────────────────────────────────────── */

/** ~/.kitgen trên Unix; %LOCALAPPDATA%\KitGen trên Windows (chuẩn per-user app data). */
export function defaultKitgenHome() {
  if (process.env.KITGEN_HOME) return process.env.KITGEN_HOME
  if (IS_WIN) return join(process.env.LOCALAPPDATA || process.env.USERPROFILE || "", "KitGen")
  return join(process.env.HOME || "", ".kitgen")
}
