import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Release suite: only tests whose fixtures are committed to the repository.
 *
 * The excluded file intentionally exercises the developer's local
 * `kit-gen/styles.json`, which is ignored to avoid publishing project/customer
 * data. It remains part of `npm test` locally whenever that fixture is available.
 *
 * Đợt 2 xoá 5 mục khác khỏi danh sách này vì chính các file test đó đã bị xoá cùng
 * `features/design`, `features/docs` và wizard tạo dự án theo brief. Đợt 3 xoá mẫu
 * `*.dom.test.tsx`: không còn file nào mang tên đó, và giữ một mẫu loại trừ theo tên
 * là giữ đúng cái bẫy đã làm bốn bộ test mục ruỗng — xem `vitest.config.ts`.
 */
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react()] as never,
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/*.integration.test.ts",
      "**/lib/types/__tests__/contract.test.ts",
    ],
    reporters: ["default"],
  },
});
