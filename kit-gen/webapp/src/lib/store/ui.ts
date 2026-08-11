/**
 * webapp/src/lib/store/ui.ts — CLIENT STATE: tuỳ chọn giao diện (`kitgen.ui.v1`).
 * Server state là việc của TanStack Query — hai thứ KHÔNG trộn.
 *
 * Persist qua `createPersistStorage` nên mọi lần ghi đều đi qua allowlist khoá +
 * schema strict + bộ dò secret. `partialize` dùng allowlist FIELD tường minh: hàm
 * (action) và state tạm không bao giờ rời khỏi RAM.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LS_KEYS, createPersistStorage, defaultsFor, pickAllowed } from "./persist";

export type Theme = "dark" | "light" | "system";
export type ProjectsView = "grid" | "list";
export type SortBy = "updated" | "name" | "size" | "created";
export type SortDir = "asc" | "desc";
export type FilterChip = "all" | "need-gen" | "running" | "failed" | "unfinished";
export type KitBackdrop = "checker" | "dark" | "light";

const d = defaultsFor(LS_KEYS.ui);

/** Field được phép ghi ra localStorage — TƯỜNG MINH. Thêm field mới phải sửa cả đây. */
const PERSISTED_FIELDS = [
  "theme", "locale", "density", "sidebarWidth", "railCollapsed", "projectsView",
  "sortBy", "sortDir", "filterChip", "filterTags", "filterQuery",
  "collapsedSections", "lastTab", "kitBackdrop", "kitZoom",
] as const;

export interface UiState {
  theme: Theme;
  locale: "vi" | "en";
  density: "comfortable" | "compact";
  sidebarWidth: number;
  railCollapsed: boolean;
  projectsView: ProjectsView;
  sortBy: SortBy;
  sortDir: SortDir;
  filterChip: FilterChip;
  filterTags: string[];
  filterQuery: string;
  /** id các nhóm đang gập ở cây thiết kế S3.2 */
  collapsedSections: string[];
  /** tab cuối của từng màn: `{ design: "sheets", kit: "assets", settings: "agent" }` */
  lastTab: Record<string, string>;
  kitBackdrop: KitBackdrop;
  kitZoom: number;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setRailCollapsed: (v: boolean) => void;
  setSidebarWidth: (px: number) => void;
  setProjectsView: (v: ProjectsView) => void;
  setSort: (by: SortBy, dir?: SortDir) => void;
  setFilterChip: (c: FilterChip) => void;
  setFilterQuery: (q: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilters: () => void;
  toggleSection: (id: string) => void;
  setLastTab: (screen: string, tab: string) => void;
  setKitBackdrop: (b: KitBackdrop) => void;
  setKitZoom: (z: number) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: d.theme as Theme,
      locale: d.locale,
      density: d.density,
      sidebarWidth: d.sidebarWidth,
      railCollapsed: d.railCollapsed,
      projectsView: d.projectsView as ProjectsView,
      sortBy: d.sortBy as SortBy,
      sortDir: d.sortDir as SortDir,
      filterChip: d.filterChip as FilterChip,
      filterTags: d.filterTags,
      filterQuery: d.filterQuery,
      collapsedSections: d.collapsedSections,
      lastTab: d.lastTab,
      kitBackdrop: d.kitBackdrop as KitBackdrop,
      kitZoom: d.kitZoom,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      setSidebarWidth: (px) => set({ sidebarWidth: Math.min(480, Math.max(180, Math.round(px))) }),
      setProjectsView: (projectsView) => set({ projectsView }),
      setSort: (sortBy, sortDir) => set({ sortBy, ...(sortDir ? { sortDir } : {}) }),
      setFilterChip: (filterChip) => set({ filterChip }),
      setFilterQuery: (filterQuery) => set({ filterQuery }),
      toggleFilterTag: (tag) =>
        set((s) => ({
          filterTags: s.filterTags.includes(tag) ? s.filterTags.filter((t) => t !== tag) : [...s.filterTags, tag],
        })),
      clearFilters: () => set({ filterChip: "all", filterTags: [], filterQuery: "" }),
      toggleSection: (id) =>
        set((s) => ({
          collapsedSections: s.collapsedSections.includes(id)
            ? s.collapsedSections.filter((x) => x !== id)
            : [...s.collapsedSections, id],
        })),
      setLastTab: (screen, tab) => set((s) => ({ lastTab: { ...s.lastTab, [screen]: tab } })),
      setKitBackdrop: (kitBackdrop) => set({ kitBackdrop }),
      setKitZoom: (z) => set({ kitZoom: Math.min(200, Math.max(25, Math.round(z))) }),
    }),
    {
      name: LS_KEYS.ui,
      version: 1,
      storage: createPersistStorage(LS_KEYS.ui, 1),
      partialize: (s) => pickAllowed(s, PERSISTED_FIELDS),
    },
  ),
);

/** Đồng bộ class `dark`/`light` lên `<html>`. Dark-mode first. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const wantDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches !== false);
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(wantDark ? "dark" : "light");
}
