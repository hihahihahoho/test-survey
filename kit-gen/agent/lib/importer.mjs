/* importer.mjs — nhập MỘT CHIỀU, không xoá gốc, luôn có BÁO CÁO ĐỐI CHIẾU (X12/§4.6).
   Ràng buộc cứng: KHÔNG BAO GIỜ tái sinh sheet từ element-lib.json (rebuildSheets của v1
   bị xoá khỏi sản phẩm). Element lạ được GIỮ NGUYÊN spec/skel; thiếu skel → gán rrect 0.8x0.6
   và ghi vào báo cáo. Id sheet trùng → thêm hậu tố -2 và ghi vào báo cáo. */
import { join } from "node:path"
import { exists, readJsonFile, readdir } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { validateContract } from "./validate.mjs"
import { loadElementLib, DEFAULT_POSES } from "./templates.mjs"
import { readZip } from "./zip.mjs"
import { RE_SHEET_ID, RE_VARIANT_ID } from "./paths.mjs"

/* "rrect" chứ KHÔNG phải "rect": skeleton.py:81 không có khoá "rect" (KeyError) và
   silhouettes.js không vẽ được nó. Đây là skel MẶC ĐỊNH của luồng nhập nên phải là
   shape mà cả 3 nơi (skeleton.py · silhouettes.js · shapes.js) đều dựng được. */
const DEFAULT_SKEL = { shape: "rrect", w: 0.8, h: 0.6 }

function slugId(s, fallback, re) {
  let v = String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "")
  if (!re.test(v)) v = fallback
  return v
}

/** styles.json v1 (styles[], sheets[].styles) → contract v2 (variants[]). */
export function stylesJsonToContract(src) {
  const warnings = []
  if (!src || typeof src !== "object") fail("IMPORT_INVALID", "file is not a JSON object")
  const sheetsIn = Array.isArray(src.sheets) ? src.sheets : null
  const stylesIn = Array.isArray(src.styles) ? src.styles : (Array.isArray(src.variants) ? src.variants : null)
  if (!sheetsIn || !stylesIn) fail("IMPORT_INVALID", "missing sheets[] or styles[]/variants[]")

  const seenSheet = new Set()
  const dupes = []
  const missingSkel = []
  const sheets = sheetsIn.map((sh, i) => {
    let id = slugId(sh.id, `sheet-${i + 1}`, RE_SHEET_ID)
    if (seenSheet.has(id)) {
      let n = 2
      while (seenSheet.has(`${id}-${n}`)) n++
      dupes.push({ from: sh.id, to: `${id}-${n}` })
      id = `${id}-${n}`
    }
    seenSheet.add(id)
    const comps = (sh.components ?? []).map((c, j) => {
      const out = { file: String(c?.file ?? `${String(j + 1).padStart(2, "0")}-imported`), vi: c?.vi ?? "", spec: c?.spec ?? "" }
      if (c?.skel && typeof c.skel === "object") out.skel = c.skel
      else { out.skel = { ...DEFAULT_SKEL }; missingSkel.push(`${id}/${out.file}`) }
      return out
    })
    const out = {
      id, grid: { cols: Number(sh?.grid?.cols ?? 1), rows: Number(sh?.grid?.rows ?? 1) },
      orient: sh.orient ?? "landscape", cell_hint: sh.cell_hint ?? "", note: sh.note ?? "",
      ref: sh.ref ?? null, variants: Array.isArray(sh.styles) ? sh.styles : (Array.isArray(sh.variants) ? sh.variants : []),
      components: comps,
    }
    return out
  })

  const seenVar = new Set()
  const variants = stylesIn.map((v, i) => {
    let id = slugId(v.id, `variant-${i + 1}`, RE_VARIANT_ID)
    while (seenVar.has(id)) id = `${id}-2`.slice(0, 24)
    seenVar.add(id)
    return {
      id, vi: v.vi ?? v.name ?? id, styleMode: v.styleMode ?? (v.inspo?.length ? "inspo" : "prompt"),
      style: v.style ?? "", inspo: v.inspo ?? [], bg: v.bg ?? "pure vivid magenta #FF00FF",
      brand: v.brand ?? { mode: "colors", primary: "#d42a1e", secondary: "#f5c64a", refs: [] },
      characters: v.characters ?? [],
      ...(v.threshold !== undefined ? { threshold: v.threshold } : {}),
      ...(v.grow_threshold !== undefined ? { grow_threshold: v.grow_threshold } : {}),
    }
  })

  // sheet.variants trỏ tới id đã đổi → map lại
  const idMap = new Map(stylesIn.map((v, i) => [v.id, variants[i].id]))
  for (const sh of sheets) sh.variants = (sh.variants ?? []).map(x => idMap.get(x) ?? x).filter(Boolean)

  const contract = {
    schemaVersion: 4,
    characterPoses: Array.isArray(src.characterPoses) && src.characterPoses.length ? src.characterPoses : [...DEFAULT_POSES],
    sheets, variants,
  }
  if (dupes.length) warnings.push({ code: "SHEET_ID_RENAMED", message: `${dupes.length} sheet id trùng đã được đổi tên`, items: dupes })
  if (missingSkel.length) warnings.push({ code: "SKEL_DEFAULTED", message: `${missingSkel.length} element thiếu skel, đã gán rrect 0.8x0.6`, items: missingSkel.slice(0, 50) })
  return { contract, warnings, duplicateSheetIds: dupes }
}

