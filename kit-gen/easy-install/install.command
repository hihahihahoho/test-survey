#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SELF_DIR"

KITGEN_HOME="${KITGEN_HOME:-$HOME/.kitgen}"
PORT="${KITGEN_PORT:-8765}"
ORIGIN="${KITGEN_ORIGIN:-http://127.0.0.1:$PORT}"
APP_URL="http://127.0.0.1:$PORT/app/"
RAW_INSTALL_URL="https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/install.sh"
INSTALLER=""

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
  APP_URL="http://127.0.0.1:$PORT/app/"
}

wait_for_health() {
  local attempts="${1:-30}"
  while [ "$attempts" -gt 0 ]; do
    if curl -fsS -H 'X-KitGen-Client: 1' -H "Origin: $ORIGIN" \
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
  [ -z "$INSTALLER" ] || rm -f -- "$INSTALLER"
  if [ "$rc" -eq 0 ]; then
    echo "KitGen da cai xong."
  else
    echo "Cai KitGen that bai (ma $rc). Xem loi o phia tren." >&2
  fi
  read -r -p "Nhấn Enter để đóng..." _ || true
  exit "$rc"
}

trap 'finish "$?"' EXIT

# Gatekeeper cach ly TUNG file: duyet install.command khong duyet cac file canh ben.
# Go co quarantine cho ca bo wrapper de sau nay bam dup uninstall/stop chay duoc ngay.
xattr -d com.apple.quarantine "$SELF_DIR"/*.command >/dev/null 2>&1 || true

command -v curl >/dev/null 2>&1 || { echo "Khong tim thay curl." >&2; exit 1; }
INSTALLER="$(mktemp "${TMPDIR:-/tmp}/kitgen-install.XXXXXX")"
echo "Dang tai bo cai dat KitGen..."
curl -fsSL --retry 3 "$RAW_INSTALL_URL" -o "$INSTALLER"
bash "$INSTALLER" --codex-default

load_runtime_config
echo "Dang cho KitGen phan hoi health..."
wait_for_health 30 || {
  echo "KitGen chua phan hoi tai http://127.0.0.1:$PORT/health." >&2
  exit 1
}
open "$APP_URL"
echo "Da mo $APP_URL"
