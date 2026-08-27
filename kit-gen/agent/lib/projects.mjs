/* projects.mjs — "thư mục là database" (architecture §1.3-1).
   Sự thật = quét projects/<id>/project.json; index cache chỉ để trả nhanh.
   Project.json hỏng → trả {broken:true,error} thay vì biến mất im lặng (§2.5). */
import { join, basename } from "node:path"
import { randomBytes } from "node:crypto"
import {
  ensureDir, exists, isDir, readJsonFile, writeJsonAtomic, readdir, mtimeOf,
  newestMtime, dirStats, dirStatsByGroup, walkFiles, stat, moveTree, copyTree, removeTree,
} from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { RE_PROJECT_ID, RE_SLUG, assertMatch, safeSegment } from "./paths.mjs"
import { projectDir } from "./projects-dir.mjs"
import { readContract, contractJobs } from "./contract.mjs"
import { redactLine } from "./redact.mjs"

/* Thư mục DẪN XUẤT — sinh lại được, nên được phép dọn.
   "skeleton" Ở LẠI DANH SÁCH dù engine không còn sinh nó (khung xương bỏ 27/08/2026):
   dự án tạo trước ngày đó vẫn còn thư mục đó trên đĩa, có khi hàng chục MB, và cách
   duy nhất để người dùng lấy lại chỗ là nút "Dọn dự án". Bỏ khỏi đây thì thư mục ma
   nằm lại vĩnh viễn mà không màn nào nhắc tới nó.
   Chiều NGƯỢC lại — tạo thư mục mới — thì KHÔNG còn tạo nữa (xem `createProjectDir`). */
export const DERIVED_DIRS = ["skeleton", "prompts", "kits", "export"]

/** Nhóm dung lượng của `stats.diskBreakdown` (§6.2 #9) — khớp 6 dòng wireframe §3-S2b.
 *  Khoá ổn định để UI dịch sang nhãn VI; thêm nhóm mới thì UI cũ vẫn không vỡ (§6.5-6). */
export const DISK_GROUPS = {
  raw: ["raw"],
  rawHistory: [".history/raw"],
  kits: ["kits"],
  skeleton: ["skeleton"],
  runs: ["runs", "logs"],
  refs: ["refs"],
  prompts: ["prompts"],
}

