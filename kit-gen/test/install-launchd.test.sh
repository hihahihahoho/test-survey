#!/usr/bin/env bash
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-launchd-test.XXXXXX")"
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
  "$RELEASE/agent" \
  "$RELEASE/app" \
  "$RELEASE/engine" \
  "$RELEASE/runtime/bin" \
  "$RELEASE/runtime/service"

printf '%s\n' '2.1.5' > "$RELEASE/VERSION"
printf '%s\n' 'export const testAgent = true' > "$RELEASE/agent/server.mjs"
printf '%s\n' '<!doctype html><title>KitGen test</title>' > "$RELEASE/app/index.html"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$RELEASE/engine/gen.sh"
cp "$ROOT/install.sh" "$RELEASE/install.sh"
cp "$ROOT/runtime/bin/kitgen" "$RELEASE/runtime/bin/kitgen"
cp "$ROOT/runtime/service/com.kitgen.agent.plist.in" "$RELEASE/runtime/service/com.kitgen.agent.plist.in"
chmod +x "$RELEASE/install.sh" "$RELEASE/engine/gen.sh" "$RELEASE/runtime/bin/kitgen"
(
  cd "$RELEASE"
  find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 shasum -a 256 > manifest.sha256
)

mkdir -p "$OLD_RELEASE"
ln -s "$OLD_RELEASE" "$KITGEN_HOME/current"

cat > "$KITGEN_HOME/tools/node/bin/node" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  -p) printf '%s\n' 20 ;;
  --check|-e) exit 0 ;;
  *) exit 0 ;;
esac
EOF
cat > "$KITGEN_HOME/tools/node_modules/.bin/codex" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$KITGEN_WORKSPACE/.venv/bin/python" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x \
  "$KITGEN_HOME/tools/node/bin/node" \
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
cat > "$FAKE_BIN/launchctl" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$KITGEN_TEST_STATE/launchctl.log"
case "${1:-}" in
  print)
    [ -f "$KITGEN_TEST_STATE/registered" ]
    ;;
  bootout|unload)
    rm -f "$KITGEN_TEST_STATE/registered"
    ;;
  bootstrap|load)
    : > "$KITGEN_TEST_STATE/registered"
    ;;
  kickstart)
    [ -f "$KITGEN_TEST_STATE/registered" ] || exit 3
    count=0
    [ ! -f "$KITGEN_TEST_STATE/kickstarts" ] || count="$(cat "$KITGEN_TEST_STATE/kickstarts")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$KITGEN_TEST_STATE/kickstarts"
    # Reproduce the reported failure: the newly installed job disappears before
    # it becomes healthy. Rollback must register the previous job again.
    [ "$count" -ne 1 ] || rm -f "$KITGEN_TEST_STATE/registered"
    ;;
  kill)
    [ -f "$KITGEN_TEST_STATE/registered" ]
    ;;
  *) exit 2 ;;
esac
EOF
cat > "$FAKE_BIN/curl" <<'EOF'
#!/usr/bin/env bash
set -eu
current="$(readlink "$KITGEN_HOME/current" 2>/dev/null || true)"
if [ "$current" = "$KITGEN_HOME/releases/2.1.4" ] && [ -f "$KITGEN_TEST_STATE/registered" ]; then
  printf '%s\n' '{"ok":true}'
  exit 0
fi
exit 22
EOF
chmod +x "$FAKE_BIN/uname" "$FAKE_BIN/id" "$FAKE_BIN/sleep" "$FAKE_BIN/launchctl" "$FAKE_BIN/curl"

OUTPUT="$TEST_ROOT/install.out"
set +e
PATH="$FAKE_BIN:$PATH" "$RELEASE/install.sh" >"$OUTPUT" 2>&1
status=$?
set -e

[ "$status" -ne 0 ] || { echo "expected failed 2.1.5 health check" >&2; exit 1; }
[ "$(readlink "$KITGEN_HOME/current")" = "$OLD_RELEASE" ] || {
  echo "installer did not restore the previous runtime symlink" >&2
  cat "$OUTPUT" >&2
  exit 1
}
[ -f "$KITGEN_TEST_STATE/registered" ] || {
  echo "installer left the previous LaunchAgent unregistered" >&2
  cat "$KITGEN_TEST_STATE/launchctl.log" >&2
  exit 1
}
[ "$(grep -c '^bootstrap ' "$KITGEN_TEST_STATE/launchctl.log")" -ge 2 ] || {
  echo "rollback did not bootstrap the missing previous LaunchAgent" >&2
  cat "$KITGEN_TEST_STATE/launchctl.log" >&2
  exit 1
}
grep -q 'previous runtime restored and restarted' "$OUTPUT" || {
  echo "installer reported rollback without proving the previous runtime was healthy" >&2
  cat "$OUTPUT" >&2
  exit 1
}

echo "install-launchd: rollback restored and restarted the previous runtime"
