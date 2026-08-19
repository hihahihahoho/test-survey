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
  [ "$(xxd -p -l 3 "$script")" != 'efbbbf' ] || fail "BOM in Windows wrapper: $script"
done

MAC_ZIP="$TEST_ROOT/kitgen-easy-install-macos.zip"
WINDOWS_ZIP="$TEST_ROOT/kitgen-easy-install-windows.zip"
python3 - "$ROOT/easy-install" "$MAC_ZIP" "$WINDOWS_ZIP" <<'PY'
import stat
import sys
import zipfile
from pathlib import Path

root = Path(sys.argv[1])
packages = {
    sys.argv[2]: ("README-macos.md", [
        "install.command",
        "start-server.command",
        "stop-server.command",
        "uninstall.command",
    ]),
    sys.argv[3]: ("README-windows.md", [
        "install.bat",
        "start-server.bat",
        "stop-server.bat",
        "uninstall.bat",
    ]),
}

for destination_name, (readme, wrappers) in packages.items():
    destination = Path(destination_name)
    sources = [("README.md", readme), *((name, name) for name in wrappers)]
    missing = [source for _, source in sources if not (root / source).is_file()]
    if missing:
        raise SystemExit("missing easy-install files: " + ", ".join(missing))
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for archive_name, source_name in sources:
            path = root / source_name
            info = zipfile.ZipInfo(archive_name)
            info.create_system = 3
            info.date_time = (1980, 1, 1, 0, 0, 0)
            info.external_attr = (stat.S_IMODE(path.stat().st_mode) & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    print("built", destination)
PY

python3 - "$MAC_ZIP" "$WINDOWS_ZIP" <<'PY'
import stat
import sys
import zipfile

macos_zip, windows_zip = sys.argv[1:]
expected = {
    macos_zip: ["README.md", "install.command", "start-server.command", "stop-server.command", "uninstall.command"],
    windows_zip: ["README.md", "install.bat", "start-server.bat", "stop-server.bat", "uninstall.bat"],
}

for filename, names in expected.items():
    with zipfile.ZipFile(filename) as archive:
        actual = archive.namelist()
        if actual != names:
            raise SystemExit(f"{filename}: wrong file list: {actual!r}")
        if filename == macos_zip:
            if any(name.endswith(".bat") for name in actual):
                raise SystemExit("macOS ZIP contains a Windows wrapper")
            for name in names[1:]:
                info = archive.getinfo(name)
                mode = (info.external_attr >> 16) & 0xFFFF
                if info.create_system != 3 or stat.S_IMODE(mode) != 0o755:
                    raise SystemExit(f"macOS ZIP lost execute mode for {name}: {oct(mode)}")
        else:
            if any(name.endswith(".command") for name in actual):
                raise SystemExit("Windows ZIP contains a macOS wrapper")
        readme = archive.read("README.md").decode("utf-8")
        if filename == macos_zip:
            required = ("macOS", "quarantine", "right-click", "Open", "~/KitGen", "KEEPS")
            if any(term not in readme for term in required) or any(term.lower() in readme.lower() for term in ("windows", ".bat", "smartscreen")):
                raise SystemExit("macOS ZIP README is not macOS-only")
        else:
            required = ("Windows", "SmartScreen", "More info", "Run anyway", "Explorer", "temporary", "%USERPROFILE%\\KitGen", "KEEPS")
            if any(term not in readme for term in required) or any(term.lower() in readme.lower() for term in ("macos", ".command", "quarantine")):
                raise SystemExit("Windows ZIP README is not Windows-only")
    print("verified", filename)
PY

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

echo "easy-install: 8 wrappers, two platform ZIPs, file separation/README/mode checks, syntax/encoding checks, start/stop health/browser, uninstall fixture keep/delete passed"
