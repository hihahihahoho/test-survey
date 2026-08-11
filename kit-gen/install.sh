#!/usr/bin/env bash
# Install/update a prebuilt KitGen runtime. No sudo; credentials stay in Codex homes.
set -eu
KITGEN_HOME="${KITGEN_HOME:-$HOME/.kitgen}"
WORKSPACE="${KITGEN_WORKSPACE:-$HOME/KitGen}"
PORT="${KITGEN_PORT:-8765}"
ORIGIN="${KITGEN_ORIGIN:-http://127.0.0.1:$PORT}"
RELEASE_URL="${KITGEN_RELEASE_URL:-}"
RELEASE_REPO="${KITGEN_RELEASE_REPO:-hihahihahoho/test-survey}"
RELEASE_CHANNEL="${KITGEN_RELEASE_CHANNEL:-latest}"
AUTO_RELEASE=0
ARCHIVE=""
EXPECTED_SHA=""
NO_START=0
CODEX_PROFILE="${KITGEN_CODEX_PROFILE:-default}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift ;;
    --release-url) RELEASE_URL="$2"; shift ;;
    --repo) RELEASE_REPO="$2"; shift ;;
    --sha256) EXPECTED_SHA="$2"; shift ;;
    --workspace) WORKSPACE="$2"; shift ;;
    --origin) ORIGIN="$2"; shift ;;
    --port) PORT="$2"; [ "$ORIGIN" = "http://127.0.0.1:8765" ] && ORIGIN="http://127.0.0.1:$2"; shift ;;
    --no-start) NO_START=1 ;;
    --codex-default) CODEX_PROFILE="default" ;;
    --codex-img) CODEX_PROFILE="separate" ;;
    --update) ;;
    -h|--help)
      echo "Usage: install.sh [--archive runtime.tar.gz | --release-url URL] [--sha256 HASH]"
      echo "                  [--repo OWNER/REPO]"
      echo "                  [--workspace PATH] [--origin URL] [--port N] [--no-start]"
      echo "                  [--codex-default | --codex-img]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$KITGEN_HOME/releases" "$KITGEN_HOME/bin" "$WORKSPACE"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-install.XXXXXX")"
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT INT TERM

# A release directory has these three roots. Running from source is supported for development.
is_release(){ [ -f "$1/agent/server.mjs" ] && [ -f "$1/engine/gen.sh" ] && [ -f "$1/app/index.html" ]; }
is_source(){ [ -f "$1/agent/server.mjs" ] && [ -f "$1/gen.sh" ] && [ -f "$1/scripts/build-runtime.sh" ]; }

if [ -t 0 ] && [ -t 1 ] && [ -z "${KITGEN_CODEX_PROFILE:-}" ]; then
  printf '\nCodex dùng để tạo ảnh:\n  1) Cấu hình Codex hiện tại (~/.codex) [mặc định]\n  2) Profile riêng (~/.codex-img)\nChọn [1]: '
  IFS= read -r answer || answer=""
  [ "$answer" = "2" ] && CODEX_PROFILE="separate"
fi
case "$CODEX_PROFILE" in default|separate) ;; *) echo "Invalid Codex profile: $CODEX_PROFILE" >&2; exit 2 ;; esac

