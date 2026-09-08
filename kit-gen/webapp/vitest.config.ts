import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * CONFIG TEST DUY NHẤT cho tầng logic (environment "node").
 *
 * ╔══ VÌ SAO ĐỔI (INTEGRATION) ═══════════════════════════════════════════════╗
 * ║ Bản cũ chỉ `include: ["src/lib/**\/__tests__/**\/*.test.ts"]`, nên test của ║
 * ║ 6 team màn KHÔNG chạy khi `npm test` — không có gì bảo vệ chúng trong CI.  ║
 * ║ BỐN engineer độc lập cùng báo đúng chỗ này và mỗi người phải tự mang một   ║
 * ║ config riêng: NEEDS-appshell N1 · NEEDS-s0-setup N4 · NEEDS-s1-projects N9 ║
 * ║ · NEEDS-safety-runs N3 · NEEDS-r2p1-design N5 · NEEDS-r2p3 N5.            ║
 * ║ Đây là đề nghị được lặp lại nhiều nhất trong toàn bộ NEEDS ⇒ nhận.         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * PHẠM VI: MỌI test của `src/**`. Không còn bộ nào chạy ngoài file này.
 *
 * ══ 08/09/2026 — MỘT CONFIG, KHÔNG CÒN QUY ƯỚC `*.dom.test.tsx` ═══════════════
 * `jsdom` + `@testing-library/react` nay nằm trong `devDependencies` THẬT (món nợ
 * hạ tầng của INTEGRATION.md đã đóng), nên test cần DOM không phải đi config riêng
 * nữa: nó khai `// @vitest-environment jsdom` ở DÒNG ĐẦU file và chạy cùng bộ này.
 * 19 file test đang làm đúng vậy.
 *
 * Cùng lúc đó, `exclude: ["**\/*.dom.test.tsx"]` bị GỠ. Mẫu ấy là một cái bẫy: bốn
 * file mang tên đó bị loại ở MỌI config nên không script nào chạy chúng, và chúng
 * mục dần cho tới khi 19/66 ca đỏ mà không ai biết (đã xoá cả bốn ở Đợt 3). Không
 * có mẫu loại trừ theo TÊN thì không có chỗ nào để một test lặng lẽ chết như thế.
 *
 * Cần `@vitejs/plugin-react` vì có test render bằng `renderToString` trong .tsx.
 */
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react()] as never,
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.tsx"],
    /* Đợt 2 đã xoá nhóm `*.integration.test.ts` (spawn agent server thật) cùng config
       riêng của nó; mẫu vẫn giữ ở đây để một file mới kiểu đó không lọt vào `npm test`
       mà không ai để ý — nó cần một agent đang chạy, không chạy được ở đây. */
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    reporters: ["default"],
  },
});
