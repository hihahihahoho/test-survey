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
# WORKSPACE được chốt SAU vòng đọc tham số: thứ tự là --workspace > $KITGEN_WORKSPACE >
# config.env của bản đang cài > mặc định $HOME/KitGen. Xem khối "WORKSPACE THẬT" dưới.
WORKSPACE="${KITGEN_WORKSPACE:-}"
WORKSPACE_EXPLICIT=0
[ -z "$WORKSPACE" ] || WORKSPACE_EXPLICIT=1
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
# QUÉT SẠCH BẢN ĐỜI CŨ RỒI MỚI CÀI (16/09/2026, bản 3.0.0).
# 0 = tự dò (mặc định), 1 = ép bằng `--fresh` hoặc KITGEN_FRESH=1. Xem khối
# "CÀI LẠI TỪ ĐẦU" ở giữa file để biết dò bằng dấu hiệu nào và quét những gì.
FRESH_FORCED=0
[ -z "${KITGEN_FRESH:-}" ] || FRESH_FORCED=1
FRESH=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --archive) ARCHIVE="$2"; shift ;;
    --release-url) RELEASE_URL="$2"; shift ;;
    --repo) RELEASE_REPO="$2"; shift ;;
    --sha256) EXPECTED_SHA="$2"; shift ;;
    --workspace) WORKSPACE="$2"; WORKSPACE_EXPLICIT=1; shift ;;
    --origin) ORIGIN="$2"; shift ;;
    --port) PORT="$2"; [ "$ORIGIN" = "http://127.0.0.1:8765" ] && ORIGIN="http://127.0.0.1:$2"; shift ;;
    --no-start) NO_START=1 ;;
    # Hồ sơ ảnh riêng (~/.codex-img) đã bỏ 24/08/2026 — mọi bản cài dùng thẳng
    # ~/.codex của người dùng. Cờ cũ giữ lại làm no-op để `kitgen update` từ bản
    # cũ (config.env còn truyền cờ) không chết vì "Unknown option".
    --codex-default|--codex-img) echo "Cảnh báo: $1 đã bỏ — KitGen luôn dùng Codex mặc định (~/.codex)." >&2 ;;
    --update) IS_UPDATE=1 ;;
    --fresh) FRESH_FORCED=1 ;;
    -h|--help)
      echo "Usage: install.sh [--archive runtime.tar.gz | --release-url URL] [--sha256 HASH]"
      echo "                  [--repo OWNER/REPO]"
      echo "                  [--workspace PATH] [--origin URL] [--port N] [--no-start]"
      echo "                  [--fresh]   gỡ sạch bản cũ rồi cài mới (mặc định: tự dò bản đời cũ)"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# ── WORKSPACE THẬT, KHÔNG PHẢI WORKSPACE MẶC ĐỊNH ────────────────────────────
