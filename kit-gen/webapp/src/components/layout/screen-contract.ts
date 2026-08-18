/**
 * webapp/src/components/layout/screen-contract.ts
 * ════════════════════════════════════════════════════════════════════════════
 * HỢP ĐỒNG LAZY-MOUNT — đọc file này trước khi làm màn.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * VẤN ĐỀ: 3 team làm 9 màn song song. Nếu route `import` tĩnh một file mà team
 * kia chưa nộp thì `npm run build` GÃY cho tất cả mọi người. Bản vanilla đã
 * dính đúng bệnh này (`teams/qa-web/qa-func.md` C-02: thiếu import ⇒ vỡ màn).
 *
 * GIẢI PHÁP: mỗi màn được nạp bằng **dynamic import có try/catch**. File chưa
 * tồn tại ⇒ route render `<ScreenPlaceholder>` (một màn tử tế, có tên màn +
 * đường dẫn file cần tạo), KHÔNG vỡ build, KHÔNG trắng trang.
 *
 * ĐƯỜNG DẪN LÀ CỐ ĐỊNH. Không đổi tên, không đổi chỗ, không đổi kiểu export.
 *
 *   features/setup/SetupScreen.tsx            → export function SetupScreen(props)
 *   features/projects/ProjectsScreen.tsx      → export function ProjectsScreen(props)
 *   features/design/DesignScreen.tsx          → export function DesignScreen(props)
 *   features/runs/RunsScreen.tsx              → export function RunsScreen(props)
 *   features/runs/RunDetailScreen.tsx         → export function RunDetailScreen(props)
 *   features/project/ProjectScreen.tsx        → export function ProjectScreen(props)
 *   features/project/ProjectSettingsScreen.tsx→ export function ProjectSettingsScreen(props)
 *   features/kit/KitScreen.tsx                → export function KitScreen(props)
 *   features/settings/SettingsScreen.tsx      → export function SettingsScreen(props)
 *
 * MỖI MÀN NHẬN ĐÚNG BỘ PROPS `ScreenProps` bên dưới ({ projectId?, runId? }).
 * Ngoài props đó, màn tự lấy dữ liệu bằng hook trong `@/lib/hooks` — router
 * KHÔNG truyền dữ liệu server xuống, KHÔNG truyền trạng thái agent xuống
 * (dùng `useAgentStatus()`; shell đã lo banner + pill ở tầng khung).
 *
 * MỖI MÀN ĐƯỢC PHÉP export thêm (đều TUỲ CHỌN, thiếu cũng chạy):
 *   export const screenCommands: ScreenCommandFactory   ← lệnh riêng cho ⌘K
 * Xem `command-registry.ts`.
 *
 * CHẤP NHẬN cả `export default`. Thứ tự dò: named export đúng tên → default.
 */
import * as React from "react";

/** Bộ props chuẩn mà MỌI màn nhận. Không thêm field mà không sửa file này. */
export interface ScreenProps {
  /** Có mặt ở 6 màn trong ngữ cảnh project (S2, S2b, S3, S4, S4d, S5). */
  projectId?: string;
  /** Chỉ có ở `/p/:id/runs/:runId`. */
  runId?: string;
  /**
   * CHỈ S0. Wizard xong thì báo lại ý định của user; route lo điều hướng bằng
   * router (S0 tự xử sẽ phải reload cả trang — mất cache Query, chớp màn).
   * Đã thoả thuận với R1-P2 trong `features/setup/index.ts`.
   */
  onDone?: (intent: "create" | "import" | "home") => void;
}

export type ScreenComponent = React.ComponentType<ScreenProps>;

/** Id của 9 màn — khớp `SCREEN_LABEL` và bảng lazy-mount. */
export type ScreenId =
  | "setup"
  | "projects"
  | "project"
  | "project-settings"
  | "design"
  | "runs"
  | "run-detail"
  | "kit"
  | "settings";

/** Nhãn tiếng Việt (§1.3 từ vựng — không hiện thuật ngữ kỹ thuật). */
export const SCREEN_LABEL: Record<ScreenId, string> = {
  setup: "Cài đặt lần đầu",
  projects: "Danh sách dự án",
  project: "Tổng quan dự án",
  "project-settings": "Cài đặt dự án",
  design: "Bản thiết kế",
  runs: "Theo dõi sinh ảnh",
  "run-detail": "Chi tiết lượt chạy",
  kit: "Thư viện kit",
  settings: "Cài đặt",
};

