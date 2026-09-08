import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { parseProjectParams } from "./params";
import { runsSearchSchema } from "./search-schemas";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId/runs",
  params: { parse: parseProjectParams },
  validateSearch: runsSearchSchema,
  component: RunsRoute,
});

/* ĐÍCH ĐỔI TỪ `/p/:id` SANG `/k/:id`: app chỉ còn MỘT màn làm việc (khu soạn
   prompt). Trỏ về `/p/:id` vẫn chạy — nhưng đó là một cú nhảy thừa qua một
   route nay cũng chỉ chuyển hướng, và người dùng thấy URL đổi hai lần. */
function RunsRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}
