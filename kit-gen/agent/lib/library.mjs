/* library.mjs — kho bộ khung và ảnh tham chiếu dùng chung của workspace.
   Catalogue engine vẫn chỉ đọc; dữ liệu người dùng nằm riêng trong .kitgen/library. */
import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { ensureDir, exists, readJsonFile, removeTree, writeFileAtomic, writeJsonAtomic } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { imageSize, sniff } from "./multipart.mjs"

const IMAGE_EXT = new Set(["png", "jpg", "webp"])
const KINDS = new Set(["ui", "mascot", "reference"])
const GROUPS = new Set(["background", "popup", "small", "mascot", "style", "mascot-reference", "brand-logo", "brand-style", "brand-mascot"])
const CELLS = new Set(["landscape", "portrait", "full"])
const SHAPES = new Set(["pill", "bar", "rrect", "rect", "circle", "burst", "puzzle", "full"])
const POSE_IDS = new Set([
  "idle", "wave", "point", "present", "cheer", "sad", "think", "thumbs-up",
  "run", "walk", "jump", "dance", "hold-gift", "bow", "sit", "fly",
  "view-34", "view-side", "view-back",
])
const POSE_LABELS = {
  idle: "Đứng thẳng", wave: "Vẫy chào", point: "Chỉ tay", present: "Giới thiệu",
  cheer: "Ăn mừng", sad: "Buồn", think: "Suy nghĩ", "thumbs-up": "Giơ ngón cái",
  run: "Chạy", walk: "Đi bộ", jump: "Bật nhảy", dance: "Nhảy múa",
  "hold-gift": "Ôm quà", bow: "Cúi chào", sit: "Ngồi", fly: "Bay",
  "view-34": "Góc ¾", "view-side": "Nhìn ngang", "view-back": "Nhìn lưng",
}
export const LIBRARY_DEFAULTS = { background: 2, popup: 4, small: 16, mascot: 4 }

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

function defaultPoseTemplates() {
  const now = "2026-01-01T00:00:00.000Z"
  return [...POSE_IDS].map(sourcePose => ({
    id: `pose_${sourcePose}`,
    name: POSE_LABELS[sourcePose],
    description: "Khung skeleton chuẩn từ prototype silhouettes.js.",
    sourcePose, enabled: true, builtIn: true, createdAt: now, updatedAt: now,
  }))
}

function cleanPoseTemplate(pose) {
  const now = new Date().toISOString()
  const sourcePose = POSE_IDS.has(String(pose.sourcePose)) ? String(pose.sourcePose) : "idle"
  return {
    id: String(pose.id),
    name: String(pose.name ?? POSE_LABELS[sourcePose]).trim().slice(0, 100) || POSE_LABELS[sourcePose],
    description: String(pose.description ?? "").trim().slice(0, 1000),
    sourcePose, enabled: pose.enabled !== false, builtIn: pose.builtIn === true,
    createdAt: String(pose.createdAt ?? now), updatedAt: String(pose.updatedAt ?? now),
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
  return {
    version: 3,
    brands: Array.isArray(raw?.brands) ? raw.brands.filter(brand => brand && typeof brand.id === "string").map(cleanBrand) : [],
    poseTemplates: Array.isArray(raw?.poseTemplates)
      ? raw.poseTemplates.filter(pose => pose && typeof pose.id === "string").map(cleanPoseTemplate)
      : defaultPoseTemplates(),
    settings: { ...LIBRARY_DEFAULTS, ...(raw?.settings ?? {}) },
    items,
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

export async function addPoseTemplate(ws, input) {
  const sourcePose = String(input?.sourcePose ?? "")
  if (!POSE_IDS.has(sourcePose)) fail("BAD_REQUEST", "unknown prototype pose")
  const name = String(input?.name ?? "").trim()
  if (!name) fail("BAD_REQUEST", "pose name is required")
  const state = await readLibrary(ws)
  const now = new Date().toISOString()
  const pose = cleanPoseTemplate({ ...input, id: "pose_" + randomBytes(8).toString("hex"), name, sourcePose, builtIn: false, createdAt: now, updatedAt: now })
  state.poseTemplates.unshift(pose)
  await saveLibrary(ws, state)
  return pose
}

export async function patchPoseTemplate(ws, id, patch) {
  const state = await readLibrary(ws)
  const index = state.poseTemplates.findIndex(pose => pose.id === id)
  if (index < 0) fail("NOT_FOUND", `pose template ${id} not found`)
  if (patch.sourcePose !== undefined && !POSE_IDS.has(String(patch.sourcePose))) fail("BAD_REQUEST", "unknown prototype pose")
  const next = cleanPoseTemplate({ ...state.poseTemplates[index], ...patch, id, updatedAt: new Date().toISOString() })
  if (!next.name) fail("BAD_REQUEST", "pose name is required")
  state.poseTemplates[index] = next
  await saveLibrary(ws, state)
  return next
}

export async function removePoseTemplate(ws, id) {
  const state = await readLibrary(ws)
  const index = state.poseTemplates.findIndex(pose => pose.id === id)
  if (index < 0) fail("NOT_FOUND", `pose template ${id} not found`)
  state.poseTemplates.splice(index, 1)
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