# `bin/kitgen update` và agent (`lib/update.mjs`) đều SOURCE `config.env` rồi `exec`
# installer. Nhưng config.env ghi `KITGEN_WORKSPACE='…'` KHÔNG kèm `export`, mà biến
# không export thì không đi qua `exec` — nên tới đây nó đã biến mất, và installer lặng
# lẽ quay về mặc định `$HOME/KitGen`. Máy nào đặt workspace chỗ khác thì mỗi lượt update
# lại dựng một workspace thứ hai ở chỗ không ai mở.
# Từ 16/09/2026 chuyện này không còn là phiền một chút: bước "Gỡ bản cũ" XOÁ mấy đường
# di sản TRONG workspace, nên đọc nhầm workspace là xoá trong một thư mục không phải của
# lượt cài này. Đọc thẳng từ config.env — nguồn sự thật duy nhất về chỗ dữ liệu nằm.
if [ "$WORKSPACE_EXPLICIT" -eq 0 ] && [ -f "$KITGEN_HOME/config.env" ]; then
  CFG_WORKSPACE="$(sed -n "s/^KITGEN_WORKSPACE='\(.*\)'\$/\1/p" "$KITGEN_HOME/config.env" | head -n 1)"
  case "$CFG_WORKSPACE" in /*) WORKSPACE="$CFG_WORKSPACE" ;; esac
fi
[ -n "$WORKSPACE" ] || WORKSPACE="$HOME/KitGen"
# ── KITGEN KHÔNG CÒN CẦN PYTHON (16/09/2026, bước ⑤a của đợt port engine sang JS) ──
# Tới bản 2.1.45 engine là `gen.sh` + `slice.py` + `geometry.py`, nên installer phải
# MANG THEO cả một bản CPython pin cứng (~24 MB vào `$KITGEN_HOME/tools/python`), dựng
# venv trong workspace và `pip install pillow` vào đó. Toàn bộ engine nay là JS chạy
# bằng đúng Node riêng mà installer vẫn tải (`agent/engine/cli.mjs`), nên:
#   · KHÔNG dò python3 của máy, KHÔNG tải CPython, KHÔNG dựng venv, KHÔNG gọi pip;
#   · những thứ đời trước đã cài (tools/python, <workspace>/.venv) bị DỌN ở lượt update
#     — xem khối "DỌN DI SẢN ĐỜI PYTHON" bên dưới; để lại là ~330 MB không ai gọi.
# Vài helper phía installer trước đây mượn python3 (realpath, đọc JSON): nay dùng Node
# riêng hoặc `sed`, xem `realpath_of` và `json_str`.
#
# Tarball CPython cũ vẫn nằm trên GitHub Releases (tag `runtime-python-3.13.15`) và CỨ
# ĐỂ NGUYÊN: máy còn chạy bản ≤2.1.45 vẫn tải từ đó khi cài lại.

# Lấy một field CHUỖI của một JSON PHẲNG do CHÍNH mình sinh ra (release.json). Cùng khuôn
# với `json_field` trong runtime/bin/kitgen, và cùng lý do: không kéo thêm một runtime
# nữa vào đường cài chỉ để đọc hai chuỗi.
json_str(){
  sed -n 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
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
#
# DẤU NHẬN DIỆN LÀ `agent/engine/cli.mjs`, KHÔNG PHẢI `engine/gen.sh` NỮA. Hai hàm này
# quyết định "thư mục kia có phải KitGen không"; quên đổi chúng cùng lúc với việc xoá
# engine bash là mọi bản mới bị CHÍNH installer của nó gọi là "Invalid KitGen runtime
# archive" — hỏng câm ngay ở bước đầu, trước cả khi có gì để đọc trong log.
is_release(){ [ -f "$1/agent/server.mjs" ] && [ -f "$1/agent/engine/cli.mjs" ] && [ -f "$1/app/index.html" ]; }
is_source(){ [ -f "$1/agent/server.mjs" ] && [ -f "$1/agent/engine/cli.mjs" ] && [ -f "$1/scripts/build-runtime.sh" ]; }
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
# Số bước KHÔNG còn là hằng số: lượt "quét sạch bản đời cũ" chèn thêm đúng một bước
# (xem khối CÀI LẠI TỪ ĐẦU). Đếm bằng biến chứ không gõ tay "3/6" ở từng chỗ — gõ tay
# là thứ sẽ lệch ngay lần sau có ai chèn thêm một bước nữa.
STEP_N=0
STEP_TOTAL=6
step(){ STEP_N=$((STEP_N + 1)); progress "$STEP_N/$STEP_TOTAL" "$1"; }
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
# Trước 16/09/2026 hàm này gọi `python3 -c os.path.realpath`. Nay Node riêng của KitGen
# đã có mặt từ bước [2/6] và mọi caller đều đứng sau bước ấy, nên `fs.realpathSync` làm
# đúng việc đó mà không cần thêm một runtime nào. Đường lui `cd … && pwd -P` gỡ được
# symlink của THƯ MỤC (đủ cho ca fnm multishell ở trên) khi Node vì lý do gì đó chưa có.
realpath_of(){
  _rp_out=""
  if [ -n "${NODE:-}" ] && [ -x "${NODE:-}" ]; then
    _rp_out="$("$NODE" -p 'require("fs").realpathSync(process.argv[1])' "$1" 2>/dev/null || true)"
  fi
  # KHÔNG tin bừa đầu ra: đường dẫn thật thì phải TUYỆT ĐỐI và PHẢI TỒN TẠI. Bộ ca cài
  # đặt thay `node` bằng một script giả trả lời cố định, và một chuỗi rác trôi từ đây ra
  # sẽ đi thẳng vào `config.env` dưới dạng đường dẫn Codex — đúng họ bug 14/08.
  case "$_rp_out" in
    /*) [ -e "$_rp_out" ] && { printf '%s' "$_rp_out"; return 0; } ;;
  esac
  _rp_dir="$(dirname -- "$1")"
  _rp_base="$(basename -- "$1")"
  _rp_real="$(CDPATH= cd -- "$_rp_dir" 2>/dev/null && pwd -P || printf '%s' "$_rp_dir")"
  printf '%s/%s' "$_rp_real" "$_rp_base"
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
  # được ⇒ tuyệt đối không ghi đường dẫn đó ra config.env.
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
    # `sed` chứ không phải một trình JSON: khối này chạy TRƯỚC khi Node riêng được tải
    # (máy trắng chưa có gì), còn release.json thì do CI của mình sinh ra và chỉ có ba
    # field chuỗi phẳng. Đây là lý do duy nhất install.sh từng phải dò python3 trên PATH.
    RELEASE_URL="$(printf '%s' "$META" | json_str archive)"
    RELEASE_VERSION="$(printf '%s' "$META" | json_str version)"
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

# ═══════════════════════════════════════════════════════════════════════════════
# CÀI LẠI TỪ ĐẦU — MÁY ĐỜI CŨ PHẢI ĐƯỢC GỠ SẠCH TRƯỚC KHI CÀI BẢN 3.x.
#
# VÌ SAO (16/09/2026, đợt port engine sang JS): máy nào từng cài ≤2.1.45 đang gánh
# nguyên một đời trước — `tools/python` (CPython + venv, hàng trăm MB), engine bash
# chép vào workspace, Playwright, @resvg, một bản @openai/codex lạc trong Node riêng,
# và cả chục bản phát hành cũ trong `releases/`. Trước bản này installer dọn từng
# thứ một, ở ba khối rải rác trong file: mỗi lần bỏ thêm một thứ lại phải nhớ viết
# thêm một dòng `rm -rf`, và thứ nào quên thì nằm lại vĩnh viễn. Nay chỉ còn MỘT cơ
# chế: thấy dấu hiệu đời cũ ⇒ gỡ sạch theo DANH SÁCH GIỮ (allowlist) rồi cài mới.
#
# TRÌNH TỰ, và trình tự là phần quan trọng nhất:
#   ① gói mới đã tải về + đối chiếu checksum XONG (ngay trên dòng này) — không bao giờ
#      phá thứ đang chạy khi chưa cầm chắc thứ thay thế;
#   ② dừng dịch vụ + tiến trình agent cũ;
#   ③ quét: releases/, current, tools/, install.sh|install.ps1 cũ trong KITGEN_HOME,
#      và năm đường di sản trong workspace (gõ thẳng tên, không `find`). GIỮ:
#      config.env, logs/, bin/ và TOÀN BỘ
#      phần còn lại của workspace (projects là dữ liệu người dùng — không đụng);
#   ④ rồi mới đi tiếp đúng trình tự thường: Node → Codex (`codex update`) → đăng ký
#      dịch vụ → health check.
#
# KHÔNG CÓ ĐƯỜNG LÙI ở lượt này: bản cũ đã bị gỡ, nên health check hỏng thì nói thẳng
# "chạy lại installer", không giả vờ có rollback (xem nhánh health check bên dưới).
#
# HAI RÀO CHẮN, mỗi cái vì một ca hỏng cụ thể:
#  · CHỈ quét khi GÓI ĐANG CÀI là đời 3 trở lên. Cài một gói 2.x đè lên 2.x là lượt
#    update CÙNG ĐỜI: ở đó bản cũ chính là đường lùi, quét đi là vứt mất rollback —
#    đúng thứ mà install-launchd/install-restart đo. `--fresh` vẫn ép được bằng tay.
#  · GIỮ LẠI `tools/node` NẾU nó chạy được và đủ đời (>=20). Xoá một Node đang lành
#    lặn rồi mới đi tải lại 30 MB là tự đặt cả lượt cài vào tay đường mạng, NGAY SAU
#    khi vừa xoá bản cũ — mạng rớt ở đúng khe đó là máy không còn gì để chạy. Node
#    hỏng/quá cũ thì vẫn xoá như mọi thứ khác trong tools/ (bước sau tải lại, có
#    checksum). Phần lạc trong tools/node (gói @openai/codex 277 MB) do khối "dọn gói
#    codex lạc" ở bước Codex xử — nó có rào riêng để không xoá nhầm codex của máy.
# ═══════════════════════════════════════════════════════════════════════════════
# Xoá nhầm gốc của một thư mục lớn là hỏng máy người dùng, không phải phiền một chút.
case "$KITGEN_HOME" in
  ''|/|"$HOME"|"$HOME"/) echo "KITGEN_HOME không hợp lệ: '$KITGEN_HOME'" >&2; exit 1 ;;
esac
case "$WORKSPACE" in
  ''|/|"$HOME"|"$HOME"/) echo "KITGEN_WORKSPACE không hợp lệ: '$WORKSPACE'" >&2; exit 1 ;;
esac
# "3.0.0-rc1" → 3; "" hoặc rác → 0 (0 = KHÔNG KẾT LUẬN ĐƯỢC, không phải "đời cũ").
version_major(){
  _vm="${1%%.*}"
  _vm="$(printf '%s' "$_vm" | sed 's/[^0-9].*//')"
  case "$_vm" in ''|*[!0-9]*) printf '0' ;; *) printf '%s' "$_vm" ;; esac
}
NEW_MAJOR="$(version_major "$VERSION")"
INSTALLED_VERSION="$(cat "$KITGEN_HOME/current/VERSION" 2>/dev/null || true)"
[ -n "$INSTALLED_VERSION" ] || INSTALLED_VERSION="$(cat "$KITGEN_HOME/VERSION" 2>/dev/null || true)"
FRESH_WHY=""
fresh_why(){ FRESH_WHY="$FRESH_WHY${FRESH_WHY:+; }$1"; }
[ ! -e "$KITGEN_HOME/tools/python" ] || fresh_why "có $KITGEN_HOME/tools/python (CPython đời cũ)"
if [ -f "$KITGEN_HOME/current/engine/gen.sh" ] && [ ! -f "$KITGEN_HOME/current/agent/engine/cli.mjs" ]; then
  fresh_why "bản đang cài còn engine bash (current/engine/gen.sh)"
