#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-start-test.XXXXXX")"
cleanup(){ rm -rf "$TEST_ROOT"; }
trap cleanup EXIT INT TERM

export HOME="$TEST_ROOT/home"
export KITGEN_HOME="$HOME/.kitgen"
export KITGEN_TEST_STATE="$TEST_ROOT/state"
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$HOME/Library/LaunchAgents" "$KITGEN_HOME" "$KITGEN_TEST_STATE" "$FAKE_BIN"
: > "$HOME/Library/LaunchAgents/com.kitgen.agent.plist"

cat > "$FAKE_BIN/uname" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' Darwin
EOF
cat > "$FAKE_BIN/id" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' 501
EOF
cat > "$FAKE_BIN/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/launchctl" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/launchctl.log"
case "${1:-}" in
  print) [ -f "$KITGEN_TEST_STATE/registered" ] ;;
  bootstrap)
    count=0
    [ ! -f "$KITGEN_TEST_STATE/bootstraps" ] || count="$(cat "$KITGEN_TEST_STATE/bootstraps")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$KITGEN_TEST_STATE/bootstraps"
    if [ "$count" -eq 1 ]; then
      echo "Bootstrap failed: 5: Input/output error" >&2
      exit 5
    fi
    : > "$KITGEN_TEST_STATE/registered"
    ;;
  kickstart) [ -f "$KITGEN_TEST_STATE/registered" ] ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$FAKE_BIN/uname" "$FAKE_BIN/id" "$FAKE_BIN/sleep" "$FAKE_BIN/launchctl"

PATH="$FAKE_BIN:$PATH" "$ROOT/runtime/bin/kitgen" start

[ "$(cat "$KITGEN_TEST_STATE/bootstraps")" -eq 2 ] || {
  echo "kitgen start did not retry a transient launchctl bootstrap failure" >&2
  cat "$KITGEN_TEST_STATE/launchctl.log" >&2
  exit 1
}
grep -Eq '^kickstart -k gui/501/com\.kitgen\.agent$' "$KITGEN_TEST_STATE/launchctl.log" || {
  echo "kitgen start did not kickstart the registered LaunchAgent" >&2
  cat "$KITGEN_TEST_STATE/launchctl.log" >&2
  exit 1
}

echo "kitgen-launchd-start: transient bootstrap failure retried"
