import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * DOM config riêng cho test bàn phím của FloatingToolbar (FE-1 · B2).
 * Tách khỏi `vitest.config.ts` (environment "node", loại `*.dom.test.tsx`) vì
 * `jsdom` + `@testing-library` hiện chỉ có qua symlink /tmp/domtest — món nợ hạ
 * tầng CHƯA đóng, không giấu (xem INTEGRATION.md).
 *
 * Chạy: npx vitest run --config src/components/common/__tests__/vitest.dom.config.ts
 */
const webappRoot = fileURLToPath(new URL("../../../../", import.meta.url));

export default defineConfig({
  plugins: [react()] as never,
  root: webappRoot,
  resolve: { alias: { "@": `${webappRoot}src` } },
  test: {
    environment: "jsdom",
    include: ["src/components/common/__tests__/**/*.dom.test.tsx"],
  },
});
