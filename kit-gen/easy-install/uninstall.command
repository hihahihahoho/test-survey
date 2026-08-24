#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SELF_DIR"

KITGEN_HOME="${KITGEN_HOME:-$HOME/.kitgen}"
PLIST="$HOME/Library/LaunchAgents/com.kitgen.agent.plist"
PORT="${KITGEN_PORT:-8765}"
FAILED=0

config_value() {
  local key="$1"
  [ -f "$KITGEN_HOME/config.env" ] || return 0
  sed -n "s/^${key}='\\([^']*\\)'$/\\1/p" "$KITGEN_HOME/config.env" | head -n 1
}

# Doc workspace THAT tu config.env TRUOC khi xoa runtime — user co the cai
# workspace o cho khac, va config.env la dau vet duy nhat.
WORKSPACE="$(config_value KITGEN_WORKSPACE || true)"
[ -n "$WORKSPACE" ] || WORKSPACE="$HOME/KitGen"
value="$(config_value KITGEN_PORT || true)"
[ -z "$value" ] || PORT="$value"

stop_server() {
  # launchd co KeepAlive=true: phai bootout truoc, roi moi stop, roi cho tat han.
  if command -v launchctl >/dev/null 2>&1; then
    local domain="gui/$(id -u)"
    launchctl bootout "$domain/com.kitgen.agent" >/dev/null 2>&1 || \
      launchctl unload "$PLIST" >/dev/null 2>&1 || true
    for _ in 1 2 3; do
      launchctl print "$domain/com.kitgen.agent" >/dev/null 2>&1 || break
      sleep 1
    done
  else
    echo "Khong tim thay launchctl; bo qua unload dich vu." >&2
  fi
  if [ -x "$KITGEN_HOME/bin/kitgen" ]; then
    "$KITGEN_HOME/bin/kitgen" stop >/dev/null 2>&1 || true
  fi
  if command -v curl >/dev/null 2>&1; then
    for _ in 1 2 3 4 5; do
      curl -fsS --max-time 1 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 || return 0
      sleep 1
    done
    echo "Canh bao: server co ve van chay tren cong $PORT; van tiep tuc go." >&2
  fi
  return 0
}

safe_remove_kitgen_home() {
  [ -n "$KITGEN_HOME" ] || { echo "Duong dan KITGEN_HOME rong; dung de an toan." >&2; return 1; }
  [ "$KITGEN_HOME" != "/" ] || { echo "Tu choi xoa root filesystem." >&2; return 1; }
  [ "${KITGEN_HOME##*/}" = ".kitgen" ] || {
    echo "Duong dan cai dat khong ket thuc bang .kitgen; dung de an toan: $KITGEN_HOME" >&2
    return 1
  }
  if [ -e "$KITGEN_HOME" ] || [ -L "$KITGEN_HOME" ]; then
    rm -rf -- "$KITGEN_HOME"
    echo "Da xoa $KITGEN_HOME"
  else
    echo "Khong co $KITGEN_HOME"
  fi
}

safe_remove_workspace() {
  [ "$WORKSPACE" != "/" ] || { echo "Tu choi xoa root filesystem." >&2; return 1; }
  [ "${WORKSPACE##*/}" = "KitGen" ] || {
    echo "Duong dan du lieu bat ngo: $WORKSPACE; khong xoa." >&2
    return 1
  }
  if [ -e "$WORKSPACE" ] || [ -L "$WORKSPACE" ]; then
    # Khong bao gio rm -rf thu muc dang dung lam cwd.
    cd "$HOME"
    rm -rf -- "$WORKSPACE"
    echo "Da xoa du lieu $WORKSPACE"
  else
    echo "Khong co du lieu $WORKSPACE"
  fi
}

finish() {
  local rc="$1"
  trap - EXIT
  if [ "$rc" -eq 0 ] && [ "$FAILED" -eq 0 ]; then
    echo "Go cai KitGen hoan tat."
  else
    [ "$rc" -ne 0 ] || rc=1
    echo "Go cai KitGen chua xong het (ma $rc). Xem loi o phia tren." >&2
  fi
  read -r -p "Nhấn Enter để đóng..." _ || true
  exit "$rc"
}

trap 'finish "$?"' EXIT

echo "Go cai dich vu KitGen (com.kitgen.agent)."
stop_server
rm -f -- "$PLIST"
# Loi o buoc nao thi ghi nhan roi van di tiep — khong bo do giua chung.
safe_remove_kitgen_home || FAILED=1

echo "Mac dinh GIU NGUYEN du lieu $WORKSPACE."
answer=""
read -r -p "Ban co muon xoa toan bo du lieu $WORKSPACE khong? [y/N] " answer || true
case "$answer" in
  y|Y|yes|YES) safe_remove_workspace || FAILED=1 ;;
  *) echo "Da giu nguyen du lieu $WORKSPACE." ;;
esac

[ "$FAILED" -eq 0 ]
