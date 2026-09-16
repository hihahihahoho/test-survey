#!/usr/bin/env node
/* cli.mjs — CỬA VÀO CỦA ENGINE JS.
 *
 *   node agent/engine/cli.mjs prompts  <projectDir> [filter…]
 *   node agent/engine/cli.mjs gen      <projectDir> [filter…]
 *   node agent/engine/cli.mjs cover    <projectDir>
 *   node agent/engine/cli.mjs slice    <projectDir> [style…] [--sheet=<id>…]
 *   node agent/engine/cli.mjs validate <projectDir> --image … --contract … --job … [--output …]
 *   node agent/engine/cli.mjs thumb    <src.png> <dst.png> <width>
 *
 * `prompts` tương đương `KITGEN_PROMPTS_ONLY=1 bash gen.sh`, `gen` tương đương
 * `bash gen.sh`, `cover` tương đương `bash cover.sh <projectDir>`, `slice` tương đương
 * `python3 slice.py …`, `validate` tương đương `python3 validate_output_geometry.py …`,
 * `thumb` tương đương khối Pillow trong `agent/lib/thumbs.mjs` — mỗi lệnh cùng file ghi
 * ra, cùng dòng stdout, cùng mã thoát với bản cũ tương ứng.
 *
 * ⚠️ MỌI ĐƯỜNG DẪN NEO THEO <projectDir>, KHÔNG THEO cwd. `gen.sh` dòng 5 `cd
 * "$(dirname "$0")"` rồi lấy ROOT=$(pwd), và agent từng COPY cả engine vào project để
 * HERE = project. Bản JS không copy gì cả — engine nằm trong gói agent — nên thư mục
 * project phải được truyền vào tường minh. (`thumb` là lệnh duy nhất không neo theo
 * project: nó co một file bất kỳ sang cache thumbnail của agent.)
 *
 * ╔══ BƯỚC ④ ĐÃ NỐI: ĐÂY LÀ THỨ AGENT ĐANG CHẠY ═══════════════════════════════╗
 * ║ `agent/lib/engine.mjs::buildCommand` trả về:                                 ║
 * ║   gen   → { cmd: process.execPath,                                            ║
 * ║            args: [<engineDir>/cli.mjs, "gen", projectDirAbs],                 ║
 * ║            env:  { MAXJOBS, IMG_HOME? } }                                     ║
 * ║   slice → { cmd: process.execPath,                                            ║
 * ║            args: [<engineDir>/cli.mjs, "slice", projectDirAbs,                 ║
 * ║                   …styles, …"--sheet=<id>"] }                                 ║
 * ║ `cover` đi đường KHÁC: `agent/lib/cover.mjs` nạp thẳng `<engineDir>/cover.mjs` ║
 * ║ trong tiến trình agent (nó cần gọi/đọc log theo dòng, và thiếu file ấy chính   ║
 * ║ là hợp đồng 409 COVER_UNAVAILABLE của route).                                 ║
 * ║ `<engineDir>` = `agent/engine` trên mọi máy thật; test trỏ nó sang một engine  ║
 * ║ giả (`agent/test-fixtures/engine-*`) — cùng argv, cùng dòng chữ, không codex.  ║
 * ║ `prepareEngine` KHÔNG còn chép file nào vào project: project chỉ còn là DỮ LIỆU║
 * ║ (`styles.json` + `raw/` + `prompts/` + `kits/`).                              ║
 * ║                                                                               ║
 * ║ NHỮNG THỨ KHÔNG ĐỔI, và vì thế `run-handle.mjs` không phải đụng tới:          ║
 * ║  · cwd của tiến trình con vẫn là <project>; mọi đường dẫn tương đối trong      ║
 * ║    stdout/log (`prompts/…`, `raw/…`, `logs/…`) neo theo đó y như cũ;           ║
 * ║  · bốn mẫu dòng mà `parseGenLine` bám (xem `gen.mjs`) giữ nguyên từng ký tự;   ║
 * ║  · file ghi ra giữ nguyên tên và vị trí: `raw/<job>.png`, `logs/<job>.log`,    ║
 * ║    `logs/<job>.last.txt`, `cover/cover.png`, `cover/cover.raw.png`;            ║
 * ║  · biến môi trường đọc y hệt: MAXJOBS · IMG_HOME · KITGEN_GEN_MODEL ·          ║
 * ║    KITGEN_GEN_EFFORT · KITGEN_PROMPTS_ONLY · GEN_BUSY_RETRIES ·                ║
 * ║    GEN_BUSY_BACKOFF, cộng KITGEN_CODEX_BIN (cửa thoát của bộ ca, cùng lối với  ║
 * ║    `lib/codex-login.mjs`) mà bản bash không có.                                ║
 * ║                                                                               ║
 * ║ MÃ THOÁT: 0 cho mọi ca thường · 1 khi hồ sơ Codex riêng chưa đăng nhập ·       ║
 * ║ 2 khi thiếu thư mục project / thiếu `prompts/cover.txt` / argv sai ·           ║
 * ║ 3 khi KHỐI DỰNG PROMPT CHẾT (bản JS dừng trước vòng gọi codex — `gen.sh` thì   ║
 * ║ đi tiếp và tiêu quota; đó là một trong ba chỗ bước ④ cố ý sửa, xem `gen.mjs`). ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * BA CHỖ BẢN JS CỐ Ý KHÔNG GIỐNG BẢN BASH, đã đo và ghi ở ngay chỗ ấy:
 *  ① `ls -la raw/` cuối `gen.sh` không được chép (không thể trùng trên hai máy,
 *     không ai đọc) — xem `runGen`;
 *  ② cách IN của `du -h` theo bản BSD; GNU không đệm khoảng trắng — `humanSize`;
 *  ③ `MAXJOBS=0` đọc thành 4 thay vì treo vô hạn — `readEnv`.
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

import { readFile, writeFile, rename } from "node:fs/promises"

import { renderPrompts, match } from "./prompts-io.mjs"
import { runGen } from "./gen.mjs"
import { runCover } from "./cover.mjs"
import { runSlice } from "./slice.mjs"
import { main as validateMain } from "./validate.mjs"
import { thumbnail } from "./thumbs.mjs"

/* Xuất lại để mọi chỗ import cũ (`suite-engine-prompt.mjs`) không đổi một chữ. */
export { renderPrompts, match }

