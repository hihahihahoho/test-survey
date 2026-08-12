import {
  Clock3,
  Images,
  Palette,
  LayoutGrid,
  PanelsTopLeft,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type HomeSection = "recent" | "all";
export type HomeDestination = "projects" | "brands" | "ui-library" | "mascot-library" | "references" | "trash" | "settings";

export interface HomeSidebarProps {
  section: HomeSection;
  active?: HomeDestination;
  trashCount: number;
  onSection: (section: HomeSection) => void;
  onTrash: () => void;
  onSettings: () => void;
  onBrands: () => void;
  onUiLibrary: () => void;
  onMascotLibrary: () => void;
  onReferences: () => void;
}

export function HomeSidebar({
  section,
  active = "projects",
  trashCount,
  onSection,
  onTrash,
  onSettings,
  onBrands,
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

      <nav aria-label="Danh sách dự án" className="space-y-1">
        {item("recent", "Gần đây", Clock3)}
        {item("all", "Dự án", LayoutGrid)}
      </nav>

      <div className="my-4 border-t border-line-subtle" />
      <nav aria-label="Quản lý" className="space-y-1">
        {destination("brands", "Nhận dạng thương hiệu", Palette, onBrands)}
        {destination("ui-library", "Bộ khung UI", PanelsTopLeft, onUiLibrary)}
        {destination("mascot-library", "Mascot", Sparkles, onMascotLibrary)}
        {destination("references", "Style reference", Images, onReferences)}
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
