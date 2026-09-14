/* fingerprints.mjs — VÂN TAY ĐI THEO ẢNH: "tấm đang nằm trong `raw/` được vẽ từ mô tả nào".
 *
 * ╔══ VÌ SAO FILE NÀY RA ĐỜI (chủ sản phẩm, 14/09/2026) ══════════════════════╗
 * ║ *«mỗi kiểu nếu tràn 2 sheet thì tách ra … như thế khi gen ảnh lại đỡ phải  ║
 * ║ gen lại cả 2 cái»*. Một thẻ chia hai tấm; sửa một dòng ở tấm 2 rồi bấm Vẽ  ║
 * ║ thì bản trước vẽ lại CẢ HAI — tấm 1 tốn một lượt tạo để nhận về một bức     ║
 * ║ ảnh KHÁC (máy vẽ không tất định) cho một mô tả KHÔNG ĐỔI.                  ║
 * ║ Web đóng dấu `sheet.fingerprint` vào contract (`prompt-canvas/lib/         ║
 * ║ fingerprint.ts`); agent ghi lại con dấu của ĐÚNG bức ảnh nó nhận được, và  ║
 * ║ lượt sau tấm nào con dấu còn trùng thì BỎ QUA.                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO MỘT FILE SỔ RIÊNG, KHÔNG NHÉT VÀO `run.json` ════════════════════
 * `run.json` là sổ của MỘT LƯỢT CHẠY; câu hỏi ở đây là về TẤM ẢNH ĐANG DÙNG, mà
 * tấm ấy sống lâu hơn mọi lượt chạy: nó bị thay khi đổi phiên bản (`#40`), bị xoá
 * khi bỏ bản đang dùng (`#39.1`), và bản cũ thì tụt xuống `.history/raw/`. Đọc
 * ngược run.json để đoán ra "ảnh đang nằm đó là của lượt nào" là một phép suy luận
 * sai ngay lần đổi phiên bản đầu tiên.
 * Nên sổ này đi ĐÚNG theo vòng đời của ảnh, và mang cùng hình dạng với `.history/raw/`:
 * một vân tay cho bản đang dùng, một vân tay cho từng đời cũ. Khôi phục bản cũ là
 * vân tay của bản ấy trở lại làm vân tay hiện hành — nếu không thì một bản vừa khôi
 * phục sẽ bị coi là "đúng bản mới nhất" và lượt Vẽ sau bỏ qua nó, im lặng.
 *
 * KHÔNG NÉM. Sổ ghi chú không được phép làm hỏng một lượt vẽ: hỏng sổ ⇒ "không biết"
 * ⇒ VẼ. Chiều sai duy nhất chấp nhận được là vẽ thừa, không bao giờ là bỏ qua nhầm.
 */
import { join } from "node:path"
import { exists, readJsonFile, writeJsonAtomic } from "./fsx.mjs"
import { projectDir } from "./projects-dir.mjs"
import { RAW_HISTORY_KEEP } from "./raw-history.mjs"

/** Cùng thư mục với `.history/raw/<job>@<hid>.png` — sổ nằm cạnh thứ nó ghi sổ. */
export function fingerprintsPath(ws, id) {
  return join(projectDir(ws, id), ".history", "raw", "fingerprints.json")
}

/** Sổ trên đĩa → object. File vắng/hỏng ⇒ sổ rỗng ("không biết gì"). */
export async function readFingerprints(ws, id) {
  const book = await readJsonFile(fingerprintsPath(ws, id)).catch(() => null)
  return book && typeof book === "object" && book.jobs && typeof book.jobs === "object"
    ? book
    : { version: 1, jobs: {} }
}

/** Đọc → sửa → ghi. Nuốt lỗi ghi (xem đầu file). Trả về sổ sau khi sửa. */
async function edit(ws, id, mutate) {
  const book = await readFingerprints(ws, id)
  mutate(book)
  await writeJsonAtomic(fingerprintsPath(ws, id), book).catch(() => {})
  return book
}

function entryOf(book, job) {
  const cur = book.jobs[job]
  if (cur && typeof cur === "object") {
    if (!cur.history || typeof cur.history !== "object") cur.history = {}
    return cur
  }
  book.jobs[job] = { current: "", history: {} }
  return book.jobs[job]
}

/** Vân tay của BẢN ĐANG DÙNG (`raw/<job>.png`). Không biết ⇒ chuỗi rỗng. */
export async function currentFingerprint(ws, id, job) {
  const book = await readFingerprints(ws, id)
  const entry = book.jobs[job]
  return typeof entry?.current === "string" ? entry.current : ""
}

/** Ghi vân tay cho bản vừa vẽ xong. Rỗng ⇒ xoá sổ của tấm ấy (thà "không biết"). */
export async function recordFingerprint(ws, id, job, fingerprint) {
  await edit(ws, id, book => {
    const entry = entryOf(book, job)
    entry.current = typeof fingerprint === "string" ? fingerprint : ""
  })
}

