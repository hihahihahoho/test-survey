#!/usr/bin/env bash
# Sinh sprite sheet UI kit bằng codex CLI image-gen: mỗi (style × sheet) một con codex,
# tất cả chạy song song. Contract nằm trọn trong styles.json.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
mkdir -p raw logs prompts

# Build prompt cho từng (style, sheet) → prompts/<style>-<sheet>.txt
python3 - <<'PY'
import json
cfg = json.load(open("styles.json"))

for s in cfg["styles"]:
    for sh in cfg["sheets"]:
        cols, rows = sh["grid"]["cols"], sh["grid"]["rows"]
        comps = sh["components"]
        assert len(comps) == cols * rows, f'{sh["id"]}: {len(comps)} component ≠ lưới {cols}x{rows}'
        lines = [
            "A game UI kit sprite sheet for a mobile mini-game marketing campaign.",
            f"Exactly {len(comps)} elements arranged in a STRICT grid of {cols} columns and {rows} rows, evenly spaced.",
            f"Each cell is a {sh.get('cell_hint', 'cell')}. Each element sits fully inside its own invisible cell,",
            "centered, keeping at least 40px of empty background padding on every side of the element;",
            "elements never touch each other and never touch the image edges."
            if sh["id"] != "bg" else
            "The two background scenes each fill their own half of the image completely, edge to edge, with a thin 24px gap between them.",
            "",
            f"BACKGROUND of the sheet: one flat solid chroma-key color: {s['bg']}.",
            "No gradient, no texture, NO checkerboard or transparency pattern, no grid lines.",
            "This exact background color — and any hue CLOSE to it — must NEVER appear inside any element; pick element colors far from it on the color wheel.",
            "",
            "SIZING: every element is drawn at a CONSISTENT scale — each fills about 70-80% of its",
            "cell's width (or height for tall elements), so all elements look uniform in size.",
            "",
            "ABSOLUTELY NO TEXT: no letters, no digits, no words, no characters of any language",
            "anywhere in the image. All faces, banners, buttons, plates and screens are BLANK — text will",
            "be composited later in the game engine.",
            "Every element is FULLY OPAQUE with solid fills — never leave an element interior hollow,",
            "semi-transparent, or showing the background through it (except where a spec explicitly says hollow).",
            ""
        ]
        for r in range(rows):
            lines.append(f"Row {r + 1}, left to right:")
            for c in range(cols):
                i = r * cols + c
                lines.append(f"{i + 1}) {comps[i]['spec']}")
            lines.append("")
        lines += [
            f"Art style: {s['style']}.",
            f"All {len(comps)} elements share the exact same consistent style and belong to one coherent game. Game-ready UI asset quality, landscape 3:2."
        ]
        open(f"prompts/{s['id']}-{sh['id']}.txt", "w").write("\n".join(lines))
        print("prompt →", f"prompts/{s['id']}-{sh['id']}.txt")
PY

run_one() {
  local job="$1"
  local task
  task="Generate ONE image with your image generation tool, landscape (1536x1024 if supported), using EXACTLY the prompt between the IMAGE PROMPT markers below. Then save/copy the generated PNG to exactly this path: ${ROOT}/raw/${job}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/${job}.txt")
--- IMAGE PROMPT END ---"

  codex exec \
    -s workspace-write \
    -C "${ROOT}" \
    --skip-git-repo-check \
    -o "logs/${job}.last.txt" \
    "${task}" >"logs/${job}.log" 2>&1
  local rc=$?
  if [[ $rc -eq 0 && -f "raw/${job}.png" ]]; then
    echo "OK  ${job}  $(du -h "raw/${job}.png" | cut -f1)"
  else
    echo "FAIL ${job} (rc=${rc}, xem logs/${job}.log)"
  fi
}

FILTER="${1:-}"
echo "Bắt đầu $(date +%H:%M:%S) — chạy song song${FILTER:+ (lọc: $FILTER)}"
while read -r job; do
  [[ -n "$FILTER" && "$job" != *"$FILTER"* ]] && continue
  run_one "$job" &
done < <(python3 -c "
import json
cfg = json.load(open('styles.json'))
for s in cfg['styles']:
    for sh in cfg['sheets']:
        print(f\"{s['id']}-{sh['id']}\")")
wait
echo "Xong $(date +%H:%M:%S)"
ls -la raw/ 2>/dev/null