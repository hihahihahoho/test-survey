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
RELEASE_MANIFEST="${KITGEN_RELEASE_MANIFEST:-https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json}"
AUTO_RELEASE=0
ARCHIVE=""
EXPECTED_SHA=""
NO_START=0
IS_UPDATE=0
CODEX_PROFILE="${KITGEN_CODEX_PROFILE:-default}"
# Chỉ cờ --codex-* gõ tay mới được phép ĐÈ lựa chọn hồ sơ đã lưu trong workspace
# config (người dùng đổi hồ sơ qua UI sau khi cài → env/config.env là giá trị cũ,
# không phải ý muốn hiện tại; regression: mỗi lần update lại reset về default-home).
CODEX_EXPLICIT=0
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
    --codex-default) CODEX_PROFILE="default"; CODEX_EXPLICIT=1 ;;
    --codex-img) CODEX_PROFILE="separate"; CODEX_EXPLICIT=1 ;;
    --update) IS_UPDATE=1 ;;
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
wait_for_health(){
  attempts="${1:-10}"
  while [ "$attempts" -gt 0 ]; do
    "$BIN" status >/dev/null 2>&1 && return 0
    attempts=$((attempts - 1))
    [ "$attempts" -eq 0 ] || sleep 1
  done
  return 1
}
append_install_log(){
  [ -s "$1" ] || return 0
  {
    printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$2"
    cat "$1"
  } >> "$KITGEN_HOME/install.log"
}
progress(){ printf '\n[%s] %s\n' "$1" "$2"; }
check_ok(){ printf '  OK   %s\n' "$1"; }
check_warn(){ printf '  WARN %s\n' "$1" >&2; }

# Default installs always reuse the user's normal Codex profile. A separate
# image profile can be selected later from the runtime status popover.
case "$CODEX_PROFILE" in default|separate) ;; *) echo "Invalid Codex profile: $CODEX_PROFILE" >&2; exit 2 ;; esac

