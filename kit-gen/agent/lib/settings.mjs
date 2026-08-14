/* settings.mjs — TUỲ CHỌN NGƯỜI DÙNG SỐNG TRÊN ĐĨA, không sống trong trình duyệt.
 *
 * VÌ SAO CÓ FILE NÀY: trước đây `theme`, `maxJobs`, `autoSliceAfterGen`… chỉ nằm ở
 * `localStorage` của một trình duyệt. Xoá dữ liệu duyệt web, đổi máy, mở bằng đường vào
 * kia (`/app/` same-origin vs trang Pages — HAI origin, HAI kho localStorage) là mất
 * sạch, dù dự án trên đĩa còn nguyên. Nguồn sự thật chuyển về
 * `<workspace>/.kitgen/config.json`; localStorage tụt xuống vai trò BỘ NHỚ ĐỆM khởi động
 * (để lần vẽ đầu không nhấp nháy trong lúc chờ agent trả lời) và có mất cũng không sao.
 *
 * ══ HỢP ĐỒNG BẢO MẬT — ĐỌC TRƯỚC KHI THÊM FIELD ═════════════════════════════
 * Endpoint này KHÔNG BAO GIỜ nhận hay trả: đường dẫn (kể cả đã rút gọn), biến môi
 * trường, nội dung `auth.json`/`config.toml`, hay BẤT KỲ chuỗi tự do nào người dùng gõ.
 * Mọi field phải rơi vào đúng bốn loại dưới đây:
 *
 *   ENUM  — tập giá trị đóng, khai tường minh tại chỗ
 *   BOOL  — true/false
 *   INT   — số nguyên đã kẹp trong [min,max]
 *   ID(S) — mã do CHÍNH ỨNG DỤNG sinh, phải khớp `ID_RE`
 *
 * `ID_RE` là chỗ duy nhất chuỗi lọt qua, nên nó hẹp có chủ ý: không khoảng trắng, không
 * `/`, không `~`, không `\`, không `$`, tối đa 64 ký tự. Một đường dẫn (`/Users/…`,
 * `~/KitGen`, `C:\…`), một token, một câu tiếng Việt người dùng gõ — không cái nào khớp
 * được, nên chúng KHÔNG THỂ đi vào file này qua ngả API. Giá trị không khớp bị BỎ IM
 * LẶNG (không ném): một mã lạ từ bản build khác không đáng làm hỏng cả lần lưu.
 *
 * Vì vậy `filterQuery` (ô tìm kiếm) và `filterTags` (thẻ do người dùng đặt) CỐ Ý KHÔNG
 * có ở đây: chúng là chữ người dùng gõ. Chúng ở lại localStorage như trước — và cũng
 * chẳng ai muốn mở app lên thấy một bộ lọc từ hôm qua đang chắn hết danh sách.
 *
 * ══ GHI ═══════════════════════════════════════════════════════════════════════
 * Ghi qua `Workspace.patchConfig` → `writeJsonAtomic` (tmp + rename), cùng một đường mà
 * `/api/image-profile` đã dùng. Mất điện giữa chừng không để lại config.json cụt.
 */
import { fail } from "./errors.mjs"

/** Mã do ứng dụng sinh: id sheet, id tab, id nhóm. Xem khối hợp đồng ở đầu file. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

const ENUM = (values, def) => ({ kind: "enum", values, def })
const BOOL = def => ({ kind: "bool", def })
const INT = (min, max, def) => ({ kind: "int", min, max, def })
/** Mảng mã, giữ thứ tự, bỏ trùng, cắt ở `max`. */
const IDS = max => ({ kind: "ids", max, def: [] })
/** Bảng mã→mã (ví dụ `{design:"sheets"}`), tối đa `max` cặp. */
const IDMAP = max => ({ kind: "idmap", max, def: {} })

/**
 * BẢNG FIELD ĐẦY ĐỦ. Thêm dòng ở đây là cách DUY NHẤT để một tuỳ chọn ra được đĩa —
 * field không có trong bảng bị lược bỏ ở cả hai chiều đọc và ghi.
 *
 * Giá trị mặc định phải KHỚP `webapp/src/lib/store/persist.ts`; hai bên lệch nhau thì
 * người dùng chưa từng chỉnh gì cũng thấy giao diện tự đổi sau lần đồng bộ đầu tiên.
 */
