#!/usr/bin/env bash
# Install/update a prebuilt KitGen runtime. No sudo; credentials stay in Codex homes.
#
# MÃ THOÁT (ngoài 0 = xong, 2 = sai tham số):
#   20  tải gói phát hành thất bại vì lý do khác (mạng, 5xx, checksum server hỏng);
#   21  GÓI CHƯA CÓ TRÊN SERVER — `release.json` đã khai bản mới nhưng GitHub Releases
#       chưa có file (CI còn đang đóng gói). Ca này KHÔNG phải lỗi máy người dùng và
#       KHÔNG được để `curl` tự nói lời cuối bằng một dòng "404 Not Found". Xem
#       `release_download_failed` và BACKLOG #23.
#   22  ĐÃ CÓ một lượt cập nhật khác đang chạy — không chạy chồng.
set -eu
INSTALLER_PID="${BASHPID:-$$}"
EXIT_DOWNLOAD_FAILED=20
EXIT_ARCHIVE_PENDING=21
EXIT_UPDATE_RUNNING=22
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
    # Hồ sơ ảnh riêng (~/.codex-img) đã bỏ 24/08/2026 — mọi bản cài dùng thẳng
    # ~/.codex của người dùng. Cờ cũ giữ lại làm no-op để `kitgen update` từ bản
    # cũ (config.env còn truyền cờ) không chết vì "Unknown option".
    --codex-default|--codex-img) echo "Cảnh báo: $1 đã bỏ — KitGen luôn dùng Codex mặc định (~/.codex)." >&2 ;;
    --update) IS_UPDATE=1 ;;
    -h|--help)
      echo "Usage: install.sh [--archive runtime.tar.gz | --release-url URL] [--sha256 HASH]"
      echo "                  [--repo OWNER/REPO]"
      echo "                  [--workspace PATH] [--origin URL] [--port N] [--no-start]"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# LaunchAgent/systemd may start an update without the interactive shell's PATH.
# Keep one absolute Python path for every installer-side helper and subprocess.
PYTHON3="${KITGEN_PYTHON3:-$(command -v python3 2>/dev/null || true)}"
if [ -z "$PYTHON3" ]; then
  for _python_candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [ -x "$_python_candidate" ]; then PYTHON3="$_python_candidate"; break; fi
  done
fi
# ── PYTHON RIÊNG CỦA KITGEN: PIN CỨNG, KHÔNG ĐỂ MÁY NGƯỜI DÙNG QUYẾT ĐỊNH ─────
# Cùng khuôn với khối tải Node bên dưới (tải → đối chiếu SHA-256 → giải nén vào
# $KITGEN_HOME/tools → dùng bản riêng đó). Vì sao phải mang theo Python: pillow, numpy,
# scipy, pymatting chỉ có wheel dựng sẵn cho một DẢI phiên bản Python; rơi ra ngoài dải
# đó thì pip BIÊN DỊCH scipy từ nguồn — ninja bung một tiến trình mỗi nhân CPU, mỗi
# tiến trình hơn 1 GB RAM — và đã ĐƠ TOÀN MÁY một người dùng thật (chuột còn di được,
# bấm gì cũng không ăn, phải giữ nút nguồn). Node đã pin cứng từ lâu; Python thì trước
# bản này vẫn đi dò 3.13→3.12→3.11→`py -3` trên máy người dùng, mà "máy user thì không
# có ai cài sẵn Python 3.13 cho họ" (docs/WINDOWS-PORT.md).
#
# NGUỒN TẢI = một GitHub release SỐNG LÂU của CHÍNH kho KitGen (tag runtime-python-*),
# KHÔNG phải kho astral-sh. CI của mình kéo tarball gốc về, tự sinh SHA256SUMS rồi đính
# vào release đó (.github/workflows/kitgen-runtime-python.yml). Ba lý do:
#   · không phụ thuộc kho bên thứ ba còn sống hay không;
#   · người dùng chỉ phải mở MỘT tên miền (máy công ty/ngân hàng lọc theo domain);
#   · checksum do CI của mình sinh nên tin được.
# Bản phát hành KitGen vẫn 3,1 MB — tarball Python KHÔNG đính vào từng bản release.
PYTHON_VERSION="3.13.15"      # ĐỒNG BỘ TAY với scripts/install.ps1 ($PYTHON_VERSION)
PYTHON_BUILD="20260814"       # ĐỒNG BỘ TAY với scripts/install.ps1 ($PYTHON_BUILD)
PYTHON_RUNTIME_TAG="${KITGEN_PYTHON_RUNTIME_TAG:-runtime-python-$PYTHON_VERSION}"
PYTHON_RUNTIME_BASE="${KITGEN_PYTHON_RUNTIME_BASE:-https://github.com/$RELEASE_REPO/releases/download/$PYTHON_RUNTIME_TAG}"
PYTHON_HOME="$KITGEN_HOME/tools/python"
# Dải phiên bản CHẮC CHẮN có wheel dựng sẵn cho cả 4 gói. Python hệ thống nằm trong dải
# này thì dùng luôn cho đỡ tải ~24 MB; ngoài dải thì tải bản riêng — KHÔNG thử pip rồi
# cầu may, vì cái giá của lần thử đó là treo máy.
PYTHON_WHEEL_OK="3.11 3.12 3.13"

