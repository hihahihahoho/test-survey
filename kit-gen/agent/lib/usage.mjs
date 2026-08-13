/* usage.mjs — QUOTA CÒN LẠI của tài khoản Codex, đọc từ trạng thái local.
   ══════════════════════════════════════════════════════════════════════════════
   NGUỒN SỐ LIỆU (đã dò, xem agent/README.md §"Usage"):
   Codex CLI 0.147 KHÔNG có lệnh `usage`/`quota`/`status`; `codex doctor --json` chỉ
   trả sức khoẻ cài đặt. Con số mà TUI Codex vẽ ở dòng "Weekly usage limit · N%
   remaining" đến từ sự kiện `token_count` mà server trả về mỗi lượt, và Codex GHI
   LẠI sự kiện đó vào file rollout của phiên:

     $CODEX_HOME/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl
     {"type":"event_msg","payload":{"type":"token_count","rate_limits":{
        "limit_id":"codex","primary":{"used_percent":2.0,"window_minutes":10080,
        "resets_at":1787207428},"secondary":null,"plan_type":"plus", … }}}

   Nên: KHÔNG spawn codex, KHÔNG gọi mạng, KHÔNG tốn quota — chỉ đọc lại con số
   mà lượt chạy gần nhất đã nhận được. Đổi lại, số liệu CŨ BẰNG lượt chạy cuối
   (`observedAt` nói rõ điều đó, UI phải hiện ra chứ không giấu).

   HỢP ĐỒNG BẢO MẬT (arch §4.4-4, giống doctor.mjs):
   · KHÔNG đọc auth.json / config.toml / bất cứ file credential nào.
   · Rollout chứa NỘI DUNG HỘI THOẠI ⇒ chỉ xét những dòng có chuỗi `"rate_limits"`,
     và chỉ giữ lại SỐ + ENUM đã liệt kê dưới đây. Không log, không trả nguyên dòng.
   · Trả ra ngoài chỉ có: số phần trăm, số phút, mốc thời gian ISO, enum gói cước,
     nhãn home dạng `~/…`. Không path tuyệt đối. */
import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { createInterface } from "node:readline"
import { homedir } from "node:os"
import { join } from "node:path"
import { exists } from "./fsx.mjs"
import { shortenPath } from "./redact.mjs"
import { configuredProfile, IMG_HOME_DEFAULT } from "./doctor.mjs"

const CACHE_MS = 5 * 60_000
/** Cache theo TỪNG home: đổi hồ sơ ảnh không được đọc trúng số của hồ sơ cũ. */
const cache = new Map()

/** Bao nhiêu file rollout mới nhất được mở trước khi bỏ cuộc. Mỗi file chỉ đọc
 *  những dòng có `"rate_limits"` nên rẻ; giới hạn để không quét cả nghìn phiên. */
const MAX_FILES = 12
/** Bao nhiêu ngày gần nhất được ngó tới. */
const MAX_DAYS = 14

function expandHome(p) { return p.replace(/^~(?=$|\/)/, homedir()) }

/** Thư mục con mới nhất theo TÊN (sessions xếp theo YYYY/MM/DD nên tên = thứ tự). */
async function sortedDirs(dir) {
  try {
    const items = await readdir(dir, { withFileTypes: true })
    return items.filter(d => d.isDirectory()).map(d => d.name).sort().reverse()
  } catch { return [] }
}

/** Các file rollout mới nhất trong `$CODEX_HOME/sessions`, mới trước cũ sau. */
async function recentRollouts(codexHome) {
  const root = join(codexHome, "sessions")
  if (!await exists(root)) return []
  const out = []
  for (const year of await sortedDirs(root)) {
    for (const month of await sortedDirs(join(root, year))) {
      for (const day of await sortedDirs(join(root, year, month))) {
        const dir = join(root, year, month, day)
        let names = []
        try { names = (await readdir(dir)).filter(n => n.startsWith("rollout-") && n.endsWith(".jsonl")) }
        catch { continue }
        const withTime = []
        for (const n of names) {
          try { withTime.push({ path: join(dir, n), at: (await stat(join(dir, n))).mtimeMs }) }
          catch { /* file vừa bị xoá giữa chừng */ }
        }
        withTime.sort((a, b) => b.at - a.at)
        out.push(...withTime)
        if (out.length >= MAX_FILES || out.length >= MAX_DAYS * 40) return out.slice(0, MAX_FILES)
      }
    }
  }
  return out.slice(0, MAX_FILES)
}

