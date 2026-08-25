import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { PromptCanvasScreen } from "@/features/prompt-canvas";
import { requireSetup } from "./guards";
import { parseProjectParams } from "./params";

/**
 * FE3 E1: đường chính mới, một project agent được trình bày như một bộ kit.
 *
 * ══ ĐIỂM ĐẾN ĐÃ ĐỔI: WIZARD 6 BƯỚC → MÀN SOẠN PROMPT ══════════════════════
 * URL giữ nguyên có chủ ý — mọi link, mọi bookmark, mọi thẻ ở trang danh sách
 * đều trỏ về đây, và người dùng không phải học một địa chỉ mới chỉ vì bên trong
 * đổi cách làm việc. `WorkflowScreen` vẫn còn trong mã cho các màn con của dự án;
 * thứ đổi là CỬA CHÍNH.
 */
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
  return <PromptCanvasScreen projectId={projectId} />;
}