/** Báo cáo đối chiếu bước 2 của wizard — KHÔNG BỎ QUA ĐƯỢC. */
export async function buildImportReport(ws, contract, extra = {}) {
  const lib = await loadElementLib(ws)
  const known = new Set(lib.elements.map(e => e.file))
  const allComps = contract.sheets.flatMap(s => s.components ?? [])
  const unknown = allComps.filter(c => c.file && !known.has(c.file))
  const validation = validateContract(contract)
  const refs = new Set()
  for (const sh of contract.sheets) if (sh.ref) refs.add(sh.ref)
  for (const v of contract.variants) {
    for (const p of v.inspo ?? []) refs.add(p)
    for (const p of v.brand?.refs ?? []) refs.add(p)
    for (const c of v.characters ?? []) if (c.ref) refs.add(c.ref)
  }
  return {
    sheets: contract.sheets.length,
    components: allComps.length,
    variants: contract.variants.length,
    poses: contract.characterPoses?.length ?? 0,
    unknownComponents: unknown.length,
    duplicateSheetIds: (extra.duplicateSheetIds ?? []).map(d => d.from),
    missingRefs: [...refs],
    willCreate: {
      sheets: contract.sheets.length, components: allComps.length, variants: contract.variants.length,
      raw: extra.rawFiles ?? 0, kits: extra.kitFiles ?? 0,
    },
    warnings: [
      ...(extra.warnings ?? []),
      ...(unknown.length
        ? [{ code: "UNKNOWN_COMPONENTS", message: `${unknown.length}/${allComps.length} element không có trong thư viện chuẩn — GIỮ NGUYÊN như trong file`, items: unknown.slice(0, 80).map(c => c.file) }]
        : []),
      ...validation.errors.map(e => ({ code: e.code, message: e.message, items: [e.path] })),
      ...validation.warnings.map(e => ({ code: e.code, message: e.message, items: [e.path] })),
    ],
    validation,
  }
}

/** Đọc nguồn nhập → {contract, warnings, files:[{name,data}]} (files chỉ có với zip). */
export async function loadImportSource(ws, { source, uploadId, path: relFolder }, uploads) {
  if (source === "stylesJson") {
    const buf = uploads.read(uploadId)
    let json
    try { json = JSON.parse(buf.toString("utf8")) } catch { fail("IMPORT_INVALID", "file is not valid JSON") }
    const r = stylesJsonToContract(json)
    return { ...r, files: [] }
  }
  if (source === "zip") {
    const buf = uploads.read(uploadId)
    const entries = await readZip(buf)
    const root = commonRoot(entries.map(e => e.name))
    const strip = n => (root ? n.slice(root.length) : n)
    const find = suffix => entries.find(e => strip(e.name) === suffix)
    const contractEntry = find("contract.json")
    const projectEntry = find("project.json")
    if (contractEntry) {
      const contract = JSON.parse(contractEntry.data.toString("utf8"))
      const meta = projectEntry ? JSON.parse(projectEntry.data.toString("utf8")) : null
      return {
        contract, warnings: [], duplicateSheetIds: [], meta,
        files: entries.map(e => ({ name: strip(e.name), data: e.data })).filter(e => e.name && !e.name.startsWith(".")),
      }
    }
    const stylesEntry = find("styles.json") ?? entries.find(e => e.name.endsWith("styles.json"))
    if (!stylesEntry) fail("IMPORT_INVALID", "zip has neither contract.json nor styles.json")
    const r = stylesJsonToContract(JSON.parse(stylesEntry.data.toString("utf8")))
    return { ...r, files: entries.map(e => ({ name: strip(e.name), data: e.data })) }
  }
  if (source === "folder") {
    // Thư mục ĐÃ NẰM TRONG workspace mà chưa có trong index (§4.6 bước 1 lựa chọn 3).
    const name = String(relFolder ?? "").replace(/^\/+/, "")
    if (!name || name.includes("..") || name.includes("/")) fail("BAD_REQUEST", "folder must be a single directory name inside the workspace")
    const dir = join(ws.projectsDir, name)
    for (const f of ["contract.json", "styles.json"]) {
      const abs = join(dir, f)
      if (await exists(abs)) {
        const json = await readJsonFile(abs)
        if (f === "contract.json") return { contract: json, warnings: [], duplicateSheetIds: [], files: [] }
        const r = stylesJsonToContract(json)
        return { ...r, files: [] }
      }
    }
    fail("IMPORT_INVALID", `folder ${name} has no contract.json or styles.json`)
  }
  fail("BAD_REQUEST", `unknown import source ${source}`)
}

function commonRoot(names) {
  const tops = new Set(names.map(n => n.split("/")[0]))
  if (tops.size !== 1) return ""
  const top = [...tops][0]
  return names.every(n => n.startsWith(top + "/")) ? top + "/" : ""
}

export { readdir }
