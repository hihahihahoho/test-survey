import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, CanvasFileScreen } from "@/components/layout";
import { requireSetup } from "./guards";
import { isProjectId } from "@/lib/types";
import { RE_DOC_ID } from "@/features/docs/lib/types";

export function parseFileRouteParams(raw: Record<string, string>): { projectId: string; fileId: string } | false {
  const projectId = raw.projectId ?? "";
  const fileId = raw.fileId ?? "";
  return isProjectId(projectId) && RE_DOC_ID.test(fileId) ? { projectId, fileId } : false;
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/f/$fileId",
  params: { parse: parseFileRouteParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: ProjectFileRoute,
});

function ProjectFileRoute() {
  const { projectId, fileId } = Route.useParams();
  return <AppLayout screen="project" projectId={projectId} fileId={fileId}><CanvasFileScreen projectId={projectId} docId={fileId} docName="Bàn làm việc" /></AppLayout>;
}

export default Route;
