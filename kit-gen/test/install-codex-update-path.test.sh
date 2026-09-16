#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# P0 — "NPM CỦA KITGEN KHÔNG ĐƯỢC LÀM VIỆC THAY NPM CỦA NGƯỜI DÙNG".
#
# HIỆN TRƯỜNG (đo 16/09/2026, cài thử 2.1.45 vào một HOME tạm):
#   <KITGEN_HOME>/tools/node/lib/node_modules/@openai/codex  =  277 MB
#   <KITGEN_HOME>/tools/node/bin/codex -> ../lib/node_modules/@openai/codex/bin/codex.js
# …dù install.sh KHÔNG có một dòng `npm install` nào cho codex. Máy thật của chủ sản
# phẩm cũng đúng y vậy (269 MB).
#
# GỐC: install.sh đặt Node RIÊNG lên ĐẦU PATH (để npm/npx/.bin shim của KitGen chạy
# đúng), rồi sau đó gọi `codex update`. Codex bản cài-qua-npm tự nâng bằng
# `npm install -g @openai/codex@latest` — và npm ĐẦU TIÊN trên PATH là kẻ quyết định
# gói rơi vào đâu. Kết quả: gói 277 MB (binary cho MỌI nền tảng) rơi vào tools/node của
# KitGen, còn codex THẬT của người dùng KHÔNG được nâng một chút nào — mà installer
# vẫn in "Codex đã là bản mới nhất".
#
# Bộ này khoá năm mệnh đề:
#   ① install.sh giữ lại PATH GỐC trước khi chèn Node riêng;
#   ② `codex update` chạy bằng PATH GỐC đó (đo bằng chính codex giả: nó ghi ra $PATH
#      mà nó nhận được — PATH ấy KHÔNG được bắt đầu bằng tools/node/bin);
#   ③ codex của MÁY được dò trên PATH GỐC, nếu không thì bản lạc trong tools/node tự
#      nhận làm codex của máy và khối dọn không bao giờ chạy;
#   ④ gói lạc trong tools/node bị DỌN (kèm shim) khi CODEX_BIN nằm chỗ khác;
#   ⑤ nhưng được GIỮ khi CODEX_BIN đúng là nó — dọn mất là cắt luôn codex của máy.
#   ⑥ install.ps1 đối xứng (đọc theo văn bản: máy dựng test không có PowerShell).
#
# Không chạm mạng, không chạy codex thật: mọi lệnh ngoài đều là bản giả.
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INSTALL_SH="$ROOT/install.sh"
INSTALL_PS1="$ROOT/scripts/install.ps1"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-codexpath-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

fail(){ echo "FAIL: $1" >&2; shift; for f in "$@"; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done; exit 1; }

# ── ① PATH gốc phải được chụp TRƯỚC khi Node riêng chen lên đầu ───────────────
ln_save="$(grep -n '^KITGEN_ORIG_PATH="\$PATH"' "$INSTALL_SH" | head -n1 | cut -d: -f1)"
ln_prepend="$(grep -n '^PATH="\$(dirname "\$NODE")' "$INSTALL_SH" | head -n1 | cut -d: -f1)"
[ -n "$ln_save" ] || fail "install.sh không lưu KITGEN_ORIG_PATH — không còn gì để trả lại cho codex update"
[ -n "$ln_prepend" ] || fail "install.sh: không thấy dòng chèn Node riêng lên đầu PATH (mẫu quét đã lạc)"
[ "$ln_save" -lt "$ln_prepend" ] || \
  fail "install.sh lưu PATH gốc (dòng $ln_save) SAU khi đã chèn Node riêng (dòng $ln_prepend) — cái lưu được là PATH đã bẩn"

# ── ② `codex update` không được chạy bằng PATH của installer ──────────────────
grep -q 'run_with_timeout 180 env PATH="\$KITGEN_ORIG_PATH" "\$CODEX_BIN" update' "$INSTALL_SH" || \
  fail "install.sh gọi «codex update» KHÔNG kèm PATH gốc — npm của KitGen sẽ lại nuốt gói 277 MB"

