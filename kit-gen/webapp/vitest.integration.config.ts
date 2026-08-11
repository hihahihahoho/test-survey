import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * CONFIG RIÊNG cho test tích hợp — chạy với AGENT SERVER THẬT.
 *
 * Vì sao không dùng cờ `--exclude` trên config chính: vitest **gộp** `--exclude` với
 * `exclude` trong config thay vì thay thế, nên `*.integration.test.ts` vẫn bị loại và
 * lệnh báo "No test files found". Một config riêng là cách thẳng thắn nhất.
 *
 * `npm test` (config chính) vẫn KHÔNG chạy nhóm này — xem chú thích ở `vitest.config.ts`.
 * Chạy nhóm này bằng: `npm run test:integration`.
 *
 * `fileParallelism: false` + timeout rộng: file này spawn tiến trình và bind một cổng
 * cố định, chạy song song sẽ giành cổng của nhau.
 */
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react()] as never,
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 40000,
    reporters: ["default"],
  },
});
