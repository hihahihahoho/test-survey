/* settings.mjs — TUỲ CHỌN NGƯỜI DÙNG SỐNG TRÊN ĐĨA, không sống trong trình duyệt.
 *
 * VÌ SAO CÓ FILE NÀY: trước đây chủ đề sáng/tối chỉ nằm ở `localStorage` của một trình
 * duyệt. Xoá dữ liệu duyệt web, đổi máy, mở bằng đường vào kia (`/app/` same-origin vs
 * trang Pages — HAI origin, HAI kho localStorage) là mất sạch, dù dự án trên đĩa còn
 * nguyên. Nguồn sự thật là `<workspace>/.kitgen/config.json`; localStorage tụt xuống vai
 * trò BỘ NHỚ ĐỆM khởi động (để lần vẽ đầu không nhấp nháy trong lúc chờ agent trả lời)
 * và có mất cũng không sao.
 *
 * ══ HỢP ĐỒNG BẢO MẬT — ĐỌC TRƯỚC KHI THÊM FIELD ═════════════════════════════
 * Endpoint này KHÔNG BAO GIỜ nhận hay trả: đường dẫn (kể cả đã rút gọn), biến môi
 * trường, nội dung `auth.json`/`config.toml`, hay BẤT KỲ chuỗi tự do nào người dùng gõ.
 * Field duy nhất được phép là ENUM — tập giá trị đóng, khai tường minh tại chỗ. Không có
 * ô nào cho chữ tự do, nên một đường dẫn (`/Users/…`, `~/KitGen`, `C:\…`), một token hay
 * một câu tiếng Việt người dùng gõ KHÔNG THỂ đi vào file này qua ngả API.
 *
 * Bảng từng có thêm BOOL · INT · mã khớp `ID_RE` để phục vụ 10 field `ui.*` và cả khối
 * `prefs`. Đợt 4 (08/09/2026) bỏ hết: web chỉ còn đồng bộ đúng `ui.theme`
 * (`webapp/src/lib/store/disk-settings.ts` — `DISK_UI_FIELDS`), `maxJobs`/
 * `autoSliceAfterGen` nay là hằng số của luồng một-màn, và những field còn lại thuộc các
 * màn đã bị gỡ. Thêm lại một kiểu khác thì THÊM CẢ nhánh trong `coerce` — và phải giải
 * thích được vì sao giá trị của nó không phải chữ người dùng gõ.
 *
 * `filterQuery` (ô tìm kiếm) và `filterTags` (thẻ do người dùng đặt) CỐ Ý KHÔNG có ở
 * đây: chúng là chữ người dùng gõ. Chúng ở lại localStorage như trước — và cũng chẳng ai
 * muốn mở app lên thấy một bộ lọc từ hôm qua đang chắn hết danh sách.
 *
 * ══ CONFIG.JSON CỦA BẢN CŨ ════════════════════════════════════════════════════
 * File trên máy người dùng bản cũ còn `ui.density`, `ui.kitZoom`, cả khối `prefs`…
 * Chúng bị LƯỢC BỎ ÊM ở cả hai chiều: `normalizeSettings` chỉ đi theo `SETTINGS_SPEC`
 * nên đọc lên không vỡ, và `pickPatch` bỏ qua field lạ nên PATCH kèm khoá cũ vẫn 200 (chỉ
 * phần hợp lệ được ghi) — đúng tinh thần cũ: một mã lạ từ bản build khác không đáng làm
 * hỏng cả lần lưu. Lần PATCH đầu tiên ghi lại nguyên khối `ui` nên rác trong đó tự biến
 * mất; khối `prefs` nằm ngoài khối `ui` thì được để yên chứ không xoá — agent này không
 * dọn giúp phần file mà người dùng có thể tự mở ra sửa.
 *
 * ══ GHI ═══════════════════════════════════════════════════════════════════════
 * Ghi qua `Workspace.patchConfig` → `writeJsonAtomic` (tmp + rename), cùng một đường mà
 * `/api/image-profile` đã dùng. Mất điện giữa chừng không để lại config.json cụt.
 */
import { fail } from "./errors.mjs"

const ENUM = (values, def) => ({ kind: "enum", values, def })

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
  },
}

export const SETTINGS_GROUPS = Object.keys(SETTINGS_SPEC)

/** Giá trị hợp lệ ⇒ trả về; không hợp lệ ⇒ `undefined` (nơi gọi tự lấy mặc định). */
function coerce(spec, raw) {
  switch (spec.kind) {
    case "enum":
      return spec.values.includes(raw) ? raw : undefined
    default:
      return undefined
  }
}

/** Mặc định của cả bảng — dùng khi config.json chưa có gì hoặc bị sửa tay thành rác. */
export function defaultSettings() {
  const out = {}
  for (const [group, fields] of Object.entries(SETTINGS_SPEC)) {
    out[group] = {}
    for (const [name, spec] of Object.entries(fields)) out[group][name] = spec.def
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
 * Workspace tạo trước khi có bảng này đều CHƯA có khối `ui`. Nếu API cứ trả mặc định mà
 * không nói rõ "đây là mặc định vì tôi chưa có gì", web sẽ coi đó là sự thật trên đĩa và
 * ghi đè lên tuỳ chọn thật của người dùng đang nằm trong localStorage — chủ đề sáng
 * thành tối — ngay lần mở đầu tiên sau khi cập nhật. Đúng loại "tự nhiên mất settings"
 * mà cả thay đổi này sinh ra để chặn.
 *
 * `false` ⇒ web GIỮ giá trị của nó và đẩy NGƯỢC lên đĩa (nhận nuôi), chứ không nhận về.
 *
 * `maxJobs` ở gốc KHÔNG được tính là "đã cấu hình": `CONFIG_DEFAULT` của workspace.mjs
 * ghi nó cho cả workspace mới toanh, nên lấy nó làm dấu hiệu thì workspace nào cũng hoá
 * ra "đã cấu hình". Khối `prefs` của bản cũ cũng không được tính: nó không còn field nào
 * sống, nên sự có mặt của nó chẳng nói gì về chủ đề mà người dùng đã chọn.
 */
export async function readSettings(ws) {
  const cfg = await ws.config()
  return { settings: normalizeSettings({ ui: cfg.ui }), configured: isBlock(cfg.ui) }
}

const isBlock = v => v !== null && typeof v === "object" && !Array.isArray(v)

/**
 * Vá tuỳ chọn rồi ghi atomic. Trả về TOÀN BỘ bảng sau khi vá, không phải phần vá — web
 * đang giữ một bản sao trong RAM và nó phải khớp đĩa sau mỗi lần ghi, kể cả khi agent
 * vừa bỏ đi một giá trị không hợp lệ (gửi theme "neon" ⇒ nhận lại giá trị cũ).
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
  await ws.patchConfig({ ui: next.ui })
  // Ghi xong thì đĩa ĐÃ có tuỳ chọn ⇒ từ lần đọc sau, đĩa là bên thắng.
  return { settings: next, configured: true }
}
