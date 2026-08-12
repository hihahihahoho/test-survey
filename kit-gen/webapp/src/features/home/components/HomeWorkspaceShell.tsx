import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTrash } from "@/lib/hooks";
import { HomeSidebar, type HomeDestination, type HomeSection } from "./HomeSidebar";

export function HomeWorkspaceShell({
  active,
  title,
  action,
  children,
}: {
  active: Exclude<HomeDestination, "projects">;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const trash = useTrash();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");

  const goProjects = React.useCallback(
    (_section: HomeSection = "all") => void navigate({ to: "/", search: {} }),
    [navigate],
  );
  const go = {
    brands: () => void navigate({ to: "/brands" }),
    ui: () => void navigate({ to: "/library/ui" }),
    mascot: () => void navigate({ to: "/library/mascot" }),
    references: () => void navigate({ to: "/references" }),
    trash: () => void navigate({ to: "/trash" }),
    settings: () => void navigate({ to: "/settings", search: { tab: "agent" } }),
  };

  const searchProjects = (value: string) => {
    setQuery(value);
    if (value.trim()) void navigate({ to: "/", search: { q: value.trim() } });
  };

  return (
    <div className="relative flex min-h-dvh bg-canvas">
      <HomeSidebar
        active={active}
        section="all"
        trashCount={trash.data?.items.length ?? 0}
        query={query}
        onQueryChange={searchProjects}
        searchRef={searchRef}
        onSection={goProjects}
        onBrands={go.brands}
        onUiLibrary={go.ui}
        onMascotLibrary={go.mascot}
        onReferences={go.references}
        onTrash={go.trash}
        onSettings={go.settings}
      />
      <div className="kg-page min-w-0 flex-1 py-6 sm:py-8">
        <div className="mb-6 flex items-center gap-3 md:hidden">
          <button
            type="button"
            onClick={() => goProjects("all")}
            className="flex h-9 items-center gap-2 rounded-2 px-2 text-label text-fg hover:bg-raised"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Dự án
          </button>
        </div>
        <header className="flex min-h-10 items-center justify-between gap-4 border-b border-line-subtle pb-4">
          <h1 className="text-subtitle text-fg-strong">{title}</h1>
          {action}
        </header>
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
