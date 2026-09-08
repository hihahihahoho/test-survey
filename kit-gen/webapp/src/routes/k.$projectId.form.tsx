import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { Navigate } from "@tanstack/react-router"
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$projectId/form",
  params: { parse: parseProjectParams },
  component: FormRoute,
});

function FormRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
