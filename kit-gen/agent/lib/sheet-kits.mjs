/* sheet-kits.mjs — MỘT TẤM ĐỔI ẢNH GỐC THÌ Ô ĐÃ CẮT PHẢI ĐỔI THEO.
 *
 * ╔══ VÌ SAO FILE NÀY RA ĐỜI (chủ sản phẩm, 09/09/2026) ══════════════════════╗
 * ║ "ko cần nút khôi phục phiên bản này, user select là được mà, nó chỉ swap   ║
 * ║ hiển thị + copy figma thôi."                                              ║
 * ║ Câu ấy nói ra một đòi hỏi mà bản cũ KHÔNG đạt: `#40` chỉ chép đè           ║
 * ║ `raw/<tấm>.png` rồi thôi, còn `kits/` — thứ tab «Đã crop» và nút copy sang ║
 * ║ Figma đọc — vẫn là ô của bản CŨ cho tới lượt cắt sau. Đổi phiên bản mà hai ║
 * ║ bề mặt nói hai chuyện khác nhau thì "swap hiển thị" là một lời nói dối.    ║
 * ║ Nên đổi phiên bản nay CẮT LẠI ngay trong cùng request, và xoá bản đang     ║
 * ║ dùng thì DỌN luôn ô đã cắt của tấm đó.                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Lượt cắt là `sliceSheetOnce` của `run-handle.mjs` — CÙNG một đường mà lượt chạy
 * dùng, không phải bản sao. Ở đây chỉ có phần dọn đường quanh nó: tra `job` ra
 * (variant, sheet), copy engine vào project, thu hẹp `styles.json` đúng một tấm.
 */
import { join } from "node:path"
import { exists, readJsonFile, removeTree, writeJsonAtomic, ensureDir } from "./fsx.mjs"
import { projectDir } from "./projects-dir.mjs"
import { readContract, contractJobs } from "./contract.mjs"
import { resolveEngine, prepareEngine, materializeStyles } from "./engine.mjs"
import { sliceSheetOnce } from "./run-handle.mjs"

/** `job` → `{ variant, sheet }` theo contract. Không có trong contract ⇒ `null`. */
export async function sheetOfJob(ws, id, job) {
  const { contract } = await readContract(ws, id).catch(() => ({ contract: null }))
  if (!contract) return null
  return contractJobs(contract).find(j => j.job === job) ?? null
}

/**
 * CẮT LẠI ĐÚNG MỘT TẤM rồi đăng vào `kits/` + `kits/manifest.json`.
 *
 * KHÔNG NÉM. Đây là bước ĐI KÈM một thao tác đã thành công (ảnh gốc đã đổi xong trên
 * đĩa); ném ở đây là trả lỗi cho một việc đã làm được một nửa, và người dùng thì mất
 * luôn cả nửa đã xong. Caller đọc `ok` để nói cho đúng.
 * `styles.json` bị thu hẹp về đúng tấm này — y như một lượt chạy hẹp, và `slice.py`
 * giữ nguyên phần sheet không chạy lượt này trong manifest (khối "GEN LẠI MỘT NHÓM").
 */
export async function resliceSheet(ws, id, job) {
  const parts = await sheetOfJob(ws, id, job)
  if (!parts) return { ok: false, reason: "UNKNOWN_JOB" }
  const engineDir = await resolveEngine(ws)
  if (!engineDir) return { ok: false, reason: "NO_ENGINE" }
  const pdir = projectDir(ws, id)
  try {
    await prepareEngine(engineDir, pdir)
    const { contract } = await readContract(ws, id)
    await materializeStyles(pdir, contract, [parts])
    await ensureDir(join(pdir, "kits"))
  } catch (e) { return { ok: false, reason: "ENGINE_PREPARE_FAILED", detail: String(e?.message ?? e) } }
  const res = await sliceSheetOnce(pdir, { variant: parts.variant, sheet: parts.sheet })
  return { ok: res?.ok === true, code: res?.code ?? null, durationMs: res?.durationMs ?? null }
}

/** Tên file asset trong manifest là do `slice.py` ghi, nhưng nó đi vào một lệnh XOÁ —
 *  nên vẫn phải kiểm như dữ liệu lạ: đúng một đoạn tên, đuôi .png, không lối thoát. */
function safeAssetFile(name) {
  const s = String(name ?? "")
  if (!s.endsWith(".png") || s.length > 200) return null
  if (s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0")) return null
  return s
}

/**
 * DỌN Ô ĐÃ CẮT CỦA MỘT TẤM khỏi `kits/` và khỏi manifest.
 *
 * Dùng khi ảnh gốc của tấm KHÔNG CÒN (xoá bản đang dùng mà lịch sử cũng rỗng) hoặc khi
 * cắt lại hỏng: để lại ô cũ nằm đó là để tab «Đã crop» và nút copy Figma phát cho người
 * dùng ô của một tấm không còn tồn tại — im lặng và không có cách nào nhận ra.
 *
 * Manifest ghi bằng `writeJsonAtomic` (tmp + đổi tên) y như `dump_manifest` của
 * `slice.py`; caller chỉ gọi khi KHÔNG có lượt chạy nào (route chặn `RUN_ACTIVE`) nên
 * không có lượt `slice.py` nào đang giữ ổ khoá manifest.
 * KHÔNG NÉM, và trả về số file đã xoá.
 */
export async function dropSheetFromKits(ws, id, job) {
  const parts = await sheetOfJob(ws, id, job)
  if (!parts) return { removed: 0 }
  const pdir = projectDir(ws, id)
  const mpath = join(pdir, "kits", "manifest.json")
  const manifest = await readJsonFile(mpath).catch(() => null)
  const entry = manifest?.styles?.[parts.variant]
  if (!entry) return { removed: 0 }
  const vdir = join(pdir, "kits", parts.variant)
  let removed = 0
  for (const a of entry.assets ?? []) {
    if (a?.sheet !== parts.sheet) continue
    const file = safeAssetFile(a.file)
    if (!file) continue
    /* Cả hai bản của cùng một ô: bản canvas và bản ôm sát `tight/` (slice.py ghi cả hai). */
    for (const abs of [join(vdir, file), join(vdir, "tight", file)]) {
      if (!(await exists(abs))) continue
      await removeTree(abs).catch(() => {})
      removed++
    }
  }
  entry.assets = (entry.assets ?? []).filter(a => a?.sheet !== parts.sheet)
  if (entry.sheets) delete entry.sheets[parts.sheet]
  /* `empty_cells` của `slice.py` thật là DANH SÁCH TÊN FILE (không kèm sheet), nên chỉ
     lọc được những mục có khai `sheet`. Mục còn lại là tên ô trống — không có file trên
     đĩa, không hiện ra ở đâu, để lại vô hại; lượt cắt sau ghi đè cả danh sách. */
  entry.empty_cells = (entry.empty_cells ?? []).filter(e => !(e && typeof e === "object" && e.sheet === parts.sheet))
  try { await writeJsonAtomic(mpath, manifest) } catch { /* manifest là bản kê, không phải ảnh */ }
  return { removed }
}
