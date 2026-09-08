import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
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
  component: ProjectFileRoute,
});

/* ĐÍCH ĐỔI TỪ `/p/:id` SANG `/k/:id`: app chỉ còn MỘT màn làm việc (khu soạn
   prompt). Trỏ về `/p/:id` vẫn chạy — nhưng đó là một cú nhảy thừa qua một
   route nay cũng chỉ chuyển hướng, và người dùng thấy URL đổi hai lần. */
function ProjectFileRoute() {
  const { projectId } = Route.useParams();
  return <Navigate to="/k/$projectId" params={{ projectId }} replace />;
}

export default Route;
