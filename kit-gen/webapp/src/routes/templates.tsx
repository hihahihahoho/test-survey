import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { TemplatesScreen } from "@/features/home/TemplatesScreen";

/** «Template dự án» — quản lý template đã lưu (đổi tên, mô tả, xoá, tạo dự án từ đó). */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/templates",
  component: () => <AppLayout screen="projects"><TemplatesScreen /></AppLayout>,
});
