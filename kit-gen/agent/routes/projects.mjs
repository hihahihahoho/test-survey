/* routes/projects.mjs — §6.2 B: #7..#18, #21. CRUD project + trash + duplicate + clean + export. */
import { join } from "node:path"
import {
  listProjects, readProject, computeState, applyActiveRun, createProjectDir, patchProject, trashProject,
  listTrash, restoreFromTrash, purgeFromTrash, cleanProject, slugify, newProjectId,
  idTaken, projectDir, copyTree,
  readWorkflowDraft, saveWorkflowDraft,
} from "../lib/projects.mjs"
import { buildTemplateContract } from "../lib/templates.mjs"
import { writeContract, readContract } from "../lib/contract.mjs"
import { fail } from "../lib/errors.mjs"
import { RE_SLUG, RE_VARIANT_ID, assertMatch } from "../lib/paths.mjs"
import { exists, walkFiles, dirStats, writeFileAtomic, sha256 } from "../lib/fsx.mjs"
import { forgetCover } from "../lib/cover.mjs"
import { makeZip } from "../lib/zip.mjs"
import { loadImportSource } from "../lib/importer.mjs"

const INCLUDE_DIRS = { contract: [], refs: ["refs"], raw: ["raw"], kits: ["kits"], runs: ["runs"] }

