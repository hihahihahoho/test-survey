import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Release suite: only tests whose fixtures are committed to the repository.
 *
 * The excluded files intentionally exercise live team data under `kit-gen/teams/`
 * and the developer's local `kit-gen/styles.json`; both locations are ignored to
 * avoid publishing project/customer data. They remain part of `npm test` locally
 * whenever those fixtures are available.
 */
export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  plugins: [react()] as never,
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/*.dom.test.tsx",
      "**/*.integration.test.ts",
      "**/features/design/__tests__/ops.test.ts",
      "**/features/design/__tests__/validate.test.ts",
      "**/features/design/library/__tests__/lib-source.test.ts",
      "**/features/docs/__tests__/brief-read.test.ts",
      "**/features/projects/__tests__/create-mode-brief.test.ts",
      "**/lib/types/__tests__/contract.test.ts",
    ],
    reporters: ["default"],
  },
});