const HELP = `cách dùng:
  node agent/engine/cli.mjs prompts  <projectDir> [filter…]
  node agent/engine/cli.mjs gen      <projectDir> [filter…]
  node agent/engine/cli.mjs cover    <projectDir>
  node agent/engine/cli.mjs slice    <projectDir> [style…] [--sheet=<id>…]
  node agent/engine/cli.mjs validate <projectDir> --image <png> --contract <json> --job <id> [--output <json>]
  node agent/engine/cli.mjs thumb    <src.png> <dst.png> <width>`

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

/**
 * `im.thumbnail((w, w*4))` của `agent/lib/thumbs.mjs`, chạy trong TIẾN TRÌNH RIÊNG.
 *
 * Vì sao không gọi thẳng `thumbnail()` trong agent: co một tấm 1536×1024 bằng JS
 * thuần mất hàng trăm ms CPU, và agent chỉ có MỘT luồng — nó còn đang bơm event
 * NDJSON của lượt gen ra cho web. Bản cũ cũng spawn ra ngoài (python + Pillow);
 * đây là đúng chỗ đó, chỉ đổi thứ được spawn.
 *
 * Ghi ra `<dst>.tmp` rồi `rename` — `os.replace` của bản cũ: người đọc không bao
 * giờ thấy một file thumbnail ghi dở.
 */
export async function mainThumb(args) {
  const [src, dst, w] = args
  const width = Number(w)
  if (!src || !dst || !Number.isFinite(width) || width <= 0) { process.stderr.write(HELP + "\n"); return 2 }
  try {
    await writeFile(dst + ".tmp", thumbnail(await readFile(src), width))
    await rename(dst + ".tmp", dst)
  } catch (e) {
    // Caller (agent) đọc MÃ THOÁT và sự tồn tại của file đích; nó có sẵn đường lui
    // "phục vụ ảnh gốc + X-KitGen-Thumb: unavailable" cho đúng ca này.
    process.stderr.write(String(e?.message ?? e) + "\n")
    return 1
  }
  return 0
}

export async function main(argv) {
  const [cmd, projectDir, ...rest] = argv
  // `thumb` là lệnh DUY NHẤT không neo theo project: nó co một file bất kỳ trong
  // workspace (kits/, raw/, refs/) sang cache thumbnail của agent.
  if (cmd === "thumb") return await mainThumb([projectDir, ...rest])
  if (!projectDir) { process.stderr.write(HELP + "\n"); return 2 }
  if (cmd === "prompts") return await mainPrompts(projectDir, rest)
  if (cmd === "gen") return await runGen(projectDir, rest)
  if (cmd === "cover") return await runCover(projectDir)
  /* `slice.py <style…> [--sheet=…]` — argv giữ NGUYÊN VĂN, chỉ thêm <projectDir> ở
     đầu vì bản JS không được copy vào project nên không tự biết mình đứng ở đâu. */
  if (cmd === "slice") return runSlice(rest, { root: projectDir }).code
  /* `validate_output_geometry.py --image … --contract … --job … [--output …]`.
     <projectDir> đứng trước cho cùng hình dạng với ba lệnh trên; bộ đọc cờ của
     `validate.mjs` bỏ qua tham số không phải cờ, nên nó không cần biết gì thêm. */
  if (cmd === "validate") return validateMain(rest)
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
