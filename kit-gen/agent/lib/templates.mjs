/* templates.mjs — 4 template của UX-SPEC §4.1. `basic` được định nghĩa bằng
   DANH SÁCH FILE CỤ THỂ (agent/templates/basic.json) để mọi lần tạo ra kết quả GIỐNG NHAU
   — không phải "16 element đầu tiên". Element được COPY vào contract của project (X8:
   element-lib.json là catalogue chỉ-đọc, không bao giờ bị UI ghi vào). */
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { exists, readJsonFile } from "./fsx.mjs"
import { fail } from "./errors.mjs"
import { EMPTY_CONTRACT } from "./contract.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const AGENT_DIR = resolve(HERE, "..")
const REPO_DIR = resolve(AGENT_DIR, "..")

/** element-lib.json: ưu tiên bản engine trong workspace, rồi bản repo (dev). */
export async function loadElementLib(ws) {
  for (const p of [join(ws.engineDir, "element-lib.json"), join(REPO_DIR, "element-lib.json")]) {
    if (await exists(p)) {
      const lib = await readJsonFile(p)
      return { version: 1, elements: lib.elements ?? [] }
    }
  }
  return { version: 1, elements: [] }
}

export const DEFAULT_POSES = [
  "idle", "wave", "point-right", "point-left", "jump", "celebrate", "sad", "surprised",
  "thinking", "run", "sit", "sleep", "clap", "hold-gift", "hold-envelope", "thumbs-up",
  "bow", "dance", "shrug",
]

export async function loadBasicSpec() {
  const p = join(AGENT_DIR, "templates", "basic.json")
  if (!(await exists(p))) fail("INTERNAL", "templates/basic.json is missing")
  return readJsonFile(p)
}

function elementToComponent(el) {
  return {
    file: el.file,
    vi: el.vi ?? el.file,
    spec: el.spec ?? "",
    skel: structuredClone(el.skel ?? { shape: "rrect", w: 0.8, h: 0.6 }),  // "rect" không thuộc tập shape engine hiểu — engine.mjs dịch sang "rrect"
    fromLib: el.file,
  }
}

const EMPTY_CELL = { file: "", vi: "Ô trống", spec: "", skel: { shape: "empty", w: 1, h: 1 } }

/** Dựng contract cho template. `firstVariant` do user đặt tên ở modal Tạo project. */
export async function buildTemplateContract(ws, template, firstVariant) {
  const variant = {
    id: firstVariant.id, vi: firstVariant.vi, styleMode: "prompt",
    style: firstVariant.style ?? "",
    inspo: [],
    brand: { mode: "colors", primary: "#d42a1e", secondary: "#f5c64a", refs: [] },
    characters: [],
  }
  const contract = { ...structuredClone(EMPTY_CONTRACT), characterPoses: [...DEFAULT_POSES], variants: [variant] }

  if (template === "blank") return contract

  if (template === "basic") {
    const spec = await loadBasicSpec()
    const lib = await loadElementLib(ws)
    const byFile = new Map(lib.elements.map(e => [e.file, e]))
    const missing = []
    for (const sheetSpec of spec.sheets) {
      const comps = []
      for (const f of sheetSpec.components) {
        const el = byFile.get(f)
        if (!el) { missing.push(f); continue }
        comps.push(elementToComponent(el))
      }
      const need = sheetSpec.grid.cols * sheetSpec.grid.rows
      while (comps.length < need) comps.push(structuredClone(EMPTY_CELL))
      contract.sheets.push({
        id: sheetSpec.id, grid: { ...sheetSpec.grid }, orient: sheetSpec.orient,
        cell_hint: sheetSpec.cell_hint ?? "", note: sheetSpec.note ?? "", ref: null,
        variants: [], components: comps.slice(0, need),
      })
    }
    return { contract, warnings: missing.length ? [{ code: "LIB_ELEMENT_MISSING", message: `${missing.length} element không có trong thư viện`, count: missing.length, items: missing }] : [] }
  }
  fail("BAD_REQUEST", `unknown template ${template}`)
}
