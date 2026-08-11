import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$projectId/studio",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: StudioRoute,
});
function StudioRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/p/$projectId" params={{ projectId }} search={{ section: "ui" }} replace />;
}
