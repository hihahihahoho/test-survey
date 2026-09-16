#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# "MÁY ĐỜI CŨ PHẢI ĐƯỢC GỠ SẠCH RỒI MỚI CÀI BẢN 3.x" — bộ ca của lượt CÀI LẠI TỪ ĐẦU.
#
# VÌ SAO CÓ BỘ CA NÀY (16/09/2026, đợt port engine sang JS → 3.0.0): máy nào từng cài
# ≤2.1.45 đang gánh nguyên một đời trước — `tools/python` (CPython + venv), engine bash
# chép vào workspace, Playwright, @resvg, hàng chục bản trong `releases/`. Installer đời
# trước dọn từng thứ MỘT, ở ba khối `rm -rf` rải rác: thứ nào quên thì nằm lại vĩnh viễn.
# Nay chỉ còn MỘT cơ chế — thấy dấu hiệu đời cũ ⇒ gỡ sạch theo DANH SÁCH GIỮ rồi cài mới.
#
# Bộ ca khoá bốn mệnh đề, mỗi cái là một cách mà cơ chế này có thể hại người dùng:
#   ① GỠ ĐỦ: releases/ · current · tools/ (python, playwright, @resvg, node_modules) ·
#      install.sh cũ · workspace/.venv · workspace/.kitgen/engine — không sót thứ nào;
#   ② GIỮ ĐỦ: config.env, logs/, và TOÀN BỘ workspace ngoài mấy đường trên. Project là
#      dữ liệu của người dùng; xoá nhầm một lần là mất trắng, không có đường lùi;
#   ③ CÀI ĐƯỢC SAU KHI GỠ: gỡ xong mà không dựng lại bản mới thì máy chỉ còn cái vỏ —
#      `current` phải trỏ bản vừa cài, và installer phải nói ra nó đã dọn những gì;
#   ④ KHÔNG ĐƯỢC QUÉT NHẦM LƯỢT UPDATE CÙNG ĐỜI: 3.x → 3.x vẫn giữ bản trước để lùi
#      (đúng đường rollback mà install-launchd/install-restart đang đo).
#
# Không ra mạng: `curl` giả hỏng mọi lượt gọi và ghi sổ; Node riêng, codex và gói cài
# đều là đồ giả dựng tại chỗ. Luôn `--no-start`: bộ ca KHÔNG được đụng tới launchd của
# máy đang chạy nó (nhãn `com.kitgen.agent` là nhãn của máy thật, không của HOME tạm).
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INSTALL_SH="$ROOT/install.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-fresh-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

fail(){ echo "FAIL: $1" >&2; shift; for f in "$@"; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done; exit 1; }

export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_WORKSPACE="$HOME/Kho-KitGen"   # cố ý KHÁC mặc định $HOME/KitGen
export KITGEN_TEST_STATE="$TEST_ROOT/state"
# Hai cờ này là LUẬT khi chạy bộ ca trên máy thật: không được cài, không được nâng
# codex chung của cả máy chỉ vì ai đó chạy test.
export KITGEN_SKIP_CODEX_INSTALL=1
export KITGEN_SKIP_CODEX_UPDATE=1
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN" "$KITGEN_TEST_STATE" "$HOME"

# ── gói phát hành giả, đóng thành .tar.gz như gói thật ───────────────────────
make_archive(){ # make_archive <version> → in ra đường dẫn .tar.gz
  _v="$1"
  _stage="$TEST_ROOT/stage-$_v"
  _pkg="$_stage/kitgen-runtime-$_v"
  rm -rf "$_stage"
  mkdir -p "$_pkg/agent/engine" "$_pkg/app" "$_pkg/runtime/bin" "$_pkg/runtime/service"
  printf '%s\n' "$_v" > "$_pkg/VERSION"
  printf '%s\n' 'export const testAgent = true' > "$_pkg/agent/server.mjs"
  printf '%s\n' 'export {}' > "$_pkg/agent/engine/cli.mjs"
  printf '%s\n' '<!doctype html><title>KitGen test</title>' > "$_pkg/app/index.html"
  cp "$INSTALL_SH" "$_pkg/install.sh"
  cp "$ROOT/runtime/bin/kitgen" "$_pkg/runtime/bin/kitgen"
  cp "$ROOT/runtime/service/com.kitgen.agent.plist.in" "$_pkg/runtime/service/com.kitgen.agent.plist.in"
  chmod +x "$_pkg/install.sh" "$_pkg/runtime/bin/kitgen"
  ( cd "$_pkg" && find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256 )
  ( cd "$_stage" && tar -czf "$TEST_ROOT/kitgen-runtime-$_v.tar.gz" "kitgen-runtime-$_v" )
  shasum -a 256 "$TEST_ROOT/kitgen-runtime-$_v.tar.gz" | awk '{print $1}' \
    > "$TEST_ROOT/kitgen-runtime-$_v.tar.gz.sha256"
  printf '%s' "$TEST_ROOT/kitgen-runtime-$_v.tar.gz"
}

