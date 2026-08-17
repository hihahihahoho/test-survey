#!/usr/bin/env bash
# Install/update a prebuilt KitGen runtime. No sudo; credentials stay in Codex homes.
#
# MÃ THOÁT (ngoài 0 = xong, 2 = sai tham số):
#   20  tải gói phát hành thất bại vì lý do khác (mạng, 5xx, checksum server hỏng);
#   21  GÓI CHƯA CÓ TRÊN SERVER — `release.json` đã khai bản mới nhưng GitHub Releases
#       chưa có file (CI còn đang đóng gói). Ca này KHÔNG phải lỗi máy người dùng và
#       KHÔNG được để `curl` tự nói lời cuối bằng một dòng "404 Not Found". Xem
#       `release_download_failed` và BACKLOG #23.
set -eu
EXIT_DOWNLOAD_FAILED=20
EXIT_ARCHIVE_PENDING=21
KITGEN_HOME="${KITGEN_HOME:-$HOME/.kitgen}"
WORKSPACE="${KITGEN_WORKSPACE:-$HOME/KitGen}"
PORT="${KITGEN_PORT:-8765}"
ORIGIN="${KITGEN_ORIGIN:-http://127.0.0.1:$PORT}"
RELEASE_URL="${KITGEN_RELEASE_URL:-}"
RELEASE_REPO="${KITGEN_RELEASE_REPO:-hihahihahoho/test-survey}"
RELEASE_CHANNEL="${KITGEN_RELEASE_CHANNEL:-latest}"
RELEASE_MANIFEST="${KITGEN_RELEASE_MANIFEST:-https://raw.githubusercontent.com/hihahihahoho/test-survey/feat/kitgen-local-runtime/kit-gen/release.json}"
AUTO_RELEASE=0
# Version mà manifest khai — chỉ để GỌI TÊN bản trong câu báo lỗi tải; nguồn sự thật về
# version vẫn là file VERSION trong gói đã tải về.
RELEASE_VERSION=""
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
# `current` đã được trỏ sang bản mới chưa. Xem khối "KÍCH HOẠT VÀO PHÚT CHÓT" dưới.
ACTIVATED=0
PREVIOUS=""
cleanup(){
  _status=$?
  rm -rf "$TMP"
  # THOÁT GIỮA CHỪNG SAU KHI ĐÃ ĐỔI SYMLINK là đúng cái trạng thái đã cắn máy chủ SP
  # ngày 14/08 (BACKLOG #20): `current` trỏ bản mới, tiến trình cũ vẫn chạy, không ai
  # báo gì. Nửa vời là trạng thái tệ nhất — thà trả về nguyên trạng và nói ra.
  if [ "$_status" -ne 0 ] && [ "$ACTIVATED" -eq 1 ] && [ -n "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$KITGEN_HOME/current" 2>/dev/null || true
    echo "" >&2
    echo "Cài đặt dừng giữa chừng — đã trả $KITGEN_HOME/current về bản cũ." >&2
    echo "Dịch vụ đang chạy KHÔNG bị đụng tới. Nhật ký: $KITGEN_HOME/update.log" >&2
  fi
  # DẤU KẾT THÚC LƯỢT. update.log nay cộng dồn nhiều lượt (agent mở bằng "a" — xem
  # lib/update.mjs `trimUpdateLog`), nên mỗi lượt phải tự khai mình dừng ở đâu: không có
  # dòng này thì người đọc không phân biệt được "lượt còn đang chạy" với "lượt đã chết
  # giữa chừng" — đúng câu hỏi không trả lời được sáng 14/08.
  printf '[%s] kitgen install/update kết thúc — mã thoát %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$_status"
}
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
# ═══════════════════════════════════════════════════════════════════════════════
# "CÓ AI TRẢ LỜI" ≠ "BẢN MỚI ĐANG CHẠY" — cái bẫy của sự cố 14/08 (BACKLOG #20).
#
# `wait_for_health` chỉ hỏi cổng $PORT có ai trả lời không. Tiến trình CŨ trả lời được,
# nên nếu bước restart không xảy ra (hoặc xảy ra mà không ăn) thì installer vẫn in
# "OK agent phản hồi" rồi thoát 0, còn UI thì vẫn thấy có bản mới. Từ đây phải hỏi
# ĐÍCH DANH: ai đang trả lời? `runtimeVersion` của /health là bản phát hành đang chạy.
#
# Agent đời trước 2.1.20 không có field đó ⇒ đọc ra rỗng. Rỗng = KHÔNG KẾT LUẬN ĐƯỢC,
# và ca đó chỉ xảy ra khi cài ĐÈ một archive đời cũ — không được biến nó thành lỗi.
# ═══════════════════════════════════════════════════════════════════════════════
running_runtime_version(){
  "$BIN" status 2>/dev/null | sed -n 's/.*"runtimeVersion":"\([^"]*\)".*/\1/p' | head -n 1 || true
}
wait_for_runtime_version(){
  want="$1"; attempts="${2:-15}"; seen=""
  while [ "$attempts" -gt 0 ]; do
    seen="$(running_runtime_version)"
    if [ "$seen" = "$want" ]; then return 0; fi
    attempts=$((attempts - 1))
    if [ "$attempts" -gt 0 ]; then sleep 1; fi
  done
  [ -n "$seen" ] || return 2   # 2 = agent không khai version ⇒ không kết tội bước restart
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

# ═══════════════════════════════════════════════════════════════════════════════
# TẢI GÓI PHÁT HÀNH — "404" KHÔNG PHẢI MỘT CÂU TRẢ LỜI (BACKLOG #23, máy thật 14/08).
#
# `release.json` nằm trong repo và được đẩy lên cùng lúc gắn tag, còn tarball chỉ xuất
# hiện sau khi workflow phát hành chạy xong (~10-15 phút). Trong cửa sổ đó `kitgen update`
# tải về một trang 404 và trước đây chết bằng đúng một dòng của curl:
#     curl: (22) The requested URL returned error: 404
# Người dùng đọc dòng đó thành "máy tôi hỏng" hoặc "bản cập nhật hỏng", trong khi thứ duy
# nhất phải làm là ĐỢI VÀI PHÚT. Nên: tách "chưa có trên server" khỏi "tải hỏng", nói ra
# bằng tiếng người, ghi lại trên đĩa, và thoát bằng mã riêng để mọi lớp trên phân biệt được.
#
# Nhật ký: stdout+stderr của lượt update do UI bấm ĐÃ đi thẳng vào ~/.kitgen/update.log
# (agent mở file đó làm fd cho installer — lib/update.mjs `scheduleUpdate`), nên chỉ cần
# in ra stderr là web đọc được. `tee` thêm vào install.log để lượt chạy tay trong Terminal
# cũng để lại dấu vết.
# ═══════════════════════════════════════════════════════════════════════════════
DOWNLOAD_HTTP=""
DOWNLOAD_CURL=""
fetch_release_file(){
  DOWNLOAD_HTTP=""; DOWNLOAD_CURL=""
  _rc=0
  # `-w %{http_code}` vẫn in ra dù `-f` đã làm curl thoát khác 0 ⇒ đọc được MÃ HTTP thật,
  # thứ duy nhất phân biệt "chưa upload" (404) với "mạng hỏng" (000).
  # Thêm `-sS` (im lặng nhưng vẫn in lỗi) so với `curl -fL` trước đây: stderr nay được gom
  # vào file để đọc lại, mà thanh tiến trình rơi vào đó chỉ làm bẩn câu báo lỗi.
  DOWNLOAD_HTTP="$(curl -fsSL --retry 3 -w '%{http_code}' -o "$2" "$1" 2>"$TMP/curl.err")" || _rc=$?
  [ "$_rc" -eq 0 ] || { DOWNLOAD_CURL="$_rc"; return 1; }
  return 0
}
release_download_failed(){
  _what="$1"
  _label="${RELEASE_VERSION:-}"
  # --release-url gõ tay thì không có manifest để đọc version — moi ra từ chính tên file.
  [ -n "$_label" ] || _label="$(printf '%s' "$RELEASE_URL" | sed -n 's|.*/kitgen-runtime-\(.*\)\.tar\.gz$|\1|p')"
  [ -n "$_label" ] || _label="mới"
  if [ "$IS_UPDATE" -eq 1 ]; then _retry="$KITGEN_HOME/bin/kitgen update"; else _retry="chạy lại lệnh cài đặt"; fi
  case "$DOWNLOAD_HTTP" in
    403|404|410)
      {
        printf '\n'
        printf 'Bản %s ĐANG ĐƯỢC ĐÓNG GÓI trên CI — chưa tải về được.\n' "$_label"
        printf 'Danh sách phát hành đã khai bản này, nhưng %s chưa có trên GitHub Releases (HTTP %s).\n' \
          "$_what" "$DOWNLOAD_HTTP"
        printf 'Việc đóng gói mất khoảng 10-15 phút. Thử lại sau ít phút:\n\n'
        printf '  %s\n\n' "$_retry"
        printf 'Bản đang chạy KHÔNG bị đụng tới.\n'
      } | tee -a "$KITGEN_HOME/install.log" >&2
      exit "$EXIT_ARCHIVE_PENDING" ;;
    *)
      {
        printf '\n'
        printf 'Không tải được %s của bản %s (HTTP %s, curl %s).\n' \
          "$_what" "$_label" "${DOWNLOAD_HTTP:-000}" "${DOWNLOAD_CURL:-?}"
        [ ! -s "$TMP/curl.err" ] || printf '%s\n' "$(sed -n '1p' "$TMP/curl.err")"
        printf 'Kiểm tra kết nối mạng rồi thử lại:\n\n'
        printf '  %s\n\n' "$_retry"
        printf 'Bản đang chạy KHÔNG bị đụng tới.\n'
      } | tee -a "$KITGEN_HOME/install.log" >&2
      exit "$EXIT_DOWNLOAD_FAILED" ;;
  esac
}

