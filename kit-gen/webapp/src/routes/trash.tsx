import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { TrashScreen } from "@/features/home/TrashScreen";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trash",
  component: () => <AppLayout screen="projects"><TrashScreen /></AppLayout>,
});