export const SETTINGS_SPEC = {
  ui: {
    theme: ENUM(["dark", "light", "system"], "dark"),
    locale: ENUM(["vi", "en"], "vi"),
    density: ENUM(["comfortable", "compact"], "comfortable"),
    sidebarWidth: INT(180, 480, 260),
    railCollapsed: BOOL(false),
    projectsView: ENUM(["grid", "list"], "grid"),
    sortBy: ENUM(["updated", "name", "size", "created"], "updated"),
    sortDir: ENUM(["asc", "desc"], "desc"),
    filterChip: ENUM(["all", "need-gen", "running", "failed", "unfinished"], "all"),
    collapsedSections: IDS(64),
    lastTab: IDMAP(32),
    kitBackdrop: ENUM(["checker", "dark", "light"], "checker"),
    kitZoom: INT(25, 200, 100),
  },
  prefs: {
    maxJobs: INT(1, 8, 4),
    autoSliceAfterGen: BOOL(true),
    confirmDestructive: BOOL(true),
    showEmptyCells: BOOL(true),
    logTail: INT(200, 20000, 2000),
  },
}

export const SETTINGS_GROUPS = Object.keys(SETTINGS_SPEC)

/** Giá trị hợp lệ ⇒ trả về; không hợp lệ ⇒ `undefined` (nơi gọi tự lấy mặc định). */
function coerce(spec, raw) {
  switch (spec.kind) {
    case "enum":
      return spec.values.includes(raw) ? raw : undefined
    case "bool":
      return typeof raw === "boolean" ? raw : undefined
    case "int": {
      const n = Number(raw)
      if (!Number.isFinite(n)) return undefined
      return Math.min(spec.max, Math.max(spec.min, Math.round(n)))
    }
    case "ids": {
      if (!Array.isArray(raw)) return undefined
      const out = []
      for (const v of raw) {
        if (typeof v !== "string" || !ID_RE.test(v) || out.includes(v)) continue
        out.push(v)
        if (out.length >= spec.max) break
      }
      return out
    }
    case "idmap": {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
      const out = {}
      let n = 0
      for (const [k, v] of Object.entries(raw)) {
        if (!ID_RE.test(k) || typeof v !== "string" || !ID_RE.test(v)) continue
        out[k] = v
        if (++n >= spec.max) break
      }
      return out
    }
    default:
      return undefined
  }
}

/** Mặc định của cả bảng — dùng khi config.json chưa có gì hoặc bị sửa tay thành rác. */
export function defaultSettings() {
  const out = {}
  for (const [group, fields] of Object.entries(SETTINGS_SPEC)) {
    out[group] = {}
    for (const [name, spec] of Object.entries(fields)) {
      out[group][name] = Array.isArray(spec.def) ? [...spec.def]
        : spec.def && typeof spec.def === "object" ? { ...spec.def }
          : spec.def
    }
  }
  return out
}

/**
 * Chuẩn hoá một khối bất kỳ về ĐÚNG hình dạng bảng: đủ field, đúng kiểu, không dư.
 * Dùng cho CẢ hai chiều — đọc từ đĩa (file có thể do bản cũ ghi, hoặc bị sửa tay) và
 * nhận từ web (không tin gì cả). Một hàm, một luật, không có đường vòng.
 */
export function normalizeSettings(raw) {
  const out = defaultSettings()
  if (!raw || typeof raw !== "object") return out
  for (const [group, fields] of Object.entries(SETTINGS_SPEC)) {
    const src = raw[group]
    if (!src || typeof src !== "object") continue
    for (const [name, spec] of Object.entries(fields)) {
      const v = coerce(spec, src[name])
      if (v !== undefined) out[group][name] = v
    }
  }
  return out
}

