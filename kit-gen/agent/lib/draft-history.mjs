/* draft-history.mjs — LỊCH SỬ CỦA `workflow-draft.json`: `.history/draft/<mốc>.json`.
 *
 * ╔══ VÌ SAO FILE NÀY RA ĐỜI (sự cố 23/09/2026, dự án test-vcb-d6fd) ═════════╗
 * ║ 09:05:52 `workflow-draft.json` bị ghi đè bằng một composer gần như rỗng: ║
 * ║ một thẻ Bộ UI trống + một thẻ Nhân vật mẫu, hai id cách nhau 2 giây — tức ║
 * ║ là hai cú bấm «Thêm thẻ» trên một màn TRẮNG. Màn trắng vì lượt GET bản   ║
 * ║ nháp hỏng (mạng chập / 429 / agent bận) mà web vẫn cho sửa, và cú sửa đầu ║
 * ║ PUT đè trạng thái rỗng lên đĩa. Mọi thẻ của người dùng mất sạch.          ║
 * ║                                                                          ║
 * ║ Và KHÔNG có gì để cứu: `.history/` chỉ giữ `contract` và `raw`. Bản nháp  ║
 * ║ — thứ duy nhất chứa chữ người dùng gõ — là file DUY NHẤT của dự án bị ghi ║
 * ║ đè mà không để lại dấu. Web đã được vá để không ghi mù nữa, nhưng web và  ║
 * ║ agent cài lệch phiên bản nhau là chuyện thường; agent phải tự giữ đường   ║
 * ║ lui cho chính nó, bất kể ai gọi PUT.                                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * TÊN FILE: cùng kiểu mốc với `.history/contract/` (`2026-09-23T090552Z`) nhưng THÊM
 * mili-giây (`2026-09-23T090552.123Z`). Contract ghi theo cú bấm Lưu, còn bản nháp tự
 * lưu sau 600ms im phím — hai lượt trong cùng một giây là chuyện thường, và mốc tính
 * theo giây sẽ để bản sau ghi đè lên bản trước ngay trong thư mục lịch sử.
 *
 * NHỊP CẤT (`DRAFT_HISTORY_GAP_MS`): 20 bản mà cất ở MỌI lượt tự lưu thì 20 lượt dừng
 * tay là hết — chưa tới một phút gõ. Đúng kịch bản sự cố: bản tốt được cất ở cú bấm
 * đầu, người dùng làm tiếp vài phút không biết gì, và bản tốt bị tỉa mất trước khi họ
 * kịp nhận ra. Nên chỉ cất khi file hiện hành đã NẰM YÊN trên đĩa ≥ 60s (bản của phiên
 * trước — đúng thứ sự cố làm mất) HOẶC bản cất gần nhất đã cũ ≥ 60s (mốc đều đặn giữa
 * một phiên gõ dài). Hai lượt tự lưu liền nhau giữa lúc gõ thì không cất: cái mất tối
 * đa là ≤ 60s chữ, đổi lại 20 bản phủ được ≥ 20 phút làm việc liên tục.
 */
import { join } from "node:path"
import { copyFile, ensureDir, readFile, readdir, removeTree, stat } from "./fsx.mjs"
import { utimes } from "node:fs/promises"
import { projectDir } from "./projects-dir.mjs"
import { assertMatch } from "./paths.mjs"
import { fail } from "./errors.mjs"

/** Tên một bản lịch sử (KHÔNG kèm `.json`). Route đọc một bản chỉ nhận đúng dạng này —
 *  không dấu chấm đôi, không gạch chéo: đây là cửa chặn path traversal duy nhất. */
export const RE_DRAFT_SNAPSHOT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}\.[0-9]{3}Z$/

export const DRAFT_HISTORY_KEEP = 20
export const DRAFT_HISTORY_GAP_MS = 60_000

export function draftHistoryDir(ws, id) { return join(projectDir(ws, id), ".history", "draft") }

/** `2026-09-23T09:05:52.123Z` → `2026-09-23T090552.123Z` — kiểu mốc của `.history/contract`. */
export function draftSnapshotName(ms) {
  return new Date(ms).toISOString().replace(/:/g, "")
}

