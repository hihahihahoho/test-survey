/* suite-refs.mjs — §6.2 D: upload multipart (agent tự đặt tên — đóng G1/G5),
   kiểm magic bytes (415), REF_IN_USE (409) theo V-08. */
import { deflateSync } from "node:zlib"
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

  /* `poseRef` là TẤM ẢNH DÁNG ghép sẵn của sheet nhân vật — cùng một tệp trong
     `refs/` như `ref`, chỉ khác vai trò trong prompt. Nếu `refUsage` không nhìn
     trường này thì xoá ảnh ấy đi là 204 im lặng, và lượt vẽ sau mất ảnh dáng mà
     không ai được báo. Ca này canh đúng chỗ đó, không canh gì khác. */
  await it("ảnh dáng ghép (poseRef) cũng được tính là ĐANG DÙNG", async () => {
    const mp = multipart([
      { name: "file", filename: "sheet.png", contentType: "image/png", data: PNG_1x1 },
      { name: "kind", data: "character" },
      { name: "hintName", data: "Tam dang" },
    ])
    const up = await api("POST", `/api/projects/${pid}/refs`, {
      headers: { "content-type": mp.contentType }, body: mp.body,
    })
    eq(up.status, 201, "tải tấm ảnh dáng lên")

    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].poseRef = up.json.path
    const put = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(put.status, 200, "contract có poseRef vẫn lưu được")

    const r = await api("DELETE", `/api/projects/${pid}/refs/${up.json.name}`)
    eq(r.status, 409, "status")
    eq(r.json.error.code, "REF_IN_USE", "code")
    ok(r.json.error.details.usedBy.some(u => u.kind === "sheetPose"), "nói rõ nó bị dùng làm ảnh dáng")
  })

  /* Đường dẫn thoát ra ngoài project bị chặn ở `ref` từ lâu; `poseRef` phải chịu
     ĐÚNG luật ấy, nếu không thì contract đọc được tệp ngoài thư mục dự án. */
  await it("poseRef có `..` → contract bị TỪ CHỐI, y như ref", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].poseRef = "../../etc/passwd.png"
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 422, "status")
    eq(r.json.error.code, "CONTRACT_INVALID", "code")
    ok(JSON.stringify(r.json.error.details).includes("REF_PATH"), "nêu đúng luật REF_PATH")
  })

  /* `layoutRef` là BẢN PHÁC BỐ CỤC của tấm nền — tấm thứ ba cùng nằm trong `refs/`
     và cùng phải chịu hai luật của `ref`: không xoá được khi đang dùng, và không
     được trỏ ra ngoài dự án. Thêm một trường ảnh mà quên `refUsage` là mở lại
     đúng cái hố mà `poseRef` vừa bịt ở hai ca trên. */
  await it("bản phác bố cục (layoutRef) cũng được tính là ĐANG DÙNG", async () => {
    const mp = multipart([
      { name: "file", filename: "phac.png", contentType: "image/png", data: PNG_1x1 },
      { name: "kind", data: "inspo" },
      { name: "hintName", data: "Phac bo cuc" },
    ])
    const up = await api("POST", `/api/projects/${pid}/refs`, {
      headers: { "content-type": mp.contentType }, body: mp.body,
    })
    eq(up.status, 201, "tải bản phác lên")

    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].layoutRef = up.json.path
    const put = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(put.status, 200, "contract có layoutRef vẫn lưu được")

    const r = await api("DELETE", `/api/projects/${pid}/refs/${up.json.name}`)
    eq(r.status, 409, "status")
    eq(r.json.error.code, "REF_IN_USE", "code")
    ok(r.json.error.details.usedBy.some(u => u.kind === "sheetLayout"), "nói rõ nó bị dùng làm bản phác bố cục")
  })

  await it("layoutRef có `..` → contract bị TỪ CHỐI, y như ref", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].layoutRef = "../../etc/passwd.png"
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 422, "status")
    eq(r.json.error.code, "CONTRACT_INVALID", "code")
    ok(JSON.stringify(r.json.error.details).includes("REF_PATH"), "nêu đúng luật REF_PATH")
  })

  /* ══ NỀN CỦA ẢNH THAM CHIẾU, VÀ MÔ TẢ CHO MÁY VẼ ═══════════════════════════
     Từ 09/09/2026 `gen.sh` quyết định ĐÍNH hay TẢ theo TỪNG tấm ảnh: ảnh có nền
     trong suốt thật thì đính thẳng cho image_gen, ảnh đục thì phải qua một lượt
     codex tả thành chữ. Hai hệ quả người dùng nhìn thấy — một nhãn trên pill ảnh,
     và một đoạn chữ họ sửa được — đều bắt đầu từ mấy route dưới đây. */

  /** PNG RGBA đặc một màu, `a=0` là trong suốt hoàn toàn. Dựng tay để ca test
      không phụ thuộc một thư viện ảnh nào — Node có sẵn zlib, PNG thì chỉ là
      IHDR + IDAT + IEND với CRC32 ở cuối mỗi chunk. */
  function rgbaPng(w, h, a) {
    const raw = Buffer.alloc(h * (1 + w * 4))
    for (let y = 0; y < h; y += 1) {
      const row = y * (1 + w * 4)
      raw[row] = 0                                   // filter type 0 (none)
      for (let x = 0; x < w; x += 1) {
        const i = row + 1 + x * 4
        raw[i] = 200; raw[i + 1] = 60; raw[i + 2] = 60; raw[i + 3] = a
      }
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
    ihdr[8] = 8; ihdr[9] = 6                          // 8 bit, colour type 6 = RGBA
    return Buffer.concat([
      Buffer.from("89504e470d0a1a0a", "hex"),
      chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ])
  }
  function chunk(type, data) {
    const head = Buffer.alloc(4)
    head.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body) >>> 0, 0)
    return Buffer.concat([head, body, tail])
  }
  function crc32(buf) {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c
  }

  const up = async (data, hint) => {
    const mp = multipart([
      { name: "file", filename: `${hint}.png`, contentType: "image/png", data },
      { name: "kind", data: "character" },
      { name: "hintName", data: hint },
    ])
    return api("POST", `/api/projects/${pid}/refs`, { headers: { "content-type": mp.contentType }, body: mp.body })
  }

  await it("ảnh nền TRONG SUỐT và ảnh nền ĐỤC được khai khác nhau (`alpha`)", async () => {
    const trong = await up(rgbaPng(8, 8, 0), "Trong")
    const duc = await up(rgbaPng(8, 8, 255), "Duc")
    eq(trong.status, 201, "tải ảnh trong suốt")
    eq(duc.status, 201, "tải ảnh đục")
    /* Không có Pillow trên máy chạy test thì CẢ HAI về `false` — đó là đường an
       toàn và gen.sh cũng đi đúng đường ấy. Ca này chỉ có nghĩa khi đo được. */
    if (trong.json.alpha !== true) return
    eq(duc.json.alpha, false, "PNG RGBA alpha 255 toàn tấm là ĐỤC, không phải 'có kênh alpha'")
    const list = await api("GET", `/api/projects/${pid}/refs`)
    eq(list.json.items.find(i => i.name === trong.json.name).alpha, true, "danh sách cũng khai")
    eq(list.json.items.find(i => i.name === duc.json.name).alpha, false, "…và khai cho cả hai chiều")
  })

  await it("mô tả cho máy vẽ: GET rỗng → PUT → GET đọc lại được, cờ `user` bật", async () => {
    const r0 = await api("GET", `/api/projects/${pid}/refs/char-trong.png/desc`)
    eq(r0.status, 200, "chưa có mô tả vẫn 200")
    eq(r0.json.exists, false, "…và nói thẳng là chưa có")
    eq(r0.json.text, "", "không bịa ra chữ nào")

    const put = await api("PUT", `/api/projects/${pid}/refs/char-trong.png/desc`, {
      body: { text: "A round red squirrel, head 40% of total height.", role: "character" },
    })
    eq(put.status, 200, "lưu được")
    eq(put.json.user, true, "cờ `user` — gen.sh sẽ KHÔNG tả đè lên chữ này")
    eq(put.json.stale, false, "mô tả đang khớp đúng tấm ảnh hiện có")

    const r1 = await api("GET", `/api/projects/${pid}/refs/char-trong.png/desc`)
    eq(r1.json.text, "A round red squirrel, head 40% of total height.", "đọc lại nguyên văn")
    eq(r1.json.role, "character", "giữ đúng vai")
  })

  await it("mô tả rỗng = TRẢ LẠI CHO MÁY TẢ, không phải đóng đinh một mô tả rỗng", async () => {
    const r = await api("PUT", `/api/projects/${pid}/refs/char-trong.png/desc`, { body: { text: "   " } })
    eq(r.status, 200, "status")
    eq(r.json.exists, false, "file cache bị xoá hẳn ⇒ lượt Vẽ tới tả lại như mới")
  })

  await it("mô tả không phải là một tấm ảnh: nó KHÔNG lọt vào danh sách ref", async () => {
    await api("PUT", `/api/projects/${pid}/refs/char-trong.png/desc`, { body: { text: "mot mo ta" } })
    const list = await api("GET", `/api/projects/${pid}/refs`)
    ok(!list.json.items.some(i => i.name.endsWith(".desc.txt")), "cache mô tả không đội lốt một tấm ảnh")
  })

  await it("desc: vai lạ → 400, chữ quá dài → 413, ảnh không có → 404", async () => {
    const bad = await api("PUT", `/api/projects/${pid}/refs/char-trong.png/desc`,
      { body: { text: "x", role: "mascot" } })
    eq(bad.status, 400, "vai lạ bị từ chối — ghi một vai gen.sh không biết là mô tả không bao giờ được dùng")
    const big = await api("PUT", `/api/projects/${pid}/refs/char-trong.png/desc`,
      { body: { text: "x".repeat(8001) } })
    eq(big.status, 413, "trần chữ")
    const miss = await api("GET", `/api/projects/${pid}/refs/khong-co-that.png/desc`)
    eq(miss.status, 404, "không có ảnh thì không có mô tả")
    eq(miss.json.error.code, "REF_NOT_FOUND", "code")
  })

  await it("desc: `..` trong tên ref KHÔNG thoát khỏi refs/ (cả GET lẫn PUT)", async () => {
    for (const method of ["GET", "PUT"]) {
      const r = await api(method, `/api/projects/${pid}/refs/..%2F..%2Fgen.sh/desc`,
        method === "PUT" ? { body: { text: "x" } } : {})
      ok(r.status === 400 || r.status === 404, `${method} bị chặn (status ${r.status})`)
    }
  })

}
