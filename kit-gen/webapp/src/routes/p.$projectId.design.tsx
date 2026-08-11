import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";
import { designSearchSchema } from "./search-schemas";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/design",
  params: { parse: parseProjectParams },
  validateSearch: designSearchSchema,
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: DesignRoute,
});

function DesignRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/p/$projectId" params={{ projectId }} search={{ section: "ui" }} replace />;
}
