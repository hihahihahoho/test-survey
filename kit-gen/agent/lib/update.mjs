import { spawn } from "node:child_process"
import { appendFileSync, closeSync, openSync, readFileSync, statSync, writeFileSync, writeSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { IS_WIN, defaultKitgenHome, winSpawnOpts } from "./platform.mjs"

const MANIFEST_URL = process.env.KITGEN_RELEASE_MANIFEST || "https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json"

/** Lệnh cập nhật thủ công — nhãn rút gọn (KHÔNG bao giờ trả đường dẫn tuyệt đối ra web). */
export const UPDATE_COMMAND = IS_WIN
  ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd update"
  : "~/.kitgen/bin/kitgen update"

/** Lệnh khởi động lại thủ công — câu trả lời cho ca `restartRequired`. Cùng luật nhãn. */
export const RESTART_COMMAND = IS_WIN
  ? "%LOCALAPPDATA%\\KitGen\\bin\\kitgen.cmd restart"
  : "~/.kitgen/bin/kitgen restart"

/** Nhật ký của lượt update do UI bấm — nhãn rút gọn, để câu báo lỗi chỉ được đúng chỗ. */
export const UPDATE_LOG_LABEL = IS_WIN ? "%LOCALAPPDATA%\\KitGen\\update.log" : "~/.kitgen/update.log"

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
 * Version của bản ĐÃ CÀI trên đĩa — đi qua symlink `~/.kitgen/current`, KHÁC với bản
 * đang chạy trong tiến trình này (`readRuntimeVersion` đọc VERSION cạnh chính module,
 * tức bản mà tiến trình này được nạp lên từ đó).
 *
 * Hai số này chỉ lệch nhau trong ĐÚNG MỘT tình huống, và đó là tình huống đã cắn máy
 * chủ SP ngày 14/08: installer đã đổi symlink nhưng bước khởi động lại không xảy ra.
 */
export async function readInstalledVersion({ kitgenHome = defaultKitgenHome() } = {}) {
  try {
    const v = (await readFile(join(kitgenHome, "current", "VERSION"), "utf8")).trim()
    return v || null
  } catch { return null }
}

/**
 * "Bản mới đã nằm trên đĩa mà tiến trình này vẫn là bản cũ?" — trạng thái nửa vời mà
 * trước đây KHÔNG AI phát hiện được: /health vẫn 200, /api/update vẫn báo "có bản mới",
 * người dùng đọc thành "cập nhật hỏng" và cài lại vô ích.
 *
 * Lưu ý cho người chạy từ checkout source: `currentVersion` khi đó là version trong
 * webapp/package.json, nên một máy dev có ~/.kitgen mới hơn repo sẽ thấy
 * `restartRequired:true`. Vô hại (chỉ là một câu gợi ý) và đúng về mặt chữ nghĩa —
 * bản đã cài đúng là mới hơn tiến trình đang phục vụ.
 */
export async function restartState({ currentVersion = null, kitgenHome = defaultKitgenHome() } = {}) {
  const running = currentVersion || await readRuntimeVersion()
  const installedVersion = await readInstalledVersion({ kitgenHome })
  return {
    installedVersion,
    restartRequired: Boolean(running && installedVersion && compareVersions(installedVersion, running) > 0),
    restartCommand: RESTART_COMMAND,
  }
}

/**
 * "CÓ BẢN MỚI" PHẢI KÈM "TẢI VỀ ĐƯỢC" — sự cố 14/08 14:28 (BACKLOG #23).
 *
 * `release.json` nằm TRONG REPO trên nhánh phát hành, còn tarball chỉ tồn tại sau khi
 * workflow `kitgen-release.yml` chạy xong (~10-15 phút). Ai push nhánh trước khi CI xanh
 * (hoặc push cùng lúc với tag) mở ra một cửa sổ mà manifest đã khai version mới còn
 * GitHub Releases thì chưa có file: UI mời cập nhật → installer `curl` 404 → chết ở bước
 * tải, người dùng đọc thành "cập nhật hỏng". Đúng cái đã xảy ra 14/08.
 *
 * Nên trước khi CHÀO một bản mới, hỏi thẳng chỗ sẽ tải về: file có đó không.
 *
 * FAIL-OPEN CÓ CHỦ ĐÍCH: chỉ 403/404/410 — bằng chứng DỨT KHOÁT là asset chưa tồn tại —
 * mới chặn lời chào. Mọi thứ khác (5xx, 429, 405 vì proxy chặn HEAD, timeout, DNS) đều
 * coi như "có" và vẫn chào: một proxy công ty ghét HEAD không được phép giấu bản vá của
 * cả đội mãi mãi, và ở ca đó installer vẫn còn lớp 2 để báo lỗi cho tử tế.
 */
const ARCHIVE_MISSING = new Set([403, 404, 410])

export async function archiveReady(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  try {
    const res = await fetchImpl(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) })
    return !ARCHIVE_MISSING.has(res.status)
  } catch {
    return true
  }
}

