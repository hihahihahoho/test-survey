#!/usr/bin/env node
/* Engine giả CHẠY LÂU: xong 1 job rồi treo, để test [Dừng lượt chạy] (#36).
 *
 * CỐ Ý KHÔNG CÓ `cover.mjs` cạnh đây: đó là hình dạng của một engine ĐỜI CŨ chưa
 * biết vẽ bìa, và là thứ ca «409 COVER_UNAVAILABLE» của `suite-cover` đang đo.
 * Đừng "cho đủ bộ" — thêm file vào đây là xoá mất một ca test.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { mkdirs, runFixture, say, sleep } from "../fake-engine.mjs"

async function gen(projectDir) {
  mkdirs(projectDir, ["raw", "prompts", "logs"])
  say("prompt → prompts/tet-main.txt (+0 ảnh kèm)")
  writeFileSync(join(projectDir, "prompts/tet-main.txt"), "fake\n")
  writeFileSync(join(projectDir, "raw/tet-main.png"), "PNGFAKE")
  say("OK  tet-main  8.0K")
  /* TREO 30s. Tiến trình bị giết giữa chừng là cả điểm của fixture này, nên đừng
     `unref()` đồng hồ: nó phải giữ tiến trình sống cho tới khi có người bấm Dừng. */
  await sleep(30_000)
  say("không bao giờ tới đây")
  return 0
}

process.exit(await runFixture({
  gen,
  // no-op: run này bị dừng trước khi tới pha cắt.
  slice: () => { say("slice giả: không làm gì"); return 0 },
}))
