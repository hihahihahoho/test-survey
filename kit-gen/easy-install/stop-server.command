#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SELF_DIR"

KITGEN_HOME="${KITGEN_HOME:-$HOME/.kitgen}"
KITGEN_BIN="$KITGEN_HOME/bin/kitgen"
PORT="${KITGEN_PORT:-8765}"
ORIGIN="${KITGEN_ORIGIN:-http://127.0.0.1:$PORT}"
PLIST="$HOME/Library/LaunchAgents/com.kitgen.agent.plist"

config_value() {
  local key="$1"
  [ -f "$KITGEN_HOME/config.env" ] || return 0
  sed -n "s/^${key}='\\([^']*\\)'$/\\1/p" "$KITGEN_HOME/config.env" | head -n 1
}

load_runtime_config() {
  local value
  value="$(config_value KITGEN_PORT || true)"
  [ -z "$value" ] || PORT="$value"
  value="$(config_value KITGEN_ORIGIN || true)"
  [ -z "$value" ] || ORIGIN="$value"
}

unload_launch_agent() {
  command -v launchctl >/dev/null 2>&1 || return 1
  local domain="gui/$(id -u)"
  launchctl bootout "$domain/com.kitgen.agent" >/dev/null 2>&1 || \
    launchctl unload "$PLIST" >/dev/null 2>&1
}

wait_for_stop() {
  local attempts="${1:-15}"
  while [ "$attempts" -gt 0 ]; do
    if ! curl -fsS -H 'X-KitGen-Client: 1' -H "Origin: $ORIGIN" \
      "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts - 1))
    [ "$attempts" -eq 0 ] || sleep 1
  done
  return 1
}

finish() {
  local rc="$1"
  trap - EXIT
  if [ "$rc" -eq 0 ]; then
    echo "KitGen da dung."
  else
    echo "Khong xac nhan duoc KitGen da dung (ma $rc)." >&2
  fi
  read -r -p "Nhấn Enter để đóng..." _ || true
  exit "$rc"
}

trap 'finish "$?"' EXIT

if [ ! -x "$KITGEN_BIN" ]; then
  echo "Chua cai KitGen. Hay bam dup install.command truoc." >&2
  exit 1
fi
load_runtime_config
"$KITGEN_BIN" stop
echo "Dang xac nhan dich vu da dung..."
if ! wait_for_stop 15; then
  echo "LaunchAgent KeepAlive da bat lai KitGen; dang unload dich vu..."
  unload_launch_agent || true
  wait_for_stop 15 || {
    echo "KitGen van phan hoi tai http://127.0.0.1:$PORT/health." >&2
    exit 1
  }
fi
