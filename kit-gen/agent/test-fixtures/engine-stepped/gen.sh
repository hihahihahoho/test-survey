#!/usr/bin/env bash
# ENGINE GIẢ "CHẬM ĐỀU" — dành riêng cho các ca DỪNG GIỮA CHỪNG rồi CHẠY TIẾP.
#
# Khác `engine-fake` (xong tức thì, có 1 job đỏ cố ý) và `engine-slow` (xong 1 job rồi
# treo 30s): ở đây MỌI job đều xanh và cách nhau một nhịp đủ dài để test kịp bấm Dừng ở
# GIỮA lượt — đúng tình huống của chủ sản phẩm ("đang gen dở"). Không job đỏ vì các ca
# này đo "cái đã xong có được giữ sạch không", đỏ chỉ làm nhiễu.
#
# Cùng giao diện với gen.sh thật: neo theo thư mục chứa script, đọc styles.json cạnh
# script (agent ĐÃ thu hẹp file này về đúng tập job của lượt), in "prompt → …" / "OK  …".
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw prompts logs kits
STEP="${KITGEN_FAKE_STEP:-0.8}"
# `tr -d '\r'`: KHONG PHAI trang tri. `print()` cua Python tren Windows dich "\n" thanh
# "\r\n" KE CA khi stdout la pipe, nen ten job den tay bash dinh mot ky tu \r o duoi.
# Do that tren runner (run 31987956355, buoc "Ban mo engine gia"): engine in ra
# `OK  tet-main<CR>  8.0K` va `prompt -> prompts/tet-main<CR>.txt`. gen.sh THAT
# (kit-gen/gen.sh dong 512) co Y HET cau truc nay va PHAI duoc va y het — xem
# docs/WINDOWS-PORT.md muc 4.5. Fixture giu dung hinh dang cua ban that, ke ca ban va.
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
  echo "prompt → prompts/${j}.txt (+1 ảnh kèm)"
  echo "fake prompt for ${j}" > "prompts/${j}.txt"
  echo "fake log for ${j}" > "logs/${j}.log"
  sleep "$STEP"
  printf 'PNGFAKE' > "raw/${j}.png"
  echo "OK  ${j}  8.0K"
done
echo "Xong $(date +%H:%M:%S)"
