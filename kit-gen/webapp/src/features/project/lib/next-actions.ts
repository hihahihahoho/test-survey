/**
 * features/project/lib/next-actions.ts — THẺ "VIỆC TIẾP THEO" (§3-S2 mục 2).
 *
 * Mục đích của cả màn S2 là "trong 5 giây trả lời: project này đang ở đâu, việc
 * tiếp theo là gì, bấm đâu để làm". Thẻ này là câu trả lời — nên nó KHÔNG được
 * đoán: mỗi dòng phải suy từ trạng thái THẬT (`project.state` + bản thiết kế),
 * và mỗi dòng phải kèm ĐÚNG MỘT hành động chính đưa tới chỗ cần làm.
 *
 * Thứ tự ưu tiên phản ánh mức cấp bách VÀ chi phí, không phải thứ tự bảng chữ:
 *   0. chưa có sheet / chưa có phong cách  → không có gì gen được, phải sửa thiết kế
 *   1. đang chạy                           → đừng mời user bấm thêm, mời họ đi xem
 *   2. lỗi                                 → mất quota rồi mà không có ảnh
 *   3. cần sinh lại (thiết kế đã đổi)      → TỐN QUOTA, nhưng ảnh hiện tại đã sai
 *   4. cần cắt                             → RẺ (không quota), làm được ngay
 *   5. chưa gen lần nào                    → tốn quota nhiều nhất, để cuối
 * §3-S2 chốt "tối đa 3 dòng" ⇒ cắt còn 3.
 *
 * Thuần khiết: không React, không I/O. Copy tiếng Việt lấy nhãn dài từ §5.7 qua
 * `lib/status.ts` để không lệch giọng với badge (§7.5-U5).
 */
import type { JobStatus } from "@/lib/status";
import type { Project } from "@/lib/types";
import { cellNames, cellsInStatus, type MatrixCell, type ProgressMatrix } from "./matrix";

/** Hành động của một dòng — màn map sang nút thật, KHÔNG tự nghĩ nhãn khác. */
export type NextActionKind =
  | "design-sheets" // mở trình soạn, tab Sheet & element
  | "design-styles" // mở trình soạn, tab Phong cách
  | "runs" // sang màn theo dõi lượt chạy
  | "gen" // mở modal M1 với đúng tập lượt này
  | "slice"; // chạy cắt cho đúng tập lượt này

export interface NextAction {
  /** id ổn định để test tìm dòng và làm key React. */
  id: string;
  status: JobStatus;
  /** Câu chính — người thật đọc hiểu, không thuật ngữ kỹ thuật (§1.3). */
  title: string;
  /** Dòng phụ: liệt kê đúng những lượt liên quan (≤4 tên + "+N"). */
  detail: string;
  kind: NextActionKind;
  /** Tập lượt sinh ảnh của dòng này — rỗng với dòng chỉ điều hướng. */
  jobs: string[];
  /** Nhãn nút chính. Nhãn nêu SỐ LƯỢNG để user biết mình sắp làm gì (§1.1-4). */
  actionLabel: string;
  /** true ⇒ nút này gây thay đổi trên máy ⇒ phải bị khoá khi agent chưa chạy. */
  needsAgent: boolean;
}

const MAX_ROWS = 3;

function row(
  id: string,
  status: JobStatus,
  title: string,
  cells: readonly MatrixCell[],
  kind: NextActionKind,
  actionLabel: string,
  needsAgent: boolean,
): NextAction {
  return {
    id,
    status,
    title,
    detail: cellNames(cells),
    kind,
    jobs: cells.map((c) => c.job),
    actionLabel,
    needsAgent,
  };
}

/**
 * Danh sách việc cần làm. Rỗng ⇒ màn hiện dòng xanh "Mọi thứ đã đồng bộ ✓"
 * (§3-S2 mục 2) — chính vì thế hàm này KHÔNG bịa ra một dòng "không có gì".
 */