# Normal installs and `kitgen update` resolve the newest immutable GitHub asset.
# An explicit URL remains available for mirrors and pinned/offline deployments.
if ! is_release "$SELF_DIR" && ! is_source "$SELF_DIR" && [ -z "$ARCHIVE" ] && [ -z "$RELEASE_URL" ]; then
  AUTO_RELEASE=1
  command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
  case "$RELEASE_REPO" in */*) ;; *) echo "Invalid GitHub repository: $RELEASE_REPO" >&2; exit 2 ;; esac
  API="https://api.github.com/repos/$RELEASE_REPO/releases/$RELEASE_CHANNEL"
  META="$(curl -fsSL --retry 3 -H 'Accept: application/vnd.github+json' "$API")" || {
    echo "Cannot find a KitGen release at $RELEASE_REPO ($RELEASE_CHANNEL)." >&2; exit 1;
  }
  RELEASE_URL="$(printf '%s' "$META" | python3 -c 'import json,sys; a=json.load(sys.stdin).get("assets",[]); print(next((x["browser_download_url"] for x in a if x["name"].endswith(".tar.gz")), ""))')"
  [ -n "$RELEASE_URL" ] || { echo "The latest release has no KitGen runtime archive." >&2; exit 1; }
fi
if is_release "$SELF_DIR"; then
  CANDIDATE="$SELF_DIR"
elif [ -n "$ARCHIVE" ] || [ -n "$RELEASE_URL" ]; then
  if [ -n "$ARCHIVE" ]; then cp "$ARCHIVE" "$TMP/runtime.tar.gz"
  else
    command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
    curl -fL --retry 3 "$RELEASE_URL" -o "$TMP/runtime.tar.gz"
    if [ -z "$EXPECTED_SHA" ]; then
      curl -fL --retry 3 "$RELEASE_URL.sha256" -o "$TMP/runtime.sha256"
      EXPECTED_SHA="$(awk '{print $1}' "$TMP/runtime.sha256")"
    fi
  fi
  if [ -z "$EXPECTED_SHA" ] && [ -n "$ARCHIVE" ] && [ -f "$ARCHIVE.sha256" ]; then
    EXPECTED_SHA="$(awk '{print $1}' "$ARCHIVE.sha256")"
  fi
  if [ -n "$EXPECTED_SHA" ]; then
    ACTUAL="$(shasum -a 256 "$TMP/runtime.tar.gz" | awk '{print $1}')"
    [ "$ACTUAL" = "$EXPECTED_SHA" ] || { echo "Runtime checksum mismatch." >&2; exit 1; }
  else
    echo "A checksum is required (--sha256 or an adjacent .sha256 file)." >&2
    exit 1
  fi
  ROOTS="$(tar -tzf "$TMP/runtime.tar.gz" | sed 's|^\./||; s|/.*||' | sed '/^$/d' | sort -u)"
  [ "$(printf '%s\n' "$ROOTS" | wc -l | tr -d ' ')" = 1 ] || { echo "Runtime archive must have exactly one root directory." >&2; exit 1; }
  case "$ROOTS" in kitgen-runtime-*) ;; *) echo "Unexpected runtime archive root: $ROOTS" >&2; exit 1 ;; esac
  tar -tzf "$TMP/runtime.tar.gz" | grep -Eq '(^|/)\.\.(/|$)' && { echo "Unsafe path in runtime archive." >&2; exit 1; }
  tar -xzf "$TMP/runtime.tar.gz" -C "$TMP"
  CANDIDATE="$TMP/$ROOTS"
elif is_source "$SELF_DIR"; then
  # Developer checkout: assemble the exact release first, then install that artifact.
  ARCHIVE="$($SELF_DIR/scripts/build-runtime.sh)"
  PROFILE_FLAG="--codex-default"; [ "$CODEX_PROFILE" = "separate" ] && PROFILE_FLAG="--codex-img"
  exec "$0" --archive "$ARCHIVE" --workspace "$WORKSPACE" --origin "$ORIGIN" --port "$PORT" "$PROFILE_FLAG" $([ "$NO_START" -eq 1 ] && echo --no-start)
else
  echo "No runtime supplied. Use --release-url URL or --archive FILE." >&2
  exit 2
fi
is_release "$CANDIDATE" || { echo "Invalid KitGen runtime archive." >&2; exit 1; }
(
  cd "$CANDIDATE"
  shasum -a 256 -c manifest.sha256 >/dev/null
)
VERSION="$(cat "$CANDIDATE/VERSION")"
case "$VERSION" in *[!0-9A-Za-z._-]*|'') echo "Invalid runtime version." >&2; exit 1 ;; esac
DEST="$KITGEN_HOME/releases/$VERSION"
NEW="$DEST.new"
rm -rf "$NEW"
mkdir -p "$NEW"
cp -R "$CANDIDATE/." "$NEW/"
NODE="$(command -v node 2>/dev/null || true)"
[ -n "$NODE" ] || { echo "Node >=20 is required." >&2; exit 1; }
MAJOR="$($NODE -p 'Number(process.versions.node.split(".")[0])')"
[ "$MAJOR" -ge 20 ] || { echo "Node >=20 is required." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required." >&2; exit 1; }
# Self-test before switching current; production artifacts intentionally omit tests.
"$NODE" --check "$NEW/agent/server.mjs" >/dev/null
rm -rf "$DEST"
mv "$NEW" "$DEST"
PREVIOUS="$(readlink "$KITGEN_HOME/current" 2>/dev/null || true)"
ln -sfn "$DEST" "$KITGEN_HOME/current"
VENV="$WORKSPACE/.venv"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/python" -c 'import PIL' >/dev/null 2>&1 || "$VENV/bin/python" -m pip install --quiet pillow
mkdir -p "$WORKSPACE/.kitgen/engine" "$WORKSPACE/projects"
cp -R "$DEST/engine/." "$WORKSPACE/.kitgen/engine/"
cp "$DEST/runtime/bin/kitgen" "$KITGEN_HOME/bin/kitgen"
chmod +x "$KITGEN_HOME/bin/kitgen" "$WORKSPACE/.kitgen/engine/gen.sh"
if [ "$CODEX_PROFILE" = "separate" ]; then
  CODEX_MODE="img-home"; CODEX_HOME_LABEL="~/.codex-img"
else
  CODEX_MODE="default-home"; CODEX_HOME_LABEL=""
fi
python3 - "$WORKSPACE/.kitgen/config.json" "$CODEX_MODE" "$CODEX_HOME_LABEL" <<'PY'
import json, os, sys
p, mode, home = sys.argv[1:]
try:
    with open(p) as f: cfg = json.load(f)
except Exception: cfg = {}
cfg.setdefault("workspaceVersion", 1); cfg.setdefault("maxJobs", 4)
img = {"mode": mode}
if home: img["codexHome"] = home
cfg["imageGen"] = img
tmp = p + ".tmp"
with open(tmp, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
os.replace(tmp, p)
PY
cp "$DEST/install.sh" "$KITGEN_HOME/install.sh"
cat > "$KITGEN_HOME/config.env" <<CFG
KITGEN_HOME='$KITGEN_HOME'
KITGEN_SOURCE='$KITGEN_HOME/current'
KITGEN_WORKSPACE='$WORKSPACE'
KITGEN_PORT='$PORT'
KITGEN_ORIGIN='$ORIGIN'
KITGEN_NODE='$NODE'
KITGEN_RELEASE_URL='$([ "$AUTO_RELEASE" -eq 1 ] && printf '' || printf '%s' "$RELEASE_URL")'
KITGEN_RELEASE_REPO='$RELEASE_REPO'
KITGEN_RELEASE_CHANNEL='$RELEASE_CHANNEL'
KITGEN_CODEX_PROFILE='$CODEX_PROFILE'
CFG
chmod 600 "$KITGEN_HOME/config.env"
BIN="$KITGEN_HOME/bin/kitgen"
if [ "$NO_START" -eq 0 ]; then
  if [ "$(uname -s)" = Darwin ]; then
    PLIST="$HOME/Library/LaunchAgents/com.kitgen.agent.plist"
    mkdir -p "$(dirname "$PLIST")"
    sed -e "s|@KITGEN_BIN@|$BIN|g" -e "s|@KITGEN_HOME@|$KITGEN_HOME|g" "$DEST/runtime/service/com.kitgen.agent.plist.in" > "$PLIST"
    launchctl bootout "gui/$(id -u)/com.kitgen.agent" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
  elif command -v systemctl >/dev/null 2>&1; then
    UNIT="$HOME/.config/systemd/user/kitgen-agent.service"; mkdir -p "$(dirname "$UNIT")"
    sed "s|@KITGEN_BIN@|$BIN|g" "$DEST/runtime/service/kitgen-agent.service.in" > "$UNIT"
    systemctl --user daemon-reload; systemctl --user enable --now kitgen-agent
  else nohup "$BIN" run >>"$KITGEN_HOME/agent.log" 2>&1 & fi
  sleep 1
  if ! "$BIN" status >/dev/null 2>&1; then
    [ -n "$PREVIOUS" ] && ln -sfn "$PREVIOUS" "$KITGEN_HOME/current"
    "$BIN" restart 2>/dev/null || true
    echo "Update failed health check; previous runtime restored." >&2
    exit 1
  fi
fi
echo "KitGen $VERSION installed: $DEST"
echo "Command: $BIN"
echo "Open: http://127.0.0.1:$PORT/app/"
if [ "$CODEX_PROFILE" = "separate" ] && [ ! -f "$HOME/.codex-img/auth.json" ]; then
  echo "Login for the separate image profile: CODEX_HOME=$HOME/.codex-img codex login"
else
  echo "Image profile: Codex default (~/.codex)"
fi
