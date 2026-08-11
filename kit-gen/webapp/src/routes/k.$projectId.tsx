import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { WorkflowScreen } from "@/features/workflow-v4/WorkflowScreen";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

/** FE3 E1: đường chính mới, một project agent được trình bày như một bộ kit. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$projectId",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: KitRoute,
});

function KitRoute() {
  const { projectId } = Route.useParams();
  return (
    <AppLayout screen="kit" projectId={projectId} simplified>
      <KitEntry projectId={projectId} />
    </AppLayout>
  );
}

function KitEntry({ projectId }: { projectId: string }) {
  return <WorkflowScreen projectId={projectId} />;
}
