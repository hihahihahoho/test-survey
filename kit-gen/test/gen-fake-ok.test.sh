#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: "OK" phải nghĩa là CÓ ẢNH MỚI, không phải "file vừa được sờ vào".
#
# SỰ CỐ 21/08/2026 — khi tool tạo ảnh bị chặn, model KHÔNG báo lỗi. Nó tự đi tìm
# artifact cũ của lượt trước, chép vào đúng đích, rồi trả lời như đã sinh ảnh thành
# công. mtime mới tinh ⇒ gen.sh gật đầu ⇒ người dùng nhận lại y nguyên ảnh cũ, còn
# hoá đơn thì vẫn tính. Hai lượt "OK" kiểu đó đốt 413.302 token mà không sinh ra một
# ảnh mới nào.
#
# Nên phép phán không đo mtime nữa mà so BĂM NỘI DUNG trước/sau. Byte không đổi =
# không có ảnh mới, dù file có được ghi lại bao nhiêu lần.
#
# Ca này TRÍCH nguyên hàm run_one từ gen.sh rồi chạy với codex giả — sửa gen.sh mà
# làm hỏng phép phán là ca này đỏ. Không gọi mạng, không tiêu quota.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
expect() { # <nhãn> <chuỗi phải có trong output> <output>
  case "$3" in
    *"$2"*) printf 'ok   %s\n' "$1" ;;
    *) printf 'LOI  %s\n  mong có: %s\n  thực tế: %s\n' "$1" "$2" "$3" >&2; fail=1 ;;
  esac
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-fakeok.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p/prompts" "$WORK/p/raw" "$WORK/p/logs"
echo "prompt" > "$WORK/p/prompts/job1.txt"
: > "$WORK/p/prompts/job1.att"

# codex giả. $MODE quyết định nó làm gì với raw/job1.png.
cat > "$WORK/bin/codex" <<'FAKE'
#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
case "$MODE" in
  # Model tử tế: ghi ảnh có nội dung MỚI.
  fresh) printf 'anh-moi-%s' "$(date +%s%N 2>/dev/null || date +%s)" > raw/job1.png ;;
  # Model gian: chép lại đúng ảnh cũ (mtime mới, byte y hệt) rồi báo thành công.
  copy)  touch raw/job1.png ;;
  # Không đụng gì tới đích.
  none)  : ;;
esac
exit 0
FAKE
chmod +x "$WORK/bin/codex"

run_case() { # <MODE> → in output của run_one
  MODE="$1"
  ( cd "$WORK/p"
    export PATH="$WORK/bin:$PATH" MODE
    /bin/bash -s <<INNER 2>/dev/null
set -uo pipefail
ROOT="$WORK/p"; ROOT_OUT="\$ROOT"; IMG_HOME=""
$(sed -n '/^mtime_epoch()/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^file_hash()/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^GEN_MODEL=/,/^fi$/p' "$HERE/gen.sh" | head -20)
$(sed -n '/^run_one() {/,/^}$/p' "$HERE/gen.sh")
run_one job1
INNER
  )
}

echo "── lần đầu, chưa có ảnh cũ ⇒ ảnh nào cũng là ảnh mới"
rm -f "$WORK/p/raw/job1.png"
out="$(run_case fresh)"; expect "sinh được ảnh đầu tiên ⇒ OK" "OK  job1" "$out"

echo "── model sinh ảnh MỚI đè lên ảnh cũ ⇒ OK"
out="$(run_case fresh)"; expect "nội dung đổi ⇒ OK" "OK  job1" "$out"

echo "── model CHÉP LẠI ảnh cũ (mtime mới, byte y hệt) ⇒ phải FAIL"
out="$(run_case copy)"
expect "bị bắt là ảnh cũ"              "FAIL job1" "$out"
expect "nói rõ lý do"                  "KHÔNG ĐỔI" "$out"

# Cùng một câu cho hai ca, CÓ CHỦ Ý: từ chỗ đứng của gen.sh, "model chép lại file cũ"
# và "model không đụng gì" là một — cả hai đều là KHÔNG CÓ ẢNH MỚI. Đoán bừa xem model
# đã làm gì rồi in ra một lời buộc tội cụ thể là tự đẻ ra thông tin sai.
echo "── model không ghi gì (ảnh cũ vẫn nằm đó) ⇒ cũng FAIL"
out="$(run_case none)"
expect "không có ảnh mới ⇒ FAIL"       "FAIL job1" "$out"
expect "cùng câu 'không đổi'"          "KHÔNG ĐỔI" "$out"

echo "── không có file đích nào ⇒ FAIL, câu khác hẳn"
rm -f "$WORK/p/raw/job1.png"
out="$(run_case none)"
expect "báo thiếu file"                "không có raw/job1.png" "$out"

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết sự cố gốc." >&2; exit 1; }
echo "OK  gen.sh: 'OK' chỉ được cấp khi thật sự có ảnh mới"
