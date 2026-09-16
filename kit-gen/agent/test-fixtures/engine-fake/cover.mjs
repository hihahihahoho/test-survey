/* COVER GIẢ CHO TEST — cùng giao diện với `agent/engine/cover.mjs` thật:
 *   · `runCover(projectDir, { env, print })`, nhận thư mục project và ghi
 *     `<project>/cover/cover.png`
 *   · đọc `prompts/cover.txt` do agent dựng (thiếu file ⇒ FAIL, y như bản thật)
 *   · in "OK  cover …" / "FAIL cover (…)" và trả 0 cho mọi ca thường (lỗi bìa KHÔNG
 *     BAO GIỜ là lỗi của lượt gen)
 * KHÁC: KHÔNG gọi codex ⇒ KHÔNG TỐN QUOTA.
 *
 * `agent/lib/cover.mjs` nạp file này bằng `import()` chứ không spawn — nên sự TỒN TẠI
 * của nó chính là hợp đồng "engine này biết vẽ bìa". `engine-slow` cố ý không có.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export async function runCover(projectDir, opts = {}) {
  const print = opts.print ?? (s => process.stdout.write(s + "\n"))
  const P = rel => join(projectDir, rel)
  if (!projectDir || !existsSync(projectDir)) {
    print("FAIL cover (thiếu thư mục project)")
    return 2
  }
  for (const d of ["cover", "logs"]) mkdirSync(P(d), { recursive: true })
  if (!existsSync(P("prompts/cover.txt"))) {
    print("FAIL cover (thiếu prompts/cover.txt)")
    return 0
  }
  writeFileSync(P("logs/cover.log"), "fake cover log\n")
  const prompt = readFileSync(P("prompts/cover.txt"), "utf8")

  if (prompt.includes("COVER_FIXTURE_MANIFEST")) {
    writeFileSync(P("cover/manifest-at-start"), existsSync(P("kits/manifest.json")) ? "yes" : "no")
  }
  /* Một vài ca cần chứng minh mỗi lượt chỉ kích cover một lần. Chỉ đếm khi prompt
     mang marker test, không làm thay đổi các ca fake bình thường. */
  if (prompt.includes("COVER_FIXTURE_COUNT")) {
    let n = 0
    try { n = Number(readFileSync(P("cover/fixture-count"), "utf8")) || 0 } catch { n = 0 }
    writeFileSync(P("cover/fixture-count"), String(n + 1))
  }
  // Ca lỗi có kiểm được: prompt chứa dấu hiệu này thì KHÔNG ghi ảnh.
  if (prompt.includes("COVER_FIXTURE_FAIL")) {
    print("FAIL cover (rc=1, ảnh không được ghi mới — xem logs/cover.log)")
    return 0
  }
  writeFileSync(P("cover/cover.raw.png"), "PNGFAKECOVER")
  writeFileSync(P("cover/cover.png"), "PNGFAKECOVER")
  print("OK  cover  12B")
  return 0
}