# ── ③ codex của máy dò trên PATH gốc ─────────────────────────────────────────
grep -q 'SYSTEM_CODEX="\$(PATH="\$KITGEN_ORIG_PATH" command -v codex' "$INSTALL_SH" || \
  fail "install.sh vẫn dò codex trên PATH đã chèn Node riêng — bản lạc trong tools/node sẽ tự nhận làm codex của máy"

# ═══════════════════════════════════════════════════════════════════════════════
# Phần hành vi: chạy install.sh thật trong một HOME tạm, mọi lệnh ngoài đều giả.
# ═══════════════════════════════════════════════════════════════════════════════
export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_WORKSPACE="$HOME/KitGen"
export KITGEN_TEST_STATE="$TEST_ROOT/state"
FAKE_BIN="$TEST_ROOT/bin"
RELEASE="$TEST_ROOT/kitgen-runtime-2.1.5"
STRAY="$KITGEN_HOME/tools/node/lib/node_modules/@openai/codex"
STRAY_SHIM="$KITGEN_HOME/tools/node/bin/codex"

mkdir -p "$FAKE_BIN" "$KITGEN_TEST_STATE" "$HOME/.local/bin" \
  "$KITGEN_HOME/releases" "$KITGEN_HOME/tools/node/bin" "$KITGEN_HOME/tools/node_modules/.bin" \
  "$RELEASE/agent" "$RELEASE/app" "$RELEASE/engine" "$RELEASE/runtime/bin" "$RELEASE/runtime/service"

printf '%s\n' '2.1.5' > "$RELEASE/VERSION"
printf '%s\n' 'export const testAgent = true' > "$RELEASE/agent/server.mjs"
printf '%s\n' '<!doctype html><title>KitGen test</title>' > "$RELEASE/app/index.html"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$RELEASE/engine/gen.sh"
cp "$INSTALL_SH" "$RELEASE/install.sh"
cp "$ROOT/runtime/bin/kitgen" "$RELEASE/runtime/bin/kitgen"
cp "$ROOT/runtime/service/com.kitgen.agent.plist.in" "$RELEASE/runtime/service/com.kitgen.agent.plist.in"
chmod +x "$RELEASE/install.sh" "$RELEASE/engine/gen.sh" "$RELEASE/runtime/bin/kitgen"
(
  cd "$RELEASE"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256
)

# ── Python giả: khai 3.13 (trong dải có wheel) ⇒ installer không tải gì ───────
REAL_PYTHON3="$(command -v python3)"
cat > "$FAKE_BIN/python3" <<EOF
#!/usr/bin/env bash
REAL_PYTHON3='$REAL_PYTHON3'
EOF
cat >> "$FAKE_BIN/python3" <<'EOF'
_self_base="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "${1:-}" = "-m" ] && [ "${2:-}" = "venv" ]; then
  _venv="$3"
  mkdir -p "$_venv/bin"
  cat > "$_venv/bin/python" <<'VEOF'
#!/usr/bin/env bash
case "$*" in
  *"sys.base_prefix"*) printf '%s\n' "$(dirname "$(dirname "$(command -v python3)")")"; exit 0 ;;
  *"sys.version.split"*) printf '%s\n' '3.13.15'; exit 0 ;;
  *"import PIL"*) exit 1 ;;
esac
[ "${1:-}" = "-m" ] && [ "${2:-}" = "pip" ] && exit 0
exit 0
VEOF
  chmod +x "$_venv/bin/python"
  ln -sf python "$_venv/bin/python3"
  exit 0
fi
case "$*" in
  *"sys.version_info[:3]"*) printf '%s\n' '3.13.15'; exit 0 ;;
  *"sys.version_info[:2]"*) printf '%s\n' '3.13'; exit 0 ;;
  *"sys.base_prefix"*) printf '%s\n' "$_self_base"; exit 0 ;;
  --version) printf 'Python 3.13.15\n'; exit 0 ;;
esac
exec "$REAL_PYTHON3" "$@"
EOF
chmod +x "$FAKE_BIN/python3"

