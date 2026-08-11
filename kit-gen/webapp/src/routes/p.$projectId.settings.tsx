import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/settings",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: ProjectSettingsRoute,
});

function ProjectSettingsRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/p/$projectId" params={{ projectId }} search={{ section: "settings" }} replace />;
}