async function snapshotNames(dir) {
  return (await readdir(dir).catch(() => []))
    .filter(f => f.endsWith(".json") && RE_DRAFT_SNAPSHOT.test(f.slice(0, -5)))
    .map(f => f.slice(0, -5))
    .sort()
}

/**
 * Cất bản `workflow-draft.json` HIỆN HÀNH trước khi nó bị ghi đè, rồi tỉa còn 20 bản.
 * NÉM khi chép hỏng — caller quyết (xem `saveWorkflowDraft`: vẫn lưu, nhưng la lên).
 * @returns {Promise<string|null>} tên bản vừa cất, hoặc null khi không cần cất.
 */
export async function archiveDraft(ws, id, currentFile, { now = Date.now() } = {}) {
  let cur
  try { cur = await stat(currentFile) } catch { return null }   // chưa có bản nháp ⇒ không có gì để mất
  const dir = draftHistoryDir(ws, id)
  const names = await snapshotNames(dir)
  const newest = names.at(-1) ?? null
  if (newest) {
    const newestMs = Date.parse(newest.replace(/T(\d{2})(\d{2})(\d{2})/, "T$1:$2:$3"))
    const resting = now - cur.mtimeMs >= DRAFT_HISTORY_GAP_MS
    const stale = !Number.isFinite(newestMs) || now - newestMs >= DRAFT_HISTORY_GAP_MS
    if (!resting && !stale) return null
    /* Y hệt bản cất gần nhất ⇒ không cất thêm: một bản trùng chiếm chỗ của một bản
       khác thật trong 20 suất. So từng BYTE, không so mtime — mtime nói dối khi file
       được chép/khôi phục. */
    const [a, b] = await Promise.all([readFile(currentFile), readFile(join(dir, `${newest}.json`)).catch(() => null)])
    if (b && a.equals(b)) return null
  }
  await ensureDir(dir)
  let ms = now
  let name = draftSnapshotName(ms)
  while (names.includes(name)) name = draftSnapshotName(++ms)
  const dst = join(dir, `${name}.json`)
  await copyFile(currentFile, dst)
  /* mtime của bản cất = LÚC NỘI DUNG ẤY ĐƯỢC LƯU, không phải lúc bị đè. Danh sách
     trả `updatedAt` từ đây — người đi cứu cần biết "bản của 8 giờ sáng", còn tên
     file đã nói lúc nó bị thay. */
  await utimes(dst, cur.atime, cur.mtime).catch(() => {})
  names.push(name)
  names.sort()
  while (names.length > DRAFT_HISTORY_KEEP) await removeTree(join(dir, `${names.shift()}.json`))
  return name
}

/** Danh sách bản cất, MỚI NHẤT TRƯỚC. Thư mục vắng ⇒ mảng rỗng. */
export async function listDraftHistory(ws, id) {
  const dir = draftHistoryDir(ws, id)
  const items = []
  for (const name of (await snapshotNames(dir)).reverse()) {
    const st = await stat(join(dir, `${name}.json`)).catch(() => null)
    if (!st) continue
    items.push({ name, size: st.size, updatedAt: new Date(st.mtimeMs).toISOString() })
  }
  return items
}

/** Một bản cất. `name` qua regex TRƯỚC khi chạm tới đường dẫn. */
export async function readDraftSnapshot(ws, id, name) {
  assertMatch(RE_DRAFT_SNAPSHOT, name, "BAD_REQUEST", "snapshot name")
  const file = join(draftHistoryDir(ws, id), `${name}.json`)
  let st, raw
  try { st = await stat(file); raw = await readFile(file, "utf8") }
  catch { fail("NOT_FOUND", `draft snapshot ${name} not found`) }
  let draft
  try { draft = JSON.parse(raw) }
  catch { fail("DOC_BROKEN", `draft snapshot ${name} is not valid JSON`) }
  return { name, size: st.size, updatedAt: new Date(st.mtimeMs).toISOString(), draft }
}
