#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# BACKLOG #23 — "GÓI CHƯA CÓ TRÊN SERVER" PHẢI LÀ MỘT CÂU, KHÔNG PHẢI MỘT MÃ CURL.
#
# Hiện trường 14/08 14:28: `release.json` đã khai 2.1.22 nhưng workflow phát hành còn
# đang chạy, nên `kitgen update` tải về một trang 404 và chết bằng đúng một dòng
# `curl: (22) ... 404`. Web đợi 90 giây rồi đổ tội cho bước khởi động lại.
#
# Ba mệnh đề bị khoá ở đây:
#   ① 404/403/410 ⇒ mã thoát 21 + câu "ĐANG ĐƯỢC ĐÓNG GÓI" gọi ĐÚNG TÊN BẢN + lệnh
#      thử lại, và có ghi vào install.log (lượt do UI bấm còn được agent đổ thẳng
#      stdout/stderr vào update.log);
#   ② lỗi mạng/5xx là chuyện KHÁC ⇒ mã thoát 20, không được nói dối là "đang đóng gói";
#   ③ .tar.gz có mà .sha256 chưa có (bản phát hành upload được một nửa) ⇒ vẫn là ①.
#
# Không đụng tới mạng thật: một `python3 -m http.server` trên 127.0.0.1 đóng vai
# GitHub Releases, và cổng chết đóng vai "mất mạng".
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-download-test.XXXXXX")"
SERVER_PID=""
cleanup(){
  [ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT INT TERM

export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_WORKSPACE="$HOME/KitGen"
mkdir -p "$KITGEN_HOME" "$KITGEN_WORKSPACE" "$TEST_ROOT/www"

# Cổng tự chọn: chạy song song với bộ test khác không được đụng nhau.
PORT=0
for candidate in $(seq 18760 18860); do
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$candidate") 2>/dev/null; then PORT="$candidate"; break; fi
done
[ "$PORT" != 0 ] || { echo "không tìm được cổng trống cho server giả" >&2; exit 1; }
DEAD_PORT=$((PORT + 1))

(cd "$TEST_ROOT/www" && exec python3 -m http.server "$PORT" --bind 127.0.0.1) >/dev/null 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null && break
  sleep 0.2
done

run_install(){   # run_install <out-file> <args...>
  _out="$1"; shift
  set +e
  "$ROOT/install.sh" "$@" >"$_out" 2>&1
  status=$?
  set -e
}

fail(){ echo "$1" >&2; shift; for f in "$@"; do echo "--- $f"; cat "$f"; done >&2; exit 1; }

# ── ① Tarball chưa tồn tại ⇒ mã 21 + câu tiếng người ──────────────────────────
OUT1="$TEST_ROOT/pending.out"
run_install "$OUT1" --update \
  --release-url "http://127.0.0.1:$PORT/kitgen-runtime-9.9.9.tar.gz"

[ "$status" -eq 21 ] || fail "gói chưa có trên server phải thoát 21, nhận $status" "$OUT1"
grep -q 'ĐANG ĐƯỢC ĐÓNG GÓI' "$OUT1" || fail "không nói ra là bản đang được đóng gói" "$OUT1"
grep -q '9\.9\.9' "$OUT1" || fail "không gọi đúng tên bản (moi từ tên file archive)" "$OUT1"
grep -q "$KITGEN_HOME/bin/kitgen update" "$OUT1" || fail "không đưa lệnh thử lại" "$OUT1"
grep -q 'KHÔNG bị đụng tới' "$OUT1" || fail "không trấn an là bản đang chạy còn nguyên" "$OUT1"
grep -q 'ĐANG ĐƯỢC ĐÓNG GÓI' "$KITGEN_HOME/install.log" \
  || fail "sự cố không để lại dấu vết nào trên đĩa" "$OUT1"

# ── ② Mạng hỏng là chuyện khác ⇒ mã 20, KHÔNG được nói "đang đóng gói" ────────
OUT2="$TEST_ROOT/offline.out"
run_install "$OUT2" --update \
  --release-url "http://127.0.0.1:$DEAD_PORT/kitgen-runtime-9.9.9.tar.gz"

[ "$status" -eq 20 ] || fail "lỗi mạng phải thoát 20, nhận $status" "$OUT2"
grep -q 'ĐANG ĐƯỢC ĐÓNG GÓI' "$OUT2" && fail "đổ oan cho CI trong khi thật ra là mất mạng" "$OUT2"
grep -q 'Không tải được' "$OUT2" || fail "không nói ra là tải hỏng" "$OUT2"

# ── ③ Có .tar.gz nhưng CHƯA có .sha256 (upload được một nửa) ⇒ vẫn là ① ───────
printf 'not-a-real-archive\n' > "$TEST_ROOT/www/kitgen-runtime-9.9.9.tar.gz"
OUT3="$TEST_ROOT/half.out"
run_install "$OUT3" --update \
  --release-url "http://127.0.0.1:$PORT/kitgen-runtime-9.9.9.tar.gz"

[ "$status" -eq 21 ] || fail "bản phát hành thiếu checksum phải thoát 21, nhận $status" "$OUT3"
grep -q 'file checksum' "$OUT3" || fail "không nói rõ thứ còn thiếu là file checksum" "$OUT3"

# ── ④ Đường thuận vẫn phải đi qua được bước tải ───────────────────────────────
# Gói giả không phải runtime hợp lệ, nên installer PHẢI hỏng ở bước sau đó — miễn là
# KHÔNG hỏng ở bước tải nữa (đó mới là thứ đang được đo).
shasum -a 256 "$TEST_ROOT/www/kitgen-runtime-9.9.9.tar.gz" | awk '{print $1}' \
  > "$TEST_ROOT/www/kitgen-runtime-9.9.9.tar.gz.sha256"
OUT4="$TEST_ROOT/ok.out"
run_install "$OUT4" --update \
  --release-url "http://127.0.0.1:$PORT/kitgen-runtime-9.9.9.tar.gz"

case "$status" in
  20|21) fail "tải được rồi mà vẫn báo lỗi tải (mã $status)" "$OUT4" ;;
esac
grep -q 'ĐANG ĐƯỢC ĐÓNG GÓI' "$OUT4" && fail "tải xong rồi mà vẫn nói đang đóng gói" "$OUT4"

echo "install-download: chưa upload ⇒ 21 + câu tiếng người · mất mạng ⇒ 20 · thiếu checksum ⇒ 21 · tải được thì đi tiếp"
