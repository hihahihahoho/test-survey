import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, LazyScreen } from "@/components/layout";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/settings",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: ProjectSettingsRoute,
});

function ProjectSettingsRoute() {
  const { projectId } = Route.useParams();
  return <AppLayout screen="project-settings" projectId={projectId}><LazyScreen screen="project-settings" projectId={projectId} /></AppLayout>;
}
