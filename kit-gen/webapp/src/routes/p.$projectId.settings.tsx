import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

/** Legacy sidebar IA redirects to the single kit entry. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/settings",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: LegacyProjectRedirect,
});

function LegacyProjectRedirect() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
