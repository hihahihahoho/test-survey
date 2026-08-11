import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";
import { projectSearchSchema } from "./search-schemas";

/** Tổng quan dự án. Bộ kit là một tài nguyên bên trong dự án, không phải dự án. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId",
  params: { parse: parseProjectParams },
  validateSearch: projectSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  return <AppLayout screen="project" projectId={projectId}><LazyScreen screen="project" projectId={projectId} /></AppLayout>;
}
