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
  /* MỘT MÀN, MỘT ĐƯỜNG. Cả năm hàm dưới đây từng trỏ vào năm màn khác nhau của
     trình quản lý dự án đời cũ; các màn ấy đã bị gỡ và route của chúng nay chỉ
     còn chuyển hướng về `/k/:id`. Trả thẳng `/k/:id` ở đây để không có link nào
     trong app đi vòng qua một trạm trung chuyển. */
  project: (id: string) => `/k/${pid(id)}`,
  design: (id: string, _tab: "sheets" | "styles" | "advanced" = "sheets") => `/k/${pid(id)}`,
  runs: (id: string) => `/k/${pid(id)}`,
  trash: () => "/trash",
  /** File con của dự án — vẫn có route riêng, và route ấy tự chuyển về khu soạn. */
  file: (id: string, fileId: string) => `/p/${pid(id)}/f/${pid(fileId)}`,
} as const;

export interface ProjectNav {
  /** Mở dự án — khu soạn prompt, màn làm việc duy nhất. */
  open: (id: string) => void;
  /** Ý ĐỊNH «xem thành phẩm». Nay thành phẩm nằm ngay dưới chân từng thẻ của khu soạn. */
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
 * MỞ MỘT DỰ ÁN TỪ MÀN HOME.
 *
 * Ba nhánh nay cùng ra một chỗ (`/k/:id`) vì app chỉ còn một màn làm việc — và ba
 * nhánh ấy VẪN ĐƯỢC GIỮ. Chúng ghi lại câu hỏi *"dự án này đã có thành phẩm chưa"*,
 * thứ mà thẻ ở màn Home vẫn hỏi (`KitCard` dùng `hasGeneratedOutput` để quyết định
 * có chạy ảnh bìa động không). Rút gọn thành một dòng `toKit(id)` là xoá câu hỏi đó
 * khỏi mã, và người sau sẽ phải nghĩ lại từ đầu khi cần nó.
 */
export function openProjectWith(
  nav: ProjectNav,
  project: { id: string; tags?: unknown } & GeneratedOutputInput,
): void {
  if (readMode(project) === "canvas") nav.navigateCanvas(project.id);
  else if (hasGeneratedOutput(project)) nav.openImages(project.id);
  else nav.open(project.id);
}

/**
 * ══ TÁM CỬA, MỘT ĐÍCH ══════════════════════════════════════════════════════
 * Tám hàm dưới đây từng dẫn tới tám màn: tổng quan · kết quả · wizard · bàn làm
 * việc · bản thiết kế · phong cách · lượt chạy. App nay chỉ còn MỘT màn làm việc
 * (`/k/:id` — khu soạn prompt), nên tất cả đều về đó.
 *
 * VÌ SAO KHÔNG GỘP CHÚNG LẠI THÀNH MỘT HÀM: mỗi tên vẫn nói một Ý ĐỊNH khác nhau
 * ở nơi gọi (*"vừa nhân bản xong, mở phong cách của bản sao"* ≠ *"mở dự án"*), và
 * ngày nào app có lại một màn thứ hai thì chỗ phải sửa là file này, không phải hai
 * chục chỗ gọi. Xoá tên đi là xoá luôn thông tin ấy khỏi mã.
 */
export function createNav(navigate: Navigate): ProjectNav {
  const toKit = (projectId: string) => void navigate({ to: "/k/$projectId", params: { projectId } });
  return {
    open: toKit,
    openImages: toKit,
    openWizard: toKit,
    navigateCanvas: toKit,
    openDesign: (id) => toKit(id),
    openStyles: toKit,
    openRuns: toKit,
    openTrash: () => void navigate({ to: "/trash" }),
    openFile: (projectId, fileId) => {
      void navigate({ to: "/p/$projectId/f/$fileId", params: { projectId, fileId } });
      return true;
    },
  };
}