# Normal installs and `kitgen update` resolve the newest immutable GitHub asset.
# An explicit URL remains available for mirrors and pinned/offline deployments.
if ! is_release "$SELF_DIR" && ! is_source "$SELF_DIR" && [ -z "$ARCHIVE" ] && [ -z "$RELEASE_URL" ]; then
  AUTO_RELEASE=1
  command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
  case "$RELEASE_REPO" in */*) ;; *) echo "Invalid GitHub repository: $RELEASE_REPO" >&2; exit 2 ;; esac
  META="$(curl -fsSL --retry 3 "$RELEASE_MANIFEST" 2>/dev/null || true)"
  if [ -n "$META" ]; then
    RELEASE_URL="$(printf '%s' "$META" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("archive", ""))')"
  else
    echo "Cannot read the KitGen release manifest." >&2
    exit 1
  fi
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
  # Giữ tính "explicit": chỉ truyền lại cờ --codex-* nếu lượt gọi này thật sự nhận nó,
  # để lần exec sau không tưởng nhầm giá trị mặc định là lựa chọn gõ tay.
  PROFILE_FLAG=""
  if [ "$CODEX_EXPLICIT" -eq 1 ]; then
    PROFILE_FLAG="--codex-default"; [ "$CODEX_PROFILE" = "separate" ] && PROFILE_FLAG="--codex-img"
  fi
  exec "$0" --archive "$ARCHIVE" --workspace "$WORKSPACE" --origin "$ORIGIN" --port "$PORT" $PROFILE_FLAG $([ "$NO_START" -eq 1 ] && echo --no-start)
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
progress "1/6" "Kiểm tra gói cài đặt"
check_ok "runtime $VERSION và checksum hợp lệ"
NEW="$DEST.new"
rm -rf "$NEW"
mkdir -p "$NEW"
cp -R "$CANDIDATE/." "$NEW/"
NODE="$KITGEN_HOME/tools/node/bin/node"
MAJOR=0
[ ! -x "$NODE" ] || MAJOR="$($NODE -p 'Number(process.versions.node.split(".")[0])')"
if [ "$MAJOR" -lt 20 ]; then
  NODE_VERSION="20.19.5"
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) NODE_PLATFORM="darwin-arm64" ;;
    Darwin-x86_64) NODE_PLATFORM="darwin-x64" ;;
    Linux-aarch64|Linux-arm64) NODE_PLATFORM="linux-arm64" ;;
    Linux-x86_64) NODE_PLATFORM="linux-x64" ;;
    *) echo "Unsupported platform for automatic Node installation: $(uname -s) $(uname -m)" >&2; exit 1 ;;
  esac
  NODE_PKG="node-v$NODE_VERSION-$NODE_PLATFORM.tar.gz"
  NODE_BASE="https://nodejs.org/dist/v$NODE_VERSION"
  echo "Installing private Node.js runtime..."
  curl -fsSL --retry 3 "$NODE_BASE/$NODE_PKG" -o "$TMP/$NODE_PKG"
  curl -fsSL --retry 3 "$NODE_BASE/SHASUMS256.txt" -o "$TMP/node-shasums.txt"
  EXPECTED_NODE_SHA="$(awk -v f="$NODE_PKG" '$2 == f { print $1 }' "$TMP/node-shasums.txt")"
  ACTUAL_NODE_SHA="$(shasum -a 256 "$TMP/$NODE_PKG" | awk '{print $1}')"
  [ -n "$EXPECTED_NODE_SHA" ] && [ "$EXPECTED_NODE_SHA" = "$ACTUAL_NODE_SHA" ] || { echo "Node checksum mismatch." >&2; exit 1; }
  rm -rf "$KITGEN_HOME/tools/node"
  mkdir -p "$KITGEN_HOME/tools/node"
  tar -xzf "$TMP/$NODE_PKG" -C "$KITGEN_HOME/tools/node" --strip-components=1
  NODE="$KITGEN_HOME/tools/node/bin/node"
fi
progress "2/6" "Health check môi trường nền"
check_ok "Node $($NODE --version 2>/dev/null || printf '>=20') · $NODE"
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required." >&2; exit 1; }
check_ok "$(python3 --version 2>&1) · $(command -v python3)"
# Self-test before switching current; production artifacts intentionally omit tests.
"$NODE" --check "$NEW/agent/server.mjs" >/dev/null
rm -rf "$DEST"
mv "$NEW" "$DEST"
PREVIOUS="$(readlink "$KITGEN_HOME/current" 2>/dev/null || true)"
ln -sfn "$DEST" "$KITGEN_HOME/current"
VENV="$WORKSPACE/.venv"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/python" -c 'import PIL,numpy,scipy,pymatting' >/dev/null 2>&1 || {
  echo "Installing image-processing dependencies..."
  PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV/bin/python" -m pip install --quiet --upgrade pillow numpy scipy pymatting
}

# Prefer an existing healthy Codex CLI. Persisting its absolute path means the
# background service does not depend on launchd/systemd inheriting the shell PATH.
progress "3/6" "Health check Codex CLI"
SYSTEM_CODEX="$(command -v codex 2>/dev/null || true)"
if [ -n "$SYSTEM_CODEX" ] && [ -x "$SYSTEM_CODEX" ] && "$SYSTEM_CODEX" --version >/dev/null 2>&1; then
  CODEX_BIN="$SYSTEM_CODEX"
  check_ok "dùng Codex đã có: $($CODEX_BIN --version 2>/dev/null | head -n1) · $CODEX_BIN"
elif [ -x "$KITGEN_HOME/tools/node_modules/.bin/codex" ] && "$KITGEN_HOME/tools/node_modules/.bin/codex" --version >/dev/null 2>&1; then
  CODEX_BIN="$KITGEN_HOME/tools/node_modules/.bin/codex"
  check_ok "dùng Codex riêng của KitGen: $($CODEX_BIN --version 2>/dev/null | head -n1)"
else
  [ -z "$SYSTEM_CODEX" ] || check_warn "có lệnh Codex tại $SYSTEM_CODEX nhưng health check --version thất bại"
  echo "Installing Codex CLI..."
  mkdir -p "$KITGEN_HOME/tools"
  "$KITGEN_HOME/tools/node/bin/npm" install --silent --prefix "$KITGEN_HOME/tools" @openai/codex 2>/dev/null || \
    "$(dirname "$NODE")/npm" install --silent --prefix "$KITGEN_HOME/tools" @openai/codex
  CODEX_BIN="$KITGEN_HOME/tools/node_modules/.bin/codex"
fi
[ -x "$CODEX_BIN" ] && "$CODEX_BIN" --version >/dev/null 2>&1 || { echo "Codex CLI health check failed after installation." >&2; exit 1; }

# Playwright renders the HTML/SVG skeleton at full fidelity. Install it inside
# KitGen's private tool prefix so users never need a global npm package.
if ! NODE_PATH="$KITGEN_HOME/tools/node_modules" "$NODE" -e "require.resolve('playwright')" >/dev/null 2>&1; then
  echo "Installing Playwright..."
  "$(dirname "$NODE")/npm" install --silent --prefix "$KITGEN_HOME/tools" playwright
fi
progress "4/6" "Health check trình dựng ảnh"
PLAYWRIGHT_BROWSERS_PATH="$KITGEN_HOME/tools/playwright-browsers" \
  "$KITGEN_HOME/tools/node_modules/.bin/playwright" install --only-shell >/dev/null
# App chỉ render skeleton ở chế độ headless → chỉ cần chromium_headless_shell (~196MB).
# Bản Chromium đầy đủ (~356MB) do installer đời cũ tải về là thừa — dọn để update nhẹ đi.
rm -rf "$KITGEN_HOME/tools/playwright-browsers"/chromium-[0-9]* 2>/dev/null || true
check_ok "Playwright và Chromium đã sẵn sàng"
mkdir -p "$WORKSPACE/.kitgen/engine" "$WORKSPACE/projects"
cp -R "$DEST/engine/." "$WORKSPACE/.kitgen/engine/"
cp "$DEST/runtime/bin/kitgen" "$KITGEN_HOME/bin/kitgen"
chmod +x "$KITGEN_HOME/bin/kitgen" "$WORKSPACE/.kitgen/engine/gen.sh"
if [ "$CODEX_PROFILE" = "separate" ]; then
  CODEX_MODE="img-home"; CODEX_HOME_LABEL="~/.codex-img"
else
  CODEX_MODE="default-home"; CODEX_HOME_LABEL=""
fi
python3 - "$WORKSPACE/.kitgen/config.json" "$CODEX_MODE" "$CODEX_HOME_LABEL" "$CODEX_EXPLICIT" <<'PY'
import json, os, sys
p, mode, home, explicit = sys.argv[1:]
try:
    with open(p) as f: cfg = json.load(f)
except Exception: cfg = {}
cfg.setdefault("workspaceVersion", 1); cfg.setdefault("maxJobs", 4)
img = {"mode": mode}
if home: img["codexHome"] = home
# Hồ sơ tạo ảnh là lựa chọn NGƯỜI DÙNG đổi được qua UI (PATCH /api/image-profile)
# sau khi cài. Update chạy lại install.sh với giá trị cũ của lần cài đầu — nếu ghi
# đè vô điều kiện thì mỗi lần update lại reset lựa chọn (mất thanh quota, gen về
# nhầm hồ sơ). Chỉ ghi khi: cờ --codex-* gõ tay, hoặc config chưa có lựa chọn nào.
existing = cfg.get("imageGen")
if explicit == "1" or not (isinstance(existing, dict) and existing.get("mode")):
    cfg["imageGen"] = img
tmp = p + ".tmp"
with open(tmp, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
os.replace(tmp, p)
PY
cp "$DEST/install.sh" "$KITGEN_HOME/install.sh"
# `command -v codex` trong shell fnm trả về symlink tạm ~/.local/state/fnm_multishells/<pid>_<ts>/
# — thư mục này chết theo phiên shell, ghi vào config.env là gen hỏng sau reboot.
# Ghi realpath để đường dẫn sống bền qua các phiên.
CODEX_BIN="$(python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$CODEX_BIN" 2>/dev/null || echo "$CODEX_BIN")"
cat > "$KITGEN_HOME/config.env" <<CFG
KITGEN_HOME='$KITGEN_HOME'
KITGEN_SOURCE='$KITGEN_HOME/current'
KITGEN_WORKSPACE='$WORKSPACE'
KITGEN_PORT='$PORT'
KITGEN_ORIGIN='$ORIGIN'
KITGEN_NODE='$NODE'
KITGEN_CODEX_BIN='$CODEX_BIN'
NODE_PATH='$KITGEN_HOME/tools/node_modules'
PLAYWRIGHT_BROWSERS_PATH='$KITGEN_HOME/tools/playwright-browsers'
KITGEN_RELEASE_URL='$([ "$AUTO_RELEASE" -eq 1 ] && printf '' || printf '%s' "$RELEASE_URL")'
KITGEN_RELEASE_REPO='$RELEASE_REPO'
KITGEN_RELEASE_CHANNEL='$RELEASE_CHANNEL'
KITGEN_CODEX_PROFILE='$CODEX_PROFILE'
CFG
chmod 600 "$KITGEN_HOME/config.env"
BIN="$KITGEN_HOME/bin/kitgen"
progress "5/6" "Đăng ký dịch vụ local"
if [ "$NO_START" -eq 0 ]; then
  if [ "$(uname -s)" = Darwin ]; then
    PLIST="$HOME/Library/LaunchAgents/com.kitgen.agent.plist"
    mkdir -p "$(dirname "$PLIST")"
    sed -e "s|@KITGEN_BIN@|$BIN|g" -e "s|@KITGEN_HOME@|$KITGEN_HOME|g" "$DEST/runtime/service/com.kitgen.agent.plist.in" > "$PLIST"
    DOMAIN="gui/$(id -u)"
    SERVICE="$DOMAIN/com.kitgen.agent"
    launchctl bootout "$DOMAIN/com.kitgen.agent" 2>/dev/null || \
      launchctl unload "$PLIST" 2>/dev/null || true
    # bootout may return before launchd has fully removed the old registration.
    for _ in 1 2 3 4 5; do
      launchctl print "$SERVICE" >/dev/null 2>&1 || break
      sleep 1
    done
    if "$BIN" start 2>"$TMP/launchctl.err"; then
      append_install_log "$TMP/launchctl.err" "LaunchAgent start recovered after retry"
    else
      append_install_log "$TMP/launchctl.err" "LaunchAgent start failed; using login-session fallback"
      echo "launchd is unavailable; starting KitGen for this login session instead." >&2
      cat "$TMP/launchctl.err" >&2
      nohup "$BIN" run >>"$KITGEN_HOME/agent.log" 2>&1 &
    fi
  elif command -v systemctl >/dev/null 2>&1; then
    UNIT="$HOME/.config/systemd/user/kitgen-agent.service"; mkdir -p "$(dirname "$UNIT")"
    sed "s|@KITGEN_BIN@|$BIN|g" "$DEST/runtime/service/kitgen-agent.service.in" > "$UNIT"
    systemctl --user daemon-reload; systemctl --user enable --now kitgen-agent
  else nohup "$BIN" run >>"$KITGEN_HOME/agent.log" 2>&1 & fi
  if ! wait_for_health 10; then
    if [ -n "$PREVIOUS" ]; then
      ln -sfn "$PREVIOUS" "$KITGEN_HOME/current"
      if ! "$BIN" restart 2>"$TMP/rollback-launchctl.err"; then
        append_install_log "$TMP/rollback-launchctl.err" "Previous LaunchAgent restart failed"
      fi
      if wait_for_health 10; then
        echo "Update failed health check; previous runtime restored and restarted." >&2
      else
        echo "Update failed health check; previous runtime files were restored, but its agent could not be restarted." >&2
      fi
    else
      echo "Install failed health check; no previous runtime is available." >&2
    fi
    exit 1
  fi
  progress "6/6" "Health check dịch vụ"
  check_ok "agent phản hồi tại http://127.0.0.1:$PORT/health"
else
  progress "6/6" "Bỏ qua health check dịch vụ (--no-start)"
fi
echo "KitGen $VERSION installed: $DEST"
echo "Command: $BIN"
echo "Open: http://127.0.0.1:$PORT/app/"
if [ "$CODEX_PROFILE" = "separate" ] && [ ! -f "$HOME/.codex-img/auth.json" ]; then
  echo "Login for the separate image profile: CODEX_HOME=$HOME/.codex-img codex login"
elif [ ! -f "$HOME/.codex/auth.json" ]; then
  echo "One step remains: $CODEX_BIN login"
else
  echo "Image profile: Codex default (~/.codex)"
fi
