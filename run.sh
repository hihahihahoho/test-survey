#!/usr/bin/env bash
# Build survey JSON rồi mở trình xem trên local server.
# Cần local server vì trình duyệt chặn fetch() khi mở bằng file://
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8000}"

node build.mjs

echo
echo "→ http://localhost:${PORT}"
echo "  (Ctrl+C để dừng)"
echo

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
else
  npx --yes serve -l "$PORT" .
fi
