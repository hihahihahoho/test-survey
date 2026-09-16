#!/usr/bin/env node
/* ENGINE GIẢ CHO TEST — cùng giao diện với `agent/engine/cli.mjs` thật:
 *   · `cli.mjs gen <projectDir>` / `cli.mjs slice <projectDir> [style…] [--sheet=…]`
 *   · đọc `<projectDir>/styles.json`, job = style × sheet (tôn trọng `sheet.styles`)
 *   · in "prompt → prompts/<job>.txt", "OK  <job>", "FAIL <job> (...)"; ghi raw/<job>.png
 * KHÁC: KHÔNG gọi codex ⇒ KHÔNG TỐN QUOTA. Chỉ để test đường đi của AGENT.
 *
 * Ảnh bìa nằm ở `cover.mjs` cạnh đây — `agent/lib/cover.mjs` nạp THẲNG module ấy,
 * không đi qua cli (xem chú thích ở đó). Engine nào không có file đó thì route trả
 * 409 COVER_UNAVAILABLE, và `engine-slow` cố ý là một engine như vậy.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { fakeSlice, hhmmss, jobsOf, mkdirs, readStyles, runFixture, say, sleep }
  from "../fake-engine.mjs"

async function gen(projectDir) {
  mkdirs(projectDir, ["raw", "prompts", "logs", "kits"])
  const P = rel => join(projectDir, rel)
  for (const { job } of jobsOf(readStyles(projectDir))) {
    say(`prompt → prompts/${job}.txt (+1 ảnh kèm)`)
    /* Prompt giả CỐ Ý mang một đường dẫn tuyệt đối + một dòng khổ giấy như bản thật:
       cửa /prompt-preview phải redact được path (đối xứng với khoá giả nhét vào log ở
       nhánh *bg-home bên dưới), và phải trả về đúng phần chữ chứ không phải tên file. */
    writeFileSync(P(`prompts/${job}.txt`),
      "Canvas orientation: LANDSCAPE 1536x1024.\n" +
      `fake prompt for ${job}\n` +
      `duong dan tuyet doi cua engine gia: ${projectDir}/raw/${job}.png\n`)
    /* `.att` chỉ còn ẢNH CỦA NGƯỜI DÙNG. Bản thật từng đặt `skeleton/<sheet>.png` ở dòng
       đầu; khung xương bỏ 27/08/2026 nên fixture phải khai đúng hình dạng mới, không thì
       ca prompt-preview xanh trên một hợp đồng đã chết. */
    const sheet = job.slice(job.indexOf("-") + 1)
    writeFileSync(P(`prompts/${job}.att`), `refs/${sheet}.png\nrefs/phong-cach.png\n`)
    /* BẢN KÊ VAI. `.att` chỉ có một cột đường dẫn; `.refs` nói thêm ẢNH NÀY LÀ VAI GÌ
       — đó là thứ màn xem trước dựng khối «Ảnh đi kèm» lên. */
    writeFileSync(P(`prompts/${job}.refs`),
      `character\trefs/${sheet}.png\nbrand\trefs/phong-cach.png\n`)
    writeFileSync(P(`logs/${job}.log`), `fake log for ${job}\n`)

    /* ĐÚNG CHỖ DỪNG CỦA BẢN THẬT: `gen` thoát ngay sau khi dựng xong prompt/.att,
       TRƯỚC vòng gọi codex. Fixture phải dừng ở đúng đó thì ca prompt-preview mới
       chứng minh được là agent không hề đợi một lượt vẽ nào. */
    if (process.env.KITGEN_PROMPTS_ONLY) continue

    if (job.endsWith("bg-home")) {
      /* BACKLOG #22 — job lỗi phải để lại BẰNG CHỨNG, đúng hình dạng ca thật đã gặp:
         `rc=127` (codex không có trên PATH) chứ không chỉ "ảnh không được ghi".
         Ba dòng này cố tình mang một khoá giả VÀ một đường dẫn tuyệt đối để test
         chứng minh `errorTail` đã đi qua redactLine (che khoá + rút gọn path). */
      const evidence =
        `codex: command not found (PATH=${projectDir}/bin)\n` +
        "api_key=sk-KITGENTESTKEY0123456789 rejected\n" +
        "rc=127 — ảnh không được ghi mới\n"
      writeFileSync(P(`logs/${job}.log`), `fake log for ${job}\n` + evidence)
      process.stderr.write(evidence)
      say(`FAIL ${job} (rc=127, ảnh không được ghi mới — xem logs/${job}.log)`)
      continue
    }
    writeFileSync(P(`raw/${job}.png`), "PNGFAKE")
    say(`OK  ${job}  8.0K`)
    /* NHỊP GIỮA HAI TẤM. Engine thật mất hàng PHÚT cho mỗi tấm — cả giá trị của "cắt lũy
       tiến" nằm ở khoảng trống đó. Fixture chạy trong 5ms thì mọi thứ xảy ra "cùng lúc"
       và test không phân biệt nổi bản cắt-ngay với bản cắt-cuối-lượt. 0.4s là đủ để chu
       trình per-sheet (cắt + thumbnail + sheet.ready) của tấm trước xong TRƯỚC khi tấm
       sau gen xong, tức là đúng thứ tự mà bản thật sẽ có. */
    await sleep(400)
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
  slice: (projectDir, argv) => { fakeSlice(projectDir, argv); return 0 },
}))
