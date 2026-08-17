#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# cover.sh — sinh MỘT ảnh bìa 16:9 cho một project (ảnh "cover file" như Figma).
#
# ĐÂY LÀ NHÁNH RIÊNG, KHÔNG PHẢI MỘT SHEET.
#   · gen.sh giữ nguyên hợp đồng spritesheet/crop-safe v15: lưới ô, khung chroma-key,
#     safe zone, skeleton đính kèm. Ảnh bìa KHÔNG có gì trong số đó — nó là một cảnh
#     full-bleed, không tách nền, không cắt ô. Trộn hai việc vào một script là cách
#     nhanh nhất để làm hỏng cái đang chạy tốt, nên cover đi bằng file riêng.
#   · Điểm CHUNG với gen.sh (cố ý dùng lại, không viết đường thứ hai):
#       – cùng một lệnh `codex exec` với IMG_HOME/CODEX_HOME của profile ảnh;
#       – cùng mẹo VỚT ẢNH từ generated_images khi model không tự copy về đích;
#       – cùng luật PHÁN THEO SẢN PHẨM (file mới hơn t0), không tin mã thoát.
#
# Gọi:  bash cover.sh <thư-mục-project>
#   đọc  : <project>/prompts/cover.txt  (+ .att: mỗi dòng một ảnh đính kèm)
#   ghi  : <project>/cover/cover.png    (16:9, 1600x900 nếu có Pillow)
#          <project>/cover/cover.raw.png (bản gốc 3:2 model trả về)
#          <project>/logs/cover.log
#   in   : "OK  cover …" hoặc "FAIL cover (…)"
#
# Prompt do AGENT dựng (agent/lib/cover.mjs) chứ không dựng ở đây: nội dung prompt
# phụ thuộc contract (màu thương hiệu, mascot) và cần kiểm bằng unit test — để trong
# bash thì không ai kiểm được.
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

# mtime epoch đa nền. GNU PHẢI đứng trước: `stat -c` trên BSD fail sạch (chỉ stderr),
# còn `stat -f %m` trên GNU coi %m là TÊN FILE ⇒ in khối verbose "File: ..." ra stdout
# rồi mới exit lỗi ⇒ fallback nối thêm số vào sau ⇒ chuỗi nhiều dòng lọt vào [[ -lt ]].
mtime_epoch(){ stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }

PROJECT="${1:-}"
if [[ -z "$PROJECT" || ! -d "$PROJECT" ]]; then
  echo "FAIL cover (thiếu thư mục project: cover.sh <project-dir>)"
  exit 2
fi
cd "$PROJECT" || { echo "FAIL cover (không vào được thư mục project)"; exit 2; }
ROOT="$(pwd)"
mkdir -p cover logs prompts

if [[ ! -f "prompts/cover.txt" ]]; then
  echo "FAIL cover (thiếu prompts/cover.txt — agent chưa dựng prompt)"
  exit 2
fi

IMG_HOME="${IMG_HOME:-}"
if [[ "$IMG_HOME" == "~" ]]; then
  IMG_HOME="$HOME"
elif [[ "$IMG_HOME" == "~/"* ]]; then
  IMG_HOME="$HOME/${IMG_HOME:2}"
fi
if [[ -n "$IMG_HOME" && ! -f "$IMG_HOME/auth.json" ]]; then
  echo "FAIL cover (profile Codex riêng chưa đăng nhập: CODEX_HOME=$IMG_HOME codex login)"
  exit 1
fi

RAW="${ROOT}/cover/cover.raw.png"
OUT="${ROOT}/cover/cover.png"

task="Generate ONE image with your image generation tool, at the CANVAS ORIENTATION stated on the first line of the prompt (1536x1024 landscape, if supported), using EXACTLY the prompt between the IMAGE PROMPT markers below. The attached images, if any, are the project's own brand / mascot references named in the prompt. Then save/copy the generated PNG to exactly this path: ${RAW} (overwrite if it exists). Do not edit, crop or annotate the image. Reply with only the saved file path.

