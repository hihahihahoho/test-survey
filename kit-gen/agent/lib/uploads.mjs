/* uploads.mjs — vùng staging cho POST /api/uploads (#19). File nằm trong
   .kitgen/uploads/<uploadId>, TTL 1 giờ, tên do AGENT đặt (client không gửi path — đóng G1). */
import { randomBytes } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ensureDir, writeFileAtomic, removeTree, exists } from "./fsx.mjs"
import { fail } from "./errors.mjs"

const TTL_MS = 3600_000

export class Uploads {
  constructor(ws) {
    this.ws = ws
    this.map = new Map()
    this.timer = setInterval(() => this.sweep(), 300_000)
    this.timer.unref?.()
  }
  async put(buf, { kind, filename }) {
    await ensureDir(this.ws.uploadsDir)
    const uploadId = "up_" + randomBytes(8).toString("hex")
    const abs = join(this.ws.uploadsDir, uploadId)
    await writeFileAtomic(abs, buf)
    const rec = {
      uploadId, abs, kind, bytes: buf.length,
      filename: String(filename ?? "upload").replace(/[^\w.\- ]/g, "_").slice(0, 80),
      at: Date.now(),
    }
    this.map.set(uploadId, rec)
    return rec
  }
  get(uploadId) {
    const rec = this.map.get(String(uploadId ?? ""))
    if (!rec) fail("NOT_FOUND", `upload ${uploadId} not found or expired`)
    return rec
  }
  read(uploadId) { return readFileSync(this.get(uploadId).abs) }
  async sweep() {
    const now = Date.now()
    for (const [id, rec] of [...this.map]) {
      if (now - rec.at > TTL_MS) { this.map.delete(id); await removeTree(rec.abs).catch(() => {}) }
    }
  }
  async dispose() { clearInterval(this.timer); for (const rec of this.map.values()) await removeTree(rec.abs).catch(() => {}) }
}
export { exists }
