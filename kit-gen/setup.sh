#!/usr/bin/env bash
#
# setup.sh — cài đặt kit-gen v2 trên máy cá nhân. Chạy MỘT lệnh là xong.
#
#   bash setup.sh                       # có hỏi đáp, gợi ý sẵn giá trị mặc định
#   bash setup.sh --yes                 # không hỏi gì, lấy hết giá trị mặc định
#   bash setup.sh --workspace ~/KitGen --yes
#   bash setup.sh --dry-run             # chỉ IN ra việc sẽ làm, không sửa gì
#
# TƯƠNG THÍCH: macOS (bash 3.2 — KHÔNG dùng `wait -n`, `mapfile`, mảng kết hợp,
#              `${var^^}`, `[[ -v ]]`) và Linux (bash 4/5). Không cần sudo.
#
# BẢO MẬT — 4 điều script này TUYỆT ĐỐI KHÔNG làm:
#   1. Không đọc, không in, không copy nội dung `auth.json`, `config.toml`, `.env`,
#      không ghi API key / token / bearer vào bất kỳ file hay log nào.
#      Việc kiểm đăng nhập chỉ dùng `[ -f auth.json ]` (đúng như gen.sh dòng 13).
#   2. Không tự chạy `codex login`. OAuth cần trình duyệt + tương tác của chính bạn;
#      script chỉ IN ra lệnh để bạn tự chạy.
#   3. Không sửa `~/.codex/config.toml`. Home codex mặc định của bạn giữ nguyên
#      từng dòng. Nhánh ảnh (nếu cần) dùng home RIÊNG `~/.codex-img`.
#   4. Không `curl | bash`, không tải nhị phân từ URL lạ, không sudo, không cài
#      global gì ngoài `codex` CLI (và chỉ khi bạn đồng ý).
#
# Đầu ra của script (chỉ 4 chỗ, đều KHÔNG chứa thông tin nhạy cảm):
#   ~/.kitgen/config.json               workspace + port + origin allowlist
#   ~/.kitgen/agent.log                 log của agent local (đã qua redact của agent)
#   <workspace>/.kitgen/config.json     chỉ trường imageGen.{mode,codexHome} — là ĐƯỜNG DẪN
#   <workspace>/.venv/                  môi trường Python riêng (Pillow, numpy, …)
#   ~/.codex-img/config.toml            CHỈ khi nhánh fallback image-gen được bật
#
set -eu

SETUP_VERSION="1.0.0"
SCRIPT_PATH="$0"
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$PWD/$SCRIPT_PATH" ;;
esac
REPO_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

# ── Giá trị mặc định (mọi thứ đều đổi được bằng cờ dòng lệnh) ────────────────
DEFAULT_WORKSPACE="$HOME/KitGen"
DEFAULT_PORT=8765
DEFAULT_ORIGIN="http://127.0.0.1:8765"   # UI và API cùng origin trên máy user
IMG_HOME_DEFAULT="$HOME/.codex-img"
KITGEN_HOME="$HOME/.kitgen"
CONFIG_FILE="$KITGEN_HOME/config.json"
AGENT_LOG="$KITGEN_HOME/agent.log"
MIN_NODE_MAJOR=20
MIN_PY_MINOR=9              # cần >= 3.9

# ── Trạng thái ──────────────────────────────────────────────────────────────
WORKSPACE=""
PORT=""
ORIGINS=""                  # danh sách cách nhau bằng khoảng trắng
ASSUME_YES=0
DRY_RUN=0
DO_START=1
WITH_VITMATTE=0
INSTALL_APP=0
INSTALL_CODEX=0             # 1 = được phép `npm i -g` codex khi thiếu
IMAGEGEN_MODE="unknown"
IMAGEGEN_HOME_LABEL=""
KITGEN_HOME_OK=1
FAILED=0                    # số lỗi CHẶN (script sẽ thoát != 0)
WARNED=0                    # số cảnh báo (chạy được nhưng nên biết)
TMPDIR_SETUP=""

# ── In ấn ───────────────────────────────────────────────────────────────────
if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then
  C_B=$(printf '\033[1m'); C_R=$(printf '\033[31m'); C_G=$(printf '\033[32m')
  C_Y=$(printf '\033[33m'); C_C=$(printf '\033[36m'); C_D=$(printf '\033[2m'); C_0=$(printf '\033[0m')
else
  C_B=""; C_R=""; C_G=""; C_Y=""; C_C=""; C_D=""; C_0=""
fi

STEP_NO=0
STEP_TOTAL=10
step() {
  STEP_NO=$((STEP_NO + 1))
  printf '\n%s[%d/%d] %s%s\n' "$C_B" "$STEP_NO" "$STEP_TOTAL" "$1" "$C_0"
}
ok()   { printf '  %sOK  %s %s\n' "$C_G" "$C_0" "$1"; }
skip() { printf '  %s––  %s %s\n' "$C_D" "$C_0" "$1"; }          # idempotent: đã có sẵn
info() { printf '      %s\n' "$1"; }
warn() { WARNED=$((WARNED + 1)); printf '  %sCHÚ Ý%s %s\n' "$C_Y" "$C_0" "$1"; }
bad()  { FAILED=$((FAILED + 1)); printf '  %sLỖI%s  %s\n' "$C_R" "$C_0" "$1"; }
cmdline() { printf '\n      %s%s%s\n\n' "$C_C" "$1" "$C_0"; }     # lệnh để user copy

# "phải làm gì tiếp" — luôn đi kèm mỗi lỗi chặn
fixit() {
  printf '      %s→ phải làm:%s %s\n' "$C_B" "$C_0" "$1"
  shift
  while [ "$#" -gt 0 ]; do cmdline "$1"; shift; done
}

# ── Bọc mọi thao tác GHI để --dry-run thật sự không sửa gì ───────────────────
would() { printf '  %s(dry-run)%s %s\n' "$C_D" "$C_0" "$1"; }
run_w() {                     # run_w "<mô tả>" cmd args...
  local desc="$1"; shift
  if [ "$DRY_RUN" -eq 1 ]; then would "$desc"; return 0; fi
  "$@"
}

cleanup() {
  if [ -n "$TMPDIR_SETUP" ] && [ -d "$TMPDIR_SETUP" ]; then rm -rf "$TMPDIR_SETUP"; fi
}
trap cleanup EXIT INT TERM

usage() {
  cat <<'USAGE'
setup.sh — cài đặt kit-gen v2 (macOS / Linux, không cần sudo)

  bash setup.sh [tuỳ chọn]

TUỲ CHỌN
  --workspace <path>   Thư mục làm việc. Mặc định ~/KitGen (script sẽ hỏi nếu có TTY)
  --port <n>           Cổng agent. Mặc định 8765 (bận thì agent tự dò 8766, 8767…)
  --origin <url>       Thêm origin được phép gọi agent (lặp lại được).
                       Mặc định http://127.0.0.1:8765 (UI local cùng origin)
  --yes, -y            Không hỏi gì, dùng hết giá trị mặc định (dùng cho CI/script)
  --dry-run            Chỉ in ra việc SẼ làm. Không tạo, không cài, không chạy gì
  --with-vitmatte      Cài thêm torch + transformers (~2–3 GB) cho matte ViTMatte
  --install-app        Copy bundle web vào <workspace>/.kitgen/app (bản /app/ tự chứa)
  --install-codex      Cho phép `npm i -g @openai/codex` nếu chưa có codex CLI
  --no-start           Không khởi động agent ở bước cuối, chỉ in lệnh
  -h, --help           Bản trợ giúp này
  --version            In phiên bản của script này

VÍ DỤ
  bash setup.sh --dry-run
  bash setup.sh --workspace /tmp/kitgen-ws --yes --no-start
  bash setup.sh --origin http://localhost:5173 --yes   # chỉ khi chạy Vite dev
USAGE
}

