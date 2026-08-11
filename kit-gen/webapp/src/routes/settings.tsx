import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { settingsSearchSchema } from "./search-schemas";
import { requireSetup } from "./guards";

/**
 * S6 `/settings` là route-lớp-phủ: Home vẫn mount phía sau, Settings tự portal
 * thành modal. Tab lạ tự rơi về `agent` (xem search-schemas.ts).
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: settingsSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: () => (
    <AppLayout screen="projects">
      <LazyScreen screen="projects" />
      <LazyScreen screen="settings" />
    </AppLayout>
  ),
});
