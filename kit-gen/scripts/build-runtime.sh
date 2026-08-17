#!/usr/bin/env bash
# Build the small, source-free runtime artifact consumed by install.sh.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VERSION="${1:-$(node -p "require('$ROOT/webapp/package.json').version" 2>/dev/null || echo 0.0.0-dev)}"
OUT="${2:-$ROOT/release}"
STAGE="$OUT/.stage-$VERSION"
PKG="kitgen-runtime-$VERSION"

# ── SHA-256: chọn công cụ theo MÁY, không giả định `shasum` ────────────────────
# `shasum` là script Perl có sẵn trên macOS và hầu hết bản Linux, nhưng Git for
# Windows KHÔNG có nó — chỉ có `sha256sum.exe` trong <Git>\usr\bin. Đã đo thật:
#   xargs: shasum: No such file or directory   → exit 127
# (run 31986200079, bước "Đóng gói bằng Git-Bash", câu hỏi §9.2-2 của WINDOWS-PORT).
# Thứ tự thử đặt `shasum` TRƯỚC để macOS/Linux chạy đúng công cụ cũ, không đổi một
# byte nào của gói phát hành. ĐỪNG dùng -b: nó in "<hash>␠*<file>" — và hoá ra
# `sha256sum` của Git-Bash tự làm thế sẵn, xem hàm `sha256_text` ngay dưới.
if command -v shasum >/dev/null 2>&1; then
  SHA256="shasum -a 256"
elif command -v sha256sum >/dev/null 2>&1; then
  SHA256="sha256sum"
else
  echo "build-runtime.sh: thiếu cả shasum lẫn sha256sum" >&2
  exit 1
fi

# `sha256sum` của Git for Windows mặc định đọc BINARY nên nó in dấu hiệu chế độ là `*`:
#     1fedc34…7c *./VERSION          ← đo thật, run 31989…, bước "Đóng gói bằng Git-Bash"
# còn `shasum` trên macOS/Linux in hai dấu cách. Cùng một cây file, gói dựng từ Windows và
# gói dựng từ Mac sẽ có manifest KHÁC BYTE — thứ không ai nhìn thấy cho tới khi có kẻ parse
# bằng `cut -d' ' -f3`. Ta chuẩn hoá về MỘT dạng duy nhất: `<64 hex>␠␠<đường dẫn>`.
#
# Băm vẫn tính trên BYTE THÔ (không đụng vào chế độ đọc — `-t` thì mới nguy hiểm, nó có thể
# dịch CRLF và làm sai băm của file nhị phân). Ở đây chỉ đổi đúng MỘT ký tự đánh dấu.
# Mẫu neo vào 64 hex + đúng một dấu cách nên trên POSIX (không bao giờ có `*`) nó KHÔNG thay
# một byte nào — kể cả với tên file có dấu `*`.
sha256_text() { sed 's/^\([0-9a-fA-F]\{64\}\) \*/\1  /'; }

rm -rf "$STAGE"
mkdir -p "$STAGE/$PKG/engine" "$STAGE/$PKG/app" "$STAGE/$PKG/runtime"
# A reused output directory must never leak an older archive/checksum into the
# upload glob. CI uploads every matching file, so stale payloads break publish.
find "$OUT" -maxdepth 1 -type f \( -name 'kitgen-runtime-*.tar.gz' -o -name 'kitgen-runtime-*.tar.gz.sha256' \) -delete

if [ ! -f "$ROOT/webapp/dist/index.html" ]; then
  (cd "$ROOT/webapp" && npm run build)
fi
cp -R "$ROOT/agent" "$STAGE/$PKG/agent"
rm -rf "$STAGE/$PKG/agent/test" "$STAGE/$PKG/agent/test-fixtures" "$STAGE/$PKG/agent/test-agent.mjs"
# cover.sh đi CÙNG gen.sh: agent tìm nó cạnh gen.sh trong engine đã cài. Thiếu ⇒ ảnh bìa
# trả 409 COVER_UNAVAILABLE trên máy người dùng dù test ở repo vẫn xanh.
# skeleton-svg.js là NGUỒN SỰ THẬT hình học của khung xương (render-skeleton.mjs và
# skeleton.html cùng gọi nó). Thiếu file này thì render-skeleton.mjs ném ngay và gen.sh
# dừng — không còn bản PIL để rơi về (skeleton.py đã xoá, BACKLOG #15).
# Thiếu file ở đây KHÔNG được im lặng: bản build vẫn ra tar.gz, cài xong mới hỏng trên
# máy người dùng. `[ -f ] && cp` đời cũ vừa bỏ qua âm thầm vừa làm `set -e` bắn nhầm khi
# file cuối danh sách vắng mặt.
for f in gen.sh cover.sh slice.py skeleton.html skeleton-svg.js silhouettes.js render-skeleton.mjs element-lib.json validate_output_geometry.py; do
  if [ ! -f "$ROOT/$f" ]; then
    echo "build-runtime: thiếu file engine bắt buộc: $f" >&2
    exit 1
  fi
  cp "$ROOT/$f" "$STAGE/$PKG/engine/$f"
done
cp -R "$ROOT/webapp/dist/." "$STAGE/$PKG/app/"
cp -R "$ROOT/runtime/bin" "$ROOT/runtime/service" "$STAGE/$PKG/runtime/"
printf '%s\n' "$VERSION" > "$STAGE/$PKG/VERSION"
cp "$ROOT/install.sh" "$STAGE/$PKG/install.sh"
chmod +x "$STAGE/$PKG/install.sh" "$STAGE/$PKG/runtime/bin/kitgen" "$STAGE/$PKG/engine/gen.sh"
(
  cd "$STAGE/$PKG"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 $SHA256 | sha256_text > manifest.sha256
)
mkdir -p "$OUT"
tar -C "$STAGE" -czf "$OUT/$PKG.tar.gz" "$PKG"
(cd "$OUT" && $SHA256 "$PKG.tar.gz" | sha256_text > "$PKG.tar.gz.sha256")
rm -rf "$STAGE"
echo "$OUT/$PKG.tar.gz"
