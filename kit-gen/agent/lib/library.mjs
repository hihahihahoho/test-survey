/* library.mjs — kho bộ khung và ảnh tham chiếu dùng chung của workspace.
   Catalogue engine vẫn chỉ đọc; dữ liệu người dùng nằm riêng trong .kitgen/library. */
import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { ensureDir, exists, readJsonFile, removeTree, writeFileAtomic, writeJsonAtomic } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { imageSize, sniff } from "./multipart.mjs"

const IMAGE_EXT = new Set(["png", "jpg", "webp"])
const KINDS = new Set(["ui", "mascot", "reference"])
const GROUPS = new Set(["background", "popup", "small", "props", "mascot", "style", "mascot-reference", "brand-logo", "brand-style", "brand-mascot"])
const CELLS = new Set(["landscape", "portrait", "full"])
const SHAPES = new Set(["pill", "bar", "rrect", "rect", "circle", "burst", "puzzle", "full"])
export const LIBRARY_DEFAULTS = { background: 2, popup: 4, small: 16, props: 16, mascot: 4 }

/* ══ PRESET — danh mục người dùng tự sửa (phong cách, loại element, mascot…) ══
   VÌ SAO LÀ MỘT MẢNG RIÊNG, KHÔNG NHÉT VÀO `settings`: `patchLibrarySettings`
   chỉ nhận số nguyên 1..32 (hạn mức số lượng ảnh mỗi nhóm). Preset là dữ liệu
   có cấu trúc, nhiều bản ghi, có vòng đời CRUD riêng — nhét vào settings thì
   hoặc phải nới validate của settings (mất hàng rào đang bảo vệ hạn mức), hoặc
   phải mã hoá JSON vào một số. Cả hai đều sai.

   VÌ SAO `data` LÀ JSON TỰ DO: mỗi `kind` có hình dạng khác nhau (style chỉ cần
   vi/en; element cần thêm decor + materialId; mascot cần tên ảnh tham chiếu) và
   hình dạng đó CÒN ĐANG ĐỔI ở phía web. Agent không hiểu ngữ nghĩa, chỉ giữ hộ
   — nên nó chỉ ép ba thứ đo được: là object, khoá hữu hạn, và không phình. */
const PRESET_KINDS = new Set(["style", "element", "mascot", "material", "outfit"])
/** Chặn một preset khổng lồ nuốt cả file state; đủ rộng cho mọi hình dạng web đang dùng. */
const PRESET_DATA_BYTES = 8000
/** Trần số bản ghi — kho là danh mục người gõ tay, không phải nơi đổ dữ liệu máy sinh. */
const PRESET_MAX = 500

/* ══ DANH TÍNH CỦA MỘT PRESET: `kind` + `data.key` ══════════════════════════
   `id` là địa chỉ VẬN CHUYỂN do agent sinh ngẫu nhiên mỗi lần POST — hai lần
   gieo cùng một hạt giống ra hai `id` khác nhau, nên `id` KHÔNG nói được "hai
   bản ghi này là một". Thứ nói được điều đó là `data.key`: id bundle do web đặt,
   ổn định qua mọi lần gieo, và chính là thứ nằm trong tài liệu đã lưu
   (`elementId` của mỗi ô). Xem chú thích #2 ở đầu `presets-store.ts`.

   VÌ SAO CHỈ TÍNH KHI `key` KHÁC RỖNG: preset không có `key` là preset được tạo
   bằng tay / bằng curl / bởi một client khác. Chúng KHÔNG có danh tính chung nào
   cả — gộp chúng lại theo `kind` là xoá dữ liệu của người ta. Không có key thì
   không có bản trùng, luôn tạo mới. */
function presetKey(preset) {
  const key = preset?.data?.key
  return typeof key === "string" && key ? `${preset.kind}:${key}` : ""
}

