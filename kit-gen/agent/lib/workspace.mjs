/* workspace.mjs — workspace là thư mục chứa `projects/` + `.kitgen/`.
   Web KHÔNG BAO GIỜ gửi path (UX-SPEC X1): nó chỉ gửi `workspaceId` đục.
   id = "ws_" + 8 hex đầu của sha256(realpath) → ổn định giữa các lần chạy, không lộ path. */
import { homedir } from "node:os"
import { resolve, join, basename } from "node:path"
import { createHash } from "node:crypto"
import { ensureDir, exists, readJsonFile, writeJsonAtomic, canWrite, readdir } from "./fsx.mjs"
import { shortenPath } from "./redact.mjs"
import { fail } from "./errors.mjs"

export function workspaceId(absPath) {
  return "ws_" + createHash("sha256").update(resolve(absPath)).digest("hex").slice(0, 8)
}
export function workspaceFingerprint(absPath) {
  return "sha256:" + createHash("sha256").update(resolve(absPath)).digest("hex").slice(0, 12)
}
export function workspaceLabel(absPath) {
  const resolved = resolve(absPath)
  const shortened = shortenPath(resolved)
  // Ngoài thư mục home (ví dụ /tmp trên Linux CI), chỉ trả tên thư mục.
  // Nhãn UI không được biến thành đường dẫn tuyệt đối hoặc lộ cấu trúc máy.
  const label = shortened.startsWith("/") ? basename(resolved) : shortened
  return label.length > 48 ? "…" + label.slice(-47) : label
}

/* `imageGen` không còn trong default (hồ sơ ảnh riêng bỏ 24/08/2026); khối sót lại
   trong config.json cũ được giữ nguyên trên đĩa nhưng không ai đọc nữa. */
const CONFIG_DEFAULT = { workspaceVersion: 1, maxJobs: 4 }

export class Workspace {
  constructor(root) {
    this.root = resolve(root)
    this.id = workspaceId(this.root)
    this.kitgenDir = join(this.root, ".kitgen")
    this.projectsDir = join(this.root, "projects")
    this.trashDir = join(this.kitgenDir, "trash")
    this.engineDir = join(this.kitgenDir, "engine")
    this.cacheDir = join(this.kitgenDir, "cache")
    this.uploadsDir = join(this.kitgenDir, "uploads")
    this.libraryDir = join(this.kitgenDir, "library")
  }
  get label() { return workspaceLabel(this.root) }
  get fingerprint() { return workspaceFingerprint(this.root) }

  async init() {
    await ensureDir(this.projectsDir)
    await ensureDir(this.trashDir)
    await ensureDir(this.cacheDir)
    await ensureDir(this.uploadsDir)
    await ensureDir(this.libraryDir)
    if (!(await exists(this.configPath))) await writeJsonAtomic(this.configPath, CONFIG_DEFAULT)
    return this
  }
  get configPath() { return join(this.kitgenDir, "config.json") }

  async config() {
    try { return { ...CONFIG_DEFAULT, ...(await readJsonFile(this.configPath)) } }
    catch { return { ...CONFIG_DEFAULT } }
  }
  async patchConfig(patch) {
    const next = { ...(await this.config()), ...patch }
    await writeJsonAtomic(this.configPath, next)
    return next
  }
  async writable() { return canWrite(this.root) && canWrite(this.projectsDir) }

  async countProjects() {
    try {
      const ents = await readdir(this.projectsDir, { withFileTypes: true })
      let n = 0
      for (const e of ents) if (e.isDirectory() && await exists(join(this.projectsDir, e.name, "project.json"))) n++
      return n
    } catch { return 0 }
  }
}

/** Registry các workspace agent BIẾT (không phải path tự do từ web).
 *  Nguồn: --workspace CLI + KITGEN_WORKSPACE + file ~/.kitgen-agent/known-workspaces.json. */
export class WorkspaceRegistry {
  constructor(list, activeRoot) {
    this.map = new Map()
    for (const r of list) { const w = new Workspace(r); this.map.set(w.id, w) }
    const active = new Workspace(activeRoot)
    if (!this.map.has(active.id)) this.map.set(active.id, active)
    this.activeId = active.id
  }
  get active() { return this.map.get(this.activeId) }
  byId(id) {
    const w = this.map.get(String(id ?? ""))
    if (!w) fail("WORKSPACE_UNKNOWN", `unknown workspaceId ${JSON.stringify(String(id ?? ""))}`)
    return w
  }
  async activate(id) {
    const w = this.byId(id)
    await w.init()
    if (!(await w.writable()))
      fail("WORKSPACE_UNWRITABLE", `workspace ${w.label} is not writable`, { details: { label: w.label } })
    this.activeId = w.id
    return w
  }
  async list() {
    const out = []
    for (const w of this.map.values()) {
      out.push({
        id: w.id, label: w.label, projects: await w.countProjects(),
        diskBytes: null, active: w.id === this.activeId, writable: await w.writable(),
      })
    }
    return out
  }
}

export function defaultWorkspaceRoot() {
  return process.env.KITGEN_WORKSPACE
    ? resolve(process.env.KITGEN_WORKSPACE)
    : join(homedir(), "KitGen")
}
export { basename }
