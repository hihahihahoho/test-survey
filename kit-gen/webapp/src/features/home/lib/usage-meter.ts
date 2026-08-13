/**
 * features/home/lib/usage-meter.ts — SUY DIỄN THUẦN cho thanh "quota Codex còn lại".
 *
 * Tách khỏi component vì đây là chỗ dễ sai nhất và cũng là chỗ đáng test nhất:
 * chọn cửa sổ nào để hiện, khi nào KHÔNG được hiện, và câu chữ nói ra sự thật gì.
 *
 * BA LUẬT KHÔNG ĐƯỢC PHÁ:
 *  1. KHÔNG BAO GIỜ bịa số. `ok:false` / thiếu `primary` ⇒ trả `null` ⇒ UI ẩn hẳn.
 *     "Chưa biết" và "còn 0%" là hai chuyện khác nhau; vẽ 0% khi chưa biết là nói dối.
 *  2. Số này CŨ BẰNG lượt chạy Codex gần nhất (agent đọc lại rate_limits trong file
 *     rollout, không gọi mạng). Nhãn chi tiết BẮT BUỘC nói mốc quan sát ra.
 *  3. Chỉ số + enum. Không path, không tên phiên, không nội dung hội thoại.
 */
import type { Usage, UsageWindow } from "@/lib/types/api";
import { absTime, relTime } from "@/lib/format";

export interface UsageView {
  /** % CÒN LẠI, đã kẹp về [0,100] và làm tròn 1 số lẻ. */
  remainingPercent: number;
  /** Số nguyên để vẽ và để đọc lên — "còn 98%". */
  remainingLabel: string;
  /** "tuần" · "5 giờ" · "ngày" — danh từ cửa sổ giới hạn, viết thường. */
  windowLabel: string;
  /** "Hạn mức tuần" — nhãn ngắn cạnh thanh. */
  title: string;
  /** "đặt lại 20/08/2026 13:30", hoặc null khi server không nói mốc reset. */
  resetLabel: string | null;
  /** "số đọc lúc 5 phút trước" — luật 2. */
  observedLabel: string;
  /** Câu đầy đủ cho tooltip/`title`, đã gộp mọi thứ trên. */
  detail: string;
  /** Ngưỡng để tô màu. Chỉ là ENUM — màu không bao giờ là thông tin duy nhất (A3). */
  tone: "ok" | "warn" | "danger";
}

/** 10080 phút = 1 tuần. Bảng này chỉ để ĐỌC, không ảnh hưởng số. */
function windowLabelOf(minutes: number | null | undefined): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "hiện tại";
  if (minutes % 10080 === 0) {
    const w = minutes / 10080;
    return w === 1 ? "tuần" : `${w} tuần`;
  }
  if (minutes % 1440 === 0) {
    const d = minutes / 1440;
    return d === 1 ? "ngày" : `${d} ngày`;
  }
  if (minutes % 60 === 0) return `${minutes / 60} giờ`;
  return `${minutes} phút`;
}

function toneOf(remaining: number): UsageView["tone"] {
  if (remaining <= 10) return "danger";
  if (remaining <= 25) return "warn";
  return "ok";
}

/**
 * Chọn cửa sổ để HIỆN: cái nào còn ít nhất thì cái đó mới là thứ sắp chặn người
 * dùng. Codex trả `primary` (thường là tuần) và `secondary` (thường là 5 giờ);
 * hiện cái thoáng hơn sẽ ru ngủ đúng lúc cái kia sắp hết.
 */
export function tightestWindow(data: Usage | null | undefined): UsageWindow | null {
  if (!data?.ok) return null;
  const candidates = [data.primary, data.secondary].filter(
    (w): w is UsageWindow => Boolean(w) && typeof w?.remainingPercent === "number",
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.remainingPercent < a.remainingPercent ? b : a));
}

export function usageView(data: Usage | null | undefined, now: number = Date.now()): UsageView | null {
  const w = tightestWindow(data);
  if (!w) return null;
  const remainingPercent = Math.min(100, Math.max(0, Math.round(w.remainingPercent * 10) / 10));
  const windowLabel = windowLabelOf(w.windowMinutes);
  const remainingLabel = `còn ${Math.round(remainingPercent)}%`;
  const resetLabel = w.resetsAt ? `đặt lại ${absTime(w.resetsAt)}` : null;
  const observedLabel = `số đọc lúc ${relTime(data?.observedAt, now)}`;
  const title = `Hạn mức ${windowLabel}`;
  return {
    remainingPercent,
    remainingLabel,
    windowLabel,
    title,
    resetLabel,
    observedLabel,
    detail: [title, remainingLabel, resetLabel, observedLabel].filter(Boolean).join(" · "),
    tone: toneOf(remainingPercent),
  };
}
