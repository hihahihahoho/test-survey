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
 *
 * ╔══ SỬA NỘI DUNG TEMPLATE (30/09/2026) — MƯỢN MỘT DỰ ÁN LÀM GIẤY NHÁP ═══════╗
 * ║ Màn soạn gắn chặt với DỰ ÁN (bản nháp, ảnh tham chiếu, thư viện, file…    ║
 * ║ đều đi theo `/api/projects/:id/…`). Dựng lại chừng ấy route cho template  ║
 * ║ là nhân đôi cả một bề mặt. Nên:                                          ║
 * ║   · MỞ phiên (`startTemplateEdit`) = tạo một DỰ ÁN LÀM VIỆC từ template,  ║
 * ║     y như «Tạo dự án từ template», đánh dấu `project.json.templateEdit`.  ║
 * ║     Dự án đó VÔ HÌNH ở mọi danh sách (projects.mjs `isWorkingProject`)    ║
 * ║     nhưng mọi route theo id chạy như thường — màn soạn sửa nó y như sửa   ║
 * ║     một dự án. Vẽ trong đó thì bị chặn (TEMPLATE_EDIT_NO_RUN).            ║
 * ║   · LƯU (`commitTemplateEdit`) = chép bản soạn + `refs/` của dự án làm    ║
 * ║     việc NGƯỢC vào template (đổi chỗ nguyên tử, bản cũ vào thùng rác),    ║
 * ║     rồi xoá hẳn dự án làm việc.                                           ║
 * ║   · HUỶ (`discardTemplateEdit`) = xoá hẳn dự án làm việc. Template không  ║
 * ║     hề bị chạm tới trong suốt phiên — huỷ là không có gì để hoàn tác.     ║
 * ║ SỰ THẬT VỀ PHIÊN nằm trong chính `project.json` của dự án làm việc (đúng  ║
 * ║ luật "thư mục là database" của projects.mjs), KHÔNG trong một file con   ║
 * ║ trỏ nào: con trỏ thì có thể trỏ vào một thư mục đã bị xoá tay, còn dấu   ║
 * ║ nằm trong project.json thì mất cùng lúc với chính dự án. Hai dự án cùng  ║
 * ║ nhận một template (agent chết giữa chừng, chép tay) ⇒ chọn cái MỚI NHẤT, ║
 * ║ cái kia bị dọn ở lượt mở phiên kế tiếp — không bao giờ ném.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import { dirname, join } from "node:path"
import { mkdir } from "node:fs/promises"
import {
  copyFile, dirStats, ensureDir, exists, isDir, isFile, moveTree, readFile, readJsonFile, readdir,
  removeTree, renameAtomic, stat, walkFiles, writeJsonAtomic,
} from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { RE_PROJECT_ID, assertMatch, relPosix } from "./paths.mjs"
import {
  TEMPLATE_TRASH_PREFIX, createProjectDir, idTaken, isWorkingProject, newProjectId, projectDir,
  readProject, saveWorkflowDraft, slugify,
} from "./projects.mjs"
import { writeContract } from "./contract.mjs"
import { buildTemplateContract } from "./templates.mjs"
import { thumbnail } from "./thumbs.mjs"

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
/** Bản MỚI đã dựng xong, đang ĐỔI CHỖ với bản cũ (`commitTemplateEdit` ④). Tên riêng — không
 *  phải `.tmp-` — vì hai thứ khác hẳn nhau khi agent chết: `.tmp-` là đồ dở dang (dọn), còn
 *  `.commit-<id>` là bản HOÀN CHỈNH mà bản cũ đã nhường chỗ (đẩy nốt vào chỗ). Dấu chấm đầu
 *  ⇒ không bao giờ khớp `RE_TEMPLATE_ID`, không bao giờ bị liệt kê như một template. */
const COMMIT_PREFIX = ".commit-"
/** Nơi dự án làm việc bị đẩy vào NGAY TRƯỚC khi xoá (trong `ws.cacheDir`). Xem `removeWorkingProject`. */
const DISCARD_DIR = "template-edit-discard"
/** Tàn dư bản 09/09/2026 (xem routes/refs.mjs) — chép theo, nhưng không đếm là ảnh. */
const DESC_SUFFIX = ".desc.txt"

const DRAFT_FILE = "workflow-draft.json"
const META_FILE = "template.json"
const COVER_FILE = "cover.png"
const COMPOSER_DOC_VERSION = 1
/** Phong cách đầu tiên của dự án làm việc — y hệt cái POST /api/projects tự đặt khi web
 *  không gửi `firstVariant`. Contract của dự án làm việc không bao giờ vào template (nó
 *  không được Vẽ), nên chỉ cần hợp lệ, không cần giống ai. */
const WORKING_FIRST_VARIANT = Object.freeze({ id: "phong-cach-1", vi: "Phong cách 1", style: "" })

function templateDir(ws, id) {
  assertMatch(RE_TEMPLATE_ID, id, "BAD_REQUEST", "templateId")
  return join(ws.templatesDir, id)
}

const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v)
/** Một dòng stderr, KHÔNG đường dẫn: mã lỗi hệ điều hành + id là đủ để lần ra. */
const note = msg => process.stderr.write(`[agent] ${msg}\n`)

