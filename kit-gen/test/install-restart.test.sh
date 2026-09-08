#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# BACKLOG #20 — "cài xong nhưng agent không khởi động lại" (máy chủ SP, 14/08).
#
# Hiện trường ngày đó: symlink `current` đã trỏ 2.1.20, tiến trình agent vẫn là 2.1.19
# (uptime không đổi), không một dòng log nào, UI vẫn mời cập nhật. Ba mệnh đề bị khoá
# ở đây, mỗi cái ứng với một mảnh của sự cố:
#
#   ① CÀI DỞ THÌ KHÔNG ĐƯỢC ĐỔI GÌ — installer chết SAU khi đã dựng xong bản mới
#      trong `releases/` nhưng TRƯỚC khi kích hoạt (ở đây: pillow cài hỏng, bước 2/6)
#      phải để `current` y nguyên. Trước 2.1.21 symlink đổi ở bước 2/7 nên mọi lỗi sau
#      đó đều để lại đúng cái trạng thái nửa vời không ai đọc được.
#      (Bản trước dùng health check @resvg/resvg-wasm làm chỗ chết; trình render khung
#      xương đã bỏ hẳn khỏi installer, nên chỗ chết chuyển sang pip.)
#   ② "CÓ AI TRẢ LỜI" KHÔNG PHẢI "BẢN MỚI ĐANG CHẠY" — agent cũ trả lời /health được.
#      Restart không ăn ⇒ installer phải thử lại rồi HỎNG TO kèm lệnh chữa, không được
#      in "OK agent phản hồi" rồi thoát 0.
#   ③ Đường thuận vẫn phải xanh — bản mới lên đúng thì không được bịa ra lỗi.
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-restart-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_WORKSPACE="$HOME/KitGen"
export KITGEN_RELEASE_MANIFEST="unused-in-local-release-test"
export KITGEN_TEST_STATE="$TEST_ROOT/state"
FAKE_BIN="$TEST_ROOT/bin"
RELEASE="$TEST_ROOT/kitgen-runtime-2.1.5"
OLD_RELEASE="$KITGEN_HOME/releases/2.1.4"

mkdir -p \
  "$FAKE_BIN" \
  "$KITGEN_TEST_STATE" \
  "$KITGEN_HOME/releases" \
  "$KITGEN_HOME/tools/node/bin" \
  "$KITGEN_HOME/tools/node_modules/.bin" \
  "$KITGEN_WORKSPACE/.venv/bin" \
  "$HOME/Library/LaunchAgents" \
  "$RELEASE/agent" \
  "$RELEASE/app" \
  "$RELEASE/engine" \
  "$RELEASE/runtime/bin" \
  "$RELEASE/runtime/service"

printf '%s\n' '2.1.5' > "$RELEASE/VERSION"
printf '%s\n' 'export const testAgent = true' > "$RELEASE/agent/server.mjs"
printf '%s\n' '<!doctype html><title>KitGen test</title>' > "$RELEASE/app/index.html"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$RELEASE/engine/gen.sh"
INSTALLER_SOURCE="${KITGEN_INSTALL_SOURCE:-$ROOT/install.sh}"
cp "$INSTALLER_SOURCE" "$RELEASE/install.sh"
cp "$ROOT/runtime/bin/kitgen" "$RELEASE/runtime/bin/kitgen"
cp "$ROOT/runtime/service/com.kitgen.agent.plist.in" "$RELEASE/runtime/service/com.kitgen.agent.plist.in"
chmod +x "$RELEASE/install.sh" "$RELEASE/engine/gen.sh" "$RELEASE/runtime/bin/kitgen"
(
  cd "$RELEASE"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256
)

mkdir -p "$OLD_RELEASE"
printf '%s\n' '2.1.4' > "$OLD_RELEASE/VERSION"
ln -s "$OLD_RELEASE" "$KITGEN_HOME/current"

cat > "$KITGEN_HOME/tools/node/bin/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '%s\n' 20 ;;
  */npm)
    mkdir -p "$KITGEN_HOME/tools/node_modules/.bin"
    printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$KITGEN_HOME/tools/node_modules/.bin/codex"
    chmod +x "$KITGEN_HOME/tools/node_modules/.bin/codex"
    ;;
  --check) exit 0 ;;
  *) exit 0 ;;