/** Bỏ dấu tiếng Việt → slug. "Xuân 26" → "xuan-26" (UX-SPEC §4.1-1, đóng E2). */
export function slugify(name) {
  const s = String(name ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return s || "project"
}

export function newProjectId(slug) {
  const base = assertMatch(/^[a-z0-9][a-z0-9-]{2,40}$/, slug.length >= 3 ? slug : slug + "-kit",
    "INVALID_SLUG", "slug")
  return `${base}-${randomBytes(2).toString("hex")}`
}

/** Đọc 1 project.json. Không throw khi hỏng — trả broken. */
export async function readProject(ws, id) {
  const dir = projectDir(ws, id)
  const file = join(dir, "project.json")
  if (!(await exists(file))) {
    const trash = await findInTrash(ws, id)
    if (trash) fail("PROJECT_IN_TRASH", `project ${id} is in trash`, { details: { trashId: trash.trashId } })
    fail("PROJECT_NOT_FOUND", `project ${id} not found`)
  }
  try {
    const p = await readJsonFile(file)
    p.id = id
    p.workflow = p.workflow && typeof p.workflow === "object"
      ? { completed: p.workflow.completed === true, updatedAt: p.workflow.updatedAt ?? null }
      : { completed: true, updatedAt: null }
    p.broken = false
    p.error = null
    return p
  } catch (e) {
    return {
      id, schemaVersion: 1, name: id, slug: id, tags: [], broken: true,
      error: { code: "PROJECT_BROKEN", file: "project.json", line: e.jsonLine ?? null, message: e.message },
    }
  }
}

async function findInTrash(ws, projectId) {
  try {
    const ents = await readdir(ws.trashDir, { withFileTypes: true })
    for (const e of ents) if (e.isDirectory() && e.name.endsWith("-" + projectId)) return { trashId: e.name }
  } catch { /* chưa có thùng rác */ }
  return null
}

/** Tính stats + state (stale/staleReason/jobs) — nguồn của ma trận S2 và modal M1. */
export async function computeState(ws, id, project) {
  const dir = projectDir(ws, id)
  const contractMtime = await mtimeOf(join(dir, "contract.json"))
  let contract = null
  try { contract = (await readContract(ws, id)).contract } catch { /* hỏng → state rỗng */ }
  const jobsList = contract ? contractJobs(contract) : []
  const jobs = {}
  let anyStale = false, anyUncut = false
  for (const { job, variant } of jobsList) {
    const rawM = await mtimeOf(join(dir, "raw", `${job}.png`))
    const kitM = await newestMtime(join(dir, "kits", variant), n => n.endsWith(".png"))
    if (!rawM) { jobs[job] = "never"; anyStale = true; continue }
    if (contractMtime > rawM) { jobs[job] = "stale"; anyStale = true; continue }
    if (rawM > kitM) { jobs[job] = "uncut"; anyUncut = true; continue }
    jobs[job] = "ok"
  }
  const promptsM = await newestMtime(join(dir, "prompts"))
  const staleReason = []
  if (promptsM && contractMtime > promptsM) staleReason.push("contract>prompts")
  if (anyStale) staleReason.push("contract>raw")
  if (anyUncut) staleReason.push("raw>kits")

  const rawPresent = Object.values(jobs).filter(s => s !== "never").length
  const kitFiles = await walkFiles(join(dir, "kits"))
  // MỘT lần quét cho cả tổng và phân rã (S2b khối "Dung lượng" cần số TRƯỚC khi dọn,
  // #17 chỉ trả freedBytes SAU khi dọn ⇒ quá muộn). Nhóm khớp đúng 6 dòng wireframe §3-S2b.
  const disk = await dirStatsByGroup(dir, DISK_GROUPS, { skipDirs: [] })
  const lastRun = await readLastRun(dir)

  return {
    stats: {
      variants: contract?.variants?.length ?? 0,
      sheets: contract?.sheets?.length ?? 0,
      components: (contract?.sheets ?? []).reduce((n, s) => n + (s.components?.length ?? 0), 0),
      jobs: jobsList.length, rawPresent,
      kitsCut: kitFiles.filter(f => f.endsWith(".png") && !f.endsWith("atlas.png")).length,
      lastRun, diskBytes: disk.bytes, diskBreakdown: disk.groups,
    },
    state: { stale: staleReason.length > 0, staleReason, jobs },
  }
}

/**
 * Phủ trạng thái LƯỢT ĐANG CHẠY lên `state.jobs` (§5.7 có `running`/`queued`) và thêm
 * `state.activeRun` (NEEDS-setup-projects.md N3): S1 cần chip "Đang chạy N" và badge `⚡2/8`
 * theo TỪNG project — `/health.activeRuns` chỉ là tổng toàn workspace nên không dùng được.
 * `computeState` chỉ đọc ĐĨA (mtime) nên không thể biết việc đang chạy trong RAM.
 * Không có run đang chạy ⇒ `activeRun: null` và `jobs` giữ nguyên.
 */
export function applyActiveRun(project, handle) {
  if (!project?.state) return project
  project.state.activeRun = null
  if (!handle || handle.finished) return project
  const run = handle.run ?? {}
  for (const j of run.jobs ?? []) {
    if (j.status === "running" || j.status === "queued") project.state.jobs[j.job] = j.status
  }
  project.state.activeRun = {
    runId: run.id ?? handle.id ?? null,
    kind: run.kind ?? null,
    done: run.progress?.done ?? 0,
    total: run.progress?.total ?? (run.jobs?.length ?? 0),
    failed: run.progress?.failed ?? 0,
  }
  return project
}

/* BACKLOG #22 — THẺ HOME PHẢI BIẾT LƯỢT GEN GẦN NHẤT ĐÃ CHẾT.
   `stats.lastRun` trước đây chỉ có {id, at, ok, fail}. Ca đau nhất lại là ca 100% job
   chết: `ok=0` ⇒ `rawPresent=0` ⇒ thẻ Home suy ra "Chưa vẽ" và im lặng hoàn toàn, y
   như dự án chưa từng chạy. Thêm `status` + `failSummary` để phía web phân biệt được
   "chưa bao giờ chạy" với "vừa chạy và chết sạch" mà KHÔNG phải gọi thêm API runs cho
   từng thẻ (danh sách Home có thể vài chục dự án).
   KHÔNG mang `errorTail` vào đây: bằng chứng là thứ của MỘT dự án đang mở, không phải
   của danh sách — nó nằm ở `GET /api/runs/:id` mà banner trong project đã đọc. */
async function readLastRun(dir) {
  try {
    const latest = await readJsonFile(join(dir, "runs", "latest.json"))
    const run = await readJsonFile(join(dir, "runs", latest.runId, "run.json"))
    const jobs = run.jobs ?? []
    const ok = jobs.filter(j => j.status === "ok").length
    const fail_ = jobs.filter(j => j.status === "failed").length
    return {
      id: run.id, at: run.finishedAt ?? run.startedAt, ok, fail: fail_,
      kind: run.kind ?? null,
      status: run.status ?? null,
      total: jobs.length,
      // Chuỗi sinh ở agent, nhưng run.json có thể do bản cũ/máy khác ghi ⇒ vẫn redact.
      failSummary: run.failSummary ? redactLine(run.failSummary) : null,
    }
  } catch { return null }
}

/** GET /api/projects — quét thật, có include=stats. */
export async function listProjects(ws, { includeStats = true, runs = null } = {}) {
  await ensureDir(ws.projectsDir)
  const ents = await readdir(ws.projectsDir, { withFileTypes: true }).catch(() => [])
  const items = []
  for (const e of ents) {
    if (!e.isDirectory()) continue
    if (!RE_PROJECT_ID.test(e.name)) continue
    if (!(await exists(join(ws.projectsDir, e.name, "project.json")))) continue
    const p = await readProject(ws, e.name)
    if (!p.broken && includeStats) {
      Object.assign(p, await computeState(ws, e.name, p))
      if (runs) applyActiveRun(p, runs.activeForProject(e.name))
    }
    items.push(p)
  }
  items.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
  return items
}

export async function saveProject(ws, id, project) {
  project.updatedAt = new Date().toISOString()
  await writeJsonAtomic(join(projectDir(ws, id), "project.json"), project)
  return project
}

export async function idTaken(ws, id) {
  return (await exists(join(ws.projectsDir, id))) || (await findInTrash(ws, id)) !== null
}

/** Tạo thư mục project rỗng + project.json. Contract do caller ghi (template/import). */
export async function createProjectDir(ws, { id, name, slug, description = "", tags = [] }) {
  if (await idTaken(ws, id))
    fail("PROJECT_ID_TAKEN", `project id ${id} already exists`, { details: { suggestion: `${id}-2` } })
  const dir = join(ws.projectsDir, id)
  await ensureDir(dir)
  /* KHÔNG còn tạo "skeleton": engine không ghi vào đó nữa (khung xương bỏ 27/08/2026).
     Một thư mục rỗng vĩnh viễn trong mọi dự án mới là rác, và nó còn nói dối màn "Dung
     lượng" rằng có một loại dữ liệu như thế. Dự án CŨ vẫn dọn được — xem `DERIVED_DIRS`. */
  for (const d of ["refs", "raw", "kits", "runs", "prompts", ".history/contract", ".history/raw"])
    await ensureDir(join(dir, d))
  const now = new Date().toISOString()
  const project = {
    $schema: "https://kitgen.pages.dev/schema/project-1.json",
    schemaVersion: 1, id, name: String(name), slug: assertMatch(RE_SLUG, slug, "INVALID_SLUG", "slug"),
    description: String(description ?? ""), createdAt: now, updatedAt: now,
    contract: { file: "contract.json", version: 0, hash: null },
    cover: null, tags: Array.isArray(tags) ? tags.map(String).slice(0, 12) : [],
    workflow: { completed: !Array.isArray(tags) || !tags.includes("kg-workflow"), updatedAt: now },
  }
  await writeJsonAtomic(join(dir, "project.json"), project)
  return { dir, project }
}

const WORKFLOW_DRAFT_FILE = "workflow-draft.json"

export async function readWorkflowDraft(ws, id) {
  const project = await readProject(ws, id)
  if (project.broken) fail("PROJECT_BROKEN", "cannot read workflow draft for a broken project")
  let draft = null
  try { draft = await readJsonFile(join(projectDir(ws, id), WORKFLOW_DRAFT_FILE)) } catch { /* chưa có bản nháp */ }
  return { completed: project.workflow?.completed === true, draft, updatedAt: project.workflow?.updatedAt ?? null }
}

export async function saveWorkflowDraft(ws, id, input) {
  const project = await readProject(ws, id)
  if (project.broken) fail("PROJECT_BROKEN", "cannot save workflow draft for a broken project")
  const serialized = JSON.stringify(input?.draft ?? null)
  if (serialized.length > 2_000_000) fail("TOO_LARGE", "workflow draft exceeds 2 MB")
  const completed = input?.completed === true
  const updatedAt = new Date().toISOString()
  await writeJsonAtomic(join(projectDir(ws, id), WORKFLOW_DRAFT_FILE), input?.draft ?? null)
  project.workflow = { completed, updatedAt }
  await saveProject(ws, id, project)
  return { completed, draft: input?.draft ?? null, updatedAt }
}

/** PATCH: chỉ name/slug/description/tags/cover. id và thư mục KHÔNG đổi (§4.2). */
export async function patchProject(ws, id, patch) {
  const p = await readProject(ws, id)
  if (p.broken) fail("PROJECT_BROKEN", "cannot patch a broken project", { details: p.error })
  if (patch.name !== undefined) {
    const n = String(patch.name).trim()
    if (!n || n.length > 120) fail("INVALID_NAME", "name must be 1..120 chars")
    p.name = n
  }
  if (patch.slug !== undefined) p.slug = assertMatch(RE_SLUG, patch.slug, "INVALID_SLUG", "slug")
  if (patch.description !== undefined) p.description = String(patch.description).slice(0, 2000)
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags)) fail("BAD_REQUEST", "tags must be an array")
    p.tags = patch.tags.map(t => String(t).slice(0, 24)).slice(0, 12)
  }
  if (patch.cover !== undefined) {
    if (patch.cover === null) p.cover = null
    else {
      const rel = String(patch.cover).replace(/^\/+/, "")
      if (rel.includes("..")) fail("BAD_REQUEST", "cover must be a relative path inside project")
      p.cover = rel
    }
  }
  return saveProject(ws, id, p)
}

