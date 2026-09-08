import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { MascotLibraryScreen } from "@/features/home/LibraryScreen";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/mascot",
  component: () => <AppLayout screen="projects"><MascotLibraryScreen /></AppLayout>,
});