# "major.minor" của một trình Python; rỗng + mã lỗi nếu trình đó không chạy được.
python_minor(){
  [ -n "${1:-}" ] && [ -x "$1" ] || return 1
  "$1" -c 'import sys;print("%d.%d" % sys.version_info[:2])' 2>/dev/null
}
python_wheels_ok(){
  _pv="$(python_minor "${1:-}" || true)"
  [ -n "$_pv" ] || return 1
  case " $PYTHON_WHEEL_OK " in *" $_pv "*) return 0 ;; *) return 1 ;; esac
}

# macOS có shasum, Git Bash/Linux tối giản chỉ có sha256sum — dùng được cả hai.
sha256_file(){
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else sha256sum "$1" | awk '{print $1}'; fi
}
sha256_check(){
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 -c "$1"
  else sha256sum -c "$1"; fi
}
mkdir -p "$KITGEN_HOME/releases" "$KITGEN_HOME/bin" "$WORKSPACE"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-install.XXXXXX")"
# Mọi file có thể đang được tiến trình khác đọc phải được dựng ngoài rồi rename vào.
# `cp > đích` truncate inode đang sống; Bash/Node đọc lazy sẽ ăn nửa nội dung mới.
ATOMIC_TMP=""
atomic_copy_file(){
  _src="$1"; _dst="$2"; _executable="${3:-0}"
  _dst_dir="$(dirname "$_dst")"
  mkdir -p "$_dst_dir"
  ATOMIC_TMP="$(mktemp "$_dst_dir/.kitgen-atomic.XXXXXX")"
  cp "$_src" "$ATOMIC_TMP"
  [ "$_executable" -eq 1 ] && chmod +x "$ATOMIC_TMP"
  mv -f "$ATOMIC_TMP" "$_dst"
  ATOMIC_TMP=""
}
atomic_render_file(){
  _dst="$1"; shift
  _dst_dir="$(dirname "$_dst")"
  mkdir -p "$_dst_dir"
  ATOMIC_TMP="$(mktemp "$_dst_dir/.kitgen-atomic.XXXXXX")"
  "$@" > "$ATOMIC_TMP"
  mv -f "$ATOMIC_TMP" "$_dst"
  ATOMIC_TMP=""
}
# Agent đặt trước reservation + token; lệnh chạy tay tự tạo reservation. PID nằm trong
# file nội bộ, không bao giờ trả ra API. SIGKILL để lại PID chết; lượt sau sẽ thu hồi khóa.
UPDATE_LOCK="${KITGEN_UPDATE_LOCK:-$KITGEN_HOME/.update-lock}"
UPDATE_LOCK_TOKEN="${KITGEN_UPDATE_LOCK_TOKEN:-}"
LOCK_OWNED=0
# Journal giao dịch cho khe SIGKILL: trap không chạy được khi installer bị giết cứng.
# Chỉ chứa trạng thái nội bộ + đích rollback; không đi ra API.
UPDATE_TXN="${KITGEN_UPDATE_TXN:-$KITGEN_HOME/.update-transaction}"
UPDATE_TXN_STATE="$UPDATE_TXN/state"
UPDATE_TXN_PREVIOUS="$UPDATE_TXN/previous"
UPDATE_TXN_DEST="$UPDATE_TXN/dest"
BIN="$KITGEN_HOME/bin/kitgen"
# `current` đã được trỏ sang bản mới chưa. Xem khối "KÍCH HOẠT VÀO PHÚT CHÓT" dưới.
ACTIVATED=0
PREVIOUS=""
cleanup(){
  _status=$?
  [ -z "$ATOMIC_TMP" ] || rm -f "$ATOMIC_TMP" 2>/dev/null || true
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
  if [ "$_status" -eq 0 ] || { [ "$_status" -ne 0 ] && [ "$ACTIVATED" -eq 1 ]; }; then
    rm -rf "$UPDATE_TXN" 2>/dev/null || true
  fi
  # Chỉ nhả lock sau rollback/journal cleanup; lượt kế tiếp không được chen vào khe
  # giữa lúc symlink còn đang được trả về bản cũ.
  if [ "$LOCK_OWNED" -eq 1 ]; then
    rm -rf "$UPDATE_LOCK" 2>/dev/null || true
  fi
  # DẤU KẾT THÚC LƯỢT. update.log nay cộng dồn nhiều lượt (agent mở bằng "a" — xem
  # lib/update.mjs `trimUpdateLog`), nên mỗi lượt phải tự khai mình dừng ở đâu: không có
  # dòng này thì người đọc không phân biệt được "lượt còn đang chạy" với "lượt đã chết
  # giữa chừng" — đúng câu hỏi không trả lời được sáng 14/08.
  printf '[%s] kitgen install/update kết thúc — mã thoát %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$_status"
}
trap cleanup EXIT INT TERM