/**
 * Bỏ bản ghi trùng `kind`+`data.key`, GIỮ BẢN CŨ NHẤT.
 *
 * VÌ SAO GIỮ BẢN CŨ NHẤT chứ không phải bản mới nhất: bản cũ nhất là bản mà mọi
 * tài liệu đã lưu đang trỏ tới, và là bản người dùng đã có cơ hội SỬA. Bản trùng
 * sinh sau là bản hạt giống gieo lại — nội dung mặc định. Giữ bản mới là lặng lẽ
 * ném đi những gì người ta đã gõ.
 *
 * VÌ SAO CHẠY TRONG `cleanState` (mọi lần đọc) CHỨ KHÔNG PHẢI MỘT BƯỚC DI TRÚ
 * CHẠY LÚC KHỞI ĐỘNG: một bước chạy-một-lần chỉ chữa được những workspace đã
 * dính, và chỉ chữa được nếu agent có dịp khởi động lại. Đặt ở đây thì (1) mọi
 * workspace tự sạch ngay lần đọc đầu tiên — kể cả `~/KitGen-dev` đang dính,
 * (2) `saveLibrary` cũng đi qua `cleanState`, nên từ giờ KHÔNG một đường ghi nào
 * có thể để lại bản trùng trên đĩa, dù đường đó do ai viết. Giá phải trả là một
 * lượt duyệt O(n) trên tối đa 500 bản ghi mỗi lần đọc — không đáng kể.
 */
function dedupePresets(presets) {
  /* `kind:key` → chỉ số của bản đang giữ. Duyệt một lượt, so `createdAt` để
     chọn bản cũ hơn; `createdAt` bằng nhau (cùng một mili-giây — chuyện thường
     khi vòng lặp gieo hạt chạy liên tiếp) thì bản đứng TRƯỚC thắng, vì thứ tự
     mảng chính là thứ tự `push` lúc tạo. */
  const winner = new Map()
  const dropped = new Set()
  presets.forEach((preset, index) => {
    const key = presetKey(preset)
    if (!key) return
    const held = winner.get(key)
    if (held === undefined) { winner.set(key, index); return }
    const older = presets[held].createdAt <= preset.createdAt ? held : index
    dropped.add(older === held ? index : held)
    winner.set(key, older)
  })
  return dropped.size === 0 ? presets : presets.filter((_, index) => !dropped.has(index))
}

function statePath(ws) { return join(ws.libraryDir, "library.json") }
function assetsDir(ws) { return join(ws.libraryDir, "assets") }

function defaultGeometry(group) {
  if (group === "background") return { cell: "full", skel: { shape: "full", w: 1, h: 1 } }
  if (group === "popup") return { cell: "landscape", skel: { shape: "rrect", w: 0.82, h: 0.62, slice9: true } }
  return { cell: "landscape", skel: { shape: "pill", w: 0.78, h: 0.5, slice9: true } }
}

function cleanGeometry(group, cell, raw) {
  const fallback = defaultGeometry(group)
  const skel = raw && typeof raw === "object" ? raw : {}
  const shape = SHAPES.has(skel.shape) ? skel.shape : fallback.skel.shape
  const clamp = (value, otherwise) => {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0.05 && number <= 1 ? number : otherwise
  }
  return {
    cell: CELLS.has(cell) ? cell : fallback.cell,
    skel: {
      shape,
      w: clamp(skel.w, fallback.skel.w),
      h: clamp(skel.h, fallback.skel.h),
      ...(skel.slice9 === true ? { slice9: true } : {}),
      ...(skel.free === true ? { free: true } : {}),
    },
  }
}


