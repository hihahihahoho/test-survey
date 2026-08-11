import { Button } from "@/components/ui/button";
import { AGENT_STATUS, type AgentStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * §2.4 Agent pill — 6 trạng thái, thành phần quan trọng nhất của header.
 *
 * LUẬT: pill LUÔN có CHỮ, không bao giờ chỉ có màu (đóng audit I1).
 * `checking` không bấm được. Các trạng thái còn lại mở Sheet trạng thái —
 * nội dung Sheet do team màn (S0/S6) thi công, ở đây chỉ bắn `onOpen`.
 *
 * GHI CHÚ QA (browser-evidence CAO-01): đừng hiện "Trình duyệt đang chặn"
 * khi thực ra chính agent trả 403. P3 phải phân biệt 2 ca này ở tầng
 * transport rồi mới truyền `status` xuống đây; component không tự đoán.
 */
const TONE_CLASS: Record<string, string> = {
  ok: "kg-tint-ok text-on-tint-ok",
  warn: "kg-tint-warn text-on-tint-warn",
  never: "kg-tint-never text-on-tint-never",
  danger: "kg-tint-danger text-on-tint-danger",
  running: "kg-tint-running text-on-tint-running",
  accent: "kg-tint-accent text-on-tint-accent",
  queued: "kg-tint-queued text-on-tint-queued",
  stale: "kg-tint-stale text-on-tint-stale",
};

export interface AgentStatusPillProps {
  status: AgentStatus;
  onOpen?: () => void;
  className?: string;
}

export function AgentStatusPill({ status, onOpen, className }: AgentStatusPillProps) {
  const meta = AGENT_STATUS[status];
  const Icon = meta.icon;

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!meta.clickable}
      onClick={onOpen}
      aria-label={`Công cụ local: ${meta.long}`}
      title={meta.long}
      className={cn("gap-1.5 rounded-full px-2.5", TONE_CLASS[meta.tone], className)}
    >
      <Icon
        className={cn("size-3.5", status === "checking" && "motion-safe:animate-spin")}
        aria-hidden
      />
      {/* CHỮ là bắt buộc — ở màn rất hẹp mới ẩn, và khi ấy vẫn còn aria-label */}
      <span className="hidden text-caption sm:inline">{meta.label}</span>
    </Button>
  );
}
