#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: CỔNG ALPHA KHÔNG ĐƯỢC PHẠT OAN TẤM NỀN FULL-BLEED.
#
# MÂU THUẪN GỐC — hai câu của cùng một engine đá nhau:
#   · prompt của tấm full-bleed ra lệnh: "NOT ONE PIXEL of empty transparent
#     background may show around a scene" (khối `place` trong khối python);
#   · `alpha_verdict` lại phán FAIL khi "alpha=0 chỉ 0,00%" ⇒ "model vẽ đè kín nền".
# Tức tấm nào làm ĐÚNG hợp đồng cũng bị đóng dấu hỏng, kèm một lời buộc tội sai hẳn
# nguyên nhân. Phép ③ (dải mờ) cũng vậy: cảnh đục kín thì không có dải mờ nào.
#
# BẢN VÁ: khối python đánh dấu `prompts/<job>.fullbleed`, run_one truyền cờ đó vào
# alpha_verdict, và với tấm full-bleed thì phép kiểm LẬT NGƯỢC — trong suốt NHIỀU
# mới là hỏng (cảnh bị vẽ thụt vào, chừa khung rỗng quanh cạnh).
#
# Ca trích nguyên `alpha_verdict` + `run_one` từ gen.sh rồi chạy với codex giả.
# Không gọi mạng, không tiêu quota.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PY="${KITGEN_PYTHON:-python3}"

# Không có Pillow thì alpha_verdict trả "skip" cho MỌI ảnh — ca này mất hết khả năng
# phân biệt. Nói thẳng ra rồi thoát 0: một ca không chạy được phải TỰ KHAI, chứ không
# được giả vờ xanh bằng cách khẳng định những thứ nó không đo.
if ! "$PY" -c "import PIL" 2>/dev/null; then
  echo "BỎ QUA  gen-fullbleed-alpha: máy này không có Pillow ⇒ alpha_verdict luôn trả 'skip'."
  exit 0
fi

fail=0
expect() { # <nhãn> <chuỗi phải có> <output>
  case "$3" in
    *"$2"*) printf 'ok   %s\n' "$1" ;;
    *) printf 'LOI  %s\n  mong có: %s\n  thực tế: %s\n' "$1" "$2" "$3" >&2; fail=1 ;;
  esac
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-fullbleed.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p/prompts" "$WORK/p/raw" "$WORK/p/logs"
echo "Canvas orientation: LANDSCAPE 1536x1024." > "$WORK/p/prompts/job1.txt"
: > "$WORK/p/prompts/job1.att"

# Ba tấm ảnh mẫu, khác nhau đúng ở kênh alpha:
#   kin.png    — RGBA đục hoàn toàn (alpha=255 khắp nơi): tấm nền LÀM ĐÚNG hợp đồng,
#                và cũng chính là thứ mà cổng cũ đánh trượt.
#   rong.png   — 50% pixel alpha=0: cảnh bị vẽ thụt vào, chừa khung rỗng.
#   ui.png     — ảnh của tấm UI thường: có nền trong suốt + dải mờ liên tục.
"$PY" - "$WORK" <<'PYGEN'
import sys
from PIL import Image
w = sys.argv[1]
Image.new("RGBA", (64, 64), (200, 80, 40, 255)).save(f"{w}/kin.png")
rong = Image.new("RGBA", (64, 64), (200, 80, 40, 255))
for y in range(32):
    for x in range(64):
        rong.putpixel((x, y), (0, 0, 0, 0))
rong.save(f"{w}/rong.png")
ui = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
for y in range(64):
    for x in range(64):
        # thân đặc ở giữa, viền tan dần ra 0 ⇒ có cả alpha=0 lẫn dải mờ liên tục
        d = max(abs(x - 32), abs(y - 32))
        ui.putpixel((x, y), (30, 120, 220, 255 if d < 12 else max(0, 255 - (d - 12) * 24)))
ui.save(f"{w}/ui.png")
PYGEN

# codex giả: chép đúng tấm mẫu mà ca đang thử vào đích.
cat > "$WORK/bin/codex" <<'FAKE'
#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
cp "$SRC" raw/job1.png
exit 0
FAKE
chmod +x "$WORK/bin/codex"

run_case() { # <ảnh mẫu> → in output của run_one
  rm -f "$WORK/p/raw/job1.png"          # h0 rỗng ⇒ ảnh nào cũng là ảnh mới
  ( cd "$WORK/p"
    export PATH="$WORK/bin:$PATH" SRC="$WORK/$1"
    /bin/bash -s <<INNER 2>/dev/null
set -uo pipefail
ROOT="$WORK/p"; ROOT_OUT="\$ROOT"; IMG_HOME=""
$(sed -n '/^mtime_epoch()/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^file_hash()/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^PY_CHECK=/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^GEN_MODEL=/,/^fi$/p' "$HERE/gen.sh" | head -20)
$(sed -n '/^run_one() {/,/^}$/p' "$HERE/gen.sh")
run_one job1
INNER
  )
}

echo "── tấm NỀN full-bleed, ảnh đục kín (đúng hợp đồng) ⇒ phải OK"
: > "$WORK/p/prompts/job1.fullbleed"
out="$(run_case kin.png)"
expect "không bị phạt oan"              "OK  job1"   "$out"
expect "nói rõ nó được xét theo luật full-bleed" "full-bleed" "$out"

echo "── vẫn tấm nền đó, nhưng cảnh bị vẽ thụt vào (50% trong suốt) ⇒ FAIL"
out="$(run_case rong.png)"
expect "bị bắt"                          "FAIL job1"  "$out"
expect "nói đúng nguyên nhân"            "phủ KÍN"    "$out"

echo "── KHÔNG có dấu full-bleed (tấm UI thường): luật cũ giữ nguyên từng chữ"
rm -f "$WORK/p/prompts/job1.fullbleed"
out="$(run_case kin.png)"
expect "ảnh đục ⇒ vẫn FAIL như trước"    "FAIL job1"  "$out"
expect "vẫn đúng câu buộc tội cũ"        "vẽ đè kín nền" "$out"

out="$(run_case ui.png)"
expect "ảnh có alpha thật ⇒ OK"          "OK  job1"   "$out"
expect "vẫn báo dải mờ như trước"        "dải mờ"     "$out"

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết mâu thuẫn gốc." >&2; exit 1; }
echo "OK  gen.sh: cổng alpha xét tấm full-bleed bằng luật của tấm full-bleed"