/** DELETE (soft) → .kitgen/trash/<yyyymmdd-hhmmss>-<id>/  — KHÔNG rm thẳng (§3.4 lớp 6/architecture §1.3-6). */
export async function trashProject(ws, id) {
  const dir = projectDir(ws, id)
  if (!(await isDir(dir))) fail("PROJECT_NOT_FOUND", `project ${id} not found`)
  const p = await readProject(ws, id).catch(() => ({ name: id }))
  const { bytes } = await dirStats(dir)
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
  const trashId = `${ts}-${id}`
  const dst = join(ws.trashDir, trashId)
  await ensureDir(ws.trashDir)
  await moveTree(dir, dst)
  const meta = {
    trashId, projectId: id, name: p.name ?? id, deletedAt: new Date().toISOString(),
    restoreBefore: new Date(Date.now() + 30 * 864e5).toISOString(), bytes,
  }
  await writeJsonAtomic(join(dst, ".trash-meta.json"), meta)
  return meta
}

export async function listTrash(ws) {
  await ensureDir(ws.trashDir)
  const ents = await readdir(ws.trashDir, { withFileTypes: true }).catch(() => [])
  const items = []
  for (const e of ents) {
    if (!e.isDirectory()) continue
    const metaFile = join(ws.trashDir, e.name, ".trash-meta.json")
    let meta
    try { meta = await readJsonFile(metaFile) }
    catch {
      const projectId = e.name.replace(/^\d{8}-\d{6}-/, "")
      meta = { trashId: e.name, projectId, name: projectId, deletedAt: null, restoreBefore: null, bytes: 0 }
    }
    meta.expired = meta.restoreBefore ? Date.parse(meta.restoreBefore) < Date.now() : false
    items.push(meta)
  }
  items.sort((a, b) => String(b.deletedAt ?? "").localeCompare(String(a.deletedAt ?? "")))
  return items
}

