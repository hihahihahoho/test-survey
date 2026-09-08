#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# P0 — "PIP TUYỆT ĐỐI KHÔNG ĐƯỢC BIÊN DỊCH" + "KITGEN MANG THEO PYTHON RIÊNG".
#
# Hiện trường: lời gọi `pip install` KHÔNG có `--only-binary` (bản đời đó còn cài cả
# numpy/scipy/pymatting; nay chỉ còn pillow, nhưng luật thì không đổi một chữ).
# Máy nào không có wheel dựng sẵn (Python 3.14 chẳng hạn) là pip đi BIÊN DỊCH từ nguồn —
# ninja bung một tiến trình mỗi nhân CPU, mỗi tiến trình hơn 1 GB RAM. Người dùng thật
# báo máy ĐƠ hoàn toàn: chuột còn di được, bấm gì cũng không ăn, phải giữ nút nguồn.
# Gốc rễ sâu hơn: mình để MÁY NGƯỜI DÙNG quyết định phiên bản Python, trong khi Node
# đã pin cứng + kiểm checksum từ lâu.
#
# Bộ này khoá sáu mệnh đề:
#   ① MỌI lời gọi pip trong CẢ HAI installer đều mang `--only-binary=:all:`;
#   ② pin Python (version + build) của install.sh và install.ps1 là MỘT;
#   ③ checksum được đối chiếu TRƯỚC khi giải nén, ở cả hai installer;
#   ④ install.ps1 không còn đường "cài xong nhưng chưa gen được ảnh";
#   ⑤ máy có Python trong dải có wheel ⇒ KHÔNG tải gì thêm, và pip vẫn mang cờ;
#   ⑥ máy có Python ngoài dải ⇒ tải ĐÚNG asset đã pin, và checksum lệch thì DỪNG,
#      tuyệt đối không giải nén.
#
# Không ra mạng: `curl` giả phục vụ một "GitHub release" dựng ngay trong thư mục tạm.
# ═══════════════════════════════════════════════════════════════════════════════
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
INSTALL_SH="$ROOT/install.sh"
INSTALL_PS1="$ROOT/scripts/install.ps1"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-python-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

fail(){ echo "FAIL: $1" >&2; shift; for f in "$@"; do [ -f "$f" ] && { echo "--- $f" >&2; cat "$f" >&2; }; done; exit 1; }

# ── ① pip KHÔNG BAO GIỜ được chạy thiếu --only-binary ─────────────────────────
# Quét theo VĂN BẢN chứ không theo hành vi: một lời gọi pip nằm trong nhánh hiếm cũng
# đủ treo máy người dùng, mà nhánh hiếm thì test hành vi không đi qua.
for f in "$INSTALL_SH" "$INSTALL_PS1"; do
  n_pip=0
  while IFS= read -r line; do
    n_pip=$((n_pip + 1))
    case "$line" in
      *--only-binary=:all:*) ;;
      *) fail "pip install thiếu --only-binary=:all: trong $f: $line" ;;
    esac
  done <<EOF
$(grep -n "pip'*, *'install\|pip install\|'pip', 'install'" "$f" | grep -v '^[0-9]*: *#')
EOF
  [ "$n_pip" -ge 1 ] || fail "không tìm thấy lời gọi pip nào trong $f — mẫu quét đã lạc, test này đang không đo gì"
done

# ── ② Pin Python phải giống nhau ở hai installer ──────────────────────────────
SH_VER="$(sed -n 's/^PYTHON_VERSION="\([^"]*\)".*/\1/p' "$INSTALL_SH" | head -n1)"
SH_BLD="$(sed -n 's/^PYTHON_BUILD="\([^"]*\)".*/\1/p' "$INSTALL_SH" | head -n1)"
PS_VER="$(sed -n "s/^\$PYTHON_VERSION *= *'\([^']*\)'.*/\1/p" "$INSTALL_PS1" | head -n1)"
PS_BLD="$(sed -n "s/^\$PYTHON_BUILD *= *'\([^']*\)'.*/\1/p" "$INSTALL_PS1" | head -n1)"
[ -n "$SH_VER" ] && [ -n "$SH_BLD" ] || fail "install.sh không pin cứng PYTHON_VERSION/PYTHON_BUILD"
[ -n "$PS_VER" ] && [ -n "$PS_BLD" ] || fail "install.ps1 không pin cứng \$PYTHON_VERSION/\$PYTHON_BUILD"
[ "$SH_VER" = "$PS_VER" ] || fail "pin lệch: install.sh=$SH_VER · install.ps1=$PS_VER"
[ "$SH_BLD" = "$PS_BLD" ] || fail "pin build lệch: install.sh=$SH_BLD · install.ps1=$PS_BLD"

