#!/usr/bin/env bash
# Sinh 5 sprite sheet UI kit (5 style, cùng 12 component) bằng codex CLI image-gen.
# Chạy 5 con codex song song. Prompt build từ styles.json — contract một chỗ duy nhất.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
mkdir -p raw logs prompts

# Build prompt cho từng style từ styles.json → prompts/<id>.txt
python3 - <<'PY'
import json
cfg = json.load(open("styles.json"))
cols, rows = cfg["grid"]["cols"], cfg["grid"]["rows"]
comps = cfg["components"]

for s in cfg["styles"]:
    lines = [
        "A game UI kit sprite sheet for a mobile mini-game marketing campaign.",
        f"Exactly {len(comps)} UI components arranged in a STRICT grid of {cols} columns and {rows} rows, evenly spaced.",
        "Each component sits fully inside its own invisible cell, centered, with generous empty margin;",
        "components never touch each other and never touch the image edges.",
        "",
        "BACKGROUND: fully TRANSPARENT (PNG alpha channel). If transparency is not supported,",
        f"use one flat solid background color: {s['bg']} — no gradient, no texture, no pattern,",
        "no shadows cast on the background, no grid lines.",
        "",
        "ABSOLUTELY NO TEXT: no letters, no digits, no words, no characters of any language",
        "anywhere in the image. All banners, buttons, labels and screens are BLANK — text will",
        "be composited later in the game engine.",
        "Every component is FULLY OPAQUE with solid fills — never leave a component interior",
        "hollow, semi-transparent, or showing the background through it.",
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
        f"All {len(comps)} components share the exact same consistent style. Game-ready UI asset quality, landscape 3:2."
    ]
    open(f"prompts/{s['id']}.txt", "w").write("\n".join(lines))
    print("prompt →", f"prompts/{s['id']}.txt")
PY

run_one() {
  local id="$1"
  local task
  task="Generate ONE image with your image generation tool, landscape (1536x1024 if supported), using EXACTLY the prompt between the IMAGE PROMPT markers below. IMPORTANT: request a TRANSPARENT background (PNG with alpha) if your tool supports it. Then save/copy the generated PNG to exactly this path: ${ROOT}/raw/${id}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/${id}.txt")
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

echo "Bắt đầu $(date +%H:%M:%S) — chạy song song"
while read -r id; do
  run_one "$id" &
done < <(python3 -c "import json; [print(s['id']) for s in json.load(open('styles.json'))['styles']]")
wait
echo "Xong $(date +%H:%M:%S)"
ls -la raw/ 2>/dev/null