function cleanName(raw) {
  const name = String(raw ?? "").trim()
  if (!name || name.length > TEMPLATE_NAME_MAX)
    fail("INVALID_NAME", `template name must be 1..${TEMPLATE_NAME_MAX} chars`)
  return name
}
const cleanDescription = raw => String(raw ?? "").trim().slice(0, TEMPLATE_DESCRIPTION_MAX)

/* ══ HAI KHOÁ, HAI VIỆC KHÁC NHAU ═══════════════════════════════════════════════
   Agent là tiến trình DUY NHẤT chạm workspace (instance-lock.mjs), nên khoá trong bộ nhớ
   là đủ — không cần khoá trên đĩa.

   ① KHOÁ PHIÊN, theo TỪNG template: mở phiên / lưu / huỷ / xoá template / đổi tên của
     CÙNG một template xếp hàng. Không xếp: bấm «Sửa» hai lần là hai dự án làm việc; đổi
     tên chen giữa lúc lưu đang dựng bản mới là tên mới bị bản mới (dựng từ meta cũ) đè
     mất; xoá template chen giữa lúc lưu là bản mới hiện ra lại sau khi đã xoá.

   ② CỔNG ĐỌC / ĐỔI CHỖ, theo WORKSPACE: đổi chỗ bản cũ ↔ bản mới là HAI lần rename, và
     giữa hai lần ấy thư mục template VẮNG MẶT. Người đọc (liệt kê, đọc meta, ảnh bìa, đổ
     template vào dự án mới) đi qua cổng ĐỌC — nhiều người đọc cùng lúc được; lượt đổi chỗ
     đi qua cổng GHI — đợi mọi người đọc đang dở xong hẳn, và người đọc mới đợi nó xong.
     Nhờ vậy không ai trong tiến trình này thấy khoảnh khắc "template biến mất", và đổ
     template vào dự án (chép refs RỒI mới đọc bản soạn — hai bước) không bao giờ nhận refs
     của bản cũ với bản soạn của bản mới. Cổng theo workspace chứ không theo template:
     liệt kê đọc CẢ thư mục, và lượt đổi chỗ chỉ dài hai lần rename — chặn cả workspace
     vài mili-giây rẻ hơn nhiều so với một phép liệt kê lỡ mất một template.

   THỨ TỰ LẤY KHOÁ LUÔN LÀ ① RỒI ②, KHÔNG BAO GIỜ NGƯỢC LẠI, và KHÔNG lồng hai lần ĐỌC vào
   nhau (người ghi đứng chờ giữa hai lần đọc lồng nhau là tắc vĩnh viễn). Không timer nào:
   mọi chỗ chờ là một Promise mà một thao tác đĩa đang chạy sẽ giải — vòng sự kiện không
   bao giờ cạn giữa chừng (xem `renameAtomic`). */
const sessionLocks = new WeakMap()
function withSessionLock(ws, id, fn) {
  let m = sessionLocks.get(ws)
  if (!m) sessionLocks.set(ws, m = new Map())
  const prev = m.get(id) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  const tail = run.catch(() => {})
  m.set(id, tail)
  tail.then(() => { if (m.get(id) === tail) m.delete(id) })
  return run
}

const gates = new WeakMap()
function gateOf(ws) {
  let g = gates.get(ws)
  if (!g) gates.set(ws, g = { readers: 0, swapping: null, drained: null })
  return g
}
async function withTemplatesRead(ws, fn) {
  const g = gateOf(ws)
  while (g.swapping) await g.swapping
  g.readers++
  try { return await fn() }
  finally {
    g.readers--
    if (g.readers === 0 && g.drained) { const wake = g.drained; g.drained = null; wake() }
  }
}
async function withTemplatesSwap(ws, fn) {
  const g = gateOf(ws)
  while (g.swapping) await g.swapping
  let release
  g.swapping = new Promise(r => { release = r })
  try {
    while (g.readers > 0) await new Promise(r => { g.drained = r })
    return await fn()
  } finally { g.swapping = null; release() }
}

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

/** Đời NỘI DUNG của template: 0 lúc chụp, +1 mỗi lần lưu phiên sửa. KHÔNG phải `updatedAt`
 *  — đổi tên cũng đẩy `updatedAt`, mà đổi tên thì không được làm phiên sửa đang mở trở
 *  thành "cũ". Số nguyên tăng dần thay cho mốc giờ: đồng hồ máy lùi (NTP chỉnh) không bao
 *  giờ khiến một phiên đang sống bị coi là đồ bỏ. Nội bộ — không ra API. */
const revisionOf = raw => (Number.isInteger(raw?.contentRevision) && raw.contentRevision >= 0 ? raw.contentRevision : 0)

/** `template.json` hợp lệ ⇒ {meta đã chuẩn hoá, revision}; hỏng ⇒ null (caller coi như không có). */
async function loadMeta(dir, id) {
  let meta
  try { meta = await readJsonFile(join(dir, META_FILE)) } catch { return null }
  if (!isRecord(meta) || meta.schemaVersion !== TEMPLATE_SCHEMA_VERSION || meta.id !== id) return null
  if (typeof meta.name !== "string" || !meta.name.trim()) return null
  if (!(await isFile(join(dir, DRAFT_FILE)))) return null
  const stats = isRecord(meta.stats) ? meta.stats : {}
  const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0)
  return {
    revision: revisionOf(meta),
    meta: {
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
    },
  }
}