claim_update_lock(){
  if [ -d "$UPDATE_LOCK" ]; then
    _owner="$(cat "$UPDATE_LOCK/owner" 2>/dev/null || true)"
    case "$_owner" in
      reserved:*)
        # Chỉ child do agent vừa spawn biết token reservation. Một installer khác
        # không được giành khóa trong khoảng child chưa kịp ghi PID.
        if [ -n "$UPDATE_LOCK_TOKEN" ] && [ "$_owner" = "reserved:$UPDATE_LOCK_TOKEN" ]; then
          printf 'pid:%s\n' "$INSTALLER_PID" > "$UPDATE_LOCK/owner"
          LOCK_OWNED=1
          return 0
        fi
        echo "KitGen update already running." >&2
        exit "$EXIT_UPDATE_RUNNING"
        ;;
      pid:*|[0-9]*)
        _pid="${_owner#pid:}"
        if [ "$_pid" != "$INSTALLER_PID" ] && kill -0 "$_pid" 2>/dev/null; then
          echo "KitGen update already running." >&2
          exit "$EXIT_UPDATE_RUNNING"
        fi
        # PID đã chết: đây là khóa mồ côi do installer bị kill giữa chừng.
        rm -rf "$UPDATE_LOCK"
        ;;
      *)
        echo "KitGen update already running." >&2
        exit "$EXIT_UPDATE_RUNNING"
        ;;
    esac
  fi
  mkdir "$UPDATE_LOCK"
  printf 'pid:%s\n' "$INSTALLER_PID" > "$UPDATE_LOCK/owner"
  LOCK_OWNED=1
}
claim_update_lock

write_update_txn(){
  _state="$1"
  _previous="$2"
  _dest="$3"
  mkdir -p "$UPDATE_TXN"
  printf '%s\n' "$_previous" > "$UPDATE_TXN_PREVIOUS.tmp"
  printf '%s\n' "$_dest" > "$UPDATE_TXN_DEST.tmp"
  printf '%s\n' "$_state" > "$UPDATE_TXN_STATE.tmp"
  mv "$UPDATE_TXN_PREVIOUS.tmp" "$UPDATE_TXN_PREVIOUS"
  mv "$UPDATE_TXN_DEST.tmp" "$UPDATE_TXN_DEST"
  mv "$UPDATE_TXN_STATE.tmp" "$UPDATE_TXN_STATE"
}
clear_update_txn(){ rm -rf "$UPDATE_TXN" 2>/dev/null || true; }

# Trap không thể chạy sau SIGKILL. Lượt kế tiếp thu hồi journal trước khi chạm bản mới:
# nếu activation dở dang mà bản mới chưa phục vụ được, trả symlink về bản cũ; nếu bản mới
# đã phục vụ đúng VERSION thì coi journal là commit bị bỏ sót và giữ nguyên.
recover_update_txn(){
  [ -f "$UPDATE_TXN_STATE" ] || return 0
  _state="$(cat "$UPDATE_TXN_STATE" 2>/dev/null || true)"
  _previous="$(cat "$UPDATE_TXN_PREVIOUS" 2>/dev/null || true)"
  _dest="$(cat "$UPDATE_TXN_DEST" 2>/dev/null || true)"
  case "$_state" in
    prepared)
      clear_update_txn
      ;;
    activated)
      _current="$(CDPATH= cd -- "$KITGEN_HOME/current" 2>/dev/null && pwd -P || true)"
      _dest_real="$(CDPATH= cd -- "$_dest" 2>/dev/null && pwd -P || true)"
      _want="$(cat "$_dest/VERSION" 2>/dev/null || true)"
      _running=""
      if [ -x "$BIN" ] && [ -n "$_want" ]; then
        _running="$($BIN status 2>/dev/null | sed -n 's/.*"runtimeVersion":"\([^"]*\)".*/\1/p' | head -n 1 || true)"
      fi
      if [ -n "$_want" ] && [ -n "$_dest_real" ] && [ "$_current" = "$_dest_real" ] && [ "$_running" = "$_want" ]; then
        clear_update_txn
      elif [ -n "$_previous" ] && [ -n "$_dest_real" ] && [ "$_current" = "$_dest_real" ]; then
        ln -sfn "$_previous" "$KITGEN_HOME/current"
        clear_update_txn
      else
        clear_update_txn
      fi
      ;;
    *)
      clear_update_txn
      ;;
  esac
}
recover_update_txn

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
realpath_of(){
  [ -n "$PYTHON3" ] && "$PYTHON3" -c 'import os,sys;print(os.path.realpath(sys.argv[1]))' "$1" 2>/dev/null || printf '%s' "$1"
}