# Mỗi lượt cài để lại một bản đầy đủ (~2.6MB) trong $KITGEN_HOME/releases và KHÔNG ai
# dọn — máy chủ SP đã tích 20 bản. Giữ bản ĐANG CHẠY + KEEP_ROLLBACKS bản gần nhất
# trước đó (đủ để lùi tay khi bản mới hỏng), xoá phần còn lại.
#
# Bản đang chạy được nhận diện qua ĐƯỜNG DẪN THẬT của symlink `current`, không qua
# $VERSION: nếu health check hỏng và script đã trỏ `current` về bản cũ thì bản cũ đó
# mới là bản phải giữ. (Đường rollback thoát bằng `exit 1` trước khi tới đây, nên đây
# chỉ là lớp chắn thứ hai — nhưng xoá nhầm bản đang chạy là hỏng máy người dùng, không
# phải phiền một chút.)
# ═══════════════════════════════════════════════════════════════════════════════
# ĐƯỜNG DẪN CODEX GHI VÀO config.env — hai cái bẫy đã cắn NGƯỜI DÙNG THẬT.
#
# Hợp đồng: giá trị ghi ra phải là một file TÊN ĐÚNG `codex`, nằm trong thư mục sống
# lâu hơn phiên shell, và chạy được khi launchd không thừa kế PATH của shell.
#
#  ① `command -v codex` trong shell fnm trả shim EPHEMERAL
#     ~/.local/state/fnm_multishells/<pid>_<ts>/bin/codex — thư mục chết theo phiên
#     shell ⇒ gen hỏng sau reboot.
#  ② Bản vá đầu tiên cho ① realpath THẲNG FILE, ra
#     .../lib/node_modules/@openai/codex/bin/codex.js — đường dẫn bền nhưng SAI TÊN.
#     `bin/kitgen` lấy `dirname` của nó prepend vào PATH, còn engine gọi `codex` TRẦN
#     ⇒ thư mục đó không có file nào tên `codex` ⇒ rc=127 cho MỌI job, hiện ra UI
#     thành "chạy xong nhưng ảnh không được ghi". Hỏng 100% lượt gen trên máy chủ chủ
#     sản phẩm ngày 14/08. Bền ≠ dùng được: phải kiểm cả TÊN, không chỉ sự tồn tại.
#
# Nên: realpath THƯ MỤC chứa shim rồi ghép `/codex`. Với fnm multishell, thư mục đó
# gỡ ra thành `<fnm>/node-versions/<v>/installation/bin` — ổn định, có sẵn symlink tên
# `codex`, và có cả `node` nằm cạnh nên shebang `#!/usr/bin/env node` cũng chạy được.
# Không đạt thì tự dựng shim tên `codex` trong $KITGEN_HOME/tools/bin (do KitGen sở
# hữu, không phụ thuộc cách người dùng cài node).
realpath_of(){ python3 -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$1" 2>/dev/null || printf '%s' "$1"; }

write_codex_shim(){
  mkdir -p "$KITGEN_HOME/tools/bin"
  _shim="$KITGEN_HOME/tools/bin/codex"
  # File .js KHÔNG tự chạy được dưới launchd (shebang `env node` cần node trong PATH),
  # nên shim gọi thẳng Node riêng của KitGen.
  case "$1" in
    *.js|*.mjs|*.cjs) printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$NODE" "$1" > "$_shim" ;;
    *)                printf '#!/bin/sh\nexec "%s" "$@"\n' "$1" > "$_shim" ;;
  esac
  chmod +x "$_shim"
  printf '%s' "$_shim"
}

