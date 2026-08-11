/**
 * installer-script.js — nội dung script `.sh` của S0 bước 1 + SHA256 THẬT.
 *
 * TRUNG THỰC (xem teams/design/NEEDS-setup-projects.md · N8):
 * web tĩnh không có server phát hành file, và tôi KHÔNG được bịa URL tải agent.
 * Vì vậy script được **sinh ngay trong trình duyệt** và tải bằng Blob; SHA256 được
 * **tính thật** bằng `crypto.subtle.digest` trên đúng bytes mà user tải về —
 * không phải hằng số chép tay. User `shasum -a 256` ra đúng con số UI hiện.
 *
 * Script chỉ làm 7 việc (khớp §3-S0 accordion "Script sẽ làm gì"):
 *   1 kiểm Node ≥ 20 · 2 kiểm python3 · 3 tạo thư mục làm việc ·
 *   4 tạo venv + cài Pillow/numpy · 5 kiểm codex CLI (chỉ existsSync auth.json) ·
 *   6 đếm image_gen (không sinh ảnh, không tốn quota) · 7 in lệnh chạy.
 * KHÔNG sudo · KHÔNG `curl | bash` · KHÔNG đọc/ghi thông tin đăng nhập ·
 * KHÔNG tự cài agent từ URL lạ (chỉ hướng dẫn nếu chưa có).
 */

export const SCRIPT_NAME = 'kit-gen-setup.sh';

/** 7 việc — hiện trong accordion, đúng thứ tự trong script. */
export const SEVEN_THINGS = Object.freeze([
  'Kiểm tra Node.js ≥ 20 đã có chưa (chỉ đọc phiên bản, không cài Node).',
  'Kiểm tra python3 (dùng để cắt ảnh).',
  'Tạo thư mục làm việc ~/KitGen và ~/KitGen/.kitgen nếu chưa có.',
  'Tạo môi trường Python riêng ~/KitGen/.venv rồi cài Pillow + numpy (tải từ PyPI).',
  'Kiểm tra codex CLI đã cài chưa và ĐÃ đăng nhập chưa — chỉ kiểm tra sự tồn tại của file, không mở, không đọc nội dung.',
  'Đếm xem codex có công cụ tạo ảnh hay không (lệnh này không sinh ảnh, không tốn quota).',
  'In ra lệnh để bạn chạy công cụ local. Script KHÔNG tự chạy nền, KHÔNG cài gì ngoài 2 thư viện Python ở việc 4.',
]);

