import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";

/**
 * `/__preview` — trang showcase toàn bộ primitive của R0. KHÔNG nằm trong
 * sitemap §2.1; đây là công cụ cho người làm giao diện.
 *
 * Nạp LAZY có lý do đo được: `__preview.tsx` import gần như mọi component
 * trong repo, nên khi nó nằm trong bundle chính thì mọi người dùng thật đều
 * phải tải nó. Tách ra bằng `lazyRouteComponent` ⇒ ĐO THẬT bằng `npm run build`:
 * chunk chính 850.78 kB (gzip 260.58) → 611.89 kB (gzip 192.26), showcase nằm
 * riêng ở `__preview-*.js` 223.89 kB và chỉ tải khi ai đó mở /__preview.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/__preview",
  component: lazyRouteComponent(() => import("./__preview"), "PreviewPage"),
});
