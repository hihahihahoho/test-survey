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
import { tmpdir } from "node:os"
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

/* Bộ env duy nhất cho MỌI bash.exe trên Windows.
   Git Bash không tự dựng /tmp khi được spawn từ Node/cmd với env thô. Temp path
   phải là dạng MSYS; PATH cũng phải dùng ':' và có đủ coreutils của Git. */
function msysPathList(value, bashExe) {
  if (!IS_WIN) return String(value ?? "")
  const entries = String(value ?? "").split(";").filter(Boolean)
  if (bashExe && /^[A-Za-z]:[\\/]/.test(bashExe)) {
    const gitRoot = dirname(dirname(bashExe))
    const gitDirs = [join(gitRoot, "usr", "bin"), join(gitRoot, "mingw64", "bin"), join(gitRoot, "bin")]
    entries.splice(entries.length ? 1 : 0, 0, ...gitDirs)
  }
  return entries.map(toBashPath).join(":")
}

export function bashEnv(env = {}, bashExe = null) {
  if (!IS_WIN) return env
  const out = { ...env }
  for (const key of [
    "HOME", "KITGEN_HOME", "KITGEN_WORKSPACE", "KITGEN_UPDATE_LOCK", "KITGEN_UPDATE_TXN",
    "FAKE_LAUNCHCTL_STATE",
  ]) {
    if (out[key]) out[key] = toBashPath(out[key])
  }
  /* `/tmp` is not reliable in a bash.exe started by cmd.exe. Prefer an inherited
     Windows temp dir; fall back to Node's known-valid temp dir. */
  const rawTemp = [out.TEMP, out.TMP, out.TMPDIR]
    .map(value => String(value ?? "").trim())
    .find(value => value && !/^\/tmp(?:\/|$)/i.test(value)) || tmpdir()
  const temp = toBashPath(rawTemp)
  out.TMPDIR = temp
  out.TMP = temp
  out.TEMP = temp
  out.PATH = msysPathList(out.PATH, bashExe)
  out.MSYS = "winsymlinks:nativestrict"
  return out
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
  return { cmd: bash, args: paths.map(toBashPath), env: bashEnv({ ...process.env, PATH: bashEnvPath(bash) }, bash) }
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

/**
 * Biến môi trường BẮT BUỘC cho mọi tiến trình Python trên Windows. Rỗng trên non-win.
 *
 * `open(path)` của Python KHÔNG mặc định UTF-8: nó dùng bảng mã của locale, mà locale
 * mặc định của Windows tiếng Việt/Anh là CP1252/CP1258. `styles.json`, `contract.json`,
 * `manifest.json` đều là UTF-8 và đều có tiếng Việt ⇒ `json.load(open(...))` nổ ngay:
 *     UnicodeDecodeError: 'charmap' codec can't decode byte 0x8f in position 627
 * Chiều ngược lại cũng hỏng: `print("→ kits/manifest.json")` ra stdout CP1252 =
 * UnicodeEncodeError. ĐÃ ĐO ĐƯỢC trên runner (run 31793695016, job 4): mọi ca có
 * spawn engine đều đỏ chỉ vì dòng `json.load(open('styles.json'))` trong engine.
 *
 * `PYTHONUTF8=1` (UTF-8 Mode, Python 3.7+) đổi mặc định của `open()` VÀ của stdio sang
 * UTF-8 cho CẢ tiến trình — vá được cả `slice.py`, `skeleton.py` lẫn mọi heredoc python
 * trong gen.sh/cover.sh mà không phải sửa từng lời gọi `open()`. `PYTHONIOENCODING`
 * chốt thêm phần stdio phòng khi UTF-8 Mode bị tắt bằng `-X utf8=0`.
 *
 * Đây là LỚP CHẮN, không phải lời bào chữa: `slice.py` vẫn nên ghi rõ `encoding="utf-8"`
 * ở từng lời gọi `open()` (WINDOWS-PORT §4.4) cho người chạy tay ngoài agent.
 */
export function pythonEnv() {
  return IS_WIN ? { PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } : {}
}

/**
 * Options cho `spawn` một tiến trình Python: winSpawnOpts + môi trường UTF-8.
 * Trên darwin/linux trả `{}` — ĐÚNG thứ mà `...winSpawnOpts()` trả trước đây, nên chỗ
 * gọi không đổi một chút hành vi nào ngoài win32.
 */
export function pythonSpawnOpts() {
  if (!IS_WIN) return {}
  return { ...winSpawnOpts(), env: { ...process.env, ...pythonEnv() } }
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
/**
 * Tham số cho `taskkill`. LUÔN có cả /T và /F, kể cả khi được xin SIGTERM "nhẹ nhàng".
 *
 * VÌ SAO KHÔNG CÓ BẢN NHẸ NHÀNG TRÊN WINDOWS: `taskkill` không kèm /F chỉ POST WM_CLOSE
 * tới cửa sổ của tiến trình. Tiến trình CONSOLE (bash.exe, python.exe, codex, sleep)
 * KHÔNG có cửa sổ và KHÔNG có vòng lặp thông điệp ⇒ taskkill in ra "SUCCESS: Sent
 * termination signal" rồi… không có gì xảy ra cả. Người dùng bấm Dừng, agent báo đã
 * dừng, mà engine vẫn chạy tiếp và vẫn đốt quota — đúng cái mà /T sinh ra để tránh.
 * ĐÃ ĐO ĐƯỢC trên runner (run 31793695016): ba ca dừng-run/xoá-project-khi-đang-chạy
 * đều hết giờ vì lượt chạy không bao giờ chuyển sang "cancelled".
 *
 * Thêm /F cũng KHÔNG hề mạnh tay hơn mã cũ: `child.kill("SIGTERM")` của Node trên
 * Windows vốn đã gọi thẳng TerminateProcess — Windows không có tín hiệu để mà lịch sự.
 * Bản không /F mới là bản YẾU HƠN mã cũ, và đó chính là lỗi.
 * (`sig` giữ lại trong chữ ký cho khớp POSIX; trên Windows nó không đổi được gì.)
 */
export function taskkillArgs(pid, sig = "SIGTERM") {
  void sig
  return ["/PID", String(pid), "/T", "/F"]
}

export function killTree(child, sig = "SIGTERM") {
  if (!child?.pid) return
  if (IS_WIN) {
    const args = taskkillArgs(child.pid, sig)
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
