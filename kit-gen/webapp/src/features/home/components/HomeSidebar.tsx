import {
  Images,
  ListTree,
  Palette,
  LayoutGrid,
  PanelsTopLeft,
  Settings,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UpdateSidebarButton } from "./UpdateSidebarButton";
import { UsageMeter } from "./UsageMeter";

/** Mục "Gần đây" đã bỏ theo yêu cầu chủ sản phẩm — chỉ còn một danh sách Dự án. */
export type HomeSection = "all";
export type HomeDestination = "projects" | "brands" | "prompt-library" | "references" | "trash" | "settings";

export interface HomeSidebarProps {
  section: HomeSection;
  active?: HomeDestination;
  trashCount: number;
  onSection: (section: HomeSection) => void;
  onTrash: () => void;
  onSettings: () => void;
  onBrands: () => void;
  onPromptLibrary: () => void;
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
  onPromptLibrary,
  onReferences,
}: HomeSidebarProps) {
  const item = (id: HomeSection, label: string, Icon: typeof LayoutGrid) => (
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
        {item("all", "Dự án", LayoutGrid)}
      </nav>

      <div className="my-4 border-t border-line-subtle" />
      {/* Title nhóm để người dùng phân biệt khu điều hướng (yêu cầu chủ sản phẩm). */}
      <p className="mb-2 px-3 text-caption font-medium uppercase tracking-wide text-fg-muted">Quản lý</p>
      <nav aria-label="Quản lý" className="space-y-1">
        {destination("brands", "Nhận dạng thương hiệu", Palette, onBrands)}
        {/* «Prompt» đứng cạnh hai kho ảnh vì nó cũng là NỘI DUNG: hai kho kia giữ
            ảnh, kho này giữ chữ — và chữ mới là thứ đi tới máy vẽ ở mọi tấm, kể cả
            tấm không đính ảnh nào.
            08/09/2026 — «Bộ khung UI» và «Mascot» rời thanh bên cùng hai màn của
            chúng: mọi thứ hai màn ấy từng tả bằng ảnh nay tả bằng prompt. */}
        {destination("prompt-library", "Prompt", ListTree, onPromptLibrary)}
        {destination("references", "Ảnh phong cách", Images, onReferences)}
      </nav>

      <div className="my-4 border-t border-line-subtle" />
      <div className="space-y-1">
        <div className="relative">
          {destination("trash", "Thùng rác", Trash2, onTrash)}
          {trashCount > 0 && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 tabular-nums text-caption text-fg-muted">{trashCount}</span>}
        </div>
      </div>
      {/* Chân sidebar: [Cập nhật] chỉ mọc ra khi THẬT SỰ có bản mới (component tự trả
          `null` nếu không), nằm ngay trên "Cài đặt" — cùng nhóm "việc của app", không
          lẫn vào nhóm điều hướng nội dung ở trên. */}
      <div className="mt-auto space-y-1 pt-4">
        {/* Quota Codex còn lại — tự trả `null` khi chưa có số, y như [Cập nhật]. */}
        <UsageMeter />
        <UpdateSidebarButton />
        {destination("settings", "Cài đặt", Settings, onSettings)}
      </div>
    </aside>
  );
}
