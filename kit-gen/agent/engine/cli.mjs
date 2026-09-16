#!/usr/bin/env node
/* cli.mjs — CỬA VÀO CỦA ENGINE JS.
 *
 *   node agent/engine/cli.mjs prompts <projectDir> [filter…]
 *
 * Tương đương `KITGEN_PROMPTS_ONLY=1 bash gen.sh` chạy với cwd = <projectDir>:
 * cùng file ghi ra (`prompts/<job>.txt` · `.att` · `.refs` · `.fullbleed`), cùng
 * dòng stdout, cùng mã thoát. Không mạng, không quota, không đụng `raw/`.
 *
 * ⚠️ MỌI ĐƯỜNG DẪN NEO THEO <projectDir>, KHÔNG THEO cwd. `gen.sh` dòng 5 `cd
 * "$(dirname "$0")"` rồi lấy ROOT=$(pwd), và agent COPY cả engine vào project để
 * HERE = project (xem `agent/lib/engine.mjs`). Bản JS không copy gì cả — engine
 * nằm trong gói agent — nên thư mục project phải được truyền vào tường minh.
 *
 * ── LỌC JOB: KHÁC BẢN CŨ MỘT CHÚT, VÀ ĐÂY LÀ CHỖ NÓI RA ──────────────────────
 * `gen.sh` đọc `FILTERS=("$@")` Ở SAU chỗ thoát của KITGEN_PROMPTS_ONLY, nên ở chế
 * độ xem trước nó DỰNG PROMPT CHO MỌI JOB bất kể argv. Bản JS nhận filter thật, với
 * đúng phép so của `match()` (SUBSTRING: "tet-main" khớp luôn "tet-main2"). Không
 * truyền filter thì hai bản giống nhau từng byte — đó là ca golden đối chứng.
 * (Agent cũng KHÔNG dùng filter cho pha gen: nó thu hẹp bằng chính styles.json, xem
 * `buildCommand()` trong lib/engine.mjs.)
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { buildPrompt, listJobs } from "./prompt.mjs"

/** Phép so của `match()` trong gen.sh: rỗng = nhận tất, còn lại là SUBSTRING. */
export function match(job, filters) {
  if (!filters.length) return true
  return filters.some(f => job.includes(f))
}

/** Dựng prompt cho một project trên đĩa. Trả về `{ ok, lines }` — không tự thoát. */
export async function renderPrompts(projectDir, filters = [], print = s => process.stdout.write(s + "\n")) {
  // `mkdir -p raw logs prompts` của gen.sh dòng ~119. `raw`/`logs` không có gì để
  // ghi ở chế độ này, nhưng thư mục phải có mặt: bước ③ và agent đều trông vào đó.
  for (const d of ["raw", "logs", "prompts"]) await mkdir(join(projectDir, d), { recursive: true })
  const cfg = JSON.parse(await readFile(join(projectDir, "styles.json"), "utf8"))
  for (const { job, style, sheet } of listJobs(cfg)) {
    if (!match(job, filters)) continue
    const p = buildPrompt(style, sheet)     // ném = `assert` của bản cũ
    const base = join(projectDir, "prompts", job)
    // newline="\n" + utf-8 BẮT BUỘC (gen.sh ~1218): trên Windows chế độ text ghi
    // \r\n, `read -r` của bash giữ nguyên \r ⇒ tên file trong .att thành "x.png\r"
    // ⇒ mọi ảnh đính kèm rơi hết, LẶNG LẼ. Node ghi thẳng byte nên không có bẫy đó,
    // nhưng không ai được "sửa" lại thành writeFile có EOL của hệ.
    await writeFile(`${base}.txt`, p.text, "utf8")
    await writeFile(`${base}.att`, p.attText, "utf8")
    await writeFile(`${base}.refs`, p.refsText, "utf8")
    // XOÁ dấu cũ khi tấm KHÔNG còn full-bleed: prompts/ sống qua nhiều lượt, một
    // dấu mồ côi sẽ tắt phép kiểm alpha của đúng tấm cần nó nhất.
    if (p.fullBleedMarker) await writeFile(`${base}.fullbleed`, "1\n", "utf8")
    else await rm(`${base}.fullbleed`, { force: true })
    print(`prompt → prompts/${job}.txt (+${p.att.length} ảnh kèm)`)
  }
}

const HELP = `cách dùng: node agent/engine/cli.mjs prompts <projectDir> [filter…]`

export async function main(argv) {
  const [cmd, projectDir, ...filters] = argv
  if (cmd !== "prompts" || !projectDir) { process.stderr.write(HELP + "\n"); return 2 }
  let rc = 0
  try {
    await renderPrompts(projectDir, filters)
  } catch (e) {
    // Khối python của gen.sh chết thì bash VẪN in dòng dưới rồi `exit "$py_rc"`.
    // Giữ nguyên thứ tự ấy: caller (agent) đọc stdout, và một lượt hỏng phải nhận
    // ra được bằng MÃ THOÁT chứ không bằng sự vắng mặt của một dòng chữ.
    process.stderr.write(String(e?.stack ?? e) + "\n")
    rc = 1
  }
  process.stdout.write(
    "KITGEN_PROMPTS_ONLY: đã dựng xong prompt trong prompts/ — KHÔNG gọi codex, KHÔNG đụng raw/.\n")
  return rc
}

// Chạy trực tiếp (không phải import) thì mới thoát tiến trình.
// `pathToFileURL` chứ không ghép chuỗi "file://": đường dẫn Windows (C:\…) và
// đường có dấu cách đều hỏng ở phép ghép, và hỏng LẶNG LẼ — file không tự chạy
// nữa mà không báo gì.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)))
}