# ── Đọc tham số ─────────────────────────────────────────────────────────────
while [ "$#" -gt 0 ]; do
  case "$1" in
    --workspace) shift; [ "$#" -gt 0 ] || { echo "--workspace cần một đường dẫn" >&2; exit 2; }; WORKSPACE="$1" ;;
    --workspace=*) WORKSPACE="${1#--workspace=}" ;;
    --port) shift; [ "$#" -gt 0 ] || { echo "--port cần một số" >&2; exit 2; }; PORT="$1" ;;
    --port=*) PORT="${1#--port=}" ;;
    --origin) shift; [ "$#" -gt 0 ] || { echo "--origin cần một URL" >&2; exit 2; }; ORIGINS="$ORIGINS $1" ;;
    --origin=*) ORIGINS="$ORIGINS ${1#--origin=}" ;;
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run|--dryrun) DRY_RUN=1 ;;
    --with-vitmatte) WITH_VITMATTE=1 ;;
    --install-app) INSTALL_APP=1 ;;
    --install-codex) INSTALL_CODEX=1 ;;
    --no-start) DO_START=0 ;;
    -h|--help) usage; exit 0 ;;
    --version) echo "setup.sh $SETUP_VERSION"; exit 0 ;;
    *) printf 'Tham số không hiểu: %s\n\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[ -n "$PORT" ] || PORT="$DEFAULT_PORT"
case "$PORT" in
  ''|*[!0-9]*) echo "--port phải là số nguyên, nhận được: $PORT" >&2; exit 2 ;;
esac
if [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  echo "--port phải trong khoảng 1024–65535 (agent không chạy quyền root), nhận được: $PORT" >&2
  exit 2
fi
[ -n "$ORIGINS" ] || ORIGINS="$DEFAULT_ORIGIN"
# bỏ khoảng trắng đầu
ORIGINS="$(printf '%s' "$ORIGINS" | sed 's/^[[:space:]]*//')"

# Không có TTY ⇒ không thể hỏi ⇒ tự động ở chế độ không tương tác
INTERACTIVE=1
if [ ! -t 0 ] || [ "$ASSUME_YES" -eq 1 ]; then INTERACTIVE=0; fi

# ask "<câu hỏi>" "<mặc định>" → in ra câu trả lời
ask() {
  local q="$1" def="$2" reply=""
  if [ "$INTERACTIVE" -eq 0 ]; then printf '%s' "$def"; return 0; fi
  # Câu hỏi ra stderr: stdout của hàm này bị $( ) hớt để lấy câu trả lời.
  printf '  %s%s%s [%s]: ' "$C_B" "$q" "$C_0" "$def" >&2
  IFS= read -r reply || reply=""
  [ -n "$reply" ] || reply="$def"
  printf '%s' "$reply"
}

# confirm "<câu hỏi>" "<Y|N mặc định>" → 0 nếu đồng ý
confirm() {
  local q="$1" def="$2" reply=""
  if [ "$INTERACTIVE" -eq 0 ]; then
    [ "$def" = "Y" ] && return 0 || return 1
  fi
  if [ "$def" = "Y" ]; then printf '  %s%s%s [Y/n]: ' "$C_B" "$q" "$C_0" >&2
  else printf '  %s%s%s [y/N]: ' "$C_B" "$q" "$C_0" >&2; fi
  IFS= read -r reply || reply=""
  [ -n "$reply" ] || reply="$def"
  case "$reply" in
    y|Y|yes|YES|c|C|co|Co|có|Có) return 0 ;;
    *) return 1 ;;
  esac
}

# expand_tilde "~/x" → "/home/u/x"  (đọc từ user nên phải tự bung, shell không bung cho)
expand_tilde() {
  case "$1" in
    "~") printf '%s' "$HOME" ;;
    "~/"*) printf '%s/%s' "$HOME" "${1#\~/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# run_limited <giây> <cmd...> — timeout thuần bash 3.2 (macOS KHÔNG có `timeout`,
# và KHÔNG có `wait -n`). Trả 124 nếu hết giờ.
run_limited() {
  local secs="$1"; shift
  "$@" & local pid=$!
  local i=0
  while [ "$i" -lt "$secs" ]; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -KILL "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    return 124
  fi
  local rc=0
  wait "$pid" 2>/dev/null || rc=$?
  return "$rc"
}

# ─────────────────────────────────────────────────────────────────────────────
printf '\n%s  kit-gen · cài đặt%s   (setup.sh %s)\n' "$C_B" "$C_0" "$SETUP_VERSION"
printf '  %s\n' "mã nguồn: $REPO_DIR"
if [ "$DRY_RUN" -eq 1 ]; then
  printf '  %sCHẾ ĐỘ DRY-RUN — không tạo, không cài, không chạy gì. Chỉ in ra việc sẽ làm.%s\n' "$C_Y" "$C_0"
fi
if [ "$INTERACTIVE" -eq 0 ]; then
  printf '  %schế độ không tương tác — lấy hết giá trị mặc định%s\n' "$C_D" "$C_0"
fi

# ═══ 1. Hệ điều hành & shell ══════════════════════════════════════════════════
step "Kiểm tra hệ điều hành"
OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
OS_ARCH="$(uname -m 2>/dev/null || echo unknown)"
case "$OS_NAME" in
  Darwin) OS_KIND="macos"; PKG_HINT="brew install" ;;
  Linux)  OS_KIND="linux"
          if command -v apt-get >/dev/null 2>&1; then PKG_HINT="sudo apt-get install -y"
          elif command -v dnf >/dev/null 2>&1; then PKG_HINT="sudo dnf install -y"
          elif command -v pacman >/dev/null 2>&1; then PKG_HINT="sudo pacman -S"
          else PKG_HINT="<trình quản lý gói của bạn> install"; fi ;;
  *)      OS_KIND="other"; PKG_HINT="<trình quản lý gói của bạn> install" ;;
esac
if [ "$OS_KIND" = "other" ]; then
  bad "kit-gen v2 chỉ hỗ trợ macOS và Linux (đang thấy: $OS_NAME)."
  fixit "Chạy trên macOS hoặc Linux. Windows dùng WSL2 (chưa được kiểm chứng)."
else
  ok "$OS_NAME $OS_ARCH · bash ${BASH_VERSION:-?}"
fi

# ═══ 2. Node.js + npm ════════════════════════════════════════════════════════
step "Node.js >= $MIN_NODE_MAJOR (agent local chạy bằng Node stdlib)"
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  NODE_V="$(node -v 2>/dev/null | tr -d 'v')"
  NODE_MAJOR="${NODE_V%%.*}"
  case "$NODE_MAJOR" in
    ''|*[!0-9]*) NODE_MAJOR=0 ;;
  esac
  if [ "$NODE_MAJOR" -ge "$MIN_NODE_MAJOR" ]; then
    ok "node v$NODE_V ($(command -v node))"
    NODE_OK=1
  else
    bad "node v$NODE_V quá cũ — agent cần >= $MIN_NODE_MAJOR."
    if [ "$OS_KIND" = "macos" ]; then
      fixit "Cập nhật Node rồi chạy lại script này." "brew install node" "# hoặc tải bản LTS ở https://nodejs.org"
    else
      fixit "Cập nhật Node rồi chạy lại script này." "# tải bản LTS ở https://nodejs.org (hoặc dùng nvm/fnm)"
    fi
  fi
