import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Config test DOM của nhánh D (canvas shell) — mount THẬT bằng jsdom + @testing-library.
 *
 * Tách khỏi `vitest.config.ts` của R0 vì file đó dùng environment "node" và loại trừ
 * `*.dom.test.tsx`; sửa nó là đụng glob team khác (FE2-PLAN §0-N1). Cùng khuôn với config
 * của nhánh C (`features/docs/__tests__/vitest.dom.config.ts`) để hai bên chạy giống nhau.
 *
 * KHÔNG có `setupFiles`: một file setup dùng chung sẽ nằm ngoài glob D. Vá jsdom vì vậy
 * nằm ngay đầu `canvas-shell.dom.test.tsx`.
 *
 * ⚠️ NỢ HẠ TẦNG (không giấu): `jsdom` và `@testing-library` hiện là symlink tới
 * `/tmp/domtest/node_modules`, chưa có trong `package.json`. D1 KHÔNG tự sửa
 * package/lock (ngoài glob) — đã ghi `teams/react/NEEDS-fe2-d.md` N3.
 *
 * Chạy:
 *   npx vitest run --config src/features/canvas/__tests__/vitest.dom.config.ts
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
    include: ["src/features/canvas/__tests__/**/*.dom.test.tsx"],
  },
});