ARCHIVE_300="$(make_archive 3.0.0-thu)"
ARCHIVE_301="$(make_archive 3.0.1-thu)"

# ── lệnh ngoài giả ───────────────────────────────────────────────────────────
cat > "$FAKE_BIN/codex" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  --version) printf 'codex-cli 0.0.0-test\n'; exit 0 ;;
  update) printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/codex-update.log" ;;
esac
exit 0
EOF
# Mạng bị cắt hẳn: nếu bước gỡ sạch xoá mất Node riêng đang lành lặn thì installer sẽ
# phải đi tải Node — và ca đó lộ ra ở đây chứ không âm thầm xanh.
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/curl.log"
exit 22
EOF
chmod +x "$FAKE_BIN/codex" "$FAKE_BIN/curl"

seed_node(){ # Node riêng GIẢ — runtime DUY NHẤT mà installer còn được phép cần
  mkdir -p "$KITGEN_HOME/tools/node/bin"
  cat > "$KITGEN_HOME/tools/node/bin/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '%s\n' 20 ;;
  *) exit 0 ;;
esac
EOF
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$KITGEN_HOME/tools/node/bin/npm"
  chmod +x "$KITGEN_HOME/tools/node/bin/node" "$KITGEN_HOME/tools/node/bin/npm"
}

run_install(){ # run_install <out-file> <args...>
  _out="$1"; shift
  rm -f "$KITGEN_TEST_STATE/curl.log"
  set +e
  PATH="$FAKE_BIN:/usr/bin:/bin" "$INSTALL_SH" "$@" >"$_out" 2>&1
  status=$?
  set -e
}

# ═══════════════════════════════════════════════════════════════════════════════
# ① + ② + ③ — MÁY ĐỜI CŨ (bản 2.1.44, engine bash, Python riêng, venv trong workspace)
# ═══════════════════════════════════════════════════════════════════════════════
OLD="$KITGEN_HOME/releases/2.1.44"
mkdir -p "$OLD/engine" "$OLD/agent" \
  "$KITGEN_HOME/tools/python/bin" "$KITGEN_HOME/tools/playwright-browsers/chromium-1122" \
  "$KITGEN_HOME/tools/node_modules/@resvg/resvg-wasm" "$KITGEN_HOME/tools/bin" \
  "$KITGEN_HOME/logs" \
  "$KITGEN_WORKSPACE/.kitgen/engine" "$KITGEN_WORKSPACE/.venv/lib" \
  "$KITGEN_WORKSPACE/projects/du-an-cua-toi/kit"
printf '%s\n' '2.1.44' > "$OLD/VERSION"
printf '%s\n' '#!/usr/bin/env bash' > "$OLD/engine/gen.sh"
printf '%s\n' 'export const old = true' > "$OLD/agent/server.mjs"
ln -s "$OLD" "$KITGEN_HOME/current"
printf '%s\n' 'giả' > "$KITGEN_HOME/tools/python/bin/python3"
printf '%s\n' 'giả' > "$KITGEN_HOME/tools/playwright-browsers/chromium-1122/chrome"
printf '%s\n' 'giả' > "$KITGEN_HOME/tools/node_modules/@resvg/resvg-wasm/index.js"
printf '%s\n' 'giả' > "$KITGEN_HOME/tools/bin/codex"
printf '%s\n' 'DAU-RIENG-INSTALLER-DOI-CU' > "$KITGEN_HOME/install.sh"
printf '%s\n' 'nhật ký cũ của người dùng' > "$KITGEN_HOME/logs/agent-2026-08.log"
printf '%s\n' 'giả' > "$KITGEN_WORKSPACE/.kitgen/engine/gen.sh"
printf '%s\n' 'giả' > "$KITGEN_WORKSPACE/.venv/pyvenv.cfg"
printf '%s\n' '{"kit":"của người dùng"}' > "$KITGEN_WORKSPACE/projects/du-an-cua-toi/kit/kit.json"
printf '%s\n' '{"workspaceVersion":1}' > "$KITGEN_WORKSPACE/.kitgen/config.json"
# config.env đời cũ: vừa là thứ PHẢI GIỮ, vừa là nơi duy nhất nói workspace nằm ở đâu.
cat > "$KITGEN_HOME/config.env" <<CFG
KITGEN_HOME='$KITGEN_HOME'
KITGEN_SOURCE='$KITGEN_HOME/current'
KITGEN_WORKSPACE='$KITGEN_WORKSPACE'
KITGEN_PORT='8765'
CFG
seed_node

