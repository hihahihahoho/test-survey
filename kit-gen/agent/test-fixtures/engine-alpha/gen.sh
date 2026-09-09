#!/usr/bin/env bash
# ENGINE GIẢ #2 — CỔNG ALPHA ĐÁNH TRƯỢT MỘT TẤM.
#
# ╔══ VÌ SAO CÓ FIXTURE RIÊNG THAY VÌ THÊM MỘT NHÁNH VÀO engine-fake ═══════════╗
# ║ `engine-fake` đã cố ý cho `bg-home` chết theo kiểu KHÁC (`rc=127`, tức       ║
# ║ NO_ARTIFACT), và cả một loạt ca đang khoá đúng con số của nó ("1/3 job không ║
# ║ ghi được ảnh"). Nhồi thêm một kiểu chết thứ hai vào đó là đổi đáp án của      ║
# ║ những ca ấy vì một lý do không liên quan gì tới chúng.                        ║
# ╚═════════════════════════════════════════════════════════════════════════════╝
#
# Tấm `bg-home` ở đây tái hiện ĐÚNG hình dạng mà `gen.sh` thật để lại sau khi cổng
# alpha đánh trượt CẢ HAI lượt (lượt đầu + đúng một lượt vẽ lại):
#   · in `FAIL <job> (nền KHÔNG trong suốt thật: … — đã thử lại 1 lần, vẫn vậy; …)`
#   · ảnh trượt nằm ở `raw/<job>.rejected.png`
#   · và `raw/<job>.png` KHÔNG TỒN TẠI — đó mới là thứ giữ cho agent không đăng nó.
#
# `KITGEN_TEST_ALPHA_LEAVE_RAW=1` bật ca NGƯỢC: engine (bản cũ hơn) vẫn để ảnh đục
# nằm ở đích. Agent phải tự chặn, vì `settleGenJobs` vốn phán theo SẢN PHẨM.
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
  : > "prompts/${j}.att"
  echo "fake log for ${j}" > "logs/${j}.log"
  [ -n "${KITGEN_PROMPTS_ONLY:-}" ] && continue
  case "$j" in
    *bg-home)
      printf 'PNGFAKE-DUC' > "raw/${j}.rejected.png"
      [ -n "${KITGEN_TEST_ALPHA_LEAVE_RAW:-}" ] && printf 'PNGFAKE-DUC' > "raw/${j}.png"
      echo "FAIL ${j} (nền KHÔNG trong suốt thật: có kênh alpha nhưng gần như không chỗ nào trong suốt (alpha=0 chỉ 0.00%) — model vẽ đè kín nền. — đã thử lại 1 lần, vẫn vậy; ảnh bị loại ở raw/${j}.rejected.png, xem logs/${j}.log)"
      continue ;;
  esac
  printf 'PNGFAKE' > "raw/${j}.png"
  echo "OK  ${j}  8.0K"
  sleep 0.1
done
echo "Xong $(date +%H:%M:%S)"
