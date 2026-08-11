import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { StudioScreen } from "@/features/studio/StudioScreen";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$projectId/studio",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: StudioRoute,
});
function StudioRoute() {
  const { projectId } = Route.useParams();
  return <AppLayout screen="kit" projectId={projectId} simplified><StudioScreen projectId={projectId} /></AppLayout>;
}
