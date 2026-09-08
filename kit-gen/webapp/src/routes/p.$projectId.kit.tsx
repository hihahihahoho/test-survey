import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { parseProjectParams } from "./params";
import { kitSearchSchema } from "./search-schemas";

/** Quản lý bộ kit đã tạo trong dự án. */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/kit",
  params: { parse: parseProjectParams },
  validateSearch: kitSearchSchema,
  component: ProjectKitRoute,
});

/* ĐÍCH ĐỔI TỪ `/p/:id` SANG `/k/:id`: app chỉ còn MỘT màn làm việc (khu soạn
   prompt). Trỏ về `/p/:id` vẫn chạy — nhưng đó là một cú nhảy thừa qua một
   route nay cũng chỉ chuyển hướng, và người dùng thấy URL đổi hai lần. */
function ProjectKitRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