else
  bad "chưa có node."
  if [ "$OS_KIND" = "macos" ]; then
    fixit "Cài Node LTS rồi chạy lại script này." "brew install node" "# hoặc tải ở https://nodejs.org"
  else
    fixit "Cài Node LTS rồi chạy lại script này." "$PKG_HINT nodejs npm" "# hoặc tải ở https://nodejs.org"
  fi
fi
if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm -v 2>/dev/null)"
else
  warn "chưa có npm — chỉ cần khi phải cài codex CLI ở bước 6."
  info "npm đi kèm Node; nếu thiếu thì cài lại Node."
fi

# ═══ 3. Python 3 + venv ══════════════════════════════════════════════════════
step "Python 3 (dùng để cắt ảnh: slice.py, skeleton.py)"
PY=""
PY_OK=0
if command -v python3 >/dev/null 2>&1; then
  PY="$(command -v python3)"
  PY_V="$("$PY" -c 'import sys;print("%d.%d.%d"%sys.version_info[:3])' 2>/dev/null || echo 0.0.0)"
  PY_MAJOR="${PY_V%%.*}"
  PY_REST="${PY_V#*.}"
  PY_MINOR="${PY_REST%%.*}"
  case "$PY_MAJOR" in ''|*[!0-9]*) PY_MAJOR=0 ;; esac
  case "$PY_MINOR" in ''|*[!0-9]*) PY_MINOR=0 ;; esac
  if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge "$MIN_PY_MINOR" ]; then
    ok "python $PY_V ($PY)"
    PY_OK=1
  else
    bad "python $PY_V quá cũ — cần >= 3.$MIN_PY_MINOR."
    fixit "Cài Python mới hơn rồi chạy lại." "$PKG_HINT python3"
  fi
else
  bad "chưa có python3 — không cắt được ảnh (slice.py)."
  if [ "$OS_KIND" = "macos" ]; then
    fixit "Cài Python 3 rồi chạy lại script này." "brew install python3" "# hoặc: xcode-select --install (bản Apple đi kèm Xcode CLT)"
  else
    fixit "Cài Python 3 rồi chạy lại script này." "$PKG_HINT python3 python3-venv python3-pip"
  fi
fi

VENV_OK=0
if [ "$PY_OK" -eq 1 ]; then
  if "$PY" -c 'import venv, ensurepip' >/dev/null 2>&1; then
    ok "module venv + ensurepip có sẵn"
    VENV_OK=1
  else
    bad "python3 thiếu module venv/ensurepip — không tạo được môi trường riêng."
    if [ "$OS_KIND" = "linux" ]; then
      fixit "Cài gói venv của distro rồi chạy lại." "$PKG_HINT python3-venv python3-pip"
    else
      fixit "Cài lại Python đầy đủ (bản từ python.org hoặc brew) rồi chạy lại." "brew install python3"
    fi
  fi
fi

# ═══ 4. Chọn thư mục làm việc (workspace) ═════════════════════════════════════
step "Thư mục làm việc (workspace)"
info "Đây là nơi chứa toàn bộ project, ảnh gốc và kit đã cắt của bạn."
info "Toàn bộ dữ liệu nằm trên máy bạn, không có gì gửi ra Internet."
if [ -z "$WORKSPACE" ]; then
  WORKSPACE="$(ask "Dùng thư mục nào?" "$DEFAULT_WORKSPACE")"
fi
WORKSPACE="$(expand_tilde "$WORKSPACE")"
case "$WORKSPACE" in
  /*) ;;
  *) WORKSPACE="$PWD/$WORKSPACE" ;;
esac
# Bỏ dấu / ở cuối cho nhãn gọn (giữ lại nếu là gốc "/")
while :; do
  case "$WORKSPACE" in
    /) break ;;
    */) WORKSPACE="${WORKSPACE%/}" ;;
    *) break ;;
  esac
done

# Chặn vài lựa chọn tự bắn vào chân
case "$WORKSPACE" in
  "$HOME") bad "không dùng thẳng thư mục home ($HOME) làm workspace."
           info "Script sẽ tạo projects/ và .kitgen/ bên trong — đổ thẳng vào home là bừa bộn"
           info "và rất dễ xoá lẫn dữ liệu của bạn."
           fixit "Chọn một thư mục con rồi chạy lại:" "bash setup.sh --workspace \"$HOME/KitGen\""
           exit 1 ;;
  /) bad "không dùng thư mục gốc / làm workspace."
     fixit "Chọn một thư mục con rồi chạy lại:" "bash setup.sh --workspace \"$HOME/KitGen\""
     exit 1 ;;
  "$REPO_DIR") warn "workspace trùng thư mục mã nguồn — dữ liệu của bạn sẽ trộn lẫn với repo."
               info "Vẫn chạy được, nhưng nên chọn thư mục riêng như $DEFAULT_WORKSPACE." ;;
esac

if [ -d "$WORKSPACE" ]; then
  skip "đã có $WORKSPACE"
else
  run_w "mkdir -p $WORKSPACE" mkdir -p "$WORKSPACE" 2>/dev/null || true
  if [ "$DRY_RUN" -eq 0 ]; then
    if [ -d "$WORKSPACE" ]; then ok "đã tạo $WORKSPACE"
    else
      bad "không tạo được $WORKSPACE"
      info "Thư mục cha không cho ghi, hoặc đường dẫn không hợp lệ."
      fixit "Chọn một chỗ chắc chắn ghi được rồi chạy lại:" \
            "bash setup.sh --workspace \"$HOME/KitGen\"" \
            "# kiểm quyền thư mục cha:  ls -ld \"$(dirname "$WORKSPACE")\""
      exit 1
    fi
  fi
fi

if [ "$DRY_RUN" -eq 0 ] && [ -d "$WORKSPACE" ]; then
  if [ -w "$WORKSPACE" ]; then ok "ghi được vào $WORKSPACE"
  else
    bad "không có quyền ghi vào $WORKSPACE"
    fixit "Sửa quyền, hoặc chọn thư mục khác, rồi chạy lại:" "chmod u+w \"$WORKSPACE\"" "bash setup.sh --workspace \"$HOME/KitGen\""
    exit 1
  fi
fi

# Cây thư mục agent cần — agent cũng tự tạo, script tạo trước để báo lỗi sớm
for d in ".kitgen" ".kitgen/engine" ".kitgen/cache" ".kitgen/uploads" ".kitgen/trash" "projects"; do
  if [ -d "$WORKSPACE/$d" ]; then
    skip "có $d/"
  elif [ "$DRY_RUN" -eq 1 ]; then
    would "mkdir -p $WORKSPACE/$d"
  elif mkdir -p "$WORKSPACE/$d" 2>/dev/null; then
    ok "tạo $d/"
  else
    bad "không tạo được $WORKSPACE/$d"
    fixit "Kiểm tra quyền ghi rồi chạy lại:" "ls -ld \"$WORKSPACE\""
    exit 1
  fi
done

# Dung lượng trống — ảnh sprite sheet 1536x1024 rất nặng
if [ "$DRY_RUN" -eq 0 ] && [ -d "$WORKSPACE" ]; then
  FREE_H="$(df -h "$WORKSPACE" 2>/dev/null | awk 'NR==2{print $4}')"
  [ -n "$FREE_H" ] && info "còn trống: $FREE_H (một bộ kit đầy đủ tốn ~200–600 MB)"
fi