/** Chỉ giữ những field CÓ MẶT trong patch và hợp lệ — để PATCH đúng nghĩa vá một phần. */
export function pickPatch(raw) {
  const out = {}
  if (!raw || typeof raw !== "object") return out
  for (const [group, fields] of Object.entries(SETTINGS_SPEC)) {
    const src = raw[group]
    if (!src || typeof src !== "object") continue
    for (const [name, spec] of Object.entries(fields)) {
      if (!Object.hasOwn(src, name)) continue
      const v = coerce(spec, src[name])
      if (v === undefined) continue
      out[group] ??= {}
      out[group][name] = v
    }
  }
  return out
}

/**
 * `configured` = file cấu hình ĐÃ TỪNG được ghi tuỳ chọn hay chưa. Đây KHÔNG phải một
 * tiện ích nhỏ, nó là cái chặn một đường mất dữ liệu có thật:
 *
 * Mọi workspace đang tồn tại đều CHƯA có khối `ui`/`prefs` (chúng vừa được thêm). Nếu
 * API cứ trả mặc định mà không nói rõ "đây là mặc định vì tôi chưa có gì", web sẽ coi
 * đó là sự thật trên đĩa và ghi đè lên tuỳ chọn thật của người dùng đang nằm trong
 * localStorage — chủ đề sáng thành tối, `maxJobs` về 4 — ngay lần mở đầu tiên sau khi
 * cập nhật. Đúng loại "tự nhiên mất settings" mà cả thay đổi này sinh ra để chặn.
 *
 * `false` ⇒ web GIỮ giá trị của nó và đẩy NGƯỢC lên đĩa (nhận nuôi), chứ không nhận về.
 *
 * `maxJobs` ở gốc KHÔNG được tính là "đã cấu hình": `CONFIG_DEFAULT` ghi nó cho cả
 * workspace mới toanh, nên lấy nó làm dấu hiệu thì workspace nào cũng hoá ra "đã cấu hình".
 */
export async function readSettings(ws) {
  const cfg = await ws.config()
  const configured = isBlock(cfg.ui) || isBlock(cfg.prefs)
  return {
    settings: normalizeSettings({ ui: cfg.ui, prefs: cfg.prefs, ...legacyMaxJobs(cfg) }),
    configured,
  }
}

const isBlock = v => v !== null && typeof v === "object" && !Array.isArray(v)

/**
 * `maxJobs` đã sống ở GỐC config.json từ trước bảng này (`CONFIG_DEFAULT` của
 * workspace.mjs). Workspace đã dùng lâu nay có con số ở đó chứ không ở `prefs`; đọc
 * thẳng `prefs` sẽ lặng lẽ dựng nó về 4. Nên: gốc là ĐƯỜNG LÙI, `prefs.maxJobs` thắng
 * khi có mặt (xem `normalizeSettings` — patch sau đè trước).
 */
function legacyMaxJobs(cfg) {
  if (cfg.prefs && Object.hasOwn(cfg.prefs, "maxJobs")) return {}
  if (!Object.hasOwn(cfg, "maxJobs")) return {}
  return { prefs: { ...(cfg.prefs ?? {}), maxJobs: cfg.maxJobs } }
}

/**
 * Vá tuỳ chọn rồi ghi atomic. Trả về TOÀN BỘ bảng sau khi vá, không phải phần vá — web
 * đang giữ một bản sao trong RAM và nó phải khớp đĩa sau mỗi lần ghi, kể cả khi agent
 * vừa kẹp một con số ra ngoài khoảng (gửi maxJobs 99 ⇒ nhận lại 8, giao diện tự sửa).
 */
export async function patchSettings(ws, body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    fail("BAD_REQUEST", "settings patch must be an object")
  }
  const patch = pickPatch(body)
  const { settings: current } = await readSettings(ws)
  const next = defaultSettings()
  for (const group of SETTINGS_GROUPS) {
    next[group] = { ...current[group], ...(patch[group] ?? {}) }
  }
  // `maxJobs` ở gốc được GIỮ ĐỒNG BỘ, không bỏ rơi: file config.json là thứ con người
  // cũng mở ra đọc, và hai con số khác nhau trong cùng một file là một cái bẫy.
  await ws.patchConfig({ ui: next.ui, prefs: next.prefs, maxJobs: next.prefs.maxJobs })
  // Ghi xong thì đĩa ĐÃ có tuỳ chọn ⇒ từ lần đọc sau, đĩa là bên thắng.
  return { settings: next, configured: true }
}
