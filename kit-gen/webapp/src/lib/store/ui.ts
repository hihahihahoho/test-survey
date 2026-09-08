/**
 * webapp/src/lib/store/ui.ts — CLIENT STATE: tuỳ chọn giao diện (`kitgen.ui.v1`).
 * Server state là việc của TanStack Query — hai thứ KHÔNG trộn.
 *
 * Persist qua `createPersistStorage` nên mọi lần ghi đều đi qua allowlist khoá +
 * schema strict + bộ dò secret. `partialize` dùng allowlist FIELD tường minh: hàm
 * (action) và state tạm không bao giờ rời khỏi RAM.
 *
 * ⚠ localStorage KHÔNG CÒN LÀ NGUỒN SỰ THẬT. Store này sống trên đĩa tại
 * `<workspace>/.kitgen/config.json`; localStorage tụt xuống làm bộ nhớ đệm khởi động và
 * làm đường lùi khi agent chưa chạy. Danh sách field nào lên đĩa nằm ở
 * `./disk-settings.ts`; cây cầu ở `./settings-sync.ts`. Thêm field mới vào đây thì cân
 * nhắc thêm nó vào `DISK_UI_FIELDS` luôn.
 *
 * ⚠ Đợt 2 (một màn duy nhất) đã bỏ các field của những màn không còn: `locale`,
 * `density`, `sidebarWidth`, `railCollapsed`, `projectsView`, `filterChip`,
 * `collapsedSections`, `lastTab`, `kitBackdrop`, `kitZoom`.
 *
 * ⚠ Đợt 3 bỏ nốt `sortBy` / `sortDir` / `filterTags` / `filterQuery` cùng bộ action của
 * chúng: KHÔNG còn màn nào đọc. Danh sách bộ kit chỉ có MỘT thứ tự («sửa gần nhất»,
 * `features/home/lib/home-view.ts`) và ô tìm là state CỤC BỘ của `ProjectsScreen` —
 * cố ý, vì một bộ lọc còn sót từ hôm qua chắn hết danh sách là lỗi, không phải tính
 * năng. `sortBy`/`sortDir` cũng rời `DISK_UI_FIELDS`; agent vẫn nhận hai field đó nên
 * config.json cũ đọc lên không vỡ, web chỉ thôi ghi vào chúng. Ba KIỂU đi kèm
 * (`SortBy`, `SortDir`, `FilterChip`) đã dời về `features/projects/lib/view.ts` — nơi
 * duy nhất còn dùng chúng, và dùng như THAM SỐ hàm chứ không phải state.
 *
 * Còn lại ĐÚNG MỘT tuỳ chọn: `theme`. Giữ store (không hạ xuống một biến) vì cây cầu
 * `settings-sync.ts` subscribe vào nó, và vì đây là nơi allowlist khoá localStorage
 * được thi hành.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LS_KEYS, createPersistStorage, defaultsFor, pickAllowed } from "./persist";

export type Theme = "dark" | "light" | "system";

const d = defaultsFor(LS_KEYS.ui);

/** Field được phép ghi ra localStorage — TƯỜNG MINH. Thêm field mới phải sửa cả đây. */
const PERSISTED_FIELDS = ["theme"] as const;

export interface UiState {
  theme: Theme;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: d.theme as Theme,

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
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
