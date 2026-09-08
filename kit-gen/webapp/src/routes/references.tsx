import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { ReferencesLibraryScreen } from "@/features/home/ReferencesScreen";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/references",
  component: () => <AppLayout screen="projects"><ReferencesLibraryScreen /></AppLayout>,
});
