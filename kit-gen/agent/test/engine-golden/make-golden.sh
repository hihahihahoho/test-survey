#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# make-golden.sh — DỰNG MỐC ĐỐI CHỨNG CHO BẢN PORT JS. CHỈ CHẠY TRÊN MÁY DEV.
#
# ╔══ VÌ SAO CÓ FILE NÀY ═══════════════════════════════════════════════════════╗
# ║ Engine đang được port từ bash+python sang JS thuần (16/09/2026) để máy người ║
# ║ dùng không cần Git-Bash, Python, venv, pip. Hợp đồng của bản port là một câu ║
# ║ duy nhất: PROMPT PHẢI GIỐNG TỪNG BYTE. Một hợp đồng như thế chỉ có nghĩa nếu ║
# ║ có một bản GỐC đóng băng để so — không thì "giống" chỉ là lời hứa, và bản JS ║
# ║ sẽ trôi khỏi bản bash trong im lặng, đúng lúc người dùng tin nó.             ║
# ║                                                                             ║
# ║ Nên: script này chạy CHÍNH `gen.sh` thật ở chế độ `KITGEN_PROMPTS_ONLY=1`    ║
# ║ (không codex, không mạng, không quota) trên từng ca fixture, rồi đóng băng   ║
# ║ kết quả vào `expected/`. Bộ ca `agent/test/suite-engine-prompt.mjs` so từng  ║
# ║ byte bản JS với những file ấy.                                              ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
#
# DÙNG:  bash agent/test/engine-golden/make-golden.sh [tên-ca…]
#
# ⚠️ CHẠY LẠI CHỈ KHI `gen.sh` CỐ Ý ĐỔI CÂU CHỮ. Golden là MỐC: nó đỏ lên nghĩa là
# hai engine đã nói khác nhau, và câu trả lời gần như luôn là sửa bản JS. Dựng lại
# golden để "cho nó xanh" là tự tay xoá cái duy nhất đang canh chừng.
#
# ⚠️ KHÔNG ĐÓNG VÀO BẢN PHÁT HÀNH: `build-runtime.sh` loại `agent/test` và
# `agent/test-fixtures`. File này cần bash + python3 — đúng hai thứ mà bản port
# sinh ra để gỡ bỏ khỏi máy người dùng.
#
# CẤU TRÚC MỘT CA (agent/test-fixtures/engine-golden/<ca>/):
#   input/contract.json   — (tuỳ chọn) contract THẬT; styles.json được dựng lại từ
#                           nó bằng `contractToStylesV1` của agent, đúng đường mà
#                           `lib/engine.mjs` đi trước khi gọi engine;
#   input/styles.json     — thứ DUY NHẤT `gen.sh` đọc ở chế độ này (cùng geometry.py,
#                           do script chép vào);
#   expected/prompts/     — mọi file gen.sh ghi ra: .txt (chính văn) · .att (đường
#                           dẫn ảnh kèm) · .refs (vai<TAB>đường dẫn) · .fullbleed;
#   expected/stdout.txt   — stdout đã lọc dòng có giờ.
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"       # kit-gen/ (HERE = agent/test/engine-golden)
FIX="$REPO/agent/test-fixtures/engine-golden"

command -v python3 >/dev/null 2>&1 || { echo "cần python3 (chỉ trên máy dev)" >&2; exit 2; }

cases=("$@")
if [ ${#cases[@]} -eq 0 ]; then
  cases=()
  for d in "$FIX"/*/; do [ -d "$d/input" ] && cases+=("$(basename "$d")"); done
fi
[ ${#cases[@]} -eq 0 ] && { echo "không có ca nào trong $FIX" >&2; exit 2; }

rc=0
for name in "${cases[@]}"; do
  src="$FIX/$name"
  [ -d "$src/input" ] || { echo "LOI  ca '$name' không có input/" >&2; rc=1; continue; }

  # Contract THẬT → styles.json bằng đúng bộ dịch của agent. Nếu bộ dịch ấy đổi thì
  # golden đổi theo, và đó là điều ta MUỐN thấy: `styles.json` là mối nối giữa agent
  # và engine, một thay đổi lặng lẽ ở đó cũng đổi mọi prompt.
  if [ -f "$src/input/contract.json" ]; then
    node --input-type=module -e '
      import { readFile, writeFile } from "node:fs/promises"
      import { contractToStylesV1 } from "'"$REPO"'/agent/lib/engine.mjs"
      const dir = process.argv[1]
      const c = JSON.parse(await readFile(dir + "/contract.json", "utf8"))
      await writeFile(dir + "/styles.json", JSON.stringify(contractToStylesV1(c), null, 2) + "\n", "utf8")
    ' "$src/input" || { echo "LOI  ca '$name': không dựng được styles.json từ contract.json" >&2; rc=1; continue; }
  fi

  work="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-golden.XXXXXX")"
  # ENGINE CHẠY BẰNG MỘT BẢN CHÉP NẰM CẠNH styles.json — đúng hình dạng mà
  # `lib/engine.mjs:prepareEngine` dựng trên máy người dùng (`gen.sh` dòng 5 `cd
  # "$(dirname "$0")"`, nên HERE = thư mục project chứ không phải cwd của caller).
  cp "$REPO/gen.sh" "$work/gen.sh"
  cp "$REPO/geometry.py" "$work/geometry.py"
  chmod +x "$work/gen.sh"
  cp "$src/input"/*.json "$work/" 2>/dev/null

  out="$(cd "$work" && KITGEN_PROMPTS_ONLY=1 bash ./gen.sh 2>&1)"
  gen_rc=$?
  if [ $gen_rc -ne 0 ]; then
    echo "LOI  ca '$name': gen.sh thoát $gen_rc" >&2
    printf '%s\n' "$out" | tail -n 20 >&2
    rm -rf "$work"; rc=1; continue
  fi

  rm -rf "$src/expected"
  mkdir -p "$src/expected"
  cp -R "$work/prompts" "$src/expected/prompts"
  # LỌC DÒNG CÓ GIỜ. Ở chế độ xem trước thì `gen.sh` chưa tới hai dòng «Bắt đầu
  # HH:MM:SS» / «Xong HH:MM:SS» (chúng nằm SAU chỗ thoát), nhưng bộ lọc vẫn đứng
  # đây: bước ③ sẽ mở đường chạy thật qua cùng script này, và một golden mang giờ
  # là một golden đỏ mỗi lần chạy.
  printf '%s\n' "$out" | grep -vE '[0-9]{2}:[0-9]{2}:[0-9]{2}' > "$src/expected/stdout.txt"

  n=$(ls "$src/expected/prompts"/*.txt 2>/dev/null | wc -l | tr -d ' ')
  echo "ok   $name — $n prompt"
  rm -rf "$work"
done
exit $rc
