/* raw-history.mjs — BA ĐỜI ẢNH GỐC của một tấm: `.history/raw/<job>@r-<ms>.png`.
 *
 * ╔══ VÌ SAO FILE NÀY RA ĐỜI (lỗi 07/09/2026) ════════════════════════════════╗
 * ║ Thanh phiên bản trên web KHÔNG BAO GIỜ nhảy sang v2. Lý do: KHÔNG AI ghi   ║
 * ║ vào `.history/raw/` cả. `gen.sh` bảo codex lưu thẳng đè lên `raw/<job>.png`║
 * ║ (dòng 834, "overwrite if it exists"), agent thì chỉ CHÉP RA snapshot bất   ║
 * ║ biến `runs/<id>/artifacts/<job>.png` SAU khi ảnh mới đã ghi — tức là bản   ║
 * ║ cũ đã bị mất từ trước đó. `#39` đọc một thư mục rỗng, trả đúng một mục     ║
 * ║ `current` ⇒ "v1" mãi mãi, và "cho phép xoá bản cũ" thì không có gì để xoá. ║
 * ║                                                                            ║
 * ║ `gen.sh` là file CẤM SỬA (engine đóng gói, người dùng cập nhật đè lên),    ║
 * ║ nên chỗ duy nhất còn lại để cất bản cũ là agent — NGAY TRƯỚC khi spawn     ║
 * ║ engine, lúc `raw/<job>.png` vẫn còn là ảnh của lượt trước.                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * MỘT NGUỒN SỰ THẬT cho hình dạng tên file: `#39` (liệt kê), `#39.1` (xoá) và
 * `run-handle` (cất) đều phải đồng ý từng ký tự — lệch một dấu là bản cất được
 * nhưng không bao giờ hiện ra, đúng bệnh mà file này sinh ra để chữa.
 */
import { join } from "node:path"
import { copyFile, ensureDir, exists, readdir, removeTree, stat } from "./fsx.mjs"
import { projectDir } from "./projects-dir.mjs"

/** Id của một bản lịch sử: `r-<mốc thời gian ms>`. `#39` chỉ liệt kê đúng dạng này. */
export const RE_RAW_HISTORY_ID = /^r-\d+$/

/** GIỮ BAO NHIÊU ĐỜI CŨ. 3 = đúng con số UI đã hứa ("giữ 3 đời ảnh cũ",
 *  `CleanProjectDialog`/`disk.ts`). Một tấm 1024² alpha ≈ 1,5 MB, nên 3 đời × N tấm
 *  là chi phí đĩa có thật — không giữ vô hạn, và không im lặng giữ nhiều hơn lời hứa. */
export const RAW_HISTORY_KEEP = 3

export function rawHistoryDir(ws, id) { return join(projectDir(ws, id), ".history", "raw") }

/** Tên file của một bản lịch sử. `job` đã qua `RE_JOB`, `hid` qua `RE_RAW_HISTORY_ID`. */
export function rawHistoryName(job, hid) { return `${job}@${hid}.png` }

/** Các bản lịch sử của một tấm, MỚI NHẤT TRƯỚC. Thư mục vắng ⇒ mảng rỗng, không ném. */
export async function listRawHistory(ws, id, job) {
  const dir = rawHistoryDir(ws, id)
  const re = new RegExp(`^${job}@(r-\\d+)\\.png$`)
  const items = []
  for (const name of await readdir(dir).catch(() => [])) {
    const m = re.exec(name)
    if (!m) continue
    const st = await stat(join(dir, name)).catch(() => null)
    if (!st) continue
    items.push({ id: m[1], at: new Date(st.mtimeMs).toISOString(), bytes: st.size, current: false })
  }
  items.sort((a, b) => String(b.at).localeCompare(String(a.at)))
  return items
}

/** Cất `raw/<job>.png` hiện hành vào lịch sử rồi tỉa về `RAW_HISTORY_KEEP` đời.
 *
 *  KHÔNG NÉM. Đây là việc phụ chạy ngay trước một lượt gen thật: đĩa đầy hay quyền
 *  ghi hỏng thì người dùng vẫn phải vẽ được tấm mới — mất lịch sử còn hơn mất lượt vẽ.
 *  CHÉP (không đổi tên) vì bản hiện hành phải ở nguyên chỗ: `gen.sh` phán thành/bại
 *  bằng cách so mtime của `raw/<job>.png` với mốc t0, và một lượt gen HỎNG phải để
 *  lại đúng ảnh cũ chứ không phải một khoảng trống.
 *  @returns {Promise<string|null>} id bản vừa cất, hoặc null nếu không có gì để cất.
 */
export async function archiveRaw(ws, id, job) {
  try {
    const src = join(projectDir(ws, id), "raw", `${job}.png`)
    if (!(await exists(src))) return null
    const st = await stat(src)
    if (!st.isFile() || st.size === 0) return null
    const dir = rawHistoryDir(ws, id)
    await ensureDir(dir)
    /* Mốc thời gian lấy theo MTIME CỦA CHÍNH ẢNH, không phải `Date.now()`. Hai lý do
       cùng chiều: `#39` sắp xếp theo `at` nên id phải kể đúng thứ tự đời ảnh, và cất
       hai lần cùng một tấm (gen lại rồi hỏng rồi gen lại) sinh CÙNG một tên ⇒ không
       nhân bản một bản y hệt thành hai "phiên bản" khác nhau trên thanh chọn. */
    const hid = `r-${Math.floor(st.mtimeMs)}`
    await copyFile(src, join(dir, rawHistoryName(job, hid)))
    await pruneRawHistory(ws, id, job)
    return hid
  } catch { return null }
}

/** Tỉa lịch sử của một tấm về `keep` đời mới nhất. Nuốt lỗi vì cùng lý do `archiveRaw`. */
export async function pruneRawHistory(ws, id, job, keep = RAW_HISTORY_KEEP) {
  try {
    const items = await listRawHistory(ws, id, job)
    const dir = rawHistoryDir(ws, id)
    for (const old of items.slice(keep)) {
      await removeTree(join(dir, rawHistoryName(job, old.id))).catch(() => {})
    }
  } catch { /* lịch sử là tiện ích, không phải dữ liệu gốc */ }
}