# ═══ 5. Thư viện Python cho slice.py ══════════════════════════════════════════
# Danh sách này ĐỌC TRỰC TIẾP từ slice.py (không đoán):
#   · dòng 31  `from PIL import …`                       → BẮT BUỘC (import mức module)
#   · dòng 34–36 `numpy` + `pymatting` + `scipy` trong CÙNG một try/except
#        → cả BA phải có, thiếu một cái là HAS_PYMATTING=False và slice.py rơi về
#          đường lùi Vlahos (mép glow xấu hơn). Đây là "nên có", không chặn.
#   · dòng 42–43 `torch` + `transformers` (ViTMatte)      → TUỲ CHỌN, ~2–3 GB
#   · skeleton.py chỉ cần PIL; render-skeleton.mjs cần playwright (tuỳ chọn,
#     thiếu thì gen.sh tự rơi về skeleton.py — xem gen.sh dòng 18).
step "Thư viện Python (đọc từ slice.py, không đoán)"
VENV_DIR="$WORKSPACE/.venv"
VENV_PY="$VENV_DIR/bin/python"
PIP_OK=0

if [ "$PY_OK" -eq 0 ] || [ "$VENV_OK" -eq 0 ]; then
  warn "bỏ qua vì python3/venv chưa sẵn sàng (xem bước 3)."
elif [ "$DRY_RUN" -eq 1 ]; then
  would "tạo venv $VENV_DIR (nếu chưa có)"
  would "pip install pillow numpy scipy pymatting   (bắt buộc: pillow · nên có: numpy+scipy+pymatting)"
  [ "$WITH_VITMATTE" -eq 1 ] && would "pip install torch transformers   (--with-vitmatte, ~2-3 GB)"
  PIP_OK=1
else
  if [ -x "$VENV_PY" ]; then
    skip "đã có venv $VENV_DIR"
  else
    printf '      đang tạo môi trường Python riêng…\n'
    if "$PY" -m venv "$VENV_DIR" >/dev/null 2>&1; then ok "đã tạo $VENV_DIR"
    else
      bad "không tạo được venv ở $VENV_DIR"
      if [ "$OS_KIND" = "linux" ]; then
        fixit "Cài gói venv rồi chạy lại script." "$PKG_HINT python3-venv"
      else
        fixit "Kiểm tra quyền ghi vào workspace rồi chạy lại script."
      fi
    fi
  fi

  if [ -x "$VENV_PY" ]; then
    # Đã đủ lib thì KHÔNG gọi pip (chạy lần 2 nhanh + không cần mạng) — idempotent
    if "$VENV_PY" - <<'PYPROBE' >/dev/null 2>&1
import importlib.util as u, sys
sys.exit(0 if all(u.find_spec(m) for m in ("PIL", "numpy", "scipy", "pymatting")) else 1)
PYPROBE
    then
      skip "pillow + numpy + scipy + pymatting đã có (không gọi pip)"
      PIP_OK=1
    else
      printf '      đang cài pillow numpy scipy pymatting (tải từ PyPI, có thể mất vài phút)…\n'
      # pip xả rất nhiều dòng WARNING/Retry khi mạng kém → dồn vào log, chỉ in
      # phần cần thiết. User không cần đọc 20 dòng urllib3 để biết "mất mạng".
      if [ -d "$WORKSPACE/.kitgen" ] && [ -w "$WORKSPACE/.kitgen" ]; then
        PIP_LOG="$WORKSPACE/.kitgen/pip-install.log"
      else
        PIP_LOG="/dev/null"
      fi
      "$VENV_PY" -m pip install --quiet --upgrade pip >>"$PIP_LOG" 2>&1 || true
      if "$VENV_PY" -m pip install --quiet pillow numpy scipy pymatting >>"$PIP_LOG" 2>&1; then
        ok "đã cài pillow + numpy + scipy + pymatting"
        PIP_OK=1
      elif "$VENV_PY" -m pip install --quiet pillow >>"$PIP_LOG" 2>&1; then
        warn "chỉ cài được pillow — thiếu numpy/scipy/pymatting."
        info "Vẫn cắt được ảnh, nhưng slice.py rơi về đường lùi Vlahos: mép vùng phát sáng (glow) xấu hơn."
        fixit "Khi có mạng, chạy lại lệnh này:" "\"$VENV_PY\" -m pip install pillow numpy scipy pymatting"
        PIP_OK=1
      else
        bad "không cài được cả pillow — không cắt được ảnh."
        if grep -qi 'newconnectionerror\|failed to establish\|temporary failure\|nodename nor servname\|network is unreachable' "$PIP_LOG" 2>/dev/null; then
          info "nguyên nhân theo log: KHÔNG RA ĐƯỢC MẠNG tới PyPI (không phải lỗi của Python)."
        fi
        info "log đầy đủ: $PIP_LOG"
        fixit "Kiểm tra kết nối mạng / proxy rồi chạy lại:" "\"$VENV_PY\" -m pip install pillow numpy scipy pymatting"
      fi
    fi

    # Báo đúng cái gì có, cái gì không — không nói bừa
    if [ -x "$VENV_PY" ]; then
      DEP_REPORT="$("$VENV_PY" - <<'PYREP' 2>/dev/null || true
import importlib.util as u
have = lambda m: "co" if u.find_spec(m) else "khong"
print("pillow=%s numpy=%s scipy=%s pymatting=%s torch=%s transformers=%s" % (
    have("PIL"), have("numpy"), have("scipy"), have("pymatting"),
    have("torch"), have("transformers")))
PYREP
)"
      [ -n "$DEP_REPORT" ] && info "trạng thái: $DEP_REPORT"
    fi

    if [ "$WITH_VITMATTE" -eq 1 ] && [ -x "$VENV_PY" ]; then
      if "$VENV_PY" -c 'import torch, transformers' >/dev/null 2>&1; then
        skip "torch + transformers đã có"
      else
        printf '      đang cài torch + transformers (~2-3 GB, rất lâu)…\n'
        if "$VENV_PY" -m pip install --quiet torch transformers; then ok "đã cài torch + transformers (matte ViTMatte)"
        else
          warn "không cài được torch/transformers — slice.py vẫn chạy bằng closed-form PyMatting."
          info "Đây là tuỳ chọn, không chặn."
        fi
      fi
    elif [ "$WITH_VITMATTE" -eq 0 ]; then
      info "bỏ qua torch + transformers (tuỳ chọn ~2-3 GB). Muốn matte ViTMatte mượt nhất: thêm cờ --with-vitmatte"
    fi
  fi
fi

# playwright — chỉ để khung xương nét hơn; thiếu thì gen.sh tự dùng skeleton.py
if node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  ok "playwright có — khung xương render bằng bản HTML (nét hơn)"
else
  info "không có playwright (tuỳ chọn) — gen.sh tự dùng skeleton.py (PIL). Không cần làm gì."
fi

# ═══ 6. Bản engine trong workspace ═══════════════════════════════════════════
# Agent tìm engine theo thứ tự <workspace>/.kitgen/engine → <repo>. Copy vào
# workspace để workspace tự chứa, chạy được kể cả khi bạn di chuyển repo.
# CHỈ COPY, KHÔNG SỬA: gen.sh, slice.py, skeleton.*, silhouettes.js, element-lib.json.
step "Bản engine (gen.sh, slice.py, skeleton) trong workspace"
ENGINE_SRC="$REPO_DIR"
ENGINE_DST="$WORKSPACE/.kitgen/engine"
ENGINE_FILES="gen.sh slice.py skeleton.py skeleton.html silhouettes.js render-skeleton.mjs element-lib.json"
if [ ! -f "$ENGINE_SRC/gen.sh" ]; then
  warn "không thấy gen.sh trong $ENGINE_SRC — bỏ qua bước copy engine."
  info "Agent sẽ tự tìm engine trong thư mục mã nguồn khi chạy."
