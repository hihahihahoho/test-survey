/* validate.mjs — agent VALIDATE LẠI contract (client không đáng tin, architecture §1.2).
   Đúng 8 luật V-01..V-08 của UX-SPEC §3.4. errors chặn lưu, warnings không chặn. */
import { RE_SHEET_ID, RE_VARIANT_ID, RE_COMPONENT_FILE } from "./paths.mjs"

/* Đúng tập shape mà silhouettes.js vẽ được (dòng 87–125) + "rect" cho contract nhập từ ngoài. */
const SHAPES = new Set(["empty", "pose", "pill", "bar", "rrect", "rect", "circle", "burst", "puzzle", "figure", "full"])

/* Khổ canvas — ĐÚNG tập khoá của bảng `geometry.CANVAS`, bảng mà cả gen.sh lẫn
   slice.py cùng import. Thêm khổ mới thì sửa `geometry.py` và dòng này. */
const CANVAS_KINDS = new Set(["landscape", "portrait", "square"])
/* `orient` là field ĐỜI TRƯỚC và cố ý KHÔNG có "square": tấm vuông phải khai qua
   `canvas`. Giữ hẹp để không có hai đường cùng nói một điều. */
const ORIENT_KINDS = new Set(["landscape", "portrait"])

export function validateContract(contract) {
  const errors = []
  const warnings = []
  const E = (code, path, message, extra = {}) => errors.push({ code, path, message, ...extra })
  const W = (code, path, message, extra = {}) => warnings.push({ code, path, message, ...extra })

  if (!contract || typeof contract !== "object") {
    E("SCHEMA", "", "contract must be an object")
    return { errors, warnings }
  }
  if (contract.schemaVersion !== undefined && Number(contract.schemaVersion) !== 4)
    W("SCHEMA_VERSION", "schemaVersion", `expected 4, got ${contract.schemaVersion}`)
  if (!Array.isArray(contract.sheets)) { E("SCHEMA", "sheets", "sheets must be an array"); return { errors, warnings } }
  if (!Array.isArray(contract.variants)) { E("SCHEMA", "variants", "variants must be an array"); return { errors, warnings } }

  const variantIds = new Set()
  contract.variants.forEach((v, i) => {
    const path = `variants[${i}]`
    if (!RE_VARIANT_ID.test(String(v?.id ?? ""))) E("V-05", `${path}.id`, "variant id must match ^[a-z0-9-]{2,24}$")
    else if (variantIds.has(v.id)) E("V-05", `${path}.id`, `duplicate variant id ${v.id}`)
    else variantIds.add(v.id)
  })

  const sheetIds = new Set()
  contract.sheets.forEach((sh, i) => {
    const path = `sheets[${i}]`
    // V-03: sheet.id đúng dạng và DUY NHẤT trong project (đóng A6, K4)
    if (!RE_SHEET_ID.test(String(sh?.id ?? ""))) E("V-03", `${path}.id`, "sheet id must match ^[a-z0-9-]{2,32}$")
    else if (sheetIds.has(sh.id)) E("V-03", `${path}.id`, `duplicate sheet id ${sh.id}`)
    else sheetIds.add(sh.id)

    /* Hai field CHỮ của Prompt Studio. KHÔNG chặn sự tồn tại của chúng — chặn SAI KIỂU:
       gen.sh nối thẳng cả hai vào prompt, nên một object/số lọt xuống đó sẽ đi vào lệnh
       gửi cho model dưới dạng rác mà không ai báo gì. `null` = "không có", vẫn hợp lệ. */
    for (const k of ["directive", "promptOverride"]) {
      if (sh?.[k] !== undefined && sh[k] !== null && typeof sh[k] !== "string")
        E("SCHEMA", `${path}.${k}`, `${k} must be a string`)
    }

    /* KHỔ CANVAS CỦA TẤM. `canvas` là field chính; `orient` (đời cũ, chỉ có
       landscape/portrait) vẫn hợp lệ và vẫn được engine đọc làm đường lùi.
       CHẶN Ở ĐÂY vì chuỗi lạ KHÔNG nổ ở tầng dưới — `geometry.canvas_of` rơi về
       landscape khi không nhận ra chữ (cố ý: một lỗi gõ không đáng giết cả lượt gen),
       nên một lỗi gõ
       ("squre") đi xuyên cả đường ống rồi mới hiện ra thành một tấm sai khổ mà
       không ai giải thích được. Là ERROR chứ không phải warning: người dùng đã
       chọn khổ vuông thì nhận về khổ ngang là sai hợp đồng, không phải "gần đúng". */
    if (sh?.canvas !== undefined && sh.canvas !== null && !CANVAS_KINDS.has(String(sh.canvas)))
      E("SCHEMA", `${path}.canvas`, `canvas must be one of ${[...CANVAS_KINDS].join(", ")}`)
    if (sh?.orient !== undefined && sh.orient !== null && !ORIENT_KINDS.has(String(sh.orient)))
      E("SCHEMA", `${path}.orient`, `orient must be one of ${[...ORIENT_KINDS].join(", ")}`)

    const cols = Number(sh?.grid?.cols), rows = Number(sh?.grid?.rows)
    if (!Number.isInteger(cols) || cols < 1 || cols > 8) E("SCHEMA", `${path}.grid.cols`, "cols must be 1..8")
    if (!Number.isInteger(rows) || rows < 1 || rows > 8) E("SCHEMA", `${path}.grid.rows`, "rows must be 1..8")
    const comps = sh?.components
    if (!Array.isArray(comps)) { E("SCHEMA", `${path}.components`, "components must be an array"); return }

    // V-04: len(components) == cols*rows — chính là assert của gen.sh + slice.py, phải chặn TRƯỚC khi chạy
    if (Number.isInteger(cols) && Number.isInteger(rows) && comps.length !== cols * rows)
      E("V-04", `${path}.components`, `grid ${cols}x${rows} needs ${cols * rows} cells, got ${comps.length}`,
        { expected: cols * rows, actual: comps.length })

    // V-07: sheet không element → cảnh báo, không chặn
    if (comps.length === 0) W("V-07", `${path}.components`, `sheet ${sh.id ?? i} has no component and will be skipped`)

    if (Array.isArray(sh.variants)) {
      sh.variants.forEach((vid, k) => {
        if (!variantIds.has(vid)) W("UNKNOWN_VARIANT", `${path}.variants[${k}]`, `variant ${vid} does not exist`)
      })
    }

    const files = new Set()
    comps.forEach((c, j) => {
      const cp = `${path}.components[${j}]`
      const isEmpty = c?.skel?.shape === "empty"
      // V-01: tên file 2 số + slug
      if (!isEmpty && !RE_COMPONENT_FILE.test(String(c?.file ?? "")))
        E("V-01", `${cp}.file`, "file must match ^[0-9]{2}-[a-z0-9-]+$")
      // V-02: duy nhất trong sheet
      if (c?.file) {
        if (files.has(c.file)) E("V-02", `${cp}.file`, `duplicate component file ${c.file} in sheet`)
        else files.add(c.file)
      }
      if (c?.spec !== undefined && typeof c.spec !== "string") E("SCHEMA", `${cp}.spec`, "spec must be a string")
      // OUT_SIZE: `out` = cỡ ĐẦU RA (px thiết kế), KHÔNG phải cỡ vẽ — ô luôn được vẽ to
      // hết cỡ lề cho phép (geometry.max_fit_box) rồi code mới co về `out` lúc xuất.
      // Trần 4096 chứ không 1254 (khổ ảnh sinh): `out` là cỡ ở đích, một tấm nền
      // @2x hoàn toàn có thể lớn hơn tấm sheet mà nó được vẽ ra.
      if (c?.out !== undefined && c.out !== null) {
        if (typeof c.out !== "object") E("SCHEMA", `${cp}.out`, "out must be an object {w,h}")
        else for (const k of ["w", "h"]) {
          const n = Number(c.out[k])
          if (!Number.isInteger(n) || n < 8 || n > 4096)
            E("OUT_SIZE", `${cp}.out.${k}`, `out.${k} must be an integer in [8,4096]`)
        }
      }
      if (c?.drawScale !== undefined && c.drawScale !== null) {
        const k = Number(c.drawScale)
        if (!(k > 0 && k <= 64)) E("DRAW_SCALE", `${cp}.drawScale`, "drawScale must be a number in (0,64]")
      }
      const sk = c?.skel
      if (sk === undefined || sk === null) { W("SKEL_MISSING", `${cp}.skel`, "skel missing, engine will use rect 0.8x0.6"); return }
      if (typeof sk !== "object") { E("SCHEMA", `${cp}.skel`, "skel must be an object"); return }
      if (sk.shape !== undefined && !SHAPES.has(String(sk.shape)))
        W("SKEL_SHAPE", `${cp}.skel.shape`, `unknown shape ${sk.shape}`)
      /* `skel.matte` (glow/glass/vitmatte) đã bị bỏ khỏi contract 08/09/2026 — độ trong
         của một ô nay chỉ là chữ trong `spec`. KHÔNG kiểm, KHÔNG cảnh báo: contract đã
         lưu của người dùng còn mang khoá ấy và phải mở lại được bình thường;
         `engineSkel` (lib/engine.mjs) lược nó ra trước khi tới gen.sh. */
      // V-06: w,h ∈ (0,1]
      for (const k of ["w", "h"]) {
        if (sk[k] === undefined) continue
        const n = Number(sk[k])
        if (!(n > 0 && n <= 1)) E("V-06", `${cp}.skel.${k}`, `${k} must be in (0,1]`)
      }
    })
  })

  // V-08: ref bị xoá nhưng còn tham chiếu → kiểm ở tầng refs (cần đĩa), ở đây chỉ kiểm hình thức.
  // `poseRef` (tấm ảnh dáng ghép của sheet nhân vật) và `layoutRef` (bản phác bố cục
  // của tấm nền) là ảnh nằm trong `refs/` y như `ref`, chỉ khác vai trò trong prompt —
  // nên chúng chịu ĐÚNG luật đường dẫn ấy.
  // Bỏ sót nó là mở lại đúng lỗ mà REF_PATH sinh ra để bịt: một đường dẫn `../`
  // trong contract đọc được tệp ngoài project.
  for (const [i, sh] of contract.sheets.entries()) {
    for (const field of ["ref", "poseRef", "layoutRef"]) {
      if (sh?.[field] === undefined || sh[field] === null) continue
      const r = String(sh[field])
      if (r.includes("..") || r.startsWith("/")) E("REF_PATH", `sheets[${i}].${field}`, `${field} must be a relative path inside project`)
    }
  }
  return { errors, warnings }
}

