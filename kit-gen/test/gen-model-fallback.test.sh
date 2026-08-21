#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: chọn model rẻ cho lượt sinh ảnh, và HẠ XUỐNG model hồ sơ khi bị từ chối.
#
# VÌ SAO PHẢI CÓ CA NÀY
#   Truyền `-m <model>` là đặt cược vào một thứ NGOÀI TẦM KIỂM SOÁT: provider của người
#   dùng có chịu phục vụ model đó hay không. Đoán sai thì hỏng CẢ LƯỢT — đúng loại sự cố
#   "10/10 job không ghi được ảnh" ngày 20/08/2026. Nên nhánh hạ cấp phải được chứng
#   minh bằng máy, không phải bằng niềm tin.
#
#   Ca này KHÔNG chép lại logic: nó TRÍCH nguyên hàm `run_one` từ gen.sh rồi chạy, nên
#   sửa gen.sh mà quên nhánh fallback là ca này đỏ.
#
# codex GIẢ: không gọi mạng, không tiêu quota, không sinh ảnh thật.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
check() { # <nhãn> <mong đợi> <thực tế>
  if [ "$2" = "$3" ]; then printf 'ok   %s\n' "$1"
  else printf 'LỖI %s\n  mong đợi: %s\n  thực tế : %s\n' "$1" "$2" "$3" >&2; fail=1; fi
}

# Dựng một project tối thiểu đúng như run_one cần đọc.
WORK="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-model.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p/prompts" "$WORK/p/raw" "$WORK/p/logs"
echo "một prompt ảnh" > "$WORK/p/prompts/job1.txt"
: > "$WORK/p/prompts/job1.att"

# codex giả. $MODE quyết định nó cư xử thế nào.
cat > "$WORK/bin/codex" <<'FAKE'
#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
echo "ARGV: $*" >> "$ARGV_LOG"
case "$MODE" in
  ok)      exit 0 ;;
  # Từ chối khi có -m, chấp nhận khi không có: đúng cảnh provider tuỳ biến.
  reject)  case " $* " in *" -m "*) echo "unknown model requested" ; exit 1 ;; esac; exit 0 ;;
  # Hỏng vì lý do KHÁC model — không được phép thử lại.
  other)   echo "429 rate limit"; exit 1 ;;
esac
FAKE
chmod +x "$WORK/bin/codex"

run_case() { # <MODE> [biến môi trường thêm] → in số lần gọi codex exec
  MODE="$1"; shift
  ARGV_LOG="$WORK/argv.txt"; : > "$ARGV_LOG"
  rm -f "$WORK/p/raw/job1.png"
  ( cd "$WORK/p"
    export PATH="$WORK/bin:$PATH" MODE ARGV_LOG
    # shellcheck disable=SC2034
    ROOT="$WORK/p"; ROOT_OUT="$WORK/p"; IMG_HOME=""
    env "$@" /bin/bash -s <<INNER >/dev/null 2>&1
set -uo pipefail
ROOT="$WORK/p"; ROOT_OUT="\$ROOT"; IMG_HOME=""
mtime_epoch(){ stat -c %Y "\$1" 2>/dev/null || stat -f %m "\$1" 2>/dev/null || echo 0; }
$(sed -n '/^GEN_MODEL=/,/^fi$/p' "$HERE/gen.sh" | head -20)
$(sed -n '/^run_one() {/,/^}$/p' "$HERE/gen.sh")
run_one job1
INNER
  )
  grep -c '^ARGV:' "$ARGV_LOG" 2>/dev/null || echo 0
}

echo "── model có, provider nhận ⇒ gọi 1 lần, có -m"
n=$(run_case ok)
check "chỉ gọi codex một lần" "1" "$n"
grep -q -- '-m gpt-5.6-luna' "$WORK/argv.txt" && printf 'ok   argv có -m gpt-5.6-luna\n' || { echo "LỖI argv thiếu -m" >&2; fail=1; }
grep -q 'model_reasoning_effort="medium"' "$WORK/argv.txt" && printf 'ok   argv có effort medium\n' || { echo "LỖI argv thiếu effort" >&2; fail=1; }

echo "── provider TỪ CHỐI model ⇒ phải chạy lại KHÔNG có -m"
n=$(run_case reject)
check "gọi hai lần (lần đầu + hạ cấp)" "2" "$n"
tail -1 "$WORK/argv.txt" | grep -q -- '-m ' && { echo "LỖI lần chạy lại vẫn kèm -m" >&2; fail=1; } || printf 'ok   lần chạy lại đã bỏ -m\n'

echo "── hỏng vì lý do khác (429) ⇒ KHÔNG được thử lại"
n=$(run_case other)
check "chỉ gọi một lần" "1" "$n"

echo "── KITGEN_GEN_MODEL='' ⇒ không truyền model nào"
n=$(run_case ok KITGEN_GEN_MODEL=)
grep -q -- '-m ' "$WORK/argv.txt" && { echo "LỖI vẫn truyền -m dù đã tắt" >&2; fail=1; } || printf 'ok   tắt được bằng biến môi trường\n'

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết vì sao có ca này." >&2; exit 1; }
echo "OK  gen.sh: chọn model + hạ cấp khi bị từ chối đều đúng"
