/* project-templates.mjs — TEMPLATE CỦA NGƯỜI DÙNG: chụp phần DỰNG của một dự án để
 * mở dự án mới từ đó.
 *
 * Chủ sản phẩm (30/09/2026): «tôi muốn thêm 1 tính năng là save template nhé, ví dụ 1
 * app game user tạo, sẽ có nút save template (bao gồm cả save ảnh, setting..., khi tạo
 * mới 1 project -> sẽ có thể chọn template sẵn».
 *
 * KHÁC `lib/templates.mjs`: file đó là bản thiết kế TRỐNG mà mọi dự án mới nhận
 * (`buildTemplateContract`) + catalogue element chỉ-đọc. File này là thứ người dùng
 * TỰ LƯU, nằm ở `<ws>/.kitgen/templates/<tplId>/`.
 *
 * ╔══ TEMPLATE LÀ ĐIỂM XUẤT PHÁT, KHÔNG PHẢI BẢN SAO ══════════════════════════╗
 * ║ ĐI THEO: tài liệu composer (`workflow-draft.json` — mọi thẻ, dòng, pill,   ║
 * ║ cài đặt: chủ đề, phong cách, màu/thương hiệu, ảnh ngữ cảnh, số món mỗi     ║
 * ║ tấm, cách dán Figma…), NGUYÊN thư mục `refs/` (mọi ảnh người dùng đã đính), ║
 * ║ mô tả + tag của dự án, và ảnh bìa làm hình thu nhỏ.                        ║
 * ║                                                                          ║
 * ║ KHÔNG đi theo: `raw/` `kits/` `runs/` `logs/` `prompts/` `.history/` và    ║
 * ║ `contract.json`. Kết quả đã vẽ thuộc về dự án cũ; template là điểm xuất    ║
 * ║ phát. Dự án mở từ template nhận bản thiết kế trống như mọi dự án mới —     ║
 * ║ composer dựng lại nó ở cú bấm Vẽ đầu tiên, nên không có gì để mang theo.   ║
 * ║ (Muốn mang cả ảnh đã vẽ thì đã có «Nhân bản dự án».)                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * VÌ SAO CHÉP `refs/` NGUYÊN VẸN: mọi ảnh trong tài liệu composer là chuỗi TƯƠNG ĐỐI
 * `refs/<tên>` (pill `path`, `contextRefs[].path`, `shapeRef` của ô, `refPath` của dáng,
 * `poseSheet.paths`, giá trị của `brandAssets`/`shapeAssets`). Chép đúng tên, đúng chỗ
 * thì mọi tham chiếu còn sống mà không phải viết lại một chữ nào trong tài liệu. Kho
 * dùng chung (thương hiệu, preset, danh mục) vốn đã ở cấp workspace nên không cần mang.
 *
 * GHI NGUYÊN TỬ: dựng trọn template trong `.tmp-…` NGAY TRONG thư mục templates rồi
 * rename vào chỗ. Cùng ổ đĩa ⇒ rename là nguyên tử; mất điện giữa chừng chỉ để lại một
 * thư mục mở đầu bằng dấu chấm — tên đó không bao giờ khớp `RE_TEMPLATE_ID` nên không
 * bao giờ được liệt kê, và lượt liệt kê sau một giờ tự dọn nó.
 */
import { dirname, join } from "node:path"
import { mkdir } from "node:fs/promises"
import {
  copyFile, dirStats, ensureDir, exists, isDir, isFile, moveTree, readJsonFile, readdir,
  removeTree, renameAtomic, stat, walkFiles, writeJsonAtomic,
} from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { assertMatch, relPosix } from "./paths.mjs"
import {
  TEMPLATE_TRASH_PREFIX, newProjectId, projectDir, readProject, saveWorkflowDraft, slugify,
} from "./projects.mjs"

export const TEMPLATE_SCHEMA_VERSION = 1
/** Cùng khuôn với id dự án (`slug-4hex`). Không dấu chấm, không gạch chéo ⇒ đây là cửa
 *  chặn path traversal của MỌI route nhận `:id` template. */
export const RE_TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{2,47}$/
export const TEMPLATE_NAME_MAX = 80
export const TEMPLATE_DESCRIPTION_MAX = 2000
/** Trần dung lượng `refs/` chép vào một template. 200 MB — bằng trần upload của agent:
 *  một thư mục ảnh tham chiếu to hơn thế là dấu hiệu có thứ không phải ảnh tham chiếu. */
export const TEMPLATE_MAX_BYTES = 200 * 1024 * 1024
/* Tên thư mục trong thùng rác: `TEMPLATE_TRASH_PREFIX` (khai ở projects.mjs — nơi
   `listTrash`/`findInTrash` phải bỏ qua nó; khai ở đây là import vòng). */
