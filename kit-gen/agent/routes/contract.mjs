/* routes/contract.mjs — §6.2 C: #22..#28. Contract có version + If-Match (409 khi lệch)
   + lịch sử 50 bản + validate dry-run + element-lib chỉ-đọc. */
import { readContract, writeContract, listHistory, readHistorySnapshot } from "../lib/contract.mjs"
import { validateContract } from "../lib/validate.mjs"
import { loadElementLib } from "../lib/templates.mjs"
import { fail } from "../lib/errors.mjs"
import { RE_SNAPSHOT, assertMatch } from "../lib/paths.mjs"
import { readProject } from "../lib/projects.mjs"

export function register(r) {
  // #22 GET contract → ETag = version
  r.get("/api/projects/:id/contract", async ctx => {
    const ws = ctx.registry.active
    await readProject(ws, ctx.params.id)              // 404/410 sớm nếu project không còn
    const { version, contract } = await readContract(ws, ctx.params.id)
    return { status: 200, json: { version, contract }, headers: { ETag: `"${version}"` } }
  })

  // #23 PUT contract — If-Match BẮT BUỘC (thiếu = 412, lệch = 409)
  r.put("/api/projects/:id/contract", async ctx => {
    const ws = ctx.registry.active
    const body = await ctx.json()
    if (!body || typeof body.contract !== "object" || body.contract === null)
      fail("BAD_REQUEST", "body must be {contract:{…}}")
    const res = await writeContract(ws, ctx.params.id, body.contract, { ifMatch: ctx.req.headers["if-match"] })
    return {
      status: 200,
      json: { version: res.version, hash: res.hash, snapshot: res.snapshot, validation: res.validation },
      headers: { ETag: `"${res.version}"` },
    }
  })

  // #24 history
  r.get("/api/projects/:id/contract/history", async ctx => {
    const limit = Math.min(50, Math.max(1, Number(ctx.url.searchParams.get("limit") ?? 50) || 50))
    return { status: 200, json: { items: await listHistory(ctx.registry.active, ctx.params.id, limit) } }
  })

  // #25 một snapshot
  r.get("/api/projects/:id/contract/history/:snapshot", async ctx => {
    assertMatch(RE_SNAPSHOT, ctx.params.snapshot, "BAD_REQUEST", "snapshot")
    return { status: 200, json: await readHistorySnapshot(ctx.registry.active, ctx.params.id, ctx.params.snapshot) }
  })

  // #26 restore — tạo bản MỚI, không ghi đè lịch sử
  r.post("/api/projects/:id/contract/restore", async ctx => {
    const ws = ctx.registry.active
    const body = await ctx.json()
    const snapshot = assertMatch(RE_SNAPSHOT, body.snapshot, "BAD_REQUEST", "snapshot")
    const snap = await readHistorySnapshot(ws, ctx.params.id, snapshot)
    const { version } = await readContract(ws, ctx.params.id)
    const res = await writeContract(ws, ctx.params.id, snap.contract, { ifMatch: version })
    return { status: 200, json: { version: res.version } }
  })

  // #27 validate dry-run (không ghi)
  r.post("/api/projects/:id/contract/validate", async ctx => {
    const body = await ctx.json()
    if (!body || typeof body.contract !== "object" || body.contract === null)
      fail("BAD_REQUEST", "body must be {contract:{…}}")
    return { status: 200, json: validateContract(body.contract) }
  })

  // #28 element-lib — CATALOGUE CHỈ ĐỌC (X8: không có UI nào ghi vào đây)
  r.get("/api/element-lib", async ctx => {
    const lib = await loadElementLib(ctx.registry.active)
    return { status: 200, json: lib, headers: { "Cache-Control": "no-cache" } }
  })
}