export function register(r) {
  // #7 GET /api/projects  (ETag / If-None-Match)
  r.get("/api/projects", async ctx => {
    const ws = ctx.registry.active
    const items = await listProjects(ws, {
      includeStats: ctx.url.searchParams.get("include") !== "none", runs: ctx.runs,
    })
    const q = (ctx.url.searchParams.get("q") ?? "").toLowerCase().trim()
    const tag = ctx.url.searchParams.get("tag")
    let out = items
    if (q) out = out.filter(p => `${p.name} ${p.id} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q))
    if (tag) out = out.filter(p => (p.tags ?? []).includes(tag))
    const body = {
      items: out, scannedAt: new Date().toISOString(),
      workspaceLabel: ws.label, workspaceFingerprint: ws.fingerprint,
    }
    // ETag phải đổi khi TIẾN ĐỘ RUN đổi, không thì client 304 và chip "Đang chạy" đứng số.
    const etag = `"${sha256(JSON.stringify(out.map(p => [
      p.id, p.updatedAt, p.stats?.diskBytes,
      p.state?.activeRun?.runId ?? null, p.state?.activeRun?.done ?? null,
    ]))).slice(7, 27)}"`
    if (ctx.req.headers["if-none-match"] === etag) return { status: 304, headers: { ETag: etag } }
    return { status: 200, json: body, headers: { ETag: etag } }
  })

  // #8 POST /api/projects
  r.post("/api/projects", async ctx => {
    const ws = ctx.registry.active
    if (!(await ws.writable())) fail("WORKSPACE_UNWRITABLE", `workspace ${ws.label} is not writable`)
    const body = await ctx.json()
    const name = String(body.name ?? "").trim()
    if (!name || name.length > 120) fail("INVALID_NAME", "name must be 1..120 chars")
    const template = String(body.template ?? "basic")
    if (!["blank", "basic", "import"].includes(template)) fail("BAD_REQUEST", `unknown template ${template}`)

    const slug = body.slug !== undefined && body.slug !== null && body.slug !== ""
      ? assertMatch(RE_SLUG, body.slug, "INVALID_SLUG", "slug")
      : slugify(name)
    let id
    if (body.slug) {
      // user tự sửa slug → dùng nguyên, trùng thì 409 kèm gợi ý (§4.1-3)
      if (await idTaken(ws, slug)) fail("PROJECT_ID_TAKEN", `id ${slug} already exists`, { details: { suggestion: newProjectId(slug) } })
      id = slug
    } else {
      id = newProjectId(slug)   // agent luôn thêm 4 hex → trùng thư mục KHÔNG THỂ xảy ra
    }

    const fv = body.firstVariant ?? {}
    const firstVariant = {
      id: fv.id ? assertMatch(RE_VARIANT_ID, fv.id, "BAD_REQUEST", "firstVariant.id") : (slugify(fv.vi ?? "phong-cach-1").slice(0, 24) || "v1"),
      vi: String(fv.vi ?? "Phong cách 1"),
      style: fv.style ?? "",
    }

    const warnings = []
    let contract
    let importFiles = []
    if (template === "import") {
      const src = await loadImportSource(ws, body.import ?? {}, ctx.uploads)
      contract = src.contract
      warnings.push(...(src.warnings ?? []))
      importFiles = src.files ?? []
    } else {
      const built = await buildTemplateContract(ws, template, firstVariant)
      contract = built.contract ?? built
      warnings.push(...(built.warnings ?? []))
    }

    const { dir, project } = await createProjectDir(ws, { id, name, slug, description: body.description, tags: body.tags })
    await writeContract(ws, id, contract, { ifMatch: 0 })

    if (template === "import" && importFiles.length) {
      for (const f of importFiles) {
        if (!/^(refs|raw|kits)\//.test(f.name)) continue      // chỉ nhận 3 nhóm dữ liệu, không nhận file lạ
        if (f.name.includes("..")) continue
        await writeFileAtomic(join(dir, f.name), f.data)
      }
    }
    const p = await readProject(ws, id)
    Object.assign(p, await computeState(ws, id, p))
    return { status: 201, json: { project: p, warnings } }
  })

  // #9 GET /api/projects/:id
  r.get("/api/projects/:id", async ctx => {
    const ws = ctx.registry.active
    const p = await readProject(ws, ctx.params.id)
    if (p.broken) fail("PROJECT_BROKEN", p.error.message, { details: { file: p.error.file, line: p.error.line } })
    Object.assign(p, await computeState(ws, ctx.params.id, p))
    applyActiveRun(p, ctx.runs.activeForProject(ctx.params.id))
    return { status: 200, json: { project: p } }
  })

  // #10 PATCH /api/projects/:id
  r.patch("/api/projects/:id", async ctx => {
    const ws = ctx.registry.active
    const body = await ctx.json()
    if (body.slug !== undefined && body.slug !== null) {
      const other = (await listProjects(ws, { includeStats: false })).find(p => p.slug === body.slug && p.id !== ctx.params.id)
      if (other) fail("PROJECT_ID_TAKEN", `slug ${body.slug} is used by another project`, { details: { suggestion: `${body.slug}-2` } })
    }
    const p = await patchProject(ws, ctx.params.id, body)
    Object.assign(p, await computeState(ws, ctx.params.id, p))
    return { status: 200, json: { project: p } }
  })

  r.get("/api/projects/:id/workflow-draft", async ctx => ({ status: 200, json: await readWorkflowDraft(ctx.registry.active, ctx.params.id) }))
  r.put("/api/projects/:id/workflow-draft", async ctx => ({ status: 200, json: await saveWorkflowDraft(ctx.registry.active, ctx.params.id, await ctx.json()) }))

  // #11 DELETE /api/projects/:id → .trash/ (soft). KHÔNG rm thẳng.
  r.delete("/api/projects/:id", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    const cancelledRuns = await ctx.runs.cancelAllForProject(id)
    /* Cùng lý do với C-01 ở run-handle.detach(): một job nền còn sống mà ghi lại vào
       projects/<id>/ VỪA chuyển sang thùng rác sẽ dựng lại thư mục ma và giết nút
       Hoàn tác. Job vẽ bìa cũng ghi xuống đúng thư mục đó ⇒ cũng phải bị quên đi. */
    forgetCover(ws, id)
    const meta = await trashProject(ws, id)
    return {
      status: 200,
      json: {
        ok: true, trashId: meta.trashId, restoreBefore: meta.restoreBefore,
        cancelledRuns, bytes: meta.bytes,
      },
    }
  })

  // #12 #13 #14 #15 trash
  r.get("/api/trash", async ctx => ({ status: 200, json: { items: await listTrash(ctx.registry.active) } }))

  r.post("/api/trash/:trashId/restore", async ctx => ({
    status: 200, json: { project: await restoreFromTrash(ctx.registry.active, ctx.params.trashId) },
  }))

  r.delete("/api/trash/:trashId", async ctx => {
    if (ctx.url.searchParams.get("purge") !== "1")
      fail("BAD_REQUEST", "permanent delete requires ?purge=1")
    const confirm = ctx.req.headers["x-kitgen-confirm"]
    const projectId = ctx.req.headers["x-kitgen-project"]
    if (String(confirm ?? "").trim().toLowerCase() !== "xac-nhan")
      fail("CONFIRM_REQUIRED", "permanent delete requires xac-nhan")
    const items = await listTrash(ctx.registry.active)
    const item = items.find(entry => entry.trashId === ctx.params.trashId)
    if (!item || String(projectId ?? "") !== String(item.projectId ?? ""))
      fail("CONFIRM_INVALID", "trash entry does not match requested project")
    await purgeFromTrash(ctx.registry.active, ctx.params.trashId)
    return { status: 204 }
  })

  // #16 duplicate
  r.post("/api/projects/:id/duplicate", async ctx => {
    const ws = ctx.registry.active
    const src = ctx.params.id
    const body = await ctx.json()
    const srcProject = await readProject(ws, src)
    if (srcProject.broken) fail("PROJECT_BROKEN", "cannot duplicate a broken project")
    const name = String(body.name ?? `${srcProject.name} (bản sao)`).trim()
    const slug = slugify(name)
    const id = newProjectId(slug)
    const include = Array.isArray(body.include) ? body.include : ["contract", "refs"]

    const { bytes: srcBytes } = await dirStats(projectDir(ws, src))
    const { dir } = await createProjectDir(ws, {
      id, name, slug, description: srcProject.description, tags: srcProject.tags,
    })
    let files = 0, bytes = 0
    for (const key of include) {
      if (!Object.hasOwn(INCLUDE_DIRS, key)) fail("BAD_REQUEST", `unknown include ${key}`)
      for (const sub of INCLUDE_DIRS[key]) {
        const s = await copyTree(join(projectDir(ws, src), sub), join(dir, sub))
        files += s.files; bytes += s.bytes
      }
    }
    // contract luôn copy, kèm lọc variant theo lựa chọn của user
    const { contract } = await readContract(ws, src)
    let next = structuredClone(contract)
    const vsel = body.variants ?? "all"
    if (Array.isArray(vsel)) {
      next.variants = next.variants.filter(v => vsel.includes(v.id))
      next.sheets = next.sheets.map(sh => ({ ...sh, variants: (sh.variants ?? []).filter(x => vsel.includes(x)) }))
    } else if (vsel === "none") {
      next.variants = []
      next.sheets = next.sheets.map(sh => ({ ...sh, variants: [] }))
    }
    if (body.newVariant?.vi) {
      const nv = {
        id: body.newVariant.id ? assertMatch(RE_VARIANT_ID, body.newVariant.id, "BAD_REQUEST", "newVariant.id")
          : (slugify(body.newVariant.vi).slice(0, 24) || "v1"),
        vi: String(body.newVariant.vi), styleMode: "prompt", style: "", inspo: [],
        brand: { mode: "colors", primary: "#d42a1e", secondary: "#f5c64a", refs: [] }, characters: [],
      }
      next.variants.push(nv)
    }
    await writeContract(ws, id, next, { ifMatch: 0 })
    const p = await readProject(ws, id)
    Object.assign(p, await computeState(ws, id, p))
    return { status: 201, json: { project: p, copied: { files, bytes }, sourceBytes: srcBytes } }
  })

  // #17 clean
  r.post("/api/projects/:id/clean", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished) fail("RUN_ACTIVE", `run ${active.id} is active`, { details: { runId: active.id } })
    const body = await ctx.json()
    const targets = Array.isArray(body.targets) ? body.targets : []
    if (!targets.length) fail("BAD_REQUEST", "targets must be a non-empty array")
    return { status: 200, json: await cleanProject(ws, id, targets) }
  })

  // #18 export.zip
  r.get("/api/projects/:id/export.zip", async ctx => {
    const ws = ctx.registry.active
    const id = ctx.params.id
    const active = ctx.runs.activeForProject(id)
    if (active && !active.finished) fail("RUN_ACTIVE", `run ${active.id} is active`, { details: { runId: active.id } })
    const p = await readProject(ws, id)
    const include = new Set((ctx.url.searchParams.get("include") ?? "contract,refs").split(",").map(s => s.trim()))
    const dir = projectDir(ws, id)
    // ?variant=tet[,vang] — lọc theo PHONG CÁCH (§3-S5 tab Xuất). Không khai = mọi phong cách.
    // Đối chiếu với contract: variant lạ → 422 chứ không im lặng trả zip rỗng.
    const rawVariant = (ctx.url.searchParams.get("variant") ?? "").trim()
    let variants = null
    if (rawVariant !== "") {
      const want = rawVariant.split(",").map(v => v.trim()).filter(Boolean)
      for (const v of want) assertMatch(RE_VARIANT_ID, v, "BAD_REQUEST", "variant")
      const known = new Set(((await readContract(ws, id)).contract.variants ?? []).map(v => v.id))
      const unknown = want.filter(v => !known.has(v))
      if (unknown.length) fail("UNKNOWN_VARIANT", `unknown variants: ${unknown.join(", ")}`,
        { details: { unknown, known: [...known] } })
      variants = new Set(want)
    }
    /** `kits/<variant>/…` và `raw/<variant>-<sheet>.png` là quy ước của engine (slice.py/gen.sh). */
    const keepRel = rel => {
      if (!variants) return true
      const seg = rel.split("/")
      if (seg[0] === "kits") {
        // kits/<variant>/*.png ; file ngay trong kits/ (manifest.json) luôn giữ
        if (seg.length === 2) return true
        return variants.has(seg[1])
      }
      if (seg[0] === "raw") {
        // raw/<variant>-<sheet>.png ; giữ file thuộc đúng phong cách đã chọn
        const base = seg[seg.length - 1]
        return [...variants].some(v => base.startsWith(v + "-"))
      }
      return true
    }
    const wanted = ["project.json", "contract.json"]
    const dirs = []
    if (include.has("refs")) dirs.push("refs")
    if (include.has("raw")) dirs.push("raw")
    if (include.has("kits")) dirs.push("kits")
    if (include.has("runs")) dirs.push("runs")
    const entries = []
    for (const f of wanted) if (await exists(join(dir, f))) entries.push({ name: `${id}/${f}`, abs: join(dir, f) })
    for (const d of dirs) {
      for (const abs of await walkFiles(join(dir, d))) {
        const rel = abs.slice(dir.length + 1).split("\\").join("/")
        if (!keepRel(rel)) continue
        entries.push({ name: `${id}/${rel}`, abs })
      }
    }
    const buf = await makeZip(entries)
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    const tag = variants ? `-${[...variants].join("-")}` : ""
    return {
      status: 200, buffer: buf,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="kitgen-${p.slug ?? id}${tag}-${day}.zip"`,
        "Content-Length": String(buf.length),
      },
    }
  })

  // #21 reveal — mở Finder/Explorer đúng thư mục
  r.post("/api/projects/:id/reveal", async ctx => {
    const ws = ctx.registry.active
    const dir = projectDir(ws, ctx.params.id)
    if (!(await exists(dir))) fail("PROJECT_NOT_FOUND", `project ${ctx.params.id} not found`)
    const ok = await ctx.reveal(dir)
    if (!ok) fail("NOT_SUPPORTED", "reveal is not supported on this platform")
    return { status: 204 }
  })
}
