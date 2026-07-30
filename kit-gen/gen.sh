#!/usr/bin/env bash
# Sinh 5 sprite sheet UI kit (5 style, cùng 12 component) bằng codex CLI image-gen.
# Chạy 5 con codex song song, mỗi con một style. Log riêng từng con trong kit-gen/logs/.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
mkdir -p raw logs

# Prompt chung — nội dung 12 ô CỐ ĐỊNH, chỉ thay khối style + màu nền.
build_prompt() {
  local style="$1" bg="$2"
  cat <<EOF
A game UI kit sprite sheet for a mobile mini-game marketing campaign.
Exactly 12 UI components arranged in a STRICT grid of 4 columns and 3 rows, evenly spaced.
Each component sits fully inside its own invisible cell, centered, with generous empty margin;
components never touch each other and never touch the image edges.
The background of the whole image is one FLAT solid color: ${bg}. No gradient, no texture,
no pattern, no shadows cast on the background, no grid lines, no captions or labels outside components.

Row 1, left to right:
1) leaderboard panel titled 'TOP' with three ranked rows and small round avatars
2) popup modal frame with decorative border, a title banner on top, a close X button at the top-right corner and one button inside
3) small form panel with one text input field and one submit button below it
4) gift basket overflowing with wrapped gift boxes and ribbons

Row 2, left to right:
5) history panel with a clock icon in its header and three list rows
6) round '+1' extra-turn button with a small ticket icon
7) large primary call-to-action button with the text 'CHOI NGAY'
8) countdown timer widget showing 00:59 inside a decorative frame

Row 3, left to right:
9) pill-shaped coin counter showing one gold coin and the number 999
10) prize reward card with a gift box illustration and a small label area
11) small toast notification bar with a checkmark icon on its left
12) progress bar about half filled, with a star medallion at its right end

Art style: ${style}.
All 12 components share the exact same consistent style. Game-ready UI asset quality, landscape 3:2.
EOF
}

run_one() {
  local id="$1" style="$2" bg="$3"
  local prompt task
  prompt="$(build_prompt "$style" "$bg")"
  task="Generate ONE image with your image generation tool, landscape (1536x1024 if supported), using EXACTLY the prompt between the IMAGE PROMPT markers below. Then save/copy the generated PNG to exactly this path: ${ROOT}/raw/${id}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
${prompt}
--- IMAGE PROMPT END ---"

  codex exec \
    -s workspace-write \
    -C "${ROOT}" \
    --skip-git-repo-check \
    -o "logs/${id}.last.txt" \
    "${task}" >"logs/${id}.log" 2>&1
  local rc=$?
  if [[ $rc -eq 0 && -f "raw/${id}.png" ]]; then
    echo "OK  ${id}  $(du -h "raw/${id}.png" | cut -f1)"
  else
    echo "FAIL ${id} (rc=${rc}, xem logs/${id}.log)"
  fi
}

# đọc style từ styles.json để không lặp dữ liệu ở hai nơi
mapfile_styles() {
  python3 - <<'PY'
import json
d = json.load(open("styles.json"))
for s in d["styles"]:
    print(f'{s["id"]}\t{s["style"]}\t{s["bg"]}')
PY
}

echo "Bắt đầu $(date +%H:%M:%S) — 5 codex chạy song song"
pids=()
while IFS=$'\t' read -r id style bg; do
  run_one "$id" "$style" "$bg" &
  pids+=($!)
done < <(mapfile_styles)
wait
echo "Xong $(date +%H:%M:%S)"
ls -la raw/ 2>/dev/null
