import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Config test DOM của nhánh C — task C2 (`features/gen/**`).
 *
 * Cùng khuôn với `features/canvas/__tests__/vitest.dom.config.ts` (C1) và
 * `features/docs/__tests__/…` (nhánh C của FE-2) để ba bên chạy giống nhau. Tách khỏi
 * `vitest.config.ts` của R0 vì file đó dùng environment "node" và loại trừ `*.dom.test.tsx`;
 * sửa nó là đụng glob team khác.
 *
 * ⚠️ NỢ HẠ TẦNG, KHÔNG GIẤU: `jsdom` và `@testing-library` vẫn là **symlink tới
 * `/tmp/domtest/node_modules`** và **chưa có trong `package.json`** (EVIDENCE-FE2 §7-#8,
 * C1-REPORT §3.2). Hệ quả: bộ này **KHÔNG chạy trong `npm run verify`** và **không chạy
 * được trên máy sạch/CI**. Tôi KHÔNG sửa `package.json`/lockfile (ngoài glob) —
 * `NEEDS-fe3-c.md` N7 (nay là lần thứ ba xin).
 *
 * Chạy:
 *   npx vitest run --config src/features/gen/__tests__/vitest.dom.config.ts
 */
const webappRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export default defineConfig({
  root: webappRoot,
  /* `as never`: repo có hai bản vite (app dùng rolldown, vitest dùng rollup) nên kiểu
     `Plugin` hai bên không gán được cho nhau — xung đột KIỂU, không phải lỗi cấu hình. */
  plugins: [react()] as never,
  resolve: { alias: { "@": `${webappRoot}src` } },
  test: {
    environment: "jsdom",
    include: ["src/features/gen/__tests__/**/*.dom.test.tsx"],
  },
});
