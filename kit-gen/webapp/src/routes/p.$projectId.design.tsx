import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
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
  return <AppLayout screen="design" projectId={projectId}><LazyScreen screen="design" projectId={projectId} /></AppLayout>;
}
