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
mkdir -p "$STAGE/$PKG/app" "$STAGE/$PKG/runtime"
# A reused output directory must never leak an older archive/checksum into the
# upload glob. CI uploads every matching file, so stale payloads break publish.
find "$OUT" -maxdepth 1 -type f \( -name 'kitgen-runtime-*.tar.gz' -o -name 'kitgen-runtime-*.tar.gz.sha256' \) -delete

if [ ! -f "$ROOT/webapp/dist/index.html" ]; then
  (cd "$ROOT/webapp" && npm run build)
fi
# ── ENGINE ĐI CÙNG AGENT, KHÔNG CÒN THƯ MỤC `engine/` RIÊNG ───────────────────
# Tới 2.1.45 engine là sáu file rời ở gốc kho (gen.sh · cover.sh · slice.py ·
# geometry.py · validate_output_geometry.py · element-lib.json) và được chép vào
# `$PKG/engine/`, rồi installer lại chép tiếp vào `<workspace>/.kitgen/engine`.
# Từ 16/09/2026 engine là JS và nằm TRONG gói agent (`agent/engine/*.mjs`), nên `cp -R
# agent` ở dưới đã mang nó đi — không còn danh sách nào phải giữ cho đồng bộ bằng tay,
# và không còn ca "quên một file ⇒ ModuleNotFoundError trên máy người dùng".
cp -R "$ROOT/agent" "$STAGE/$PKG/agent"
rm -rf "$STAGE/$PKG/agent/test" "$STAGE/$PKG/agent/test-fixtures" "$STAGE/$PKG/agent/test-agent.mjs"
# Cửa vào engine PHẢI có mặt: nó vừa là thứ agent spawn, vừa là DẤU NHẬN DIỆN mà
# `install.sh::is_release` dùng để nói "đây có phải gói KitGen không".
[ -f "$STAGE/$PKG/agent/engine/cli.mjs" ] || {
  echo "build-runtime: gói thiếu agent/engine/cli.mjs — installer sẽ từ chối chính gói này" >&2
  exit 1
}
# `element-lib.json` là catalogue element CHỈ-ĐỌC cho `GET /api/element-lib`. Nó KHÔNG
# phải mã engine (không file .mjs nào mở nó), mà là dữ liệu do `lib/templates.mjs` đọc:
# ưu tiên `<workspace>/.kitgen/engine/`, rồi tới GỐC GÓI (`resolve(agent/lib, "..", "..")`
# = thư mục bản phát hành). Đường thứ nhất đã chết cùng việc chép engine vào workspace,
# nên file này phải nằm ở GỐC gói — thiếu là UI mở bảng chọn element ra rỗng.
[ -f "$ROOT/element-lib.json" ] || {
  echo "build-runtime: thiếu element-lib.json — /api/element-lib sẽ trả catalogue rỗng" >&2
  exit 1
}
cp "$ROOT/element-lib.json" "$STAGE/$PKG/element-lib.json"
# ── CẦU MỘT ĐỜI CHO ĐƯỜNG NÂNG CẤP: `engine/gen.sh` GIẢ ─────────────────────────
# `kitgen update` trên máy đang cài ≤2.1.45 chạy `~/.kitgen/install.sh` CŨ (agent
# `update.mjs::stageInstaller` chép installer đang có, KHÔNG phải installer trong gói mới),
# và `is_release()` đời ấy đòi `engine/gen.sh` — thiếu là "Invalid KitGen runtime archive"
# và người dùng kẹt ở bản cũ mãi. Installer cũ sau khi cài xong mới chép install.sh MỚI
# vào ~/.kitgen, nên chỉ cần gói MỘT đời còn mang file này. Không ai gọi nó: agent spawn
# `agent/engine/cli.mjs`; installer cũ chép nó vào `<workspace>/.kitgen/engine`, installer
# mới dọn thư mục đó ở lượt kế. Gỡ khối này khi không còn máy nào ở ≤2.1.45.
mkdir -p "$STAGE/$PKG/engine"
cat > "$STAGE/$PKG/engine/gen.sh" <<'STUB'
#!/usr/bin/env bash
# KitGen: engine bash đã được thay bằng agent/engine/cli.mjs (JS) từ 16/09/2026.
# File này chỉ tồn tại để installer đời ≤2.1.45 nhận diện gói khi nâng cấp.
echo "gen.sh đã nghỉ — engine nay là node agent/engine/cli.mjs" >&2
exit 2
STUB
chmod +x "$STAGE/$PKG/engine/gen.sh"
cp -R "$ROOT/webapp/dist/." "$STAGE/$PKG/app/"
cp -R "$ROOT/runtime/bin" "$ROOT/runtime/service" "$STAGE/$PKG/runtime/"
printf '%s\n' "$VERSION" > "$STAGE/$PKG/VERSION"
cp "$ROOT/install.sh" "$STAGE/$PKG/install.sh"
# install.ps1 PHẢI đi trong gói — cùng lý do install.sh ở trên. Trước bản này gói chỉ có
# install.sh: máy Windows update xong vẫn chạy installer ĐỜI ĐẦU (install.ps1:871 tự
# copy chính nó), nên mọi bản vá Windows (kể cả bước `codex update`) không bao giờ tới
# được máy user cũ — gốc rễ ca "Windows không update nổi" 24/08.
if [ ! -f "$ROOT/scripts/install.ps1" ]; then
  echo "build-runtime: thiếu scripts/install.ps1 — gói Windows sẽ đông cứng installer đời cũ" >&2
  exit 1
fi
cp "$ROOT/scripts/install.ps1" "$STAGE/$PKG/install.ps1"
# PS 5.1 đọc .ps1 không BOM bằng Windows-1252 ⇒ chữ Việt thành lỗi cú pháp (đã cắn
# 2.1.20–2.1.22). Gói mà chứa bản không BOM là hỏng đúng chỗ vừa sửa — chặn tại build.
if [ "$(head -c 3 "$ROOT/scripts/install.ps1" | od -An -tx1 | tr -d ' \n')" != "efbbbf" ]; then
  echo "build-runtime: scripts/install.ps1 mất BOM UTF-8 — PS 5.1 sẽ parse hỏng" >&2
  exit 1
fi
chmod +x "$STAGE/$PKG/install.sh" "$STAGE/$PKG/runtime/bin/kitgen"
(
  cd "$STAGE/$PKG"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 $SHA256 | sha256_text > manifest.sha256
)
mkdir -p "$OUT"
tar -C "$STAGE" -czf "$OUT/$PKG.tar.gz" "$PKG"
(cd "$OUT" && $SHA256 "$PKG.tar.gz" | sha256_text > "$PKG.tar.gz.sha256")
rm -rf "$STAGE"
echo "$OUT/$PKG.tar.gz"
