/**
 * features/project/lib/nav.ts — ĐIỀU HƯỚNG rời khỏi S2 / S2b.
 *
 * Khác S1 (`features/projects/lib/nav.ts` phải dùng `navigate({href})` vì lúc đó
 * cây route chưa có `/p/$projectId`): TẠI THỜI ĐIỂM VIẾT FILE NÀY `src/routeTree.ts`
 * đã khai đủ 6 route trong ngữ cảnh project, nên ở đây dùng `to:` + `params:` để
 * LẤY LẠI KIỂM KIỂU — gõ sai tên route hay thiếu param là lỗi biên dịch, không
 * phải một cú bấm chết lặng lúc chạy.
 *
 * Gom vào một chỗ để hai màn (S2, S2b) không mọc ra hai cách đi cùng một nơi.
 */
import type { useNavigate } from "@tanstack/react-router";
import type { DesignTab } from "@/routes/search-schemas";

type Navigate = ReturnType<typeof useNavigate>;

export interface ProjectNav {
  /** S1 — sau khi xoá project thì không còn chỗ nào để ở lại. */
  toProjects: () => void;
  /** S2 tổng quan. */
  toOverview: () => void;
  /** S2b cài đặt project. */
  toSettings: () => void;
  /**
   * S3 trình soạn. `sheetId` mở đúng sheet đó (deep-link của ma trận tiến độ —
   * `designSearchSchema` đã có sẵn tham số `sheet`, không phải tôi bịa thêm).
   */
  toDesign: (tab?: DesignTab, sheetId?: string, variantId?: string) => void;
  /** S4 danh sách lượt chạy. */
  toRuns: () => void;
  /** S4d một lượt chạy. */
  toRun: (runId: string) => void;
  /** S5 thư viện kit. */
  toKit: (variantId?: string) => void;
  /** S6 tab môi trường — đích của lỗi IMAGEGEN_UNAVAILABLE. */
  toEnvSettings: () => void;
  /** S6 tab thùng rác — nơi project vừa xoá đang nằm. */
  toTrash: () => void;
}

export function createProjectNav(navigate: Navigate, projectId: string): ProjectNav {
  const params = { projectId };
  return {
    toProjects: () => void navigate({ to: "/" }),
    toOverview: () => void navigate({ to: "/p/$projectId", params }),
    toSettings: () => void navigate({ to: "/p/$projectId/settings", params }),
    toDesign: (tab = "sheets", sheetId, variantId) =>
      void navigate({
        to: "/p/$projectId/design",
        params,
        search: {
          tab,
          ...(sheetId ? { sheet: sheetId } : {}),
          ...(variantId ? { variant: variantId } : {}),
        },
      }),
    toRuns: () => void navigate({ to: "/p/$projectId/runs", params, search: {} }),
    toRun: (runId) => void navigate({ to: "/p/$projectId/runs/$runId", params: { projectId, runId } }),
    toKit: (variantId) =>
      void navigate({
        to: "/p/$projectId/kit",
        params,
        search: { tab: "assets", ...(variantId ? { variant: variantId } : {}) },
      }),
    toEnvSettings: () => void navigate({ to: "/settings", search: { tab: "env" } }),
    toTrash: () => void navigate({ to: "/trash" }),
  };
}
