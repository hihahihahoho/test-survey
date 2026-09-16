/* ════════════════════════════════════════════════════════════════════════════
   platform.mjs — LỚP ĐỆM WINDOWS (EXPERIMENTAL, chưa chạy thử trên máy Win).

   HỢP ĐỒNG BẤT DI BẤT DỊCH CỦA FILE NÀY:
     Trên darwin/linux MỌI hàm ở đây phải trả về ĐÚNG thứ mà mã cũ đã hard-code
     ("bash", process.kill(-pid, sig), {} cho options). Không một nhánh nào được đổi
     hành vi ngoài `process.platform === "win32"`. Nếu đời sau sửa file này, kiểm lại
     bằng `node agent/test-agent.mjs` (phải xanh 100% trên macOS).

   ╔══ BƯỚC ④, 16/09/2026: NỬA FILE NÀY ĐÃ BIẾN MẤT ════════════════════════════╗
   ║ ĐÃ BỎ: `bashCommand` · `bashEnvPath` · `pythonCommand` · `pythonEnv` ·      ║
   ║ `pythonSpawnOpts`. Chúng tồn tại vì MỘT lý do duy nhất: engine là `gen.sh`  ║
   ║ (bash) + `slice.py` (python3), mà Windows không có sẵn thứ nào — nên agent  ║
   ║ phải đi tìm `bash.exe` của Git for Windows, dựng lại PATH cho coreutils, và ║
   ║ bơm `PYTHONUTF8=1` để `open()` của Python đừng đọc styles.json bằng CP1252. ║
   ║ Engine nay là JS và chạy bằng `process.execPath` — không PATH, không shell, ║
   ║ không bảng mã locale. Cả họ bug ấy không còn cửa nào để quay lại.           ║
   ║                                                                             ║
   ║ CÒN LẠI phần bash, và CHỈ CHO ĐÚNG MỘT VIỆC: `findBash` / `bashEnv` /       ║
   ║ `toBashPath` phục vụ BỘ CÀI (`lib/update.mjs` chạy `install.sh` đã tải về,  ║
   ║ và `test/suite-update-cure.mjs` canh nó). Đó là địa hạt của installer —      ║
   ║ bước ⑤ xử lý cùng lúc với việc xoá `gen.sh`/`slice.py` khỏi repo.           ║
   ╚═════════════════════════════════════════════════════════════════════════════╝

   VÌ SAO PHẦN CÒN LẠI VẪN CẦN:
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
 *   C:\Users\a\install.sh → /c/Users/a/install.sh
 * BẮT BUỘC cho bộ cài: script chạy `cd "$(dirname "$0")"`, mà với
 * `$0 = C:\...\install.sh` thì `dirname` trả "." (không có dấu "/" nào) ⇒ nó neo
 * sai thư mục. Trên non-win đây là hàm đồng nhất.
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

/* ── 3. Python: KHÔNG CÒN GÌ Ở ĐÂY ───────────────────────────────────────────
   `pythonCommand` / `pythonEnv` / `pythonSpawnOpts` đã bỏ ở bước ④ cùng `slice.py`
   và khối Pillow của thumbnail. Ba đường từng gọi chúng nay gọi `process.execPath`:
     · `lib/engine.mjs::buildCommand("slice")`      → `cli.mjs slice`
     · `lib/run-handle.mjs::validateGeometry`       → `cli.mjs validate`
     · `lib/thumbs.mjs`                             → `cli.mjs thumb`
   và `lib/doctor.mjs` thôi dò python/Pillow hoàn toàn. KHÔNG khôi phục chúng để
   "chạy tạm một script python": mỗi lời gọi như thế là một lần nữa bắt người dùng
   phải có python trên máy — đúng thứ cả bước ①-④ vừa gỡ ra. */

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
 * Bắt buộc phải /T: codex là tiến trình CHÁU (con của engine), giết mỗi engine thì
 * codex vẫn chạy tiếp và vẫn đốt quota sau khi người dùng đã bấm Dừng.
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