write_codex_shim(){
  mkdir -p "$KITGEN_HOME/tools/bin"
  _shim="$KITGEN_HOME/tools/bin/codex"
  # File .js KHÔNG tự chạy được dưới launchd (shebang `env node` cần node trong PATH),
  # nên shim gọi thẳng Node riêng của KitGen.
  ATOMIC_TMP="$(mktemp "$KITGEN_HOME/tools/bin/.kitgen-codex.XXXXXX")"
  case "$1" in
    *.js|*.mjs|*.cjs) printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$NODE" "$1" > "$ATOMIC_TMP" ;;
    *)                printf '#!/bin/sh\nexec "%s" "$@"\n' "$1" > "$ATOMIC_TMP" ;;
  esac
  chmod +x "$ATOMIC_TMP"
  mv -f "$ATOMIC_TMP" "$_shim"
  ATOMIC_TMP=""
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
    META_FIELDS="$(printf '%s' "$META" | "$PYTHON3" -c 'import json,sys
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
    ACTUAL="$(sha256_file "$TMP/runtime.tar.gz")"
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
  ARCHIVE="$("$SELF_DIR/scripts/build-runtime.sh")"
  exec "$0" --archive "$ARCHIVE" --workspace "$WORKSPACE" --origin "$ORIGIN" --port "$PORT" $([ "$NO_START" -eq 1 ] && echo --no-start)
else
  echo "No runtime supplied. Use --release-url URL or --archive FILE." >&2
  exit 2
fi
is_release "$CANDIDATE" || { echo "Invalid KitGen runtime archive." >&2; exit 1; }
(
  cd "$CANDIDATE"
  sha256_check manifest.sha256 >/dev/null
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
if [ -x "$NODE" ]; then
  MAJOR="$($NODE -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null)" || MAJOR=0
fi
case "$MAJOR" in ''|*[!0-9]*) MAJOR=0 ;; esac
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
  ACTUAL_NODE_SHA="$(sha256_file "$TMP/$NODE_PKG")"
  [ -n "$EXPECTED_NODE_SHA" ] && [ "$EXPECTED_NODE_SHA" = "$ACTUAL_NODE_SHA" ] || { echo "Node checksum mismatch." >&2; exit 1; }
  rm -rf "$KITGEN_HOME/tools/node"
  mkdir -p "$KITGEN_HOME/tools/node"
  tar -xzf "$TMP/$NODE_PKG" -C "$KITGEN_HOME/tools/node" --strip-components=1
  NODE="$KITGEN_HOME/tools/node/bin/node"
fi
# npm, npx, .bin shims, and npm postinstall scripts use `#!/usr/bin/env node`.
# The private Node directory must be visible before any npm invocation.
PATH="$(dirname "$NODE"):$PATH"; export PATH
progress "2/7" "Health check môi trường nền"
check_ok "Node $($NODE --version 2>/dev/null || printf '>=20') · $NODE"
# ── Python: bản riêng pin cứng, hoặc bản hệ thống CHẮC CHẮN có wheel ──────────
# Thứ tự: ① bản riêng đã tải lần trước → ② Python hệ thống trong dải 3.11-3.13 (đỡ tải
# ~24 MB) → ③ tải bản riêng pin cứng, kiểm SHA-256 TRƯỚC KHI giải nén.
# KHÔNG có nhánh thứ tư kiểu "cài xong nhưng chưa gen được ảnh": tới đây mà hỏng là
# hỏng thật, dừng hẳn và nói rõ cách chữa — không im lặng hạ chất lượng, không đẩy việc
# đi cài Python sang người dùng.
ENGINE_PYTHON=""
if python_wheels_ok "$PYTHON_HOME/bin/python3"; then
  ENGINE_PYTHON="$PYTHON_HOME/bin/python3"
  check_ok "Python riêng của KitGen $("$ENGINE_PYTHON" -c 'import sys;print("%d.%d.%d" % sys.version_info[:3])') · $ENGINE_PYTHON"
elif python_wheels_ok "$PYTHON3"; then
  ENGINE_PYTHON="$PYTHON3"
  check_ok "$("$PYTHON3" --version 2>&1) · $PYTHON3 (trong dải có wheel — không cần tải bản riêng)"
  # Máy đã tự đủ ⇒ trả lại đĩa cho bản riêng hỏng/lạc còn sót từ lượt trước.
  rm -rf "$PYTHON_HOME"