export { TEMPLATE_TRASH_PREFIX }
/** Giữ template đã xoá bao lâu trước khi lượt xoá kế tiếp dọn hẳn. Cùng hạn với dự án. */
const TEMPLATE_TRASH_KEEP_MS = 30 * 864e5
const TMP_PREFIX = ".tmp-"
const TMP_STALE_MS = 3600e3
/** Tàn dư bản 09/09/2026 (xem routes/refs.mjs) — chép theo, nhưng không đếm là ảnh. */
const DESC_SUFFIX = ".desc.txt"

const DRAFT_FILE = "workflow-draft.json"
const META_FILE = "template.json"
const COVER_FILE = "cover.png"
const COMPOSER_DOC_VERSION = 1

function templateDir(ws, id) {
  assertMatch(RE_TEMPLATE_ID, id, "BAD_REQUEST", "templateId")
  return join(ws.templatesDir, id)
}

const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v)

function cleanName(raw) {
  const name = String(raw ?? "").trim()
  if (!name || name.length > TEMPLATE_NAME_MAX)
    fail("INVALID_NAME", `template name must be 1..${TEMPLATE_NAME_MAX} chars`)
  return name
}
const cleanDescription = raw => String(raw ?? "").trim().slice(0, TEMPLATE_DESCRIPTION_MAX)

/**
 * Đọc tài liệu composer của dự án. Ba ca KHÔNG chụp được, cùng một mã, khác `reason`:
 *   · `missing` — chưa lưu lần nào (dự án vừa tạo, chưa gõ gì);
 *   · `legacy`  — ô nhớ còn bản nháp WIZARD đời cũ (`docVersion` ≠ 1). Chụp nó vào
 *     template thì dự án mở từ template sẽ mang một bản nháp mà màn soạn không đọc
 *     được — và câu hỏi «thay bản nháp cũ» hiện ra ở một dự án VỪA TẠO;
 *   · `broken`  — JSON hỏng / thiếu khối composer.
 */
async function readComposerDraft(ws, projectId) {
  const file = join(projectDir(ws, projectId), DRAFT_FILE)
  if (!(await isFile(file)))
    fail("NO_COMPOSER_DRAFT", `project ${projectId} has no composer draft yet`, { details: { reason: "missing" } })
  let draft
  try { draft = await readJsonFile(file) }
  catch { fail("NO_COMPOSER_DRAFT", `project ${projectId} has an unreadable draft`, { details: { reason: "broken" } }) }
  if (!isRecord(draft) || draft.docVersion !== COMPOSER_DOC_VERSION)
    fail("NO_COMPOSER_DRAFT", `project ${projectId} holds a legacy wizard draft, not a composer document`,
      { details: { reason: "legacy" } })
  if (!isRecord(draft.composer))
    fail("NO_COMPOSER_DRAFT", `project ${projectId} draft has no composer`, { details: { reason: "broken" } })
  return draft
}

/** Chép mọi FILE của `src` sang `dst`, giữ nguyên đường tương đối. Symlink BỊ BỎ (cùng
 *  luật với `walkFiles`): một liên kết trong `refs/` trỏ ra ngoài dự án không được biến
 *  thành bản sao thật của file ngoài đó trong template. */
async function copyFiles(src, dst) {
  let files = 0, images = 0, bytes = 0
  for (const abs of await walkFiles(src)) {
    const rel = relPosix(src, abs)
    const to = join(dst, ...rel.split("/"))
    await mkdir(dirname(to), { recursive: true })
    await copyFile(abs, to)
    files++
    if (!rel.endsWith(DESC_SUFFIX)) images++
    bytes += (await stat(to)).size
  }
  return { files, images, bytes }
}

/** `template.json` hợp lệ ⇒ object đã chuẩn hoá; hỏng ⇒ null (caller coi như không có). */
async function readMeta(dir, id) {
  let meta
  try { meta = await readJsonFile(join(dir, META_FILE)) } catch { return null }
  if (!isRecord(meta) || meta.schemaVersion !== TEMPLATE_SCHEMA_VERSION || meta.id !== id) return null
  if (typeof meta.name !== "string" || !meta.name.trim()) return null
  if (!(await isFile(join(dir, DRAFT_FILE)))) return null
  const stats = isRecord(meta.stats) ? meta.stats : {}
  const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id,
    name: meta.name,
    description: typeof meta.description === "string" ? meta.description : "",
    tags: Array.isArray(meta.tags) ? meta.tags.map(String).slice(0, 12) : [],
    createdAt: typeof meta.createdAt === "string" ? meta.createdAt : null,
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : null,
    sourceProjectId: typeof meta.sourceProjectId === "string" ? meta.sourceProjectId : null,
    sourceProjectName: typeof meta.sourceProjectName === "string" ? meta.sourceProjectName : null,
    stats: { blocks: num(stats.blocks), refs: num(stats.refs), bytes: num(stats.bytes) },
    /* Hỏi ĐĨA, không tin cờ trong file: ảnh bìa bị ai đó xoá tay thì route ảnh trả 404
       mà danh sách vẫn hứa có ảnh — web sẽ ngồi đợi một tấm không bao giờ tới. */
    hasCover: await isFile(join(dir, COVER_FILE)),
  }
}

