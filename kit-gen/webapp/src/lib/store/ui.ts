/**
 * webapp/src/lib/store/ui.ts — CLIENT STATE: tuỳ chọn giao diện (`kitgen.ui.v1`).
 * Server state là việc của TanStack Query — hai thứ KHÔNG trộn.
 *
 * Persist qua `createPersistStorage` nên mọi lần ghi đều đi qua allowlist khoá +
 * schema strict + bộ dò secret. `partialize` dùng allowlist FIELD tường minh: hàm
 * (action) và state tạm không bao giờ rời khỏi RAM.
 *
 * ⚠ localStorage KHÔNG CÒN LÀ NGUỒN SỰ THẬT. Phần lớn store này sống trên đĩa tại
 * `<workspace>/.kitgen/config.json`; localStorage tụt xuống làm bộ nhớ đệm khởi động và
 * làm đường lùi khi agent chưa chạy. Danh sách field nào lên đĩa (và vì sao `filterQuery`
 * / `filterTags` CỐ Ý ở lại) nằm ở `./disk-settings.ts`; cây cầu ở `./settings-sync.ts`.
 * Thêm field mới vào đây thì cân nhắc thêm nó vào `DISK_UI_FIELDS` luôn.
 *
 * ⚠ Đợt 2 (một màn duy nhất) đã bỏ các field của những màn không còn: `locale`,
 * `density`, `sidebarWidth`, `railCollapsed`, `projectsView`, `filterChip`,
 * `collapsedSections`, `lastTab`, `kitBackdrop`, `kitZoom`. Vài KIỂU trong số đó vẫn ở
 * lại đây vì `features/projects` còn dùng để mô tả props (`ProjectsView`, `FilterChip`)
 * — kiểu thì còn, state thì không.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LS_KEYS, createPersistStorage, defaultsFor, pickAllowed } from "./persist";

export type Theme = "dark" | "light" | "system";
export type ProjectsView = "grid" | "list";
export type SortBy = "updated" | "name" | "size" | "created";
export type SortDir = "asc" | "desc";
export type FilterChip = "all" | "need-gen" | "running" | "failed" | "unfinished";

const d = defaultsFor(LS_KEYS.ui);

/** Field được phép ghi ra localStorage — TƯỜNG MINH. Thêm field mới phải sửa cả đây. */
const PERSISTED_FIELDS = ["theme", "sortBy", "sortDir", "filterTags", "filterQuery"] as const;

export interface UiState {
  theme: Theme;
  sortBy: SortBy;
  sortDir: SortDir;
  filterTags: string[];
  filterQuery: string;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSort: (by: SortBy, dir?: SortDir) => void;
  setFilterQuery: (q: string) => void;
  toggleFilterTag: (tag: string) => void;
  clearFilters: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: d.theme as Theme,
      sortBy: d.sortBy as SortBy,
      sortDir: d.sortDir as SortDir,
      filterTags: d.filterTags,
      filterQuery: d.filterQuery,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      setSort: (sortBy, sortDir) => set({ sortBy, ...(sortDir ? { sortDir } : {}) }),
      setFilterQuery: (filterQuery) => set({ filterQuery }),
      toggleFilterTag: (tag) =>
        set((s) => ({
          filterTags: s.filterTags.includes(tag) ? s.filterTags.filter((t) => t !== tag) : [...s.filterTags, tag],
        })),
      clearFilters: () => set({ filterTags: [], filterQuery: "" }),
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