# ── ③ Checksum phải được đối chiếu TRƯỚC khi giải nén ─────────────────────────
sh_check="$(grep -n 'EXPECTED_PYTHON_SHA" = "\$ACTUAL_PYTHON_SHA' "$INSTALL_SH" | head -n1 | cut -d: -f1)"
sh_untar="$(grep -n 'tar -xzf "\$TMP/\$PYTHON_PKG"' "$INSTALL_SH" | head -n1 | cut -d: -f1)"
[ -n "$sh_check" ] && [ -n "$sh_untar" ] || fail "install.sh: không thấy cặp kiểm-checksum / giải-nén Python"
[ "$sh_check" -lt "$sh_untar" ] || fail "install.sh giải nén Python (dòng $sh_untar) TRƯỚC khi kiểm checksum (dòng $sh_check)"
ps_check="$(grep -n "Get-Sha256 \$pyTar" "$INSTALL_PS1" | head -n1 | cut -d: -f1)"
ps_untar="$(grep -n "giai nen Python" "$INSTALL_PS1" | head -n1 | cut -d: -f1)"
[ -n "$ps_check" ] && [ -n "$ps_untar" ] || fail "install.ps1: không thấy cặp kiểm-checksum / giải-nén Python"
[ "$ps_check" -lt "$ps_untar" ] || fail "install.ps1 giải nén Python trước khi kiểm checksum"

# ── ④ install.ps1 KHÔNG còn đường "cài xong nhưng chất lượng thấp" ────────────
grep -q "Write-Block 'scipy/pymatting'" "$INSTALL_PS1" && \
  fail "install.ps1 vẫn cài tiếp rồi ghi scipy/pymatting vào checklist — chủ sản phẩm đã bác đường này"
grep -q 'se dung Python he thong' "$INSTALL_PS1" && \
  fail "install.ps1 vẫn lùi về Python hệ thống khi venv hỏng"
true

# ═══════════════════════════════════════════════════════════════════════════════
# Phần hành vi: chạy install.sh thật trong một HOME tạm, mọi thứ bên ngoài đều giả.
# ═══════════════════════════════════════════════════════════════════════════════
export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_WORKSPACE="$HOME/KitGen"
export KITGEN_TEST_STATE="$TEST_ROOT/state"
export KITGEN_PYTHON_RUNTIME_BASE="https://kitgen.test.invalid/releases/download/runtime-python-$SH_VER"
FAKE_BIN="$TEST_ROOT/bin"
RELEASE="$TEST_ROOT/kitgen-runtime-2.1.5"
PY_RELEASE="$KITGEN_TEST_STATE/py-release"

mkdir -p "$FAKE_BIN" "$KITGEN_TEST_STATE" "$PY_RELEASE" \
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

# ── Python giả ────────────────────────────────────────────────────────────────
# Trả lời đúng bốn câu installer hỏi (phiên bản, base_prefix, dựng venv), còn lại uỷ
# quyền cho python3 thật — installer vẫn cần một trình Python chạy được để ghi
# config.json. `$KITGEN_TEST_PY_MINOR` là núm vặn của từng ca thử.
REAL_PYTHON3="$(command -v python3)"
cat > "$TEST_ROOT/fake-python3" <<EOF
#!/usr/bin/env bash
REAL_PYTHON3='$REAL_PYTHON3'
EOF
cat >> "$TEST_ROOT/fake-python3" <<'EOF'
_self_base="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "${1:-}" = "-m" ] && [ "${2:-}" = "venv" ]; then
  _venv="$3"
  mkdir -p "$_venv/bin"
  printf '%s\n' "$_self_base" > "$_venv/pyvenv-base"
  cat > "$_venv/bin/python" <<'VEOF'
#!/usr/bin/env bash
_base="$(cat "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/pyvenv-base")"
case "$*" in
  *"sys.base_prefix"*) printf '%s\n' "$_base"; exit 0 ;;
  *"sys.version.split"*) printf '%s\n' '3.13.15'; exit 0 ;;
  # Thư viện CHƯA có ⇒ installer buộc phải đi qua pip, đúng thứ ca thử muốn quan sát.
  *"import PIL"*) exit 1 ;;
esac
if [ "${1:-}" = "-m" ] && [ "${2:-}" = "pip" ]; then
  shift 2
  printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/pip.log"
  exit "${KITGEN_TEST_PIP_EXIT:-0}"
fi
exit 0
VEOF
  chmod +x "$_venv/bin/python"
  ln -sf python "$_venv/bin/python3"
  printf 'venv %s <- %s\n' "$_venv" "$_self_base" >> "$KITGEN_TEST_STATE/py.log"
  exit 0
