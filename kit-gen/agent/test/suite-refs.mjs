/* suite-refs.mjs — §6.2 D: upload multipart (agent tự đặt tên — đóng G1/G5),
   kiểm magic bytes (415), REF_IN_USE (409) theo V-08. */
import { describe, it, eq, ok, multipart, PNG_1x1 } from "./harness.mjs"

export async function run({ api, pid }) {
  // ─────────────────────────────────────────── 8. REFS multipart
  describe("ảnh tham khảo")
  const PNG_1x1 = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300010000050001" +
    "0d0a2db40000000049454e44ae426082", "hex")
  function multipart(fields) {
    const b = "----kitgentest" + Math.random().toString(16).slice(2)
    const parts = []
    for (const f of fields) {
      parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${f.name}"` +
        (f.filename ? `; filename="${f.filename}"` : "") + `\r\n` +
        (f.contentType ? `Content-Type: ${f.contentType}\r\n` : "") + `\r\n`))
      parts.push(Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data)))
      parts.push(Buffer.from("\r\n"))
    }
    parts.push(Buffer.from(`--${b}--\r\n`))
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` }
  }
  await it("upload ref multipart → AGENT tự đặt tên, client không gửi path", async () => {
    const mp = multipart([
      { name: "file", filename: "Ảnh Nhân Vật.png", contentType: "image/png", data: PNG_1x1 },
      { name: "kind", data: "character" },
      { name: "hintName", data: "Lan" },
    ])
    const r = await api("POST", `/api/projects/${pid}/refs`, {
      headers: { "content-type": mp.contentType }, body: mp.body,
    })
    eq(r.status, 201, "status")
    eq(r.json.name, "char-lan.png", "agent đặt tên theo quy tắc char-<slug>.png")
    eq(r.json.path, "refs/char-lan.png", "path tương đối trong project")
    eq(r.json.w, 1, "đọc được kích thước")
  })
  await it("upload file KHÔNG phải ảnh → 415 BAD_TYPE (kiểm magic bytes)", async () => {
    const mp = multipart([
      { name: "file", filename: "fake.png", contentType: "image/png", data: Buffer.from("#!/bin/sh\nrm -rf /\n") },
      { name: "kind", data: "inspo" },
    ])
    const r = await api("POST", `/api/projects/${pid}/refs`, { headers: { "content-type": mp.contentType }, body: mp.body })
    eq(r.status, 415, "status")
    eq(r.json.error.code, "BAD_TYPE", "code")
  })
  await it("ref đang được dùng → 409 REF_IN_USE, ?force=1 mới xoá", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].ref = "refs/char-lan.png"
    const put = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(put.status, 200, "lưu contract có ref")
    const r = await api("DELETE", `/api/projects/${pid}/refs/char-lan.png`)
    eq(r.status, 409, "status")
    eq(r.json.error.code, "REF_IN_USE", "code")
    ok(r.json.error.details.usedBy.length >= 1, "nêu đúng chỗ đang dùng")
    const f = await api("DELETE", `/api/projects/${pid}/refs/char-lan.png?force=1`)
    eq(f.status, 204, "force xoá được")
  })

}