else
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PYTHON_PLATFORM="aarch64-apple-darwin" ;;
    Darwin-x86_64) PYTHON_PLATFORM="x86_64-apple-darwin" ;;
    *)
      # Cố ý KHÔNG đoán tên asset cho nền tảng chưa được CI dựng: thà nói thẳng còn hơn
      # tải về một file 404 rồi giải nén rác.
      echo "KitGen cần Python $PYTHON_WHEEL_OK và chưa có bản Python dựng sẵn cho $(uname -s) $(uname -m)." >&2
      echo "Cách xử: cài Python 3.13, hoặc chạy lại với KITGEN_PYTHON3=/đường/dẫn/tới/python3." >&2
      exit 1 ;;
  esac
  PYTHON_PKG="cpython-$PYTHON_VERSION+$PYTHON_BUILD-$PYTHON_PLATFORM-install_only.tar.gz"
  _sys_minor="$(python_minor "$PYTHON3" || true)"
  if [ -n "$_sys_minor" ]; then
    echo "Python hệ thống là $_sys_minor — ngoài dải có wheel ($PYTHON_WHEEL_OK)."
  fi
  echo "Installing private Python $PYTHON_VERSION runtime (~24 MB)..."
  curl -fsSL --retry 3 "$PYTHON_RUNTIME_BASE/$PYTHON_PKG" -o "$TMP/$PYTHON_PKG" || {
    echo "Không tải được $PYTHON_RUNTIME_BASE/$PYTHON_PKG" >&2
    echo "Cách xử: kiểm tra mạng/tường lửa tới github.com rồi chạy lại installer." >&2
    exit 1; }
  # BẢNG CHECKSUM LÀ BẮT BUỘC. Không tải được bảng = không kiểm được gói = KHÔNG GIẢI NÉN.
  curl -fsSL --retry 3 "$PYTHON_RUNTIME_BASE/SHA256SUMS" -o "$TMP/python-shasums.txt" || {
    echo "Không tải được bảng checksum $PYTHON_RUNTIME_BASE/SHA256SUMS — dừng, không giải nén gói chưa kiểm." >&2
    exit 1; }
  # `sha256sum` in "<hash>␠*<file>" khi đọc nhị phân, `shasum` in hai dấu cách ⇒ nhận cả hai.
  EXPECTED_PYTHON_SHA="$(awk -v f="$PYTHON_PKG" '$2 == f || $2 == "*" f { print $1 }' "$TMP/python-shasums.txt")"
  ACTUAL_PYTHON_SHA="$(sha256_file "$TMP/$PYTHON_PKG")"
  [ -n "$EXPECTED_PYTHON_SHA" ] && [ "$EXPECTED_PYTHON_SHA" = "$ACTUAL_PYTHON_SHA" ] || { echo "Python checksum mismatch." >&2; exit 1; }
  # Dọn bản Python cũ y hệt cách dọn Node: MỘT thư mục duy nhất, xoá sạch trước khi giải
  # nén, nên $KITGEN_HOME không phình thêm sau mỗi lần update.
  rm -rf "$PYTHON_HOME"
  mkdir -p "$PYTHON_HOME"
  tar -xzf "$TMP/$PYTHON_PKG" -C "$PYTHON_HOME" --strip-components=1
  ENGINE_PYTHON="$PYTHON_HOME/bin/python3"
  python_wheels_ok "$ENGINE_PYTHON" || { echo "Bản Python vừa giải nén không chạy được: $ENGINE_PYTHON" >&2; exit 1; }
  check_ok "Python riêng của KitGen $PYTHON_VERSION · $ENGINE_PYTHON"
fi
# Máy hoàn toàn không có python3 hệ thống vẫn phải chạy được các helper phía installer.
[ -n "$PYTHON3" ] && [ -x "$PYTHON3" ] || PYTHON3="$ENGINE_PYTHON"
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
# venv PHẢI được dựng từ đúng $ENGINE_PYTHON. Một venv đời trước trỏ vào Python khác
# (bản hệ thống vừa được nâng cấp, hoặc bản riêng vừa bị dọn) là cái bẫy kinh điển:
# `bin/python` gãy symlink hoặc vẫn là 3.14 ⇒ pip lại đi tìm sdist. Dựng lại rẻ hơn đoán.
VENV_BASE="$( [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c 'import sys;print(sys.base_prefix)' 2>/dev/null || printf '' )"
ENGINE_BASE="$("$ENGINE_PYTHON" -c 'import sys;print(sys.base_prefix)')"
if [ ! -x "$VENV/bin/python" ] || [ "$VENV_BASE" != "$ENGINE_BASE" ]; then
  rm -rf "$VENV"
  "$ENGINE_PYTHON" -m venv "$VENV"
fi
if ! "$VENV/bin/python" -c 'import PIL,numpy,scipy,pymatting' >/dev/null 2>&1; then
  echo "Installing image-processing dependencies..."
  # ═════════════════════════════════════════════════════════════════════════════
  # `--only-binary=:all:` KHÔNG phải tuỳ chọn cho đẹp — ĐỪNG BAO GIỜ BỎ NÓ.
  # Thiếu cờ này, máy nào không có wheel sẽ để pip BIÊN DỊCH scipy từ nguồn: ninja bung
  # một tiến trình mỗi nhân CPU, mỗi tiến trình hơn 1 GB RAM. Người dùng thật đã báo máy
  # ĐƠ hoàn toàn — chuột còn di được, bấm gì cũng không ăn, phải giữ nút nguồn.
  # Không có wheel thì phải hỏng NGAY và RẺ, kèm câu chữa. install.ps1 cũng vậy.
  # ═════════════════════════════════════════════════════════════════════════════
  if ! PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV/bin/python" -m pip install --quiet --upgrade --only-binary=:all: pillow numpy scipy pymatting; then
    echo "Cài đặt KitGen dừng trước khi kích hoạt — CHƯA GEN ĐƯỢC ẢNH — thiếu scipy/pymatting." >&2
    echo "Python đang dùng: $("$VENV/bin/python" -c 'import sys;print(sys.version.split()[0])' 2>/dev/null || printf '?') · $ENGINE_PYTHON" >&2
    echo "Cách xử: 1) đọc dòng lỗi pip ở trên; 2) mất mạng / proxy chặn pypi.org thì cài lại khi có mạng; 3) xoá thư mục .venv trong workspace rồi chạy lại installer." >&2
    echo "Installer CỐ Ý KHÔNG biên dịch scipy từ nguồn (--only-binary=:all:): việc đó ngốn hàng GB RAM và đã treo máy người dùng." >&2
    exit 1
  fi
