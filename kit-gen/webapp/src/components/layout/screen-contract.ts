/**
 * webapp/src/components/layout/screen-contract.ts
 * ════════════════════════════════════════════════════════════════════════════
 * HỢP ĐỒNG LAZY-MOUNT — đọc file này trước khi làm màn.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * VẤN ĐỀ BAN ĐẦU: 3 team làm 9 màn song song. Nếu route `import` tĩnh một file mà
 * team kia chưa nộp thì `npm run build` GÃY cho tất cả mọi người.
 *
 * GIẢI PHÁP: màn được nạp bằng **dynamic import qua `import.meta.glob`**. File chưa
 * tồn tại ⇒ route render `<ScreenPlaceholder>` (một màn tử tế, có tên màn + đường dẫn
 * file cần tạo), KHÔNG vỡ build, KHÔNG trắng trang.
 *
 * ══ 08/09/2026 — TỪ 9 MÀN XUỐNG 3 ═════════════════════════════════════════
 * IA prompt-first: app còn đúng một màn LÀM VIỆC (`kit` — khu soạn prompt) và hai
 * trang vỏ (`projects` — danh sách bộ kit, `settings` — cài đặt máy). Sáu id còn lại
 * (`setup`, `project`, `project-settings`, `design`, `runs`, `run-detail`) đã bị xoá
 * cùng màn của chúng.
 *
 * `kit` KHÔNG nằm trong bảng lazy: `PromptCanvasScreen` nhận props riêng
 * (`settingsOpen` / `onSettingsOpenChange` đọc từ `?settings=`) chứ không hợp
 * `ScreenProps`, nên route `/k/:projectId` nạp nó TĨNH. Nó vẫn có mặt trong
 * `ScreenId` vì `AppLayout` cần nhãn của nó cho `document.title`.
 *
 * ĐƯỜNG DẪN LÀ CỐ ĐỊNH. Không đổi tên, không đổi chỗ, không đổi kiểu export.
 *
 *   features/projects/ProjectsScreen.tsx      → export function ProjectsScreen(props)
 *   features/settings/SettingsScreen.tsx      → export function SettingsScreen(props)
 *
 * MÀN NHẬN ĐÚNG BỘ PROPS `ScreenProps` bên dưới. Ngoài props đó, màn tự lấy dữ liệu
 * bằng hook trong `@/lib/hooks` — router KHÔNG truyền dữ liệu server xuống, KHÔNG
 * truyền trạng thái agent xuống (dùng `useAgentStatus()`; shell đã lo banner + pill).
 *
 * MÀN ĐƯỢC PHÉP export thêm (TUỲ CHỌN, thiếu cũng chạy):
 *   export const screenCommands: ScreenCommandFactory   ← lệnh riêng cho ⌘K
 * Xem `command-registry.ts`.
 *
 * CHẤP NHẬN cả `export default`. Thứ tự dò: named export đúng tên → default.
 */
import * as React from "react";

/** Bộ props chuẩn mà MỌI màn lazy nhận. Không thêm field mà không sửa file này. */
export interface ScreenProps {
  /** Có mặt khi màn nằm trong ngữ cảnh một bộ kit. */
  projectId?: string;
}

export type ScreenComponent = React.ComponentType<ScreenProps>;

/** Ba màn có thật của app. */
export type ScreenId = "projects" | "kit" | "settings";

/** Hai màn đi qua `LazyScreen` (xem chú thích đầu file về vì sao `kit` không có ở đây). */
export type LazyScreenId = "projects" | "settings";

/** Nhãn tiếng Việt (§1.3 từ vựng — không hiện thuật ngữ kỹ thuật). */
export const SCREEN_LABEL: Record<ScreenId, string> = {
  projects: "Bộ kit của bạn",
  kit: "Khu soạn",
  settings: "Cài đặt",
};

/** Đường dẫn file mà team màn phải tạo — hiện nguyên văn trên placeholder. */
export const SCREEN_PATH: Record<LazyScreenId, string> = {
  projects: "src/features/projects/ProjectsScreen.tsx",
  settings: "src/features/settings/SettingsScreen.tsx",
};

/** Tên export mong đợi trong file của màn. */
export const SCREEN_EXPORT: Record<LazyScreenId, string> = {
  projects: "ProjectsScreen",
  settings: "SettingsScreen",
};

/* ══════════════════════════════════════════════════════════════════════════
   MÔI TRƯỜNG KHUNG (`ShellEnv`)
   ══════════════════════════════════════════════════════════════════════════

   Hai thứ mà màn cần nhưng KHÔNG được tự đi lấy:

   ① `agentOffline` — trạng thái agent là việc của KHUNG, không phải của từng màn.
   ② `agentCommand` — lệnh chạy công cụ local phụ thuộc entry (`RUN_CMD` vs
      `RUN_CMD_REPO`), chỉ khung biết.
*/
export interface ShellEnv {
  agentOffline: boolean;
  /** Lệnh dán được để chạy công cụ local. Không có ⇒ banner vẫn đủ nghĩa. */
  agentCommand?: string;
}

const ShellEnvContext = React.createContext<ShellEnv>({ agentOffline: false });

export const ShellEnvProvider = ShellEnvContext.Provider;

export function useShellEnv(): ShellEnv {
  return React.useContext(ShellEnvContext);
}
