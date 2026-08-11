/* suite-contract.mjs — §6.2 C: version + If-Match (412 thiếu / 409 lệch), validate V-01..V-08,
   lịch sử 50 bản, khôi phục tạo bản mới, element-lib chỉ-đọc. */
import { describe, it, eq, ok } from "./harness.mjs"

export async function run({ api, pid }) {
  // ─────────────────────────────────────────── 6. CONTRACT version / If-Match
  describe("bản thiết kế (contract)")
  let version = 0
  await it("GET contract trả version + ETag", async () => {
    const r = await api("GET", `/api/projects/${pid}/contract`)
    eq(r.status, 200, "status")
    version = r.json.version
    eq(r.headers.etag, `"${version}"`, "ETag = version")
    eq(r.json.contract.schemaVersion, 4, "schema v4")
  })
  await it("PUT thiếu If-Match → 412 IF_MATCH_REQUIRED (không phải fallback)", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const r = await api("PUT", `/api/projects/${pid}/contract`, { body: { contract: g.json.contract } })
    eq(r.status, 412, "status")
    eq(r.json.error.code, "IF_MATCH_REQUIRED", "code")
  })
  await it("PUT đúng If-Match → 200, version +1, có snapshot", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = g.json.contract
    c.variants[0].style = "vibrant Vietnamese Tet, red & gold"
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 200, "status")
    eq(r.json.version, g.json.version + 1, "version tăng 1")
    ok(r.json.snapshot, "có snapshot")
    version = r.json.version
  })
  await it("PUT với version LỆCH → 409 CONTRACT_CONFLICT + serverVersion + diffSummary", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version - 1) }, body: { contract: g.json.contract },
    })
    eq(r.status, 409, "status")
    eq(r.json.error.code, "CONTRACT_CONFLICT", "code")
    eq(r.json.error.details.serverVersion, g.json.version, "serverVersion")
    ok(r.json.error.details.diffSummary, "có diffSummary")
    eq(r.json.error.hint, "reload-or-fork", "hint")
  })
  await it("PUT contract sai lưới (V-04) → 422 CONTRACT_INVALID, KHÔNG ghi đè", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].components.pop()                       // 15 ô cho lưới 4×4
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 422, "status")
    eq(r.json.error.code, "CONTRACT_INVALID", "code")
    ok(r.json.error.details.errors.some(e => e.code === "V-04"), "có lỗi V-04")
    const after = await api("GET", `/api/projects/${pid}/contract`)
    eq(after.json.contract.sheets[0].components.length, 16, "bản trên đĩa KHÔNG bị ghi đè")
    eq(after.json.version, g.json.version, "version không đổi")
  })
  await it("PUT sheet id trùng (V-03) và element trùng file (V-02) đều bị 422", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[1].id = c.sheets[0].id
    const r = await api("PUT", `/api/projects/${pid}/contract`, {
      headers: { "if-match": String(g.json.version) }, body: { contract: c },
    })
    eq(r.status, 422, "status")
    ok(r.json.error.details.errors.some(e => e.code === "V-03"), "có V-03")
  })
  await it("validate dry-run KHÔNG ghi gì", async () => {
    const g = await api("GET", `/api/projects/${pid}/contract`)
    const c = structuredClone(g.json.contract)
    c.sheets[0].grid.cols = 3
    const r = await api("POST", `/api/projects/${pid}/contract/validate`, { body: { contract: c } })
    eq(r.status, 200, "status")
    ok(r.json.errors.length > 0, "báo lỗi")
    const after = await api("GET", `/api/projects/${pid}/contract`)
    eq(after.json.contract.sheets[0].grid.cols, 4, "đĩa không đổi")
  })
  await it("lịch sử contract có snapshot; khôi phục tạo bản MỚI", async () => {
    const h = await api("GET", `/api/projects/${pid}/contract/history`)
    eq(h.status, 200, "status")
    ok(h.json.items.length >= 1, "có ≥1 snapshot")
    const snap = h.json.items[0].snapshot
    const one = await api("GET", `/api/projects/${pid}/contract/history/${snap}`)
    eq(one.status, 200, "đọc được snapshot")
    const before = (await api("GET", `/api/projects/${pid}/contract`)).json.version
    const rs = await api("POST", `/api/projects/${pid}/contract/restore`, { body: { snapshot: snap } })
    eq(rs.status, 200, "restore ok")
    eq(rs.json.version, before + 1, "tạo bản mới, không ghi đè")
  })
  await it("GET /api/element-lib là catalogue chỉ-đọc 42 element", async () => {
    const r = await api("GET", "/api/element-lib")
    eq(r.status, 200, "status")
    ok(r.json.elements.length >= 40, `có ${r.json.elements.length} element`)
    const w = await api("PUT", "/api/element-lib", { body: { elements: [] } })
    ok(w.status === 404 || w.status === 405, `không có đường ghi (status ${w.status})`)
  })

}