cat > "$FAKE_BIN/uname" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -s|'') printf '%s\n' Darwin ;;
  -m) printf '%s\n' arm64 ;;
esac
EOF
# Mạng bị cắt hẳn: ca nào chạm curl là ca đó sai, và phải thấy ngay chứ không âm thầm.
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/curl.log"
exit 22
EOF
cat > "$KITGEN_HOME/tools/node/bin/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '%s\n' 20 ;;
  *) exit 0 ;;
esac
EOF
# npm của KitGen: KHÔNG được ai gọi tới trong bộ này. Gọi là ghi sổ để ca thử chết.
cat > "$KITGEN_HOME/tools/node/bin/npm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/kitgen-npm.log"
exit 0
EOF
chmod +x "$FAKE_BIN/uname" "$FAKE_BIN/curl" \
  "$KITGEN_HOME/tools/node/bin/node" "$KITGEN_HOME/tools/node/bin/npm"

# ── Codex giả: ghi lại ĐÚNG cái PATH nó nhận được khi bị gọi `update` ─────────
make_fake_codex(){ # make_fake_codex <đường dẫn>
  mkdir -p "$(dirname "$1")"
  cat > "$1" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  --version) printf 'codex-cli 0.0.0-test\n'; exit 0 ;;
  update) printf '%s\n' "$PATH" > "$KITGEN_TEST_STATE/codex-update-path.txt"; exit 0 ;;
esac
exit 0
EOF
  chmod +x "$1"
}

seed_stray(){ # dựng lại đúng hiện trường đã đo: gói 277 MB + shim cạnh node
  rm -rf "$KITGEN_HOME/tools/node/lib" "$STRAY_SHIM"
  mkdir -p "$STRAY/bin"
  printf '%s\n' '{"name":"@openai/codex"}' > "$STRAY/package.json"
  printf '%s\n' '#!/usr/bin/env node' > "$STRAY/bin/codex.js"
  # ~1 MB "binary mọi nền tảng" để du -sh có cái mà đếm.
  dd if=/dev/zero of="$STRAY/vendor-binaries.bin" bs=1024 count=1024 2>/dev/null
  ln -sf ../lib/node_modules/@openai/codex/bin/codex.js "$STRAY_SHIM"
}

run_install(){ # run_install <out-file> [PATH]
  rm -f "$KITGEN_TEST_STATE/codex-update-path.txt" "$KITGEN_TEST_STATE/curl.log" \
        "$KITGEN_TEST_STATE/kitgen-npm.log"
  set +e
  PATH="${2:-$FAKE_BIN:/usr/bin:/bin}" "$RELEASE/install.sh" --no-start >"$1" 2>&1
  status=$?
  set -e
}

# ── ② + ④ codex của người dùng ở ~/.local/bin, gói lạc nằm trong tools/node ──
make_fake_codex "$HOME/.local/bin/codex"
seed_stray
OUT="$TEST_ROOT/out-clean.txt"
run_install "$OUT"
[ "$status" -eq 0 ] || fail "ca dọn: installer hỏng" "$OUT"
[ -f "$KITGEN_TEST_STATE/codex-update-path.txt" ] || \
  fail "installer KHÔNG gọi codex update — ca thử này đang không đo gì" "$OUT"
UPDATE_PATH="$(cat "$KITGEN_TEST_STATE/codex-update-path.txt")"
case "$UPDATE_PATH" in
  "$KITGEN_HOME/tools/node/bin":*)
    fail "codex update chạy với npm của KitGen ở ĐẦU PATH — đúng đường đã nuốt 277 MB: $UPDATE_PATH" "$OUT" ;;
esac
case "$UPDATE_PATH" in
  *"$KITGEN_HOME/tools/node/bin"*)
    fail "PATH của codex update vẫn còn thấy Node riêng của KitGen: $UPDATE_PATH" "$OUT" ;;
esac
[ ! -s "$KITGEN_TEST_STATE/kitgen-npm.log" ] || \
  fail "npm của KitGen bị gọi trong lượt cài: $(cat "$KITGEN_TEST_STATE/kitgen-npm.log")" "$OUT"
