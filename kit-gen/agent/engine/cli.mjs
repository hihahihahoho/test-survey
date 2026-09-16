#!/usr/bin/env node
/* cli.mjs — CỬA VÀO CỦA ENGINE JS.
 *
 *   node agent/engine/cli.mjs prompts <projectDir> [filter…]
 *   node agent/engine/cli.mjs gen     <projectDir> [filter…]
 *   node agent/engine/cli.mjs cover   <projectDir>
 *
 * `prompts` tương đương `KITGEN_PROMPTS_ONLY=1 bash gen.sh`, `gen` tương đương
 * `bash gen.sh`, `cover` tương đương `bash cover.sh <projectDir>` — mỗi lệnh cùng
 * file ghi ra, cùng dòng stdout, cùng mã thoát với bản bash tương ứng.
 *
 * ⚠️ MỌI ĐƯỜNG DẪN NEO THEO <projectDir>, KHÔNG THEO cwd. `gen.sh` dòng 5 `cd
 * "$(dirname "$0")"` rồi lấy ROOT=$(pwd), và agent COPY cả engine vào project để
 * HERE = project (xem `agent/lib/engine.mjs`). Bản JS không copy gì cả — engine
 * nằm trong gói agent — nên thư mục project phải được truyền vào tường minh.
 *
 * ╔══ HỢP ĐỒNG CHO BƯỚC ④ (agent đổi lệnh spawn) ═══════════════════════════════╗
 * ║ `agent/lib/engine.mjs::buildCommand` hôm nay trả về `bash <project>/gen.sh`.  ║
 * ║ Bước ④ đổi nó thành:                                                          ║
 * ║   gen   → { cmd: process.execPath,                                            ║
 * ║            args: [<agent>/engine/cli.mjs, "gen", projectDirAbs],               ║
 * ║            env:  { MAXJOBS, IMG_HOME? } }                                     ║
 * ║   cover → { cmd: process.execPath,                                            ║
 * ║            args: [<agent>/engine/cli.mjs, "cover", projectDirAbs],             ║
 * ║            env:  { IMG_HOME? } }                                              ║
 * ║ và `prepareEngine` thôi CHÉP `gen.sh`/`cover.sh`/`geometry.py` vào project —   ║
 * ║ engine JS nằm trong gói agent, project chỉ còn là DỮ LIỆU.                     ║
 * ║                                                                               ║
 * ║ NHỮNG THỨ KHÔNG ĐỔI, và vì thế không cần đụng tới `run-handle.mjs`:           ║
 * ║  · cwd của tiến trình con vẫn là <project>; mọi đường dẫn tương đối trong      ║
 * ║    stdout/log (`prompts/…`, `raw/…`, `logs/…`) neo theo đó y như cũ;           ║
 * ║  · bốn mẫu dòng mà `parseGenLine` bám (xem `gen.mjs`) giữ nguyên từng ký tự;   ║
 * ║  · file ghi ra giữ nguyên tên và vị trí: `raw/<job>.png`, `logs/<job>.log`,    ║
 * ║    `logs/<job>.last.txt`, `cover/cover.png`, `cover/cover.raw.png`;            ║
 * ║  · mã thoát: 0 cho mọi ca thường, 1 khi hồ sơ Codex riêng chưa đăng nhập,      ║
 * ║    2 khi thiếu thư mục project / thiếu `prompts/cover.txt` (chỉ `cover`);      ║
 * ║  · biến môi trường đọc y hệt: MAXJOBS · IMG_HOME · KITGEN_GEN_MODEL ·          ║
 * ║    KITGEN_GEN_EFFORT · KITGEN_PROMPTS_ONLY · GEN_BUSY_RETRIES ·                ║
 * ║    GEN_BUSY_BACKOFF, cộng KITGEN_CODEX_BIN (cửa thoát của bộ ca, cùng lối với  ║
 * ║    `lib/codex-login.mjs`) mà bản bash không có.                                ║
 * ║                                                                               ║
 * ║ BA CHỖ BẢN JS CỐ Ý KHÔNG GIỐNG, đã đo và ghi ở ngay chỗ ấy:                    ║
 * ║  ① `ls -la raw/` cuối `gen.sh` không được chép (không thể trùng trên hai máy,  ║
 * ║     không ai đọc) — xem `runGen`;                                             ║
 * ║  ② cách IN của `du -h` theo bản BSD; GNU không đệm khoảng trắng — `humanSize`; ║
 * ║  ③ `MAXJOBS=0` đọc thành 4 thay vì treo vô hạn — `readEnv`.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * ── LỌC JOB: KHÁC BẢN CŨ MỘT CHÚT, VÀ ĐÂY LÀ CHỖ NÓI RA ──────────────────────
 * `gen.sh` đọc `FILTERS=("$@")` Ở SAU chỗ thoát của KITGEN_PROMPTS_ONLY, nên ở chế
 * độ xem trước nó DỰNG PROMPT CHO MỌI JOB bất kể argv. Lệnh `prompts` nhận filter
 * thật, với đúng phép so của `match()` (SUBSTRING: "tet-main" khớp luôn "tet-main2").
 * Không truyền filter thì hai bản giống nhau từng byte — đó là ca golden đối chứng.
 * Lệnh `gen` thì KHÔNG khác: nó dựng prompt cho mọi job rồi mới lọc vòng gọi codex,
 * y hệt bản bash. (Agent cũng KHÔNG dùng filter cho pha gen: nó thu hẹp bằng chính
 * styles.json, xem `buildCommand()` trong lib/engine.mjs.)
 */
import { pathToFileURL } from "node:url"

import { renderPrompts, match } from "./prompts-io.mjs"
import { runGen } from "./gen.mjs"
import { runCover } from "./cover.mjs"

/* Xuất lại để mọi chỗ import cũ (`suite-engine-prompt.mjs`) không đổi một chữ. */
export { renderPrompts, match }

const HELP = `cách dùng:
  node agent/engine/cli.mjs prompts <projectDir> [filter…]
  node agent/engine/cli.mjs gen     <projectDir> [filter…]
  node agent/engine/cli.mjs cover   <projectDir>`

/** `KITGEN_PROMPTS_ONLY=1 bash gen.sh` — dựng prompt rồi DỪNG trước vòng gọi codex. */
export async function mainPrompts(projectDir, filters) {
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

export async function main(argv) {
  const [cmd, projectDir, ...rest] = argv
  if (!projectDir) { process.stderr.write(HELP + "\n"); return 2 }
  if (cmd === "prompts") return await mainPrompts(projectDir, rest)
  if (cmd === "gen") return await runGen(projectDir, rest)
  if (cmd === "cover") return await runCover(projectDir)
  process.stderr.write(HELP + "\n")
  return 2
}

// Chạy trực tiếp (không phải import) thì mới thoát tiến trình.
// `pathToFileURL` chứ không ghép chuỗi "file://": đường dẫn Windows (C:\…) và
// đường có dấu cách đều hỏng ở phép ghép, và hỏng LẶNG LẼ — file không tự chạy
// nữa mà không báo gì.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)))
}
