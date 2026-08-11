import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Config test DOM riêng của S1 — MOUNT THẬT bằng jsdom + @testing-library/react.
 *
 * Vì sao tách khỏi `vitest.config.ts` của R0: file đó dùng environment "node" cho
 * tầng dữ liệu, và brief cấm tôi sửa file của team khác.
 *
 * jsdom và @testing-library nằm ở /tmp/domtest (cài ngoài repo) vì `package.json`
 * cũng thuộc R0 — xem NEEDS-s1-projects.md N9: đề nghị R0 thêm chúng vào
 * devDependencies để bộ test này chạy được trong CI.
 *
 * Chạy:
 *   NODE_PATH=/tmp/domtest/node_modules npx vitest run \
 *     --config src/features/projects/__tests__/vitest.dom.config.ts
 */
const webappRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export default defineConfig({
  root: webappRoot,
  /* `as never`: repo có HAI bản `vite` (bản của app dùng rolldown, bản lồng trong
     `vitest` dùng rollup) nên kiểu `Plugin` của hai bên không gán được cho nhau.
     Đây thuần tuý là xung đột KIỂU giữa hai bản vite, không phải lỗi cấu hình —
     plugin chạy đúng lúc test. Sẽ hết khi hai bản vite được gộp. */
  plugins: [react()] as never,
  resolve: {
    alias: {
      "@": `${webappRoot}src`,
      "@testing-library/react": "/tmp/domtest/node_modules/@testing-library/react",
      "@testing-library/dom": "/tmp/domtest/node_modules/@testing-library/dom",
      // BẮT BUỘC: react/react-dom phải là MỘT bản duy nhất trong cả cây. Hai bản
      // (repo + /tmp) sẽ làm render ném "A React Element from an older version"
      // hoặc "Cannot read properties of null (reading 'useEffect')".
      // Cả hai đều là 18.3.1 — cùng phiên bản với repo, chỉ khác chỗ nằm.
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/features/projects/__tests__/setup.ts"],
    environmentOptions: {},
    globals: false,
    include: ["src/features/projects/__tests__/**/*.dom.test.tsx"],
  },
});
