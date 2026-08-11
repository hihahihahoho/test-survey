/* Persistent project documents (workflow views and canvas boards). */
import { join } from "node:path"
import { fail } from "./errors.mjs"
import { ensureDir, exists, readJsonFile, readdir, removeTree, writeJsonAtomic } from "./fsx.mjs"
import { projectDir, readProject } from "./projects.mjs"
import { assertMatch, RE_DOC_ID } from "./paths.mjs"

const COLORS = new Set(["none", "mint", "ice", "amber", "rose", "violet"])
const KINDS = new Set(["workflow", "canvas"])
const KEEP_MS = 30 * 86400000
const EMPTY_CANVAS = () => ({ nodes: [], viewport: { x: 0, y: 0, k: 1 } })

const docsDir = (ws, id) => join(projectDir(ws, id), "docs")
const docFile = (ws, id, docId) => join(docsDir(ws, id), `${assertMatch(RE_DOC_ID, docId, "BAD_REQUEST", "doc id")}.json`)
const iso = () => new Date().toISOString()

function cleanName(v) {
  const s = String(v ?? "").trim()
  if (!s || s.length > 48 || /[\r\n\t]/.test(s)) fail("INVALID_NAME", "doc name must be 1..48 chars without line breaks")
  return s
}
function validateView(v = {}) {
  const ids = x => Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 500) : []
  return { sheetIds: ids(v.sheetIds), variantIds: ids(v.variantIds) }
}
function validateCanvas(v) {
  if (!v || !Array.isArray(v.nodes) || !v.viewport) fail("DOC_BROKEN", "canvas must contain nodes[] and viewport")
  if (v.nodes.length > 5000) fail("TOO_LARGE", "canvas has too many nodes", { details: { limitNodes: 5000 } })
  const nodes = v.nodes.map((n, i) => {
    if (!n || typeof n !== "object" || !String(n.id ?? "")) fail("DOC_BROKEN", `invalid canvas node ${i}`)
    if (!["frame", "note", "arrow", "image-ref"].includes(n.type)) fail("DOC_BROKEN", `invalid node type at ${i}`)
    const num = (x, d = 0) => Number.isFinite(Number(x)) ? Number(x) : d
    return { id: String(n.id), type: n.type, x: num(n.x), y: num(n.y), w: Math.max(0, num(n.w)), h: Math.max(0, num(n.h)), z: Math.trunc(num(n.z)), text: String(n.text ?? "").slice(0, 2000), bind: n.bind ?? null }
  })
  const k = Math.min(4, Math.max(.1, Number(v.viewport.k) || 1))
  return { nodes, viewport: { x: Number(v.viewport.x) || 0, y: Number(v.viewport.y) || 0, k } }
}
function publicDoc(r) { return r.doc }
async function readOne(ws, id, docId) {
  await readProject(ws, id)
  const p = docFile(ws, id, docId)
  if (!(await exists(p))) fail("DOC_NOT_FOUND", `doc ${docId} not found`)
  try { return await readJsonFile(p) } catch { fail("DOC_BROKEN", `doc ${docId} is invalid`) }
}
async function all(ws, id) {
  await readProject(ws, id)
  const dir = docsDir(ws, id); await ensureDir(dir)
  const out = []
  for (const f of await readdir(dir).catch(() => [])) {
    if (!/^f-[a-z0-9-]{2,32}\.json$/.test(f)) continue
    try { out.push(await readJsonFile(join(dir, f))) } catch { /* broken docs do not hide healthy docs */ }
  }
  return out.sort((a,b) => String(a.doc?.createdAt).localeCompare(String(b.doc?.createdAt)))
}
async function nameFree(ws, id, name, self = null) {
  const hit = (await all(ws,id)).find(r => !r.doc?.trashedAt && r.doc?.id !== self && String(r.doc?.name).toLowerCase() === name.toLowerCase())
  if (hit) fail("DOC_NAME_TAKEN", "doc name already exists", { details: { suggestion: `${name} (2)` } })
}
function slug(name) { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi,"d").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24) || "doc" }
async function newId(ws,id,name) {
  const used = new Set((await all(ws,id)).map(r=>r.doc?.id)); const base=`f-${slug(name)}`.slice(0,34)
  if (!used.has(base)) return base
  for(let i=2;i<1000;i++){ const x=`${base.slice(0,30)}-${i}`; if(!used.has(x)) return x }
  fail("INTERNAL","cannot allocate doc id")
}
async function write(ws,id,r){ await writeJsonAtomic(docFile(ws,id,r.doc.id),r) }

