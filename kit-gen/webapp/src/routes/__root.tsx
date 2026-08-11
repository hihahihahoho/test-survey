import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { NotFoundScreen } from "./-not-found";
import { RouteErrorScreen } from "./-route-error";

export interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Route gốc. CỐ Ý để trống phần chrome: `AppLayout` được bọc ở TỪNG route vì
 * §2.2 nói rail chỉ có khi ở trong project, còn S0 (wizard) không có cả header
 * lẫn rail. Bọc khung ở đây sẽ ép mọi màn cùng một dạng — sai spec.
 *
 * Trang 404 và trang lỗi khai ở đây để áp dụng cho toàn cây route.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: NotFoundScreen,
  errorComponent: RouteErrorScreen,
});