/**
 * LƯỢT LƯU CHẾT GIỮA HAI LẦN RENAME ⇒ ĐẨY NỐT BẢN MỚI VÀO CHỖ.
 * `.commit-<id>` chỉ tồn tại khi bản mới đã dựng XONG (nó được đổi tên từ `.tmp-` ở bước
 * cuối cùng của lượt dựng), nên:
 *   · `<id>` vắng mặt ⇒ bản cũ đã sang thùng rác mà bản mới chưa kịp vào ⇒ đẩy vào — đây
 *     là lựa chọn DUY NHẤT để template không biến mất khỏi danh sách;
 *   · `<id>` còn đó ⇒ lượt lưu chết TRƯỚC khi chạm bản cũ (hoặc đã lùi lại được) ⇒ bản mới
 *     là đồ bỏ: phiên sửa vẫn còn nguyên, bấm Lưu lại là xong.
 * Chỉ gọi dưới cổng ĐỌC (hoặc lúc khởi động): lượt đổi chỗ đang chạy của CHÍNH tiến trình
 * này giữ cổng GHI suốt quãng `.commit-<id>` tồn tại, nên người đọc không bao giờ thấy
 * `.commit-<id>` của một lượt còn sống. Hai người đọc cùng dọn một lúc thì một người rename
 * trượt (ENOENT) — nuốt, vì người kia đã làm xong đúng việc đó.
 * @returns true nếu vừa đẩy được một bản vào chỗ.
 */
async function recoverCommit(ws, id) {
  const staged = join(ws.templatesDir, COMMIT_PREFIX + id)
  if (!(await isDir(staged))) return false
  const dir = join(ws.templatesDir, id)
  if (await exists(dir)) { await removeTree(staged).catch(() => {}); return false }
  /* Bản dựng không đọc được (đĩa hỏng giữa chừng) thì KHÔNG đẩy và KHÔNG xoá: đẩy vào là
     một template hỏng, xoá là mất bản duy nhất còn lại ngoài thùng rác. Để người cứu tay. */
  if (!(await loadMeta(staged, id))) return false
  try { await renameAtomic(staged, dir); return true }
  catch { return false }
}

async function recoverCommits(ws, ents) {
  let any = false
  for (const e of ents) {
    if (!e.isDirectory() || !e.name.startsWith(COMMIT_PREFIX)) continue
    const id = e.name.slice(COMMIT_PREFIX.length)
    if (RE_TEMPLATE_ID.test(id) && (await recoverCommit(ws, id))) any = true
  }
  return any
}

/** {meta, revision} của một template, đọc dưới cổng ĐỌC; vắng/hỏng ⇒ 404. */
async function loadTemplate(ws, id) {
  const dir = templateDir(ws, id)
  const got = await withTemplatesRead(ws, async () => {
    if (!(await isDir(dir))) await recoverCommit(ws, id)
    return (await isDir(dir)) ? loadMeta(dir, id) : null
  })
  if (!got) fail("TEMPLATE_NOT_FOUND", `template ${id} not found`)
  return got
}

/* ══ PHIÊN SỬA: ĐỌC TỪ project.json CỦA DỰ ÁN LÀM VIỆC ═══════════════════════════ */

/**
 * Mọi dự án đang NHẬN một template (`project.json.templateEdit`), đọc thẳng từ đĩa.
 * `ready` = đã đổ template xong (bản soạn là thứ ghi CUỐI CÙNG của `applyTemplateToProject`,
 * sau toàn bộ `refs/`) — một dự án có dấu mà chưa có bản soạn là lượt mở phiên chết giữa
 * chừng, chưa từng được trao cho web.
 */
async function scanEditClaims(ws, onlyTemplateId = null) {
  const out = []
  const ents = await readdir(ws.projectsDir, { withFileTypes: true }).catch(() => [])
  for (const e of ents) {
    if (!e.isDirectory() || !RE_PROJECT_ID.test(e.name)) continue
    const dir = join(ws.projectsDir, e.name)
    const p = await readJsonFile(join(dir, "project.json")).catch(() => null)
    if (!isWorkingProject(p)) continue
    const te = p.templateEdit
    if (onlyTemplateId !== null && te.templateId !== onlyTemplateId) continue
    out.push({
      projectId: e.name,
      templateId: te.templateId,
      startedAt: typeof te.startedAt === "string" ? te.startedAt : null,
      revision: revisionOf({ contentRevision: te.templateRevision }),
      ready: await isFile(join(dir, DRAFT_FILE)),
    })
  }
  return out
}

/** Phiên ĐANG SỐNG của một template: đã sẵn sàng, cùng đời nội dung với template hiện tại
 *  (phiên của đời trước là đồ bỏ — nội dung của nó hoặc đã được lưu, hoặc đã bị một lần
 *  lưu khác thay thế). Nhiều phiên cùng sống ⇒ cái MỚI NHẤT. */
function liveClaim(claims, templateId, revision) {
  const mine = claims.filter(c => c.templateId === templateId && c.ready && c.revision === revision)
  mine.sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")) ||
    b.projectId.localeCompare(a.projectId))
  return mine[0] ?? null
}
const editingOf = claim => (claim ? { projectId: claim.projectId, startedAt: claim.startedAt } : null)

