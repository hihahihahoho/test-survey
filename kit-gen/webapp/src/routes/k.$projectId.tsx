import { createRoute, useNavigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { PromptCanvasScreen } from "@/features/prompt-canvas";
import { parseProjectParams } from "./params";
import { kitCanvasSearchSchema } from "./search-schemas";

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
  validateSearch: kitCanvasSearchSchema,
  component: KitRoute,
});

/**
 * ROUTE BIẾT VỀ URL, MÀN BIẾT VỀ UI — nên `?settings=` được đọc Ở ĐÂY rồi truyền
 * xuống thành hai prop thường. Xem `PromptCanvasScreenProps` để biết vì sao màn
 * KHÔNG tự gọi `Route.useSearch()` (nó ném khi dựng ngoài router, và màn có hai
 * chỗ dựng ngoài router có thật).
 */
function KitRoute() {
  const { projectId } = Route.useParams();
  const { settings } = Route.useSearch();
  const navigate = useNavigate();

  return (
    <AppLayout screen="kit" projectId={projectId}>
      <PromptCanvasScreen
        projectId={projectId}
        settingsOpen={settings !== undefined}
        /* Đóng thì `replace`: mở-rồi-đóng một dialog không đáng để lại hai nấc
           trong lịch sử trình duyệt — người dùng sẽ phải bấm Back hai lần mới
           rời được màn. Mở thì KHÔNG replace, để Back đóng đúng cái vừa mở. */
        onSettingsOpenChange={(open) => {
          void navigate({
            to: "/k/$projectId",
            params: { projectId },
            search: open ? { settings: "project" as const } : {},
            replace: !open,
          });
        }}
      />
    </AppLayout>
  );
}
