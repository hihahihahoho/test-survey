import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { UiLibraryScreen } from "@/features/home/LibraryScreen";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/ui",
  component: () => <AppLayout screen="projects"><UiLibraryScreen /></AppLayout>,
});
