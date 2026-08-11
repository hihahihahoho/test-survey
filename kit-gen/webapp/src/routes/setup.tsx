import { createRoute, redirect } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { setupSearchSchema } from "./search-schemas";

/**
 * S0 `/setup` — wizard 4 bước. ĐÂY LÀ ROUTE DUY NHẤT KHÔNG CÓ GUARD setup
 * (§2.1: "needsSetup=false ⇒ vào được khi chưa setup"). Nếu gắn guard vào đây
 * thì user chưa setup sẽ bị đá vòng tròn /setup → /setup.
 *
 * Cũng KHÔNG bọc `AppLayout`: wizard không có rail, không breadcrumb, và
 * §3-S0 nói "Esc không đóng được wizard nếu chưa xong". Màn tự dựng khung của
 * nó (chủ sở hữu: R1-P2).
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  validateSearch: setupSearchSchema,
  beforeLoad: () => { throw redirect({ to: "/", replace: true }); },
  component: () => null,
});
