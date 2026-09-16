#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-easy-install-test.XXXXXX")"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

fail() {
  echo "easy-install: $*" >&2
  exit 1
}

command_count="$(find "$ROOT/easy-install" -maxdepth 1 -type f \( -name '*.command' -o -name '*.bat' \) | wc -l | tr -d ' ')"
[ "$command_count" -eq 8 ] || fail "expected 8 wrapper files, found $command_count"

[ -f "$ROOT/easy-install/README-macos.md" ] || fail "missing macOS README source"
[ -f "$ROOT/easy-install/README-windows.md" ] || fail "missing Windows README source"
[ ! -e "$ROOT/easy-install/README.md" ] || fail "obsolete combined README remains"

for script in "$ROOT"/easy-install/*.command; do
  [ -x "$script" ] || fail "not executable: $script"
  head -n 1 "$script" | grep -qx '#!/usr/bin/env bash' || fail "missing bash shebang: $script"
  [ "$(sed -n '2p' "$script")" = 'set -euo pipefail' ] || fail "missing strict mode: $script"
  bash -n "$script" || fail "bash -n failed: $script"
done

for script in "$ROOT"/easy-install/*.bat; do
  if LC_ALL=C grep -n '[^ -~]' "$script"; then
    fail "non-ASCII byte in Windows wrapper: $script"
  fi
  grep -q 'powershell -NoProfile -ExecutionPolicy Bypass' "$script" || fail "missing PowerShell bypass: $script"
  # $home/$host/... la bien tu dong read-only cua PowerShell: gan vao la vo
  # ngay khi chay ($ErrorActionPreference='Stop'), da can nguoi dung that 24/08.
  if LC_ALL=C grep -qiE '\$(home|host|pid|error|input|profile|pwd|args|myinvocation|psscriptroot|pscommandpath|shellid|executioncontext) *=[^=]' "$script"; then
    fail "assignment to reserved PowerShell automatic variable in: $script"
  fi
  [ "$(xxd -p -l 3 "$script")" != 'efbbbf' ] || fail "BOM in Windows wrapper: $script"
done

MAC_ZIP="$TEST_ROOT/kitgen-easy-install-macos.zip"
WINDOWS_ZIP="$TEST_ROOT/kitgen-easy-install-windows.zip"
# ── DỰNG HAI GÓI ZIP — BẰNG `zip`, KHÔNG BẰNG PYTHON ────────────────────────
# Trước 16/09/2026 chỗ này là hai heredoc `python3` (~70 dòng `zipfile`). Sau khi cả
# sản phẩm bỏ Python, một bộ ca còn cần python3 mới chạy được là một bộ ca đo sản phẩm
# bằng cái máy mà sản phẩm không hứa. Quan trọng hơn: workflow phát hành dựng ZIP bằng
# `zip -q -X` — nên bộ ca phải dựng ĐÚNG CÁCH ẤY, chứ không phải một cách thứ hai vốn
# có thể xanh trong khi đường thật đỏ.
build_zip() {   # build_zip <zip> <README nguồn> <wrapper…>
  _zip="$1"; _readme="$2"; shift 2
  _stage="$TEST_ROOT/stage-$(basename "$_zip" .zip)"
  rm -rf "$_stage"; mkdir -p "$_stage"
  [ -f "$ROOT/easy-install/$_readme" ] || fail "missing easy-install file: $_readme"
  cp "$ROOT/easy-install/$_readme" "$_stage/README.md"
  for _w in "$@"; do
    [ -f "$ROOT/easy-install/$_w" ] || fail "missing easy-install file: $_w"
    cp -p "$ROOT/easy-install/$_w" "$_stage/$_w"
  done
  rm -f "$_zip"
  ( cd "$_stage" && zip -q -X "$_zip" README.md "$@" ) || fail "zip thất bại: $_zip"
  echo "built $_zip"
}
MAC_WRAPPERS="install.command start-server.command stop-server.command uninstall.command"
WIN_WRAPPERS="install.bat start-server.bat stop-server.bat uninstall.bat"
# Bit +x phải có TỪ TRONG KHO (git mode 100755) — workflow cũng `chmod +x` thêm một lần,
# nhưng nếu kho mất bit thì người tải ZIP từ Releases vẫn nhận được file không chạy được.
for w in $MAC_WRAPPERS; do
  [ -x "$ROOT/easy-install/$w" ] || fail "easy-install/$w mất bit thực thi trong kho (git mode phải là 100755)"
done
build_zip "$MAC_ZIP" README-macos.md $MAC_WRAPPERS
build_zip "$WINDOWS_ZIP" README-windows.md $WIN_WRAPPERS

# ── KIỂM HAI GÓI ─────────────────────────────────────────────────────────────
check_names() {   # check_names <zip> <tên…>
  _zip="$1"; shift
  _want="$(printf '%s\n' "$@")"
  _got="$(zipinfo -1 "$_zip")"
  [ "$_got" = "$_want" ] || fail "$_zip: wrong file list: $(printf '%s' "$_got" | tr '\n' ' ')"
}
check_names "$MAC_ZIP" README.md $MAC_WRAPPERS
check_names "$WINDOWS_ZIP" README.md $WIN_WRAPPERS

zipinfo -1 "$MAC_ZIP" | grep -q '\.bat$' && fail "macOS ZIP contains a Windows wrapper"
zipinfo -1 "$WINDOWS_ZIP" | grep -q '\.command$' && fail "Windows ZIP contains a macOS wrapper"

# `zipinfo` in: "-rwxr-xr-x  3.0 unx  <cỡ> …  <tên>". Cột 1 là quyền, cột 3 là HỆ ĐIỀU
# HÀNH dựng gói ("unx"). Cả hai đều phải đúng, nếu không macOS tải về sẽ có một file
# .command bấm đúp KHÔNG CHẠY — đúng ca người dùng thật gặp.
for w in $MAC_WRAPPERS; do
  line="$(zipinfo "$MAC_ZIP" "$w" | tail -n 1)"
  case "$line" in
    -rwxr-xr-x*' unx '*) : ;;
    *) fail "macOS ZIP lost execute mode for $w: $line" ;;
  esac
done

# README trong gói phải là README của ĐÚNG nền tảng đó (đổi tên thành README.md).
readme_of() { unzip -p "$1" README.md; }
for term in 'macOS' 'quarantine' 'right-click' 'Open' '~/KitGen' 'KEEPS'; do
  readme_of "$MAC_ZIP" | grep -qF "$term" || fail "macOS ZIP README thiếu «$term»"
done
for term in 'windows' '.bat' 'smartscreen'; do
  readme_of "$MAC_ZIP" | grep -qiF "$term" && fail "macOS ZIP README is not macOS-only (có «$term»)"
done
for term in 'Windows' 'SmartScreen' 'More info' 'Run anyway' 'Explorer' 'temporary' '%USERPROFILE%\KitGen' 'KEEPS'; do
  readme_of "$WINDOWS_ZIP" | grep -qF "$term" || fail "Windows ZIP README thiếu «$term»"
done
for term in 'macos' '.command' 'quarantine'; do
  readme_of "$WINDOWS_ZIP" | grep -qiF "$term" && fail "Windows ZIP README is not Windows-only (có «$term»)"
done
echo "verified $MAC_ZIP"
echo "verified $WINDOWS_ZIP"

FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/id" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 501
EOF
cat > "$FAKE_BIN/launchctl" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/launchctl.log"
exit 0
EOF
chmod +x "$FAKE_BIN/id" "$FAKE_BIN/launchctl"

run_uninstall_fixture() {
  local home="$1" answer="$2"
  mkdir -p "$home/.kitgen" "$home/Library/LaunchAgents" "$home/KitGen"
  printf '%s\n' keep > "$home/KitGen/keep.txt"
  # Trong thu muc DU LIEU co ca RUNTIME: `.venv` (ban doi cu con numpy/scipy/pymatting,
  # ~314 MB) va `.kitgen/engine` (ban copy cua engine). Ca hai do installer dung lai
  # duoc, nen "giu du lieu" KHONG duoc phep giu chung.
  mkdir -p "$home/KitGen/.venv/lib/python3.13/site-packages/numpy" \
           "$home/KitGen/.kitgen/engine" "$home/KitGen/projects/demo"
  printf '%s\n' venv > "$home/KitGen/.venv/pyvenv.cfg"
  printf '%s\n' engine > "$home/KitGen/.kitgen/engine/gen.sh"
  printf '%s\n' '{"workspaceVersion":1}' > "$home/KitGen/.kitgen/config.json"
  printf '%s\n' project > "$home/KitGen/projects/demo/kit.json"
  printf '%s\n' service > "$home/.kitgen/marker"
  printf '%s\n' plist > "$home/Library/LaunchAgents/com.kitgen.agent.plist"
  KITGEN_TEST_STATE="$TEST_ROOT/state-$answer"
  mkdir -p "$KITGEN_TEST_STATE"
  export KITGEN_TEST_STATE
  printf '%s\n\n' "$answer" |
    HOME="$home" PATH="$FAKE_BIN:$PATH" "$ROOT/easy-install/uninstall.command" >"$home/uninstall.out" 2>&1
}

HOME_NO="$TEST_ROOT/home-no"
run_uninstall_fixture "$HOME_NO" n
[ ! -e "$HOME_NO/.kitgen" ] || fail "default uninstall kept .kitgen"
[ ! -e "$HOME_NO/Library/LaunchAgents/com.kitgen.agent.plist" ] || fail "LaunchAgent plist remained"
[ -f "$HOME_NO/KitGen/keep.txt" ] || fail "default uninstall deleted user data"
[ -f "$HOME_NO/KitGen/projects/demo/kit.json" ] || fail "default uninstall deleted a project"
[ -f "$HOME_NO/KitGen/.kitgen/config.json" ] || fail "default uninstall deleted workspace config"
# Runtime trong thu muc du lieu PHAI di, ke ca khi nguoi dung chon giu du lieu.
[ ! -e "$HOME_NO/KitGen/.venv" ] || fail "default uninstall kept the heavy .venv runtime"
[ ! -e "$HOME_NO/KitGen/.kitgen/engine" ] || fail "default uninstall kept the copied engine"
grep -q '\.venv' "$HOME_NO/uninstall.out" || fail "uninstall did not say it removed .venv"
grep -q '\.kitgen/engine' "$HOME_NO/uninstall.out" || fail "uninstall did not say it removed the engine copy"
grep -q 'projects' "$HOME_NO/uninstall.out" || fail "uninstall did not say what it kept"
grep -q 'gui/501/com.kitgen.agent' "$TEST_ROOT/state-n/launchctl.log" || fail "wrong launchd label/domain"

HOME_Y="$TEST_ROOT/home-yes"
run_uninstall_fixture "$HOME_Y" y
[ ! -e "$HOME_Y/.kitgen" ] || fail "confirmed uninstall kept .kitgen"
[ ! -e "$HOME_Y/KitGen" ] || fail "confirmed uninstall kept requested user data"

RUN_HOME="$TEST_ROOT/home-run"
RUN_STATE="$TEST_ROOT/run-state"
mkdir -p "$RUN_HOME/.kitgen/bin" "$RUN_STATE"
cat > "$RUN_HOME/.kitgen/bin/kitgen" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  start) : > "$KITGEN_TEST_STATE/up" ;;
  stop) rm -f "$KITGEN_TEST_STATE/up" ;;
  *) exit 2 ;;
esac
EOF
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
[ -f "$KITGEN_TEST_STATE/up" ]
EOF
cat > "$FAKE_BIN/open" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/open.log"
EOF
chmod +x "$RUN_HOME/.kitgen/bin/kitgen" "$FAKE_BIN/curl" "$FAKE_BIN/open"
export KITGEN_TEST_STATE="$RUN_STATE"
printf '\n' |
  HOME="$RUN_HOME" KITGEN_HOME="$RUN_HOME/.kitgen" PATH="$FAKE_BIN:$PATH" \
  "$ROOT/easy-install/start-server.command" >"$RUN_HOME/start.out" 2>&1
[ -f "$RUN_STATE/up" ] || fail "start wrapper did not run kitgen start"
grep -q '127.0.0.1:8765/app/' "$RUN_STATE/open.log" || fail "start wrapper did not open app"
printf '\n' |
  HOME="$RUN_HOME" KITGEN_HOME="$RUN_HOME/.kitgen" PATH="$FAKE_BIN:$PATH" \
  "$ROOT/easy-install/stop-server.command" >"$RUN_HOME/stop.out" 2>&1
[ ! -e "$RUN_STATE/up" ] || fail "stop wrapper did not run kitgen stop"
grep -q 'KitGen da dung' "$RUN_HOME/stop.out" || fail "stop wrapper did not confirm stopped"

# `uninstall.bat` phai lam DUNG viec do tren Windows: khong chay duoc o day nen kiem
# theo VAN BAN — mot nhanh `else` xoa .venv + .kitgen\engine khi giu du lieu.
grep -q "@('\.venv','\.kitgen\\\\engine')" "$ROOT/easy-install/uninstall.bat" || \
  fail "uninstall.bat khong xoa .venv/.kitgen\\engine khi giu du lieu"

# Huong dan "go ban cu, cai ban moi tinh" phai co trong CA HAI README dong vao ZIP.
grep -q 'Gỡ bản cũ' "$ROOT/easy-install/README-macos.md" || fail "README macOS thieu muc go ban cu"
grep -q 'Gỡ bản cũ' "$ROOT/easy-install/README-windows.md" || fail "README Windows thieu muc go ban cu"
grep -q 'Gỡ bản cũ' "$ROOT/README-USER.md" || fail "README-USER.md thieu muc go ban cu"

echo "easy-install: 8 wrappers, two platform ZIPs, file separation/README/mode checks, syntax/encoding checks, start/stop health/browser, uninstall fixture keep/delete (runtime .venv + engine luon bi xoa), huong dan cai moi tinh passed"
