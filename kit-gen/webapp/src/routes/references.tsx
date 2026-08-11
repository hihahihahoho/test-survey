import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { ReferencesLibraryScreen } from "@/features/home/LibraryScreen";
import { requireSetup } from "./guards";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/references",
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: () => <AppLayout screen="projects"><ReferencesLibraryScreen /></AppLayout>,
});