/**
 * So version đang chạy với `release.json` publish trên nhánh phát hành — CÙNG một
 * manifest mà `install.sh` đọc, nên "có bản mới" ở UI và `kitgen update` không bao
 * giờ lệch nhau. Fetch chạy ở AGENT chứ không ở trình duyệt: raw.githubusercontent.com
 * không trả CORS cho origin loopback, và trang tại `/app/` không được phép gọi ra ngoài.
 * Manifest chỉ chứa version/tag/archive — không có gì bí mật để lộ.
 *
 * Request HEAD kiểm tarball chỉ bắn khi manifest THẬT SỰ mới hơn bản đang chạy — tức là
 * gần như không bao giờ trong nhịp poll 30 phút của webapp, và không thêm một đường gọi
 * mạng nào từ trình duyệt (web vẫn chỉ biết mỗi `GET /api/update`).
 *
 * `reason: "ARCHIVE_PENDING"` đi kèm `ok:true` (KHÁC hai reason còn lại, vốn chỉ có ở
 * `ok:false`): manifest đọc được và hợp lệ, chỉ là bản nó khai chưa tải về được.
 */
export async function checkForUpdate({ currentVersion, fetchImpl = fetch, kitgenHome, verifyArchive = archiveReady } = {}) {
  const current = currentVersion || await readRuntimeVersion() || "0.0.0"
  const restart = await restartState({ currentVersion: current, kitgenHome })
  const res = await fetchImpl(MANIFEST_URL, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`release manifest returned HTTP ${res.status}`)
  const manifest = await res.json()
  if (!manifest || typeof manifest.version !== "string" || typeof manifest.archive !== "string") throw new Error("invalid release manifest")
  const newer = compareVersions(current, manifest.version) < 0
  const ready = newer ? await verifyArchive(manifest.archive, { fetchImpl }) : true
  return {
    ok: true,
    currentVersion: current,
    latestVersion: manifest.version,
    tag: typeof manifest.tag === "string" ? manifest.tag : null,
    available: newer && ready,
    ...(newer && !ready ? { reason: "ARCHIVE_PENDING" } : {}),
    updateCommand: UPDATE_COMMAND,
    ...restart,
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
    const current = opts.currentVersion || await readRuntimeVersion() || "0.0.0"
    return {
      ok: false,
      currentVersion: current,
      latestVersion: null,
      tag: null,
      available: false,
      reason: offline ? "OFFLINE" : "MANIFEST_UNREADABLE",
      updateCommand: UPDATE_COMMAND,
      /* Mất mạng KHÔNG che được ca "cài xong chưa restart": số này đọc từ đĩa, không
         phụ thuộc manifest. Đây đúng là lúc cần nó nhất — bản mới vừa cài xong thì
         máy hay đang ở giữa lúc agent chưa lên lại. */
      ...await restartState({ currentVersion: current, kitgenHome: opts.kitgenHome }),
      checkedAt: new Date().toISOString(),
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TRẦN KÍCH THƯỚC CHO update.log — cái giá phải trả khi bỏ `open(w)`.

   `open(w)` giữ file bé bằng cách xoá bằng chứng, và đó chính là thứ đã làm hỏng buổi
   điều tra ngày 14/08 (lượt hỏng bị lượt chữa nó ghi đè). Nay cộng dồn, nên phải có
   người dọn: giữ ~128KB CUỐI (vài chục lượt update — thừa sức cho mọi cuộc điều tra),
   cắt phần đầu khi vượt 512KB. Cắt ở đầu chứ không cuối: lượt gần đây mới là lượt cần đọc.
   ═══════════════════════════════════════════════════════════════════════════════ */
export const UPDATE_LOG_MAX_BYTES = 512 * 1024
export const UPDATE_LOG_KEEP_BYTES = 128 * 1024

/** `true` nếu đã cắt. Mọi lỗi đều nuốt: dọn nhật ký KHÔNG được phép chặn một lượt cập nhật. */
export function trimUpdateLog(logFile, { maxBytes = UPDATE_LOG_MAX_BYTES, keepBytes = UPDATE_LOG_KEEP_BYTES } = {}) {
  try {
    if (statSync(logFile).size <= maxBytes) return false
    const buf = readFileSync(logFile)
    const tail = buf.subarray(Math.max(0, buf.length - keepBytes))
    // Bỏ nốt nửa dòng bị cắt đôi ở đầu, để file luôn bắt đầu bằng một dòng nguyên vẹn.
    const nl = tail.indexOf(0x0a)
    const body = nl >= 0 ? tail.subarray(nl + 1) : tail
    writeFileSync(logFile, Buffer.concat([
      Buffer.from(`[đã cắt bớt phần đầu — giữ khoảng ${Math.round(keepBytes / 1024)}KB gần nhất]\n`),
      body,
    ]))
    return true
  } catch { return false }
}

/**
 * Trả lời trước, rồi để installer thay và khởi động lại chính tiến trình này.
 *
 * BA THỨ Ở ĐÂY KHÔNG ĐƯỢC ĐỘNG VÀO, MỖI THỨ MỘT LÝ DO ĐÃ TRẢ GIÁ:
 *
 *  ① `detached: true` — installer PHẢI ở một session khác. Nó sắp `launchctl bootout` /
 *    `kickstart -k` chính cái job đang chứa tiến trình agent này; nếu nó còn nằm trong
 *    session/process-group của job thì nó tự giết mình ngay giữa bước cài. `setsid` là
 *    thứ duy nhất tách được. (Lớp phòng thủ thứ hai: plist có `KeepAlive=true`, nên kể
 *    cả khi cả hai cùng chết, launchd vẫn kéo agent dậy — nhưng dậy với bản CŨ.)
 *
 *  ② `stdio` phải ĐI VÀO FILE. Trước 2.1.21 chỗ này là `stdio: "ignore"` và đó là lý do
 *    sự cố 14/08 không để lại một dòng nào: installer chết ở giữa, output rơi vào
 *    /dev/null, `agent.log` (stdout của launchd job) đương nhiên không có gì vì
 *    installer đâu có ghi vào đó. "Không có dấu vết" bị đọc nhầm thành "không có ai
 *    thử restart". Mở bằng "a" (KHÔNG phải "w" như 2.1.21–2.1.24, xem `trimUpdateLog`):
 *    lượt sau không được xoá vết của lượt trước.
 *
 *  ③ Phải có listener `error`. spawn hỏng (thiếu `sh`, bin/kitgen không +x) phát ra
 *    'error' bất đồng bộ; ChildProcess không ai nghe là ném lỗi không bắt được ⇒ agent
 *    chết ngay sau khi vừa trả 202 "đang cập nhật".
 *
 *  ④ PHẢI ĐÓNG fd sau khi spawn — bản trước KHÔNG đóng, và trên Windows đó là lỗi thật:
 *    `spawn` đã nhân bản handle cho tiến trình con, nhưng bản của tiến trình cha thì mở
 *    mãi mãi. Windows KHÔNG cho xoá/đổi tên file đang có handle mở, nên `update.log` bị
 *    chính agent khoá: installer không ghi đè được, và mọi lệnh xoá cây thư mục chứa nó
 *    trả `ENOTEMPTY`. Đây đúng là thứ đã làm bộ ca chết trên runner Windows lần đầu
 *    (`rmdir 'ạ…\kitgen-home-spawn'`, run 31784778492) — trên macOS thì unlink file đang
 *    mở là chuyện thường nên không ai thấy. Câu báo lỗi ở ③ vì thế ghi bằng ĐƯỜNG DẪN
 *    (`appendFileSync`) chứ không qua fd nữa, để vẫn giữ nguyên lời hứa của ②/③.
 */
export function scheduleUpdate({ kitgenHome = defaultKitgenHome(), spawnImpl = spawn } = {}) {
  const logFile = join(kitgenHome, "update.log")
  let out = "ignore"
  try {
    trimUpdateLog(logFile)
    /* "a" CHỨ KHÔNG PHẢI "w" — lượt sau KHÔNG được xoá vết của lượt trước.
       Ngày 14/08 người dùng bấm [Cập nhật] hai lần: lượt 1 hỏng, lượt 2 xong. Khi đi tìm
       nguyên nhân thì update.log chỉ còn ĐÚNG lượt 2 (thành công) — bằng chứng của lượt
       hỏng bị chính lượt chữa nó xoá mất, và cả buổi điều tra phải đoán. Nhật ký của một
       thao tác lặp lại được thì phải cộng dồn; giới hạn kích thước là việc của
       `trimUpdateLog`, không phải của `open(w)`. */
    const fd = openSync(logFile, "a")
    writeSync(fd, `\n${"═".repeat(72)}\n[${new Date().toISOString()}] kitgen update (do UI yêu cầu)\n`)
    out = fd
  } catch { /* ổ đĩa chỉ đọc / thiếu quyền: mất nhật ký chứ không được mất bản cập nhật */ }

  const child = IS_WIN
    // Không có `sh` trên Windows. cmd.exe tách hẳn khỏi tiến trình agent, `timeout` là
    // bản Windows của `sleep 1`.
    ? spawnImpl(process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `timeout /t 1 /nobreak >nul & "${join(kitgenHome, "bin", "kitgen.cmd")}" update`],
      { detached: true, stdio: ["ignore", out, out], env: process.env, ...winSpawnOpts() })
    : spawnImpl("sh", ["-c", "sleep 1; exec \"$1\" update", "kitgen-update", join(kitgenHome, "bin", "kitgen")],
      { detached: true, stdio: ["ignore", out, out], env: process.env })

  child.on?.("error", err => {
    // Ghi bằng ĐƯỜNG DẪN, không qua fd: fd đã đóng ngay dưới đây (④). Tiến trình con giữ
    // bản sao riêng nên nó vẫn ghi tiếp vào cùng file, hai đường không giẫm lên nhau.
    try { appendFileSync(logFile, `không chạy được installer: ${err?.message ?? err}\n`) }
    catch { try { writeSync(2, `không chạy được installer: ${err?.message ?? err}\n`) } catch { /* hết đường báo */ } }
  })
  // ④ `spawn` là đồng bộ ở khâu tạo tiến trình: tới đây con đã có handle riêng, đóng bản
  // của cha là an toàn trên cả POSIX lẫn Windows. Cả nhánh spawn hỏng cũng an toàn vì
  // listener 'error' ở trên không còn dùng fd nữa.
  if (typeof out === "number") { try { closeSync(out) } catch { /* đã đóng */ } }
  child.unref?.()
  return { logLabel: UPDATE_LOG_LABEL }
}