/**
 * BẢN ĐANG DÙNG VỪA BỊ CẤT VÀO LỊCH SỬ dưới id `hid` ⇒ vân tay của nó đi theo.
 *
 * Gọi NGAY SAU `archiveRaw` và với ĐÚNG `hid` mà hàm ấy trả về: hai chỗ lệch nhau
 * là một bản lịch sử có ảnh mà không có vân tay — khôi phục nó xong thì agent coi
 * như "không biết", và vẽ lại một lượt thừa.
 * Tỉa cùng con số với `.history/raw/` (`RAW_HISTORY_KEEP`): sổ không được nhớ những
 * đời ảnh mà chính thư mục lịch sử đã quên.
 */
export async function archiveFingerprint(ws, id, job, hid) {
  if (!hid) return
  await edit(ws, id, book => {
    const entry = entryOf(book, job)
    if (entry.current) entry.history[hid] = entry.current
    entry.current = ""
    const ids = Object.keys(entry.history).sort((a, b) => b.localeCompare(a))
    for (const old of ids.slice(RAW_HISTORY_KEEP)) delete entry.history[old]
  })
}

/**
 * MỘT BẢN CŨ LÊN LÀM BẢN ĐANG DÙNG (`#40 restore`, hoặc bản kế lên thay chỗ sau khi
 * xoá bản đang dùng ở `#39.1`).
 *
 * `hid` không có trong sổ ⇒ vân tay hiện hành thành RỖNG, không giữ lại cái cũ: ảnh
 * đã đổi rồi, mà giữ con dấu của bức ảnh vừa bị đẩy đi là lời khai sai duy nhất có
 * thể làm lượt Vẽ sau bỏ qua một tấm cần vẽ.
 */
export async function promoteFingerprint(ws, id, job, hid) {
  await edit(ws, id, book => {
    const entry = entryOf(book, job)
    const want = hid ? entry.history[hid] : ""
    entry.current = typeof want === "string" ? want : ""
    if (hid) delete entry.history[hid]
  })
}

/** Xoá một bản lịch sử khỏi sổ (`#39.1` xoá một đời cũ). */
export async function forgetFingerprint(ws, id, job, hid) {
  await edit(ws, id, book => { delete entryOf(book, job).history[hid] })
}

/** `sheet.fingerprint` của tấm mang id `sheetId`; không có ⇒ rỗng. */
export function sheetFingerprintOf(contract, sheetId) {
  const sheet = (contract?.sheets ?? []).find(sh => sh?.id === sheetId)
  const fp = sheet?.fingerprint
  return typeof fp === "string" ? fp : ""
}

/**
 * TẤM NÀO PHẢI VẼ, TẤM NÀO GIỮ NGUYÊN.
 *
 * BA điều kiện cùng lúc mới được bỏ qua, và cả ba đều cần thiết:
 *  ① contract CÓ khai vân tay cho tấm ấy (dự án đời cũ thì không, ⇒ vẽ);
 *  ② sổ CÓ vân tay của bản đang dùng và nó TRÙNG (đổi một chữ là khác ngay);
 *  ③ `raw/<job>.png` CÒN TRÊN ĐĨA — sổ nói có mà ảnh không còn (xoá tay, chép dự án
 *    sang máy khác thiếu file) thì bỏ qua là để lại một tấm trống vĩnh viễn.
 * Job lạ (không có trong contract) đi qua NGUYÊN VẸN: việc từ chối nó là của
 * `RunStore.start` (`UNKNOWN_JOB`), không phải của một phép tối ưu.
 */
export async function planSkips(ws, id, contract, jobs) {
  const bySheet = new Map((contract?.sheets ?? []).map(sh => [sh?.id, sh]))
  const known = new Map()
  for (const v of contract?.variants ?? []) {
    for (const sh of contract?.sheets ?? []) {
      const only = sh.variants
      if (Array.isArray(only) && only.length && !only.includes(v.id)) continue
      known.set(`${v.id}-${sh.id}`, sh.id)
    }
  }
  const book = await readFingerprints(ws, id)
  const pdir = projectDir(ws, id)
  const run = []
  const skipped = []
  for (const job of jobs) {
    const sheetId = known.get(job)
    if (!sheetId || !bySheet.has(sheetId)) { run.push(job); continue }
    const want = sheetFingerprintOf(contract, sheetId)
    const have = typeof book.jobs[job]?.current === "string" ? book.jobs[job].current : ""
    if (!want || !have || want !== have) { run.push(job); continue }
    if (!(await exists(join(pdir, "raw", `${job}.png`)))) { run.push(job); continue }
    skipped.push({ job, sheet: sheetId, reason: "UNCHANGED" })
  }
  return { run, skipped }
}