fi

# Prefer an existing healthy Codex CLI. Persisting its absolute path means the
# background service does not depend on launchd/systemd inheriting the shell PATH.
progress "3/7" "Health check Codex CLI"
SYSTEM_CODEX="$(command -v codex 2>/dev/null || true)"
if [ -n "$SYSTEM_CODEX" ] && [ -x "$SYSTEM_CODEX" ] && "$SYSTEM_CODEX" --version >/dev/null 2>&1; then
  CODEX_BIN="$SYSTEM_CODEX"
  check_ok "dùng Codex đã có: $($CODEX_BIN --version 2>/dev/null | head -n1) · $CODEX_BIN"
elif [ -x "$HOME/.local/bin/codex" ] && "$HOME/.local/bin/codex" --version >/dev/null 2>&1; then
  # Bản chính thức đã cài từ lượt trước (installer OpenAI đặt ở ~/.local/bin — thư mục
  # này thường KHÔNG nằm trong PATH của launchd nên `command -v` ở trên không thấy).
  # Không dò chỗ này thì mỗi lần update lại đi tải installer một lần nữa.
  CODEX_BIN="$HOME/.local/bin/codex"
  check_ok "dùng Codex chính thức đã có: $($CODEX_BIN --version 2>/dev/null | head -n1) · $CODEX_BIN"
else
  [ -z "$SYSTEM_CODEX" ] || check_warn "có lệnh Codex tại $SYSTEM_CODEX nhưng health check --version thất bại"
  # Cài bằng installer CHÍNH THỨC của OpenAI (binary native → ~/.local/bin/codex).
  # BẰNG CHỨNG HIỆN TRƯỜNG 24/08/2026: bản codex cài qua npm KHÔNG gen được ảnh trên
  # máy khách; cài lại bằng installer chính thức thì gen được ngay. Vì thế bản npm cũ
  # trong tools/ của KitGen bị HẠ CẤP: chỉ còn là đường lùi khi curl/installer thất
  # bại (mất mạng một phần, proxy chặn releases.openai.com).
  echo "Installing Codex CLI (official installer)..."
  OFFICIAL_CODEX="$HOME/.local/bin/codex"
  # KITGEN_SKIP_CODEX_INSTALL: đường tắt cho CI/test — mô phỏng "không tải được" mà
  # không chạm mạng thật (đối xứng với KITGEN_SKIP_CODEX_UPDATE ở khối nâng cấp).
  if [ -z "${KITGEN_SKIP_CODEX_INSTALL:-}" ] \
     && curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh \
     && [ -x "$OFFICIAL_CODEX" ] && "$OFFICIAL_CODEX" --version >/dev/null 2>&1; then
    CODEX_BIN="$OFFICIAL_CODEX"
    check_ok "cài Codex chính thức: $($CODEX_BIN --version 2>/dev/null | head -n1) · $CODEX_BIN"
  else
    # KHÔNG lùi về npm: bản npm là đúng bản đã gen hỏng ngoài hiện trường — cài nó vào
    # là đèn xanh mà không ra ảnh, tệ hơn dừng lại nói thẳng. Một đường cài duy nhất
    # cũng là một đường update duy nhất — không maintain hai bản codex song song.
    echo "Cài đặt KitGen dừng — KHÔNG cài được Codex CLI chính thức." >&2
    echo "Cách xử: 1) kiểm tra mạng/proxy tới chatgpt.com; 2) tự chạy:" >&2
    echo "     curl -fsSL https://chatgpt.com/codex/install.sh | sh" >&2
    echo "   rồi chạy lại installer này." >&2
    exit 1
  fi
fi
# Dọn bản codex npm cũ trong tools/ (đường cài đã bỏ 24/08/2026): để nguyên thì trên
# máy update từ bản cũ vẫn còn HAI bản codex, và bản npm không bao giờ được nâng nữa.
if [ -e "$KITGEN_HOME/tools/node_modules/@openai/codex" ] \
   && [ "$CODEX_BIN" != "$KITGEN_HOME/tools/node_modules/.bin/codex" ]; then
  rm -rf "$KITGEN_HOME/tools/node_modules/@openai/codex" "$KITGEN_HOME/tools/node_modules/.bin/codex" 2>/dev/null || true
  check_ok "đã dọn bản Codex npm cũ trong tools/ (chỉ còn một đường cài chính thức)"