export async function listDocs(ws,id,{includeTrashed=false}={}) { return (await all(ws,id)).map(publicDoc).filter(d=>includeTrashed || !d.trashedAt) }
export async function createDoc(ws,id,input={}) {
  const name=cleanName(input.name); const kind=String(input.kind); if(!KINDS.has(kind)) fail("BAD_REQUEST","kind must be workflow|canvas")
  await nameFree(ws,id,name); const docId=await newId(ws,id,name); const t=iso(); let canvas=kind==="canvas"?EMPTY_CANVAS():null; let view=input.view?validateView(input.view):undefined
  if(input.fromDocId){ const src=await readOne(ws,id,input.fromDocId); canvas=src.canvas?structuredClone(src.canvas):canvas; view=src.doc?.view?structuredClone(src.doc.view):view }
  const doc={id:docId,name,kind,createdAt:t,updatedAt:t,color:"none",...(view?{view}:{}),trashedAt:null}; await write(ws,id,{doc,version:0,canvas}); return doc
}
export async function patchDoc(ws,id,docId,patch={}) {
  const r=await readOne(ws,id,docId); const p={}
  if(patch.name!==undefined){ p.name=cleanName(patch.name); await nameFree(ws,id,p.name,docId) }
  if(patch.color!==undefined){ if(!COLORS.has(patch.color)) fail("BAD_REQUEST","invalid doc color"); p.color=patch.color }
  if(patch.view!==undefined) p.view=validateView(patch.view)
  r.doc={...r.doc,...p,updatedAt:iso()}; await write(ws,id,r); return r.doc
}
export async function trashDoc(ws,id,docId){ const r=await readOne(ws,id,docId); const trashedAt=iso(); r.doc={...r.doc,trashedAt,updatedAt:trashedAt}; await write(ws,id,r); return {trashedAt} }
export async function restoreDoc(ws,id,docId){ const r=await readOne(ws,id,docId); await nameFree(ws,id,r.doc.name,docId); r.doc={...r.doc,trashedAt:null,updatedAt:iso()}; await write(ws,id,r); return r.doc }
export async function purgeDocs(ws,id,now=Date.now()){ let n=0; for(const r of await all(ws,id)){ if(r.doc?.trashedAt && now-Date.parse(r.doc.trashedAt)>KEEP_MS){ await removeTree(docFile(ws,id,r.doc.id)); n++ } } return n }
export async function loadCanvas(ws,id,docId){ const r=await readOne(ws,id,docId); return {version:Number(r.version)||0,canvas:validateCanvas(r.canvas??EMPTY_CANVAS())} }
export async function saveCanvas(ws,id,docId,canvas,ifMatch){
  if(ifMatch===undefined) fail("IF_MATCH_REQUIRED","If-Match header is required")
  const r=await readOne(ws,id,docId), expected=Number(String(ifMatch).replace(/\"/g,"")), current=Number(r.version)||0
  if(!Number.isInteger(expected)||expected!==current) fail("DOC_CONFLICT","canvas version conflict",{details:{serverVersion:current}})
  const clean=validateCanvas(canvas), bytes=Buffer.byteLength(JSON.stringify(clean)); if(bytes>10<<20) fail("TOO_LARGE","canvas exceeds limit",{details:{limitBytes:10<<20}})
  r.version=current+1; r.canvas=clean; r.doc={...r.doc,updatedAt:iso()}; await write(ws,id,r); return {version:r.version,bytes}
}
