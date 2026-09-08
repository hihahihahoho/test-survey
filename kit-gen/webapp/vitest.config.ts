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
 * PHẠM VI: mọi test THUẦN LOGIC của `src/**`, trừ test cần DOM (`*.dom.test.tsx`).
 * Test DOM vẫn phải chạy bằng config riêng vì `jsdom` + `@testing-library` hiện
 * KHÔNG có trong `devDependencies` (cài ở /tmp và symlink) — xem INTEGRATION.md,
 * đây là món nợ hạ tầng CHƯA đóng, không giấu.
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
       mà không ai để ý. Test DOM vẫn cần config riêng — xem khối PHẠM VI bên trên. */
    exclude: ["**/node_modules/**", "**/*.dom.test.tsx", "**/*.integration.test.ts"],
    reporters: ["default"],
  },
});
