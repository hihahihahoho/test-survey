/**
 * features/kitfile/lib/kit-status.ts — TRẠNG THÁI MỘT DÒNG của một bộ kit.
 *
 * NGUỒN: UX-V3 §1.3 (thẻ Home có ĐÚNG 1 dòng trạng thái, chọn 1 trong 5 chuỗi) ·
 *        BA-V3 §1.4 hàng "Trạng thái 1 chữ" (thứ tự suy: `activeRun` → `stats.rawPresent===0`
 *        → `state.stale` → còn lại) · FE3-PLAN §3-S1 (chèn "lỗi" trước "xong").
 *
 * BA LUẬT:
 *  1. **Thuần hàm, không React, không API.** Nhận `Project` (hoặc mảnh của nó) → trả dữ liệu.
 *  2. **Không bao giờ ném.** Dữ liệu vào từ đĩa/agent, thiếu trường là chuyện bình thường
 *     (`project.json` mới tạo có `contract.hash: null`, `stats`/`state` là `optional`).
 *     Thiếu hết ⇒ «Chưa vẽ», không phải màn trắng.
 *  3. **Không tự chế chữ ở màn.** Mọi màn đọc `deriveStatus(...).label`. Chuỗi gốc nằm ở `copy.ts`.
 *
 * ⚠️ MỘT ĐIỀU NÓI THẬT VỀ THỨ TỰ ƯU TIÊN — đọc trước khi sửa:
 *  Thứ tự dưới đây đặt `activeRun` TRƯỚC lỗi và stale, đúng chữ FE3-PLAN §3-S1. Hệ quả có thật:
 *  một bộ kit vừa có tấm lỗi ở lần trước, vừa đang vẽ lại, sẽ hiện «Đang vẽ 2/6» chứ không hiện lỗi.
 *  Đó là CHỦ Ý (việc đang diễn ra quan trọng hơn việc đã qua, và thẻ chỉ có một dòng), không phải bỏ sót.
 *  Số tấm lỗi vẫn đọc được qua `failedJobs` để màn hiện thêm dấu ⚠ nếu muốn.
 *  Khác với `features/projects/lib/view.ts#projectState` (7 trạng thái job, ưu tiên failed trước) —
 *  hai hàm phục vụ hai màn khác nhau, KHÔNG hợp nhất được mà không đổi một trong hai spec.
 */
import { relTime } from "@/lib/format";
import type { Tone } from "@/lib/status";

/** 5 trạng thái của UX-V3 §1.3. Id không dấu để dùng làm khoá/`data-*`. */
export const KIT_STATUSES = ["dang-ve", "xong", "chua-ve", "can-ve-lai", "ve-loi"] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];

/** Mảnh `Project` mà hàm này thật sự đọc — khai tường minh để test không phải dựng cả object. */
export interface KitStatusInput {
  broken?: boolean | undefined;
  updatedAt?: string | null | undefined;
  stats?:
    | {
        rawPresent?: number | undefined;
        jobs?: number | undefined;
        kitsCut?: number | undefined;
        lastRun?: { at?: string | null | undefined; fail?: number | undefined } | null | undefined;
      }
    | undefined;
  state?:
    | {
        stale?: boolean | undefined;
        jobs?: Record<string, string> | undefined;
        activeRun?:
          | { done?: number | undefined; total?: number | undefined; failed?: number | undefined }
          | null
          | undefined;
      }
    | undefined;
}

