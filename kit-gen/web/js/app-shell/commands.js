/**
 * commands.js — CHUỖI LỆNH TERMINAL hiện cho user copy (§2.5, §3-S0, §3.9).
 * Gom một chỗ để không màn nào tự nghĩ ra lệnh khác (bài học U5: copy lệch giọng).
 * Không chứa đường dẫn tuyệt đối, không chứa secret (chỉ nhãn `~/…`).
 */

/** Lệnh chạy công cụ local khi đã cài toàn cục. */
export const RUN_CMD = 'kitgen-agent';

/** Lệnh chạy từ bản mã nguồn (khi user clone repo, chưa cài toàn cục). */
export const RUN_CMD_REPO = 'node agent/server.mjs --workspace ~/KitGen';

/** Lệnh cập nhật — ưu tiên chuỗi do agent tự khai ở /health.updateCommand (§6.2 #1). */
export function updateCmd(health) {
  const c = health?.updateCommand;
  return typeof c === 'string' && c.trim() !== '' ? c.trim() : 'npm i -g kitgen-agent';
}

/** Thêm một thư mục làm việc khác (chốt X1: web không nhận path, chỉ hiện lệnh). */
export const ADD_WORKSPACE_CMD = 'kitgen-agent --workspace /đường/dẫn/của/bạn';

/** Kiểm tra chữ ký script cài (§3-S0 bước 1 — KHÔNG dùng curl | bash). */
export function shasumCmd(fileName) {
  return `shasum -a 256 ~/Downloads/${fileName}`;
}
export function bashCmd(fileName) {
  return `bash ~/Downloads/${fileName}`;
}

/** Lệnh cài từng phụ thuộc — hiện ở dòng ✗ của doctor (§3.9 CODEX_MISSING/PY_DEPS_MISSING). */
export const INSTALL_CMD = Object.freeze({
  codex: 'npm i -g @openai/codex',
  python: 'python3 -m venv ~/KitGen/.venv && ~/KitGen/.venv/bin/pip install pillow numpy',
  pillow: '~/KitGen/.venv/bin/pip install pillow numpy',
  playwright: 'npm i -g playwright && npx playwright install chromium',
});

/** §3-S0 bước 4: home riêng cho tạo ảnh — HƯỚNG DẪN, tuyệt đối KHÔNG tự động hoá. */
export const IMG_HOME_LOGIN_CMD = 'CODEX_HOME=~/.codex-img codex login';
export const IMG_HOME_CHECK_CMD = 'CODEX_HOME=~/.codex-img codex debug prompt-input | grep -c image_gen';
