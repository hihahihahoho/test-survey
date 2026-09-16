#!/usr/bin/env node
/* ENGINE GIẢ #2 — MỘT TẤM CÓ NỀN ĐỤC, VÀ NÓ VẪN LÀ MỘT TẤM XONG.
 *
 * ╔══ VÌ SAO CÓ FIXTURE RIÊNG THAY VÌ THÊM MỘT NHÁNH VÀO engine-fake ═══════════╗
 * ║ `engine-fake` đã cố ý cho `bg-home` chết theo kiểu KHÁC (`rc=127`, tức       ║
 * ║ NO_ARTIFACT), và cả một loạt ca đang khoá đúng con số của nó ("1/3 job không ║
 * ║ ghi được ảnh"). Nhồi thêm một hình dạng thứ hai vào đó là đổi đáp án của      ║
 * ║ những ca ấy vì một lý do không liên quan gì tới chúng.                        ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * Tấm `bg-home` ở đây tái hiện ĐÚNG hình dạng mà engine thật để lại từ 09/09/2026,
 * sau khi chủ sản phẩm chốt "cứ để cho nó gen tự nhiên nhé, ko block":
 *   · ảnh nằm ở `raw/<job>.png` như mọi tấm khác — KHÔNG bị loại, không `.rejected`;
 *   · dòng kết là `OK <job> <cỡ>  [nền đục: <lý do>]` — phép đo nền chỉ còn là ghi
 *     chú, không thử lại, không đánh trượt job;
 *   · lượt cắt đọc nội dung ảnh và ghi `mode: "rgb"` vào manifest, đúng như bản thật —
 *     đó là thứ duy nhất còn nói cho người dùng biết tấm này đục.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { fakeSlice, hhmmss, jobsOf, mkdirs, readStyles, runFixture, say, sleep }
  from "../fake-engine.mjs"

async function gen(projectDir) {
  mkdirs(projectDir, ["raw", "prompts", "logs", "kits"])
  for (const { job } of jobsOf(readStyles(projectDir))) {
    say(`prompt → prompts/${job}.txt (+0 ảnh kèm)`)
    writeFileSync(join(projectDir, `prompts/${job}.txt`), "Canvas orientation: LANDSCAPE 1536x1024.\n")
    /* ENGINE ĐỜI CŨ: có `.att` nhưng KHÔNG có bản kê vai `.refs`. Đó là hình dạng
       đĩa của một máy webapp đã cập nhật mà engine thì chưa — cửa xem trước phải bày
       đúng những tấm ảnh này với vai để TRỐNG, chứ không đổ và không bịa vai. */
    writeFileSync(join(projectDir, `prompts/${job}.att`), "refs/mascot.png\n")
    writeFileSync(join(projectDir, `logs/${job}.log`), `fake log for ${job}\n`)
    if (process.env.KITGEN_PROMPTS_ONLY) continue

    if (job.endsWith("bg-home")) {
      writeFileSync(join(projectDir, `raw/${job}.png`), "PNGFAKE-DUC")
      writeFileSync(join(projectDir, `logs/${job}.log`),
        `fake log for ${job}\nnền đục: KHÔNG có kênh alpha (mode=RGB). — chỉ ghi nhận, không chặn\n`)
      say(`OK  ${job}  8.0K  [nền đục: KHÔNG có kênh alpha (mode=RGB). image_gen phải trả PNG RGBA — ` +
        "đường tách nền đã bỏ nên không có gì cứu được ảnh này.]")
      await sleep(100)
      continue
    }
    writeFileSync(join(projectDir, `raw/${job}.png`), "PNGFAKE")
    say(`OK  ${job}  8.0K`)
    await sleep(100)
  }
  if (process.env.KITGEN_PROMPTS_ONLY) {
    say("KITGEN_PROMPTS_ONLY: đã dựng xong prompt trong prompts/ — KHÔNG gọi codex, KHÔNG đụng raw/.")
    return 0
  }
  say(`Xong ${hhmmss()}`)
  return 0
}

process.exit(await runFixture({
  gen,
  /* NỀN ĐỤC ĐI THEO TỚI TẬN MANIFEST. Bản thật đọc kênh alpha của tấm; ở đây nội dung
     ảnh giả đã nói sẵn ("PNGFAKE-DUC"). */
  slice: (projectDir, argv) => {
    fakeSlice(projectDir, argv, { modeOf: raw => (raw.includes("DUC") ? "rgb" : "alpha") })
    return 0
  },
}))
