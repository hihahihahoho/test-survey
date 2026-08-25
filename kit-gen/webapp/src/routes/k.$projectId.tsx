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
 * đổi cách làm việc.
 *
 * Wave 4·B đóng nốt vế sau: `WorkflowScreen` và cả hàng 6 bước đã bị XOÁ, không
 * còn "vẫn còn trong mã cho các màn con" nữa. Những mảnh của wizard mà màn dự án
 * thật sự dùng (`steps/KitsetStep`, `steps/MascotStep`, `steps/BriefStep`,
 * `steps/StyleStep`, `lib/model`, `lib/contract-sync`…) đã dọn sang
 * `features/kit-core` — chúng sống tiếp như THÀNH PHẦN của màn dự án, không như
 * bước của một trình thuật sĩ.
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
