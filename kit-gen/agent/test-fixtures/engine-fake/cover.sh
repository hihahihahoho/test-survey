#!/usr/bin/env bash
# COVER GIẢ CHO TEST — cùng giao diện với cover.sh thật:
#   · nhận thư mục project làm tham số 1 và ghi vào <project>/cover/cover.png
#   · đọc prompts/cover.txt do agent dựng (thiếu file ⇒ FAIL, y như bản thật)
#   · in "OK  cover …" / "FAIL cover (…)" và LUÔN exit 0 (lỗi bìa không phải lỗi run)
# KHÁC: KHÔNG gọi codex ⇒ KHÔNG TỐN QUOTA.
set -uo pipefail
PROJECT="${1:-}"
[[ -n "$PROJECT" && -d "$PROJECT" ]] || { echo "FAIL cover (thiếu thư mục project)"; exit 2; }
cd "$PROJECT" || exit 2
mkdir -p cover logs
if [[ ! -f "prompts/cover.txt" ]]; then
  echo "FAIL cover (thiếu prompts/cover.txt)"
  exit 0
fi
echo "fake cover log" > logs/cover.log
# Một vài ca cần chứng minh mỗi lượt chỉ kích cover một lần. Chỉ đếm khi prompt
# mang marker test, không làm thay đổi các ca fake bình thường.
if grep -q "COVER_FIXTURE_COUNT" prompts/cover.txt; then
  n=$(cat cover/fixture-count 2>/dev/null || echo 0)
  printf '%s' "$((n + 1))" > cover/fixture-count
fi
# Ca lỗi có kiểm được: prompt chứa dấu hiệu này thì KHÔNG ghi ảnh.
if grep -q "COVER_FIXTURE_FAIL" prompts/cover.txt; then
  echo "FAIL cover (rc=1, ảnh không được ghi mới — xem logs/cover.log)"
  exit 0
fi
printf 'PNGFAKECOVER' > cover/cover.raw.png
printf 'PNGFAKECOVER' > cover/cover.png
echo "OK  cover  12B"
exit 0
