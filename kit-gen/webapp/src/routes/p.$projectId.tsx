import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

/** @deprecated FE3-PLAN §3-E1: tổng quan cũ rời đường chính; URL này chuyển sang bộ kit. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: ProjectRedirect,
});

function ProjectRedirect() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
