/**
 * features/projects/lib/delete-guard.ts — CHẶN XOÁ PROJECT KHI ĐANG CHẠY (lỗi C-01).
 *
 * ╔═ LỖI THẬT, ĐÃ ĐO, KHÔNG PHẢI GIẢ ĐỊNH ═════════════════════════════════════╗
 * ║ `teams/qa-web/qa-func.md` C-01, tái hiện 6/8 lần:                          ║
 * ║   "Xoá project trong lúc đang sinh ảnh thì tiến trình nền DỰNG LẠI thư mục  ║
 * ║    project vừa bị xoá ⇒ nút Hoàn tác của toast 10s HỎNG THẬT                ║
 * ║    (409 PROJECT_ID_TAKEN)."                                                 ║
 * ║                                                                             ║
 * ║ Đây là ca xấu nhất trong cả sản phẩm: user mất project, bấm [Hoàn tác] —    ║
 * ║ thứ ta hứa là đường lùi — và nó báo lỗi. Vừa mất dữ liệu vừa mất niềm tin.  ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * PHÂN VAI RÕ RÀNG:
 *   · Agent phải dừng run TRƯỚC khi move (QA LEAD nói đã vá) — không phải việc của UI.
 *   · UI KHÔNG ĐƯỢC coi bản vá đó là chắc chắn. Hai lớp của tôi:
 *       (a) CẢNH BÁO TRƯỚC, nêu đích danh lượt đang chạy và mời dừng nó trước;
 *       (b) `DeleteProjectDialog` của S1 đã bắt lỗi [Hoàn tác] và chỉ sang Thùng rác.
 *
 * Module này thuần khiết (không React, không I/O) để S1/S2b dùng lại được và để
 * test bằng Node. Nó KHÔNG tự chặn — nó trả *sự thật* để màn quyết định; chặn cứng
 * là việc của UI, và §2.5-2 cấm ẩn nút.
 */
import type { Project } from "@/lib/types";

export interface ActiveRunWarning {
  /** true ⇒ project đang có lượt chạy: PHẢI cảnh báo trước khi xoá/dọn/nhập. */
  hasActiveRun: boolean;
  runId: string | null;
  done: number;
  total: number;
  /** Câu cảnh báo tiếng Việt, sẵn sàng hiện — mọi màn dùng CHUNG một câu. */
  message: string | null;
  /** Câu giải thích vì sao nên dừng trước, thay vì xoá thẳng. */
  advice: string | null;
}

const NONE: ActiveRunWarning = {
  hasActiveRun: false,
  runId: null,
  done: 0,
  total: 0,
  message: null,
  advice: null,
};

/**
 * Phát hiện project đang chạy từ `project.state`.
 *
 * Nhìn HAI nguồn, vì mỗi nguồn hụt một ca:
 *   · `state.activeRun.runId` — chính xác nhất, nhưng agent có thể chưa kịp cập nhật
 *   · `state.jobs` có `running`/`queued` — bắt được ca run vừa khởi động
 * Thà cảnh báo thừa một lần còn hơn để lọt đúng ca đã đốt cháy dữ liệu của QA.
 */
export function activeRunWarning(project: Project | null | undefined): ActiveRunWarning {
  if (!project) return NONE;
  const ar = project.state?.activeRun;
  const jobs = Object.values(project.state?.jobs ?? {});
  const busyJobs = jobs.some((s) => s === "running" || s === "queued");
  const runId = ar?.runId ?? null;
  if (!runId && !busyJobs) return NONE;

  const done = Number(ar?.done ?? 0);
  const total = Number(ar?.total ?? 0);
  const where = runId ? `lượt ${runId}` : "một lượt sinh ảnh";
  const progress = total > 0 ? ` (${done}/${total})` : "";

  return {
    hasActiveRun: true,
    runId,
    done,
    total,
    /* Wireframe §4.4 đòi nói rõ "lượt đó SẼ BỊ DỪNG" (agent tự cancel trước khi move).
       Đó là hậu quả TRỰC TIẾP user phải biết; phần C-01 ở `advice` là hậu quả GIÁN TIẾP.
       Bỏ vế đầu đi là bớt thông tin so với spec — đã có ca test khoá câu này. */
    message: `Project này đang chạy ${where}${progress} — lượt đó sẽ bị dừng.`,
    advice:
      "Hãy dừng lượt đó trước rồi hãy xoá. Xoá khi đang chạy có thể làm tiến trình nền " +
      "dựng lại thư mục vừa xoá, khiến nút Hoàn tác không dùng được.",
  };
}

/**
 * Nhiều project cùng lúc (thao tác xoá hàng loạt ở S1).
 * Trả về danh sách project đang bận + câu gộp.
 */
export function activeRunWarnings(projects: readonly Project[]): {
  busy: Project[];
  message: string | null;
  advice: string | null;
} {
  const busy = projects.filter((p) => activeRunWarning(p).hasActiveRun);
  if (busy.length === 0) return { busy: [], message: null, advice: null };
  const names = busy.map((p) => `«${p.name}»`).join(", ");
  return {
    busy,
    message:
      busy.length === 1
        ? `${names} đang chạy một lượt sinh ảnh.`
        : `${busy.length} project đang chạy lượt sinh ảnh: ${names}.`,
    advice:
      "Hãy dừng các lượt đó trước. Xoá khi đang chạy có thể làm nút Hoàn tác không dùng được.",
  };
}
