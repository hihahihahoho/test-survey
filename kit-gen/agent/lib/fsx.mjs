/* fsx.mjs — thao tác đĩa dùng chung. Node stdlib thuần.
   Quy tắc: ghi file quan trọng luôn ATOMIC (tmp + rename) để mất điện không hỏng contract. */
import { createHash } from "node:crypto"
import {
  mkdir, readdir, readFile, writeFile, rename, stat, lstat, rm, copyFile, cp, access, open,
} from "node:fs/promises"
import { constants } from "node:fs"
import { dirname, join, relative, sep } from "node:path"

export async function ensureDir(p) { await mkdir(p, { recursive: true }) }

export async function exists(p) { try { await lstat(p); return true } catch { return false } }

export async function isDir(p) { try { return (await stat(p)).isDirectory() } catch { return false } }

export async function isFile(p) { try { return (await stat(p)).isFile() } catch { return false } }

export async function readJsonFile(p) {
  const raw = await readFile(p, "utf8")
  try { return JSON.parse(raw) }
  catch (e) {
    const m = /position (\d+)/.exec(String(e.message))
    const line = m ? raw.slice(0, Number(m[1])).split("\n").length : null
    const err = new Error(`invalid JSON${line ? ` at line ${line}` : ""}`)
    err.jsonLine = line
    err.jsonFile = p
    throw err
  }
}

export async function writeJsonAtomic(p, obj) {
  await ensureDir(dirname(p))
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8")
  await rename(tmp, p)
}

export async function writeFileAtomic(p, buf) {
  await ensureDir(dirname(p))
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, buf)
  await rename(tmp, p)
}

export async function canWrite(p) { try { await access(p, constants.W_OK); return true } catch { return false } }

/** Liệt kê đệ quy các FILE (bỏ symlink để không đi ra ngoài project). */
export async function walkFiles(root, { skipDirs = [] } = {}) {
  const out = []
  async function rec(dir) {
    let ents
    try { ents = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const abs = join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (skipDirs.includes(e.name)) continue
        await rec(abs)
      } else if (e.isFile()) {
        out.push(abs)
      }
    }
  }
  await rec(root)
  return out
}

export async function dirStats(root, opts) {
  const files = await walkFiles(root, opts)
  let bytes = 0
  for (const f of files) { try { bytes += (await stat(f)).size } catch { /* biến mất giữa đường */ } }
  return { files: files.length, bytes }
}

/** Như dirStats nhưng CỘNG THEO NHÓM đầu tiên của đường dẫn tương đối, trong MỘT lần quét.
 *  `groups`: { tênNhóm: [prefix tương đối…] }. File không thuộc nhóm nào vẫn vào `bytes` tổng.
 *  Dùng cho §6.2 #9 `stats.diskBreakdown` — S2b cần số từng thư mục TRƯỚC khi dọn. */
export async function dirStatsByGroup(root, groups, opts) {
  const files = await walkFiles(root, opts)
  const out = { bytes: 0, files: files.length, groups: {} }
  for (const g of Object.keys(groups)) out.groups[g] = 0
  const prefixes = Object.entries(groups).map(([g, ps]) => [g, ps.map(x => x.split("/").filter(Boolean))])
  for (const f of files) {
    let size = 0
    try { size = (await stat(f)).size } catch { continue }
    out.bytes += size
    const rel = f.slice(root.length).split(sep).filter(Boolean)
    for (const [g, ps] of prefixes) {
      if (ps.some(p => p.every((seg, i) => rel[i] === seg))) { out.groups[g] += size; break }
    }
  }
  return out
}

/** mtime lớn nhất của các file khớp filter; 0 nếu không có. */
export async function newestMtime(dir, filter = () => true) {
  let newest = 0
  let ents
  try { ents = await readdir(dir, { withFileTypes: true }) } catch { return 0 }
  for (const e of ents) {
    if (!e.isFile() || !filter(e.name)) continue
    try { newest = Math.max(newest, (await stat(join(dir, e.name))).mtimeMs) } catch { /* ignore */ }
  }
  return newest
}

export async function mtimeOf(p) { try { return (await stat(p)).mtimeMs } catch { return 0 } }

export async function copyTree(src, dst) {
  if (!(await exists(src))) return { files: 0, bytes: 0 }
  await ensureDir(dirname(dst))
  await cp(src, dst, { recursive: true, dereference: true, force: true })
  return dirStats(dst)
}

export async function sha256File(p) {
  const h = createHash("sha256")
  h.update(await readFile(p))
  return "sha256:" + h.digest("hex")
}

export function sha256(str) { return "sha256:" + createHash("sha256").update(str).digest("hex") }

export async function removeTree(p) { await rm(p, { recursive: true, force: true }) }

export async function moveTree(src, dst) {
  await ensureDir(dirname(dst))
  try { await rename(src, dst) }
  catch (e) {
    if (e.code !== "EXDEV") throw e
    await cp(src, dst, { recursive: true, dereference: false })
    await rm(src, { recursive: true, force: true })
  }
}

export { readFile, writeFile, readdir, stat, lstat, rename, copyFile, open, relative, sep }