fi
# Đường vừa dò được có thể là shim ephemeral của shell — quy về đường bền + ĐÚNG TÊN
# trước khi bất cứ ai ghi nó ra đĩa (xem khối resolve_codex_bin ở đầu file).
CODEX_BIN="$(resolve_codex_bin "$CODEX_BIN")"
[ -x "$CODEX_BIN" ] && "$CODEX_BIN" --version >/dev/null 2>&1 || { echo "Codex CLI health check failed after installation." >&2; exit 1; }
"$CODEX_BIN" --version >/dev/null 2>&1 || { echo "Resolved Codex path does not run: $CODEX_BIN" >&2; exit 1; }
check_ok "đường dẫn Codex bền vững và đúng tên: $CODEX_BIN"

# ── NÂNG CODEX LÊN BẢN MỚI ────────────────────────────────────────────────────
# VÌ SAO: công cụ tạo ảnh KHÔNG nằm trong bản phát hành KitGen — nó là tool/skill đi
# kèm gói `@openai/codex`. Trước bản này installer chỉ CÀI codex khi máy chưa có, không
# bao giờ nâng: máy đã có codex thì bấm Cập nhật KitGen bao nhiêu lần cũng vẫn kẹt ở
# bản cũ, và mọi tính năng ảnh mà OpenAI phát hành sau đó KHÔNG BAO GIỜ tới tay người
# dùng. Họ phải tự biết đường gõ `codex update` — mà đó đúng là thứ không nên bắt người
# dùng cuối phải biết.
#
# Dùng `codex update` (lệnh con chính thức) chứ KHÔNG `npm i -g`: codex tự biết nó được
# cài bằng đường nào và tự nâng đúng đường ấy. `npm i -g` sẽ đặt thêm một bản thứ hai
# cạnh bản cũ trên những máy cài bằng cách khác.
#
# BA RÀO, vì đây là công cụ DÙNG CHUNG của cả máy chứ không phải của riêng KitGen:
#  ① Hỏng thì BỎ QUA, không bao giờ làm hỏng lượt cài. Codex cũ vẫn chạy được — mất
#     mạng, thiếu quyền ghi, hay chính bản mới lỗi đều không được phép chặn người dùng.
#  ② Có hạn giờ. `codex update` treo là treo cả lượt cài, mà người dùng chỉ thấy màn
#     hình đứng im không biết vì sao.
#  ③ Có đường tắt: KITGEN_SKIP_CODEX_UPDATE=1 để bỏ qua hẳn — cần cho ai đang ghim một
#     bản codex cụ thể, và cần cho chính mình khi một bản codex mới ra lò bị lỗi.
run_with_timeout(){ # <giây> <lệnh...> → 0 nếu xong đúng hạn, khác 0 nếu hỏng/quá giờ
  _t="$1"; shift
  "$@" & _p=$!
  ( _i=0; while [ "$_i" -lt "$_t" ]; do sleep 1; kill -0 "$_p" 2>/dev/null || exit 0; _i=$((_i+1)); done
    kill -TERM "$_p" 2>/dev/null ) & _w=$!
  wait "$_p" 2>/dev/null; _rc=$?
  kill "$_w" 2>/dev/null; wait "$_w" 2>/dev/null || true
  return "$_rc"
}

CODEX_VER_BEFORE="$("$CODEX_BIN" --version 2>/dev/null | head -n1)"
if [ -n "${KITGEN_SKIP_CODEX_UPDATE:-}" ]; then
  check_ok "bỏ qua nâng Codex theo KITGEN_SKIP_CODEX_UPDATE — giữ $CODEX_VER_BEFORE"
elif run_with_timeout 180 "$CODEX_BIN" update >/dev/null 2>&1; then
  CODEX_VER_AFTER="$("$CODEX_BIN" --version 2>/dev/null | head -n1)"
  if [ "$CODEX_VER_AFTER" != "$CODEX_VER_BEFORE" ]; then
    check_ok "đã nâng Codex: $CODEX_VER_BEFORE → $CODEX_VER_AFTER"
  else
    check_ok "Codex đã là bản mới nhất: $CODEX_VER_BEFORE"
  fi
else
  # Không phải lỗi của người dùng và không chặn được việc gì — nói một câu rồi đi tiếp.
  check_warn "không nâng được Codex (mất mạng, hết giờ, hoặc thiếu quyền) — vẫn dùng $CODEX_VER_BEFORE"
fi

# `codex update` đổi NHỊ PHÂN ngay nhưng KHÔNG viết lại $CODEX_HOME/skills/.system/imagegen/
# — thư mục skill chỉ được đồng bộ khi codex CHẠY lần kế tiếp (BACKLOG #24 ⑬). Không chạy
# hộ thì lượt gen ĐẦU TIÊN sau update vẫn dùng SKILL.md đời cũ — đúng ca ảnh đục đã cắn
# người dùng thật. `debug prompt-input` rẻ: không mạng, không quota, chỉ liệt kê skill.
run_with_timeout 60 env CODEX_HOME="$HOME/.codex" "$CODEX_BIN" debug prompt-input >/dev/null 2>&1 || true