esac
EOF
# npm giả dùng đúng shebang npm thật (`env node`). Fake Node ở trên tạo shim Codex khi
# npm được gọi, đủ để đo riêng lỗi PATH thiếu private Node.
cat > "$KITGEN_HOME/tools/node/bin/npm" <<'EOF'
#!/usr/bin/env node
exit 0
EOF
cat > "$KITGEN_HOME/tools/node_modules/.bin/codex" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
# Python riêng của KitGen (GIẢ). Bộ test không được phụ thuộc phiên bản Python của máy
# chạy nó: macOS mặc định là /usr/bin/python3 3.9 — ngoài dải có wheel — nên installer
# thật sẽ đi TẢI bản riêng ~24 MB, mà test thì cấm ra mạng. Dựng sẵn bản riêng ở đây là
# installer đi nhánh ① (dùng lại bản đã có) và không đụng tới mạng.
mkdir -p "$KITGEN_HOME/tools/python/bin"
cat > "$KITGEN_HOME/tools/python/bin/python3" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  *"sys.version_info[:3]"*) printf '3.13.15\n' ;;
  *"sys.version_info[:2]"*) printf '3.13\n' ;;
  *"sys.base_prefix"*) printf '%s\n' "$KITGEN_HOME/tools/python" ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$KITGEN_HOME/tools/python/bin/python3"

cat > "$KITGEN_WORKSPACE/.venv/bin/python" <<'EOF'
#!/usr/bin/env bash
# `sys.base_prefix` phải khớp bản Python riêng ở trên, nếu không installer coi venv này
# là đồ thừa của một Python khác và dựng lại (đúng như thiết kế) — rồi chạy pip thật.
# Cờ `pip-fails` dựng lại ca "installer chết SAU khi đã dựng xong bản mới": `import PIL`
# báo THIẾU ⇒ installer đi cài ⇒ pip hỏng ⇒ thoát 1, và `current` chưa được đụng tới.
case "$*" in
  *"sys.base_prefix"*) printf '%s\n' "$KITGEN_HOME/tools/python" ;;
  *) [ ! -f "$KITGEN_TEST_STATE/pip-fails" ] || exit 1; exit 0 ;;
esac
EOF
chmod +x \
  "$KITGEN_HOME/tools/node/bin/node" \
  "$KITGEN_HOME/tools/node/bin/npm" \
  "$KITGEN_HOME/tools/node_modules/.bin/codex" \
  "$KITGEN_WORKSPACE/.venv/bin/python"

cat > "$FAKE_BIN/uname" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -s|'') printf '%s\n' Darwin ;;
  -m) printf '%s\n' arm64 ;;
esac
EOF
cat > "$FAKE_BIN/id" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 501
EOF
cat > "$FAKE_BIN/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
# launchd giả LUÔN THÀNH CÔNG — cố ý. Ca cần bắt không phải "launchctl lỗi" (cái đó đã
# có install-launchd.test.sh) mà là "launchctl báo OK nhưng tiến trình cũ vẫn ngồi đó".
cat > "$FAKE_BIN/launchctl" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/launchctl.log"
case "${1:-}" in
  print) [ -f "$KITGEN_TEST_STATE/registered" ] ;;
  bootout|unload) rm -f "$KITGEN_TEST_STATE/registered" ;;
  bootstrap|load) : > "$KITGEN_TEST_STATE/registered" ;;
  kickstart|kill) [ -f "$KITGEN_TEST_STATE/registered" ] ;;
  *) exit 2 ;;
esac
EOF
# /health giả. `reported-version` là VERSION mà TIẾN TRÌNH khai — cố ý tách rời khỏi
# symlink `current`, vì đó chính xác là thứ đã lệch nhau trên máy thật.
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -eu
# Hai vai: ① health check agent (mặc định); ② "mạng" cho installer codex chính thức —
# in ra MỘT SCRIPT mà install.sh sẽ pipe vào sh, script đó đặt codex giả vào đúng chỗ
# installer thật của OpenAI đặt (~/.local/bin/codex). Không byte nào ra mạng thật.
for a in "$@"; do
  case "$a" in
    *chatgpt.com/codex/install.sh*)
      printf '%s\n' 'mkdir -p "$HOME/.local/bin"' \
        'printf '\''#!/usr/bin/env bash\nexit 0\n'\'' > "$HOME/.local/bin/codex"' \
        'chmod +x "$HOME/.local/bin/codex"'
      exit 0 ;;
  esac
done
[ -f "$KITGEN_TEST_STATE/registered" ] || exit 7
printf '{"ok":true,"app":"kitgen-agent","runtimeVersion":"%s","uptimeMs":4440000}\n' \
  "$(cat "$KITGEN_TEST_STATE/reported-version")"
EOF
chmod +x "$FAKE_BIN/uname" "$FAKE_BIN/id" "$FAKE_BIN/sleep" "$FAKE_BIN/launchctl" "$FAKE_BIN/curl"

: > "$KITGEN_TEST_STATE/registered"
printf '%s\n' '2.1.4' > "$KITGEN_TEST_STATE/reported-version"

run_install(){
  set +e
  PATH="$FAKE_BIN:/usr/bin:/bin" "$RELEASE/install.sh" --update >"$1" 2>&1
  status=$?
  set -e
}

# ── ① Cài dở ⇒ KHÔNG được đụng vào bản đang chạy ────────────────────────────
: > "$KITGEN_TEST_STATE/pip-fails"
OUT1="$TEST_ROOT/install-abort.out"
run_install "$OUT1"
rm -f "$KITGEN_TEST_STATE/pip-fails"