const SCRIPT = `#!/usr/bin/env bash
# kit-gen · script chuẩn bị máy (an toàn để đọc trước khi chạy)
#
# Script này KHÔNG cần sudo, KHÔNG tải chương trình lạ, KHÔNG đọc thông tin đăng nhập
# của bạn. Nó chỉ kiểm tra môi trường, tạo thư mục làm việc và cài 2 thư viện Python
# (Pillow, numpy) để cắt ảnh. Đọc hết rồi hãy chạy:  bash ~/Downloads/${SCRIPT_NAME}
set -u

WORKSPACE="\${KITGEN_WORKSPACE:-$HOME/KitGen}"
ok()   { printf '  \\033[32mOK\\033[0m   %s\\n' "$1"; }
warn() { printf '  \\033[33m!!\\033[0m   %s\\n' "$1"; }
bad()  { printf '  \\033[31mFAIL\\033[0m %s\\n' "$1"; }
step() { printf '\\n\\033[1m%s\\033[0m\\n' "$1"; }

printf '\\n  kit-gen · chuẩn bị máy\\n  thư mục làm việc: %s\\n' "$WORKSPACE"
MISSING=0

step '1/7 · Node.js'
if command -v node >/dev/null 2>&1; then
  NODE_V="$(node -v | tr -d 'v')"
  NODE_MAJOR="\${NODE_V%%.*}"
  if [ "\${NODE_MAJOR:-0}" -ge 20 ]; then ok "node $NODE_V"
  else bad "node $NODE_V quá cũ — cần >= 20. Cài từ https://nodejs.org rồi chạy lại."; MISSING=1; fi
else
  bad 'chưa có node. Cài Node.js >= 20 từ https://nodejs.org rồi chạy lại.'; MISSING=1
fi

step '2/7 · Python 3'
if command -v python3 >/dev/null 2>&1; then ok "$(python3 --version 2>&1)"
else bad 'chưa có python3 — cần để cắt ảnh (Pillow).'; MISSING=1; fi

step "3/7 · Thư mục làm việc"
mkdir -p "$WORKSPACE/.kitgen" "$WORKSPACE/projects" && ok "đã có $WORKSPACE"
if [ -w "$WORKSPACE" ]; then ok 'ghi được'; else bad "không ghi được vào $WORKSPACE"; MISSING=1; fi

step '4/7 · Thư viện Python để cắt ảnh'
if command -v python3 >/dev/null 2>&1; then
  if [ ! -d "$WORKSPACE/.venv" ]; then python3 -m venv "$WORKSPACE/.venv" 2>/dev/null && ok 'đã tạo .venv' || warn 'không tạo được .venv (thiếu module venv?)'; fi
  if [ -x "$WORKSPACE/.venv/bin/pip" ]; then
    "$WORKSPACE/.venv/bin/pip" install --quiet --upgrade pip >/dev/null 2>&1
    if "$WORKSPACE/.venv/bin/pip" install --quiet pillow numpy; then ok 'pillow + numpy đã sẵn sàng'
    else warn 'chưa cài được pillow/numpy — kiểm tra mạng rồi chạy lại script'; fi
  else warn 'bỏ qua vì không có .venv'; fi
else warn 'bỏ qua vì chưa có python3'; fi

step '5/7 · codex CLI'
if command -v codex >/dev/null 2>&1; then
  ok "codex $(codex --version 2>/dev/null | head -n1)"
  CODEX_HOME_DIR="\${CODEX_HOME:-$HOME/.codex}"
  if [ -f "$CODEX_HOME_DIR/auth.json" ]; then ok 'đã đăng nhập (chỉ kiểm tra file có tồn tại, KHÔNG đọc nội dung)'
  else warn "chưa đăng nhập — chạy: codex login"; fi
else
  bad 'chưa có codex CLI — cài: npm i -g @openai/codex'; MISSING=1
fi

step '6/7 · Công cụ tạo ảnh của codex'
if command -v codex >/dev/null 2>&1; then
  N="$(codex debug prompt-input 2>/dev/null | grep -c image_gen || true)"
  if [ "\${N:-0}" -gt 0 ]; then ok 'tạo ảnh dùng được với cấu hình hiện tại'
  else
    warn 'cấu hình hiện tại chưa có công cụ tạo ảnh.'
    printf '       Cách dự phòng (làm tay, không bắt buộc):\\n'
    printf '         CODEX_HOME=$HOME/.codex-img codex login\\n'
    printf '         CODEX_HOME=$HOME/.codex-img codex debug prompt-input | grep -c image_gen\\n'
  fi
else warn 'bỏ qua vì chưa có codex'; fi

step '7/7 · Chạy công cụ local'
if command -v kitgen-agent >/dev/null 2>&1; then
  printf '  Chạy lệnh này rồi quay lại tab kit-gen:\\n\\n    kitgen-agent --workspace "%s"\\n\\n' "$WORKSPACE"
elif [ -f "./agent/server.mjs" ]; then
  printf '  Chạy lệnh này trong thư mục mã nguồn rồi quay lại tab kit-gen:\\n\\n    node agent/server.mjs --workspace "%s"\\n\\n' "$WORKSPACE"
else
  printf '  Chưa thấy công cụ local trên máy.\\n'
  printf '  Nếu bạn có mã nguồn kit-gen: cd vào thư mục đó rồi chạy\\n\\n    node agent/server.mjs --workspace "%s"\\n\\n' "$WORKSPACE"
  printf '  Script này CỐ Ý không tự tải chương trình từ Internet.\\n\\n'
fi

if [ "$MISSING" -eq 0 ]; then printf '\\033[32mMôi trường đã đủ để chạy.\\033[0m\\n\\n'
else printf '\\033[33mCòn thiếu vài thứ ở trên — sửa rồi chạy lại script này.\\033[0m\\n\\n'; fi
`;

/** Bytes chính xác của file sẽ tải về (nguồn của cả Blob và SHA256). */
export function scriptBytes() {
  return new TextEncoder().encode(SCRIPT);
}

export function scriptText() { return SCRIPT; }

/** SHA256 hex của đúng bytes trên. `crypto.subtle` cần secure context (https hoặc 127.0.0.1). */
export async function scriptSha256() {
  const bytes = scriptBytes();
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;      // không có secure context ⇒ nói thật là chưa tính được
  const buf = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tải file .sh. Trả về số byte đã tải (để UI nói đúng "N KB"). */
export function downloadScript(doc = document) {
  const bytes = scriptBytes();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/x-sh' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = SCRIPT_NAME;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return bytes.length;
}