OUT1="$TEST_ROOT/fresh.out"
run_install "$OUT1" --update --archive "$ARCHIVE_300" --sha256 "$(cat "$ARCHIVE_300.sha256")" --no-start
[ "$status" -eq 0 ] || fail "lượt cài lại từ đầu thoát $status" "$OUT1"

# — installer phải NÓI RA nó vừa làm gì với máy người ta —
grep -q 'Gỡ bản cũ (cài lại từ đầu)' "$OUT1" || fail "không có bước «Gỡ bản cũ» nào" "$OUT1"
grep -q 'nhận ra bản đời cũ' "$OUT1" || fail "không nói vì sao lại gỡ sạch" "$OUT1"
grep -qE 'đã dọn [0-9]+ MB di sản đời cũ' "$OUT1" || \
  fail "xoá cả một đời của người dùng mà không nói dọn được bao nhiêu" "$OUT1"
for _what in 'releases/' 'tools/python' 'tools/playwright-browsers' 'workspace/.venv' 'workspace/.kitgen/engine'; do
  grep -qF "$_what" "$OUT1" || fail "dòng báo cáo không kể tên «$_what»" "$OUT1"
done

# — ① GỠ ĐỦ —
[ ! -e "$OLD" ] || fail "bản 2.1.44 đời cũ vẫn còn trong releases/" "$OUT1"
[ ! -e "$KITGEN_HOME/tools/python" ] || fail "tools/python không bị gỡ" "$OUT1"
[ ! -e "$KITGEN_HOME/tools/playwright-browsers" ] || fail "tools/playwright-browsers không bị gỡ" "$OUT1"
[ ! -e "$KITGEN_HOME/tools/node_modules" ] || fail "tools/node_modules không bị gỡ" "$OUT1"
[ ! -e "$KITGEN_HOME/tools/bin/codex" ] || fail "shim codex cũ trong tools/bin không bị gỡ" "$OUT1"
[ ! -e "$KITGEN_WORKSPACE/.venv" ] || fail "workspace/.venv không bị gỡ" "$OUT1"
[ ! -e "$KITGEN_WORKSPACE/.kitgen/engine" ] || fail "workspace/.kitgen/engine không bị gỡ" "$OUT1"
if grep -q 'DAU-RIENG-INSTALLER-DOI-CU' "$KITGEN_HOME/install.sh"; then
  fail "install.sh đời cũ còn nguyên trong KITGEN_HOME — lượt update sau lại chạy bản cũ" "$OUT1"
fi

# — ② GIỮ ĐỦ —
[ -f "$KITGEN_HOME/config.env" ] || fail "config.env bị xoá theo bản cũ" "$OUT1"
grep -q "KITGEN_WORKSPACE='$KITGEN_WORKSPACE'" "$KITGEN_HOME/config.env" || \
  fail "config.env mới không còn trỏ đúng workspace của người dùng" "$OUT1"
[ -f "$KITGEN_HOME/logs/agent-2026-08.log" ] || fail "logs/ của người dùng bị xoá" "$OUT1"
[ -f "$KITGEN_WORKSPACE/projects/du-an-cua-toi/kit/kit.json" ] || \
  fail "PROJECT CỦA NGƯỜI DÙNG BỊ XOÁ — đây là dữ liệu, mất là mất trắng" "$OUT1"