/** Đường dẫn file mà team màn phải tạo — hiện nguyên văn trên placeholder. */
export const SCREEN_PATH: Record<ScreenId, string> = {
  setup: "src/features/setup/SetupScreen.tsx",
  projects: "src/features/projects/ProjectsScreen.tsx",
  project: "src/features/project/ProjectScreen.tsx",
  "project-settings": "src/features/project/ProjectSettingsScreen.tsx",
  design: "src/features/design/DesignScreen.tsx",
  runs: "src/features/runs/RunsScreen.tsx",
  "run-detail": "src/features/runs/RunDetailScreen.tsx",
  kit: "src/features/kit/KitScreen.tsx",
  settings: "src/features/settings/SettingsScreen.tsx",
};

/** Tên export mong đợi trong file của màn. */
export const SCREEN_EXPORT: Record<ScreenId, string> = {
  setup: "SetupScreen",
  projects: "ProjectsScreen",
  project: "ProjectScreen",
  "project-settings": "ProjectSettingsScreen",
  design: "DesignScreen",
  runs: "RunsScreen",
  "run-detail": "RunDetailScreen",
  kit: "KitScreen",
  settings: "SettingsScreen",
};

/** §2.2: S1 và S6 full width; 6 màn trong ngữ cảnh project có rail trái. */
export const HAS_RAIL: ReadonlySet<ScreenId> = new Set<ScreenId>([
  "project",
  "project-settings",
  "design",
  "runs",
  "run-detail",
  "kit",
]);

/* ══════════════════════════════════════════════════════════════════════════
   FE-2 · E1 — PHẠM VI FILE CON mà màn đang xem ("file scope")
   ══════════════════════════════════════════════════════════════════════════

   §4.2 chốt: file con là **VIEW**, không phải bản sao. Nên nó không được đi vào
   `ScreenProps` như một dữ liệu server: nó là NGỮ CẢNH của khung. Ba lý do chọn
   React context thay vì thêm prop:

   ① Thêm field vào `ScreenProps` là đổi hợp đồng với 6 team màn (test
      `contract.test.ts` canh bảng này) — và màn nào không quan tâm thì vẫn phải
      nhận prop mới.
   ② Đổi `?file=` KHÔNG được remount nội dung (rủi ro FE2-PLAN §6). Context đọc ở
      đúng chỗ cần, không đổi `key` của cây con.
   ③ Màn có thể **không** dùng: bỏ qua context thì hành vi y như trước lượt E1 —
      không màn nào vỡ vì chưa kịp nối.

   ⚠️ ĐÂY LÀ BỘ LỌC ĐỌC, KHÔNG PHẢI BỘ LỌC GHI. `sheetIds` chỉ dùng để CHỌN CÁI GÌ
   HIỆN RA. Tuyệt đối không được dùng để dựng contract đem lưu: lọc contract rồi
   `PUT` là xoá sheet của người ta — đúng kiểu mất dữ liệu mà §4.2 cấm
   ("xoá file con không bao giờ xoá sheet/ảnh").
*/
import { ALL_SHEETS_DOC_ID } from "@/features/docs/lib/types";
import type { JobStatus } from "@/lib/status";

export interface FileScope {
  /** id file con đang mở. Tab ảo «Tất cả sheet» ⇒ `ALL_SHEETS_DOC_ID`. */
  docId: string;
  docName: string;
  kind: "workflow" | "canvas";
  /** `true` khi đang ở file hệ thống «Tất cả sheet» ⇒ KHÔNG lọc gì. */
  all: boolean;
  /**
   * Bộ lọc sheet của file workflow. `null` = không lọc (file ảo, file canvas, hoặc
   * file workflow có `view.sheetIds` rỗng — rỗng nghĩa là "chưa chọn", và một bộ
   * lọc rỗng làm màn trống trơn thì tệ hơn là không lọc).
   */
  sheetIds: readonly string[] | null;
  /**
   * `true` khi danh sách file con CHƯA tải xong ⇒ `docId` hiện tại chỉ là giá trị tạm
   * (tab ảo). Route canvas phải chờ, không được kết luận "không tìm thấy file" sớm —
   * nhấp một khối lỗi rồi rút lại là kiểu hỏng gây hoang mang nhất.
   */
  resolving: boolean;
  /** Mở tab ảo «Tất cả sheet» — đường lùi luôn có, để không bao giờ mắc trong một bộ lọc. */
  openAllSheets: () => void;
}

const FileScopeContext = React.createContext<FileScope | null>(null);

export const FileScopeProvider = FileScopeContext.Provider;

/** `null` khi màn không nằm trong ngữ cảnh project (S0/S1/S6) hoặc khung chưa nối. */
export function useFileScope(): FileScope | null {
  return React.useContext(FileScopeContext);
}

