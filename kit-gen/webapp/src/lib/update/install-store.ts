/**
 * webapp/src/lib/update/install-store.ts — MÁY TRẠNG THÁI của một lượt cập nhật.
 *
 * VÌ SAO LÀ STORE TOÀN CỤC chứ không phải `useState` trong hook:
 * ba chỗ mời cập nhật nằm ở ba nơi có vòng đời khác nhau — nút sidebar, popover header
 * (đóng popover là UNMOUNT), và tab Giới thiệu (rời tab là unmount). Nếu trạng thái "đang
 * cập nhật" sống trong component thì đóng popover = mất luôn màn chờ, mất luôn nhịp poll,
 * và trang không bao giờ tự tải lại. Trạng thái phải sống NGOÀI mọi component; lớp phủ
 * toàn trang được gắn một lần ở `App.tsx` và đọc chính store này.
 *
 * Mọi tác dụng phụ (hỏi xác nhận, gọi agent, chờ, tải lại trang) đều tiêm được qua `deps`
 * ⇒ test chạy được cả luồng mà không cần jsdom, không cần mạng, không cần chờ thật.
 */
import { create } from "zustand";
import { api } from "../api/endpoints";
import { AgentError } from "../api/client";
import { markUpdatePending } from "./pending";
import { waitForUpdatedAgent, type RestartResult, type WaitOptions } from "./restart";

export type UpdatePhase =
  /** không có gì đang diễn ra — lớp phủ KHÔNG tồn tại. */
  | "idle"
  /** đã gửi `POST /api/update`, đang chờ agent nhận việc. */
  | "installing"
  /** agent đã nhận (202) và đang tự thay mình — ta đang poll `/health`. */
  | "waiting"
  /** quá hạn mà chưa thấy bản mới ⇒ nhường quyền quyết định lại cho user. */
  | "timeout"
  /** ngay cả yêu cầu cập nhật cũng không gửi được. */
  | "failed";

export interface UpdateInstallDeps {
  confirm: (message: string) => boolean;
  install: () => Promise<{ previousVersion?: string | null }>;
  wait: (opts: WaitOptions) => Promise<RestartResult>;
  mark: typeof markUpdatePending;
  reload: () => void;
}

export interface UpdateInstallState {
  phase: UpdatePhase;
  /** bản đích, để lớp phủ nói được "Đang cập nhật lên bản 2.2.0…". */
  targetVersion: string | null;
  /** câu giải thích cho ca `failed`/`timeout` — tiếng Việt, không phải lỗi thô của Node. */
  message: string | null;
  start: (latestVersion?: string | null, deps?: Partial<UpdateInstallDeps>) => Promise<void>;
  /** user đóng lớp phủ ở ca hỏng — KHÔNG dùng được lúc đang cài (đó là cả mục đích). */
  dismiss: () => void;
  /** chỉ dùng trong test. */
  _reset: () => void;
}

const defaultDeps: UpdateInstallDeps = {
  confirm: (m) => (typeof window === "undefined" ? false : window.confirm(m)),
  install: () => api.system.installUpdate(),
  wait: waitForUpdatedAgent,
  mark: markUpdatePending,
  reload: () => window.location.reload(),
};

function reasonOf(e: unknown): string {
  if (e instanceof AgentError && e.reachedAgent) {
    return "Công cụ local đã nhận yêu cầu nhưng từ chối cài bản mới.";
  }
  return "Không gửi được yêu cầu cập nhật tới công cụ local — có vẻ nó vừa dừng.";
}

export const useUpdateInstall = create<UpdateInstallState>((set, get) => ({
  phase: "idle",
  targetVersion: null,
  message: null,

  start: async (latestVersion, overrides) => {
    const d = { ...defaultDeps, ...overrides };
    // Bấm ở sidebar rồi bấm tiếp ở popover KHÔNG được thành hai lượt cài chồng nhau.
    if (get().phase !== "idle") return;

    const target = latestVersion ?? null;
    const label = target ? `lên ${target}` : "lên bản mới";
    // Cập nhật làm công cụ local khởi động lại ⇒ cắt ngang việc user đang làm ⇒ luôn hỏi trước.
    if (!d.confirm(`Cập nhật KitGen ${label}? Công cụ local sẽ khởi động lại sau khi cài.`)) return;

    set({ phase: "installing", targetVersion: target, message: null });

    let previousVersion: string | null = null;
    try {
      const res = await d.install();
      previousVersion = typeof res?.previousVersion === "string" ? res.previousVersion : null;
    } catch (e) {
      set({ phase: "failed", message: reasonOf(e) });
      return;
    }

    /* GHI Ý ĐỊNH TRƯỚC KHI CHỜ, không phải trước khi reload: từ giây này trở đi trang có
       thể biến mất bất cứ lúc nào (user đóng tab, agent kéo sập cả bundle đang phục vụ). */
    d.mark({ targetVersion: target, fromVersion: previousVersion });
    set({ phase: "waiting" });

    const r = await d.wait({ targetVersion: target, fromVersion: previousVersion });
    if (r.outcome === "timeout") {
      set({
        phase: "timeout",
        message: "Công cụ local chưa khởi động lại sau 90 giây.",
      });
      return;
    }
    /* `unchanged` (cài xong mà version y nguyên) VẪN tải lại: app phải đọc lại trạng thái
       thật thay vì đoán, và bản ghi ý định ở trên sẽ biến thành câu "chưa thành công". */
    d.reload();
  },

  dismiss: () => {
    const phase = get().phase;
    if (phase === "installing" || phase === "waiting") return; // đang cài thì không có nút thoát
    set({ phase: "idle", targetVersion: null, message: null });
  },

  _reset: () => set({ phase: "idle", targetVersion: null, message: null }),
}));

/** Lớp phủ chặn cả app khi phase là một trong bốn cái này. */
export function isUpdateBlocking(phase: UpdatePhase): boolean {
  return phase !== "idle";
}

/** Đang thao tác với agent ⇒ không cho đóng, không cho bấm gì. */
export function isUpdateRunning(phase: UpdatePhase): boolean {
  return phase === "installing" || phase === "waiting";
}
