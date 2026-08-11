import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

/** Cổng agent local. Đổi được khi agent dò sang cổng khác (8765 bận → 8766…):
 *  `KITGEN_AGENT_PORT=8766 npm run dev`. Xem DEPLOY.md §7. */
const AGENT_PORT = Number(process.env.KITGEN_AGENT_PORT ?? 8765);
const AGENT = `http://127.0.0.1:${AGENT_PORT}`;

/** Đường mà app gọi sang agent. Dev server proxy nguyên si các tiền tố này.
 *  KHÔNG proxy "/" — nếu không thì chính trang React cũng bị đẩy sang agent. */
const AGENT_PATHS = ["/api", "/health", "/bridge.html"];

export default defineConfig({
  // base "./" là BẮT BUỘC: bundle phải chạy được ở cả hai đường vào
  //   (1) Cloudflare Pages   https://kitgen.pages.dev/
  //   (2) agent same-origin  http://127.0.0.1:8765/app/
  // Đường dẫn tuyệt đối "/assets/..." sẽ 404 ở (2) → trang trắng (INTEGRATION §0 B2).
  base: "./",
  plugins: [react()],
  /* Phiên bản giao diện cho tab S6 "Về". Đọc từ package.json chứ KHÔNG gõ tay,
     để con số hiện ra không bao giờ lệch với bản thật (INTEGRATION). */
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Deep link /p/:id/design nạp asset theo thư mục tài liệu. base:"./" + asset
    // phẳng trong assets/ đã đủ, nhưng agent PHẢI phục vụ /app/ với SPA fallback
    // trỏ về /app/index.html (không phải /index.html) — agent/routes/app.mjs đã làm.
    assetsDir: "assets",
  },
  server: {
    port: 5173,
    strictPort: false,
    /* Vì sao cần proxy khi dev:
       Dev server chạy ở http://localhost:5173, agent ở http://127.0.0.1:8765 — KHÁC origin.
       Gọi thẳng sẽ dính CORS + phải nhớ bật --origin http://localhost:5173 cho agent.
       Proxy làm request đi CÙNG origin với trang ⇒ lập trình viên không phải cấu hình gì,
       và quan trọng hơn: dev chạy ĐÚNG đường mà bản /app/ chạy thật (same-origin),
       nên lỗi kiểu CAO-01 lộ ra ngay khi dev chứ không đợi tới lúc build. */
    proxy: Object.fromEntries(
      AGENT_PATHS.map((p) => [
        p,
        {
          target: AGENT,
          /* BẮT BUỘC true. Agent kiểm Host phải là tên loopback ĐÚNG CỔNG của nó
             (chống DNS-rebinding). Để false thì Host giữ nguyên "localhost:5173" và
             agent trả 421 BAD_HOST — đã đo được bằng curl thật. true khiến proxy ghi
             Host: 127.0.0.1:<cổng agent>, khớp allowlist. */
          changeOrigin: true,
          configure: (proxy: { on: (e: string, fn: (...a: any[]) => void) => void }) => {
            proxy.on("proxyReq", (proxyReq: any) => {
              /* Agent bắt buộc có X-KitGen-Client: 1 (lớp ép preflight). Thêm ở đây để
                 dev không phải nhớ; production app tự gửi header này trong transport. */
              proxyReq.setHeader("x-kitgen-client", "1");
              /* Dev server là cầu Node — KHÔNG có Sec-Fetch-Site do trình duyệt đặt khi
                 tới agent. Đặt Origin loopback tường minh (đã nằm trong allowlist mặc định
                 của agent) để qua checkOrigin mà KHÔNG cần --allow-cli. */
              proxyReq.setHeader("origin", AGENT);
            });
            proxy.on("error", (err: Error) => {
              process.stderr.write(
                `\n[vite proxy] không nối được agent tại ${AGENT}: ${err.message}\n` +
                  `  → chạy: node agent/server.mjs --workspace ~/KitGen\n` +
                  `  → agent ở cổng khác? KITGEN_AGENT_PORT=<cổng> npm run dev\n\n`,
              );
            });
          },
        },
      ]),
    ),
  },
});