else
  ENGINE_COPIED=0
  ENGINE_SKIPPED=0
  for f in $ENGINE_FILES; do
    [ -f "$ENGINE_SRC/$f" ] || continue
    if [ -f "$ENGINE_DST/$f" ] && [ ! "$ENGINE_SRC/$f" -nt "$ENGINE_DST/$f" ]; then
      ENGINE_SKIPPED=$((ENGINE_SKIPPED + 1))
      continue
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      would "copy $f → .kitgen/engine/"
    else
      cp "$ENGINE_SRC/$f" "$ENGINE_DST/$f" && ENGINE_COPIED=$((ENGINE_COPIED + 1))
    fi
  done
  [ "$DRY_RUN" -eq 0 ] && [ -f "$ENGINE_DST/gen.sh" ] && chmod 755 "$ENGINE_DST/gen.sh"
  if [ "$DRY_RUN" -eq 1 ]; then :
  elif [ "$ENGINE_COPIED" -gt 0 ]; then ok "cập nhật $ENGINE_COPIED file engine (giữ $ENGINE_SKIPPED file đã mới)"
  else skip "engine đã mới nhất ($ENGINE_SKIPPED file)"
  fi
fi

if [ "$INSTALL_APP" -eq 1 ]; then
  APP_SRC=""
  if [ -f "$REPO_DIR/webapp/dist/index.html" ]; then APP_SRC="$REPO_DIR/webapp/dist"
  elif [ -f "$REPO_DIR/web/index.html" ]; then APP_SRC="$REPO_DIR/web"
  fi
  if [ -n "$APP_SRC" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      would "copy bundle React → $WORKSPACE/.kitgen/app/"
    else
      mkdir -p "$WORKSPACE/.kitgen/app"
      # -R để chạy được trên cả macOS và Linux (không dùng cờ GNU riêng)
      cp -R "$APP_SRC/." "$WORKSPACE/.kitgen/app/" && ok "đã copy bundle giao diện vào .kitgen/app/"
    fi
  else
    warn "--install-app nhưng chưa có bundle đã build — bỏ qua."
  fi
else
  info "bundle /app/ ưu tiên webapp/dist; bản GitHub Release đã đóng gói sẵn"
fi

# ═══ 7. codex CLI ════════════════════════════════════════════════════════════
step "codex CLI (dùng để sinh ảnh)"
CODEX_OK=0
if command -v codex >/dev/null 2>&1; then
  # `sed` tham lam sẽ nhả ra "0" từ "codex-cli 0.146.0" → dùng grep -o lấy cụm ĐẦU TIÊN
  CODEX_V="$(codex --version 2>/dev/null | head -n1 | grep -o '[0-9][0-9.]*' | head -n1 || true)"
  ok "codex ${CODEX_V:-(không đọc được phiên bản)} ($(command -v codex))"
  CODEX_OK=1
else
  if [ "$INSTALL_CODEX" -eq 1 ] && command -v npm >/dev/null 2>&1; then
    if [ "$DRY_RUN" -eq 1 ]; then
      would "npm i -g @openai/codex"
      CODEX_OK=1
    else
      printf '      đang cài codex CLI…\n'
      if npm i -g @openai/codex >/dev/null 2>&1 && command -v codex >/dev/null 2>&1; then
        ok "đã cài codex $(codex --version 2>/dev/null | head -n1)"
        CODEX_OK=1
      else
        bad "không cài được codex CLI bằng npm."
        fixit "Cài tay rồi chạy lại script (có thể cần sudo hoặc đổi prefix npm):" "npm i -g @openai/codex" "# xem thêm: https://developers.openai.com/codex"
      fi
    fi
  else
    bad "chưa có codex CLI — không sinh được ảnh (vẫn cắt được ảnh có sẵn)."
    fixit "Cài codex rồi chạy lại script này (hoặc thêm cờ --install-codex để script tự cài):" "npm i -g @openai/codex"
  fi
fi

# ═══ 8. Kiểm tra công cụ tạo ảnh (image_gen) ══════════════════════════════════
# Theo teams/t3-auth/PLAN.md §A.1 bước 5 + architecture §6.1:
#   `codex debug prompt-input` chỉ IN ĐẶC TẢ TOOL — KHÔNG sinh ảnh, KHÔNG tốn quota.
#   Script chỉ lấy SỐ ĐẾM `grep -c image_gen`, không giữ, không in nội dung output.
step "Công cụ tạo ảnh của codex (image_gen)"
IMAGEGEN_MODE="unknown"
IMAGEGEN_HOME_LABEL=""
IMAGEGEN_REASON=""

# count_image_gen <CODEX_HOME hoặc rỗng> → in ra số lần image_gen xuất hiện, hoặc -1 nếu lệnh lỗi
count_image_gen() {
  local home="$1" out="" rc=0
  # TMPDIR_SETUP phải được tạo ở thân script (không phải trong đây): hàm này luôn
  # được gọi trong $( ) ⇒ subshell ⇒ gán biến không về được cha ⇒ trap cleanup mù.
  out="$TMPDIR_SETUP/probe.txt"
  : > "$out"
  if [ -n "$home" ]; then
    run_limited 45 env CODEX_HOME="$home" codex debug prompt-input >"$out" 2>/dev/null || rc=$?
  else
    run_limited 45 codex debug prompt-input >"$out" 2>/dev/null || rc=$?
  fi
  local n
  n="$(grep -c 'image_gen' "$out" 2>/dev/null || true)"
  # Không giữ output — nó có thể chứa nội dung prompt/cấu hình
  rm -f "$out"
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  if [ "$rc" -ne 0 ] && [ "$n" -eq 0 ]; then echo "-1"; else echo "$n"; fi
}

if [ "$CODEX_OK" -eq 0 ]; then
  IMAGEGEN_MODE="unavailable"
  IMAGEGEN_REASON="NO_CODEX"
  warn "bỏ qua vì chưa có codex CLI."
elif [ "$DRY_RUN" -eq 1 ]; then
  would "codex debug prompt-input | grep -c image_gen   (home mặc định — chỉ đếm, không tốn quota)"
  would "nếu = 0: dựng home ảnh riêng $IMG_HOME_DEFAULT + config.toml tối giản, rồi IN hướng dẫn để BẠN tự chạy codex login"
  info "dry-run không chạy codex, nên chưa biết máy này có image_gen hay chưa."
else
  printf '      đang kiểm tra (chỉ đếm tên tool, không sinh ảnh, không tốn quota)…\n'
  TMPDIR_SETUP="$(mktemp -d "${TMPDIR:-/tmp}/kitgen-setup.XXXXXX")"
  N_DEFAULT="$(count_image_gen "")"
  if [ "$N_DEFAULT" -gt 0 ]; then
    # P1 của architecture §6.1 — đa số máy dừng ở đây, KHÔNG cần home thứ hai
    IMAGEGEN_MODE="default-home"
    IMAGEGEN_HOME_LABEL="~/.codex"
    ok "tạo ảnh dùng được ngay với cấu hình hiện tại (home mặc định ~/.codex)"
    info "KHÔNG cần tạo home thứ hai. Script không sửa gì trong ~/.codex."
  else
    if [ "$N_DEFAULT" -lt 0 ]; then
      # Phép dò THẤT BẠI ≠ "máy không có image_gen". Không kết luận, không dựng
      # home ảnh dựa trên dữ liệu rác — nói thật là chưa biết.
      IMAGEGEN_MODE="unknown"
      IMAGEGEN_REASON="PROBE_FAILED"
      warn "không chạy được \`codex debug prompt-input\` (lệnh lỗi, bị chặn, hoặc quá 45 giây)."
      info "Vì phép dò thất bại nên script KHÔNG kết luận gì và KHÔNG tạo home ảnh."
      info "Chạy tay lệnh này trong terminal của bạn, kỳ vọng ra số LỚN HƠN 0:"
      cmdline "codex debug prompt-input | grep -c image_gen"
      info "· Ra > 0  → xong, không cần làm gì thêm."
      info "· Ra 0    → chạy lại script này để nó dựng home ảnh dự phòng."
      info "· Báo lỗi → sửa codex trước (codex doctor), rồi chạy lại script."
    else
      warn "home mặc định ~/.codex chưa có công cụ tạo ảnh."
      info "Thường là vì codex đang trỏ tới một model provider tuỳ biến (key riêng):"
      info "provider tuỳ biến bị loại khỏi image_gen theo thiết kế của codex."

    # ── FALLBACK: Phương án A của teams/t3-auth/PLAN.md — CODEX_HOME riêng ──
    IMG_HOME="$IMG_HOME_DEFAULT"
    printf '\n      %sĐường dự phòng (Phương án A — teams/t3-auth/PLAN.md):%s\n' "$C_B" "$C_0"
    info "Tạo một home codex RIÊNG chỉ để sinh ảnh: $IMG_HOME"
    info "Home mặc định ~/.codex của bạn KHÔNG bị sửa một dòng nào."

    DO_FALLBACK=0
    if confirm "Tạo home ảnh riêng ở $IMG_HOME?" "Y"; then DO_FALLBACK=1; fi

    if [ "$DO_FALLBACK" -eq 0 ]; then
      IMAGEGEN_MODE="unavailable"
      IMAGEGEN_REASON="FEATURE_OFF"
      warn "bỏ qua nhánh dự phòng — bạn sẽ CẮT được ảnh nhưng chưa SINH được ảnh mới."
      fixit "Khi nào muốn bật, chạy lại:" "bash setup.sh --workspace \"$WORKSPACE\""
    else
      if [ -d "$IMG_HOME" ]; then skip "đã có thư mục $IMG_HOME"
      else mkdir -p "$IMG_HOME" && ok "đã tạo $IMG_HOME"; fi
      chmod 700 "$IMG_HOME" 2>/dev/null || true

      # config.toml TỐI GIẢN theo PLAN.md §A.1 bước 2:
      #  · KHÔNG khai model_providers.*    → dùng provider built-in `openai`
      #  · KHÔNG khai model_catalog_json   → lấy catalog thật từ backend (khai là điểm giòn)
      #  · KHÔNG chứa key/token nào cả
      IMG_CONF="$IMG_HOME/config.toml"
      if [ -f "$IMG_CONF" ]; then
        skip "đã có $IMG_CONF — giữ nguyên (không ghi đè cấu hình của bạn)"
      else
        {
          echo '# kit-gen · home codex RIÊNG chỉ dùng cho job sinh ảnh.'
          echo '# Do setup.sh tạo theo teams/t3-auth/PLAN.md Phương án A.'
          echo '# KHÔNG chứa API key / token. Đăng nhập nằm ở auth.json do `codex login` tự ghi.'
          echo '# Home mặc định ~/.codex KHÔNG bị script này sửa.'
          echo 'model_provider = "openai"'
          echo ''
          echo '# giữ credential ở file thay vì keychain, để việc tách home có tác dụng'
          echo 'cli_auth_credentials_store = "file"'
          echo ''
          echo '[features]'
          echo 'image_generation = true'
          echo ''
          echo '# tin cậy sẵn workspace để `codex exec` không hỏi lại giữa 28 job'
          echo "[projects.\"$WORKSPACE\"]"
          echo 'trust_level = "trusted"'
        } > "$IMG_CONF"
        chmod 600 "$IMG_CONF"
        ok "đã ghi $IMG_CONF (tối giản, không có secret)"
      fi

      # Đã đăng nhập chưa? CHỈ kiểm tra file có tồn tại — KHÔNG mở, KHÔNG đọc.
      if [ -f "$IMG_HOME/auth.json" ]; then
        ok "home ảnh đã có đăng nhập (chỉ kiểm tra file tồn tại, KHÔNG đọc nội dung)"
        N_IMG="$(count_image_gen "$IMG_HOME")"
        if [ "$N_IMG" -gt 0 ]; then
          IMAGEGEN_MODE="img-home"
          IMAGEGEN_HOME_LABEL="~/.codex-img"
          ok "công cụ tạo ảnh dùng được qua home ảnh riêng"
        else
          IMAGEGEN_MODE="unavailable"
          IMAGEGEN_REASON="FEATURE_OFF"
          warn "đã đăng nhập nhưng vẫn chưa thấy công cụ tạo ảnh."
          info "Theo teams/t3-auth/PLAN.md §A.4, kiểm theo đúng thứ tự này:"
          cmdline "CODEX_HOME=\"$IMG_HOME\" codex features list | grep image_generation"
          cmdline "CODEX_HOME=\"$IMG_HOME\" codex debug models"
          cmdline "CODEX_HOME=\"$IMG_HOME\" codex doctor"
          info "Gói ChatGPT Free KHÔNG có tính năng tạo ảnh — cần Plus/Pro/Business."
          info "Nếu nghi ngờ cache đăng nhập cũ:"
          cmdline "CODEX_HOME=\"$IMG_HOME\" codex logout && CODEX_HOME=\"$IMG_HOME\" codex login"
        fi
      else
        IMAGEGEN_MODE="needs-login"
        IMAGEGEN_HOME_LABEL="~/.codex-img"
        printf '\n      %sCÒN MỘT VIỆC BẠN PHẢI TỰ LÀM%s\n' "$C_Y" "$C_0"
        info "Đăng nhập cần mở trình duyệt, nên script KHÔNG tự chạy — bạn chạy lệnh này:"
        cmdline "CODEX_HOME=\"$IMG_HOME\" codex login"
        info "Đăng nhập bằng tài khoản ChatGPT có tạo ảnh (Plus/Pro/Business — Free không có)."
        info "Xong thì kiểm bằng lệnh sau, kỳ vọng ra một số LỚN HƠN 0:"
        cmdline "CODEX_HOME=\"$IMG_HOME\" codex debug prompt-input | grep -c image_gen"
        info "Rồi chạy lại script này để nó ghi nhận trạng thái:"
        cmdline "bash setup.sh --workspace \"$WORKSPACE\" --yes"
      fi
    fi
    fi
  fi
fi

# Ghi <workspace>/.kitgen/config.json — CHỈ mode + đường dẫn home. KHÔNG credential.
WS_CONF="$WORKSPACE/.kitgen/config.json"
write_ws_config() {
  local mode="$1" homelabel="$2"
  [ "$mode" = "needs-login" ] && mode="unavailable"     # chưa login thì agent phải coi là chưa dùng được
  "$PY" - "$WS_CONF" "$mode" "$homelabel" <<'PYWS'
import json, os, sys
path, mode, home = sys.argv[1], sys.argv[2], sys.argv[3]
cfg = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
if not isinstance(cfg, dict):
    cfg = {}
cfg.setdefault("workspaceVersion", 1)
cfg.setdefault("maxJobs", 4)
img = cfg.get("imageGen") if isinstance(cfg.get("imageGen"), dict) else {}
img["mode"] = mode
if home:
    img["codexHome"] = home            # ĐƯỜNG DẪN, không phải credential
elif "codexHome" in img:
    del img["codexHome"]
cfg["imageGen"] = img
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, path)
print("wrote", os.path.basename(path))
PYWS
}
if [ "$DRY_RUN" -eq 1 ]; then
  would "ghi $WS_CONF  {imageGen:{mode,codexHome}} — không có secret"