/**
 * Lọc một danh sách id sheet theo phạm vi file. Một cửa duy nhất để mọi màn lọc
 * GIỐNG NHAU — và để bất biến §4.5 kiểm được bằng test thuần hàm:
 *   · không có phạm vi / phạm vi «Tất cả sheet» ⇒ trả nguyên vẹn;
 *   · lọc xong rỗng ⇒ **trả nguyên vẹn** thay vì màn trắng (sheet của file đã bị
 *     xoá khỏi contract là ca thật; lúc đó thà hiện đủ còn hơn hiện không gì);
 *   · thứ tự của contract được giữ, không sắp lại theo `sheetIds`.
 */
export function scopeSheetIds<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  scope: FileScope | null,
): T[] {
  const wanted = scope?.sheetIds;
  if (!wanted || wanted.length === 0) return [...items];
  const set = new Set(wanted);
  const kept = items.filter((it) => set.has(idOf(it)));
  return kept.length > 0 ? kept : [...items];
}

/**
 * Sheet nào đang có lượt chạy — dữ liệu cho dòng cảnh báo C-01 của dialog xoá file
 * (`NEEDS-fe2-c.md` N7: *"E1 truyền `runningSheetIds` lấy từ `project.state.jobs`"*).
 *
 * VÌ SAO PHẢI ĐỐI CHIẾU VỚI `sheetIds` CHỨ KHÔNG CẮT CHUỖI: khoá job là
 * `<variantId>-<sheetId>` và **cả hai** phần đều được chứa dấu `-`
 * (`pose-lan-main`). Cắt ở dấu `-` đầu hay cuối đều sai với dữ liệu thật trong
 * `styles.json` (`pose-lan`, `pose-soc`, `pose-taxi`). Nên ta hỏi ngược: sheet nào
 * trong contract là **hậu tố** của một khoá job đang chạy.
 *
 * Chỉ tính `running`/`queued` — đó đúng là hai trạng thái mà câu cảnh báo
 * *"lượt này vẫn chạy tiếp"* nói tới. FE **không bao giờ** gọi cancel (§4.4).
 */
export function runningSheetIdsOf(
  jobs: Readonly<Record<string, JobStatus>> | undefined | null,
  sheetIds: readonly string[],
): string[] {
  if (!jobs) return [];
  const active = Object.entries(jobs)
    .filter(([, st]) => st === "running" || st === "queued")
    .map(([key]) => key);
  if (active.length === 0) return [];
  return sheetIds.filter((sid) => active.some((key) => key === sid || key.endsWith(`-${sid}`)));
}

/** Màn nào được gắn thanh tab file con: đúng 6 màn trong ngữ cảnh project (= `HAS_RAIL`). */
export function hasFileTabs(screen: ScreenId): boolean {
  return HAS_RAIL.has(screen);
}

export { ALL_SHEETS_DOC_ID };

/* ══════════════════════════════════════════════════════════════════════════
   FE-2 · E1 — MÔI TRƯỜNG KHUNG (`ShellEnv`)
   ══════════════════════════════════════════════════════════════════════════

   Hai thứ mà màn canvas cần nhưng KHÔNG được tự đi lấy:

   ① `agentOffline` — trạng thái agent là việc của KHUNG, không phải của từng màn.
      (Trước đây đây còn là chuyện lưu lượng: `useAgentStatus()` mỗi lần gọi dựng một
      vòng probe riêng ⇒ mỗi route mount thêm là nhân số request `/health`. Nay vòng
      probe đã gộp về một, dùng chung — `lib/api/health-probe.ts` — nên gọi thêm không
      còn tốn request; lý do tách vẫn còn nguyên: màn canvas không tự đi lấy môi trường.)
   ② `agentCommand` — lệnh chạy công cụ local phụ thuộc entry (`RUN_CMD` vs
      `RUN_CMD_REPO`), chỉ khung biết. Đây đúng là đề nghị N4 của `NEEDS-fe2-d.md`.

   Tách khỏi `FileScope` có chủ ý: trạng thái agent không phải thuộc tính của file con.
   Gộp hai thứ vào một context sẽ khiến mọi consumer của scope render lại mỗi lần
   nhịp probe đổi.
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

/** id sheet của contract, hoặc `[]` khi chưa đọc được (KHÔNG phải lỗi của thanh tab). */
export function contractSheetIdsOf(
  contract: { sheets?: readonly { id: string }[] } | null | undefined,
): string[] {
  return (contract?.sheets ?? [])
    .map((s) => s.id)
    .filter((id) => typeof id === "string" && id !== "");
}
