/* contract.mjs — đọc/ghi bản thiết kế có VERSION + If-Match + snapshot lịch sử 50 bản.
   Schema v4 giữ tương thích (architecture §2.4): styles[] → variants[], sheet.styles → sheet.variants. */
import { join } from "node:path"
import {
  ensureDir, exists, readJsonFile, writeJsonAtomic, readdir, removeTree, sha256, stat,
} from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { projectDir } from "./projects-dir.mjs"
import { validateContract } from "./validate.mjs"

const HISTORY_KEEP = 50

export const EMPTY_CONTRACT = { schemaVersion: 4, characterPoses: [], sheets: [], variants: [] }

export function contractPath(ws, id) { return join(projectDir(ws, id), "contract.json") }
export function historyDir(ws, id) { return join(projectDir(ws, id), ".history", "contract") }

/** Danh sách job = variant × sheet (sheet.variants rỗng/null = áp mọi variant) — đúng gen.sh. */
export function contractJobs(contract) {
  const out = []
  for (const v of contract?.variants ?? []) {
    for (const sh of contract?.sheets ?? []) {
      const only = sh.variants
      if (Array.isArray(only) && only.length && !only.includes(v.id)) continue
      out.push({ job: `${v.id}-${sh.id}`, variant: v.id, sheet: sh.id })
    }
  }
  return out
}

export async function readContract(ws, id) {
  const file = contractPath(ws, id)
  if (!(await exists(file))) return { version: 0, contract: structuredClone(EMPTY_CONTRACT) }
  let contract
  try { contract = await readJsonFile(file) }
  catch (e) {
    fail("CONTRACT_BROKEN", `contract.json is not valid JSON`, { details: { file: "contract.json", line: e.jsonLine ?? null } })
  }
  const project = await readJsonFile(join(projectDir(ws, id), "project.json")).catch(() => ({}))
  return { version: Number(project?.contract?.version ?? 0), contract }
}

/** PUT có If-Match (§6.2 #23). Lệch → 409 CONTRACT_CONFLICT kèm diffSummary. */
export async function writeContract(ws, id, contract, { ifMatch }) {
  const dir = projectDir(ws, id)
  const projectFile = join(dir, "project.json")
  const project = await readJsonFile(projectFile)
  const current = Number(project?.contract?.version ?? 0)

  if (ifMatch === undefined || ifMatch === null || ifMatch === "")
    fail("IF_MATCH_REQUIRED", "If-Match header with current contract version is required")
  const want = Number(String(ifMatch).replace(/^W\//, "").replace(/"/g, ""))
  if (!Number.isFinite(want)) fail("BAD_REQUEST", "If-Match must be an integer version")

  if (want !== current) {
    const server = await readContract(ws, id).catch(() => ({ contract: EMPTY_CONTRACT }))
    fail("CONTRACT_CONFLICT", `contract version ${want} != ${current}`, {
      hint: "reload-or-fork",
      details: {
        serverVersion: current,
        serverHash: project?.contract?.hash ?? null,
        diffSummary: diffSummary(server.contract, contract),
      },
    })
  }

  const validation = validateContract(contract)
  if (validation.errors.length)
    fail("CONTRACT_INVALID", `contract has ${validation.errors.length} error(s)`, { details: { errors: validation.errors } })

  // snapshot bản CŨ trước khi ghi đè (architecture §2.2 → 50 bản)
  const snapshot = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
    .replace(/^(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
  if (await exists(contractPath(ws, id))) {
    await ensureDir(historyDir(ws, id))
    const old = await readJsonFile(contractPath(ws, id)).catch(() => null)
    if (old) await writeJsonAtomic(join(historyDir(ws, id), `${snapshot}.json`), { version: current, contract: old })
    await pruneHistory(ws, id)
  }

  const body = JSON.stringify(contract)
  const version = current + 1
  await writeJsonAtomic(contractPath(ws, id), contract)
  project.contract = { file: "contract.json", version, hash: sha256(body) }
  project.updatedAt = new Date().toISOString()
  await writeJsonAtomic(projectFile, project)
  return { version, hash: project.contract.hash, snapshot, validation }
}

function diffSummary(a, b) {
  const ids = c => new Set((c?.sheets ?? []).map(s => s.id))
  const A = ids(a), B = ids(b)
  let added = 0, removed = 0
  for (const x of B) if (!A.has(x)) added++
  for (const x of A) if (!B.has(x)) removed++
  return { added, removed }
}

async function pruneHistory(ws, id) {
  const dir = historyDir(ws, id)
  const files = (await readdir(dir).catch(() => [])).filter(f => f.endsWith(".json")).sort()
  while (files.length > HISTORY_KEEP) await removeTree(join(dir, files.shift()))
}

export async function listHistory(ws, id, limit = HISTORY_KEEP) {
  const dir = historyDir(ws, id)
  const files = (await readdir(dir).catch(() => [])).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit)
  const items = []
  for (const f of files) {
    const abs = join(dir, f)
    const st = await stat(abs).catch(() => null)
    let snap = null
    try { snap = await readJsonFile(abs) } catch { /* bỏ bản hỏng */ }
    items.push({
      snapshot: f.replace(/\.json$/, ""), version: snap?.version ?? null,
      at: st ? new Date(st.mtimeMs).toISOString() : null, bytes: st?.size ?? 0,
      summary: {
        sheets: snap?.contract?.sheets?.length ?? 0,
        components: (snap?.contract?.sheets ?? []).reduce((n, s) => n + (s.components?.length ?? 0), 0),
      },
    })
  }
  return items
}

export async function readHistorySnapshot(ws, id, snapshot) {
  const abs = join(historyDir(ws, id), `${snapshot}.json`)
  if (!(await exists(abs))) fail("NOT_FOUND", `snapshot ${snapshot} not found`)
  const snap = await readJsonFile(abs)
  return { version: snap.version ?? null, contract: snap.contract }
}
