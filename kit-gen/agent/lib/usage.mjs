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
     số dư credits (SỐ, không phải chuỗi tự do) + hai boolean của nó,
     nhãn home dạng `~/…`. Không path tuyệt đối. */
import { createReadStream } from "node:fs"
import { opendir, readdir, stat } from "node:fs/promises"
import { createInterface } from "node:readline"
import { homedir } from "node:os"
import { join } from "node:path"
import { exists } from "./fsx.mjs"
import { shortenPath } from "./redact.mjs"
import { resolveCodexHome } from "./doctor.mjs"

/** Trần tuổi của số đã đọc. KHÔNG phải nhịp làm mới: file rollout chỉ đổi khi codex
 *  chạy, nên thứ thật sự kéo số mới về là `invalidateUsageCache()` do run-handle gọi
 *  ngay khi một job / một lượt chạy đóng sổ (bug "thanh đứng im", 07/09/2026 — trước
 *  đó chỉ login/logout/`?refresh=1` mới dọn cache, tức là vẽ xong 20 tấm mà con số
 *  vẫn y nguyên tới 5 phút). */
const CACHE_MS = 5 * 60_000
/** Cache theo TỪNG home: đổi hồ sơ ảnh không được đọc trúng số của hồ sơ cũ. */
const cache = new Map()

/** Bao nhiêu file rollout mới nhất được mở trước khi bỏ cuộc. Mỗi file chỉ đọc
 *  những dòng có `"rate_limits"` nên rẻ; giới hạn để không quét cả nghìn phiên. */
