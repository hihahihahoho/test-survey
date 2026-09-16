#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# "INSTALLER KHÔNG ĐƯỢC CHẠM TỚI PYTHON" — bộ ca thay cho install-python-runtime.
#
# LỊCH SỬ NGẮN, VÌ NÓ LÀ LÝ DO BỘ CA NÀY TỒN TẠI:
#   · engine đời cũ là `gen.sh` + `slice.py`, nên installer phải có Python. Nó đi DÒ
#     python3 của máy; máy nào rơi ra ngoài dải có wheel thì `pip install` đi BIÊN DỊCH
#     từ nguồn — ninja bung một tiến trình mỗi nhân CPU, mỗi tiến trình hơn 1 GB RAM.
#     Một người dùng thật đã phải GIỮ NÚT NGUỒN để tắt máy.
#   · bản vá đời trước: pin cứng CPython, tải kèm checksum, `pip --only-binary=:all:`.
#     Bộ ca cũ (`install-python-runtime.test.sh`) canh chín mệnh đề của đường ấy.
#   · 16/09/2026: engine là JS. Đường ấy KHÔNG CÒN — và thứ phải canh đổi hẳn chiều:
#     không phải "tải Python cho đúng" mà là "ĐỪNG ĐỘNG VÀO PYTHON NỮA".
#
# Bốn mệnh đề:
#   ① VĂN BẢN: không installer nào còn `pip install`, `-m venv`, hay tải CPython;
#   ② lệnh `kitgen` không còn dựng PATH qua `.venv`, config.cmd không còn KITGEN_PYTHON;
#   ③ HÀNH VI: chạy install.sh với PATH KHÔNG CÓ python3 ⇒ cài trọn 6/6, mã 0, và
#      không đẻ ra `tools/python` hay `.venv` nào;
#   ④ di sản đời cũ (tools/python · .venv · .kitgen/engine) bị DỌN, có nói ra — từ
#      16/09/2026 việc dọn ấy là bước "Gỡ bản cũ" của lượt CÀI LẠI TỪ ĐẦU: thấy dấu
#      hiệu đời cũ ⇒ gỡ sạch rồi cài mới, và config.env + project phải sống sót.
#
# Không ra mạng: `curl` giả hỏng mọi lượt gọi và ghi sổ, nên một nhánh tải lén lút sẽ
# lộ ra ngay ở ca ③ chứ không âm thầm xanh.
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INSTALL_SH="$ROOT/install.sh"
INSTALL_PS1="$ROOT/scripts/install.ps1"
KITGEN_BIN="$ROOT/runtime/bin/kitgen"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-nopython-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

fail(){ echo "FAIL: $1" >&2; shift; for f in "$@"; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done; exit 1; }

# Bỏ dòng chú thích trước khi quét: cả hai installer CỐ Ý còn giữ văn giải thích nhắc
# tên những thứ đã xoá, và một bộ ca cấm người ta viết lịch sử là một bộ ca sai.
code_of(){ grep -v '^[[:space:]]*#' "$1"; }

# ── ① không còn pip / venv / tải CPython trong MÃ của hai installer ───────────
for f in "$INSTALL_SH" "$INSTALL_PS1"; do
  for pat in 'pip install' "'pip', 'install'" '-m venv' "'venv'" 'cpython-' 'PYTHON_WHEEL_OK'; do
    if code_of "$f" | grep -qF -- "$pat"; then
      fail "$(basename "$f") vẫn còn «$pat» trong MÃ — KitGen không được cài Python cho ai nữa"
    fi
  done
done
# Và không còn đi tìm một trình python nào để chạy.
code_of "$INSTALL_SH" | grep -qE 'command -v python3|KITGEN_PYTHON3' && \
  fail "install.sh vẫn dò python3 trên máy người dùng"
true

# ── ② lệnh `kitgen` và config của nó không còn nhắc tới venv/python ───────────
code_of "$KITGEN_BIN" | grep -qF '.venv' && \
  fail "runtime/bin/kitgen vẫn chèn .venv vào PATH của agent — đường dẫn ấy không còn tồn tại"
code_of "$INSTALL_PS1" | grep -qF 'KITGEN_PYTHON' && \
  fail "install.ps1 vẫn ghi KITGEN_PYTHON vào config.cmd"
true

# ═══════════════════════════════════════════════════════════════════════════════
# Phần hành vi: install.sh THẬT, trong một HOME tạm, PATH KHÔNG CÓ python3.
# ═══════════════════════════════════════════════════════════════════════════════
export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_WORKSPACE="$HOME/KitGen"
export KITGEN_TEST_STATE="$TEST_ROOT/state"
FAKE_BIN="$TEST_ROOT/bin"
RELEASE="$TEST_ROOT/kitgen-runtime-3.0.0"