elif [ "$PY_OK" -eq 1 ] && [ -d "$WORKSPACE/.kitgen" ]; then
  if write_ws_config "$IMAGEGEN_MODE" "$IMAGEGEN_HOME_LABEL" >/dev/null 2>&1; then
    ok "đã ghi .kitgen/config.json (imageGen.mode=$IMAGEGEN_MODE)"
  else
    warn "không ghi được $WS_CONF — agent vẫn tự dò được, chỉ chậm hơn một nhịp."
  fi
fi

# ═══ 9. Ghi cấu hình ~/.kitgen/config.json ════════════════════════════════════
# CHỈ 3 nhóm giá trị, tất cả đều KHÔNG nhạy cảm: đường dẫn workspace, cổng,
# danh sách origin được phép gọi agent. Không có key, không có token, không có
# nội dung auth.json. File này để lần chạy sau (và các script khác) khỏi hỏi lại.
step "Cấu hình ~/.kitgen/config.json (không chứa thông tin nhạy cảm)"
if [ "$DRY_RUN" -eq 1 ]; then
  would "mkdir -p $KITGEN_HOME"
  would "ghi $CONFIG_FILE  {workspace, port, originAllowlist, imageGen.mode}"
  info "nội dung sẽ là: workspace=$WORKSPACE · port=$PORT · origins=$ORIGINS"