/** Một template, hoặc 404. Hỏng cũng là 404: template hỏng không hiện ở danh sách nào,
 *  nên một id trỏ vào nó chỉ có thể đến từ một danh sách cũ. */
export async function readTemplate(ws, id) {
  const dir = templateDir(ws, id)
  const meta = (await isDir(dir)) ? await readMeta(dir, id) : null
  if (!meta) fail("TEMPLATE_NOT_FOUND", `template ${id} not found`)
  return meta
}

/** Dọn `.tmp-…` bị bỏ lại bởi một lượt lưu chết giữa chừng (mất điện, agent bị giết). */
async function sweepStaleTemps(ws, ents) {
  const now = Date.now()
  for (const e of ents) {
    if (!e.isDirectory() || !e.name.startsWith(TMP_PREFIX)) continue
    const abs = join(ws.templatesDir, e.name)
    const st = await stat(abs).catch(() => null)
    if (st && now - st.mtimeMs > TMP_STALE_MS) await removeTree(abs).catch(() => {})
  }
}

/** Mọi template còn đọc được, MỚI LƯU TRƯỚC. Thư mục hỏng bị bỏ qua — không 500. */
export async function listTemplates(ws) {
  await ensureDir(ws.templatesDir)
  const ents = await readdir(ws.templatesDir, { withFileTypes: true }).catch(() => [])
  await sweepStaleTemps(ws, ents)
  const items = []
  for (const e of ents) {
    if (!e.isDirectory() || !RE_TEMPLATE_ID.test(e.name)) continue
    const meta = await readMeta(join(ws.templatesDir, e.name), e.name)
    if (meta) items.push(meta)
  }
  items.sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) || a.id.localeCompare(b.id))
  return items
}

/**
 * `POST /api/projects/:id/save-template`. Chụp dự án thành template, trả `template.json`.
 * `maxBytes` chỉ để ca test dựng được ca "quá nặng" mà không phải ghi 200 MB.
 */
export async function saveProjectAsTemplate(ws, projectId, input = {}, { maxBytes = TEMPLATE_MAX_BYTES } = {}) {
  const name = cleanName(input.name)
  const description = cleanDescription(input.description)
  if (!(await ws.writable())) fail("WORKSPACE_UNWRITABLE", `workspace ${ws.label} is not writable`)

  const project = await readProject(ws, projectId)
  if (project.broken) fail("PROJECT_BROKEN", "cannot save a broken project as a template")
  const draft = await readComposerDraft(ws, projectId)

  const src = projectDir(ws, projectId)
  const refsSrc = join(src, "refs")
  const { bytes: refBytes } = await dirStats(refsSrc)
  if (refBytes > maxBytes)
    fail("TEMPLATE_TOO_LARGE", `project refs are ${refBytes} bytes, template limit is ${maxBytes}`,
      { details: { bytes: refBytes, maxBytes } })

  await ensureDir(ws.templatesDir)
  let id = newProjectId(slugify(name))
  while (await exists(join(ws.templatesDir, id))) id = newProjectId(slugify(name))

  const tmp = join(ws.templatesDir, `${TMP_PREFIX}${id}-${process.pid}-${Date.now()}`)
  try {
    await ensureDir(tmp)
    const refs = await copyFiles(refsSrc, join(tmp, "refs"))
    await ensureDir(join(tmp, "refs"))          // template không ảnh vẫn có refs/ rỗng — dự án nào cũng có
    await writeJsonAtomic(join(tmp, DRAFT_FILE), draft)
    /* Ảnh bìa chỉ là HÌNH THU NHỎ để nhận ra template trong danh sách. Nó là KẾT QUẢ
       của dự án cũ nên dự án mở từ template KHÔNG nhận nó (xem createFromTemplate). */
    const cover = join(src, "cover", "cover.png")
    const hasCover = await isFile(cover)
    if (hasCover) await copyFile(cover, join(tmp, COVER_FILE))
    const now = new Date().toISOString()
    const { bytes } = await dirStats(tmp)
    const meta = {
      schemaVersion: TEMPLATE_SCHEMA_VERSION, id, name, description,
      tags: Array.isArray(project.tags) ? project.tags.map(String).slice(0, 12) : [],
      createdAt: now, updatedAt: now,
      sourceProjectId: projectId, sourceProjectName: project.name ?? projectId,
      stats: {
        blocks: Array.isArray(draft.composer.blocks) ? draft.composer.blocks.length : 0,
        refs: refs.images,
        bytes,
      },
      hasCover,
    }
    await writeJsonAtomic(join(tmp, META_FILE), meta)
    await renameAtomic(tmp, join(ws.templatesDir, id))
    return await readTemplate(ws, id)
  } catch (e) {
    await removeTree(tmp).catch(() => {})
    throw e
  }
}

