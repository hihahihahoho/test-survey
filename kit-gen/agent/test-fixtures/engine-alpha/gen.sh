#!/usr/bin/env bash
# ENGINE GIẢ #2 — MỘT TẤM CÓ NỀN ĐỤC, VÀ NÓ VẪN LÀ MỘT TẤM XONG.
#
# ╔══ VÌ SAO CÓ FIXTURE RIÊNG THAY VÌ THÊM MỘT NHÁNH VÀO engine-fake ═══════════╗
# ║ `engine-fake` đã cố ý cho `bg-home` chết theo kiểu KHÁC (`rc=127`, tức       ║
# ║ NO_ARTIFACT), và cả một loạt ca đang khoá đúng con số của nó ("1/3 job không ║
# ║ ghi được ảnh"). Nhồi thêm một hình dạng thứ hai vào đó là đổi đáp án của      ║
# ║ những ca ấy vì một lý do không liên quan gì tới chúng.                        ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
#
# Tấm `bg-home` ở đây tái hiện ĐÚNG hình dạng mà `gen.sh` thật để lại từ 09/09/2026,
# sau khi chủ sản phẩm chốt "cứ để cho nó gen tự nhiên nhé, ko block":
#   · ảnh nằm ở `raw/<job>.png` như mọi tấm khác — KHÔNG bị loại, không `.rejected`;
#   · dòng kết là `OK <job> <cỡ>  [nền đục: <lý do>]` — phép đo nền chỉ còn là ghi
#     chú, không thử lại, không đánh trượt job;
#   · `slice.py` cạnh đây đọc nội dung ảnh và ghi `mode: "rgb"` vào manifest, đúng
#     như bản thật — đó là thứ duy nhất còn nói cho người dùng biết tấm này đục.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw prompts logs kits
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
  echo "prompt → prompts/${j}.txt (+0 ảnh kèm)"
  echo "Canvas orientation: LANDSCAPE 1536x1024." > "prompts/${j}.txt"
  # ENGINE ĐỜI CŨ: có `.att` nhưng KHÔNG có bản kê vai `.refs`. Đó là hình dạng
  # đĩa của một máy webapp đã cập nhật mà engine thì chưa — cửa xem trước phải bày
  # đúng những tấm ảnh này với vai để TRỐNG, chứ không đổ và không bịa vai.
  echo "refs/mascot.png" > "prompts/${j}.att"
  echo "fake log for ${j}" > "logs/${j}.log"
  [ -n "${KITGEN_PROMPTS_ONLY:-}" ] && continue
  case "$j" in
    *bg-home)
      printf 'PNGFAKE-DUC' > "raw/${j}.png"
      echo "nền đục: KHÔNG có kênh alpha (mode=RGB). — chỉ ghi nhận, không chặn" >> "logs/${j}.log"
      echo "OK  ${j}  8.0K  [nền đục: KHÔNG có kênh alpha (mode=RGB). image_gen phải trả PNG RGBA — đường tách nền đã bỏ nên không có gì cứu được ảnh này.]"
      sleep 0.1
      continue ;;
  esac
  printf 'PNGFAKE' > "raw/${j}.png"
  echo "OK  ${j}  8.0K"
  sleep 0.1
done
echo "Xong $(date +%H:%M:%S)"
