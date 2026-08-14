import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { IS_WIN, defaultKitgenHome, winSpawnOpts } from "./platform.mjs"

const MANIFEST_URL = process.env.KITGEN_RELEASE_MANIFEST || "https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json"

/** Lệnh cập nhật thủ công — nhãn rút gọn (KHÔNG bao giờ trả đường dẫn tuyệt đối ra web). */
export const UPDATE_COMMAND = IS_WIN
  ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd update"
  : "~/.kitgen/bin/kitgen update"

export function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map(x => /^\d+$/.test(x) ? Number(x) : x)
  const pb = String(b).split(/[.-]/).map(x => /^\d+$/.test(x) ? Number(x) : x)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0
    if (x === y) continue
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1
    return String(x).localeCompare(String(y), undefined, { numeric: true }) < 0 ? -1 : 1
  }
  return 0
}

/**
 * Version của bản ĐANG CHẠY. Hai layout hợp lệ, thử theo thứ tự:
 *   1. runtime đã cài  — `~/.kitgen/current/VERSION` (agent/lib → ../../VERSION);
 *   2. checkout source — `kit-gen/webapp/package.json` (release.json luôn bump cùng nó).
 * Thiếu cả hai mới trả null; khi đó `checkForUpdate` mới lùi về "0.0.0".
 */
export async function readRuntimeVersion() {
  const here = dirname(fileURLToPath(import.meta.url))
  try {
    const v = (await readFile(resolve(here, "../../VERSION"), "utf8")).trim()
    if (v) return v
  } catch { /* không phải runtime đã cài — thử layout source */ }
  try {
    const pkg = JSON.parse(await readFile(resolve(here, "../../webapp/package.json"), "utf8"))
    if (typeof pkg?.version === "string" && pkg.version) return pkg.version
  } catch { /* cũng không phải checkout source */ }
  return null
}

/**
 * So version đang chạy với `release.json` publish trên nhánh phát hành — CÙNG một
 * manifest mà `install.sh` đọc, nên "có bản mới" ở UI và `kitgen update` không bao
 * giờ lệch nhau. Fetch chạy ở AGENT chứ không ở trình duyệt: raw.githubusercontent.com
 * không trả CORS cho origin loopback, và trang tại `/app/` không được phép gọi ra ngoài.
 * Manifest chỉ chứa version/tag/archive — không có gì bí mật để lộ.
 */
export async function checkForUpdate({ currentVersion, fetchImpl = fetch } = {}) {
  const current = currentVersion || await readRuntimeVersion() || "0.0.0"
  const res = await fetchImpl(MANIFEST_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`release manifest returned HTTP ${res.status}`)
  const manifest = await res.json()
  if (!manifest || typeof manifest.version !== "string" || typeof manifest.archive !== "string") throw new Error("invalid release manifest")
  return {
    ok: true,
    currentVersion: current,
    latestVersion: manifest.version,
    tag: typeof manifest.tag === "string" ? manifest.tag : null,
    available: compareVersions(current, manifest.version) < 0,
    updateCommand: UPDATE_COMMAND,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Bọc `checkForUpdate` cho tầng HTTP: mất mạng KHÔNG phải lỗi 500 của agent local.
 * Trả 200 + `ok:false` để UI phân biệt được "chưa kiểm tra được" với "đang mới nhất",
 * và vẫn hiện được lệnh cập nhật thủ công. `reason` là ENUM, không phải chuỗi lỗi thô
 * của Node (nó có thể chứa host/đường dẫn).
 */
export async function checkForUpdateSafe(opts = {}) {
  try {
    return await checkForUpdate(opts)
  } catch (err) {
    const offline = err?.name === "TimeoutError" || err?.name === "AbortError" || err?.name === "TypeError"
    return {
      ok: false,
      currentVersion: opts.currentVersion || await readRuntimeVersion() || "0.0.0",
      latestVersion: null,
      tag: null,
      available: false,
      reason: offline ? "OFFLINE" : "MANIFEST_UNREADABLE",
      updateCommand: UPDATE_COMMAND,
      checkedAt: new Date().toISOString(),
    }
  }
}

/** Respond first, then let the service installer replace and restart this process. */
export function scheduleUpdate({ kitgenHome = defaultKitgenHome() } = {}) {
  if (IS_WIN) {
    // Không có `sh` trên Windows. cmd.exe tách hẳn khỏi tiến trình agent (nó sắp bị
    // installer thay và khởi động lại), `timeout` là bản Windows của `sleep 1`.
    const cmd = join(kitgenHome, "bin", "kitgen.cmd")
    const child = spawn(process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `timeout /t 1 /nobreak >nul & "${cmd}" update`],
      { detached: true, stdio: "ignore", env: process.env, ...winSpawnOpts() })
    child.unref()
    return
  }
  const cmd = join(kitgenHome, "bin", "kitgen")
  const child = spawn("sh", ["-c", "sleep 1; exec \"$1\" update", "kitgen-update", cmd], {
    detached: true, stdio: "ignore", env: process.env,
  })
  child.unref()
}
