#!/bin/sh
# Cài phụ thuộc cho bộ test DOM của S1 vào /tmp/domtest (KHÔNG đụng package.json
# của R0 — xem teams/react/NEEDS-s1-projects.md N9).
#
# @testing-library/react PHẢI là bản 14.x: bản 16 đòi React 19, trong khi repo
# dùng React 18.3.1 ⇒ sẽ có 2 bản React trong cùng cây và render ném lỗi.
set -e
mkdir -p /tmp/domtest
# `--cache` riêng: cache mặc định ~/.npm ở một số máy có file thuộc root và npm
# sẽ báo EPERM. Dùng thư mục tạm thì luôn ghi được.
npm i --prefix /tmp/domtest --cache /tmp/npmcache --no-audit --no-fund \
  jsdom "@testing-library/react@^14.3.1" "@testing-library/dom@^9"

# Ép react/react-dom của /tmp trỏ về ĐÚNG bản của repo — một bản React duy nhất
# trong cả cây, nếu không render sẽ ném "A React Element from an older version".
WEBAPP="$(cd "$(dirname "$0")/../../../.." && pwd)"
for pkg in react react-dom; do
  if [ -e "/tmp/domtest/node_modules/$pkg" ] && [ ! -L "/tmp/domtest/node_modules/$pkg" ]; then
    mv "/tmp/domtest/node_modules/$pkg" "/tmp/domtest/node_modules/$pkg.orig"
  fi
  ln -sfn "$WEBAPP/node_modules/$pkg" "/tmp/domtest/node_modules/$pkg"
done

# Vitest nạp `jsdom` bằng ESM từ node_modules CỦA CHÍNH NÓ, và NODE_PATH không có
# tác dụng với ESM. Nên phải liên kết vào `webapp/node_modules/`.
# Đây là thư mục SINH RA (không nằm trong git), không phải file nguồn của R0 —
# nên không vi phạm "chỉ sửa nhánh mình". Xoá symlink là gỡ sạch.
for pkg in jsdom @testing-library; do
  ln -sfn "/tmp/domtest/node_modules/$pkg" "$WEBAPP/node_modules/$pkg"
done

echo "Xong. Chạy:"
echo "  npx vitest run --config src/features/projects/__tests__/vitest.dom.config.ts"
