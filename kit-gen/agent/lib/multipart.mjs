/* multipart.mjs — parser multipart/form-data tối giản (stdlib thuần).
   Thay hẳn kiểu `{path, dataURL}` base64 của v1 (đóng G1 client quyết path + G5 base64 phình 33%).
   Kiểm MAGIC BYTES, không tin `Content-Type` của client (UX-SPEC §5.6 Dropzone). */
import { fail } from "./errors.mjs"

export function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType ?? ""))
  if (!m) fail("BAD_REQUEST", "missing multipart boundary")
  const boundary = Buffer.from("--" + (m[1] ?? m[2]).trim())
  const parts = []
  let pos = buf.indexOf(boundary)
  if (pos < 0) fail("BAD_REQUEST", "multipart boundary not found in body")
  pos += boundary.length
  for (let guard = 0; guard < 64; guard++) {
    if (buf.slice(pos, pos + 2).toString() === "--") break
    if (buf.slice(pos, pos + 2).toString() === "\r\n") pos += 2
    const headEnd = buf.indexOf("\r\n\r\n", pos)
    if (headEnd < 0) break
    const rawHead = buf.slice(pos, headEnd).toString("utf8")
    const next = buf.indexOf(boundary, headEnd)
    if (next < 0) break
    const body = buf.slice(headEnd + 4, next - 2)   // trừ CRLF trước boundary
    const nameM = /name="([^"]*)"/i.exec(rawHead)
    const fileM = /filename="([^"]*)"/i.exec(rawHead)
    const ctM = /content-type:\s*([^\r\n]+)/i.exec(rawHead)
    parts.push({
      name: nameM ? nameM[1] : "", filename: fileM ? fileM[1] : null,
      contentType: ctM ? ctM[1].trim() : null, data: body,
    })
    pos = next + boundary.length
  }
  return parts
}

const MAGIC = [
  { ext: "png", mime: "image/png", test: b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", test: b => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" },
  { ext: "zip", mime: "application/zip", test: b => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7) },
]

/** Nhận diện thật bằng magic bytes. JSON được nhận nếu parse được. */
export function sniff(buf) {
  for (const t of MAGIC) { try { if (t.test(buf)) return t } catch { /* buffer ngắn */ } }
  const head = buf.slice(0, 4096).toString("utf8").trimStart()
  if (head.startsWith("{") || head.startsWith("[")) {
    try { JSON.parse(buf.toString("utf8")); return { ext: "json", mime: "application/json" } } catch { /* không phải json */ }
  }
  return null
}

/** Kích thước PNG/JPEG/WebP từ header (không cần thư viện ảnh). */
export function imageSize(buf) {
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
    const fmt = buf.slice(12, 16).toString()
    if (fmt === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
    if (fmt === "VP8L") {
      const b = buf.readUInt32LE(21)
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }
    }
    if (fmt === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      i += 2 + len
    }
  }
  return { w: null, h: null }
}