fi
if [ -n "$INSTALLED_VERSION" ] && [ "$(version_major "$INSTALLED_VERSION")" -lt 3 ]; then
  fresh_why "bản đã cài là $INSTALLED_VERSION (đời trước 3.x)"
fi
[ ! -e "$WORKSPACE/.kitgen/engine" ] || fresh_why "có $WORKSPACE/.kitgen/engine (engine chép vào workspace)"
[ ! -e "$WORKSPACE/.venv" ] || fresh_why "có $WORKSPACE/.venv (venv đời Python)"
if [ "$FRESH_FORCED" -eq 1 ]; then
  FRESH=1
  [ -n "$FRESH_WHY" ] || FRESH_WHY="ép bằng --fresh/KITGEN_FRESH"
elif [ -n "$FRESH_WHY" ] && [ "$NEW_MAJOR" -ge 3 ]; then
  FRESH=1
fi
[ "$FRESH" -eq 0 ] || STEP_TOTAL=7

SWEEP_KB=0
SWEEP_WHAT=""
# Xoá một đường dẫn ĐÃ ĐƯỢC KỂ TÊN, cộng dồn dung lượng, và nhớ tên để in ra. Không
# `find`, không glob đệ quy: mọi thứ bị xoá đều phải gõ thẳng tên ở danh sách dưới.
sweep_rm(){ # sweep_rm <đường dẫn> <tên hiển thị>
  [ -e "$1" ] || [ -L "$1" ] || return 0
  _kb="$(du -sk "$1" 2>/dev/null | awk 'NR==1{print $1}')"
  case "$_kb" in ''|*[!0-9]*) _kb=0 ;; esac
  if rm -rf "$1" 2>/dev/null; then
    SWEEP_KB=$((SWEEP_KB + _kb))
    SWEEP_WHAT="$SWEEP_WHAT $2"
  else
    check_warn "không xoá được $1 — dọn tay rồi chạy lại installer"
  fi
}
# Dừng dịch vụ TRƯỚC khi xoá `releases/`. Dùng lại đúng đường dừng của bước đăng ký
# dịch vụ bên dưới, không bịa thêm cách thứ hai.
#
# `--no-start` = "installer không được đụng tới dịch vụ", cả bật LẪN tắt: cờ này chỉ
# có người gọi tự quản dịch vụ (CI, bộ ca, cài vào HOME tạm) mới dùng, và ở đó nhãn
# launchd `com.kitgen.agent` là của MÁY THẬT — bootout ở đó là tắt KitGen của chính
# người đang chạy test.
fresh_stop_service(){
  if [ "$NO_START" -eq 1 ]; then
    check_ok "--no-start: không đụng tới dịch vụ đang chạy"
    return 0
  fi
  [ ! -x "$BIN" ] || "$BIN" stop >/dev/null 2>&1 || true
  if [ "$(uname -s)" = Darwin ]; then
    _domain="gui/$(id -u)"
    launchctl bootout "$_domain/com.kitgen.agent" >/dev/null 2>&1 || \
      launchctl unload "$HOME/Library/LaunchAgents/com.kitgen.agent.plist" >/dev/null 2>&1 || true
    for _ in 1 2 3 4 5; do
      launchctl print "$_domain/com.kitgen.agent" >/dev/null 2>&1 || break
      sleep 1
    done
  elif command -v systemctl >/dev/null 2>&1; then
    systemctl --user stop kitgen-agent >/dev/null 2>&1 || true
  fi
  # Đường cuối cho bản cài không qua launchd/systemd (`nohup kitgen run`). Chỉ giết
  # tiến trình chạy agent TRONG $KITGEN_HOME — installer đang chạy từ thư mục tạm nên
  # không tự giết mình (agent spawn nó bằng `setsid`, session khác — xem update.mjs ①).
  pkill -f "$KITGEN_HOME/.*agent/server.mjs" >/dev/null 2>&1 || true
  check_ok "đã dừng dịch vụ và tiến trình agent cũ"
}
if [ "$FRESH" -eq 1 ]; then
  # Gói có thể đang nằm NGAY TRONG $KITGEN_HOME (ai đó chạy install.sh của một bản đã
  # giải nén trong releases/). Chép ra chỗ khác trước khi quét, nếu không thì bước quét
  # xoá mất chính thứ đang định cài.
  case "$CANDIDATE" in
    "$KITGEN_HOME"/*)
      mkdir -p "$TMP/candidate"
      cp -R "$CANDIDATE/." "$TMP/candidate/"
      CANDIDATE="$TMP/candidate"
      ;;
  esac
fi
step "Kiểm tra gói cài đặt"
check_ok "runtime $VERSION và checksum hợp lệ"
if [ "$FRESH" -eq 1 ]; then
  step "Gỡ bản cũ (cài lại từ đầu)"
  check_ok "nhận ra bản đời cũ: $FRESH_WHY"
  fresh_stop_service
  FRESH_KEEP_NODE=0
  if [ -x "$KITGEN_HOME/tools/node/bin/node" ]; then
    _node_major="$("$KITGEN_HOME/tools/node/bin/node" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || printf '0')"
    case "$_node_major" in ''|*[!0-9]*) _node_major=0 ;; esac
    [ "$_node_major" -lt 20 ] || FRESH_KEEP_NODE=1
  fi
  sweep_rm "$KITGEN_HOME/releases" "releases/"
  sweep_rm "$KITGEN_HOME/current" "current"
  for _t in "$KITGEN_HOME"/tools/* "$KITGEN_HOME"/tools/.[!.]*; do
    [ -e "$_t" ] || [ -L "$_t" ] || continue
    if [ "$FRESH_KEEP_NODE" -eq 1 ] && [ "$(basename "$_t")" = node ]; then continue; fi
    sweep_rm "$_t" "tools/$(basename "$_t")"
  done
  sweep_rm "$KITGEN_HOME/install.sh" "install.sh (bản cũ)"
  sweep_rm "$KITGEN_HOME/install.ps1" "install.ps1 (bản cũ)"
  # Workspace: ĐÚNG NĂM đường dẫn này, không hơn. `projects/` và mọi thứ khác là dữ
  # liệu người dùng — installer không có việc gì ở đó.
  sweep_rm "$WORKSPACE/.kitgen/engine" "workspace/.kitgen/engine"
  sweep_rm "$WORKSPACE/.kitgen/.venv" "workspace/.kitgen/.venv"
  sweep_rm "$WORKSPACE/.kitgen/__pycache__" "workspace/.kitgen/__pycache__"
  sweep_rm "$WORKSPACE/.venv" "workspace/.venv"
  sweep_rm "$WORKSPACE/__pycache__" "workspace/__pycache__"
  if [ -n "$SWEEP_WHAT" ]; then
    SWEEP_MB="$(printf '%s' "$SWEEP_KB" | awk '{printf "%.0f", $1/1024}')"
    check_ok "đã dọn ${SWEEP_MB:-?} MB di sản đời cũ:$SWEEP_WHAT"
  else
    check_ok "đã dọn: không còn gì của đời cũ trên máy"
  fi
  [ "$FRESH_KEEP_NODE" -eq 0 ] || check_ok "giữ lại Node riêng đang lành lặn trong tools/node (không tải lại 30 MB)"
  check_ok "giữ nguyên: config.env, logs/, và toàn bộ workspace ngoài các đường trên (project là dữ liệu của bạn)"
fi
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
#
# NHƯNG: PATH này CHỈ dành cho những lệnh của CHÍNH KitGen. Giữ lại bản gốc, vì bên
# dưới có một lệnh KHÔNG được phép nhìn thấy Node riêng — `codex update` (xem khối
# NÂNG CODEX). Đo được 16/09/2026: codex bản npm chạy `npm install -g @openai/codex`,
# npm đầu PATH là npm của KitGen ⇒ 277 MB @openai/codex (binary MỌI nền tảng) rơi vào
# tools/node của KitGen, còn codex THẬT của người dùng không hề được nâng.
KITGEN_ORIG_PATH="$PATH"; export KITGEN_ORIG_PATH
PATH="$(dirname "$NODE"):$PATH"; export PATH
step "Health check môi trường nền"
check_ok "Node $($NODE --version 2>/dev/null || printf '>=20') · $NODE"
# ── Python: KHÔNG CÒN GÌ Ở ĐÂY (16/09/2026) ──────────────────────────────────
# Chỗ này từng là 55 dòng dò/tải/giải nén một bản CPython pin cứng, chỉ để `slice.py`
# và `gen.sh` chạy được. Engine JS chạy bằng đúng $NODE ở ngay trên, nên bước [2/6]
# tới đây là đã xong. Di sản đời Python (tools/python, <workspace>/.venv) được DỌN ở
# bước [4/6] — xem khối "DỌN DI SẢN ĐỜI PYTHON".
# Self-test before switching current; production artifacts intentionally omit tests.
"$NODE" --check "$NEW/agent/server.mjs" >/dev/null
rm -rf "$DEST"
mv "$NEW" "$DEST"
# ═══════════════════════════════════════════════════════════════════════════════
# KÍCH HOẠT VÀO PHÚT CHÓT — vì sao `ln -sfn current` KHÔNG nằm ở đây nữa.
#
# Trước 2.1.21, symlink `current` được trỏ sang bản mới NGAY TẠI DÒNG NÀY, tức bước 2/6,
# rồi script còn phải đi qua mấy bước hay hỏng nhất (đời đó là venv+pip; nay là
# cài/dò Codex, dọn di sản, ghi config) trước khi tới bước khởi động lại ở 4/6. Bất kỳ lỗi nào trong quãng
# đó là `set -e` thoát ngay ⇒ để lại ĐÚNG hiện trường ngày 14/08: `current` đã trỏ 2.1.20,
# tiến trình agent vẫn là 2.1.19, không có dòng log nào, UI vẫn mời cập nhật.
#
# Nay `current` chỉ đổi khi mọi thứ đã sẵn sàng và ngay trước khi khởi động lại (bước 4/6),
# nên cửa sổ "cài dở" thu về vài mili-giây; phần còn lại được `cleanup` gác. Bản mới nằm
# sẵn ở $DEST suốt quá trình — không ai đọc nó cho tới lúc đổi symlink.
# ═══════════════════════════════════════════════════════════════════════════════
PREVIOUS="$(readlink "$KITGEN_HOME/current" 2>/dev/null || true)"
# Prefer an existing healthy Codex CLI. Persisting its absolute path means the
# background service does not depend on launchd/systemd inheriting the shell PATH.
step "Health check Codex CLI"
# TÌM TRÊN PATH GỐC, không phải PATH đã chèn Node riêng ở bước [2/6]: nếu một lượt cài
# đời trước đã lỡ để `npm install -g @openai/codex` đổ vào tools/node (xem khối dọn bên
# dưới), thì `tools/node/bin/codex` đứng NGAY ĐẦU PATH và installer sẽ nhận nhầm bản lạc
# ấy làm codex của máy — vừa tự khoá khối dọn, vừa ghim KitGen vào đúng bản npm đã gen
# hỏng ngoài hiện trường. Codex của MÁY thì phải tìm trên PATH của NGƯỜI DÙNG.
SYSTEM_CODEX="$(PATH="$KITGEN_ORIG_PATH" command -v codex 2>/dev/null || true)"
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
# Dọn gói codex mà chính installer đời trước đã VÔ TÌNH tự cài vào Node riêng: `codex
# update` chạy với npm của KitGen ở đầu PATH thì npm prefix là tools/node, nên
# `npm install -g @openai/codex` đổ nguyên gói (binary cho MỌI nền tảng, ~277 MB) vào
# tools/node/lib/node_modules. Không ai gọi tới nó — codex thật nằm chỗ khác — nên nó
# chỉ là đĩa mất trắng, và lượt update nào cũng phình thêm một bản mới.
STRAY_NPM_CODEX="$KITGEN_HOME/tools/node/lib/node_modules/@openai/codex"
case "$CODEX_BIN" in "$STRAY_NPM_CODEX"/*) STRAY_IS_LIVE=1 ;; *) STRAY_IS_LIVE="" ;; esac
if [ -e "$STRAY_NPM_CODEX" ] && [ -z "$STRAY_IS_LIVE" ] \
   && [ "$CODEX_BIN" != "$KITGEN_HOME/tools/node/bin/codex" ]; then
  STRAY_SIZE="$(du -sh "$STRAY_NPM_CODEX" 2>/dev/null | awk '{print $1}')"
  rm -rf "$STRAY_NPM_CODEX" "$KITGEN_HOME/tools/node/bin/codex" 2>/dev/null || true
  rmdir "$KITGEN_HOME/tools/node/lib/node_modules/@openai" 2>/dev/null || true
  check_ok "đã dọn ${STRAY_SIZE:-?} gói @openai/codex lạc vào Node riêng của KitGen — do «codex update» đời trước chạy nhầm npm của KitGen; codex thật đang ở $CODEX_BIN"
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
# PATH GỐC, không phải PATH đã chèn Node riêng: `codex update` của bản cài-qua-npm
# gọi thẳng `npm install -g @openai/codex@latest`, và npm ĐẦU TIÊN trên PATH là kẻ
# quyết định gói rơi vào đâu. Để npm của KitGen đứng đầu thì gói 277 MB rơi vào
# tools/node của KitGen còn codex của người dùng KHÔNG được nâng — installer vẫn in
# «Codex đã là bản mới nhất». Trả lại PATH gốc là trả việc nâng codex về đúng chủ.
elif run_with_timeout 180 env PATH="$KITGEN_ORIG_PATH" "$CODEX_BIN" update >/dev/null 2>&1; then
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

# ── (ĐÃ GỘP) DỌN RÁC ĐỜI PLAYWRIGHT / @resvg / PYTHON ────────────────────────
# Ở đây từng có HAI khối `rm -rf` rời nhau: một khối xoá `tools/playwright-browsers`
# (790,9 MB) + `@resvg/resvg-wasm`, một khối xoá `tools/python` + `<workspace>/.venv`
# + `<workspace>/.kitgen/engine` rồi in "đã dọn N MB di sản". Cả hai chạy ở MỌI lượt
# update, và mỗi lần bỏ thêm một thứ khỏi đường cài lại phải nhớ thêm một dòng nữa.
# Từ 16/09/2026 chỉ còn MỘT cơ chế: máy còn dấu hiệu đời cũ thì bị GỠ SẠCH ở bước
# "Gỡ bản cũ" (khối CÀI LẠI TỪ ĐẦU, ngay trước bước [1/N]) — nguyên thư mục `tools/`
# ra đi, nên không còn thứ gì để kể tên ở đây nữa. Lượt update 3.x → 3.x không có di
# sản nào để dọn, và giữ nguyên bản trước để lùi.
mkdir -p "$WORKSPACE/.kitgen" "$WORKSPACE/projects"
# ── (ĐÃ GỘP) DI SẢN ĐỜI PYTHON / ĐỜI ENGINE-CHÉP-VÀO-WORKSPACE ───────────────
# Khối này từng xoá `tools/python`, `<workspace>/.venv`, `<workspace>/.kitgen/engine`
# ở MỌI lượt update. Ba đường ấy nay là DẤU HIỆU nhận ra máy đời cũ chứ không còn là
# việc dọn lặt vặt: thấy một trong ba là cả máy được gỡ sạch ở bước "Gỡ bản cũ" (khối
# CÀI LẠI TỪ ĐẦU). Một cơ chế, một chỗ để đọc, một dòng báo cáo.
#
# `.kitgen/engine` nguy nhất trong ba: `resolveEngine` thử `ws.engineDir` TRƯỚC, nên
# một engine đời cũ nằm đó sẽ được agent MỚI chạy. Đó là lý do nó nằm trong danh sách
# dấu hiệu, không phải chỉ trong danh sách quét.
# `bin/kitgen` cũng là shell script có thể đang được đọc bởi lệnh update/status.
atomic_copy_file "$DEST/runtime/bin/kitgen" "$KITGEN_HOME/bin/kitgen" 1
# config.json: trước 16/09/2026 khối này là một heredoc python3. Nay Node riêng làm —
# cùng một việc, và là runtime DUY NHẤT mà KitGen còn mang theo.
"$NODE" -e '
const fs = require("fs");
const p = process.argv[1];
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(p, "utf8")) || {} } catch { cfg = {} }
if (typeof cfg !== "object" || Array.isArray(cfg)) cfg = {};
if (cfg.workspaceVersion === undefined) cfg.workspaceVersion = 1;
if (cfg.maxJobs === undefined) cfg.maxJobs = 4;
/* Hồ sơ ảnh riêng đã bỏ 24/08/2026: mọi máy dùng thẳng ~/.codex. Xoá khối `imageGen`
   sót lại từ bản cũ để không ai đọc nhầm nó nữa. */
