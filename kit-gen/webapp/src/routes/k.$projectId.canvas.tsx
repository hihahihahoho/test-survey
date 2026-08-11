import * as React from "react";
import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout, CanvasFileScreen } from "@/components/layout";
import { ErrorState, LoadingState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useCreateDoc, useDocsList } from "@/features/docs/hooks";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/k/$projectId/canvas",
  params: { parse: parseProjectParams },
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: CanvasProjectRoute,
});

function CanvasProjectRoute() {
  const { projectId } = Route.useParams();
  return (
    <AppLayout screen="project" projectId={projectId} simplified>
      <CanvasProjectBody projectId={projectId} />
    </AppLayout>
  );
}

function CanvasProjectBody({ projectId }: { projectId: string }) {
  const docs = useDocsList(projectId);
  const create = useCreateDoc(projectId);
  const [docId, setDocId] = React.useState<string | null>(null);
  const started = React.useRef(false);

  React.useEffect(() => {
    const canvas = docs.data?.find((doc) => doc.kind === "canvas");
    if (canvas) {
      setDocId(canvas.id);
      return;
    }
    if (docs.isSuccess && !started.current) {
      started.current = true;
      create.mutate({ name: "Bàn làm việc", kind: "canvas" }, {
        onSuccess: (doc) => setDocId(doc.id),
      });
    }
  }, [create, docs.data, docs.isSuccess]);

  if (docs.isError || create.isError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Chưa mở được bàn làm việc"
          description="Thử lại nhé. Bộ kit và bản thiết kế của bạn không bị ảnh hưởng."
          actions={<Button variant="secondary" onClick={() => void docs.refetch()}>Thử lại</Button>}
        />
      </div>
    );
  }
  if (docs.isLoading || create.isPending || !docId) {
    return <LoadingState count={2} label="Đang mở bàn làm việc…" />;
  }
  return <CanvasFileScreen projectId={projectId} docId={docId} docName="Bàn làm việc" />;
}