elif [ "$PY_OK" -eq 0 ]; then
  warn "bỏ qua vì chưa có python3 (script dùng python3 để ghi JSON đúng chuẩn)."
elif ! mkdir -p "$KITGEN_HOME" 2>/dev/null || [ ! -w "$KITGEN_HOME" ]; then
  # Không tạo được ~/.kitgen (quyền, MDM, home chỉ-đọc). KHÔNG chết ở đây: file
  # này chỉ để lần sau khỏi hỏi lại — agent nhận cấu hình qua tham số dòng lệnh.
  warn "không tạo/ghi được $KITGEN_HOME — bỏ qua việc lưu cấu hình."
  info "Không sao: agent vẫn chạy được, chỉ là lần sau bạn phải truyền lại tham số."
  info "Lệnh đầy đủ đã có ở phần cuối script — lưu lại là dùng được."
  KITGEN_HOME_OK=0
  AGENT_LOG=""
else
  chmod 700 "$KITGEN_HOME" 2>/dev/null || true
  CFG_RESULT="$("$PY" - "$CONFIG_FILE" "$WORKSPACE" "$PORT" "$IMAGEGEN_MODE" "$SETUP_VERSION" $ORIGINS <<'PYCFG' || echo FAIL
import json, os, sys, datetime
path, ws, port, mode, ver = sys.argv[1:6]
origins = [o for o in sys.argv[6:] if o]
cfg = {}
if os.path.exists(path):
    try:
        with open(path) as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
if not isinstance(cfg, dict):
    cfg = {}
existed = bool(cfg)
# Giữ các workspace đã biết từ lần chạy trước (web chọn giữa chúng bằng id đục)
known = cfg.get("knownWorkspaces")
known = [k for k in known if isinstance(k, str)] if isinstance(known, list) else []
if ws not in known:
    known.append(ws)
cfg.update({
    "configVersion": 1,
    "setupVersion": ver,
    "workspace": ws,
    "knownWorkspaces": known,
    "port": int(port),
    "originAllowlist": origins,
    "imageGen": {"mode": mode},
    "updatedAt": datetime.datetime.now().astimezone().replace(microsecond=0).isoformat(),
})
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, path)
os.chmod(path, 0o600)
print("UPDATED" if existed else "CREATED")
PYCFG
)"
  case "$CFG_RESULT" in
    CREATED) ok "đã tạo $CONFIG_FILE" ;;
    UPDATED) skip "đã có $CONFIG_FILE — cập nhật lại (giữ workspace cũ trong knownWorkspaces)" ;;
    *) bad "không ghi được $CONFIG_FILE"
       fixit "Kiểm tra quyền ghi của $KITGEN_HOME rồi chạy lại:" "ls -ld \"$KITGEN_HOME\"" ;;
  esac
  info "nội dung: workspace · port · originAllowlist · imageGen.mode — KHÔNG có key/token nào"
fi

# ═══ 10. Khởi động agent local + kiểm tra sức khoẻ ════════════════════════════
step "Khởi động công cụ local (agent)"

AGENT_ENTRY=""
for c in "$REPO_DIR/agent/server.mjs" "$WORKSPACE/.kitgen/agent/server.mjs"; do
  if [ -f "$c" ]; then AGENT_ENTRY="$c"; break; fi
done
if [ -z "$AGENT_ENTRY" ] && command -v kitgen-agent >/dev/null 2>&1; then
  AGENT_ENTRY="kitgen-agent"
fi

# Lệnh chạy agent (in ra để user dùng lại về sau). Đặt venv lên đầu PATH vì
# agent spawn `python3` trần (agent/lib/engine.mjs) — không có dòng này thì
# slice.py chạy bằng python3 hệ thống và KHÔNG thấy Pillow trong venv.
ORIGIN_ARGS=""
for o in $ORIGINS; do ORIGIN_ARGS="$ORIGIN_ARGS --origin $o"; done
if [ -x "$VENV_PY" ] || [ "$DRY_RUN" -eq 1 ]; then
  PATH_PREFIX="PATH=\"$WORKSPACE/.venv/bin:\$PATH\" "
else
  PATH_PREFIX=""
fi
if [ "$AGENT_ENTRY" = "kitgen-agent" ]; then
  START_CMD="${PATH_PREFIX}kitgen-agent --workspace \"$WORKSPACE\" --port $PORT$ORIGIN_ARGS"
else
  START_CMD="${PATH_PREFIX}node \"$AGENT_ENTRY\" --workspace \"$WORKSPACE\" --port $PORT$ORIGIN_ARGS"
fi

# health_probe <port> → 0 nếu agent trả 200 ở /health
FIRST_ORIGIN="$(printf '%s' "$ORIGINS" | awk '{print $1}')"
health_probe() {
  local port="$1" code=""
  if command -v curl >/dev/null 2>&1; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' -m 4 \
      -H 'X-KitGen-Client: 1' -H "Origin: $FIRST_ORIGIN" \
      "http://127.0.0.1:$port/health" 2>/dev/null || true)"
  else
    code="$(node -e '
      const [p,o]=process.argv.slice(1);
      fetch(`http://127.0.0.1:${p}/health`,{headers:{"X-KitGen-Client":"1","Origin":o}})
        .then(r=>console.log(r.status)).catch(()=>console.log("000"));
    ' "$port" "$FIRST_ORIGIN" 2>/dev/null || true)"
  fi
  [ "$code" = "200" ]
}

# Cổng thật agent đang dùng (agent dò lên 8765→8766→8767… khi bận)
find_live_port() {
  local p="$PORT" i=0
  while [ "$i" -lt 8 ]; do
    if health_probe "$p"; then echo "$p"; return 0; fi
    p=$((p + 1))
    i=$((i + 1))
  done
  echo ""
  return 1
}

LIVE_PORT=""
if [ -z "$AGENT_ENTRY" ]; then
  bad "không tìm thấy agent (agent/server.mjs)."
  fixit "Chạy script này từ trong thư mục mã nguồn kit-gen:" "cd <thư-mục-kit-gen> && bash setup.sh"
elif [ "$DRY_RUN" -eq 1 ]; then
  would "khởi động agent bằng lệnh dưới đây (log → $AGENT_LOG)"
  cmdline "$START_CMD"
  would "kiểm tra http://127.0.0.1:$PORT/health"
elif [ "$NODE_OK" -eq 0 ]; then
  warn "không khởi động được vì thiếu Node >= $MIN_NODE_MAJOR (xem bước 2)."
  info "Sau khi cài Node, chạy:"
  cmdline "$START_CMD"