delete cfg.imageGen;
fs.writeFileSync(p + ".tmp", JSON.stringify(cfg, null, 2) + "\n");
fs.renameSync(p + ".tmp", p);
' "$WORKSPACE/.kitgen/config.json"
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
step "Đăng ký dịch vụ local"
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
    elif [ "$FRESH" -eq 1 ]; then
      # KHÔNG CÓ ĐƯỜNG LÙI, và phải nói ra như thế. Lượt này đã gỡ sạch bản đời cũ
      # (bước "Gỡ bản cũ"), nên không còn bản nào để trả về — vờ như có rollback ở đây
      # là để người dùng ngồi đợi một thứ không tồn tại.
      {
        printf '\n'
        printf 'KitGen %s đã cài xong nhưng dịch vụ KHÔNG phản hồi.\n' "$VERSION"
        printf 'Lượt này là cài lại từ đầu (bản đời cũ đã được gỡ), nên KHÔNG có bản cũ để lùi về.\n'
        printf 'Chạy lại lệnh cài đặt một lần nữa:\n\n'
        printf '  %s\n\n' "$KITGEN_HOME/bin/kitgen update"
        printf 'Dữ liệu trong %s KHÔNG bị đụng tới. Nhật ký: %s\n' "$WORKSPACE" "$KITGEN_HOME/install.log"
      } | tee -a "$KITGEN_HOME/install.log" >&2
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
  step "Health check dịch vụ"
  check_ok "agent $VERSION phản hồi tại http://127.0.0.1:$PORT/health"
else
  ACTIVATED=0   # --no-start: cài xong, cố ý không chạy — không có gì để lùi
  step "Bỏ qua health check dịch vụ (--no-start)"
fi
clear_update_txn
step "Dọn bản cũ"
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
echo "  Bản chạy      $KITGEN_HOME   (runtime, log, Node/Codex riêng)"
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
