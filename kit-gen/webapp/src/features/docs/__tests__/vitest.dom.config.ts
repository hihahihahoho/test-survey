import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Config test DOM của nhánh C (file con) — mount THẬT bằng jsdom + @testing-library.
 *
 * Tách khỏi `vitest.config.ts` của R0 vì file đó dùng environment "node" và loại trừ
 * `*.dom.test.tsx`; sửa nó là đụng glob team khác (FE2-PLAN §0-N1).
 * `jsdom` + `@testing-library` hiện được cài ngoài repo và symlink vào `node_modules`
 * (nợ hạ tầng đã ghi trong EVIDENCE-FE1 / INTEGRATION.md) — C1 KHÔNG tự sửa
 * `package.json`, chỉ ghi lại lệnh chạy thật ở `fe2/C1-REPORT.md` §7.
 *
 * KHÔNG có `setupFiles`: glob C (FE2-PLAN §1) chỉ cấp `subfile*.test.*`,
 * `subfile*.dom.test.tsx` và chính file config này. Một file `setup-dom.ts` sẽ nằm
 * NGOÀI glob — đúng kiểu vi phạm mà B2 mắc ở FE-1. Vá jsdom vì vậy nằm ngay đầu
 * `subfile-tabs.dom.test.tsx`.
 *
 * Chạy:
 *   npx vitest run --config src/features/docs/__tests__/vitest.dom.config.ts
 */
const webappRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export default defineConfig({
  root: webappRoot,
  /* `as never`: repo có hai bản vite (app dùng rolldown, vitest dùng rollup) nên kiểu
     `Plugin` hai bên không gán được cho nhau — xung đột KIỂU, không phải lỗi cấu hình.
     Ghi chú lấy nguyên từ config của S1/S3, cùng nguyên nhân. */
  plugins: [react()] as never,
  resolve: { alias: { "@": `${webappRoot}src` } },
  test: {
    environment: "jsdom",
    include: ["src/features/docs/__tests__/**/*.dom.test.tsx"],
  },
});
