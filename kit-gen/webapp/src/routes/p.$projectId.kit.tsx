import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
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
  return <Navigate to="/p/$projectId" params={{ projectId }} search={{ section: "overview" }} replace />;
}