function cleanBrand(brand) {
  const now = new Date().toISOString()
  return {
    id: String(brand.id),
    name: String(brand.name ?? "Thương hiệu chưa đặt tên").trim().slice(0, 100) || "Thương hiệu chưa đặt tên",
    description: String(brand.description ?? "").trim().slice(0, 1000),
    colors: [...new Set((Array.isArray(brand.colors) ? brand.colors : []).map(String).filter(value => /^#[0-9a-f]{6}$/i.test(value)))].slice(0, 12),
    assetIds: [...new Set((Array.isArray(brand.assetIds) ? brand.assetIds : []).map(String))].slice(0, 100),
    createdAt: String(brand.createdAt ?? now),
    updatedAt: String(brand.updatedAt ?? now),
  }
}

/**
 * Chuẩn hoá `data`. Trả `null` khi KHÔNG hợp lệ thay vì ném lỗi — vì hàm này chạy
 * ở CẢ hai đường: lúc ghi (phải từ chối, và nơi gọi sẽ `fail`) và lúc ĐỌC state cũ
 * trên đĩa (một bản ghi hỏng không được làm chết cả kho — nó bị bỏ, phần còn lại
 * vẫn mở được). Ném lỗi ở đây thì đường đọc mất luôn hàng rào đó.
 */
function cleanPresetData(raw) {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== "object" || Array.isArray(raw)) return null
  let encoded
  try { encoded = JSON.stringify(raw) }
  catch { return null }
  /* `JSON.stringify` trả undefined khi gặp giá trị không mã hoá được (hàm, symbol). */
  if (typeof encoded !== "string") return null
  if (Buffer.byteLength(encoded, "utf8") > PRESET_DATA_BYTES) return null
  /* Đi vòng qua JSON một lần nữa để cái ghi xuống đĩa ĐÚNG BẰNG cái đã đo:
     prototype lạ, getter, undefined lồng trong mảng… đều bị JSON làm phẳng. */
  return JSON.parse(encoded)
}

function cleanPreset(preset) {
  const now = new Date().toISOString()
  const kind = PRESET_KINDS.has(String(preset.kind)) ? String(preset.kind) : "style"
  return {
    id: String(preset.id),
    kind,
    name: String(preset.name ?? "Mẫu chưa đặt tên").trim().slice(0, 100) || "Mẫu chưa đặt tên",
    data: cleanPresetData(preset.data) ?? {},
    createdAt: String(preset.createdAt ?? now),
    updatedAt: String(preset.updatedAt ?? now),
  }
}

function cleanState(raw) {
  const items = Array.isArray(raw?.items)
    ? raw.items
      .filter(item => item && typeof item.id === "string")
      .map(item => {
        const geometry = item.kind === "ui" ? cleanGeometry(item.group, item.cell, item.skel) : {}
        return {
          ...item,
          name: String(item.name ?? "Ảnh chưa đặt tên").trim().slice(0, 100) || "Ảnh chưa đặt tên",
          description: String(item.description ?? "").trim().slice(0, 1000),
          tags: Array.isArray(item.tags)
            ? [...new Set(item.tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 12)
            : [],
          ...geometry,
          poses: Array.isArray(item.poses)
            ? [...new Set(item.poses.map(pose => String(pose).trim()).filter(Boolean))].slice(0, 32)
            : [],
        }
      })
    : []
  /* ══ DI TRÚ v3 → v4 ══════════════════════════════════════════════════════
     v4 chỉ THÊM `presets`. Không có trường nào đổi tên hay đổi kiểu, nên việc di
     trú là "đọc file v3, thấy thiếu `presets` thì cho mảng rỗng" — đúng cái
     `cleanState` vốn đã làm cho mọi khoá khác. brands / settings / items đi qua
     nguyên vẹn.
     (Có test khoá điều này: `suite-library.mjs` ghi thẳng một file v3 xuống đĩa
     rồi đọc lại, so từng mảng.)

     ══ 08/09/2026 — `poseTemplates` BỊ BỎ, KHÔNG PHẢI BỊ ĐỔI ═══════════════════
     19 khung dáng dựng sẵn (+ ba cửa ghi `addPoseTemplate`/`patchPoseTemplate`/
     `removePoseTemplate`) từng phục vụ tab «khung pose» của thư viện mascot. Tab
     đó đã bị xoá ở Đợt 2 và luồng prompt-first chụp manơcanh thành `sheet.poseRef`
     thay cho nó, nên KHÔNG còn ai đọc mảng này — cả web lẫn engine.
     Tương thích: `cleanState` chỉ đọc những khoá nó biết, nên `library.json` cũ có
     `poseTemplates` vẫn mở được y như trước; khoá thừa bị lược bỏ ở lần ghi kế
     tiếp, không crash và không đụng tới brands/items/presets. Số `version` GIỮ
     nguyên 4: bỏ một khoá không ai đọc thì không có gì để di trú. */
  return {
    version: 4,
    brands: Array.isArray(raw?.brands) ? raw.brands.filter(brand => brand && typeof brand.id === "string").map(cleanBrand) : [],
    settings: { ...LIBRARY_DEFAULTS, ...(raw?.settings ?? {}) },
    items,
    /* `dedupePresets` đứng SAU `cleanPreset` (cần `kind` và `createdAt` đã chuẩn
       hoá để so) và TRƯỚC `slice` (nếu không, bản trùng chiếm mất chỗ trong 500
       suất rồi mới bị bỏ — kho đầy giả). */
    presets: Array.isArray(raw?.presets)
      ? dedupePresets(
        raw.presets
          .filter(preset => preset && typeof preset.id === "string" && cleanPresetData(preset.data) !== null)
          .map(cleanPreset),
      ).slice(0, PRESET_MAX)
      : [],
  }
}

export async function readLibrary(ws) {
  await ensureDir(assetsDir(ws))
  if (!(await exists(statePath(ws)))) return cleanState(null)
  try { return cleanState(await readJsonFile(statePath(ws))) }
  catch { fail("LIBRARY_INVALID", "library metadata is not valid JSON") }
}

async function saveLibrary(ws, state) {
  await writeJsonAtomic(statePath(ws), cleanState(state))
}

export async function addBrandProfile(ws, input) {
  const state = await readLibrary(ws)
  const now = new Date().toISOString()
  const brand = cleanBrand({ ...input, id: "brand_" + randomBytes(8).toString("hex"), createdAt: now, updatedAt: now })
  if (!String(input?.name ?? "").trim()) fail("BAD_REQUEST", "brand name is required")
  brand.assetIds = brand.assetIds.filter(id => state.items.some(item => item.id === id))
  state.brands.unshift(brand)
  await saveLibrary(ws, state)
  return brand
}

export async function patchBrandProfile(ws, id, patch) {
  const state = await readLibrary(ws)
  const index = state.brands.findIndex(brand => brand.id === id)
  if (index < 0) fail("NOT_FOUND", `brand ${id} not found`)
  const next = cleanBrand({ ...state.brands[index], ...patch, id, updatedAt: new Date().toISOString() })
  if (!next.name) fail("BAD_REQUEST", "brand name is required")
  next.assetIds = next.assetIds.filter(assetId => state.items.some(item => item.id === assetId))
  state.brands[index] = next
  await saveLibrary(ws, state)
  return next
}

export async function removeBrandProfile(ws, id) {
  const state = await readLibrary(ws)
  const index = state.brands.findIndex(brand => brand.id === id)
  if (index < 0) fail("NOT_FOUND", `brand ${id} not found`)
  state.brands.splice(index, 1)
  await saveLibrary(ws, state)
}

export async function addLibraryPreset(ws, input) {
  const kind = String(input?.kind ?? "")
  if (!PRESET_KINDS.has(kind)) fail("BAD_REQUEST", "preset kind must be style, element, mascot, material or outfit")
  const name = String(input?.name ?? "").trim()
  if (!name) fail("BAD_REQUEST", "preset name is required")
  if (cleanPresetData(input?.data) === null) fail("BAD_REQUEST", `preset data must be a JSON object of at most ${PRESET_DATA_BYTES} bytes`)
  const state = await readLibrary(ws)
  /* ══ UPSERT NHẸ: ĐÃ CÓ `kind`+`data.key` NÀY ⇒ TRẢ BẢN CŨ, KHÔNG TẠO BẢN MỚI ══
     POST preset là ĐƯỜNG GIEO HẠT, và gieo hạt là việc bị PHÁT LẠI: web mở nhiều
     tab, một lần tải lại trang giữa chừng, một ảnh chụp query cũ — mọi cái đó đều
     dẫn tới cùng một bộ POST bay đi lần thứ hai. Nên đường này phải BẤT BIẾN THEO
     SỐ LẦN GỌI, và agent là chỗ duy nhất bảo đảm được điều đó: nó là nơi duy nhất
     nhìn thấy tất cả client.

     VÌ SAO TRẢ BẢN CŨ CHỨ KHÔNG PHẢI 409:
       Client sẽ phải xử lý một nhánh lỗi cho một việc KHÔNG HỎNG — kết quả mong
       muốn ("kho có đúng một bản của khoá này") đã đạt được rồi. Và một nhánh lỗi
       hiếm là một nhánh không ai chạy thử; nó sẽ hỏng lặng lẽ.
     VÌ SAO TRẢ BẢN CŨ CHỨ KHÔNG PHẢI GHI ĐÈ BẰNG `input`:
       Bản trùng đến sau gần như luôn là HẠT GIỐNG MẶC ĐỊNH phát lại. Ghi đè là
       lấy giá trị mặc định đắp lên đúng thứ người dùng vừa sửa — mất dữ liệu, mà
       lại câm. Muốn sửa thì đã có PATCH, nơi người gọi nói rõ ý định đó. */
  const existing = presetKey({ kind, data: cleanPresetData(input?.data) ?? {} })
  if (existing) {
    const found = state.presets.find(preset => presetKey(preset) === existing)
    if (found) return found
  }
  if (state.presets.length >= PRESET_MAX) fail("BAD_REQUEST", `library holds at most ${PRESET_MAX} presets`)
  const now = new Date().toISOString()
  const preset = cleanPreset({ ...input, id: "preset_" + randomBytes(8).toString("hex"), kind, name, createdAt: now, updatedAt: now })
  /* `push`, KHÔNG `unshift` như brands: preset là một DANH MỤC người dùng
     đọc theo thứ tự (bảng pill trên màn soạn prompt). Thêm một mẫu mà cả danh
     mục nhảy chỗ là thứ khiến người ta mất dấu cái mình vừa gõ. */
  state.presets.push(preset)
  await saveLibrary(ws, state)
  return preset
}

export async function patchLibraryPreset(ws, id, patch) {
  const state = await readLibrary(ws)
  const index = state.presets.findIndex(preset => preset.id === id)
  if (index < 0) fail("NOT_FOUND", `preset ${id} not found`)
  if (patch.kind !== undefined && !PRESET_KINDS.has(String(patch.kind))) fail("BAD_REQUEST", "preset kind must be style, element, mascot, material or outfit")
  if (patch.data !== undefined && cleanPresetData(patch.data) === null) fail("BAD_REQUEST", `preset data must be a JSON object of at most ${PRESET_DATA_BYTES} bytes`)
  /* `data` được THAY CẢ CỤM chứ không trộn nông từng khoá: web sở hữu hình dạng
     của nó, và trộn nông thì không có cách nào XOÁ một khoá đã lỗi thời. */
  const next = cleanPreset({ ...state.presets[index], ...patch, id, updatedAt: new Date().toISOString() })
  if (!String(patch.name ?? next.name).trim()) fail("BAD_REQUEST", "preset name is required")
  /* Chặn PATCH kéo bản ghi này ĐÈ LÊN DANH TÍNH của bản khác. Không có hàng rào
     này thì `dedupePresets` sẽ lặng lẽ bỏ một trong hai ở lần ghi kế tiếp — tức
     là một lệnh sửa lại XOÁ mất một bản ghi khác, mà không ai báo gì. Web không
     bao giờ đi vào đây (`key` sinh từ `newId`, luôn duy nhất), nên trả 400 là
     đúng: đây là lỗi của người gọi, không phải một tình huống cần chiều. */
  const key = presetKey(next)
  if (key && state.presets.some((preset, at) => at !== index && presetKey(preset) === key)) {
    fail("BAD_REQUEST", "another preset already uses this kind and data.key")
  }
  state.presets[index] = next
  await saveLibrary(ws, state)
  return next
}

export async function removeLibraryPreset(ws, id) {
  const state = await readLibrary(ws)
  const index = state.presets.findIndex(preset => preset.id === id)
  if (index < 0) fail("NOT_FOUND", `preset ${id} not found`)
  state.presets.splice(index, 1)
  await saveLibrary(ws, state)
}

export async function addLibraryItem(ws, { data, kind, group, name, description, tags, poses, cell, skel }) {
  if (!KINDS.has(kind)) fail("BAD_REQUEST", "kind must be ui, mascot or reference")
  if (!GROUPS.has(group)) fail("BAD_REQUEST", "unknown library group")
  const type = sniff(data)
  if (!type || !IMAGE_EXT.has(type.ext)) fail("BAD_TYPE", "file must be a PNG, JPG or WebP image")
  const id = "asset_" + randomBytes(8).toString("hex")
  const filename = `${id}.${type.ext}`
  await writeFileAtomic(join(assetsDir(ws), filename), data)
  const size = imageSize(data)
  const state = await readLibrary(ws)
  const geometry = kind === "ui" ? cleanGeometry(group, cell, skel) : {}
  const item = {
    id,
    kind,
    group,
    name: String(name || "Ảnh chưa đặt tên").trim().slice(0, 100) || "Ảnh chưa đặt tên",
    description: String(description || "").trim().slice(0, 1000),
    ...geometry,
    filename,
    bytes: data.length,
    w: size.w,
    h: size.h,
    tags: Array.isArray(tags) ? [...new Set(tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 12) : [],
    poses: kind === "mascot" && Array.isArray(poses)
      ? [...new Set(poses.map(pose => String(pose).trim()).filter(Boolean))].slice(0, 32)
      : kind === "mascot" ? ["idle", "wave", "cheer", "sad"] : [],
    createdAt: new Date().toISOString(),
  }
  state.items.unshift(item)
  await saveLibrary(ws, state)
  return item
}

export async function patchLibraryItem(ws, id, patch) {
  const state = await readLibrary(ws)
  const item = state.items.find(row => row.id === id)
  if (!item) fail("NOT_FOUND", `library item ${id} not found`)
  if (patch.name !== undefined) item.name = String(patch.name).trim().slice(0, 100) || item.name
  if (patch.description !== undefined) item.description = String(patch.description).trim().slice(0, 1000)
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags)) fail("BAD_REQUEST", "tags must be an array")
    item.tags = [...new Set(patch.tags.map(tag => String(tag).trim()).filter(Boolean))].slice(0, 12)
  }
  if (patch.group !== undefined) {
    if (!GROUPS.has(patch.group)) fail("BAD_REQUEST", "unknown library group")
    item.group = patch.group
  }
  if (item.kind === "ui" && (patch.cell !== undefined || patch.skel !== undefined || patch.group !== undefined)) {
    Object.assign(item, cleanGeometry(item.group, patch.cell ?? item.cell, patch.skel ?? item.skel))
  }
  if (patch.poses !== undefined) {
    if (!Array.isArray(patch.poses)) fail("BAD_REQUEST", "poses must be an array")
    item.poses = [...new Set(patch.poses.map(pose => String(pose).trim()).filter(Boolean))].slice(0, 32)
  }
  await saveLibrary(ws, state)
  return item
}

export async function removeLibraryItem(ws, id) {
  const state = await readLibrary(ws)
  const index = state.items.findIndex(row => row.id === id)
  if (index < 0) fail("NOT_FOUND", `library item ${id} not found`)
  const [item] = state.items.splice(index, 1)
  for (const brand of state.brands) brand.assetIds = brand.assetIds.filter(assetId => assetId !== id)
  await saveLibrary(ws, state)
  await removeTree(join(assetsDir(ws), item.filename))
}

export async function patchLibrarySettings(ws, patch) {
  const state = await readLibrary(ws)
  for (const key of Object.keys(LIBRARY_DEFAULTS)) {
    if (patch[key] === undefined) continue
    const value = Number(patch[key])
    if (!Number.isInteger(value) || value < 1 || value > 32) fail("BAD_REQUEST", `${key} must be an integer from 1 to 32`)
    state.settings[key] = value
  }
  await saveLibrary(ws, state)
  return state.settings
}

export async function libraryItemFile(ws, id) {
  const state = await readLibrary(ws)
  const item = state.items.find(row => row.id === id)
  if (!item) fail("NOT_FOUND", `library item ${id} not found`)
  const abs = join(assetsDir(ws), item.filename)
  if (!(await exists(abs))) fail("NOT_FOUND", `file for ${id} not found`)
  return abs
}