const MAX_FILES = 12
/** Bao nhiêu ngày gần nhất được ngó tới. */
const MAX_DAYS = 14
/** Không giữ danh sách tên vô hạn nếu một ngày có nhiều rollout. */
const MAX_FILES_PER_DAY = MAX_FILES

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
  let daysSeen = 0
  for (const year of await sortedDirs(root)) {
    for (const month of await sortedDirs(join(root, year))) {
      for (const day of await sortedDirs(join(root, year, month))) {
        if (daysSeen >= MAX_DAYS) return out.slice(0, MAX_FILES)
        daysSeen += 1
        const dir = join(root, year, month, day)
        const names = []
        let handle
        try { handle = await opendir(dir) } catch { continue }
        try {
          for await (const ent of handle) {
            if (!ent.isFile() || !ent.name.startsWith("rollout-") || !ent.name.endsWith(".jsonl")) continue
            names.push(ent.name)
            if (names.length >= MAX_FILES_PER_DAY) break
          }
        } catch { /* file/day vừa biến mất */ }
        finally { await handle.close().catch(() => {}) }
        const withTime = []
        for (const n of names) {
          try { withTime.push({ path: join(dir, n), at: (await stat(join(dir, n))).mtimeMs }) }
          catch { /* file vừa bị xoá giữa chừng */ }
        }
        withTime.sort((a, b) => b.at - a.at)
        out.push(...withTime)
        if (out.length >= MAX_FILES) return out.slice(0, MAX_FILES)
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

/** Chuẩn hoá khối `credits` (ví/mua thêm). Codex 0.147 trả `balance` là CHUỖI số
 *  ("0", "12.5") — đổi thành số ngay tại đây: hợp đồng bảo mật chỉ cho phép số +
 *  enum ra ngoài, và một chuỗi tự do là đúng cái cửa mà hợp đồng đó đóng lại.
 *  Chuỗi không parse được ⇒ `balance:null`, KHÔNG bịa 0 (0 nghĩa là "hết tiền"). */
function creditsOf(c) {
  if (!c || typeof c !== "object") return null
  const raw = typeof c.balance === "string" ? Number(c.balance) : num(c.balance)
  return {
    hasCredits: typeof c.has_credits === "boolean" ? c.has_credits : null,
    unlimited: typeof c.unlimited === "boolean" ? c.unlimited : null,
    balance: Number.isFinite(raw) ? raw : null,
  }
}

/** Đọc MỘT file rollout, lấy bản ghi `rate_limits` CUỐI CÙNG.
 *  Chỉ những dòng chứa `"rate_limits"` mới được parse — phần còn lại (nội dung
 *  hội thoại) không bao giờ chạm tới JSON.parse, không bao giờ được giữ.
 *
 *  HAI CON TRỎ, KHÔNG MỘT (bug "thanh đứng im", 07/09/2026). Bản ghi MỚI NHẤT của
 *  một phiên thường là `limit_id:"premium"` với `primary`/`secondary` = null và chỉ
 *  mang `credits`. Bản cũ chỉ nhìn window nên nó BỎ QUA nguyên bản ghi đó và trả về
 *  `observedAt` của bản ghi cũ hơn — người dùng thấy một mốc thời gian đứng yên mà
 *  không ai nói vì sao. Nay:
 *    · `win`  = bản ghi gần nhất CÓ SỐ window (thứ vẽ ra thanh);
 *    · `last` = bản ghi gần nhất bất kể có window hay không (thứ cho `credits` +
 *               `observedAt` — "số này đọc lúc nào" phải là mốc THẬT của lần cuối). */
async function lastRateLimits(path) {
  let win = null
  let last = null
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (!line.includes("\"rate_limits\"")) continue
      let obj
      try { obj = JSON.parse(line) } catch { continue }
      const p = obj?.payload
      const raw = p && typeof p === "object" ? p.rate_limits : null
      if (!raw || typeof raw !== "object") continue
      const rec = {
        primary: windowOf(raw.primary),
        secondary: windowOf(raw.secondary),
        plan: typeof raw.plan_type === "string" ? raw.plan_type : null,
        credits: creditsOf(raw.credits),
        observedAt: typeof obj.timestamp === "string" ? obj.timestamp : null,
      }
      last = rec
      if (rec.primary || rec.secondary) win = rec
    }
  } finally { rl.close() }
  if (!last) return null
  return {
    primary: win?.primary ?? null,
    secondary: win?.secondary ?? null,
    /* `plan_type` đi cùng MỌI bản ghi, kể cả bản không có window ⇒ lấy của bản mới nhất. */
    plan: last.plan ?? win?.plan ?? null,
    credits: last.credits ?? win?.credits ?? null,
    observedAt: last.observedAt ?? win?.observedAt ?? null,
  }
}

/** MỘT home duy nhất, cùng phép giải với doctor/gen (`resolveCodexHome`): ~/.codex,
 *  hoặc `KITGEN_CODEX_HOME` cho dev/test. Hồ sơ ảnh riêng đã bị bỏ (24/08/2026). */
export function homeOf() {
  return { profile: "default-home", home: resolveCodexHome() }
}

/**
 * @returns {Promise<{ok:boolean, profile:string, codexHomeLabel:string, plan:string|null,
 *   primary:object|null, secondary:object|null, credits:object|null, observedAt:string|null,
 *   source:string, reason?:string, checkedAt:string}>}
 * LUÔN "thành công" ở tầng HTTP: không có số thì `ok:false` + `reason` enum, để UI
 * ẩn thanh usage đi chứ không hiện lỗi đỏ vì một thứ chỉ-để-tham-khảo.
 */
export async function usage(ws, { refresh = false } = {}) {
  const { profile, home } = homeOf()
  const hit = cache.get(home)
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return hit.data

  const base = {
    ok: false, profile, codexHomeLabel: shortenPath(home),
    plan: null, primary: null, secondary: null, credits: null, observedAt: null,
    source: "codex-rollout", checkedAt: new Date().toISOString(),
  }
  let data
  if (!await exists(home)) {
    data = { ...base, reason: "NO_CODEX_HOME" }
  } else {
    const files = await recentRollouts(home)
    let found = null
    for (const f of files) {
      let rec = null
      try { rec = await lastRateLimits(f.path) } catch { rec = null }
      if (!rec) continue
      if (!found) found = rec
      /* Phiên MỚI NHẤT có thể chỉ mang `credits` (limit_id "premium"): giữ nguyên
         `credits`/`observedAt`/`plan` mới của nó, chỉ mượn window của phiên cũ hơn.
         Trộn kiểu này là cách duy nhất không phải chọn giữa "số mới mà thiếu thanh"
         và "thanh cũ mà giả vờ là mới". */
      else if (rec.primary || rec.secondary) found = { ...found, primary: rec.primary, secondary: rec.secondary, plan: found.plan ?? rec.plan }
      if (found.primary || found.secondary) break
    }
    data = found
      ? {
        ...base, ok: true, plan: found.plan, primary: found.primary,
        secondary: found.secondary, credits: found.credits, observedAt: found.observedAt,
      }
      /* NO_DATA cũng là ca của người dùng model_provider RIÊNG (vd một proxy tương
         thích OpenAI): server đó không trả `rate_limits`, nên KHÔNG có quota để hiện. */
      : { ...base, reason: files.length === 0 ? "NO_SESSIONS" : "NO_DATA" }
  }
  cache.set(home, { at: Date.now(), data })
  return data
}

export function invalidateUsageCache() { cache.clear() }