else
  # IDEMPOTENT: agent đã chạy rồi thì KHÔNG dựng con thứ hai
  LIVE_PORT="$(find_live_port || true)"
  if [ -n "$LIVE_PORT" ]; then
    skip "agent đã chạy sẵn ở cổng $LIVE_PORT — không khởi động thêm"
  elif [ "$DO_START" -eq 0 ]; then
    info "--no-start: chưa khởi động. Chạy khi nào bạn muốn:"
    cmdline "$START_CMD"
  else
    if [ -z "$AGENT_LOG" ] || [ "$KITGEN_HOME_OK" -eq 0 ]; then
      AGENT_LOG="$WORKSPACE/.kitgen/agent.log"      # đường lùi khi ~/.kitgen không ghi được
    else
      mkdir -p "$KITGEN_HOME" 2>/dev/null || true
    fi
    printf '      đang khởi động (log ghi vào %s)…\n' "$AGENT_LOG"
    # nohup + & : agent sống tiếp sau khi script kết thúc. Không dùng `wait -n`.
    if [ "$AGENT_ENTRY" = "kitgen-agent" ]; then
      PATH="$WORKSPACE/.venv/bin:$PATH" nohup kitgen-agent --workspace "$WORKSPACE" --port "$PORT" $ORIGIN_ARGS \
        >>"$AGENT_LOG" 2>&1 &
    else
      PATH="$WORKSPACE/.venv/bin:$PATH" nohup node "$AGENT_ENTRY" --workspace "$WORKSPACE" --port "$PORT" $ORIGIN_ARGS \
        >>"$AGENT_LOG" 2>&1 &
    fi
    AGENT_PID=$!
    i=0
    while [ "$i" -lt 15 ]; do
      LIVE_PORT="$(find_live_port || true)"
      [ -n "$LIVE_PORT" ] && break
      kill -0 "$AGENT_PID" 2>/dev/null || break
      sleep 1
      i=$((i + 1))
    done
    if [ -n "$LIVE_PORT" ]; then
      ok "agent đang chạy ở cổng $LIVE_PORT (pid $AGENT_PID)"
    else
      if kill -0 "$AGENT_PID" 2>/dev/null; then
        bad "agent còn sống nhưng chưa trả lời /health sau 15 giây."
      else
        bad "agent khởi động rồi tắt ngay."
      fi
      info "Vài dòng cuối của log (đã qua bộ lọc redact của agent):"
      if [ -f "$AGENT_LOG" ]; then tail -n 8 "$AGENT_LOG" | sed 's/^/        /'; fi
      fixit "Chạy tay để xem lỗi đầy đủ:" "$START_CMD"
      info "Cổng bị chiếm thì đổi cổng:  bash setup.sh --port 8770 --workspace \"$WORKSPACE\""
    fi
  fi
fi

# ═══ Tổng kết + hai đường vào ═════════════════════════════════════════════════
SHOW_PORT="${LIVE_PORT:-$PORT}"
printf '\n%s────────────────────────────────────────────────────────────────%s\n' "$C_D" "$C_0"

if [ "$DRY_RUN" -eq 1 ]; then
  printf '\n%s  DRY-RUN xong — KHÔNG có gì bị thay đổi trên máy bạn.%s\n' "$C_Y" "$C_0"
  printf '  Chạy thật bằng:\n'
  cmdline "bash setup.sh --workspace \"$WORKSPACE\" --port $PORT"
  exit 0
fi

if [ "$FAILED" -gt 0 ]; then
  printf '\n%s  CÒN %d VIỆC PHẢI SỬA%s — xem các dòng LỖI ở trên, mỗi lỗi có kèm "phải làm".\n' "$C_R" "$FAILED" "$C_0"
  printf '  Sửa xong chạy lại chính lệnh này (script chạy lại được, không phá gì đã có):\n'
  cmdline "bash setup.sh --workspace \"$WORKSPACE\" --port $PORT"
  exit 1
fi

printf '\n%s  XONG — môi trường đã sẵn sàng.%s\n\n' "$C_G" "$C_0"
printf '  thư mục làm việc : %s\n' "$WORKSPACE"
printf '  cổng agent       : %s\n' "$SHOW_PORT"
printf '  origin cho phép  : %s\n' "$ORIGINS"
case "$IMAGEGEN_MODE" in
  default-home) printf '  tạo ảnh          : %sdùng được%s (home mặc định ~/.codex)\n' "$C_G" "$C_0" ;;
  img-home)     printf '  tạo ảnh          : %sdùng được%s (home riêng %s)\n' "$C_G" "$C_0" "$IMAGEGEN_HOME_LABEL" ;;
  needs-login)  printf '  tạo ảnh          : %sCÒN 1 BƯỚC%s — bạn phải tự chạy: CODEX_HOME="%s" codex login\n' "$C_Y" "$C_0" "$IMG_HOME_DEFAULT" ;;
  *)            printf '  tạo ảnh          : %schưa dùng được%s (%s) — vẫn CẮT được ảnh có sẵn\n' "$C_Y" "$C_0" "${IMAGEGEN_REASON:-chưa xác định}" ;;
esac

printf '\n%s  MỞ GIAO DIỆN — có HAI đường vào, cùng một bộ mã, cùng một API:%s\n\n' "$C_B" "$C_0"
printf '  1) Bản trên mạng (mặc định) — giao diện tự cập nhật, không phải cài lại gì:\n'
for o in $ORIGINS; do printf '       %s%s%s\n' "$C_C" "$o" "$C_0"; done
printf '\n  2) Bản chạy tại máy — dùng khi trình duyệt CHẶN đường 1 (Safari, chính sách công ty):\n'
printf '       %shttp://127.0.0.1:%s/app/%s\n' "$C_C" "$SHOW_PORT" "$C_0"
printf '     %sĐây không phải bản què: đủ tính năng y hệt, chỉ khác đường vào.%s\n' "$C_D" "$C_0"

printf '\n%s  KIỂM TRA SỨC KHOẺ (chạy được bất cứ lúc nào):%s\n' "$C_B" "$C_0"
cmdline "curl -sS -H 'X-KitGen-Client: 1' -H 'Origin: $FIRST_ORIGIN' http://127.0.0.1:$SHOW_PORT/health"
printf '      Kỳ vọng: JSON có "ok":true. Gọi mà KHÔNG có header Origin sẽ bị 403 — đó là cố ý.\n'
printf '\n      Chi tiết môi trường (chỉ trả enum/boolean, không có key/token):\n'
cmdline "curl -sS -H 'X-KitGen-Client: 1' -H 'Origin: $FIRST_ORIGIN' http://127.0.0.1:$SHOW_PORT/api/doctor"

if [ -n "$LIVE_PORT" ]; then
  [ -n "$AGENT_LOG" ] && printf '  Agent đang chạy nền, log ở %s\n' "$AGENT_LOG"
  printf '  Dừng agent:\n'
  cmdline "pkill -f 'agent/server.mjs --workspace $WORKSPACE'"
else
  printf '  Khởi động agent:\n'
  cmdline "$START_CMD"
fi

printf '  Chạy lại script này lúc nào cũng an toàn: nó chỉ báo "đã có" và không tạo agent thứ hai.\n'
printf '  Đọc thêm: README-USER.md (5 bước dùng thử) · DEPLOY.md (build và phát hành local runtime)\n'
if [ "$WARNED" -gt 0 ]; then
  printf '\n%s  Có %d cảnh báo ở trên — chạy được, nhưng nên đọc qua.%s\n' "$C_Y" "$WARNED" "$C_0"
fi
printf '\n'
exit 0
