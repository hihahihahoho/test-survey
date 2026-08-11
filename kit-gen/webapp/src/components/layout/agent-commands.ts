/**
 * CHUỖI LỆNH TERMINAL hiện cho user copy (§2.5, §3-S0, §3.9).
 *
 * Gom một chỗ để không màn nào tự nghĩ ra lệnh khác giọng (bản vanilla từng
 * lệch: `web/js/app-shell/commands.js` phải sinh ra để vá).
 * KHÔNG chứa đường dẫn tuyệt đối, KHÔNG chứa secret — chỉ nhãn `~/…`.
 *
 * TEAM MÀN (S0 setup, S6 settings): import từ `@/components/layout`, đừng chép lại.
 * TODO(khi R0 chuyển các hằng này vào `src/lib`): đổi file này thành re-export.
 * Đã ghi ở teams/react/NEEDS-appshell.md.
 */

/** Chạy công cụ local khi đã cài toàn cục. */
export const RUN_CMD = "kitgen-agent";

/** Chạy từ bản mã nguồn (user clone repo, chưa cài toàn cục). */
export const RUN_CMD_REPO = "node agent/server.mjs --workspace ~/KitGen";

/** Thêm thư mục làm việc khác (chốt X1: web không nhận path, chỉ hiện lệnh). */
export const ADD_WORKSPACE_CMD = "kitgen-agent --workspace /đường/dẫn/của/bạn";

/** Ưu tiên chuỗi do agent tự khai ở `/health.updateCommand` (§6.2 #1). */
export function updateCmd(updateCommand?: string | null): string {
  const c = typeof updateCommand === "string" ? updateCommand.trim() : "";
  return c !== "" ? c : "npm i -g kitgen-agent";
}