[ -f "$KITGEN_WORKSPACE/.kitgen/config.json" ] || fail "config.json của workspace bị xoá" "$OUT1"
# Node riêng đang lành lặn thì GIỮ: xoá đi để tải lại 30 MB là đặt cả lượt cài vào tay
# đường mạng, ngay sau khi vừa gỡ bản cũ.
[ -x "$KITGEN_HOME/tools/node/bin/node" ] || fail "Node riêng lành lặn vẫn bị xoá" "$OUT1"
[ ! -s "$KITGEN_TEST_STATE/curl.log" ] || \
  fail "installer phải ra mạng sau lượt gỡ sạch" "$KITGEN_TEST_STATE/curl.log" "$OUT1"

# — ③ CÀI ĐƯỢC SAU KHI GỠ —
[ -f "$KITGEN_HOME/releases/3.0.0-thu/agent/engine/cli.mjs" ] || fail "bản mới không được dựng" "$OUT1"
[ "$(readlink "$KITGEN_HOME/current")" = "$KITGEN_HOME/releases/3.0.0-thu" ] || \
  fail "current không trỏ bản vừa cài" "$OUT1"
[ -x "$KITGEN_HOME/bin/kitgen" ] || fail "lệnh kitgen không được cài lại" "$OUT1"
# `codex update` là hành động DUY NHẤT được phép chạm tới codex chung của máy, và bộ ca
# này tắt nó bằng KITGEN_SKIP_CODEX_UPDATE — không lượt nào được lách qua cờ ấy.
[ ! -s "$KITGEN_TEST_STATE/codex-update.log" ] || \
  fail "installer nâng codex dù KITGEN_SKIP_CODEX_UPDATE=1" "$KITGEN_TEST_STATE/codex-update.log" "$OUT1"

# ═══════════════════════════════════════════════════════════════════════════════
# ④ — 3.x → 3.x LÀ LƯỢT UPDATE CÙNG ĐỜI: GIỮ BẢN TRƯỚC ĐỂ LÙI
# Quét sạch ở đây là vứt mất đường rollback — đúng thứ install-launchd/install-restart
# dựa vào khi bản mới không lên được.
# ═══════════════════════════════════════════════════════════════════════════════
OUT2="$TEST_ROOT/update-same-gen.out"
run_install "$OUT2" --update --archive "$ARCHIVE_301" --sha256 "$(cat "$ARCHIVE_301.sha256")" --no-start
[ "$status" -eq 0 ] || fail "lượt update cùng đời thoát $status" "$OUT2"
grep -q 'Gỡ bản cũ (cài lại từ đầu)' "$OUT2" && \
  fail "3.x → 3.x mà vẫn quét sạch — bản trước là đường lùi, không phải rác" "$OUT2"
[ -d "$KITGEN_HOME/releases/3.0.0-thu" ] || \
  fail "bản 3.0.0-thu bị xoá trong lượt update cùng đời — không còn gì để lùi về" "$OUT2"
[ "$(readlink "$KITGEN_HOME/current")" = "$KITGEN_HOME/releases/3.0.1-thu" ] || \
  fail "current không trỏ bản 3.0.1-thu" "$OUT2"
grep -q '\[6/6\]' "$OUT2" || fail "lượt cùng đời phải đi đúng 6 bước như cũ" "$OUT2"

# ⑤ — `--fresh` ép quét ngay cả khi máy đã sạch (đường dành cho người dùng gặp sự cố)
OUT3="$TEST_ROOT/forced.out"
run_install "$OUT3" --update --fresh --archive "$ARCHIVE_301" --sha256 "$(cat "$ARCHIVE_301.sha256")" --no-start
[ "$status" -eq 0 ] || fail "lượt --fresh thoát $status" "$OUT3"
grep -q 'Gỡ bản cũ (cài lại từ đầu)' "$OUT3" || fail "--fresh không ép được lượt quét" "$OUT3"
[ ! -e "$KITGEN_HOME/releases/3.0.0-thu" ] || fail "--fresh mà bản cũ vẫn còn" "$OUT3"
[ -f "$KITGEN_WORKSPACE/projects/du-an-cua-toi/kit/kit.json" ] || \
  fail "--fresh xoá cả project của người dùng" "$OUT3"

echo "install-fresh-sweep: máy đời cũ bị gỡ sạch rồi cài lại · config/logs/project sống sót · 3.x→3.x vẫn giữ bản lùi · --fresh ép được"
