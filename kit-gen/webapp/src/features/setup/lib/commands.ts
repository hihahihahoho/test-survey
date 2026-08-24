/**
 * features/setup/lib/commands.ts — CHUỖI LỆNH TERMINAL mà màn S0 hiện cho user copy.
 *
 * BỐN LỆNH DÙNG CHUNG (`RUN_CMD`, `RUN_CMD_REPO`, `ADD_WORKSPACE_CMD`, `updateCmd`)
 * được RE-EXPORT từ `@/components/layout/agent-commands` — R1-P1 sở hữu chúng và ghi rõ
 * trong file đó: *"TEAM MÀN (S0 setup, S6 settings): import từ `@/components/layout`,
 * đừng chép lại."* Chép lại là cách chắc chắn để hai màn nói hai giọng khác nhau (đúng
 * lỗi mà bản vanilla đã phải vá).
 *
 * Phần còn lại của file là những lệnh CHỈ S0 dùng (đối chiếu chữ ký script, cài phụ
 * thuộc, home riêng cho tạo ảnh) — chưa có ở tầng chung nên khai ở đây.
 *
 * BA LUẬT cho mọi chuỗi trong file này:
 *  1. KHÔNG chứa đường dẫn tuyệt đối (chỉ nhãn `~/…`) — arch §4.3-5 coi path chứa tên
 *     user là PII, và bộ dò secret của store sẽ chặn nếu chuỗi kiểu đó lọt vào localStorage.
 *  2. KHÔNG chứa secret và KHÔNG có lệnh nào in ra secret. Lệnh kiểm image_gen chỉ ĐẾM
 *     (`grep -c`) chứ không in nội dung cấu hình.
 *  3. KHÔNG có `curl … | bash` (§3-S0: user phải đọc được file trước khi chạy).
 */
export { RUN_CMD, RUN_CMD_REPO, ADD_WORKSPACE_CMD, updateCmd } from "@/components/layout";

/** §3-S0 bước 1 — đối chiếu chữ ký TRƯỚC khi chạy. */
export function shasumCmd(fileName: string): string {
  return `shasum -a 256 ~/Downloads/${fileName}`;
}

/** Linux không có `shasum` mặc định — nêu cả hai để không bỏ rơi ai. */
export function sha256sumCmd(fileName: string): string {
  return `sha256sum ~/Downloads/${fileName}`;
}

export function bashCmd(fileName: string): string {
  return `bash ~/Downloads/${fileName}`;
}

/** Lệnh cài từng phụ thuộc — hiện ở dòng ✗ của doctor (§3.9 CODEX_MISSING/PY_DEPS_MISSING). */
export const INSTALL_CMD = {
  codex: "npm i -g @openai/codex",
  python: "python3 -m venv ~/KitGen/.venv && ~/KitGen/.venv/bin/pip install pillow numpy",
  pyDeps: "~/KitGen/.venv/bin/pip install pillow numpy",
  resvg: 'npm install --prefix "$HOME/.kitgen/tools" @resvg/resvg-wasm',
  node: "# Cài Node.js ≥ 20 từ https://nodejs.org rồi mở lại Terminal",
} as const;

/**
 * §3-S0 bước 4 — đăng nhập Codex (hồ sơ mặc định ~/.codex; hồ sơ ảnh riêng đã bỏ 24/08/2026).
 *
 * CHỈ HƯỚNG DẪN, TUYỆT ĐỐI KHÔNG TỰ ĐỘNG HOÁ: `codex login` mở luồng đăng nhập OAuth,
 * đó là việc của người dùng trên máy họ. Web không chạy lệnh, không nhận kết quả đăng
 * nhập, không hiện và không lưu bất cứ thứ gì của phiên đăng nhập.
 *
 * Lệnh thứ hai chỉ ĐẾM số lần chuỗi `image_gen`/`imagegen` xuất hiện — không sinh ảnh, không tốn quota.
 * (Codex ≥0.147 đổi tên tool `image_gen` thành skill `imagegen` — khớp cả hai dạng.)
 */
export const CODEX_LOGIN_CMD = "codex login";
export const IMAGEGEN_CHECK_CMD = 'codex debug prompt-input | grep -cE "image_?gen"';

/**
 * TÊN LỆNH `codex` CHO CÂU LỆNH ĐEM ĐI DÁN — không phải lúc nào cũng là chữ `codex`.
 *
 * ╔══ SỰ CỐ CÓ THẬT ══════════════════════════════════════════════════════════╗
 * ║ Khách cài bằng standalone installer ⇒ binary ở `~/.local/bin/codex`, thư   ║
 * ║ mục KHÔNG nằm trong PATH mặc định của macOS. Agent (chạy từ phiên shell mà ║
 * ║ installer vừa export PATH) thấy ⇒ UI báo "đã cài ✓". Khách mở Terminal mới ║
 * ║ dán `codex login` ⇒ **command not found**, và phải gọi người lên máy.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Nên tên lệnh phải bám `shellOk` — thứ đo ĐÚNG cái Terminal của khách:
 *  · `true`  → chữ `codex` trần. Ngắn, và bền: `binLabel` có thể là shim theo phiên
 *              (fnm/nvm dựng `~/.local/state/fnm_multishells/<pid>_<ts>/bin/codex`,
 *              chết ngay khi phiên đó đóng) — dán đường đó ra còn tệ hơn.
 *  · `false` → đường đầy đủ, vì chữ `codex` chắc chắn hỏng trong tay họ.
 *  · `null`  → không dò được ⇒ giữ nguyên như cũ, không đoán.
 */
export interface CodexWhere {
  binLabel?: string | null;
  shellOk?: boolean | null;
}

export function codexCmdName(codex: CodexWhere | null | undefined): string {
  return codex?.shellOk === false && codex.binLabel ? codex.binLabel : "codex";
}

export function codexLoginCmd(codex: CodexWhere | null | undefined): string {
  return `${codexCmdName(codex)} login`;
}

export function imagegenCheckCmd(codex: CodexWhere | null | undefined): string {
  return `${codexCmdName(codex)} debug prompt-input | grep -cE "image_?gen"`;
}

/** Dòng khách phải thêm vào file rc để Terminal thấy `codex` từ lần sau. */
export function codexPathFixCmd(dirLabel: string): string {
  return `export PATH="${dirLabel}:$PATH"`;
}
