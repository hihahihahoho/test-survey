import { Check, CloudOff, Loader2, Lock, TriangleAlert } from "lucide-react";
import type { ContractSync } from "../lib/contract-sync";

/**
 * Nhãn trạng thái lưu — §W3-2.
 *
 * Người dùng đang gõ vào một thứ nay ĐƯỢC GHI RA ĐĨA, nên phải thấy được điều đó.
 * Luật của nhãn này: **không bao giờ nói "đã lưu" khi chưa lưu**. Bốn trạng thái
 * "chưa lưu" (offline / foreign / conflict / error) đều có icon riêng và câu riêng,
 * không gộp chung thành một chữ "lỗi".
 */
const ICON = {
  loading: Loader2, saving: Loader2, pending: Loader2,
  saved: Check, offline: CloudOff, foreign: Lock, conflict: TriangleAlert, error: TriangleAlert,
} as const;

const SHORT: Record<ContractSync["state"], string> = {
  loading: "Đang mở…",
  pending: "Chưa lưu",
  saving: "Đang lưu…",
  saved: "Đã lưu",
  offline: "Chưa lưu được",
  foreign: "Chỉ đọc",
  conflict: "Cần chọn bản",
  error: "Lưu chưa được",
};

export function SyncBadge({ sync }: { sync: ContractSync }) {
  const Icon = ICON[sync.state];
  const spinning = sync.state === "saving" || sync.state === "loading" || sync.state === "pending";
  const at = sync.savedAt;
  const label =
    sync.state === "saved" && at
      ? `Đã lưu ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
      : SHORT[sync.state];

  return (
    <span className="sync-badge" data-state={sync.state} title={sync.note ?? label}>
      <Icon aria-hidden className={spinning && sync.state !== "pending" ? "animate-spin" : undefined} />
      {label}
    </span>
  );
}