/** V-08 phần cần đĩa: ref đang được dùng ở đâu. */
export function refUsage(contract, refName) {
  const used = []
  const hit = p => typeof p === "string" && (p === refName || p.endsWith("/" + refName))
  ;(contract?.sheets ?? []).forEach(sh => {
    if (hit(sh.ref)) used.push({ kind: "sheet", id: sh.id })
    // Tấm ảnh dáng cũng là một chỗ DÙNG ảnh. Thiếu dòng này thì lệnh xoá ref coi
    // tấm ấy là mồ côi và xoá được — sheet nhân vật mất ảnh dáng mà không ai cảnh báo.
    if (hit(sh.poseRef)) used.push({ kind: "sheetPose", id: sh.id })
    // Bản phác bố cục cũng vậy: xoá nó đi là tấm nền mất chỗ dựa bố cục, im lặng.
    if (hit(sh.layoutRef)) used.push({ kind: "sheetLayout", id: sh.id })
  })
  ;(contract?.variants ?? []).forEach(v => {
    for (const p of v.inspo ?? []) if (hit(p)) used.push({ kind: "variantInspo", id: v.id })
    for (const p of v.brand?.refs ?? []) if (hit(p)) used.push({ kind: "variantBrand", id: v.id })
    for (const c of v.characters ?? []) if (hit(c.ref)) used.push({ kind: "character", id: c.id })
  })
  return used
}
