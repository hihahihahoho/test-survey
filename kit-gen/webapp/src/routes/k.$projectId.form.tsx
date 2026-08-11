import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { Navigate } from "@tanstack/react-router"
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$projectId/form",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: FormRoute,
});

function FormRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
