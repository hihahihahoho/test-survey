#!/usr/bin/env bash
# ENGINE GIẢ "HẬU KỲ CHẬM" — dựng riêng cho ca "hai nhịp của chu trình per-sheet".
#
# VÌ SAO PHẢI CÓ FIXTURE RIÊNG: `engine-fake` chạy cả hậu kỳ trong vài mili-giây, nên
# nhịp 1 (ảnh) và nhịp 2 (cắt) rơi vào cùng một khoảnh khắc — bản CŨ (một nhịp) và bản
# MỚI (hai nhịp) cho ra log giống hệt nhau, và ca test không phân biệt được. Ở đây hậu kỳ
# bị làm chậm CÓ CHỦ Ý:
#   · slice.py ngủ KITGEN_TEST_SLICE_DELAY_MS trước khi cắt
#   · validate_output_geometry.py TREO VĨNH VIỄN (mô phỏng python kẹt trên máy thật)
# Khoảng trống ấy chính là quãng mà bản cũ giữ ảnh làm con tin.
#
# Phần gen thì NHANH và KHÔNG tấm nào hỏng: ca này đo hậu kỳ, không đo đường lỗi.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw prompts logs kits
# `tr -d '\r'`: xem chú thích cùng chỗ ở engine-fake/gen.sh (print() của Python trên
# Windows dịch "\n" thành "\r\n" kể cả khi stdout là pipe).
jobs=$(python3 - <<'PY' | tr -d '\r'
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
  echo "prompt → prompts/${j}.txt"
  echo "fake prompt for ${j}" > "prompts/${j}.txt"
  echo "fake log for ${j}" > "logs/${j}.log"
  printf 'PNGFAKE' > "raw/${j}.png"
  echo "OK  ${j}  8.0K"
  # Đủ để tấm trước vào được nhịp 1 trước khi tấm sau gen xong, mà vẫn KHÔNG đủ để hậu kỳ
  # của tấm trước chạy hết — tức là hàng đợi nhịp 2 luôn có việc tồn, đúng cảnh thật.
  sleep 0.15
done
echo "Xong $(date +%H:%M:%S)"
