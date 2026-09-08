/**
 * CHUỖI LỆNH TERMINAL mà dialog Cài đặt hiện cho user copy.
 *
 * 07/09/2026 — file này là `features/setup/lib/commands.ts` cũ, dời sang đây cùng
 * ba mảnh mà Cài đặt còn dùng. Cùng lượt đó BỎ những lệnh chỉ wizard cài đặt mới
 * cần: `shasumCmd`/`sha256sumCmd`/`bashCmd` (đối chiếu chữ ký rồi chạy script tải
 * về — bước 1 của wizard, không còn bước nào) và re-export bốn lệnh dùng chung
 * (`RUN_CMD`, `RUN_CMD_REPO`, `ADD_WORKSPACE_CMD`, `updateCmd`) — ai cần thì import
 * thẳng `@/components/layout`, đúng chữ mà R1-P1 ghi ở `agent-commands`.
 *
 * BA LUẬT cho mọi chuỗi trong file này:
 *  1. KHÔNG chứa đường dẫn tuyệt đối (chỉ nhãn `~/…`) — arch §4.3-5 coi path chứa tên
 *     user là PII, và bộ dò secret của store sẽ chặn nếu chuỗi kiểu đó lọt vào localStorage.
 *  2. KHÔNG chứa secret và KHÔNG có lệnh nào in ra secret. Lệnh kiểm image_gen chỉ ĐẾM
 *     (`grep -c`) chứ không in nội dung cấu hình.
 *  3. KHÔNG có `curl … | bash` (user phải đọc được file trước khi chạy).
 */

/** Lệnh cài từng phụ thuộc — hiện ở dòng ✗ của doctor (§3.9 CODEX_MISSING/PY_DEPS_MISSING). */
export const INSTALL_CMD = {
  /* Đường npm đã bỏ 24/08/2026 — bản npm gen hỏng ngoài hiện trường. Chỉ còn installer
     chính thức của OpenAI; luật ③ của file này cấm `curl … | bash` nên đưa link, không
     đưa lệnh pipe (cùng kiểu với INSTALL_CMD.node). */
  codex: "# Cài Codex CLI: chạy lại bộ cài KitGen, hoặc installer chính thức tại https://chatgpt.com/codex",
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
