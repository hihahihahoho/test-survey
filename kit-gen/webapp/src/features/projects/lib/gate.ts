/**
 * features/projects/lib/gate.ts — MA TRẬN "hành vi khi agent chưa chạy" (§4.9).
 *
 * Luật §2.5-2: nút gây thay đổi phải `disabled` + `aria-disabled` + **tooltip nói lý do**,
 * và **KHÔNG ẩn nút** (ẩn làm user tưởng mất tính năng).
 * Yêu cầu 3 của brief: "nút bị vô hiệu KÈM GIẢI THÍCH — không phải bấm rồi mới lỗi".
 *
 * Lý do disabled lấy theo ĐÚNG ca kết nối (`ConnectionStatus.case` của R0-P3), chứ không
 * dùng một câu chung: bài học QA-UX CAO-01 là bản cũ đổ tội cho trình duyệt trong khi
 * chính agent từ chối. Nói sai nguyên nhân thì user đi sửa nhầm chỗ.
 */
import * as React from "react";
import type { ConnectionStatus } from "@/lib/api";

/**
 * §2.2 + audit M5 — MỐC 768px LÀ CHỈ-ĐỌC THẬT, không phải một dòng chữ khuyên nhủ.
 * Bản vanilla tự thú: *"<768px nói 'chỉ đọc' nhưng KHÔNG có gate thật"*. Bản React
 * trước lượt này chép nguyên lỗi đó: `FloraShell` chỉ hiện `<div role="status">`,
 * mọi nút ghi vẫn bấm được trên bố cục vỡ. Đây là chỗ đóng nó: chiều rộng cửa sổ
 * trở thành MỘT NGUỒN read-only ngang hàng với trạng thái agent.
 */
export const NARROW_QUERY = "(max-width: 767.98px)";
/** Mốc `lg` của Tailwind — dưới mốc này bố cục 3 vùng của S3 phải xếp DỌC (§2.2). */
export const COMPACT_QUERY = "(max-width: 1023.98px)";

/** SSR-safe, không ném khi `matchMedia` vắng mặt (jsdom cũ, môi trường test). */
export function useMediaQuery(query: string): boolean {
  const get = React.useCallback(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(query).matches
        : false,
    [query],
  );
  const [match, setMatch] = React.useState(get);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const on = () => setMatch(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, [query]);
  return match;
}

export function useNarrowViewport(): boolean {
  return useMediaQuery(NARROW_QUERY);
}

export function useCompactViewport(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}

export interface Gate {
  /** true ⇒ mọi thao tác ghi bị khoá. */
  readOnly: boolean;
  /** Câu ngắn (≤48 ký tự) cho tooltip cạnh nút bị khoá. */
  reason: string;
  /** Câu dài cho banner/modal — giải thích rõ hơn, vẫn không có thuật ngữ kỹ thuật. */
  longReason: string;
  /** Mã để tra bảng §3.9 khi cần dựng nút hành động. */
  code: string | null;
}

const REASONS: Record<string, { short: string; long: string }> = {
  "agent-not-running": {
    short: "Cần công cụ local đang chạy",
    long: "Dự án nằm trên máy bạn. Mở Terminal, chạy công cụ local rồi thử lại.",
  },
  "blocked-by-browser": {
    short: "Trình duyệt đang chặn kết nối",
    long: "Công cụ local vẫn chạy, nhưng trình duyệt không cho trang này gọi vào máy. Mở bản chạy tại máy để làm tiếp.",
  },
  "agent-http-error": {
    short: "Công cụ local từ chối trang này",
    long: "Công cụ local đang chạy nhưng không nhận địa chỉ của trang này. Trình duyệt không chặn gì.",
  },
  "unreachable-ambiguous": {
    short: "Chưa gọi được công cụ local",
    long: "Chưa rõ do công cụ chưa chạy hay do trình duyệt. Bấm kiểm tra lại để biết chính xác.",
  },
  "protocol-mismatch": {
    short: "Công cụ local khác phiên bản",
    long: "Phiên bản công cụ local và giao diện lệch nhau. Cập nhật rồi thử lại.",
  },
  checking: {
    short: "Đang kiểm tra công cụ local…",
    long: "Đang dò công cụ local trên máy bạn. Chờ một chút.",
  },
  narrow: {
    short: "Màn hình nhỏ: chỉ xem, không sửa",
    long: "Màn hình dưới 768px chỉ để xem. Bố cục soạn thảo cần màn rộng hơn, nên mọi thao tác sửa bị khoá cho tới khi bạn mở trên máy tính hoặc xoay ngang máy.",
  },
};

export function gateOf(status: ConnectionStatus, narrow = false): Gate {
  // Màn hẹp thắng mọi ca khác: kể cả agent chạy tốt thì vẫn KHÔNG cho ghi (§2.2).
  if (narrow) {
    return { readOnly: true, reason: REASONS.narrow!.short, longReason: REASONS.narrow!.long, code: "VIEWPORT_TOO_NARROW" };
  }
  if (status.pill === "checking") {
    return { readOnly: true, reason: REASONS.checking!.short, longReason: REASONS.checking!.long, code: null };
  }
  // `imagegen-unavailable` VẪN kết nối được: CRUD chạy bình thường, chỉ sinh ảnh mới bị chặn
  // (và chặn ở modal M1 của màn khác, không phải ở đây).
  if (status.connected && !status.readOnly) {
    return { readOnly: false, reason: "", longReason: "", code: null };
  }
  const r = REASONS[status.case] ?? REASONS["unreachable-ambiguous"]!;
  return { readOnly: true, reason: r.short, longReason: r.long, code: status.code };
}

/** Props chuẩn cho một nút bị khoá — dùng chung để không nơi nào quên `aria-disabled`. */
export function disabledProps(gate: Gate): {
  disabled: boolean;
  "aria-disabled": boolean | undefined;
  title: string | undefined;
} {
  return {
    disabled: gate.readOnly,
    "aria-disabled": gate.readOnly || undefined,
    title: gate.readOnly ? gate.reason : undefined,
  };
}
