import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
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
  const { projectId, runId } = Route.useParams();
  return <AppLayout screen="run-detail" projectId={projectId}><LazyScreen screen="run-detail" projectId={projectId} runId={runId} /></AppLayout>;
}
