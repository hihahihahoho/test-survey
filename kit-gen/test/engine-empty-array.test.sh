#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# gen.sh / cover.sh: KHÔNG được expand mảng có thể RỖNG mà không có bọc.
#
# SỰ CỐ 20/08/2026 — hỏng 100% lượt gen của người dùng hồ sơ Codex mặc định.
#   gen.sh:658 viết  "${codex_env[@]}" codex exec …
#   `codex_env` rỗng khi IMG_HOME rỗng, tức là khi user KHÔNG chọn hồ sơ ảnh riêng.
#   bash của macOS là 3.2.57, và bash 3.2 + `set -u` coi expand mảng rỗng là
#   "unbound variable" ⇒ script chết ngay dòng đó, rc=127, codex chưa chạy lần nào.
#   UI chỉ nói được "chạy xong nhưng ảnh không được ghi" — trùng hệt triệu chứng của
#   ca thiếu codex trên PATH, nên mất một vòng chẩn đoán mới ra.
#   Ai chọn hồ sơ riêng (~/.codex-img) thì mảng không rỗng ⇒ KHÔNG BAO GIỜ thấy lỗi.
#   Cả đội dev đều dùng hồ sơ riêng. Đó là lý do nó lọt.
#
# VÌ SAO LÀ KIỂM TĨNH
#   Chạy thật gen.sh cần codex + node + resvg-wasm + python3 và tiêu quota thật.
#   Lỗi này lại thuần cú pháp, thấy được bằng mắt trên văn bản — nên soi văn bản.
#   Kiểm này KHÔNG thay được smoke test; nó chỉ đảm bảo không ai viết lại đúng lỗi cũ.
#
# LUẬT
#   Mọi `${TÊN[@]}` / `${TÊN[*]}` phải hoặc là dạng bọc `${TÊN[@]+"${TÊN[@]}"}`,
#   hoặc thuộc một mảng mà file có kiểm rỗng tường minh `${#TÊN[@]}` ở đâu đó
#   (ví dụ FILTERS: `[[ ${#FILTERS[@]} -eq 0 ]] && return 0` trước vòng lặp).
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
note() { printf '%s\n' "$*" >&2; }

for f in gen.sh cover.sh; do
  [ -f "$f" ] || { note "THIẾU FILE: $f"; fail=1; continue; }

  # Kiểm này chỉ có nghĩa khi nounset đang bật.
  grep -q '^set -[a-z]*u' "$f" || { note "$f: không còn 'set -u' — sửa lại test này cho khớp thực tế"; fail=1; }

  # Tên mảng có kiểm rỗng tường minh ${#TÊN[@]} ở bất kỳ đâu trong file.
  counted="$(grep -o '\${#[A-Za-z_][A-Za-z_0-9]*\[@\]}' "$f" | sed 's/\${#//; s/\[@\]}//' | sort -u)"

  while IFS=: read -r lineno line; do
    [ -n "$lineno" ] || continue
    name="$(printf '%s' "$line" | sed -n 's/.*\${\([A-Za-z_][A-Za-z_0-9]*\)\[[@*]\]}.*/\1/p' | head -n1)"
    [ -n "$name" ] || continue
    # Dạng bọc `${TÊN[@]+ …}` là an toàn tuyệt đối, bỏ qua.
    grep -qF "\${$name[@]+" <<<"$line" && continue
    # Có kiểm rỗng tường minh ở nơi khác thì chấp nhận.
    grep -qx "$name" <<<"$counted" && continue
    note "$f:$lineno  expand mảng '$name' không bọc — bash 3.2 + set -u sẽ nổ khi mảng rỗng"
    note "    $line"
    note "    sửa thành: \${$name[@]+\"\${$name[@]}\"}"
    fail=1
    # `sed 's/#.*//'` bỏ chú thích TRƯỚC khi soi: chính lời giải thích của bản vá có
    # trích dạng sai làm ví dụ, không lọc thì test tự bắt lỗi văn xuôi của mình.
  done < <(sed 's/#.*//' "$f" | grep -n '\${[A-Za-z_][A-Za-z_0-9]*\[[@*]\]}')
done

if [ "$fail" -ne 0 ]; then
  note ""
  note "Xem đầu file test này để biết sự cố gốc."
  exit 1
fi
echo "OK  gen.sh/cover.sh: không có expand mảng rỗng nào không bọc"