export function trashDirOf(ws, trashId) {
  safeSegment(trashId, "trashId")
  if (!/^[0-9]{8}-[0-9]{6}-[a-z0-9-]{3,48}$/.test(trashId)) fail("BAD_REQUEST", "invalid trashId")
  return join(ws.trashDir, trashId)
}

export async function restoreFromTrash(ws, trashId) {
  const src = trashDirOf(ws, trashId)
  if (!(await isDir(src))) fail("TRASH_NOT_FOUND", `trash entry ${trashId} not found`)
  const projectId = trashId.replace(/^\d{8}-\d{6}-/, "")
  if (await exists(join(ws.projectsDir, projectId)))
    fail("PROJECT_ID_TAKEN", `project ${projectId} already exists`, { details: { suggestion: `${projectId}-2` } })
  await moveTree(src, join(ws.projectsDir, projectId))
  await removeTree(join(ws.projectsDir, projectId, ".trash-meta.json"))
  const p = await readProject(ws, projectId)
  Object.assign(p, await computeState(ws, projectId, p))
  return p
}

export async function purgeFromTrash(ws, trashId) {
  const src = trashDirOf(ws, trashId)
  if (!(await isDir(src))) fail("TRASH_NOT_FOUND", `trash entry ${trashId} not found`)
  await removeTree(src)
}

