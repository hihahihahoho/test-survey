import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseRunParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/runs/$runId",
  params: { parse: parseRunParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: RunDetailRoute,
});

function RunDetailRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/p/$projectId" params={{ projectId }} search={{ section: "images" }} replace />;
}