fi
case "$*" in
  *"sys.version_info[:3]"*) printf '%s.15\n' "${KITGEN_TEST_PY_MINOR:-3.13}"; exit 0 ;;
  *"sys.version_info[:2]"*) printf '%s\n' "${KITGEN_TEST_PY_MINOR:-3.13}"; exit 0 ;;
  *"sys.base_prefix"*) printf '%s\n' "$_self_base"; exit 0 ;;
  --version) printf 'Python %s.15\n' "${KITGEN_TEST_PY_MINOR:-3.13}"; exit 0 ;;
esac
exec "$REAL_PYTHON3" "$@"
EOF
chmod +x "$TEST_ROOT/fake-python3"
cp "$TEST_ROOT/fake-python3" "$FAKE_BIN/python3"

# ── "GitHub release" runtime Python giả: đúng tên asset mà installer sẽ đi tìm ──
PY_ASSET="cpython-$SH_VER+$SH_BLD-aarch64-apple-darwin-install_only.tar.gz"
mkdir -p "$TEST_ROOT/pystage/python/bin"
# Bản NẰM TRONG TARBALL luôn tự khai 3.13 — nó chính là bản pin cứng, không được
# nghe theo núm vặn `$KITGEN_TEST_PY_MINOR` vốn dùng để giả lập Python CỦA MÁY.
{ head -n 1 "$TEST_ROOT/fake-python3"
  printf 'KITGEN_TEST_PY_MINOR=3.13\n'
  tail -n +2 "$TEST_ROOT/fake-python3"
} > "$TEST_ROOT/pystage/python/bin/python3"
chmod +x "$TEST_ROOT/pystage/python/bin/python3"
tar -C "$TEST_ROOT/pystage" -czf "$PY_RELEASE/$PY_ASSET" python
(cd "$PY_RELEASE" && shasum -a 256 "$PY_ASSET" > SHA256SUMS)
# Bảng checksum SAI dùng cho ca ⑥b.
sed 's/^[0-9a-f]/0/' "$PY_RELEASE/SHA256SUMS" > "$PY_RELEASE/SHA256SUMS.bad"

# ── các lệnh ngoài khác ───────────────────────────────────────────────────────
cat > "$KITGEN_HOME/tools/node/bin/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '%s\n' 20 ;;
  *) exit 0 ;;
esac
EOF
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$KITGEN_HOME/tools/node/bin/npm"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$KITGEN_HOME/tools/node_modules/.bin/codex"
# Codex "chính thức" đã có ở ~/.local/bin (nơi installer OpenAI đặt): installer phải
# DÙNG LẠI nó chứ không đi tải — nếu thiếu file này, nhánh tải codex sẽ làm bẩn curl.log
# và ca ⑤ ("không tải gì") sẽ fail vì một lý do chẳng liên quan tới Python.
mkdir -p "$HOME/.local/bin"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$HOME/.local/bin/codex"
chmod +x "$HOME/.local/bin/codex"
cat > "$FAKE_BIN/uname" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -s|'') printf '%s\n' Darwin ;;
  -m) printf '%s\n' arm64 ;;
esac
EOF
# curl giả = toàn bộ "mạng" của bộ test. URL nào không phải release runtime Python thì
# hỏng — nghĩa là installer đang tải thứ mà ca thử không lường trước.
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -eu
url=""; out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    --retry) shift ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
printf '%s\n' "$url" >> "$KITGEN_TEST_STATE/curl.log"
src="$KITGEN_TEST_STATE/py-release/${url##*/}"
[ "${url##*/}" = SHA256SUMS ] && src="$KITGEN_TEST_STATE/py-release/SHA256SUMS${KITGEN_TEST_SUMS_SUFFIX:-}"
[ -f "$src" ] || exit 22
cp "$src" "$out"
EOF
chmod +x "$KITGEN_HOME/tools/node/bin/node" "$KITGEN_HOME/tools/node/bin/npm" \
  "$KITGEN_HOME/tools/node_modules/.bin/codex" "$FAKE_BIN/uname" "$FAKE_BIN/curl"

reset_state(){
  rm -f "$KITGEN_TEST_STATE/curl.log" "$KITGEN_TEST_STATE/pip.log" "$KITGEN_TEST_STATE/py.log"
  rm -rf "$KITGEN_HOME/tools/python" "$KITGEN_WORKSPACE/.venv"
}
run_install(){   # run_install <out-file>
  set +e
  PATH="$FAKE_BIN:/usr/bin:/bin" "$RELEASE/install.sh" --no-start >"$1" 2>&1
  status=$?
  set -e
}

