/* prompts-io.mjs — DỰNG PROMPT RỒI GHI RA ĐĨA.
 *
 * Tách ra khỏi `cli.mjs` ở bước ③ vì `gen.mjs` cũng cần đúng bước này (lượt gen thật
 * mở đầu bằng chính khối dựng prompt ấy), mà `cli.mjs` thì lại cần `gen.mjs` để có
 * lệnh `gen`. Để nguyên hai hàm này trong `cli.mjs` là dựng một vòng import — ESM
 * chạy được vòng ấy, nhưng nó hỏng theo THỨ TỰ NẠP chứ không hỏng theo cú pháp, tức
 * hỏng vào một ngày nào đó chứ không phải hôm nay.
 *
 * `cli.mjs` xuất lại cả hai để mọi chỗ import cũ không đổi một chữ.
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
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
