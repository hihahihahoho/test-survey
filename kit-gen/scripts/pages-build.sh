#!/usr/bin/env bash
#
# scripts/pages-build.sh — dựng thư mục output để deploy lên Cloudflare Pages.
#
# VÌ SAO CẦN SCRIPT NÀY (không phải "build step"):
#   web/ là ES modules thuần, KHÔNG cần biên dịch. Nhưng router của app chạy ở
#   chế độ `history` với route sâu (/p/:id/design, /p/:id/runs/:runId — xem
#   web/js/core/routes.js). Máy chủ tĩnh nào cũng trả 404 cho những URL đó nếu
#   không có SPA fallback. File `_redirects` bên dưới sửa đúng chuyện đó.
#
#   Script CHỈ copy web/ y nguyên + thêm 2 file cấu hình hosting. Nó KHÔNG minify,
#   KHÔNG bundle, KHÔNG sửa một dòng mã nào của web/.
#
#   bash scripts/pages-build.sh [thư-mục-output]      # mặc định: dist/
#
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OUT="${1:-$REPO/dist}"

[ -f "$REPO/web/index.html" ] || { echo "Không thấy $REPO/web/index.html — chạy script từ trong repo kit-gen." >&2; exit 1; }

echo "  nguồn : $REPO/web"
echo "  đích  : $OUT"

mkdir -p "$OUT"
# Dọn output cũ nhưng chỉ trong phạm vi thư mục đích (không dùng rm -rf mù quáng)
if [ -f "$OUT/index.html" ]; then
  find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  echo "  (đã dọn output cũ)"
fi

cp -R "$REPO/web/." "$OUT/"

# Không đưa test/preview của dev lên bản phát hành
rm -f "$OUT/test-core.mjs" "$OUT/test-screens.mjs" "$OUT/preview-ui.html"
find "$OUT" -type d -name "__tests__" -exec rm -rf {} + 2>/dev/null || true
find "$OUT" -type d -name "tools" -exec rm -rf {} + 2>/dev/null || true

# SPA fallback: mọi URL không phải file thật → index.html, giữ mã 200
# (dùng 200 chứ không 301/302: router phía client đọc đúng đường dẫn gốc)
cat > "$OUT/_redirects" <<'REDIR'
/*    /index.html   200
REDIR

# Header bảo mật. CSP khai ở CẢ HAI chỗ: <meta> trong index.html (đã có) VÀ ở đây,
# để áp cho mọi response kể cả khi trình duyệt chưa parse tới meta. Hai bản phải GIỐNG NHAU —
# nếu sửa CSP trong web/index.html thì sửa luôn dòng dưới.
# connect-src PHẢI cho phép loopback — đó là cách web nói chuyện với agent local.
cat > "$OUT/_headers" <<'HEADERS'
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:* http://[::1]:*; connect-src 'self' http://127.0.0.1:* http://localhost:* http://[::1]:*; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), camera=(), microphone=()

/index.html
  Cache-Control: no-cache

/js/*
  Cache-Control: no-cache

/css/*
  Cache-Control: no-cache
HEADERS

N_FILE="$(find "$OUT" -type f | wc -l | tr -d ' ')"
BYTES="$(du -sh "$OUT" | cut -f1)"
echo "  xong  : $N_FILE file · $BYTES"
echo ""
echo "  Deploy:"
echo "    npx wrangler pages deploy \"$OUT\" --project-name kitgen"
echo ""
echo "  Hoặc trỏ Cloudflare Pages vào repo với:"
echo "    Build command      : bash scripts/pages-build.sh dist"
echo "    Build output dir   : dist"
