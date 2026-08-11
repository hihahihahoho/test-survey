import {
  Circle, CircleDashed, Hourglass, CheckCircle2, RefreshCw, Scissors, XCircle,
  Wifi, Loader2, WifiOff, ShieldAlert, ArrowUpCircle, ImageOff, Square, Ban,
  type LucideIcon,
} from "lucide-react";

/* ==========================================================================
   §5.7 — BẢNG CHUẨN trạng thái job. 7 trạng thái, KHÔNG THÊM KHÔNG BỚT.
   Mọi màn PHẢI đọc nhãn/icon/tone từ đây. Cấm màn tự chế nhãn hay đổi màu.
   LUẬT A3: icon + chữ LUÔN đi cùng nhau. Không chỗ nào chỉ icon, chỉ màu.
   ========================================================================== */

export type JobStatus = "never" | "queued" | "running" | "ok" | "stale" | "uncut" | "failed";

/** tone phải là 1 trong các key tint của badge.tsx (đã đo tương phản). */
export type Tone = "never" | "queued" | "running" | "accent" | "ok" | "warn" | "stale" | "danger";

export interface StatusMeta {
  /** nhãn VI ngắn — hiện cạnh icon */
  label: string;
  /** nhãn dài — tooltip / aria-label. Có thể nối thêm số liệu. */
  long: string;
  icon: LucideIcon;
  tone: Tone;
  /** trạng thái này BẮT BUỘC kèm nút hành động ngay cạnh (§5.7) */
  needsAction?: boolean;
}

export const JOB_STATUS: Record<JobStatus, StatusMeta> = {
  never:   { label: "Chưa có",      long: "Chưa sinh ảnh lần nào",                    icon: Circle,        tone: "never" },
  queued:  { label: "Đang chờ",     long: "Đang chờ tới lượt",                        icon: CircleDashed,  tone: "queued" },
  running: { label: "Đang sinh",    long: "Đang sinh ảnh",                            icon: Hourglass,     tone: "running" },
  ok:      { label: "Xong",         long: "Xong",                                     icon: CheckCircle2,  tone: "ok" },
  stale:   { label: "Cần sinh lại", long: "Thiết kế đã đổi sau lần sinh ảnh cuối",     icon: RefreshCw,     tone: "stale", needsAction: true },
  uncut:   { label: "Cần cắt",      long: "Có ảnh mới nhưng chưa cắt",                 icon: Scissors,      tone: "stale", needsAction: true },
  failed:  { label: "Lỗi",          long: "Lỗi",                                      icon: XCircle,       tone: "danger", needsAction: true },
};

/**
 * §5.7 thứ tự ưu tiên khi GỘP nhiều job vào 1 badge.
 * failed > running > queued > stale > uncut > never > ok
 */
export const JOB_STATUS_PRIORITY: JobStatus[] = ["failed", "running", "queued", "stale", "uncut", "never", "ok"];

/** Gộp danh sách job thành 1 trạng thái đại diện, đúng thứ tự ưu tiên §5.7. */
export function mergeJobStatus(list: readonly JobStatus[]): JobStatus {
  for (const s of JOB_STATUS_PRIORITY) if (list.includes(s)) return s;
  return "ok";
}

/* --------------------------------------------------------------------------
   §5.7 Trạng thái của LƯỢT CHẠY (run) — 5 trạng thái.
   Chú ý E1: `done-with-errors` KHÔNG dùng ✓, KHÔNG dùng chữ "xong" trơn.
   -------------------------------------------------------------------------- */
export type RunStatus = "running" | "done" | "done-with-errors" | "cancelled" | "env-failed";

export const RUN_STATUS: Record<RunStatus, StatusMeta> = {
  running:            { label: "Đang chạy",           long: "Lượt chạy đang thực hiện",              icon: Hourglass,    tone: "running" },
  done:               { label: "Xong",                long: "Tất cả lượt đều thành công",            icon: CheckCircle2, tone: "ok" },
  "done-with-errors": { label: "Xong · có lỗi",       long: "Chạy hết nhưng một số lượt bị lỗi",     icon: ShieldAlert,  tone: "warn", needsAction: true },
  cancelled:          { label: "Đã dừng",             long: "Người dùng đã dừng lượt chạy",          icon: Square,       tone: "never" },
  "env-failed":       { label: "Không chạy được",     long: "Không chạy được — lỗi môi trường",      icon: Ban,          tone: "danger", needsAction: true },
};

/* --------------------------------------------------------------------------
   §2.4 Agent pill — 6 trạng thái. Pill LUÔN có chữ, không bao giờ chỉ màu.
   -------------------------------------------------------------------------- */
export type AgentStatus =
  | "connected"
  | "checking"
  | "not-found"
  | "blocked-by-browser"
  | "outdated"
  | "imagegen-unavailable";

export interface AgentStatusMeta extends StatusMeta {
  /** pill có bấm được không (checking thì không) */
  clickable: boolean;
}

export const AGENT_STATUS: Record<AgentStatus, AgentStatusMeta> = {
  connected: {
    label: "Đã kết nối", long: "Công cụ local đang chạy và đúng phiên bản",
    icon: Wifi, tone: "ok", clickable: true,
  },
  checking: {
    label: "Đang kiểm tra…", long: "Đang dò công cụ local",
    icon: Loader2, tone: "never", clickable: false,
  },
  "not-found": {
    label: "Chưa thấy công cụ local", long: "Không dò thấy công cụ local trên máy",
    icon: WifiOff, tone: "never", clickable: true,
  },
  "blocked-by-browser": {
    label: "Trình duyệt đang chặn", long: "Công cụ local vẫn chạy nhưng trình duyệt chặn kết nối",
    icon: ShieldAlert, tone: "warn", clickable: true, needsAction: true,
  },
  outdated: {
    label: "Công cụ local cũ", long: "Phiên bản giao thức lệch — cần cập nhật công cụ local",
    icon: ArrowUpCircle, tone: "warn", clickable: true, needsAction: true,
  },
  "imagegen-unavailable": {
    label: "Chưa tạo được ảnh", long: "Công cụ local chạy nhưng chưa cấu hình được phần tạo ảnh",
    icon: ImageOff, tone: "warn", clickable: true, needsAction: true,
  },
};
