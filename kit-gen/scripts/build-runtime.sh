#!/usr/bin/env bash
# Build the small, source-free runtime artifact consumed by install.sh.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VERSION="${1:-$(node -p "require('$ROOT/webapp/package.json').version" 2>/dev/null || echo 0.0.0-dev)}"
OUT="${2:-$ROOT/release}"
STAGE="$OUT/.stage-$VERSION"
PKG="kitgen-runtime-$VERSION"
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
for f in gen.sh cover.sh slice.py skeleton.py skeleton.html silhouettes.js render-skeleton.mjs element-lib.json validate_output_geometry.py; do
  [ -f "$ROOT/$f" ] && cp "$ROOT/$f" "$STAGE/$PKG/engine/$f"
done
cp -R "$ROOT/webapp/dist/." "$STAGE/$PKG/app/"
cp -R "$ROOT/runtime/bin" "$ROOT/runtime/service" "$STAGE/$PKG/runtime/"
printf '%s\n' "$VERSION" > "$STAGE/$PKG/VERSION"
cp "$ROOT/install.sh" "$STAGE/$PKG/install.sh"
chmod +x "$STAGE/$PKG/install.sh" "$STAGE/$PKG/runtime/bin/kitgen" "$STAGE/$PKG/engine/gen.sh"
(
  cd "$STAGE/$PKG"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256
)
mkdir -p "$OUT"
tar -C "$STAGE" -czf "$OUT/$PKG.tar.gz" "$PKG"
(cd "$OUT" && shasum -a 256 "$PKG.tar.gz" > "$PKG.tar.gz.sha256")
rm -rf "$STAGE"
echo "$OUT/$PKG.tar.gz"
