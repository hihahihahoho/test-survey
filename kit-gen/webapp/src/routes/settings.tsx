import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { settingsSearchSchema } from "./search-schemas";
import { requireSetup } from "./guards";

/**
 * S6 `/settings` — 5 tab qua `?tab=agent|env|prefs|trash|about` (§2.1).
 * Full width, không rail. Tab lạ tự rơi về `agent` (xem search-schemas.ts).
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: settingsSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: () => (
    <AppLayout screen="settings">
      <LazyScreen screen="settings" />
    </AppLayout>
  ),
});
