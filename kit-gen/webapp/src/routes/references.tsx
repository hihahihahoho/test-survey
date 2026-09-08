import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { ReferencesLibraryScreen } from "@/features/home/LibraryScreen";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/references",
  component: () => <AppLayout screen="projects"><ReferencesLibraryScreen /></AppLayout>,
});
