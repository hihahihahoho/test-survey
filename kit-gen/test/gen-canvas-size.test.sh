#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh: KHỔ ẢNH LÀ CON SỐ TRUYỀN THẲNG CHO MODEL, KHÔNG PHẢI LỜI ĐỀ NGHỊ.
#
# SỰ CỐ: người dùng báo ảnh dán vào Figma bị "kéo cao lên". Nguyên nhân ở phía sinh
# ảnh, không phải phía hiển thị: một sheet KHAI NGANG mà model trả về ảnh DỌC. Cắt
# lưới trên khổ sai thì mọi ô đều méo — và trước bản vá `orientation_error` của
# slice.py thì nó méo LẶNG LẼ, ảnh vẫn ra bình thường, chỉ sai tỉ lệ.
#
# Câu lệnh cũ mời model làm đúng chuyện đó: nó bảo "theo CANVAS ORIENTATION ghi ở
# dòng đầu prompt (1536x1024 landscape hoặc 1024x1536 portrait, IF SUPPORTED)".
#   · bắt model tự đi tìm một dòng trong khối chữ dài, và
#   · "if supported" là một đường lui hoàn toàn hợp lệ để trả về khổ khác.
#
# Nay gen.sh ĐỌC khổ ra từ chính prompt rồi nhắc lại thành SỐ ngay câu đầu của task.
# Ca này trích hàm `run_one` thật ra chạy với codex giả (codex giả chỉ ghi lại đối
# số nó nhận được) và soi đúng chuỗi đó. Không gọi mạng, không tiêu quota.
#
# Ca đắt nhất là ca PHỦ ĐỊNH cuối cùng: chuỗi "if supported" không được phép quay
# lại. Nó là dạng hồi quy sẽ không làm ca nào khác đỏ.
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
expect() { # <nhãn> <chuỗi phải có> <output>
  case "$3" in
    *"$2"*) printf 'ok   %s\n' "$1" ;;
    *) printf 'LOI  %s\n  mong có: %s\n  thực tế: %s\n' "$1" "$2" "$3" >&2; fail=1 ;;
  esac
}
refute() { # <nhãn> <chuỗi KHÔNG được có> <output>
  case "$3" in
    *"$2"*) printf 'LOI  %s\n  không được có: %s\n' "$1" "$2" >&2; fail=1 ;;
    *) printf 'ok   %s\n' "$1" ;;
  esac
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-canvas.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/p/prompts" "$WORK/p/raw" "$WORK/p/logs"

# codex giả: chỉ chép nguyên khối task (đối số cuối) ra đĩa để ca soi, rồi ghi một
# ảnh mới để `run_one` phán OK và không rẽ vào nhánh tự chữa.
cat > "$WORK/bin/codex" <<'FAKE'
#!/bin/sh
if [ "$1" = "debug" ]; then echo '{"models":[{"slug":"gpt-5.6-luna"}]}'; exit 0; fi
for a in "$@"; do last="$a"; done
printf '%s' "$last" > logs/task.txt
printf 'anh-%s' "$$" > "raw/$JOB.png"
exit 0
FAKE
chmod +x "$WORK/bin/codex"

run_case() { # <job> → in khối task mà codex nhận được
  ( cd "$WORK/p"
    export PATH="$WORK/bin:$PATH" JOB="$1"
    /bin/bash -s >/dev/null 2>&1 <<INNER
set -uo pipefail
ROOT="$WORK/p"; ROOT_OUT="\$ROOT"; IMG_HOME=""
$(sed -n '/^mtime_epoch()/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^file_hash()/,/^}$/p' "$HERE/gen.sh")
$(sed -n '/^GEN_MODEL=/,/^fi$/p' "$HERE/gen.sh" | head -20)
$(sed -n '/^run_one() {/,/^}$/p' "$HERE/gen.sh")
run_one "$1"
INNER
    cat logs/task.txt )
}

echo "── sheet khai NGANG"
printf 'Canvas orientation: LANDSCAPE 1536x1024.\nmore prompt\n' > "$WORK/p/prompts/wide.txt"
: > "$WORK/p/prompts/wide.att"
out="$(run_case wide)"
expect "nêu đích danh 1536x1024"        "exactly 1536x1024 pixels" "$out"
expect "nói rõ là landscape"            "(landscape)"              "$out"
expect "nói rõ đây là ràng buộc cứng"   "hard requirement"         "$out"
refute "không lẫn sang khổ dọc"         "1024x1536"                "$out"

echo "── sheet khai DỌC"
printf 'Canvas orientation: PORTRAIT 1024x1536.\nmore prompt\n' > "$WORK/p/prompts/tall.txt"
: > "$WORK/p/prompts/tall.att"
out="$(run_case tall)"
expect "nêu đích danh 1024x1536"        "exactly 1024x1536 pixels" "$out"
expect "nói rõ là portrait"             "(portrait)"               "$out"
refute "không lẫn sang khổ ngang"       "1536x1024"                "$out"

echo "── prompt không khai gì ⇒ rơi về NGANG (mặc định của engine), không phải im lặng"
printf 'no orientation line here\n' > "$WORK/p/prompts/mute.txt"
: > "$WORK/p/prompts/mute.att"
out="$(run_case mute)"
expect "vẫn phát ra một khổ cụ thể"     "exactly 1536x1024 pixels" "$out"

echo "── đường lui 'if supported' không được phép quay lại"
refute "task không còn hedge nào"       "if supported"             "$out"
# Quét MÃ, không quét chú thích: chính file gen.sh có một dòng chú thích trích lại câu
# cũ để đời sau biết vì sao nó bị bỏ. `sed 's/#.*//'` là cùng một mẹo mà
# test/engine-empty-array.test.sh đã phải dùng, vì cùng một lý do.
refute "gen.sh không còn hedge trong MÃ"   "if supported" "$(sed 's/#.*//' "$HERE/gen.sh")"
# cover.sh mang y hệt câu lệnh đó, và ảnh bìa còn nhạy khổ hơn sheet: nó bị cắt dải
# giữa 3:2 → 16:9, model trả khổ khác là mất đầu nhân vật.
refute "cover.sh cũng không còn"           "if supported" "$(sed 's/#.*//' "$HERE/cover.sh")"
expect "cover.sh nêu đích danh khổ"        "exactly 1536x1024 pixels" "$(cat "$HERE/cover.sh")"

[ "$fail" -eq 0 ] || { echo; echo "Xem đầu file test này để biết sự cố gốc." >&2; exit 1; }
echo "OK  gen.sh: khổ ảnh đi tới model dưới dạng số, không kèm đường lui"
