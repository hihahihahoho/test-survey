import * as React from "react";
import {
  Clock3,
  Images,
  LayoutGrid,
  PanelsTopLeft,
  Search,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type HomeSection = "recent" | "all";
export type HomeDestination = "projects" | "ui-library" | "mascot-library" | "references" | "trash" | "settings";

export interface HomeSidebarProps {
  section: HomeSection;
  active?: HomeDestination;
  trashCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  onSection: (section: HomeSection) => void;
  onTrash: () => void;
  onSettings: () => void;
  onUiLibrary: () => void;
  onMascotLibrary: () => void;
  onReferences: () => void;
}

export function HomeSidebar({
  section,
  active = "projects",
  trashCount,
  query,
  onQueryChange,
  searchRef,
  onSection,
  onTrash,
  onSettings,
  onUiLibrary,
  onMascotLibrary,
  onReferences,
}: HomeSidebarProps) {
  const item = (id: HomeSection, label: string, Icon: typeof Clock3) => (
    <button
      type="button"
      onClick={() => onSection(id)}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-2 px-3 text-label",
        "transition-colors duration-fast",
        active === "projects" && section === id ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );

  const destination = (
    id: Exclude<HomeDestination, "projects">,
    label: string,
    Icon: typeof PanelsTopLeft,
    onClick: () => void,
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-current={active === id ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label",
        "transition-colors duration-fast",
        active === id ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-line-subtle bg-surface/60 p-4 md:flex">
      <button
        type="button"
        onClick={() => onSection("all")}
        className="mb-4 flex h-10 items-center gap-2 rounded-2 px-2 text-subtitle text-fg-strong"
        aria-label="KitGen — tất cả dự án"
      >
        <span className="flex size-6 items-center justify-center rounded-2 border border-accent bg-accent/[var(--kg-tint-a)]" aria-hidden>
          <span className="size-1.5 rounded-full bg-accent" />
        </span>
        <span>KitGen</span>
      </button>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Tìm dự án"
          placeholder="Tìm dự án…"
          className="h-9 rounded-2 bg-canvas pl-9"
        />
      </div>

      <nav aria-label="Danh sách dự án" className="space-y-1">
        {item("recent", "Gần đây", Clock3)}
        {item("all", "Dự án", LayoutGrid)}
      </nav>

      <div className="my-4 border-t border-line-subtle" />
      <nav aria-label="Thư viện" className="space-y-1">
        {destination("ui-library", "Bộ khung UI", PanelsTopLeft, onUiLibrary)}
        {destination("mascot-library", "Bộ khung mascot", Sparkles, onMascotLibrary)}
        {destination("references", "Ảnh tham chiếu", Images, onReferences)}
      </nav>

      <div className="my-4 border-t border-line-subtle" />
      <div className="space-y-1">
        <div className="relative">
          {destination("trash", "Thùng rác", Trash2, onTrash)}
          {trashCount > 0 && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 tabular-nums text-caption text-fg-muted">{trashCount}</span>}
        </div>
      </div>
      <div className="mt-auto pt-4">
        {destination("settings", "Cài đặt", Settings, onSettings)}
      </div>
    </aside>
  );
}
