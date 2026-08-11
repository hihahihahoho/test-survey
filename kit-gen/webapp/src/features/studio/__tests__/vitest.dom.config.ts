import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../..", import.meta.url));
export default defineConfig({ root, plugins: [react()] as never, resolve: { alias: { "@": `${root}src` } }, test: { environment: "jsdom", setupFiles: ["src/features/design/__tests__/setup-dom.ts"], include: ["src/features/studio/__tests__/studio.dom.test.tsx"] } });
