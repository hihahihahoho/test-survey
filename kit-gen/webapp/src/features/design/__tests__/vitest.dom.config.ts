import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Config test DOM của S3 — mount THẬT bằng jsdom + @testing-library.
 * Tách khỏi `vitest.config.ts` của R0 (environment "node", chỉ nhận `src/lib/**`).
 *
 * Chạy: npx vitest run --config src/features/design/__tests__/vitest.dom.config.ts
 */
const webappRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export default defineConfig({
  /* `as never`: repo có hai bản vite (app dùng rolldown, vitest dùng rollup) nên kiểu
     `Plugin` hai bên không gán được cho nhau — xung đột KIỂU, không phải lỗi cấu hình.
     Ghi chú này lấy từ config của S1, cùng nguyên nhân. */
  plugins: [react()] as never,
  root: webappRoot,
  resolve: { alias: { "@": `${webappRoot}src` } },
  test: {
    environment: "jsdom",
    setupFiles: ["src/features/design/__tests__/setup-dom.ts"],
    include: ["src/features/design/__tests__/**/*.dom.test.tsx"],
  },
});
