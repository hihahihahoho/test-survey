import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { TrashScreen } from "@/features/home/TrashScreen";
import { requireSetup } from "./guards";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trash",
  beforeLoad: ({ location }) => requireSetup(location.pathname),
  component: () => <AppLayout screen="projects"><TrashScreen /></AppLayout>,
});
