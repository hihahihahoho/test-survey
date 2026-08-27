#!/usr/bin/env bash
# ENGINE GIẢ CHO TEST — cùng giao diện với gen.sh thật:
#   · neo đường dẫn theo THƯ MỤC CHỨA SCRIPT (cd dirname $0), đúng như gen.sh dòng 5
#   · đọc styles.json cạnh script, job = style × sheet (tôn trọng sheet.styles)
#   · in "prompt → prompts/<job>.txt", "OK  <job>", "FAIL <job> (...)"; ghi raw/<job>.png
#   · dùng heredoc python như gen.sh, không cần file phụ
# KHÁC: KHÔNG gọi codex ⇒ KHÔNG TỐN QUOTA. Chỉ để test pipeline của agent.
set -uo pipefail
cd "$(dirname "$0")"
mkdir -p raw prompts logs kits
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
  # Prompt giả CỐ Ý mang một đường dẫn tuyệt đối + một dòng khổ giấy như bản thật:
  # cửa /prompt-preview phải redact được path (đối xứng với khoá giả nhét vào log ở
  # nhánh *bg-home bên dưới), và phải trả về đúng phần chữ chứ không phải tên file.
  {
    echo "Canvas orientation: LANDSCAPE 1536x1024."
    echo "fake prompt for ${j}"
    echo "duong dan tuyet doi cua engine gia: ${PWD}/raw/${j}.png"
  } > "prompts/${j}.txt"
  # .att chỉ còn ẢNH CỦA NGƯỜI DÙNG. Bản thật từng đặt `skeleton/<sheet>.png` ở dòng
  # đầu; khung xương bỏ 27/08/2026 nên fixture phải khai đúng hình dạng mới, không thì
  # ca prompt-preview xanh trên một hợp đồng đã chết.
  echo "refs/${j#*-}.png" > "prompts/${j}.att"
  echo "fake log for ${j}" > "logs/${j}.log"
  # ĐÚNG CHỖ DỪNG CỦA BẢN THẬT: gen.sh thoát ngay sau khi dựng xong prompt/.att, TRƯỚC
  # vòng gọi codex. Fixture phải dừng ở đúng đó thì ca prompt-preview mới chứng minh
  # được là agent không hề đợi một lượt vẽ nào.
  [ -n "${KITGEN_PROMPTS_ONLY:-}" ] && continue
  case "$j" in
    *bg-home)
      # BACKLOG #22 — job lỗi phải để lại BẰNG CHỨNG, đúng hình dạng ca thật đã gặp:
      # `rc=127` (codex không có trên PATH) chứ không chỉ "ảnh không được ghi".
      # Ba dòng này cố tình mang một khoá giả VÀ một đường dẫn tuyệt đối để test
      # chứng minh `errorTail` đã đi qua redactLine (che khoá + rút gọn path).
      {
        echo "codex: command not found (PATH=${PWD}/bin)"
        echo "api_key=sk-KITGENTESTKEY0123456789 rejected"
        echo "rc=127 — ảnh không được ghi mới"
      } | tee -a "logs/${j}.log" >&2
      echo "FAIL ${j} (rc=127, ảnh không được ghi mới — xem logs/${j}.log)"
      continue ;;
  esac
  printf 'PNGFAKE' > "raw/${j}.png"
  echo "OK  ${j}  8.0K"
  # NHỊP GIỮA HAI TẤM. Engine thật mất hàng PHÚT cho mỗi tấm — cả giá trị của "cắt lũy
  # tiến" nằm ở khoảng trống đó. Fixture chạy trong 5ms thì mọi thứ xảy ra "cùng lúc"
  # và test không phân biệt nổi bản cắt-ngay với bản cắt-cuối-lượt. 0.4s là đủ để chu
  # trình per-sheet (cắt + thumbnail + sheet.ready) của tấm trước xong TRƯỚC khi tấm
  # sau gen xong, tức là đúng thứ tự mà bản thật sẽ có.
  sleep 0.4
done
echo "Xong $(date +%H:%M:%S)"
