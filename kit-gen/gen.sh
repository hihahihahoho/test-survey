#!/usr/bin/env bash
# Sinh sprite sheet UI kit bằng codex CLI image-gen: mỗi (style × sheet) một con codex,
# tất cả chạy song song. Contract nằm trọn trong styles.json.
set -uo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"
mkdir -p raw logs prompts

# Khung xương layout (ảnh ref đính kèm codex) — deterministic từ styles.json.
# Bản HTML/SVG (nét, đẹp); thiếu playwright thì rơi về bản PIL.
node render-skeleton.mjs || python3 skeleton.py

# Build prompt cho từng (style, sheet) → prompts/<style>-<sheet>.txt
python3 - <<'PY'
import json
cfg = json.load(open("styles.json"))

for s in cfg["styles"]:
    for sh in cfg["sheets"]:
        if sh.get("styles") and s["id"] not in sh["styles"]:
            continue                      # sheet riêng của style khác (vd pose-<char>)
        cols, rows = sh["grid"]["cols"], sh["grid"]["rows"]
        comps = sh["components"]
        assert len(comps) == cols * rows, f'{sh["id"]}: {len(comps)} component ≠ lưới {cols}x{rows}'
        portrait = sh.get("orient") == "portrait"
        lines = [
            "Canvas orientation: " + ("PORTRAIT 1024x1536." if portrait else "LANDSCAPE 1536x1024."),
            "A game UI kit sprite sheet for a mobile mini-game marketing campaign."
            if len(comps) > 1 else
            "A single full-bleed background scene for a mobile mini-game.",
            f"Exactly {len(comps)} elements arranged in a STRICT grid of {cols} columns and {rows} rows, evenly spaced.",
            f"Each cell is a {sh.get('cell_hint', 'cell')}. Each element sits fully inside its own invisible cell,",
            "centered, keeping at least 40px of empty background padding on every side of the element;",
            "elements never touch each other and never touch the image edges."
            if sh["id"] != "bg" else
            "The two background scenes each fill their own half of the image completely, edge to edge, with a thin 24px gap between them.",
            "",
            "The FIRST attached image is the layout skeleton of this exact sheet. In each cell,",
            "the dark rectangular frame is the SAFE ZONE and the gray silhouette shows the",
            "element's rough shape:",
            "- the element's MAIN BODY must fill the safe-zone frame exactly (position and size);",
            "- decorative details (flowers, ribbons, tassels, sparkles) MAY overflow outside",
            "  the frame for a lively look, but must stay inside the cell and never cross",
            "  into another cell.",
            "The skeleton is ONLY a placement guide: do NOT copy its gray color, frames,",
            "grid lines or plain shapes into the artwork.",
            "",
            f"BACKGROUND of the sheet: one flat solid chroma-key color: {s['bg']}.",
            "This background rule OVERRIDES the art style and every reference image:",
            "never use a style-colored, scene or gradient background for the sheet.",
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
        if sh.get("ref"):
            lines += [
                "The SECOND attached image is a character REFERENCE PHOTO: every character",
                "cell must show EXACTLY this character — same species, face, colors, costume,",
                "materials and proportions — re-drawn cleanly in this sheet's art style.", ""]
        # Branding: mode "colors" → dòng palette; mode "image" → ảnh brand đính kèm
        bmode = s.get("brand", {}).get("mode", "colors")
        if s.get("brand") and bmode == "colors" and s["brand"].get("primary"):
            b = s["brand"]
            bl = f"Brand palette: primary {b.get('primary')}, secondary {b.get('secondary')}"
            if b.get("gradient"):
                bl += f", gradient {b['gradient']}"
            lines += [bl + " — use these as the dominant UI colors.", ""]
        use_brand_refs = bmode == "image" and s.get("brand", {}).get("refs")
        use_inspo = s.get("styleMode", "prompt") == "inspo" and s.get("inspo")
        if use_brand_refs or use_inspo:
            lines += [
                "Also attached: brand / inspiration reference images — match their color",
                "mood, material finish and overall vibe (do NOT copy their layout).",
                "IMPORTANT: even though the reference images have their own backgrounds,",
                "the sheet background MUST still be the exact flat chroma-key color above —",
                "NEVER reuse a reference background color, especially not for character cells.", ""]
        if sh.get("note"):
            lines += [sh["note"], ""]
        for r in range(rows):
            lines.append(f"Row {r + 1}, left to right:")
            for c in range(cols):
                i = r * cols + c
                lines.append(f"{i + 1}) {comps[i]['spec']}")
            lines.append("")
        lines += [
            ("Art style: faithfully match the attached inspiration reference image(s) — "
             "same rendering technique, materials, palette and level of detail."
             if use_inspo else f"Art style: {s['style']}."),
            f"All {len(comps)} elements share the exact same consistent style and belong to one coherent game. "
            "Game-ready UI asset quality, " + ("portrait 2:3." if portrait else "landscape 3:2.")
        ]
        open(f"prompts/{s['id']}-{sh['id']}.txt", "w").write("\n".join(lines))
        # file đính kèm cho job: skeleton trước, ref nhân vật rồi inspo của style
        att = [f"skeleton/{sh['id']}.png"]
        if sh.get("ref"):
            att.append(sh["ref"])
        if use_brand_refs:
            att += s["brand"]["refs"]
        if use_inspo:
            att += s["inspo"]
        open(f"prompts/{s['id']}-{sh['id']}.att", "w").write("\n".join(att) + "\n")
        print("prompt →", f"prompts/{s['id']}-{sh['id']}.txt", f"(+{len(att)} ảnh kèm)")
PY

run_one() {
  local job="$1"
  local task
  task="Generate ONE image with your image generation tool, at the CANVAS ORIENTATION stated on the first line of the prompt (1536x1024 landscape or 1024x1536 portrait, if supported), using EXACTLY the prompt between the IMAGE PROMPT markers below. The attached images are, in order: the layout skeleton, then any character reference photo / inspiration images the prompt mentions. Then save/copy the generated PNG to exactly this path: ${ROOT}/raw/${job}.png (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/${job}.txt")
--- IMAGE PROMPT END ---"

  local att=()
  while IFS= read -r p || [[ -n "$p" ]]; do
    [[ -n "$p" && -f "${ROOT}/${p}" ]] && att+=(-i "${ROOT}/${p}")
  done < "prompts/${job}.att"

  # bash 3.2 + set -u: mảng rỗng nổ "unbound variable" nếu expand thẳng
  codex exec \
    -s workspace-write \
    -C "${ROOT}" \
    --skip-git-repo-check \
    ${att[@]+"${att[@]}"} \
    -o "logs/${job}.last.txt" \
    "${task}" >"logs/${job}.log" 2>&1
  local rc=$?
  if [[ $rc -eq 0 && -f "raw/${job}.png" ]]; then
    echo "OK  ${job}  $(du -h "raw/${job}.png" | cut -f1)"
  else
    echo "FAIL ${job} (rc=${rc}, xem logs/${job}.log)"
  fi
}

# Filter: mỗi arg là một substring, job khớp BẤT KỲ arg nào thì chạy (không arg = chạy hết)
FILTERS=("$@")
match() {
  [[ ${#FILTERS[@]} -eq 0 ]] && return 0
  local f; for f in "${FILTERS[@]}"; do [[ "$1" == *"$f"* ]] && return 0; done
  return 1
}
echo "Bắt đầu $(date +%H:%M:%S) — chạy song song${FILTERS[*]:+ (lọc: ${FILTERS[*]})}"
while read -r job; do
  match "$job" || continue
  run_one "$job" &
done < <(python3 -c "
import json
cfg = json.load(open('styles.json'))
for s in cfg['styles']:
    for sh in cfg['sheets']:
        if sh.get('styles') and s['id'] not in sh['styles']:
            continue
        print(f\"{s['id']}-{sh['id']}\")")
wait
echo "Xong $(date +%H:%M:%S)"
ls -la raw/ 2>/dev/null