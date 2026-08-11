import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";
import { kitSearchSchema } from "./search-schemas";

/** Quản lý bộ kit đã tạo trong dự án. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/kit",
  params: { parse: parseProjectParams },
  validateSearch: kitSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: ProjectKitRoute,
});

function ProjectKitRoute() {
  const { projectId } = Route.useParams();
  return <AppLayout screen="kit" projectId={projectId}><LazyScreen screen="kit" projectId={projectId} /></AppLayout>;
}
