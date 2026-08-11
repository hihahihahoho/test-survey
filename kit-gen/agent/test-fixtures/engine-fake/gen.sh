#!/usr/bin/env bash
# ENGINE GIẢ CHO TEST — cùng giao diện với gen.sh thật:
#   · neo đường dẫn theo THƯ MỤC CHỨA SCRIPT (cd dirname $0), đúng như gen.sh dòng 5
#   · đọc styles.json cạnh script, job = style × sheet (tôn trọng sheet.styles)
#   · in "prompt → prompts/<job>.txt", "OK  <job>", "FAIL <job> (...)"; ghi raw/<job>.png
#   · dùng heredoc python như gen.sh, không cần file phụ
# KHÁC: KHÔNG gọi codex ⇒ KHÔNG TỐN QUOTA. Chỉ để test pipeline của agent.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw prompts logs kits
jobs=$(python3 - <<'PY'
import json
cfg = json.load(open('styles.json'))
for s in cfg['styles']:
    for sh in cfg['sheets']:
        if sh.get('styles') and s['id'] not in sh['styles']:
            continue
        print(f"{s['id']}-{sh['id']}")
PY
)
for j in $jobs; do
  echo "prompt → prompts/${j}.txt (+1 ảnh kèm)"
  echo "fake prompt for ${j}" > "prompts/${j}.txt"
  echo "fake log for ${j}" > "logs/${j}.log"
  case "$j" in
    *bg-home)
      echo "FAIL ${j} (rc=1, ảnh không được ghi mới — xem logs/${j}.log)"
      continue ;;
  esac
  printf 'PNGFAKE' > "raw/${j}.png"
  echo "OK  ${j}  8.0K"
done
echo "Xong $(date +%H:%M:%S)"