mkdir -p "$FAKE_BIN" "$KITGEN_TEST_STATE" \
  "$KITGEN_HOME/releases" "$KITGEN_HOME/tools/node/bin" "$KITGEN_HOME/tools/node_modules/.bin" \
  "$RELEASE/agent/engine" "$RELEASE/app" "$RELEASE/runtime/bin" "$RELEASE/runtime/service"

printf '%s\n' '3.0.0' > "$RELEASE/VERSION"
printf '%s\n' 'export const testAgent = true' > "$RELEASE/agent/server.mjs"
printf '%s\n' 'export {}' > "$RELEASE/agent/engine/cli.mjs"
printf '%s\n' '<!doctype html><title>KitGen test</title>' > "$RELEASE/app/index.html"
cp "$INSTALL_SH" "$RELEASE/install.sh"
cp "$KITGEN_BIN" "$RELEASE/runtime/bin/kitgen"
cp "$ROOT/runtime/service/com.kitgen.agent.plist.in" "$RELEASE/runtime/service/com.kitgen.agent.plist.in"
chmod +x "$RELEASE/install.sh" "$RELEASE/runtime/bin/kitgen"
(
  cd "$RELEASE"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256
)

# Node riêng GIẢ. Nó là runtime DUY NHẤT installer còn được phép cần.
cat > "$KITGEN_HOME/tools/node/bin/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '%s\n' 20 ;;
  *) exit 0 ;;
esac
EOF
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$KITGEN_HOME/tools/node/bin/npm"
cat > "$FAKE_BIN/codex" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  --version) printf 'codex-cli 0.0.0-test\n'; exit 0 ;;
esac
exit 0
EOF
cat > "$FAKE_BIN/uname" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -s|'') printf '%s\n' Darwin ;;
  -m) printf '%s\n' arm64 ;;
esac
EOF
# Mạng bị cắt hẳn: một nhánh tải lén (CPython, Node, codex) sẽ làm installer thoát khác 0
# VÀ để lại dấu trong curl.log — không có đường xanh giả.
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/curl.log"
exit 22
EOF
chmod +x "$KITGEN_HOME/tools/node/bin/node" "$KITGEN_HOME/tools/node/bin/npm" \
  "$FAKE_BIN/codex" "$FAKE_BIN/uname" "$FAKE_BIN/curl"

# ── ③ PATH KHÔNG CÓ python3 ⇒ vẫn cài trọn vẹn ───────────────────────────────
# `$FAKE_BIN` đứng một mình: không /usr/bin, không /bin ⇒ không có python3, không có
# python. Ca này chính là "máy người dùng trắng" mà cả đợt port nhắm tới.
STRIP_PATH="$FAKE_BIN:/usr/bin:/bin"
command -v python3 >/dev/null 2>&1 && HAVE_SYS_PY=1 || HAVE_SYS_PY=0
NOPY_BIN="$TEST_ROOT/nopy"
mkdir -p "$NOPY_BIN"
# Chắn cứng: dù /usr/bin có python3 thì bản đứng TRƯỚC trên PATH sẽ hỏng và ghi sổ.
cat > "$NOPY_BIN/python3" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/python-called.log"
exit 127
EOF
cp "$NOPY_BIN/python3" "$NOPY_BIN/python"
chmod +x "$NOPY_BIN/python3" "$NOPY_BIN/python"

OUT="$TEST_ROOT/install.out"
set +e
PATH="$NOPY_BIN:$STRIP_PATH" "$RELEASE/install.sh" --no-start >"$OUT" 2>&1
status=$?
set -e
[ "$status" -eq 0 ] || fail "install.sh thoát $status trên máy không có Python" "$OUT"
grep -q '\[6/6\]' "$OUT" || fail "installer không đi hết 6/6" "$OUT"
[ ! -s "$KITGEN_TEST_STATE/python-called.log" ] || \
  fail "installer VẪN gọi python" "$KITGEN_TEST_STATE/python-called.log" "$OUT"
[ ! -e "$KITGEN_HOME/tools/python" ] || fail "installer vẫn dựng $KITGEN_HOME/tools/python" "$OUT"
[ ! -e "$KITGEN_WORKSPACE/.venv" ] || fail "installer vẫn dựng venv trong workspace" "$OUT"
[ ! -e "$KITGEN_WORKSPACE/.kitgen/engine" ] || \
  fail "installer vẫn chép engine vào workspace — agent nay đọc engine đi kèm gói" "$OUT"