# ── ⑤ Python hệ thống trong dải có wheel ⇒ KHÔNG tải gì, pip vẫn mang cờ ──────
reset_state
export KITGEN_TEST_PY_MINOR=3.13
OUT="$TEST_ROOT/out-system.txt"
run_install "$OUT"
[ "$status" -eq 0 ] || fail "ca Python hệ thống 3.13: installer hỏng" "$OUT"
[ ! -s "$KITGEN_TEST_STATE/curl.log" ] || \
  fail "Python hệ thống 3.13 đã đủ mà installer vẫn đi tải: $(cat "$KITGEN_TEST_STATE/curl.log")" "$OUT"
grep -q -- '--only-binary=:all:' "$KITGEN_TEST_STATE/pip.log" || \
  fail "pip chạy KHÔNG có --only-binary=:all: (đây là cái đã treo máy người dùng)" "$KITGEN_TEST_STATE/pip.log" "$OUT"
# `py.log` ghi "venv <đường dẫn> <- <base_prefix của trình đã dựng>". Ở ca này base
# KHÔNG được là bản riêng của KitGen. (So chuỗi con chứ không so tuyệt đối: macOS trả
# /private/var còn $TMPDIR là /var — cùng một chỗ, khác chữ.)
grep -q 'tools/python' "$KITGEN_TEST_STATE/py.log" && \
  fail "venv lại được dựng từ bản Python riêng dù máy đã có 3.13" "$KITGEN_TEST_STATE/py.log" "$OUT"
grep -q '^venv ' "$KITGEN_TEST_STATE/py.log" || \
  fail "installer không dựng venv nào" "$KITGEN_TEST_STATE/py.log" "$OUT"

# ── ⑥a Python hệ thống ngoài dải ⇒ tải ĐÚNG asset đã pin rồi dùng bản riêng ───
reset_state
export KITGEN_TEST_PY_MINOR=3.14
OUT="$TEST_ROOT/out-download.txt"
run_install "$OUT"
[ "$status" -eq 0 ] || fail "ca Python hệ thống 3.14: installer hỏng" "$OUT"
grep -qx "$KITGEN_PYTHON_RUNTIME_BASE/$PY_ASSET" "$KITGEN_TEST_STATE/curl.log" || \
  fail "installer không tải đúng asset đã pin ($PY_ASSET)" "$KITGEN_TEST_STATE/curl.log" "$OUT"
grep -qx "$KITGEN_PYTHON_RUNTIME_BASE/SHA256SUMS" "$KITGEN_TEST_STATE/curl.log" || \
  fail "installer không tải bảng checksum" "$KITGEN_TEST_STATE/curl.log" "$OUT"
[ -x "$KITGEN_HOME/tools/python/bin/python3" ] || fail "bản Python riêng không được giải nén" "$OUT"
grep -q 'tools/python' "$KITGEN_TEST_STATE/py.log" || \
  fail "venv không được dựng từ bản Python riêng" "$KITGEN_TEST_STATE/py.log" "$OUT"
grep -q -- '--only-binary=:all:' "$KITGEN_TEST_STATE/pip.log" || \
  fail "pip chạy KHÔNG có --only-binary=:all:" "$KITGEN_TEST_STATE/pip.log" "$OUT"

# ── ⑥b Checksum lệch ⇒ DỪNG, tuyệt đối không giải nén ─────────────────────────
reset_state
export KITGEN_TEST_SUMS_SUFFIX=.bad
OUT="$TEST_ROOT/out-badsum.txt"
run_install "$OUT"
unset KITGEN_TEST_SUMS_SUFFIX
[ "$status" -ne 0 ] || fail "checksum lệch mà installer vẫn báo thành công" "$OUT"
grep -qi 'checksum mismatch' "$OUT" || fail "installer không nói ra là checksum lệch" "$OUT"
[ ! -e "$KITGEN_HOME/tools/python/bin/python3" ] || \
  fail "installer đã giải nén một gói Python chưa qua kiểm checksum" "$OUT"

# ── ⑥c Không tải được bảng checksum ⇒ cũng DỪNG ───────────────────────────────
reset_state
export KITGEN_TEST_SUMS_SUFFIX=.khong-ton-tai
OUT="$TEST_ROOT/out-nosums.txt"
run_install "$OUT"
unset KITGEN_TEST_SUMS_SUFFIX
[ "$status" -ne 0 ] || fail "thiếu bảng checksum mà installer vẫn cài tiếp" "$OUT"
[ ! -e "$KITGEN_HOME/tools/python/bin/python3" ] || \
  fail "installer giải nén gói Python dù không có gì để đối chiếu" "$OUT"

echo "install-python-runtime: pip luôn --only-binary=:all: · pin khớp hai nền tảng · checksum trước khi giải nén · hệ thống 3.13 không tải · 3.14 tải đúng asset · checksum lệch/thiếu thì dừng"
