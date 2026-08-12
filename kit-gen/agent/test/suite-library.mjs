import { join } from "node:path"
import { describe, eq, includes, it, multipart, ok, pathExists, PNG_1x1 } from "./harness.mjs"

export async function run({ api, wsRoot }) {
  describe("Kho bộ khung và ảnh tham chiếu")

  await it("khởi tạo thiết lập mặc định", async () => {
    const r = await api("GET", "/api/library")
    eq(r.status, 200)
    eq(r.json.settings, { background: 2, popup: 4, small: 16, mascot: 4 })
    eq(r.json.items, [])
  })

  let id = ""
  await it("thêm ảnh bằng multipart và agent tự đặt tên file", async () => {
    const form = multipart([
      { name: "kind", data: "ui" },
      { name: "group", data: "background" },
      { name: "name", data: "Nền trang chủ" },
      { name: "description", data: "Nền chính của trò chơi" },
      { name: "cell", data: "full" },
      { name: "skel", data: JSON.stringify({ shape: "full", w: 1, h: 1 }) },
      { name: "file", filename: "../../outside.png", contentType: "image/png", data: PNG_1x1 },
    ])
    const r = await api("POST", "/api/library/items", { headers: { "content-type": form.contentType }, body: form.body })
    eq(r.status, 201)
    id = r.json.item.id
    ok(/^asset_[a-f0-9]{16}$/.test(id), "id do agent sinh")
    includes(r.json.item.filename, id)
    eq(r.json.item.description, "Nền chính của trò chơi")
    eq(r.json.item.cell, "full")
    eq(r.json.item.skel, { shape: "full", w: 1, h: 1 })
    ok(await pathExists(join(wsRoot, ".kitgen", "library", "assets", r.json.item.filename)))
  })

  await it("đọc file và lưu số lượng tối đa", async () => {
    const file = await api("GET", `/api/library/items/${id}/file`)
    eq(file.status, 200)
    ok(file.body.equals(PNG_1x1), "file không đổi byte")
    const settings = await api("PATCH", "/api/library/settings", { body: { background: 3 } })
    eq(settings.status, 200)
    eq(settings.json.settings.background, 3)
  })

  await it("đổi tên và lưu danh sách pose mascot", async () => {
    const patched = await api("PATCH", `/api/library/items/${id}`, {
      body: {
        name: "Khung nền Tết",
        description: "Nền có khoảng trống ở giữa",
        cell: "landscape",
        skel: { shape: "rrect", w: 0.8, h: 0.6, slice9: true },
      },
    })
    eq(patched.status, 200)
    eq(patched.json.item.name, "Khung nền Tết")
    eq(patched.json.item.description, "Nền có khoảng trống ở giữa")
    eq(patched.json.item.cell, "landscape")
    eq(patched.json.item.skel, { shape: "rrect", w: 0.8, h: 0.6, slice9: true })
  })

  let brandId = ""
  await it("tạo, sửa và xoá hồ sơ nhận dạng thương hiệu", async () => {
    const created = await api("POST", "/api/library/brands", { body: { name: "VCB", colors: ["#006b5b", "#ffffff"], assetIds: [id] } })
    eq(created.status, 201)
    brandId = created.json.brand.id
    ok(/^brand_[a-f0-9]{16}$/.test(brandId), "brand id do agent sinh")
    eq(created.json.brand.assetIds, [id])
    const patched = await api("PATCH", `/api/library/brands/${brandId}`, { body: { description: "Nhận dạng chiến dịch", colors: ["#006b5b"] } })
    eq(patched.status, 200)
    eq(patched.json.brand.description, "Nhận dạng chiến dịch")
    const listed = await api("GET", "/api/library")
    eq(listed.json.brands[0].name, "VCB")
  })

  await it("xoá cả metadata và file", async () => {
    const before = await api("GET", "/api/library")
    const filename = before.json.items[0].filename
    const del = await api("DELETE", `/api/library/items/${id}`)
    eq(del.status, 204)
    ok(!(await pathExists(join(wsRoot, ".kitgen", "library", "assets", filename))))
    const after = await api("GET", "/api/library")
    eq(after.json.items, [])
    eq(after.json.brands[0].assetIds, [])
    const delBrand = await api("DELETE", `/api/library/brands/${brandId}`)
    eq(delBrand.status, 204)
  })
}
