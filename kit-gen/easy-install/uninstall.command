#!/usr/bin/env bash
set -euo pipefail

SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SELF_DIR"

KITGEN_HOME="${KITGEN_HOME:-$HOME/.kitgen}"
WORKSPACE="$HOME/KitGen"
PLIST="$HOME/Library/LaunchAgents/com.kitgen.agent.plist"

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
    rm -rf -- "$WORKSPACE"
    echo "Da xoa du lieu $WORKSPACE"
  else
    echo "Khong co du lieu $WORKSPACE"
  fi
}

finish() {
  local rc="$1"
  trap - EXIT
  if [ "$rc" -eq 0 ]; then
    echo "Go cai KitGen hoan tat."
  else
    echo "Go cai KitGen that bai (ma $rc). Xem loi o phia tren." >&2
  fi
  read -r -p "Nhấn Enter để đóng..." _ || true
  exit "$rc"
}

trap 'finish "$?"' EXIT

echo "Go cai dich vu KitGen (com.kitgen.agent)."
if command -v launchctl >/dev/null 2>&1; then
  DOMAIN="gui/$(id -u)"
  launchctl bootout "$DOMAIN/com.kitgen.agent" >/dev/null 2>&1 || \
    launchctl unload "$PLIST" >/dev/null 2>&1 || true
else
  echo "Khong tim thay launchctl; bo qua unload dich vu." >&2
fi
rm -f -- "$PLIST"
safe_remove_kitgen_home

echo "Mac dinh GIU NGUYEN du lieu $WORKSPACE."
read -r -p "Ban co muon xoa toan bo du lieu $WORKSPACE khong? [y/N] " answer
case "$answer" in
  y|Y|yes|YES) safe_remove_workspace ;;
  *) echo "Da giu nguyen du lieu $WORKSPACE." ;;
esac