[ ! -e "$STRAY" ] || fail "gói @openai/codex lạc trong tools/node KHÔNG bị dọn" "$OUT"
[ ! -e "$STRAY_SHIM" ] && [ ! -L "$STRAY_SHIM" ] || \
  fail "shim tools/node/bin/codex vẫn còn sau khi gói đã bị dọn" "$OUT"
grep -q 'gói @openai/codex lạc vào Node riêng' "$OUT" || \
  fail "installer dọn im lặng — người dùng không biết vì sao mất 277 MB" "$OUT"
grep -qE 'đã dọn [0-9]' "$OUT" || fail "dòng dọn không nói ra dọn được bao nhiêu" "$OUT"

# ── ③ bản lạc KHÔNG được tự nhận làm codex của máy ───────────────────────────
grep -q "dùng Codex chính thức đã có: .*\.local/bin/codex" "$OUT" || \
  fail "installer không dùng codex ở ~/.local/bin của người dùng" "$OUT"

# ── ⑤ CODEX_BIN NẰM TRONG gói ấy ⇒ tuyệt đối KHÔNG được dọn ──────────────────
# (ai đó cố tình npm-install codex vào Node của KitGen và để nó trên PATH của mình:
#  dọn đi là cắt luôn codex của máy họ giữa lượt cài.)
rm -f "$HOME/.local/bin/codex"
seed_stray
make_fake_codex "$STRAY/bin/codex"
OUT="$TEST_ROOT/out-keep.txt"
run_install "$OUT" "$STRAY/bin:$FAKE_BIN:/usr/bin:/bin"
[ "$status" -eq 0 ] || fail "ca giữ: installer hỏng" "$OUT"
[ -e "$STRAY/package.json" ] || \
  fail "installer xoá đúng cái gói mà CODEX_BIN đang trỏ vào — máy mất codex sau lượt cài" "$OUT"
[ -x "$STRAY/bin/codex" ] || fail "codex đang dùng bị xoá" "$OUT"
grep -q 'gói @openai/codex lạc vào Node riêng' "$OUT" && \
  fail "installer báo đã dọn chính cái gói nó đang dùng" "$OUT"
UPDATE_PATH="$(cat "$KITGEN_TEST_STATE/codex-update-path.txt" 2>/dev/null || printf '')"
case "$UPDATE_PATH" in
  "$KITGEN_HOME/tools/node/bin":*) fail "ca giữ: codex update vẫn nhận PATH có npm của KitGen ở đầu" "$OUT" ;;
esac

# ── ⑥ install.ps1 đối xứng (đọc theo văn bản — máy này không có PowerShell) ───
grep -q '^\$KitgenOrigPath = \$env:Path' "$INSTALL_PS1" || \
  fail "install.ps1 không chụp PATH gốc"
grep -q "\$psi.EnvironmentVariables\['PATH'\] = \$KitgenOrigPath" "$INSTALL_PS1" || \
  fail "install.ps1 chạy codex update mà không ép PATH gốc"
grep -q "strayNpmCodex = Join-Path \$nodeDir 'node_modules\\\\@openai\\\\codex'" "$INSTALL_PS1" || \
  fail "install.ps1 không dọn gói codex lạc trong Node riêng (npm prefix của Node zip trên Windows CHÍNH LÀ thư mục node)"
for shim in 'codex.cmd' 'codex.ps1'; do
  grep -q "'$shim'" "$INSTALL_PS1" || fail "install.ps1 không dọn shim $shim cạnh node.exe"
done
# BOM UTF-8 phải còn nguyên, nếu không PS 5.1 đọc file bằng Windows-1252 và vỡ cả script.
[ "$(head -c 3 "$INSTALL_PS1" | od -An -tx1 | tr -d ' \n')" = "efbbbf" ] || \
  fail "install.ps1 mất BOM UTF-8"

echo "OK  install-codex-update-path: codex update chạy bằng PATH gốc; gói lạc trong tools/node bị dọn (và được giữ khi đang dùng)"
