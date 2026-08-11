import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";
import { runsSearchSchema } from "./search-schemas";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/runs",
  params: { parse: parseProjectParams },
  validateSearch: runsSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: RunsRoute,
});

function RunsRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/p/$projectId" params={{ projectId }} search={{ section: "images" }} replace />;
}
