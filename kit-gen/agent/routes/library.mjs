/* routes/library.mjs — CRUD kho bộ khung/reference riêng của người dùng. */
import { parseMultipart } from "../lib/multipart.mjs"
import {
  addBrandProfile, addLibraryItem, addLibraryPreset, addPoseTemplate, libraryItemFile, patchBrandProfile,
  patchLibraryItem, patchLibraryPreset, patchLibrarySettings, patchPoseTemplate, readLibrary, removeBrandProfile,
  removeLibraryItem, removeLibraryPreset, removePoseTemplate,
} from "../lib/library.mjs"
import { fail } from "../lib/errors.mjs"

const BRAND_ID = /^brand_[a-f0-9]{16}$/
const ID = /^asset_[a-f0-9]{16}$/
const POSE_ID = /^pose_(?:[a-z0-9][a-z0-9-]{1,40}|[a-f0-9]{16})$/
const PRESET_ID = /^preset_[a-f0-9]{16}$/
function assetId(value) {
  const id = String(value ?? "")
  if (!ID.test(id)) fail("BAD_REQUEST", "invalid library item id")
  return id
}

function brandId(value) {
  const id = String(value ?? "")
  if (!BRAND_ID.test(id)) fail("BAD_REQUEST", "invalid brand id")
  return id
}

function poseId(value) {
  const id = String(value ?? "")
  if (!POSE_ID.test(id)) fail("BAD_REQUEST", "invalid pose template id")
  return id
}

function presetId(value) {
  const id = String(value ?? "")
  if (!PRESET_ID.test(id)) fail("BAD_REQUEST", "invalid preset id")
  return id
}

export function register(r) {
  r.get("/api/library", async ctx => ({ status: 200, json: await readLibrary(ctx.registry.active) }))

  r.post("/api/library/brands", async ctx => ({ status: 201, json: { brand: await addBrandProfile(ctx.registry.active, await ctx.json()) } }))
  r.patch("/api/library/brands/:id", async ctx => ({ status: 200, json: { brand: await patchBrandProfile(ctx.registry.active, brandId(ctx.params.id), await ctx.json()) } }))
  r.delete("/api/library/brands/:id", async ctx => { await removeBrandProfile(ctx.registry.active, brandId(ctx.params.id)); return { status: 204 } })

  r.post("/api/library/poses", async ctx => ({ status: 201, json: { pose: await addPoseTemplate(ctx.registry.active, await ctx.json()) } }))
  r.patch("/api/library/poses/:id", async ctx => ({ status: 200, json: { pose: await patchPoseTemplate(ctx.registry.active, poseId(ctx.params.id), await ctx.json()) } }))
  r.delete("/api/library/poses/:id", async ctx => { await removePoseTemplate(ctx.registry.active, poseId(ctx.params.id)); return { status: 204 } })

  /* Preset — danh mục người dùng tự sửa. `GET /api/library` đã trả kèm mảng
     `presets`, nên ở đây chỉ cần ba cửa ghi; không có route đọc riêng để web
     không phải giữ hai nguồn sự thật cho cùng một kho. */
  r.post("/api/library/presets", async ctx => ({ status: 201, json: { preset: await addLibraryPreset(ctx.registry.active, await ctx.json()) } }))
  r.patch("/api/library/presets/:id", async ctx => ({ status: 200, json: { preset: await patchLibraryPreset(ctx.registry.active, presetId(ctx.params.id), await ctx.json()) } }))
  r.delete("/api/library/presets/:id", async ctx => { await removeLibraryPreset(ctx.registry.active, presetId(ctx.params.id)); return { status: 204 } })

  r.post("/api/library/items", async ctx => {
    const parts = parseMultipart(await ctx.body(ctx.limits.refFile), ctx.req.headers["content-type"])
    const file = parts.find(part => part.name === "file" && part.filename !== null)
    if (!file) fail("BAD_REQUEST", "multipart field `file` is required")
    const field = name => parts.find(part => part.name === name)?.data.toString("utf8").trim() ?? ""
    let skel
    if (field("skel")) {
      try { skel = JSON.parse(field("skel")) }
      catch { fail("BAD_REQUEST", "skel must be valid JSON") }
    }
    let tags, poses
    for (const key of ["tags", "poses"]) {
      if (!field(key)) continue
      try { if (key === "tags") tags = JSON.parse(field(key)); else poses = JSON.parse(field(key)) }
      catch { fail("BAD_REQUEST", `${key} must be valid JSON`) }
    }
    const item = await addLibraryItem(ctx.registry.active, {
      data: file.data,
      kind: field("kind"),
      group: field("group"),
      name: field("name") || file.filename,
      description: field("description"),
      tags,
      poses,
      cell: field("cell"),
      skel,
    })
    return { status: 201, json: { item } }
  })

  r.patch("/api/library/items/:id", async ctx => ({
    status: 200,
    json: { item: await patchLibraryItem(ctx.registry.active, assetId(ctx.params.id), await ctx.json()) },
  }))

  r.delete("/api/library/items/:id", async ctx => {
    await removeLibraryItem(ctx.registry.active, assetId(ctx.params.id))
    return { status: 204 }
  })

  r.get("/api/library/items/:id/file", async ctx => ({
    status: 200,
    file: await libraryItemFile(ctx.registry.active, assetId(ctx.params.id)),
    headers: { "Cache-Control": "private, max-age=3600" },
  }))

  r.patch("/api/library/settings", async ctx => ({
    status: 200,
    json: { settings: await patchLibrarySettings(ctx.registry.active, await ctx.json()) },
  }))
}
