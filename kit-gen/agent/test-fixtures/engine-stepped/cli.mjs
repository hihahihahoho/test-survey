#!/usr/bin/env node
/* ENGINE GIẢ "CHẬM ĐỀU" — dành riêng cho các ca DỪNG GIỮA CHỪNG rồi CHẠY TIẾP.
 *
 * Khác `engine-fake` (xong tức thì, có 1 job đỏ cố ý) và `engine-slow` (xong 1 job rồi
 * treo 30s): ở đây MỌI job đều xanh và cách nhau một nhịp đủ dài để test kịp bấm Dừng ở
 * GIỮA lượt — đúng tình huống của chủ sản phẩm ("đang gen dở"). Không job đỏ vì các ca
 * này đo "cái đã xong có được giữ sạch không", đỏ chỉ làm nhiễu.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { fakeSlice, hhmmss, jobsOf, mkdirs, readStyles, runFixture, say, sleep }
  from "../fake-engine.mjs"

async function gen(projectDir) {
  mkdirs(projectDir, ["raw", "prompts", "logs", "kits"])
  const step = Number(process.env.KITGEN_FAKE_STEP ?? "0.8") * 1000
  for (const { job } of jobsOf(readStyles(projectDir))) {
    say(`prompt → prompts/${job}.txt (+1 ảnh kèm)`)
    writeFileSync(join(projectDir, `prompts/${job}.txt`), `fake prompt for ${job}\n`)
    writeFileSync(join(projectDir, `logs/${job}.log`), `fake log for ${job}\n`)
    await sleep(step)
    writeFileSync(join(projectDir, `raw/${job}.png`), "PNGFAKE")
    say(`OK  ${job}  8.0K`)
  }
  say(`Xong ${hhmmss()}`)
  return 0
}

process.exit(await runFixture({
  gen,
  slice: (projectDir, argv) => { fakeSlice(projectDir, argv); return 0 },
}))
