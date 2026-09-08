import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { settingsSearchSchema } from "./search-schemas";

/** Cài đặt là một trang trong khung Home; không mount Home thứ hai phía sau. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  validateSearch: settingsSearchSchema,
  component: () => (
    <AppLayout screen="settings">
      <LazyScreen screen="settings" />
    </AppLayout>
  ),
});