/**
 * XOÁ HẲN một dự án làm việc — giấy nháp, KHÔNG vào thùng rác.
 * Đẩy cả thư mục ra khỏi `projects/` bằng MỘT lần rename trước, rồi mới xoá: `rm` đệ quy
 * mà hỏng giữa chừng (Windows: một file còn bị giữ) để lại một thư mục dự án mất nửa ruột
 * — có khi mất đúng project.json, tức thành rác không thuộc danh sách nào mà vẫn chiếm id.
 * Rename thì hoặc đi trọn, hoặc không đi; phần xoá hỏng chỉ còn là rác trong cache, lượt
 * quét lúc khởi động dọn nốt. Đã vắng (ai đó dọn trước) ⇒ coi như xong.
 */
let discardSeq = 0
async function removeWorkingProject(ws, projectId) {
  const dir = projectDir(ws, projectId)
  const scratch = join(ws.cacheDir, DISCARD_DIR, `${projectId}-${process.pid}-${Date.now()}-${++discardSeq}`)
  try { await moveTree(dir, scratch) }
  catch (e) { if (e?.code === "ENOENT") return; throw e }
  await removeTree(scratch).catch(e =>
    note(`dự án làm việc ${projectId}: đã rời projects/ nhưng chưa xoá hết (${e?.code ?? "?"}) — lượt khởi động sau dọn nốt`))
}

/** Một template, hoặc 404. Hỏng cũng là 404: template hỏng không hiện ở danh sách nào,
 *  nên một id trỏ vào nó chỉ có thể đến từ một danh sách cũ.
 *  `editing` = phiên sửa đang sống ({projectId, startedAt}) hoặc null. */
export async function readTemplate(ws, id) {
  const { meta, revision } = await loadTemplate(ws, id)
  return { ...meta, editing: editingOf(liveClaim(await scanEditClaims(ws, id), id, revision)) }
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
  const loaded = await withTemplatesRead(ws, async () => {
    const scan = () => readdir(ws.templatesDir, { withFileTypes: true }).catch(() => [])
    let ents = await scan()
    if (await recoverCommits(ws, ents)) ents = await scan()
    await sweepStaleTemps(ws, ents)
    const out = []
    for (const e of ents) {
      if (!e.isDirectory() || !RE_TEMPLATE_ID.test(e.name)) continue
      const got = await loadMeta(join(ws.templatesDir, e.name), e.name)
      if (got) out.push(got)
    }
    return out
  })
  /* MỘT lượt quét dự án cho cả danh sách — không quét lại cho từng template. */
  const claims = await scanEditClaims(ws)
  const items = loaded.map(({ meta, revision }) =>
    ({ ...meta, editing: editingOf(liveClaim(claims, meta.id, revision)) }))
  items.sort((a, b) =>
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) || a.id.localeCompare(b.id))
  return items
}

/**
 * `GET /api/templates/:id/cover` — ẢNH ĐỌC TRỌN DƯỚI CỔNG ĐỌC.
 * Trả `{file}` (bản thu nhỏ trong cache — nằm NGOÀI thư mục template, lượt đổi chỗ không
 * chạm tới) hoặc `{buffer, mtimeMs}` (ảnh gốc, đã đọc xong vào bộ nhớ). Không trả đường dẫn
 * ảnh gốc để `sendFile` mở SAU khi rời cổng: giữa hai lúc đó một lượt lưu có thể vừa đẩy
 * thư mục template sang thùng rác ⇒ 404 cho một ảnh vẫn còn đó. Đọc vào bộ nhớ còn có lợi
 * thứ hai cho Windows: không fd nào của ảnh bìa nằm mở trong thư mục template khi client
 * tải chậm — thứ từng làm xoá template trả 423 (routes/templates.mjs, bản 3.0.15).
 */
