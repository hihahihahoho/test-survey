#!/usr/bin/env node
/* ENGINE GIẢ "HẬU KỲ CHẬM" — dựng riêng cho ca "hai nhịp của chu trình per-sheet".
 *
 * VÌ SAO PHẢI CÓ FIXTURE RIÊNG: `engine-fake` chạy cả hậu kỳ trong vài mili-giây, nên
 * nhịp 1 (ảnh) và nhịp 2 (cắt) rơi vào cùng một khoảnh khắc — bản CŨ (một nhịp) và bản
 * MỚI (hai nhịp) cho ra log giống hệt nhau, và ca test không phân biệt được. Ở đây hậu kỳ
 * bị làm chậm CÓ CHỦ Ý:
 *   · `slice` ngủ KITGEN_TEST_SLICE_DELAY_MS trước khi cắt
 *   · `validate` TREO VĨNH VIỄN (mô phỏng phép kiểm hình học kẹt trên máy thật)
 * Khoảng trống ấy chính là quãng mà bản cũ giữ ảnh làm con tin.
 *
 * Phần gen thì NHANH và KHÔNG tấm nào hỏng: ca này đo hậu kỳ, không đo đường lỗi.
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { fakeSlice, hhmmss, jobsOf, mkdirs, readStyles, runFixture, say, sleep }
  from "../fake-engine.mjs"

async function gen(projectDir) {
  mkdirs(projectDir, ["raw", "prompts", "logs", "kits"])
  for (const { job } of jobsOf(readStyles(projectDir))) {
    say(`prompt → prompts/${job}.txt`)
    writeFileSync(join(projectDir, `prompts/${job}.txt`), `fake prompt for ${job}\n`)
    writeFileSync(join(projectDir, `logs/${job}.log`), `fake log for ${job}\n`)
    writeFileSync(join(projectDir, `raw/${job}.png`), "PNGFAKE")
    say(`OK  ${job}  8.0K`)
    /* Đủ để tấm trước vào được nhịp 1 trước khi tấm sau gen xong, mà vẫn KHÔNG đủ để
       hậu kỳ của tấm trước chạy hết — tức là hàng đợi nhịp 2 luôn có việc tồn. */
    await sleep(150)
  }
  say(`Xong ${hhmmss()}`)
  return 0
}

process.exit(await runFixture({
  gen,
  async slice(projectDir, argv) {
    /* NGỦ TRƯỚC KHI CẮT. Đó là toàn bộ lý do fixture này tồn tại — trong bản một-nhịp
       cũ, quãng ngủ này là quãng ẢNH BỊ GIỮ LẠI: `sheet.ready` (thứ mang `artifact.path`
       tới web) chỉ phát sau khi cắt xong. Ca test đo đúng khoảng cách giữa `sheet.image`
       và `sheet.ready` để chứng minh ảnh KHÔNG còn chờ cắt nữa. */
    await sleep(Number(process.env.KITGEN_TEST_SLICE_DELAY_MS ?? "1200"))
    fakeSlice(projectDir, argv)
    return 0
  },
  /* KIỂM HÌNH HỌC GIẢ — TREO VĨNH VIỄN, CÓ CHỦ Ý.
     Mô phỏng đúng ca đã làm hỏng lượt gen thật: phép kiểm không trả về (ảnh hỏng,
     tiến trình bị antivirus giữ…). Trước bản vá, agent gọi nó NGAY TRƯỚC phép gán
     `j.artifact` và KHÔNG có trần thời gian ⇒ ảnh nằm sẵn trên đĩa mà web không bao
     giờ thấy, và cả lượt chạy đứng ở "đang chạy" mãi mãi.
     Ca test dùng nhánh này để khoá hai lời hứa:
       ① trần `KITGEN_GEOMETRY_TIMEOUT_MS` cắt được nó (không còn treo vô hạn);
       ② một lượt kiểm hình học chết KHÔNG kéo theo lượt chạy — ảnh vẫn tới web đúng
          giờ, run vẫn đóng sổ "done", tấm chỉ mất phần `validation`.
     Không in gì ra stdout: agent phải hiểu "không có JSON" là "không kiểm được", chứ
     không được coi đó là lỗi của tấm ảnh. */
  validate: () => new Promise(() => {
    /* GIỮ VÒNG LẶP SỰ KIỆN SỐNG. Một Promise không bao giờ settle KHÔNG giữ node lại:
       hết handle là nó thoát (mã 13, "unsettled top-level await") — tức tiến trình
       chết ngay, agent đọc "không có JSON" và ca test mất đúng thứ nó định đo. Cái
       `setInterval` này là bản dịch của `while True: time.sleep(3600)` bên Python. */
    setInterval(() => {}, 3600_000)
  }),
}))
