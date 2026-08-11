import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { projectsSearchSchema } from "./search-schemas";
import { requireSetup } from "./guards";

/** S1 `/` — DANH SÁCH PROJECT (trang chủ). Full width, không rail (§2.2). */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: projectsSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: () => (
    <AppLayout screen="projects">
      <LazyScreen screen="projects" />
    </AppLayout>
  ),
});