/** `PATCH /api/templates/:id` — chỉ tên + mô tả. Tài liệu và ảnh của template bất biến:
 *  muốn đổi nội dung thì mở dự án, sửa, rồi lưu thành template mới. */
export async function patchTemplate(ws, id, patch = {}) {
  const current = await readTemplate(ws, id)
  const dir = templateDir(ws, id)
  const raw = await readJsonFile(join(dir, META_FILE))
  if (patch.name !== undefined) raw.name = cleanName(patch.name)
  if (patch.description !== undefined) raw.description = cleanDescription(patch.description)
  raw.updatedAt = new Date().toISOString()
  raw.hasCover = current.hasCover
  await writeJsonAtomic(join(dir, META_FILE), raw)
  return readTemplate(ws, id)
}

/** `DELETE /api/templates/:id` — XOÁ MỀM vào `.kitgen/trash/template-<mốc>-<id>/`.
 *  Không có màn khôi phục, nhưng một cú bấm nhầm vẫn còn đường lấy lại bằng tay trong
 *  30 ngày. Template HỎNG vẫn xoá được (chỉ cần thư mục tồn tại) — đó là cách duy nhất
 *  để dọn nó mà không phải mở Finder. */
export async function deleteTemplate(ws, id) {
  const dir = templateDir(ws, id)
  if (!(await isDir(dir))) fail("TEMPLATE_NOT_FOUND", `template ${id} not found`)
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
  await ensureDir(ws.trashDir)
  let dst = join(ws.trashDir, `${TEMPLATE_TRASH_PREFIX}${ts}-${id}`)
  for (let n = 2; await exists(dst); n++) dst = join(ws.trashDir, `${TEMPLATE_TRASH_PREFIX}${ts}-${id}-${n}`)
  await moveTree(dir, dst)
  await purgeOldTemplateTrash(ws).catch(() => {})
  return { ok: true }
}

async function purgeOldTemplateTrash(ws) {
  const cut = Date.now() - TEMPLATE_TRASH_KEEP_MS
  for (const e of await readdir(ws.trashDir, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || !e.name.startsWith(TEMPLATE_TRASH_PREFIX)) continue
    const m = /^template-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-/.exec(e.name)
    if (!m) continue
    const at = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
    if (at < cut) await removeTree(join(ws.trashDir, e.name)).catch(() => {})
  }
}

/** Tag của dự án mới: tag web gửi (chế độ làm việc) ∪ tag của template, không trùng. */
export function mergeTags(bodyTags, templateTags) {
  const out = []
  for (const t of [...(Array.isArray(bodyTags) ? bodyTags : []), ...(templateTags ?? [])]) {
    const s = String(t)
    if (!out.includes(s)) out.push(s)
  }
  return out.slice(0, 12)
}

/**
 * Đổ template vào một dự án VỪA TẠO (`createProjectDir` + contract trống đã xong).
 * Bản nháp đi qua `saveWorkflowDraft` — không ghi file thẳng — để `project.json`
 * nhận `workflow.updatedAt` (mốc mà web dùng làm `baseUpdatedAt`) và mọi luật của
 * đường lưu bản nháp (trần 2 MB, lịch sử) áp y như một lượt lưu thường.
 * Ném thì caller dọn dự án dở dang.
 */
export async function applyTemplateToProject(ws, tplId, projectId) {
  const dir = templateDir(ws, tplId)
  await copyFiles(join(dir, "refs"), join(projectDir(ws, projectId), "refs"))
  /* Bản soạn trong template hỏng (sửa tay, đĩa lỗi) ⇒ template HỎNG ⇒ 404 như mọi
     template hỏng khác (`readTemplate`), không phải một 500 «lỗi máy chủ». */
  let draft
  try { draft = await readJsonFile(join(dir, DRAFT_FILE)) } catch { draft = null }
  if (!isRecord(draft) || draft.docVersion !== COMPOSER_DOC_VERSION || !isRecord(draft.composer))
    fail("TEMPLATE_NOT_FOUND", `template ${tplId} has an unreadable composer document`, { details: { reason: "broken" } })
  /* `updatedAt` TRONG tài liệu là mốc "đã lưu lúc…" mà màn soạn hiện ra. Để nguyên thì
     dự án vừa tạo nói "Đã lưu" bằng giờ của ngày template được chụp. */
  const fresh = { ...draft, updatedAt: new Date().toISOString() }
  await saveWorkflowDraft(ws, projectId, { completed: false, draft: fresh })
}