[ "$status" -ne 0 ] || {
  echo "installer đã nuốt lỗi ở bước thư viện ảnh — thiếu pillow là KHÔNG cắt được ảnh" >&2
  cat "$OUT1" >&2
  exit 1
}
# Chết ĐÚNG CHỖ: nếu ca này rơi vào một lỗi khác thì hai mệnh đề dưới vẫn xanh mà
# chẳng đo được gì. Bắt installer nói tên gói còn thiếu.
grep -q 'thiếu pillow' "$OUT1" || {
  echo "installer chết ở đâu đó khác, không phải ở bước cài thư viện ảnh" >&2
  cat "$OUT1" >&2
  exit 1
}
[ "$(readlink "$KITGEN_HOME/current")" = "$OLD_RELEASE" ] || {
  echo "cài dở mà symlink current ĐÃ đổi sang bản mới — đúng cái bẫy 14/08" >&2
  cat "$OUT1" >&2
  exit 1
}
grep -q 'kickstart' "$KITGEN_TEST_STATE/launchctl.log" 2>/dev/null && {
  echo "installer đã đụng tới dịch vụ dù chưa cài xong" >&2
  exit 1
}

# ── ② Restart không ăn ⇒ hỏng TO, kèm lệnh chữa, KHÔNG lùi bản đã cài ────────
OUT2="$TEST_ROOT/install-stale.out"
run_install "$OUT2"

[ "$status" -ne 0 ] || {
  echo "installer báo THÀNH CÔNG dù agent vẫn là bản cũ (chính là bug #20)" >&2
  cat "$OUT2" >&2
  exit 1
}
[ "$(readlink "$KITGEN_HOME/current")" = "$KITGEN_HOME/releases/2.1.5" ] || {
  echo "bản mới đã cài xong và lành lặn — không được lùi symlink ở ca này" >&2
  cat "$OUT2" >&2
  exit 1
}
grep -q 'ĐÃ CÀI XONG nhưng dịch vụ vẫn đang chạy bản cũ' "$OUT2" || {
  echo "installer im lặng: không nói ra là agent chưa được thay" >&2
  cat "$OUT2" >&2
  exit 1
}
grep -q "$KITGEN_HOME/bin/kitgen restart" "$OUT2" || {
  echo "báo lỗi mà không đưa lệnh chữa" >&2
  cat "$OUT2" >&2
  exit 1
}
grep -q 'ĐÃ CÀI XONG nhưng dịch vụ vẫn đang chạy bản cũ' "$KITGEN_HOME/install.log" || {
  echo "sự cố không để lại dấu vết nào trên đĩa (14/08 hỏng đúng ở chỗ này)" >&2
  exit 1
}
[ "$(grep -c '^kill ' "$KITGEN_TEST_STATE/launchctl.log")" -ge 1 ] || {
  echo "installer bỏ cuộc mà chưa thử dừng hẳn rồi bật lại" >&2
  cat "$KITGEN_TEST_STATE/launchctl.log" >&2
  exit 1
}

# ── ③ Đường thuận: tiến trình lên đúng bản ⇒ xanh, không bịa lỗi ─────────────
printf '%s\n' '2.1.5' > "$KITGEN_TEST_STATE/reported-version"
OUT3="$TEST_ROOT/install-ok.out"
run_install "$OUT3"

[ "$status" -eq 0 ] || {
  echo "đường thuận bị báo hỏng" >&2
  cat "$OUT3" >&2
  exit 1
}
grep -q 'agent 2.1.5 phản hồi' "$OUT3" || {
  echo "health check không nêu đích danh version đang chạy" >&2
  cat "$OUT3" >&2
  exit 1
}
grep -q 'ĐÃ CÀI XONG nhưng' "$OUT3" && {
  echo "bịa ra cảnh báo restart trong lượt cài thành công" >&2
  cat "$OUT3" >&2
  exit 1
}

# ── ④ Máy không có codex nào ⇒ đi đường installer CHÍNH THỨC (fake curl in ra script
# đặt codex giả vào ~/.local/bin — xem fake curl ở trên). Đường npm đã bỏ 24/08/2026;
# ca này giữ lại để khẳng định: thiếu codex thì installer TỰ CÀI được và qua health gate.
rm -f "$KITGEN_HOME/tools/node_modules/.bin/codex"
OUT4="$TEST_ROOT/install-codex-private-node.out"
run_install "$OUT4"
[ "$status" -eq 0 ] || {
  echo "Codex CLI regression: installer failed with private Node only" >&2
  cat "$OUT4" >&2
  exit 1
}
grep -q 'đường dẫn Codex bền vững' "$OUT4" || {
  echo "Codex CLI regression: installer did not pass the Codex health gate" >&2
  cat "$OUT4" >&2
  exit 1
}

echo "install-restart: cài dở không đổi gì · restart không ăn thì hỏng to kèm lệnh chữa · đường thuận xanh · npm env-node qua PATH private"
