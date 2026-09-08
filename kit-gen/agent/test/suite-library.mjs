import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, eq, includes, it, multipart, ok, pathExists, PNG_1x1 } from "./harness.mjs"

export async function run({ api, wsRoot }) {
  describe("Kho bộ khung và ảnh tham chiếu")

  await it("khởi tạo thiết lập mặc định", async () => {
    const r = await api("GET", "/api/library")
    eq(r.status, 200)
    eq(r.json.settings, { background: 2, popup: 4, small: 16, props: 16, mascot: 4 })
    eq(r.json.items, [])
    /* `poseTemplates` (19 khung dáng dựng sẵn) đã bị bỏ 08/09/2026 cùng tab «khung
       pose»: không web lẫn engine nào đọc nữa. Ca này khoá lại rằng nó KHÔNG quay
       về — một mảng 19 phần tử trong mọi lần `GET /api/library` là chi phí thật. */
    eq(r.json.poseTemplates, undefined)
    /* v4: kho mở ra là có sẵn ô cho danh mục người dùng tự sửa. Rỗng, không phải
       thiếu — web phân biệt hai thứ đó để biết có cần gieo hạt giống hay không. */
    eq(r.json.version, 4)
    eq(r.json.presets, [])
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

  let mascotId = ""
  await it("lưu tên, nhãn và pose skeleton cho từng mascot", async () => {
    const form = multipart([
      { name: "kind", data: "mascot" },
      { name: "group", data: "mascot" },
      { name: "name", data: "Sóc VCB" },
      { name: "tags", data: JSON.stringify(["VCB", "ngân hàng"]) },
      { name: "poses", data: JSON.stringify(["idle", "wave", "cheer"]) },
      { name: "file", filename: "squirrel.png", contentType: "image/png", data: PNG_1x1 },
    ])
    const added = await api("POST", "/api/library/items", { headers: { "content-type": form.contentType }, body: form.body })
    eq(added.status, 201)
    mascotId = added.json.item.id
    eq(added.json.item.tags, ["VCB", "ngân hàng"])
    eq(added.json.item.poses, ["idle", "wave", "cheer"])
    const patched = await api("PATCH", `/api/library/items/${mascotId}`, { body: { tags: ["VCB", "Tết"] } })
    eq(patched.json.item.tags, ["VCB", "Tết"])
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

  await it("preset: tạo, sửa, xoá — và `data` là JSON tự do do web định nghĩa", async () => {
    const created = await api("POST", "/api/library/presets", {
      body: { kind: "element", name: "Nút bấm", data: { vi: "Nút bấm", en: "a primary action button", decor: 4, materialId: "" } },
    })
    eq(created.status, 201)
    const presetId = created.json.preset.id
    ok(/^preset_[a-f0-9]{16}$/.test(presetId), "preset id do agent sinh")
    eq(created.json.preset.kind, "element")
    eq(created.json.preset.data.decor, 4)

    /* `data` thay CẢ CỤM, không trộn nông: gửi thiếu `materialId` là nó biến mất. */
    const patched = await api("PATCH", `/api/library/presets/${presetId}`, {
      body: { name: "Nút chính", data: { vi: "Nút chính", en: "a primary action button", decor: 6 } },
    })
    eq(patched.status, 200)
    eq(patched.json.preset.name, "Nút chính")
    eq(patched.json.preset.data, { vi: "Nút chính", en: "a primary action button", decor: 6 })
    eq(patched.json.preset.kind, "element", "không gửi kind thì kind giữ nguyên")

    const listed = await api("GET", "/api/library")
    eq(listed.json.presets.length, 1)
    eq(listed.json.presets[0].id, presetId)

    const del = await api("DELETE", `/api/library/presets/${presetId}`)
    eq(del.status, 204)
    eq((await api("GET", "/api/library")).json.presets, [])
  })

  await it("preset: POST lặp cùng `kind`+`data.key` ⇒ upsert nhẹ, kho chỉ có MỘT bản", async () => {
    /* Cảnh thật đã làm bẩn `~/KitGen-dev`: web gieo hạt giống, trang được tải lại
       giữa chừng, và cả bộ POST bay đi LẦN THỨ HAI. Agent là chỗ duy nhất nhìn
       thấy cả hai lần đó, nên nó phải là chỗ chặn. */
    const seed = { kind: "element", name: "Nút bấm", data: { key: "button", en: "a primary action button", decor: 4 } }
    const first = await api("POST", "/api/library/presets", { body: seed })
    eq(first.status, 201)
    const keptId = first.json.preset.id

    /* Người dùng sửa bản ấy — đây là thứ KHÔNG ĐƯỢC MẤT ở lần gieo lại. */
    await api("PATCH", `/api/library/presets/${keptId}`, { body: { name: "Nút chính", data: { key: "button", en: "gõ tay", decor: 7 } } })

    const again = await api("POST", "/api/library/presets", { body: seed })
    eq(again.status, 201, "vẫn 201: sau lệnh này preset tồn tại — đúng trong cả hai trường hợp")
    eq(again.json.preset.id, keptId, "trả về ĐÚNG bản đã có, không sinh id mới")
    eq(again.json.preset.name, "Nút chính", "KHÔNG đắp hạt giống mặc định lên bản người dùng đã sửa")
    eq(again.json.preset.data.decor, 7)

    const listed = await api("GET", "/api/library")
    eq(listed.json.presets.length, 1, "gieo hai lần ⇒ vẫn một bản")

    /* Cùng `key` nhưng KHÁC `kind` là hai danh tính khác nhau — không được gộp. */
    const otherKind = await api("POST", "/api/library/presets", { body: { kind: "style", name: "Nút bấm", data: { key: "button", en: "x" } } })
    eq(otherKind.status, 201)
    ok(otherKind.json.preset.id !== keptId, "`kind` khác ⇒ bản ghi khác")

    /* KHÔNG có `key` ⇒ không có danh tính ⇒ luôn tạo mới. Gộp những bản này lại
       theo `kind` là xoá dữ liệu của người tạo chúng bằng tay / bằng curl. */
    const noKey1 = await api("POST", "/api/library/presets", { body: { kind: "style", name: "Không khoá", data: { en: "a" } } })
    const noKey2 = await api("POST", "/api/library/presets", { body: { kind: "style", name: "Không khoá", data: { en: "a" } } })
    ok(noKey1.json.preset.id !== noKey2.json.preset.id, "thiếu `key` ⇒ vẫn là hai bản ghi riêng")
    eq((await api("GET", "/api/library")).json.presets.length, 4)

    for (const id of [keptId, otherKind.json.preset.id, noKey1.json.preset.id, noKey2.json.preset.id]) {
      eq((await api("DELETE", `/api/library/presets/${id}`)).status, 204)
    }
  })

  await it("preset: PATCH không được kéo bản này đè lên danh tính của bản khác", async () => {
    const a = await api("POST", "/api/library/presets", { body: { kind: "element", name: "A", data: { key: "aaa", en: "a" } } })
    const b = await api("POST", "/api/library/presets", { body: { kind: "element", name: "B", data: { key: "bbb", en: "b" } } })
    /* Không có hàng rào này, `dedupePresets` sẽ lặng lẽ bỏ một trong hai ở lần ghi
       kế tiếp — một lệnh SỬA lại XOÁ mất một bản ghi khác, mà không ai báo gì. */
    eq((await api("PATCH", `/api/library/presets/${b.json.preset.id}`, { body: { data: { key: "aaa", en: "b" } } })).status, 400)
    /* Nhưng PATCH giữ nguyên khoá của CHÍNH NÓ thì vẫn phải chạy được. */
    eq((await api("PATCH", `/api/library/presets/${b.json.preset.id}`, { body: { name: "B mới", data: { key: "bbb", en: "b2" } } })).status, 200)
    eq((await api("GET", "/api/library")).json.presets.length, 2)
    eq((await api("DELETE", `/api/library/presets/${a.json.preset.id}`)).status, 204)
    eq((await api("DELETE", `/api/library/presets/${b.json.preset.id}`)).status, 204)
  })

  await it("preset: nhận đủ MƯỜI `kind` danh mục mới của web, mỗi kind một danh tính riêng", async () => {
    /* Từ 09/2026 web quản lý được mười danh mục nữa (chủ đề · khung cảnh · bố cục ·
       đục nền · trang trí · bố trí · dáng · góc máy · biểu cảm · trang phục). Nếu
       agent không nhận `kind` của chúng thì màn «Thư viện prompt» vẫn chạy — bằng
       hạt giống trong RAM — và mọi thứ người dùng sửa BỐC HƠI sau khi tải lại trang,
       với đúng một dòng lỗi nhỏ ở góc màn. Đó là lý do ca này tồn tại.
       `PRESET_KINDS` của `lib/library.mjs` phải khớp `libraryPresetSchema.kind` của
       `webapp/src/lib/types/api.ts`. */
    const kinds = ["theme", "scene", "layout", "glaze", "decor", "decorPlace", "pose", "view", "expression", "outfit"]
    const made = []
    for (const kind of kinds) {
      const res = await api("POST", "/api/library/presets", {
        body: { kind, name: `Mục ${kind}`, data: { key: "chung-mot-khoa", en: `phrase for ${kind}`, hidden: true } },
      })
      eq(res.status, 201, `kind ${kind} phải được nhận`)
      eq(res.json.preset.kind, kind)
      eq(res.json.preset.data.hidden, true, "`data` là JSON tự do — cờ ẩn của web đi qua nguyên vẹn")
      made.push(res.json.preset.id)
    }
    /* CÙNG `data.key` nhưng KHÁC `kind` ⇒ mười bản ghi riêng, không bị gộp:
       danh tính của một preset là cặp `kind`+`key`, và mười danh mục dùng chung
       vài id (chủ đề và trang phục cùng gieo từ một bảng). */
    eq(new Set(made).size, kinds.length)
    eq((await api("GET", "/api/library")).json.presets.length, kinds.length)
    for (const id of made) eq((await api("DELETE", `/api/library/presets/${id}`)).status, 204)
    eq((await api("GET", "/api/library")).json.presets, [])
  })

  await it("preset: từ chối kind lạ, tên rỗng, data không phải object và id sai dạng", async () => {
    eq((await api("POST", "/api/library/presets", { body: { kind: "khong-co", name: "X", data: {} } })).status, 400)
    eq((await api("POST", "/api/library/presets", { body: { kind: "style", name: "   ", data: {} } })).status, 400)
    eq((await api("POST", "/api/library/presets", { body: { kind: "style", name: "X", data: [1, 2] } })).status, 400)
    eq((await api("POST", "/api/library/presets", { body: { kind: "style", name: "X", data: "chuoi" } })).status, 400)
    /* Trần 8000 byte JSON — chặn một bản ghi khổng lồ nuốt cả file state. */
    eq((await api("POST", "/api/library/presets", { body: { kind: "style", name: "X", data: { en: "x".repeat(9000) } } })).status, 400)
    eq((await api("PATCH", "/api/library/presets/preset_khongphaihex", { body: { name: "X" } })).status, 400)
    eq((await api("PATCH", "/api/library/presets/preset_00112233445566ff", { body: { name: "X" } })).status, 404)
    eq((await api("DELETE", "/api/library/presets/preset_00112233445566ff")).status, 404)
  })

  await it("xoá cả metadata và file", async () => {
    const before = await api("GET", "/api/library")
    const filename = before.json.items.find(item => item.id === id).filename
    const del = await api("DELETE", `/api/library/items/${id}`)
    eq(del.status, 204)
    ok(!(await pathExists(join(wsRoot, ".kitgen", "library", "assets", filename))))
    const after = await api("GET", "/api/library")
    eq(after.json.items.map(item => item.id), [mascotId])
    eq(after.json.brands[0].assetIds, [])
    const delBrand = await api("DELETE", `/api/library/brands/${brandId}`)
    eq(delBrand.status, 204)
    const delMascot = await api("DELETE", `/api/library/items/${mascotId}`)
    eq(delMascot.status, 204)
  })

  /* ĐẶT CUỐI CÙNG CÓ CHỦ Ý: ca này GHI ĐÈ file state trên đĩa, nên nó phải chạy
     sau khi mọi ca trên đã dùng xong kho. */
  await it("di trú v3 → v4: đọc file đời cũ không mất một trường nào", async () => {
    const libDir = join(wsRoot, ".kitgen", "library")
    await mkdir(libDir, { recursive: true })
    /* Một file ĐÚNG như đời v3 ghi ra: không có khoá `presets` nào cả. */
    const v3 = {
      version: 3,
      brands: [{ id: "brand_00112233445566aa", name: "VCB cũ", description: "Hồ sơ đời v3", colors: ["#006b5b"], assetIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      poseTemplates: [{ id: "pose_idle", name: "Đứng thẳng", description: "", sourcePose: "idle", enabled: true, builtIn: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      settings: { background: 5, popup: 4, small: 16, props: 16, mascot: 4 },
      items: [{ id: "asset_00112233445566bb", kind: "reference", group: "style", name: "Ảnh đời v3", description: "", tags: ["cũ"], filename: "asset_00112233445566bb.png", bytes: 70, w: 1, h: 1, poses: [], createdAt: "2026-01-01T00:00:00.000Z" }],
    }
    await writeFile(join(libDir, "library.json"), JSON.stringify(v3), "utf8")

    const r = await api("GET", "/api/library")
    eq(r.status, 200)
    eq(r.json.version, 4, "số phiên bản đã lên 4")
    eq(r.json.presets, [], "thiếu `presets` ⇒ mảng rỗng, KHÔNG phải lỗi")
    /* Ba mảng cũ còn dùng phải đi qua nguyên vẹn — đây mới là điều "không mất gì"
       nghĩa là gì. */
    eq(r.json.brands.length, 1)
    eq(r.json.brands[0].name, "VCB cũ")
    eq(r.json.brands[0].colors, ["#006b5b"])
    /* `poseTemplates` của file cũ bị LƯỢC BỎ chứ không làm hỏng lần đọc — đó chính
       là điều phải chứng minh khi bỏ một khoá khỏi state. */
    eq(r.json.poseTemplates, undefined, "khoá đã bỏ không quay lại, và không crash")
    eq(r.json.settings, { background: 5, popup: 4, small: 16, props: 16, mascot: 4 })
    eq(r.json.items.map(item => item.id), ["asset_00112233445566bb"])
    eq(r.json.items[0].tags, ["cũ"])

    /* Và một lần ghi bất kỳ sau đó phải ĐÓNG DẤU v4 xuống đĩa, không để file
       lửng lơ ở v3 rồi lần sau lại phải di trú lại. */
    const created = await api("POST", "/api/library/presets", { body: { kind: "style", name: "Sau di trú", data: { en: "cozy" } } })
    eq(created.status, 201)
    const again = await api("GET", "/api/library")
    eq(again.json.version, 4)
    eq(again.json.presets.map(preset => preset.name), ["Sau di trú"])
    eq(again.json.brands[0].name, "VCB cũ", "ghi preset không đụng vào phần dữ liệu cũ")
    eq((await api("DELETE", `/api/library/presets/${created.json.preset.id}`)).status, 204)
  })

  /* CŨNG GHI ĐÈ FILE STATE ⇒ phải đứng sau mọi ca dùng kho, như ca di trú trên. */
  await it("dọn bản trùng có sẵn trên đĩa: giữ bản CŨ NHẤT, workspace tự sạch khi đọc", async () => {
    const libDir = join(wsRoot, ".kitgen", "library")
    await mkdir(libDir, { recursive: true })
    /* Đúng hình dạng mà `~/KitGen-dev` đã dính: hạt giống gieo hai lần, nên có
       hai bản `element:button` — bản cũ đã được người dùng sửa tên, bản mới là
       mặc định gieo lại đè lên sau. */
    const dirty = {
      version: 4,
      brands: [], poseTemplates: [], settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 }, items: [],
      presets: [
        { id: "preset_00000000000000a1", kind: "element", name: "Nút của tôi", data: { key: "button", en: "đã sửa" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
        { id: "preset_00000000000000a2", kind: "element", name: "Popover", data: { key: "popover", en: "b" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "preset_00000000000000a3", kind: "element", name: "Nút bấm", data: { key: "button", en: "mặc định" }, createdAt: "2026-03-09T00:00:00.000Z", updatedAt: "2026-03-09T00:00:00.000Z" },
        /* Trùng khoá nhưng `createdAt` BẰNG NHAU (cùng mili-giây — chuyện thường
           khi vòng gieo chạy liên tiếp): bản đứng TRƯỚC thắng, vì thứ tự mảng
           chính là thứ tự tạo. */
        { id: "preset_00000000000000a4", kind: "style", name: "Cổ tích", data: { key: "fairy", en: "trước" }, createdAt: "2026-02-02T00:00:00.000Z", updatedAt: "2026-02-02T00:00:00.000Z" },
        { id: "preset_00000000000000a5", kind: "style", name: "Cổ tích", data: { key: "fairy", en: "sau" }, createdAt: "2026-02-02T00:00:00.000Z", updatedAt: "2026-02-02T00:00:00.000Z" },
      ],
    }
    await writeFile(join(libDir, "library.json"), JSON.stringify(dirty), "utf8")

    const r = await api("GET", "/api/library")
    eq(r.status, 200)
    eq(r.json.presets.length, 3, "5 bản ghi, 2 bản trùng bị bỏ")
    eq(r.json.presets.map(preset => preset.id), ["preset_00000000000000a1", "preset_00000000000000a2", "preset_00000000000000a4"])
    /* Điều cốt lõi: bản GIỮ LẠI là bản người dùng đã sửa, không phải hạt giống
       mặc định gieo đè lên sau. Giữ bản mới là lặng lẽ ném đi công của họ. */
    eq(r.json.presets[0].name, "Nút của tôi")
    eq(r.json.presets[0].data.en, "đã sửa")

    /* Và một lần ghi bất kỳ sau đó ĐÓNG DẤU bản đã dọn xuống đĩa — không để file
       bẩn nằm lại rồi mỗi lần đọc phải dọn lại. */
    eq((await api("DELETE", "/api/library/presets/preset_00000000000000a2")).status, 204)
    const raw = JSON.parse(await readFile(join(libDir, "library.json"), "utf8"))
    eq(raw.presets.map(preset => preset.id), ["preset_00000000000000a1", "preset_00000000000000a4"])
  })
}