export interface KitStatusView {
  status: KitStatus;
  /** Chuỗi ĐÚNG như UX-V3 §1.3, đã Việt hoá và đã nhét số: «Đang vẽ 2/6», «Xong · 2 giờ trước». */
  label: string;
  /** Câu dài cho `title`/`aria-label` — nói thêm việc cần làm, vẫn không có chữ kỹ thuật. */
  long: string;
  /** tone của `badge.tsx` (đã đo tương phản). Màn KHÔNG tự chọn màu. */
  tone: Tone;
  /** true ⇒ dòng này kèm hành động (Vẽ lại / Bắt đầu vẽ). Màn quyết định nút gì. */
  needsAction: boolean;
  /** Số tấm lỗi đọc được (0 nếu không rõ) — để màn hiện thêm ⚠ khi trạng thái chính là «Đang vẽ». */
  failedJobs: number;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Đếm job `failed` trong `state.jobs`; `state.jobs` có thể thiếu hoặc mang trạng thái lạ. */
function countFailed(p: KitStatusInput): number {
  const jobs = p.state?.jobs;
  let n = 0;
  if (jobs && typeof jobs === "object") {
    for (const v of Object.values(jobs)) if (v === "failed") n += 1;
  }
  // `lastRun.fail` là nguồn thứ hai: dùng khi `state.jobs` không có (agent bản cũ).
  return n > 0 ? n : num(p.stats?.lastRun?.fail);
}

/**
 * Suy trạng thái + chuỗi hiển thị.
 * `now` tiêm được để test thời gian tương đối không phụ thuộc đồng hồ máy.
 */
export function deriveStatus(project: KitStatusInput | null | undefined, now: number = Date.now()): KitStatusView {
  const p: KitStatusInput = project ?? {};
  const failedJobs = countFailed(p);

  // 0. Bộ kit hỏng file mô tả — không suy được gì thêm, và KHÔNG được im lặng.
  if (p.broken === true) {
    return {
      status: "ve-loi",
      label: "Không mở được",
      long: "Không đọc được bộ kit này. Mở thư mục trên máy để xem.",
      tone: "danger",
      needsAction: true,
      failedJobs,
    };
  }

  // 1. Đang chạy — việc đang diễn ra thắng mọi thứ đã qua.
  const active = p.state?.activeRun;
  if (active) {
    const total = num(active.total);
    const done = Math.min(num(active.done), total || Number.MAX_SAFE_INTEGER);
    const label = total > 0 ? `Đang vẽ ${done}/${total}` : "Đang vẽ";
    return {
      status: "dang-ve",
      label,
      long: total > 0 ? `Máy đang vẽ, xong ${done} trên ${total} tấm.` : "Máy đang vẽ.",
      tone: "running",
      needsAction: false,
      failedJobs: num(active.failed) || failedJobs,
    };
  }

  // 2. Chưa có tấm gốc nào ⇒ chưa vẽ lần nào.
  if (num(p.stats?.rawPresent) === 0) {
    return {
      status: "chua-ve",
      label: "Chưa vẽ",
      long: "Bộ kit này chưa vẽ gì. Bấm bắt đầu vẽ để máy chạy.",
      tone: "never",
      needsAction: true,
      failedJobs,
    };
  }

  // 3. Đã sửa thiết kế sau lần vẽ cuối.
  if (p.state?.stale === true) {
    return {
      status: "can-ve-lai",
      label: "Cần vẽ lại",
      long: "Bạn vừa sửa thiết kế, ảnh đang là bản cũ.",
      tone: "stale",
      needsAction: true,
      failedJobs,
    };
  }

  // 4. Có tấm lỗi.
  if (failedJobs > 0) {
    return {
      status: "ve-loi",
      label: failedJobs === 1 ? "Vẽ lỗi 1 tấm" : `Vẽ lỗi ${failedJobs} tấm`,
      long: `Có ${failedJobs} tấm vẽ chưa xong. Xem lý do rồi vẽ lại.`,
      tone: "danger",
      needsAction: true,
      failedJobs,
    };
  }

  // 5. Xong — kèm thời điểm nếu biết. KHÔNG bịa thời gian khi thiếu dữ liệu.
  const at = p.stats?.lastRun?.at ?? p.updatedAt ?? null;
  const rel = at ? relTime(at, now) : "—";
  return {
    status: "xong",
    label: rel === "—" ? "Xong" : `Xong · ${rel}`,
    long: rel === "—" ? "Đã vẽ xong." : `Đã vẽ xong ${rel}.`,
    tone: "ok",
    needsAction: false,
    failedJobs: 0,
  };
}

/** Lọc danh sách theo trạng thái — Home dùng cho chip lọc, không tự viết lại điều kiện. */
export function hasStatus(project: KitStatusInput, status: KitStatus, now?: number): boolean {
  return deriveStatus(project, now).status === status;
}
