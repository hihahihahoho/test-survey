import * as React from "react";
import { Clock3, Folder, LayoutGrid, Search, Settings, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type HomeSection = "recent" | "all";

export interface HomeSidebarProps {
  section: HomeSection;
  workspace?: string;
  trashCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement>;
  onSection: (section: HomeSection) => void;
  onTrash: () => void;
  onSettings: () => void;
}

export function HomeSidebar({
  section,
  workspace,
  trashCount,
  query,
  onQueryChange,
  searchRef,
  onSection,
  onTrash,
  onSettings,
}: HomeSidebarProps) {
  const item = (id: HomeSection, label: string, Icon: typeof Clock3) => (
    <button
      type="button"
      onClick={() => onSection(id)}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-2 px-3 text-label",
        "transition-colors duration-fast",
        section === id ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{label}</span>
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
        {item("all", "Tất cả dự án", LayoutGrid)}
      </nav>

      <div className="my-4 border-t border-line-subtle" />
      <button
        type="button"
        className="flex items-center gap-3 rounded-2 px-3 py-2 text-left text-label text-fg"
        title={workspace}
      >
        <Folder className="size-4 shrink-0" aria-hidden />
        <span className="truncate">Thư mục làm việc</span>
      </button>
      <button
        type="button"
        onClick={onTrash}
        className="mt-1 flex h-10 items-center gap-3 rounded-2 px-3 text-label text-fg transition-colors duration-fast hover:bg-raised"
      >
        <Trash2 className="size-4 shrink-0" aria-hidden />
        <span>Thùng rác</span>
        {trashCount > 0 && <span className="ml-auto tabular-nums text-caption text-fg-muted">{trashCount}</span>}
      </button>
      <button
        type="button"
        onClick={onSettings}
        className="mt-auto flex h-10 items-center gap-3 rounded-2 px-3 text-label text-fg transition-colors duration-fast hover:bg-raised"
      >
        <Settings className="size-4 shrink-0" aria-hidden />
        <span>Cài đặt</span>
      </button>
    </aside>
  );
}