export async function readTemplateCover(ws, id, width = null) {
  const dir = templateDir(ws, id)
  return withTemplatesRead(ws, async () => {
    if (!(await isDir(dir))) await recoverCommit(ws, id)
    const got = (await isDir(dir)) ? await loadMeta(dir, id) : null
    if (!got) fail("TEMPLATE_NOT_FOUND", `template ${id} not found`)
    if (!got.meta.hasCover) fail("NOT_FOUND", `template ${id} has no cover`)
    const abs = join(dir, COVER_FILE)
    if (width) {
      const t = await thumbnail(ws, abs, width)
      if (t.resized) return { file: t.path, resized: true }
    }
    const st = await stat(abs)
    return { buffer: await readFile(abs), mtimeMs: st.mtimeMs, resized: false }
  })
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
  /* Dự án làm việc của một phiên sửa template: «Lưu thành template» ở đây là tách ra một
     template THỨ HAI từ giấy nháp của template thứ nhất — trong khi nút người dùng cần là
     «Lưu vào template» (commit). Chặn, cùng mã với lượt Vẽ: cùng một câu cho web nói. */
  if (isWorkingProject(project))
    fail("TEMPLATE_EDIT_NO_RUN", `project ${projectId} is a template-edit working project; commit the edit instead`,
      { details: { action: "save-template", templateId: project.templateEdit.templateId } })
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

/** `PATCH /api/templates/:id` — chỉ tên + mô tả. Nội dung (bản soạn + ảnh) đổi qua phiên
 *  sửa (`startTemplateEdit` → `commitTemplateEdit`), không qua đây.
 *  Đi dưới KHOÁ PHIÊN: đổi tên giữa lúc một lượt lưu đang dựng bản mới thì hoặc xong
 *  TRƯỚC (lượt lưu đọc được tên mới), hoặc đợi SAU (ghi vào bản mới) — không bao giờ bị
 *  bản mới đè mất, và không bao giờ ghi vào khoảnh khắc thư mục template vắng mặt
 *  (`writeJsonAtomic` sẽ DỰNG LẠI thư mục chỉ với mỗi template.json, chặn đường bản mới). */
export async function patchTemplate(ws, id, patch = {}) {
  const dir = templateDir(ws, id)
  return withSessionLock(ws, id, async () => {
    const { meta: current } = await loadTemplate(ws, id)
    const raw = await readJsonFile(join(dir, META_FILE))
    if (patch.name !== undefined) raw.name = cleanName(patch.name)
    if (patch.description !== undefined) raw.description = cleanDescription(patch.description)
    raw.updatedAt = new Date().toISOString()
    raw.hasCover = current.hasCover
    await writeJsonAtomic(join(dir, META_FILE), raw)
    return readTemplate(ws, id)
  })
}

/** Chỗ trong thùng rác cho một bản template: `template-<yyyymmdd-hhmmss>-<id>[-n]`. Cùng
 *  khuôn cho xoá template và cho bản CŨ mà một lần lưu phiên sửa thay ra — để
 *  `purgeOldTemplateTrash` dọn cả hai sau 30 ngày bằng một luật. */
async function templateTrashSlot(ws, id) {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
  await ensureDir(ws.trashDir)
  let dst = join(ws.trashDir, `${TEMPLATE_TRASH_PREFIX}${ts}-${id}`)
  for (let n = 2; await exists(dst); n++) dst = join(ws.trashDir, `${TEMPLATE_TRASH_PREFIX}${ts}-${id}-${n}`)
  return dst
}

/** `DELETE /api/templates/:id` — XOÁ MỀM vào `.kitgen/trash/template-<mốc>-<id>/`.
 *  Không có màn khôi phục, nhưng một cú bấm nhầm vẫn còn đường lấy lại bằng tay trong
 *  30 ngày. Template HỎNG vẫn xoá được (chỉ cần thư mục tồn tại) — đó là cách duy nhất
 *  để dọn nó mà không phải mở Finder.
 *  Phiên sửa đang mở (nếu có) đi theo: dự án làm việc của một template đã xoá không còn
 *  chỗ nào để lưu vào, giữ nó là giữ rác vô hình. Xoá template TRƯỚC, dự án làm việc SAU:
 *  xoá template hỏng (Windows giữ file) thì phiên sửa — công của người dùng — còn nguyên. */
export async function deleteTemplate(ws, id) {
  const dir = templateDir(ws, id)
  return withSessionLock(ws, id, async () => {
    if (!(await isDir(dir))) await withTemplatesRead(ws, () => recoverCommit(ws, id))
    if (!(await isDir(dir))) fail("TEMPLATE_NOT_FOUND", `template ${id} not found`)
    const dst = await templateTrashSlot(ws, id)
    /* Dưới cổng GHI: một lượt đổ template này vào dự án mới đang chép dở thì xong trước. */
    await withTemplatesSwap(ws, () => moveTree(dir, dst))
    await purgeOldTemplateTrash(ws).catch(() => {})
    for (const c of await scanEditClaims(ws, id)) {
      await removeWorkingProject(ws, c.projectId).catch(e =>
        note(`template ${id} đã xoá nhưng chưa xoá được dự án làm việc ${c.projectId} (${e?.code ?? "?"}) — lượt khởi động sau dọn`))
    }
    return { ok: true }
  })
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
 * Cả hai bước (chép refs, đọc bản soạn) nằm dưới MỘT lần cổng ĐỌC: lượt lưu phiên sửa
 * đổi chỗ template giữa hai bước là dự án mới nhận refs của bản cũ với bản soạn của bản
 * mới — một cặp chưa từng tồn tại, pill trỏ vào ảnh không có.
 */
export async function applyTemplateToProject(ws, tplId, projectId) {
  const dir = templateDir(ws, tplId)
  const draft = await withTemplatesRead(ws, async () => {
    await copyFiles(join(dir, "refs"), join(projectDir(ws, projectId), "refs"))
    try { return await readJsonFile(join(dir, DRAFT_FILE)) } catch { return null }
  })
  /* Bản soạn trong template hỏng (sửa tay, đĩa lỗi) ⇒ template HỎNG ⇒ 404 như mọi
     template hỏng khác (`readTemplate`), không phải một 500 «lỗi máy chủ». */
  if (!isRecord(draft) || draft.docVersion !== COMPOSER_DOC_VERSION || !isRecord(draft.composer))
    fail("TEMPLATE_NOT_FOUND", `template ${tplId} has an unreadable composer document`, { details: { reason: "broken" } })
  /* `updatedAt` TRONG tài liệu là mốc "đã lưu lúc…" mà màn soạn hiện ra. Để nguyên thì
     dự án vừa tạo nói "Đã lưu" bằng giờ của ngày template được chụp. */
  const fresh = { ...draft, updatedAt: new Date().toISOString() }
  await saveWorkflowDraft(ws, projectId, { completed: false, draft: fresh })
}

/**
 * Tạo một dự án từ template: thư mục + project.json → contract trống → đổ template vào.
 * MỘT đường cho cả «Tạo dự án từ template» (POST /api/projects + fromTemplate) lẫn dự án
 * làm việc của phiên sửa (`templateEdit` khác null) — hai đường tự viết là hai chỗ để quên
 * một bước (contract, dọn dở dang) ở đúng một đường.
 * Hỏng giữa chừng ⇒ dọn NGUYÊN dự án dở dang: một dự án có tên mà thiếu nửa ảnh là thứ tệ
 * nhất để trao cho người dùng — trông như thành công, rồi hỏng ở cú bấm Vẽ đầu tiên. Chỉ
 * dọn thư mục VỪA TẠO: `createProjectDir` ném (id trùng) thì không tới được khối dọn.
 */
export async function createProjectFromTemplate(ws, tplId, { id, name, slug, description, tags, firstVariant, templateEdit = null }) {
  const { dir } = await createProjectDir(ws, { id, name, slug, description, tags, templateEdit })
  try {
    await writeContract(ws, id, buildTemplateContract(firstVariant), { ifMatch: 0 })
    await applyTemplateToProject(ws, tplId, id)
  } catch (e) {
    await removeTree(dir).catch(() => {})
    throw e
  }
}

/* ══ SỬA NỘI DUNG TEMPLATE ═══════════════════════════════════════════════════════ */

/**
 * `POST /api/templates/:id/edit` — mở (hoặc MỞ LẠI) phiên sửa.
 * Đã có phiên sống ⇒ trả đúng dự án đó (`resumed: true`), KHÔNG tạo cái thứ hai: web mở
 * lại màn sửa sau khi tải lại trang, hay người dùng bấm «Sửa» ở tab thứ hai, đều phải
 * về đúng tờ giấy nháp đang có công của họ. Dự án nhận template này mà KHÔNG phải phiên
 * sống (chưa đổ xong, đời cũ, trùng) bị dọn ở đây — đây là chỗ duy nhất ngoài lúc khởi
 * động biết chắc không ai khác đang dùng chúng (khoá phiên).
 * @returns {{projectId: string, resumed: boolean}} — route tự dựng `project` + `template`.
 */
export async function startTemplateEdit(ws, tplId) {
  templateDir(ws, tplId)                                   // id sai khuôn ⇒ 400 trước mọi thứ
  return withSessionLock(ws, tplId, async () => {
    const { meta: tpl, revision } = await loadTemplate(ws, tplId)
    const claims = await scanEditClaims(ws, tplId)
    const live = liveClaim(claims, tplId, revision)
    for (const c of claims) {
      if (c === live) continue
      await removeWorkingProject(ws, c.projectId).catch(e =>
        note(`template ${tplId}: chưa dọn được dự án làm việc bỏ dở ${c.projectId} (${e?.code ?? "?"})`))
    }
    if (live) return { projectId: live.projectId, resumed: true }

    if (!(await ws.writable())) fail("WORKSPACE_UNWRITABLE", `workspace ${ws.label} is not writable`)
    /* `slug` phải qua RE_SLUG (≥ 3 ký tự) — template tên "X" cho slugify "x". Cùng cách
       `newProjectId` tự vá cho id, để slug và id của dự án làm việc cùng một gốc. */
    const s = slugify(tpl.name)
    const slug = s.length >= 3 ? s : `${s}-kit`
    let id = newProjectId(slug)
    for (let n = 0; n < 16 && (await idTaken(ws, id)); n++) id = newProjectId(slug)
    const templateEdit = {
      templateId: tpl.id,
      templateName: tpl.name,
      startedAt: new Date().toISOString(),
      templateUpdatedAt: tpl.updatedAt,
      templateRevision: revision,           // nội bộ: đời nội dung lúc mở — xem `revisionOf`
    }
    await createProjectFromTemplate(ws, tpl.id, {
      id, name: tpl.name, slug, description: tpl.description, tags: tpl.tags,
      firstVariant: WORKING_FIRST_VARIANT, templateEdit,
    })
    return { projectId: id, resumed: false }
  })
}

/**
 * `POST /api/templates/:id/edit/commit` — LƯU phiên sửa vào template.
 *
 * ╔══ NGUYÊN TỬ: NGƯỜI ĐỌC THẤY TRỌN BẢN CŨ HOẶC TRỌN BẢN MỚI, MẤT ĐIỆN Ở ĐÂU CŨNG CÒN ═╗
 * ║ ① Dựng TRỌN bản mới trong `.tmp-<id>-…` (refs, bản soạn, bìa chép từ bản hiện tại, ║
 * ║   meta GHI CUỐI). Chết ở đây ⇒ rác `.tmp-`, template chưa bị chạm; lượt liệt kê   ║
 * ║   dọn sau một giờ.                                                               ║
 * ║ ② Dưới cổng GHI: `.tmp-…` → `.commit-<id>` (đánh dấu "trọn vẹn, sắp đổi chỗ").    ║
 * ║ ③ Bản hiện tại → `trash/template-<mốc>-<id>` (cùng khuôn với xoá template ⇒ 30    ║
 * ║   ngày sau tự dọn; trong 30 ngày đó nó là bản sao lưu để cứu tay).               ║
 * ║ ④ `.commit-<id>` → `<id>`.                                                        ║
 * ║ Giữa ③ và ④ template VẮNG MẶT trong vài mili-giây. Người đọc CỦA TIẾN TRÌNH NÀY   ║
 * ║ không bao giờ thấy khoảnh khắc đó (cổng GHI). Agent chết đúng khoảnh khắc đó ⇒    ║
 * ║ `.commit-<id>` trọn vẹn nằm đợi, `<id>` vắng ⇒ lượt đọc/liệt kê kế tiếp (hoặc lượt ║
 * ║ khởi động) đẩy nốt nó vào chỗ (`recoverCommit`). ④ hỏng (Windows giữ file) ⇒ lùi ║
 * ║ ③ lại; lùi cũng hỏng ⇒ để nguyên cho `recoverCommit`, cũng là đẩy tới.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════╝
 *
 * Tên / mô tả / tag / createdAt / nguồn / bìa lấy từ meta HIỆN TẠI của template (đọc dưới
 * khoá phiên — đổi tên giữa phiên không bị mất), KHÔNG từ dự án làm việc: tên của tờ nháp
 * không phải tên của template. `contentRevision` +1 ⇒ mọi dự án làm việc của đời trước
 * (kể cả chính cái vừa lưu, nếu xoá nó hỏng) thành đồ bỏ, không bao giờ được «mở lại».
 * Sau khi đổi chỗ xong, lượt lưu ĐÃ THÀNH CÔNG — xoá dự án làm việc hỏng chỉ là một dòng
 * log, không phải lỗi trả về.
 *
 * `maxBytes`, `beforeSwap`, `betweenRenames` chỉ để ca test: dựng ca "quá nặng" không phải
 * ghi 200 MB, và GIỮ MỞ hai khoảnh khắc nguy hiểm đủ lâu để chứng minh không ai lọt vào —
 * sau khi đã đọc meta mà trước khi đổi chỗ (một lần đổi tên lọt vào đây là bị bản mới đè
 * mất), và giữa ③ với ④ (template vắng mặt). Khoảnh khắc vài mili-giây thì một phép thử
 * đua ngẫu nhiên không bao giờ trúng.
 */
export async function commitTemplateEdit(ws, tplId, {
  maxBytes = TEMPLATE_MAX_BYTES, beforeSwap = null, betweenRenames = null,
} = {}) {
  const dir = templateDir(ws, tplId)
  return withSessionLock(ws, tplId, async () => {
    const { meta: current, revision } = await withTemplatesRead(ws, async () => {
      if (!(await isDir(dir))) await recoverCommit(ws, tplId)
      return (await isDir(dir)) ? loadMeta(dir, tplId) : null
    }) ?? { meta: null, revision: null }
    const claims = await scanEditClaims(ws, tplId)
    const session = current ? liveClaim(claims, tplId, revision) : null
    if (!session) fail("TEMPLATE_EDIT_NOT_FOUND", `template ${tplId} has no open edit session`)
    if (!(await ws.writable())) fail("WORKSPACE_UNWRITABLE", `workspace ${ws.label} is not writable`)

    const draft = await readComposerDraft(ws, session.projectId)
    const refsSrc = join(projectDir(ws, session.projectId), "refs")
    const { bytes: refBytes } = await dirStats(refsSrc)
    if (refBytes > maxBytes)
      fail("TEMPLATE_TOO_LARGE", `project refs are ${refBytes} bytes, template limit is ${maxBytes}`,
        { details: { bytes: refBytes, maxBytes } })

    const tmp = join(ws.templatesDir, `${TMP_PREFIX}${tplId}-${process.pid}-${Date.now()}`)
    const staged = join(ws.templatesDir, COMMIT_PREFIX + tplId)
    try {
      /* ① dựng trọn bản mới */
      await ensureDir(tmp)
      const refs = await copyFiles(refsSrc, join(tmp, "refs"))
      await ensureDir(join(tmp, "refs"))
      await writeJsonAtomic(join(tmp, DRAFT_FILE), draft)
      /* Bìa đi theo bản hiện tại, nguyên bytes. KHÔNG cố giữ mtime bằng `utimes`: nó đi qua
         một số thực tính bằng GIÂY nên lệch cả mili-giây (ca test bắt được), tức ETag dựng
         từ mtime vẫn đổi. ETag của ảnh gốc vì thế dựng từ NỘI DUNG (routes/templates.mjs). */
      const coverSrc = join(dir, COVER_FILE)
      const hasCover = await isFile(coverSrc)
      if (hasCover) await copyFile(coverSrc, join(tmp, COVER_FILE))
      const { bytes } = await dirStats(tmp)
      const raw = await readJsonFile(join(dir, META_FILE))
      /* `updatedAt` phải TIẾN ngặt: lưu ngay sau một lần đổi tên trong cùng mili-giây mà
         mang cùng mốc thì web (so mốc để biết template vừa đổi) tưởng chưa có gì xảy ra. */
      let now = Date.now()
      const prevMs = Date.parse(current.updatedAt ?? "")
      if (Number.isFinite(prevMs) && now <= prevMs) now = prevMs + 1
      const meta = {
        ...raw,
        schemaVersion: TEMPLATE_SCHEMA_VERSION, id: tplId,
        name: current.name, description: current.description, tags: current.tags,
        createdAt: current.createdAt, updatedAt: new Date(now).toISOString(),
        sourceProjectId: current.sourceProjectId, sourceProjectName: current.sourceProjectName,
        stats: {
          blocks: Array.isArray(draft.composer.blocks) ? draft.composer.blocks.length : 0,
          refs: refs.images,
          bytes,
        },
        hasCover,
        contentRevision: revision + 1,
      }
      await writeJsonAtomic(join(tmp, META_FILE), meta)

      if (beforeSwap) await beforeSwap().catch(() => {})
      await withTemplatesSwap(ws, async () => {
        /* ② — `.commit-<id>` sót từ một lượt chết mà chưa ai dọn: template đang ở chỗ
           (đã kiểm ở đầu), nên nó chắc chắn là đồ bỏ. */
        await removeTree(staged).catch(() => {})
        await renameAtomic(tmp, staged)
        /* ③ */
        const old = await templateTrashSlot(ws, tplId)
        try { await moveTree(dir, old) }
        catch (e) { await removeTree(staged).catch(() => {}); throw e }
        if (betweenRenames) await betweenRenames().catch(() => {})
        /* ④ */
        try { await renameAtomic(staged, dir) }
        catch (e) {
          try { await moveTree(old, dir); await removeTree(staged).catch(() => {}) }
          catch { note(`template ${tplId}: đổi chỗ hỏng, lùi cũng hỏng — bản mới nằm đợi, lượt đọc kế tiếp đẩy vào`) }
          throw e
        }
      })
    } catch (e) {
      await removeTree(tmp).catch(() => {})
      throw e
    }
    await purgeOldTemplateTrash(ws).catch(() => {})

    /* Đã lưu. Mọi dự án nhận template này giờ là đồ bỏ (đời nội dung vừa tăng). */
    for (const c of claims) {
      await removeWorkingProject(ws, c.projectId).catch(e =>
        note(`template ${tplId} đã lưu nhưng chưa xoá được dự án làm việc ${c.projectId} (${e?.code ?? "?"}) — lượt mở phiên/khởi động sau dọn`))
    }
    return readTemplate(ws, tplId)
  })
}

/**
 * `DELETE /api/templates/:id/edit` — HUỶ phiên sửa: xoá hẳn MỌI dự án đang nhận template
 * này (không thùng rác — giấy nháp). Template không bị chạm.
 * Không có phiên ⇒ vẫn `{ok:true}`, KỂ CẢ khi template không tồn tại: thứ người gọi cần
 * sau lệnh này là "không còn phiên sửa nào", và điều đó đúng. Trả 404 thì nút «Huỷ» ở một
 * tab cũ (template đã bị xoá ở tab khác) thành một lỗi đỏ cho một việc đã xong.
 */
export async function discardTemplateEdit(ws, tplId) {
  templateDir(ws, tplId)
  return withSessionLock(ws, tplId, async () => {
    let first = null
    for (const c of await scanEditClaims(ws, tplId)) {
      try { await removeWorkingProject(ws, c.projectId) }
      catch (e) { first ??= e }
    }
    if (first) throw first
    return { ok: true }
  })
}

/** `DELETE /api/projects/:id` trên một DỰ ÁN LÀM VIỆC: xoá hẳn như huỷ phiên, dưới khoá phiên
 *  của template nó nhận (không chen vào giữa một lượt lưu đang đọc chính nó). */
export async function discardWorkingProject(ws, projectId, templateId) {
  return withSessionLock(ws, templateId, () => removeWorkingProject(ws, projectId))
}

/**
 * LÚC KHỞI ĐỘNG — chỗ duy nhất biết chắc không lượt mở/lưu/huỷ nào đang chạy:
 *   · đẩy nốt bản mới của lượt lưu chết giữa hai lần rename (`recoverCommit`);
 *   · xoá dự án làm việc MỒ CÔI (template không còn), CŨ ĐỜI (template đã được lưu từ một
 *     phiên — kể cả chính phiên này, khi xoá nó hỏng), và DỞ DANG (chưa đổ xong template);
 *   · dọn chỗ xoá tạm `cache/template-edit-discard/`.
 * Phiên sống trùng nhau (hiếm: chép tay) thì KHÔNG đụng — không biết cái nào mang công
 * người dùng; lượt mở phiên kế tiếp chọn cái mới nhất.
 * Không ném: một workspace hỏng quyền không đáng để agent không khởi động nổi.
 * @returns {Promise<string[]>} id các dự án làm việc vừa dọn.
 */
export async function sweepTemplateEdits(ws) {
  await ensureDir(ws.templatesDir)
  await recoverCommits(ws, await readdir(ws.templatesDir, { withFileTypes: true }).catch(() => []))
  const swept = []
  const revisions = new Map()
  for (const c of await scanEditClaims(ws)) {
    let dead = false
    if (!RE_TEMPLATE_ID.test(c.templateId) || !(await isDir(join(ws.templatesDir, c.templateId)))) dead = true
    else if (!c.ready) dead = true
    else {
      if (!revisions.has(c.templateId))
        revisions.set(c.templateId, (await loadMeta(join(ws.templatesDir, c.templateId), c.templateId))?.revision ?? null)
      const rev = revisions.get(c.templateId)
      /* Template hỏng (meta không đọc được) ⇒ không phán: giữ công người dùng. */
      dead = rev !== null && c.revision < rev
    }
    if (!dead) continue
    try { await removeWorkingProject(ws, c.projectId); swept.push(c.projectId) }
    catch (e) { note(`dự án làm việc ${c.projectId}: chưa dọn được lúc khởi động (${e?.code ?? "?"})`) }
  }
  await removeTree(join(ws.cacheDir, DISCARD_DIR)).catch(() => {})
  return swept
}