[ -f "$KITGEN_HOME/releases/3.0.0/agent/engine/cli.mjs" ] || \
  fail "gói đã cài thiếu cửa vào engine JS" "$OUT"
[ ! -s "$KITGEN_TEST_STATE/curl.log" ] || \
  fail "installer ra mạng dù mọi thứ đã có sẵn" "$KITGEN_TEST_STATE/curl.log" "$OUT"

# ── ④ di sản đời Python bị DỌN, và installer NÓI RA ──────────────────────────
# Máy update từ bản ≤2.1.45 mang sẵn ba thư mục này. "Thôi không cài nữa" là chưa đủ:
# không dọn thì chúng nằm lại vĩnh viễn, và `.kitgen/engine` còn nguy hơn — `resolveEngine`
# thử `ws.engineDir` TRƯỚC, nên một engine đời cũ ở đó sẽ được agent mới chạy.
#
# Từ 16/09/2026 đây là ĐƯỜNG DUY NHẤT dọn những thứ ấy: installer nhận ra dấu hiệu đời
# cũ (tools/python · .venv · .kitgen/engine · VERSION đời <3) và gỡ SẠCH bản cũ trước
# khi cài bản mới. Nên ca này còn phải chứng minh vế thứ hai của lời hứa: thứ của NGƯỜI
# DÙNG (config.env, project) không được đi theo.
mkdir -p "$KITGEN_HOME/tools/python/bin" "$KITGEN_WORKSPACE/.venv/lib" "$KITGEN_WORKSPACE/.kitgen/engine" \
  "$KITGEN_WORKSPACE/projects/du-an-cua-toi"
printf '%s\n' 'giả' > "$KITGEN_HOME/tools/python/bin/python3"
printf '%s\n' 'kit.json của người dùng' > "$KITGEN_WORKSPACE/projects/du-an-cua-toi/kit.json"
printf '%s\n' 'giả' > "$KITGEN_WORKSPACE/.venv/pyvenv.cfg"
printf '%s\n' 'giả' > "$KITGEN_WORKSPACE/.kitgen/engine/gen.sh"
OUT2="$TEST_ROOT/install-cleanup.out"
set +e
PATH="$NOPY_BIN:$STRIP_PATH" "$RELEASE/install.sh" --update --no-start >"$OUT2" 2>&1
status=$?
set -e
[ "$status" -eq 0 ] || fail "lượt update thoát $status" "$OUT2"
[ ! -e "$KITGEN_HOME/tools/python" ] || fail "tools/python đời cũ không bị dọn" "$OUT2"
[ ! -e "$KITGEN_WORKSPACE/.venv" ] || fail ".venv đời cũ không bị dọn" "$OUT2"
[ ! -e "$KITGEN_WORKSPACE/.kitgen/engine" ] || fail ".kitgen/engine đời cũ không bị dọn" "$OUT2"
grep -q 'đã dọn .* di sản' "$OUT2" || \
  fail "installer xoá vài trăm MB của người dùng mà không nói một câu" "$OUT2"
grep -q 'Gỡ bản cũ (cài lại từ đầu)' "$OUT2" || \
  fail "lượt gỡ sạch không hiện thành một bước riêng — người dùng không biết máy vừa bị làm gì" "$OUT2"
[ -f "$KITGEN_HOME/releases/3.0.0/agent/engine/cli.mjs" ] || \
  fail "gỡ xong mà bản mới không được cài lại" "$OUT2"
[ "$(readlink "$KITGEN_HOME/current")" = "$KITGEN_HOME/releases/3.0.0" ] || \
  fail "current không trỏ bản vừa cài sau lượt gỡ sạch" "$OUT2"
# DANH SÁCH GIỮ: thứ của người dùng KHÔNG được đi theo bản cũ.
[ -d "$KITGEN_WORKSPACE/projects" ] || fail "thư mục projects biến mất sau lượt dọn" "$OUT2"
[ -f "$KITGEN_WORKSPACE/projects/du-an-cua-toi/kit.json" ] || \
  fail "project của người dùng bị xoá theo — đây là dữ liệu, không phải di sản" "$OUT2"
[ -f "$KITGEN_HOME/config.env" ] || fail "config.env không còn sau lượt gỡ sạch" "$OUT2"

if [ "$HAVE_SYS_PY" -eq 1 ]; then
  echo "install-no-python: (máy chạy test CÓ python3 — ca ③ vẫn chạy với PATH đã chắn)"
fi
echo "install-no-python: hai installer sạch pip/venv/CPython · cài trọn 6/6 không cần Python · di sản đời cũ bị dọn và được nói ra"
