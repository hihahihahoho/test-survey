import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Test DOM của R2-P3: MOUNT THẬT drawer thư viện + preview khung xương bằng jsdom.
 *
 * Phụ thuộc (`jsdom`, `@testing-library/react@14`) nằm ở /tmp/domtest vì
 * `package.json` thuộc R0 — S1 đã dựng sẵn bằng
 * `src/features/projects/__tests__/setup-dom-deps.sh`. Chạy script đó một lần
 * nếu máy chưa có (xem NEEDS-r2p3.md N5).
 *
 * Chạy:
 *   cd webapp && npx vitest run --config src/features/design/library/__tests__/vitest.dom.config.ts
 */
const webappRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

export default defineConfig({
  /* `as never`: repo có HAI bản vite (bản app dùng rolldown, bản trong vitest dùng
     rollup) nên kiểu Plugin của hai bên không gán được cho nhau. Thuần tuý xung đột
     KIỂU giữa hai bản vite — plugin chạy đúng lúc test. (S1 đã gặp và ghi lại y hệt.) */
  plugins: [react()] as never,
  root: webappRoot,
  resolve: {
    alias: {
      "@": `${webappRoot}src`,
      "@testing-library/react": "/tmp/domtest/node_modules/@testing-library/react",
      "@testing-library/dom": "/tmp/domtest/node_modules/@testing-library/dom",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/features/design/library/__tests__/setup.ts"],
    globals: false,
    include: ["src/features/design/**/__tests__/**/*.dom.test.tsx"],
  },
});
