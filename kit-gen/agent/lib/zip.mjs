/* zip.mjs — GHI zip bằng Node stdlib (zlib deflateRaw + CRC32 tự tính), không dependency
   ngoài. Chỉ store(0) + deflate(8) — đủ cho `GET /api/projects/:id/export.zip`, cửa duy
   nhất còn dùng file này (nút «Tải kit .zip»).

   08/09/2026 — `readZip` (nhánh ĐỌC) đã rời khỏi sản phẩm cùng đường nhập dự án bằng zip:
   agent không còn cửa nào nhận zip từ ngoài vào, nên giữ một bộ giải nén trong mã chạy
   thật là giữ một bề mặt tấn công không ai gọi tới. Bản đọc (kèm chốt chống zip-slip) ở
   lại trong `agent/test/harness.mjs` để test còn mở được zip mà mình vừa xuất. */
import { deflateRaw } from "node:zlib"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"
import { sep } from "node:path"

const deflate = promisify(deflateRaw)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosTime(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31)
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  return { time, date }
}

/** Tạo buffer zip từ danh sách {name, abs} hoặc {name, data}. */
export async function makeZip(entries) {
  const parts = []
  const central = []
  let offset = 0
  for (const e of entries) {
    const name = String(e.name).split(sep).join("/")
    const nameBuf = Buffer.from(name, "utf8")
    const data = e.data ?? (await readFile(e.abs))
    const crc = crc32(data)
    const comp = await deflate(data, { level: 6 })
    const useDeflate = comp.length < data.length
    const body = useDeflate ? comp : data
    const { time, date } = dosTime(e.date ?? new Date())

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)               // UTF-8 flag
    local.writeUInt16LE(useDeflate ? 8 : 0, 8)
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    parts.push(local, nameBuf, body)

    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0)
    cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0x0800, 8)
    cen.writeUInt16LE(useDeflate ? 8 : 0, 10)
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14)
    cen.writeUInt32LE(crc, 16)
    cen.writeUInt32LE(body.length, 20)
    cen.writeUInt32LE(data.length, 24)
    cen.writeUInt16LE(nameBuf.length, 28)
    cen.writeUInt32LE(offset, 42)
    central.push(cen, nameBuf)
    offset += local.length + nameBuf.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}
