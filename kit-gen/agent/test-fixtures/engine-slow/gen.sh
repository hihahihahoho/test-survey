#!/usr/bin/env bash
# Engine giả CHẠY LÂU: xong 1 job rồi treo, để test [Dừng lượt chạy] (#36).
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw prompts logs
echo "prompt → prompts/tet-main.txt (+0 ảnh kèm)"
echo "fake" > prompts/tet-main.txt
printf 'PNGFAKE' > raw/tet-main.png
echo "OK  tet-main  8.0K"
sleep 30
echo "không bao giờ tới đây"
