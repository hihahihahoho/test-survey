import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
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
  return <AppLayout screen="runs" projectId={projectId}><LazyScreen screen="runs" projectId={projectId} /></AppLayout>;
}
