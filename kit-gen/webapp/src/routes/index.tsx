import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { projectsSearchSchema } from "./search-schemas";

/** S1 `/` — DANH SÁCH PROJECT (trang chủ). Full width, không rail (§2.2). */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: projectsSearchSchema,
  component: () => (
    <AppLayout screen="projects">
      <LazyScreen screen="projects" />
    </AppLayout>
  ),
});
