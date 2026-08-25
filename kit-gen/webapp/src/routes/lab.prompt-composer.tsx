import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";

/**
 * `/lab/prompt-composer` — DEMO "Prompt Composer" (mad-lib kiểu ChatGPT).
 *
 * ┌── VÌ SAO ROUTE NÀY KHÔNG PHÁ LUẬT "8 MÀN CỦA §2.1" ──────────────────────┐
 * │ Nó không phải một màn của sản phẩm. Cùng hạng với `/__preview`: một trang │
 * │ công cụ cho người làm, KHÔNG có link nào trong UI chính trỏ tới, chỉ vào  │
 * │ được bằng URL gõ tay. Sitemap vẫn đúng 8 màn + 2 route phụ.               │
 * │ Tiền lệ đi theo `__preview.route.tsx` từng dòng, kể cả cách nạp lazy.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NẠP LAZY, và đây là lý do đo được chứ không phải thói quen: màn này kéo theo
 * TipTap + ProseMirror (~250 kB trước gzip). Import tĩnh thì mọi người dùng thật
 * đều tải một cục prototype mà họ không bao giờ mở. `lazyRouteComponent` đẩy nó
 * sang chunk riêng, chỉ tải khi ai đó thực sự gõ đường dẫn này.
 *
 * KHÔNG có `beforeLoad: requireSetup` — lab không đụng workspace nên không cần
 * workspace, và bắt người xem demo đi qua wizard cài đặt là vô nghĩa.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab/prompt-composer",
  component: lazyRouteComponent(() => import("@/features/prompt-lab"), "PromptComposerScreen"),
});