--- IMAGE PROMPT START ---
$(cat "prompts/cover.txt")
--- IMAGE PROMPT END ---"

att=()
if [[ -f "prompts/cover.att" ]]; then
  while IFS= read -r p || [[ -n "$p" ]]; do
    [[ -n "$p" && -f "${ROOT}/${p}" ]] && att+=(-i "${ROOT}/${p}")
  done < "prompts/cover.att"
fi

t0=$(date +%s)
codex_env=()
[[ -n "$IMG_HOME" ]] && codex_env=(env CODEX_HOME="$IMG_HOME")
"${codex_env[@]}" codex exec \
  -s workspace-write \
  -C "${ROOT}" \
  --skip-git-repo-check \
  ${att[@]+"${att[@]}"} \
  -o "logs/cover.last.txt" \
  "${task}" >"logs/cover.log" 2>&1
rc=$?

# VỚT ẢNH — y hệt gen.sh: codex ≥0.147 nhiều lần sinh xong nhưng không tự copy về đích.
if [[ $(mtime_epoch "$RAW") -lt "$t0" ]]; then
  ghome="${IMG_HOME:-$HOME/.codex}/generated_images"
  rel=$(grep -oE "generated_images/[^\"' ]*[.]png" "logs/cover.log" 2>/dev/null | tail -1)
  if [[ -n "$rel" && -f "${ghome}/${rel#generated_images/}" ]]; then
    cp -f "${ghome}/${rel#generated_images/}" "$RAW" \
      && echo "vớt ${rel} → cover/cover.raw.png (model không tự copy về đích)" >>"logs/cover.log"
  fi
fi

mt=$(mtime_epoch "$RAW")
if [[ "$mt" -lt "$t0" ]]; then
  echo "FAIL cover (rc=${rc}, ảnh không được ghi mới — xem logs/cover.log)"
  exit 0    # thất bại của ảnh bìa KHÔNG BAO GIỜ là thất bại của lượt gen chính
fi

# ── Cắt về đúng 16:9 ──────────────────────────────────────────────────────────
# Model chỉ nhận 3:2 (1536x1024); ảnh bìa của app là 16:9. Cắt DẢI GIỮA rồi resize
# về 1600x900 — prompt đã dặn trước hậu quả này nên chủ thể và vùng tiêu đề đều nằm
# trong dải giữa. Không có Pillow thì dùng thẳng bản gốc: thẻ vẫn hiện được (CSS
# object-cover), chỉ là tỉ lệ chưa chuẩn — KHÔNG giả vờ đã cắt.
if python3 - "$RAW" "$OUT" <<'PY' 2>>"logs/cover.log"
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
TARGET_W, TARGET_H = 1600, 900
ratio = TARGET_W / TARGET_H

im = Image.open(src).convert("RGB")
w, h = im.size
if w / h > ratio:                      # rộng quá → cắt hai bên
    nw = int(round(h * ratio))
    left = (w - nw) // 2
    box = (left, 0, left + nw, h)
else:                                  # cao quá → cắt trên dưới (ca 3:2 → 16:9)
    nh = int(round(w / ratio))
    top = (h - nh) // 2
    box = (0, top, w, top + nh)
im.crop(box).resize((TARGET_W, TARGET_H), Image.LANCZOS).save(dst + ".tmp", "PNG")
import os
os.replace(dst + ".tmp", dst)
print("crop 16:9 →", dst)
PY
then
  echo "OK  cover  $(du -h "$OUT" | cut -f1)"
else
  cp -f "$RAW" "$OUT" && echo "OK  cover  (chưa cắt 16:9 — thiếu Pillow, dùng bản gốc)" \
    || echo "FAIL cover (không ghi được cover/cover.png)"
fi
exit 0
