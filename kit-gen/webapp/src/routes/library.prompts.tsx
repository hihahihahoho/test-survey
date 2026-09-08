import { createRoute } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { AppLayout } from "@/components/layout";
import { PromptLibraryScreen } from "@/features/home/PromptLibraryScreen";
import { promptLibrarySearchSchema } from "./search-schemas";

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/prompts",
  validateSearch: promptLibrarySearchSchema,
  component: () => <AppLayout screen="projects"><PromptLibraryScreen /></AppLayout>,
});