resolve_codex_bin(){
  _raw="$1"
  _dir="$(realpath_of "$(dirname "$_raw")")"
  # realpath phải GỠ được lớp ephemeral; còn dấu vết fnm_multishells nghĩa là không gỡ
  # được (thiếu python3 chẳng hạn) ⇒ tuyệt đối không ghi đường dẫn đó ra config.env.
  case "$_dir" in *fnm_multishells*) _dir="" ;; esac
  if [ -n "$_dir" ] && [ -x "$_dir/codex" ] && "$_dir/codex" --version >/dev/null 2>&1; then
    printf '%s' "$_dir/codex"; return 0
  fi
  _target="$(realpath_of "$_raw")"
  if [ "$(basename "$_target")" = codex ] && [ -x "$_target" ] && "$_target" --version >/dev/null 2>&1; then
    printf '%s' "$_target"; return 0
  fi
  write_codex_shim "$_target"
}
# ═══════════════════════════════════════════════════════════════════════════════

KEEP_ROLLBACKS=2
prune_releases(){
  [ -d "$KITGEN_HOME/releases" ] || return 0
  CURRENT_REAL="$(CDPATH= cd -- "$KITGEN_HOME/current" 2>/dev/null && pwd -P || printf '')"
  keep_left="$KEEP_ROLLBACKS"
  removed=""
  removed_n=0
  # -t: mới nhất trước. Tên thư mục là VERSION đã được kiểm ký tự nên không có khoảng trắng.
  for d in $(ls -1dt "$KITGEN_HOME"/releases/* 2>/dev/null || true); do
    [ -d "$d" ] || continue
    real="$(CDPATH= cd -- "$d" && pwd -P)"
    [ "$real" != "$CURRENT_REAL" ] || continue
    if [ "$keep_left" -gt 0 ]; then keep_left=$((keep_left - 1)); continue; fi
    rm -rf "$d" || continue
    removed="$removed $(basename "$d")"
    removed_n=$((removed_n + 1))
  done
  if [ "$removed_n" -gt 0 ]; then
    check_ok "dọn $removed_n bản cũ trong $KITGEN_HOME/releases:$removed"
  else
    check_ok "không có bản cũ nào cần dọn trong $KITGEN_HOME/releases"
  fi
}

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
    # Lấy luôn `version` để câu báo lỗi gọi được TÊN BẢN ("bản 2.1.22 đang được đóng gói")
    # thay vì một URL dài — xem `release_download_failed`.
    META_FIELDS="$(printf '%s' "$META" | python3 -c 'import json,sys
m = json.load(sys.stdin)
print(m.get("archive", ""))
print(m.get("version", ""))')"
    RELEASE_URL="$(printf '%s\n' "$META_FIELDS" | sed -n '1p')"
    RELEASE_VERSION="$(printf '%s\n' "$META_FIELDS" | sed -n '2p')"
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
    fetch_release_file "$RELEASE_URL" "$TMP/runtime.tar.gz" || release_download_failed "gói cài đặt"
    if [ -z "$EXPECTED_SHA" ]; then
      # Thiếu .sha256 trong khi .tar.gz đã có = bản phát hành mới upload được một nửa —
      # cùng một nguyên nhân, cùng một lời khuyên: đợi CI xong rồi thử lại.
      fetch_release_file "$RELEASE_URL.sha256" "$TMP/runtime.sha256" || release_download_failed "file checksum"
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
progress "1/7" "Kiểm tra gói cài đặt"
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
progress "2/7" "Health check môi trường nền"
check_ok "Node $($NODE --version 2>/dev/null || printf '>=20') · $NODE"
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is required." >&2; exit 1; }
check_ok "$(python3 --version 2>&1) · $(command -v python3)"
# Self-test before switching current; production artifacts intentionally omit tests.
"$NODE" --check "$NEW/agent/server.mjs" >/dev/null
rm -rf "$DEST"
mv "$NEW" "$DEST"
# ═══════════════════════════════════════════════════════════════════════════════
# KÍCH HOẠT VÀO PHÚT CHÓT — vì sao `ln -sfn current` KHÔNG nằm ở đây nữa.
#
# Trước 2.1.21, symlink `current` được trỏ sang bản mới NGAY TẠI DÒNG NÀY, tức bước 2/7,
# rồi script còn phải đi qua 4 bước hay hỏng nhất (venv+pip, cài/dò Codex, cài trình
# render khung xương, ghi config) trước khi tới bước khởi động lại ở 5/7. Bất kỳ lỗi nào trong quãng
# đó là `set -e` thoát ngay ⇒ để lại ĐÚNG hiện trường ngày 14/08: `current` đã trỏ 2.1.20,
# tiến trình agent vẫn là 2.1.19, không có dòng log nào, UI vẫn mời cập nhật.
#
# Nay `current` chỉ đổi khi mọi thứ đã sẵn sàng và ngay trước khi khởi động lại (bước 5/7),
# nên cửa sổ "cài dở" thu về vài mili-giây; phần còn lại được `cleanup` gác. Bản mới nằm
# sẵn ở $DEST suốt quá trình — không ai đọc nó cho tới lúc đổi symlink.
# ═══════════════════════════════════════════════════════════════════════════════
PREVIOUS="$(readlink "$KITGEN_HOME/current" 2>/dev/null || true)"
VENV="$WORKSPACE/.venv"
[ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
"$VENV/bin/python" -c 'import PIL,numpy,scipy,pymatting' >/dev/null 2>&1 || {
  echo "Installing image-processing dependencies..."
  PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV/bin/python" -m pip install --quiet --upgrade pillow numpy scipy pymatting
}

# Prefer an existing healthy Codex CLI. Persisting its absolute path means the
# background service does not depend on launchd/systemd inheriting the shell PATH.
progress "3/7" "Health check Codex CLI"
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
# Đường vừa dò được có thể là shim ephemeral của shell — quy về đường bền + ĐÚNG TÊN
# trước khi bất cứ ai ghi nó ra đĩa (xem khối resolve_codex_bin ở đầu file).
CODEX_BIN="$(resolve_codex_bin "$CODEX_BIN")"
"$CODEX_BIN" --version >/dev/null 2>&1 || { echo "Resolved Codex path does not run: $CODEX_BIN" >&2; exit 1; }
check_ok "đường dẫn Codex bền vững và đúng tên: $CODEX_BIN"

# Trình render khung xương: @resvg/resvg-wasm (2,4 MB, thuần JS + .wasm).
# Thay Playwright + Chromium (790,9 MB) — xem BACKLOG #15. BẮT BUỘC, không có
# đường lùi: gen.sh dừng hẳn nếu thiếu (bản PIL cũ lệch 17,6% mực, đã xoá).
if ! NODE_PATH="$KITGEN_HOME/tools/node_modules" "$NODE" -e "require.resolve('@resvg/resvg-wasm')" >/dev/null 2>&1; then
  echo "Installing skeleton renderer (@resvg/resvg-wasm)..."
  "$KITGEN_HOME/tools/node/bin/npm" install --silent --prefix "$KITGEN_HOME/tools" @resvg/resvg-wasm 2>/dev/null || \
    "$(dirname "$NODE")/npm" install --silent --prefix "$KITGEN_HOME/tools" @resvg/resvg-wasm
fi
progress "4/7" "Health check trình dựng ảnh"
# `exit 1` chứ không `check_warn`: thiếu renderer là KHÔNG GEN ĐƯỢC ẢNH, không phải
# suy giảm chất lượng — không còn đường lùi nào để rơi vào.
NODE_PATH="$KITGEN_HOME/tools/node_modules" "$NODE" -e "require.resolve('@resvg/resvg-wasm')" >/dev/null 2>&1 \
  || { echo "Skeleton renderer health check failed (@resvg/resvg-wasm)." >&2; exit 1; }
check_ok "Trình render khung xương đã sẵn sàng (@resvg/resvg-wasm)"

# Dọn rác đời Playwright ở LƯỢT UPDATE: 790,9 MB không còn ai dùng (browser 772,7 MB
# + gói npm 18,1 MB). Máy sạch không có gì để xoá; đây chỉ là đường dọn cho máy đã trót
# cài đời trước — kể cả bản 2.1.21 vừa tải thêm chromium/firefox/webkit.
rm -rf "$KITGEN_HOME/tools/playwright-browsers" \
       "$KITGEN_HOME/tools/node_modules/playwright" \
       "$KITGEN_HOME/tools/node_modules/playwright-core" 2>/dev/null || true
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
cat > "$KITGEN_HOME/config.env" <<CFG
KITGEN_HOME='$KITGEN_HOME'
KITGEN_SOURCE='$KITGEN_HOME/current'
KITGEN_WORKSPACE='$WORKSPACE'
KITGEN_PORT='$PORT'
KITGEN_ORIGIN='$ORIGIN'
KITGEN_NODE='$NODE'
KITGEN_CODEX_BIN='$CODEX_BIN'
NODE_PATH='$KITGEN_HOME/tools/node_modules'
KITGEN_RELEASE_URL='$([ "$AUTO_RELEASE" -eq 1 ] && printf '' || printf '%s' "$RELEASE_URL")'
KITGEN_RELEASE_REPO='$RELEASE_REPO'
KITGEN_RELEASE_CHANNEL='$RELEASE_CHANNEL'
KITGEN_CODEX_PROFILE='$CODEX_PROFILE'
CFG
chmod 600 "$KITGEN_HOME/config.env"
BIN="$KITGEN_HOME/bin/kitgen"
progress "5/7" "Đăng ký dịch vụ local"
# Đây là điểm KHÔNG QUAY ĐẦU: từ dòng này `current` là bản mới, và mọi đường thoát
# phía dưới đều phải tự nói ra mình để lại máy ở trạng thái nào (xem `cleanup`).
ACTIVATED=1
ln -sfn "$DEST" "$KITGEN_HOME/current"
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
      # stderr của `kitgen start` chứa cả cảnh báo "vẫn đang chạy bản cũ" của bin/kitgen —
      # đây là nơi DUY NHẤT nó được lưu lại khi installer đời cũ chạy lượt update.
      append_install_log "$TMP/launchctl.err" "LaunchAgent start output"
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
  # ① KHÔNG AI TRẢ LỜI ⇒ bản mới không chạy được ⇒ lùi hẳn về bản cũ.
  if ! wait_for_health 10; then
    ACTIVATED=0   # nhánh này TỰ xử lý symlink, `cleanup` không được làm thêm lần nữa
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
  # ② CÓ NGƯỜI TRẢ LỜI — NHƯNG LÀ AI? Tiến trình cũ trả lời được ⇒ ① không đủ (BACKLOG #20).
  #    Không đúng bản thì thử DỪNG HẲN rồi bật lại đúng một lần (đây là lệnh đã chữa tay
  #    được máy chủ SP ngày 14/08), rồi mới kết luận.
  # `rc=1` là "đọc được version và nó SAI"; `rc=2` là "không đọc được" (agent đời cũ)
  # — chỉ rc=1 mới là bằng chứng đủ để kết tội bước khởi động lại.
  rc=0; wait_for_runtime_version "$VERSION" 15 || rc=$?
  if [ "$rc" -eq 1 ]; then
    check_warn "dịch vụ vẫn đang chạy bản cũ sau khi khởi động lại — thử dừng hẳn rồi bật lại"
    "$BIN" restart >"$TMP/restart-retry.err" 2>&1 || true
    append_install_log "$TMP/restart-retry.err" "Restart retry after stale runtime version"
    rc=0; wait_for_runtime_version "$VERSION" 20 || rc=$?
    if [ "$rc" -eq 1 ]; then
      # KHÔNG lùi symlink: bản mới đã cài xong và lành lặn, chỉ thiếu mỗi cú khởi động
      # lại. Lùi ở đây là vứt đi một lượt tải + cài, mà lần sau vẫn hỏng y như vậy — và
      # `restartRequired` của /api/update chính là để UI nói được câu đúng. Thứ user cần
      # là MỘT CÂU LỆNH, không phải một lời xin lỗi.
      ACTIVATED=0
      {
        printf '\n'
        printf 'KitGen %s ĐÃ CÀI XONG nhưng dịch vụ vẫn đang chạy bản cũ (%s).\n' \
          "$VERSION" "$(running_runtime_version)"
        printf 'Chạy lệnh này trong Terminal rồi tải lại trang:\n\n'
        printf '  %s restart\n\n' "$BIN"
      } | tee -a "$KITGEN_HOME/install.log" >&2
      exit 1
    fi
  fi
  progress "6/7" "Health check dịch vụ"
  check_ok "agent $VERSION phản hồi tại http://127.0.0.1:$PORT/health"
else
  ACTIVATED=0   # --no-start: cài xong, cố ý không chạy — không có gì để lùi
  progress "6/7" "Bỏ qua health check dịch vụ (--no-start)"
fi
progress "7/7" "Dọn bản cũ"
prune_releases

# TỔNG KẾT "MỌI THỨ NẰM ĐÂU".
#
# Script này KHÔNG cài vào thư mục đang đứng: nó cài vào $KITGEN_HOME và tạo dữ liệu ở
# $WORKSPACE. Người tải file về một folder tạm rồi chạy sẽ thấy folder đó vẫn rỗng và
# tưởng cài hỏng (đã xảy ra thật với chủ sản phẩm). Nói thẳng ra bốn đường dẫn + lệnh
# cập nhật, ngay trước dòng nhắc đăng nhập, là rẻ hơn mọi lời giải thích sau đó.
echo ""
echo "  KitGen $VERSION đã cài xong."
echo ""
echo "  Ứng dụng      http://127.0.0.1:$PORT/app/   ← mở cái này"
echo "  Dữ liệu       $WORKSPACE   (project, kit, ảnh — thứ cần sao lưu)"
echo "  Bản chạy      $KITGEN_HOME   (runtime, log, Node/Codex/Chromium riêng)"
echo "                 bản $VERSION: $DEST"
echo "  Origin        $ORIGIN"
echo "  Lệnh          $BIN {start|stop|restart|status|logs|open}"
echo "  Cập nhật      $BIN update"
echo ""
if [ "$CODEX_PROFILE" = "separate" ] && [ ! -f "$HOME/.codex-img/auth.json" ]; then
  echo "  Còn một bước: CODEX_HOME=$HOME/.codex-img codex login"
elif [ ! -f "$HOME/.codex/auth.json" ]; then
  echo "  Còn một bước: $CODEX_BIN login"
else
  echo "  Hồ sơ tạo ảnh: Codex mặc định (~/.codex)"
fi