/** Dọn cache dẫn xuất (#17). KHÔNG BAO GIỜ chạm contract.json và raw/ đang dùng. */
export const CLEAN_TARGETS = {
  skeleton: ["skeleton"], prompts: ["prompts"], kits: ["kits"],
  rawHistory: [".history/raw"], oldLogs: ["__oldLogs__"],
}
export async function cleanProject(ws, id, targets) {
  const dir = projectDir(ws, id)
  const removed = {}
  let freed = 0
  for (const t of targets) {
    if (!Object.hasOwn(CLEAN_TARGETS, t)) fail("BAD_REQUEST", `unknown clean target ${t}`)
    if (t === "oldLogs") {
      const cut = Date.now() - 30 * 864e5
      let n = 0
      const runsDir = join(dir, "runs")
      for (const f of await walkFiles(runsDir)) {
        try {
          const st = await stat(f)
          if (st.mtimeMs < cut && /\.log$|\.last\.txt$/.test(f)) { freed += st.size; await removeTree(f); n++ }
        } catch { /* ignore */ }
      }
      removed.oldLogs = n
      continue
    }
    for (const sub of CLEAN_TARGETS[t]) {
      const abs = join(dir, sub)
      const { files, bytes } = await dirStats(abs)
      await removeTree(abs)
      await ensureDir(abs)
      removed[t] = (removed[t] ?? 0) + files
      freed += bytes
    }
  }
  return { freedBytes: freed, removed }
}

export { copyTree, basename }
export { projectDir }