# Trình render khung xương: @resvg/resvg-wasm (2,4 MB, thuần JS + .wasm).
# Thay Playwright + Chromium (790,9 MB) — xem BACKLOG #15. BẮT BUỘC, không có
# đường lùi: gen.sh dừng hẳn nếu thiếu (bản PIL cũ lệch 17,6% mực, đã xoá).
if ! NODE_PATH="$KITGEN_HOME/tools/node_modules" "$NODE" -e "require.resolve('@resvg/resvg-wasm')" >/dev/null 2>&1; then
  echo "Installing skeleton renderer (@resvg/resvg-wasm)..."
  "$KITGEN_HOME/tools/node/bin/npm" install --silent --prefix "$KITGEN_HOME/tools" @resvg/resvg-wasm || \
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
# Engine có thể đang được gen.sh/cover.sh đọc. Copy từng file qua inode tạm để lượt
# đang chạy giữ nguyên byte cũ; lượt mới thấy toàn bộ file mới sau rename.
while IFS= read -r -d '' _engine_src; do
  _engine_rel="${_engine_src#"$DEST/engine/"}"
  _engine_dst="$WORKSPACE/.kitgen/engine/$_engine_rel"
  if [[ "$_engine_rel" == *.sh ]]; then
    atomic_copy_file "$_engine_src" "$_engine_dst" 1
  else
    atomic_copy_file "$_engine_src" "$_engine_dst"
  fi
done < <(find "$DEST/engine" -type f -print0)
# `bin/kitgen` cũng là shell script có thể đang được đọc bởi lệnh update/status.
atomic_copy_file "$DEST/runtime/bin/kitgen" "$KITGEN_HOME/bin/kitgen" 1
"$PYTHON3" - "$WORKSPACE/.kitgen/config.json" <<'PY'
import json, os, sys
p = sys.argv[1]
try:
    with open(p) as f: cfg = json.load(f)
except Exception: cfg = {}
cfg.setdefault("workspaceVersion", 1); cfg.setdefault("maxJobs", 4)
# Hồ sơ ảnh riêng đã bỏ 24/08/2026: mọi máy dùng thẳng ~/.codex. Xoá khối `imageGen`
# sót lại từ bản cũ để không ai (kể cả engine cũ chưa update xong) đọc nhầm nó nữa.
cfg.pop("imageGen", None)
tmp = p + ".tmp"
with open(tmp, "w") as f: json.dump(cfg, f, indent=2); f.write("\n")
os.replace(tmp, p)
PY
# Installer có thể đang chạy đúng từ `$KITGEN_HOME/install.sh`; rename inode mới để
# Bash tiếp tục đọc bản cũ an toàn, kể cả khi bản phát hành mới dài hơn nhiều dòng.
atomic_copy_file "$DEST/install.sh" "$KITGEN_HOME/install.sh" 1
ATOMIC_TMP="$(mktemp "$KITGEN_HOME/.kitgen-config.XXXXXX")"
cat > "$ATOMIC_TMP" <<CFG
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
CFG
chmod 600 "$ATOMIC_TMP"
mv -f "$ATOMIC_TMP" "$KITGEN_HOME/config.env"
ATOMIC_TMP=""
progress "5/7" "Đăng ký dịch vụ local"
# Đây là điểm KHÔNG QUAY ĐẦU: từ dòng này `current` là bản mới, và mọi đường thoát
# phía dưới đều phải tự nói ra mình để lại máy ở trạng thái nào (xem `cleanup`).
ACTIVATED=1
write_update_txn prepared "$PREVIOUS" "$DEST"
write_update_txn activated "$PREVIOUS" "$DEST"
ln -sfn "$DEST" "$KITGEN_HOME/current"
if [ "$NO_START" -eq 0 ]; then
  if [ "$(uname -s)" = Darwin ]; then
    PLIST="$HOME/Library/LaunchAgents/com.kitgen.agent.plist"
    mkdir -p "$(dirname "$PLIST")"
    atomic_render_file "$PLIST" sed -e "s|@KITGEN_BIN@|$BIN|g" -e "s|@KITGEN_HOME@|$KITGEN_HOME|g" "$DEST/runtime/service/com.kitgen.agent.plist.in"
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
    atomic_render_file "$UNIT" sed "s|@KITGEN_BIN@|$BIN|g" "$DEST/runtime/service/kitgen-agent.service.in"
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
      clear_update_txn
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
      clear_update_txn
      exit 1
    fi
  fi
  progress "6/7" "Health check dịch vụ"
  check_ok "agent $VERSION phản hồi tại http://127.0.0.1:$PORT/health"
else
  ACTIVATED=0   # --no-start: cài xong, cố ý không chạy — không có gì để lùi
  progress "6/7" "Bỏ qua health check dịch vụ (--no-start)"
fi
clear_update_txn
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
if [ ! -f "$HOME/.codex/auth.json" ]; then
  echo "  Còn một bước: đăng nhập Codex — gõ \`$CODEX_BIN login\` hoặc bấm nút Đăng nhập trong app"
else
  echo "  Tài khoản Codex: đã đăng nhập (~/.codex)"
fi
