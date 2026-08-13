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
  trash: () => "/trash",
  /** Đích thật của file bàn làm việc trong dự án. */
  file: (id: string, fileId: string) => `/p/${pid(id)}/f/${pid(fileId)}`,
} as const;

export interface ProjectNav {
  /** Mở project (S2 tổng quan). */
  open: (id: string) => void;
  /** Mở THẲNG trang kết quả `?section=images` — đích của một dự án đã có ảnh. */
  openImages: (id: string) => void;
  openWizard: (id: string) => void;
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

/** Mảnh `Project` mà `hasGeneratedOutput` thật sự đọc — khai tường minh để test khỏi dựng cả object. */
export interface GeneratedOutputInput {
  stats?:
    | {
        rawPresent?: number | undefined;
        kitsCut?: number | undefined;
        lastRun?: { id?: string | undefined } | null | undefined;
      }
    | undefined;
}

/**
 * DỰ ÁN NÀY ĐÃ CÓ THÀNH PHẨM CHƯA?
 *
 * Ba nguồn, gặp cái nào đúng là đủ (agent đời cũ có thể thiếu một trong ba):
 *   · `kitsCut`     — số ô đã cắt, thứ tab "Ảnh thật" vẽ ra
 *   · `rawPresent`  — số sheet thô đã có, thứ tab "Ảnh gốc" vẽ ra
 *   · `lastRun`     — đã từng chạy một lượt tạo
 *
 * ⚠️ ĐÂY LÀ CÂU HỎI ĐÚNG, `workflow.completed` LÀ CÂU HỎI SAI. Cờ `completed` chỉ nói
 * "bản nháp wizard đã đóng dấu hay chưa", và `WorkflowScreen` ghi `completed: false`
 * mỗi lần store đổi (autosave 600ms) — nên chỉ cần mở lại wizard của một dự án đã gen
 * xong là nó thành "chưa xong" vĩnh viễn. Lấy cờ đó làm cửa điều hướng chính là cách
 * một dự án đầy ảnh bị đá về bước "Kiểm tra" như dự án trắng.
 */
export function hasGeneratedOutput(project: GeneratedOutputInput | null | undefined): boolean {
  const s = project?.stats;
  if (!s) return false;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return n(s.kitsCut) > 0 || n(s.rawPresent) > 0 || Boolean(s.lastRun);
}

/**
 * MỞ MỘT DỰ ÁN TỪ MÀN HOME — vào phòng có đồ, không vào phòng trống.
 *
 * Dự án đã có ảnh ⇒ trang kết quả `?section=images` (thứ người dùng bấm thẻ để xem).
 * Dự án chưa gen bao giờ ⇒ wizard, vì ở đó chưa có gì để xem cả.
 */
export function openProjectWith(
  nav: ProjectNav,
  project: { id: string; tags?: unknown } & GeneratedOutputInput,
): void {
  if (readMode(project) === "canvas") nav.navigateCanvas(project.id);
  else if (hasGeneratedOutput(project)) nav.openImages(project.id);
  else nav.open(project.id);
}

export function createNav(navigate: Navigate): ProjectNav {
  return {
    open: (id) => void navigate({ to: "/p/$projectId", params: { projectId: id } }),
    openImages: (id) => void navigate({ to: "/p/$projectId", params: { projectId: id }, search: { section: "images" } }),
    openWizard: (id) => void navigate({ to: "/k/$projectId", params: { projectId: id } }),
    navigateCanvas: (id) => void navigate({ to: "/k/$projectId/canvas", params: { projectId: id } }),
    openDesign: (id, tab = "sheets") => void navigate({ to: "/p/$projectId/design", params: { projectId: id }, search: { tab } }),
    openStyles: (id) => void navigate({ to: "/p/$projectId/design", params: { projectId: id }, search: { tab: "styles" } }),
    openRuns: (id) => void navigate({ to: "/p/$projectId/runs", params: { projectId: id } }),
    openTrash: () => void navigate({ to: "/trash" }),
    openFile: (projectId, fileId) => {
      void navigate({ to: "/p/$projectId/f/$fileId", params: { projectId, fileId } });
      return true;
    },
  };
}
