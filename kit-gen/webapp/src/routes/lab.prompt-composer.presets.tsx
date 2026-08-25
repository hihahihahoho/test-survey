import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";

/**
 * `/lab/prompt-composer/presets` — trang quản lý danh mục của lab.
 *
 * Route RIÊNG thay vì một tab trong màn composer, có lý do: nó sửa DỮ LIỆU mà
 * composer đọc, nên phải mở được cạnh nhau ở hai tab trình duyệt để vừa sửa vừa
 * xem kết quả. Một tab nội bộ thì không có URL và không mở song song được.
 *
 * ⚠️ Phải đăng ký TRƯỚC `/lab/prompt-composer` trong `routeTree.ts` — route cụ
 * thể đứng trước route tổng, cùng luật với `runDetailRoute` / `runsRoute`.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab/prompt-composer/presets",
  component: lazyRouteComponent(() => import("@/features/prompt-lab"), "PresetsScreen"),
});