function num(v) { return typeof v === "number" && Number.isFinite(v) ? v : null }

/** Chuẩn hoá MỘT cửa sổ giới hạn. Chỉ nhặt số, bỏ mọi thứ khác. */
function windowOf(w) {
  if (!w || typeof w !== "object") return null
  const usedPercent = num(w.used_percent)
  if (usedPercent === null) return null
  const windowMinutes = num(w.window_minutes)
  const resetsAt = num(w.resets_at)
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent * 10) / 10)),
    remainingPercent: Math.min(100, Math.max(0, Math.round((100 - usedPercent) * 10) / 10)),
    windowMinutes,
    /** ISO, hoặc null nếu server không nói. Không trả epoch thô để UI khỏi tự đoán múi giờ. */
    resetsAt: resetsAt === null ? null : new Date(resetsAt * 1000).toISOString(),
  }
}

/** Đọc NGƯỢC một file rollout, lấy bản ghi `rate_limits` CUỐI CÙNG có số thật.
 *  Chỉ những dòng chứa `"rate_limits"` mới được parse — phần còn lại (nội dung
 *  hội thoại) không bao giờ chạm tới JSON.parse, không bao giờ được giữ. */
async function lastRateLimits(path) {
  let found = null
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (!line.includes("\"rate_limits\"")) continue
      let obj
      try { obj = JSON.parse(line) } catch { continue }
      const p = obj?.payload
      const raw = p && typeof p === "object" ? p.rate_limits : null
      if (!raw || typeof raw !== "object") continue
      const primary = windowOf(raw.primary)
      const secondary = windowOf(raw.secondary)
      if (!primary && !secondary) continue
      found = {
        primary, secondary,
        plan: typeof raw.plan_type === "string" ? raw.plan_type : null,
        observedAt: typeof obj.timestamp === "string" ? obj.timestamp : null,
      }
    }
  } finally { rl.close() }
  return found
}

/** Home của hồ sơ Codex ĐANG ĐƯỢC CHỌN cho việc tạo ảnh (giống doctor.mjs).
 *  `KITGEN_CODEX_HOME` chỉ để TEST trỏ vào fixture — cùng lối với `KITGEN_CODEX_BIN`
 *  của doctor.mjs; máy thật không đặt biến này. */
export function homeOf(cfg) {
  const profile = configuredProfile(cfg)
  const override = process.env.KITGEN_CODEX_HOME
  if (override) return { profile, home: expandHome(override) }
  if (profile !== "img-home") return { profile, home: join(homedir(), ".codex") }
  const raw = cfg?.imageGen?.codexHome
  const label = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : IMG_HOME_DEFAULT
  return { profile, home: expandHome(label) }
}

/**
 * @returns {Promise<{ok:boolean, profile:string, codexHomeLabel:string, plan:string|null,
 *   primary:object|null, secondary:object|null, observedAt:string|null,
 *   source:string, reason?:string, checkedAt:string}>}
 * LUÔN "thành công" ở tầng HTTP: không có số thì `ok:false` + `reason` enum, để UI
 * ẩn thanh usage đi chứ không hiện lỗi đỏ vì một thứ chỉ-để-tham-khảo.
 */
export async function usage(ws, { refresh = false } = {}) {
  const cfg = await ws.config()
  const { profile, home } = homeOf(cfg)
  const hit = cache.get(home)
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data

  const base = {
    ok: false, profile, codexHomeLabel: shortenPath(home),
    plan: null, primary: null, secondary: null, observedAt: null,
    source: "codex-rollout", checkedAt: new Date().toISOString(),
  }
  let data
  if (!await exists(home)) {
    data = { ...base, reason: "NO_CODEX_HOME" }
  } else {
    const files = await recentRollouts(home)
    let found = null
    for (const f of files) {
      try { found = await lastRateLimits(f.path) } catch { found = null }
      if (found) break
    }
    data = found
      ? { ...base, ok: true, plan: found.plan, primary: found.primary, secondary: found.secondary, observedAt: found.observedAt }
      /* NO_DATA cũng là ca của người dùng model_provider RIÊNG (vd một proxy tương
         thích OpenAI): server đó không trả `rate_limits`, nên KHÔNG có quota để hiện. */
      : { ...base, reason: files.length === 0 ? "NO_SESSIONS" : "NO_DATA" }
  }
  cache.set(home, { at: Date.now(), data })
  return data
}

export function invalidateUsageCache() { cache.clear() }
