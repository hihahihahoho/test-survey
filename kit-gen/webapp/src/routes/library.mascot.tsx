import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { MascotLibraryScreen } from "@/features/home/LibraryScreen";
import { requireSetup } from "./guards";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/mascot",
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: () => <AppLayout screen="projects"><MascotLibraryScreen /></AppLayout>,
});
