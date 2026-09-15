#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: MÁY VẼ QUÁ TẢI LÀ MỘT TRẠNG THÁI, KHÔNG PHẢI MỘT BẢN ÁN.
#
# SỰ CỐ 15/09/2026 — run r-0059, job `chinh-ui2`. Codex chạy 223 giây rồi chết với
# đúng hai dòng «ERROR: Selected model is at capacity. Please try a different model.»
# Không một ảnh nào được sinh, không một đồng quota nào bị tiêu — mà job vẫn đỏ, và
# banner chỉ nói được "1/2 job lỗi chưa rõ nguyên nhân". Chủ sản phẩm nói nó hay xảy
# ra nhất khi bấm vẽ lại CẢ THẺ: nhiều lượt liên tiếp đập vào cùng một model.
#
# Hai lời hứa được ca này canh, và chúng KHÔNG thể tách rời:
#   ① thử lại có lùi (20s · 45s · 90s) với CÙNG model — không lách sang model khác,
#     vì `gpt-5.6-luna` là lựa chọn có chủ đích chứ không phải mặc định tình cờ;
#   ② hết lượt thử vẫn hỏng ⇒ job FAIL, và `diagnose` của agent phải đọc ra
#     MODEL_BUSY chứ không phải UNKNOWN (ca ấy nằm ở `node agent/test-agent.mjs`).
#
# Ca này TRÍCH nguyên hàm run_one từ gen.sh rồi chạy với codex giả — sửa gen.sh mà
# làm hỏng vòng thử lại là ca này đỏ. Không gọi mạng, không tiêu quota, và
# GEN_BUSY_BACKOFF="0 0 0" nên nó không ngồi chờ một giây thật nào.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
check() { # <nhãn> <mong đợi> <thực tế>
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"
  else printf 'LỖI %s\n  mong đợi: %s\n  thực tế : %s\n' "$1" "$2" "$3" >&2; fail=1; fi
}
expect() { # <nhãn> <chuỗi phải có trong output> <output>
  case "$3" in
    *"$2"*) printf 'ok   %s\n' "$1" ;;
    *) printf 'LỖI %s\n  mong có: %s\n  thực tế: %s\n' "$1" "$2" "$3" >&2; fail=1 ;;
  esac
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-busy.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p/prompts" "$WORK/p/raw" "$WORK/p/logs"
echo "một prompt ảnh" > "$WORK/p/prompts/job1.txt"
: > "$WORK/p/prompts/job1.att"

# codex giả.
#   $MODE=busy-then-ok : hai lượt đầu kêu quá tải, lượt thứ ba sinh ảnh thật.
#   $MODE=busy-forever : lượt nào cũng kêu quá tải, không bao giờ có ảnh.
# $CALLS đếm số lượt (file, vì mỗi lượt là một tiến trình riêng).
cat > "$WORK/bin/codex" <<'FAKE'
#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
echo "ARGV: $*" >> "$ARGV_LOG"
n=$(( $(cat "$CALLS") + 1 )); echo "$n" > "$CALLS"
case "$MODE" in
  busy-then-ok)
    if [ "$n" -ge 3 ]; then
      printf 'anh-moi-%s' "$n" > raw/job1.png
      echo "saved raw/job1.png"
      exit 0
    fi ;;
esac
echo "ERROR: Selected model is at capacity. Please try a different model."
exit 1
FAKE
chmod +x "$WORK/bin/codex"

run_case() { # <MODE> [biến môi trường thêm] → in output của run_one
  MODE="$1"; shift
  ARGV_LOG="$WORK/argv.txt"; : > "$ARGV_LOG"
  CALLS="$WORK/calls.txt"; echo 0 > "$CALLS"
  rm -f "$WORK/p/raw/job1.png" "$WORK/p/logs/job1.log"
  ( cd "$WORK/p"
    export PATH="$WORK/bin:$PATH" MODE ARGV_LOG CALLS
    env "$@" /bin/bash -s <<INNER 2>/dev/null
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
calls() { cat "$WORK/calls.txt"; }

echo "── quá tải hai lần rồi vẽ được ⇒ job OK, không ai phải bấm lại"
out="$(run_case busy-then-ok GEN_BUSY_BACKOFF="0 0 0")"
check "gọi codex đúng 3 lượt (1 lần đầu + 2 lần thử lại)" "3" "$(calls)"
expect "job kết thúc OK" "OK  job1" "$out"
n=$(grep -c 'model quá tải — thử lại lần' "$WORK/p/logs/job1.log")
check "log job có đúng 2 dòng thử lại" "2" "$n"
grep -q 'thử lại lần 1 sau 0s' "$WORK/p/logs/job1.log" \
  && grep -q 'thử lại lần 2 sau 0s' "$WORK/p/logs/job1.log" \
  && printf 'ok   đếm lần thử lại 1,2 theo đúng thứ tự\n' \
  || { echo "LỖI log không đánh số lần thử lại" >&2; fail=1; }
expect "dòng ấy cũng ra stdout để lên UI (kèm tên job)" "job1: model quá tải" "$out"

echo "── CÙNG model, CÙNG ảnh đính ở mọi lượt — không lách sang model khác"
check "mọi lượt đều kèm -m gpt-5.6-luna" "3" "$(grep -c -- '-m gpt-5.6-luna' "$WORK/argv.txt")"
check "mọi lượt đều ghim effort medium" "3" "$(grep -c 'model_reasoning_effort="medium"' "$WORK/argv.txt")"

echo "── quá tải mãi ⇒ hết lượt thử thì FAIL (agent đọc log ra MODEL_BUSY)"
out="$(run_case busy-forever GEN_BUSY_BACKOFF="0 0 0")"
check "1 lần đầu + 3 lần thử lại = 4" "4" "$(calls)"
expect "vẫn phải FAIL, không giả vờ xong" "FAIL job1" "$out"
grep -qi 'at capacity' "$WORK/p/logs/job1.log" \
  && printf 'ok   bằng chứng «at capacity» còn nguyên trong log cho agent đọc\n' \
  || { echo "LỖI log mất bằng chứng capacity" >&2; fail=1; }

echo "── GEN_BUSY_RETRIES=0 ⇒ tắt hẳn vòng thử lại (đường chạy cũ, y nguyên)"
out="$(run_case busy-forever GEN_BUSY_RETRIES=0)"
check "chỉ gọi codex một lần" "1" "$(calls)"
expect "FAIL ngay" "FAIL job1" "$out"

echo "── GEN_BUSY_RETRIES=1 ⇒ đúng một lần thử thêm"
out="$(run_case busy-forever GEN_BUSY_RETRIES=1 GEN_BUSY_BACKOFF="0")"
check "1 lần đầu + 1 lần thử lại = 2" "2" "$(calls)"

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết sự cố gốc (r-0059)." >&2; exit 1; }
echo "OK  gen.sh: model quá tải ⇒ ngủ rồi gọi lại cùng model, hết lượt thử mới FAIL"
