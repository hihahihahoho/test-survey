/* suite-paths.mjs — chống path traversal bằng resolve + realpath (KHÔNG regex).
   Bài học studio-server.mjs dòng 62: `/^refs\//` thua cả ../ và symlink. */
import { mkdir, readFile, symlink, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import { describe, it, eq, ok } from "./harness.mjs"
import { normalizeWidth } from "../lib/thumbs.mjs"
import { imageSize } from "../lib/multipart.mjs"

/* ── PNG thật, đủ to để bản 128px KHÁC HẲN bản gốc ────────────────────────────
   PNG_1x1 của harness không dùng được cho ca "gốc ≠ thumbnail": 1×1 thì thu nhỏ
   xuống 128 vẫn là 1×1. Ở đây dựng một ảnh RGB có nhiễu (nén kém ⇒ file gốc nặng
   hẳn) bằng zlib của Node, không thêm phụ thuộc nào. */
let CRC_T = null
function crc32(buf) {
  if (!CRC_T) {
    CRC_T = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_T[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function noisyPng(w, h) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0   // 8-bit, truecolour RGB
  const raw = Buffer.alloc(h * (1 + w * 3))
  let seed = 0x2b1d
  for (let y = 0, p = 0; y < h; y++) {
    raw[p++] = 0                                                        // filter: none
    for (let x = 0; x < w * 3; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      raw[p++] = (seed >>> 16) & 0xff
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ])
}

export async function run({ api, wsRoot, outsideRoot, pid }) {
  // ─────────────────────────────────────────── 5. PATH TRAVERSAL / SYMLINK
  describe("chống path traversal")
  await it("../ trong files/* bị chặn", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/../../../../etc/passwd`)
    ok([400, 404].includes(r.status), `status ${r.status}`)
    ok(["PATH_ESCAPE", "NOT_FOUND"].includes(r.json?.error?.code), `code ${r.json?.error?.code}`)
    ok(!r.text.includes("root:"), "KHÔNG được trả nội dung /etc/passwd")
  })
  await it("%2e%2e (URL-encoded ../) bị chặn", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd`)
    ok([400, 404].includes(r.status), `status ${r.status}`)
    ok(!r.text.includes("root:"), "KHÔNG được trả nội dung /etc/passwd")
  })
  await it("%2e%2e trong raw/ bị chặn (không đọc được file ngoài workspace)", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/raw%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fsecret.txt`)
    ok([400, 404].includes(r.status), `status ${r.status}`)
    ok(!r.text.includes("BÍ MẬT"), "KHÔNG được đọc file ngoài workspace")
  })
  await it("đường dẫn tuyệt đối bị chặn", async () => {
    const r = await api("GET", `/api/projects/${pid}/files//etc/hosts`)
    ok(r.status >= 400, `status ${r.status}`)
    ok(!/localhost/.test(r.text) || r.json?.error, "không trả nội dung /etc/hosts")
  })
  await it("symlink trỏ RA NGOÀI workspace bị chặn (regex không làm được việc này)", async () => {
    const link = join(wsRoot, "projects", pid, "refs", "escape.png")
    await symlink(join(outsideRoot, "secret.txt"), link)
    const r = await api("GET", `/api/projects/${pid}/files/refs/escape.png`)
    ok(r.status >= 400, `phải bị chặn, nhận status ${r.status}`)
    eq(r.json?.error?.code, "PATH_ESCAPE", "code")
    ok(!r.text.includes("BÍ MẬT"), "KHÔNG được đọc qua symlink")
    await rm(link, { force: true })
  })
  await it("symlink cả THƯ MỤC trỏ ra ngoài cũng bị chặn", async () => {
    const link = join(wsRoot, "projects", pid, "kits", "out")
    await symlink(outsideRoot, link, "dir")
    const r = await api("GET", `/api/projects/${pid}/files/kits/out/secret.txt`)
    ok(r.status >= 400, `phải bị chặn, nhận status ${r.status}`)
    ok(!r.text.includes("BÍ MẬT"), "KHÔNG được đi qua symlink thư mục")
    await rm(link, { force: true })
  })
  await it("chỉ đọc được thư mục dữ liệu; .history và file lạ bị từ chối", async () => {
    const r = await api("GET", `/api/projects/${pid}/files/.history/contract/x.json`)
    eq(r.status, 400, "status")
    eq(r.json.error.code, "PATH_ESCAPE", "code")
  })
  await it("ref name có dấu / bị từ chối (không ghi ra ngoài refs/)", async () => {
    const r = await api("DELETE", `/api/projects/${pid}/refs/..%2f..%2fgen.sh`)
    ok(r.status >= 400, `status ${r.status}`)
    ok(["BAD_REQUEST", "PATH_ESCAPE", "REF_NOT_FOUND", "NOT_FOUND"].includes(r.json?.error?.code), `code ${r.json?.error?.code}`)
  })

  /* ──────────────────────────── #41: ẢNH GỐC ≠ THUMBNAIL ────────────────────
     P0 tìm được lúc QA trên máy thật: `GET …/files/kits/chinh/tight/22-board-panel.png`
     KHÔNG kèm `?w=` vẫn trả về 128×128/24 KB trong khi file thật là 657×659/625 KB.
     Nguyên nhân: `Number(null) === 0` là số hữu hạn ⇒ `normalizeWidth` nắn "vắng mặt"
     thành 128 (giá trị ALLOWED_W gần 0 nhất). Mọi đường `loadFull()` của web dính:
     Xem ảnh gốc, lightbox zoom, Tải file, Copy ảnh, và Copy sang Figma cả kit (108 ảnh
     nhúng ở 128px — chính là "copy ra Figma bé tí, bị vỡ").
     Hai ca dưới khoá CẢ HAI TẦNG: hàm nắn, và route. */
  describe("đọc file: ảnh gốc vs thumbnail")

  await it("normalizeWidth phân biệt VẮNG MẶT (→ null = ảnh gốc) với giá trị lạ (→ nắn)", () => {
    eq(normalizeWidth(null), null, "không có tham số w ⇒ ảnh GỐC")
    eq(normalizeWidth(undefined), null, "undefined cũng là không có")
    eq(normalizeWidth("abc"), null, "không phải số ⇒ ảnh gốc, không đoán bừa")
    // Có mặt nhưng lạ thì vẫn nắn — caller ĐÃ xin bản thu nhỏ, chỉ là xin sai số.
    eq(normalizeWidth("256"), 256, "đúng giá trị cho phép")
    eq(normalizeWidth("400"), 512, "nắn về giá trị gần nhất")
    eq(normalizeWidth("1"), 128, "số nhỏ vẫn ra 128 — đây mới là ý nghĩa của 128")
  })

  await it("#41 KHÔNG kèm ?w= trả ĐÚNG BYTE file gốc (không phải thumbnail 128px)", async () => {
    const rel = "kits/chinh/tight/22-board-panel.png"
    const abs = join(wsRoot, "projects", pid, rel)
    await mkdir(join(wsRoot, "projects", pid, "kits", "chinh", "tight"), { recursive: true })
    const original = noisyPng(320, 320)
    await writeFile(abs, original)
    eq(imageSize(await readFile(abs)), { w: 320, h: 320 }, "ảnh gốc trên đĩa")

    const full = await api("GET", `/api/projects/${pid}/files/${rel}`)
    eq(full.status, 200, "status")
    eq(full.body.length, original.length, "SỐ BYTE phải bằng đúng file trên đĩa")
    ok(full.body.equals(original), "byte-for-byte là file gốc")
    eq(imageSize(full.body), { w: 320, h: 320 }, "kích thước ảnh trả về")

    // Đối chứng: xin thumbnail thì PHẢI nhận thumbnail — bản vá không giết đường kia.
    const thumb = await api("GET", `/api/projects/${pid}/files/${rel}?w=128`)
    eq(thumb.status, 200, "status ?w=128")
    if (thumb.headers["x-kitgen-thumb"] === "unavailable") {
      // Máy không có Pillow: thumbs.mjs cố ý trả ảnh gốc + khai báo thật thà.
      ok(thumb.body.equals(original), "không Pillow ⇒ trả gốc kèm X-KitGen-Thumb: unavailable")
    } else {
      eq(imageSize(thumb.body).w, 128, "?w=128 ⇒ ảnh rộng 128px")
      ok(!thumb.body.equals(full.body), "gốc và thumbnail KHÔNG được là cùng một thứ")
      /* KHÔNG khẳng định "thumbnail nhẹ byte hơn": ảnh nhiễu dựng ở đây thu nhỏ xong
         gần như không nén được nữa, nên bản 128px có thể NẶNG hơn bản 320px. Điều
         phải đúng là KÍCH THƯỚC ẢNH, và đó là điều đang được đo ngay trên. */
    }
    await rm(abs, { force: true })
  })

}
