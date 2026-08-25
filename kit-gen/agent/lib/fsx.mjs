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

/** Đọc tối đa đuôi file, không nạp nguyên log vào RAM. */
export async function readTailFile(p, maxBytes = 1 << 20) {
  const fh = await open(p, "r")
  try {
    const st = await fh.stat()
    const bytes = Math.min(Math.max(0, Number(maxBytes) || 0), st.size)
    const buf = Buffer.alloc(bytes)
    if (bytes) await fh.read(buf, 0, bytes, st.size - bytes)
    return buf.toString("utf8")
  } finally { await fh.close().catch(() => {}) }
}

/** Đọc tối đa `maxBytes` ĐẦU file.
 *  Có để phục vụ đúng một nhu cầu: lấy KÍCH THƯỚC ảnh (`imageSize`) — thứ nằm gọn trong
 *  header vài chục byte đầu. Bản cũ `imageSize(await readFile(abs))` nạp NGUYÊN file vào
 *  RAM cho MỖI ảnh; danh mục kit của một project thật có hàng trăm PNG, tức là hàng trăm
 *  MB đọc-rồi-vứt cho mỗi lần web hỏi `GET /kit`. Đó là một phần của "bấm xong đợi lâu". */
export async function readHeadFile(p, maxBytes = 64 * 1024) {
  const fh = await open(p, "r")
  try {
    const bytes = Math.max(0, Number(maxBytes) || 0)
    const buf = Buffer.alloc(bytes)
    const { bytesRead } = bytes ? await fh.read(buf, 0, bytes, 0) : { bytesRead: 0 }
    return buf.subarray(0, bytesRead)
  } finally { await fh.close().catch(() => {}) }
}

/* TÊN FILE TẠM PHẢI DUY NHẤT CHO TỪNG LẦN GHI — `pid + Date.now()` là CHƯA đủ.
   Hai lần ghi CÙNG một file trong CÙNG một mili-giây (thường gặp: `persist()` bắn-quên của
   job.done chạy chồng lên `persist()` của finish()) sẽ dùng CHUNG một tên tmp: lần rename
   đầu dọn file tmp đi, lần rename sau ném ENOENT — một lỗi GIẢ, file đích vẫn nguyên vẹn.
   Ở run-handle.persist() ENOENT giả đó bị hiểu là "project đã sang thùng rác" và cắt luôn
   đường ghi đĩa của cả lượt chạy (`detached = true`): run.json ngừng cập nhật và móc vẽ
   ảnh bìa sau lượt gen im lặng không chạy. Vì vậy: thêm bộ đếm trong tiến trình. */
let tmpSeq = 0
const tmpPath = p => `${p}.tmp-${process.pid}-${Date.now()}-${(tmpSeq = (tmpSeq + 1) % 0xffffff).toString(36)}`

export async function writeJsonAtomic(p, obj, { mkdirs = true } = {}) {
  if (mkdirs) await ensureDir(dirname(p))
  const tmp = tmpPath(p)
  await writeFile(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8")
  await rename(tmp, p)
}

/** `mkdirs: false` = KHÔNG dựng thư mục cha. Dùng cho job nền ghi vào thư mục project có
 *  thể vừa bị xoá: `ensureDir` đệ quy sẽ DỰNG LẠI projects/<id>/ đã sang thùng rác (thư mục
 *  ma ⇒ nút Hoàn tác trả 409). Xem cover.mjs. */
export async function writeFileAtomic(p, buf, { mkdirs = true } = {}) {
  if (mkdirs) await ensureDir(dirname(p))
  const tmp = tmpPath(p)
  await writeFile(tmp, buf)
  await rename(tmp, p)
}

export async function canWrite(p) { try { await access(p, constants.W_OK); return true } catch { return false } }

/** Liệt kê đệ quy các FILE (bỏ symlink để không đi ra ngoài project).
 * Luôn có trần độ sâu/số file: mọi caller chỉ quét một project/workspace con,
 * không được biến một request stats thành quét vô hạn hoặc quét cả hồ sơ người dùng. */
export async function walkFiles(root, { skipDirs = [], maxDepth = 12, maxFiles = 20_000 } = {}) {
  const out = []
  async function rec(dir, depth) {
    if (out.length >= maxFiles || depth > maxDepth) return
    let ents
    try { ents = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (out.length >= maxFiles) return
      const abs = join(dir, e.name)
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (skipDirs.includes(e.name)) continue
        await rec(abs, depth + 1)
      } else if (e.isFile()) {
        out.push(abs)
      }
    }
  }
  await rec(root, 0)
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

/* Windows KHÔNG cho xoá thứ đang có handle mở, và handle đó thường được nhả CHẬM một
   nhịp sau khi tiến trình con chết (hoặc do Defender vừa quét xong file mới ghi) ⇒
   `rm` đệ quy trả `ENOTEMPTY`/`EPERM`/`EBUSY` ngẫu nhiên. Node có sẵn cơ chế thử lại
   với backoff tuyến tính cho ĐÚNG bộ mã lỗi đó. Gate win32: trên darwin/linux tham số
   truyền vào không đổi một chữ so với mã cũ (và các mã lỗi này cũng không xảy ra ở đó).
   Đây là chỗ duy nhất trong agent xoá cây thư mục — thùng rác, xoá hẳn project, dọn
   bản cài cũ đều đi qua đây, nên vá một chỗ là đủ cho cả sản phẩm. */
const RM_OPTS = process.platform === "win32"
  ? { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }
  : { recursive: true, force: true }

export async function removeTree(p) { await rm(p, RM_OPTS) }

export async function moveTree(src, dst) {
  await ensureDir(dirname(dst))
  try { await rename(src, dst) }
  catch (e) {
    if (e.code !== "EXDEV") throw e
    await cp(src, dst, { recursive: true, dereference: false })
    await rm(src, RM_OPTS)
  }
}

export { readFile, writeFile, readdir, stat, lstat, rename, copyFile, open, relative, sep }
