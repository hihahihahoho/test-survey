/**
 * features/projects/lib/nav.ts — ĐIỀU HƯỚNG rời khỏi S1.
 *
 * Route tree đã đủ nên mọi điều hướng dùng `to` + `params` có kiểm kiểu.
 */

import type { useNavigate } from "@tanstack/react-router";
import { readMode } from "@/features/kitfile/lib/kit-mode";

type Navigate = ReturnType<typeof useNavigate>;

const pid = (id: string) => encodeURIComponent(id);

export const PATHS = {
  projects: () => "/",
  project: (id: string) => `/p/${pid(id)}`,
  design: (id: string, tab: "sheets" | "styles" | "advanced" = "sheets") => `/p/${pid(id)}/design?tab=${tab}`,
  runs: (id: string) => `/p/${pid(id)}/runs`,
  settingsTrash: () => "/settings?tab=trash",
  /** FE-2·B1: đích thật của file con. Route do E1 đăng ký (`/p/:projectId/f/:fileId`). */
  file: (id: string, fileId: string) => `/p/${pid(id)}/f/${pid(fileId)}`,
} as const;

export interface ProjectNav {
  /** Mở project (S2 tổng quan). */
  open: (id: string) => void;
  navigateCanvas: (id: string) => void;
  /** Sau khi tạo template `blank`: việc tiếp theo chắc chắn là chọn element (§4.1-4). */
  openDesign: (id: string, tab?: "sheets" | "styles" | "advanced") => void;
  /** Sau khi nhân bản: mở phong cách của bản sao (§4.3). */
  openStyles: (id: string) => void;
  /** Nút [Xem lượt đang chạy] của RUN_CONFLICT / RUN_ACTIVE. */
  openRuns: (id: string) => void;
  /** Footer "Thùng rác N project ›" (§3-S1-5). */
  openTrash: () => void;
  /**
   * FE-2·B1 — mở FILE CON vừa tạo.
   *
   * ⚠️ GIẢI PHÁP TẠM CÓ CHỦ Ý, không phải quên: route `/p/:projectId/f/:fileId`
   * thuộc glob của nhánh E (FE2-PLAN §1) và CHƯA tồn tại trong `routeTree`. Điều
   * hướng tới nó bây giờ sẽ ném lỗi router. Vì vậy bản tạm đưa người dùng về màn
   * project (đường an toàn, không trắng trang) và trả `false` để nơi gọi biết là
   * chưa mở đúng file mà nói thật với người dùng.
   * TODO(E1): khi route có thật, đổi thân hàm sang `navigate({to:"/p/$projectId/f/$fileId"})`
   *           và trả `true`. Không component nào phải sửa theo.
   */
  openFile: (projectId: string, fileId: string) => boolean;
}

/**
 * MỞ MỘT BỘ KIT — vào ĐÚNG PHÒNG của nó (UPGRADE-PLAN §W1-8).
 *
 * Bệnh cũ: `openKit` luôn gọi `nav.open()` ⇒ `/p/:id` ⇒ redirect `/k/:id` ⇒ **luôn** là
 * màn workflow, bất kể bộ kit được tạo ở hình thái 🎨 bàn làm việc. Hệ quả: bàn làm việc
 * chỉ vào được đúng một lần ngay sau khi tạo; sau đó nội dung vẫn nằm trong IndexedDB
 * nhưng KHÔNG CÒN ĐƯỜNG TỚI.
 *
 * Sửa cái cửa, không hạ cấp căn phòng (§Đ3). `readMode` mặc định `workflow` khi tag
 * thiếu/mâu thuẫn, nên đường cũ vẫn là đường mặc định.
 */
export function openKitWith(nav: ProjectNav, project: { id: string; tags?: unknown }): void {
  if (readMode(project) === "canvas") nav.navigateCanvas(project.id);
  else nav.open(project.id);
}

export function createNav(navigate: Navigate): ProjectNav {
  return {
    open: (id) => void navigate({ to: "/p/$projectId", params: { projectId: id } }),
    navigateCanvas: (id) => void navigate({ to: "/k/$projectId/canvas", params: { projectId: id } }),
    openDesign: (id, tab = "sheets") => void navigate({ to: "/p/$projectId/design", params: { projectId: id }, search: { tab } }),
    openStyles: (id) => void navigate({ to: "/p/$projectId/design", params: { projectId: id }, search: { tab: "styles" } }),
    openRuns: (id) => void navigate({ to: "/p/$projectId/runs", params: { projectId: id } }),
    openTrash: () => void navigate({ to: "/settings", search: { tab: "trash" } }),
    openFile: (projectId, fileId) => {
      void fileId;
      void navigate({ to: "/k/$projectId/canvas", params: { projectId } });
      return true;
    },
  };
}