export function nextActions(m: ProgressMatrix): NextAction[] {
  // Chưa có gì để sinh: hai ca này loại trừ nhau với mọi ca sau, nên trả về ngay.
  if (m.sheets.length === 0) {
    return [
      {
        id: "no-sheets",
        status: "never",
        title: "Chưa có sheet nào trong bản thiết kế",
        detail: "Thêm element từ thư viện để tạo sheet đầu tiên.",
        kind: "design-sheets",
        jobs: [],
        actionLabel: "Chọn element",
        needsAgent: true,
      },
    ];
  }
  if (m.variants.length === 0) {
    return [
      {
        id: "no-variants",
        status: "never",
        title: "Chưa có phong cách nào",
        detail: "Mỗi phong cách là một bộ màu / art style riêng cho cùng bộ element.",
        kind: "design-styles",
        jobs: [],
        actionLabel: "Thêm phong cách",
        needsAgent: true,
      },
    ];
  }

  const out: NextAction[] = [];
  const busy = [...cellsInStatus(m, "running"), ...cellsInStatus(m, "queued")];
  const failed = cellsInStatus(m, "failed");
  const stale = cellsInStatus(m, "stale");
  const uncut = cellsInStatus(m, "uncut");
  const never = cellsInStatus(m, "never");

  if (busy.length > 0) {
    out.push(
      row(
        "running",
        "running",
        busy.length === 1 ? "Đang sinh ảnh 1 lượt" : `Đang sinh ảnh ${busy.length} lượt`,
        busy,
        "runs",
        "Xem tiến độ",
        false, // chỉ điều hướng ⇒ vẫn bấm được khi agent tắt (đọc từ cache)
      ),
    );
  }
  if (failed.length > 0) {
    out.push(
      row(
        "failed",
        "failed",
        failed.length === 1 ? "1 lượt sinh ảnh bị lỗi" : `${failed.length} lượt sinh ảnh bị lỗi`,
        failed,
        "gen",
        failed.length === 1 ? "Sinh lại 1 lượt" : `Sinh lại ${failed.length} lượt`,
        true,
      ),
    );
  }
  if (stale.length > 0) {
    out.push(
      row(
        "stale",
        "stale",
        `${stale.length} lượt có thiết kế đã đổi sau lần sinh ảnh cuối — nên sinh lại`,
        stale,
        "gen",
        `Sinh ${stale.length} lượt này`,
        true,
      ),
    );
  }
  if (uncut.length > 0) {
    out.push(
      row(
        "uncut",
        "uncut",
        `${uncut.length} lượt có ảnh mới nhưng chưa cắt`,
        uncut,
        "slice",
        uncut.length === 1 ? "Cắt 1 lượt" : `Cắt ${uncut.length} lượt`,
        true,
      ),
    );
  }
  if (never.length > 0) {
    out.push(
      row(
        "never",
        "never",
        `${never.length} lượt chưa sinh ảnh lần nào`,
        never,
        "gen",
        `Sinh ${never.length} lượt này`,
        true,
      ),
    );
  }
  return out.slice(0, MAX_ROWS);
}

/* ═════════════ Cảnh báo "ảnh cũ hơn bản thiết kế" (yêu cầu 3 của brief) ═════════════ */

export interface StaleWarning {
  /** true ⇒ PHẢI hiện dải cảnh báo ở CẢ S2 và S2b. */
  stale: boolean;
  /** Câu 1 dòng, người thật đọc hiểu. `null` khi không có gì cảnh báo. */
  message: string | null;
  /** Câu giải thích hệ quả — vì sao nên xử lý. */
  advice: string | null;
  /** Số lượt cần sinh lại (chỉ đếm được khi có `state.jobs`). */
  staleJobs: string[];
  /** Số lượt có ảnh mới nhưng chưa cắt. */
  uncutJobs: string[];
  /** true ⇒ prompt đã dựng cũ hơn contract; thông tin phụ, không đáng một dòng riêng. */
  promptsStale: boolean;
}

const NO_WARNING: StaleWarning = {
  stale: false,
  message: null,
  advice: null,
  staleJobs: [],
  uncutJobs: [],
  promptsStale: false,
};

/**
 * Trạng thái stale để cảnh báo. Đọc HAI nguồn vì mỗi nguồn hụt một ca:
 *  · `state.jobs` — chính xác tới từng lượt, nhưng agent cũ có thể chưa trả
 *  · `state.staleReason` — luôn có, nhưng chỉ ở mức project
 * Thiếu `state.jobs` thì vẫn cảnh báo được (không đếm số) — thà thiếu con số hơn
 * là im lặng để user gen ra kit lệch với thiết kế.
 *
 * `matrix` có thể là `null` ở S2b (màn đó không nạp bản thiết kế) — hàm vẫn chạy.
 */
export function staleWarning(
  project: Project | null | undefined,
  matrix: ProgressMatrix | null = null,
): StaleWarning {
  if (!project) return NO_WARNING;

  const reasons = project.state?.staleReason ?? [];
  const promptsStale = reasons.includes("contract>prompts");
  const staleJobs = matrix && !matrix.degraded ? cellsInStatus(matrix, "stale").map((c) => c.job) : [];
  const uncut = matrix && !matrix.degraded ? cellsInStatus(matrix, "uncut").map((c) => c.job) : [];

  const contractNewer = reasons.includes("contract>raw") || staleJobs.length > 0;
  const rawNewer = reasons.includes("raw>kits") || uncut.length > 0;
  if (!contractNewer && !rawNewer) return NO_WARNING;

  // Ưu tiên nói về ca ĐẮT hơn trước (sinh lại tốn quota), rồi mới tới ca rẻ.
  const message = contractNewer
    ? staleJobs.length > 0
      ? `Bản thiết kế mới hơn ảnh đã sinh ở ${staleJobs.length} lượt.`
      : "Bản thiết kế mới hơn ảnh đã sinh."
    : uncut.length > 0
      ? `${uncut.length} lượt có ảnh mới nhưng chưa cắt.`
      : "Có ảnh mới chưa được cắt.";

  const advice = contractNewer
    ? "Ảnh và kit đang cắt ra từ bản thiết kế cũ. Sinh lại những lượt đó để khớp (bước này tiêu quota)."
    : "Cắt lại để kit khớp với ảnh mới nhất — bước này không tiêu quota.";

  return { stale: true, message, advice, staleJobs, uncutJobs: uncut, promptsStale };
}
