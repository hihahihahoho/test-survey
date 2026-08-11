import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { requireSetup } from "./guards";
import { isProjectId } from "@/lib/types";

/** Legacy run-detail URL redirects to the kit entry; details remain available from the kit workflow. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/runs/$runId",
  params: { parse: (raw: Record<string, string>) => { const projectId = raw.projectId ?? ""; const runId = raw.runId ?? ""; return isProjectId(projectId) && /^r-[a-z0-9-]{2,64}$/.test(runId) ? { projectId, runId } : false; } },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: LegacyRunRedirect,
});

function LegacyRunRedirect() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
