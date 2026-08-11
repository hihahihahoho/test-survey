import { Loader2 } from "lucide-react";
import { AGENT_STATUS, type AgentStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";

/**
 * §2.4 Agent pill — bản vỏ FLORA. **CHẤM MÀU NHỎ + CHỮ XÁM**, không phải pill nền tint.
 *
 * Vì sao không dùng `components/common/AgentStatusPill` của R0: nó gắn cứng nền tint
 * (`kg-tint-*`) + icon lucide, tức là một khối màu — FLORA-REF §2.4 đòi accent/màu dùng
 * RẤT tiết chế, phần còn lại đơn sắc. Không có prop để đổi cách vẽ và file đó không
 * thuộc nhánh tôi ⇒ ghi teams/react/NEEDS-rs2.md (N4) và vẽ lại ở đây.
 *
 * NHỮNG THỨ GIỮ NGUYÊN — đây là phần nghiệp vụ, KHÔNG được đụng:
 *  · Nguồn nhãn/tone là bảng `AGENT_STATUS` của R0 ⇒ ĐỦ 6 TRẠNG THÁI, màn không tự chế chữ.
 *  · Pill LUÔN CÓ CHỮ, không bao giờ chỉ có màu (đóng audit I1). Chấm chỉ là thứ ĐI KÈM.
 *    Ở màn rất hẹp chữ bị ẩn thì `aria-label` vẫn mang nghĩa đầy đủ.
 *  · `checking` KHÔNG bấm được (`meta.clickable`), và là trạng thái duy nhất có spinner.
 *  · KHÔNG tự suy đoán "trình duyệt chặn" (QA browser-evidence CAO-01) — chỉ vẽ theo
 *    `status` mà tầng transport đã phân xử.
 */
const DOT: Record<string, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  running: "bg-running",
  accent: "bg-accent",
  never: "bg-never",
  queued: "bg-queued",
  stale: "bg-warn",
};

export interface AgentPillProps {
  status: AgentStatus;
  onOpen?: () => void;
  className?: string;
}

export function AgentPill({ status, onOpen, className }: AgentPillProps) {
  const meta = AGENT_STATUS[status];
  const checking = status === "checking";

  return (
    <button
      type="button"
      disabled={!meta.clickable}
      onClick={onOpen}
      aria-label={`Công cụ local: ${meta.long}`}
      title={meta.long}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 border px-3 text-label",
        FLORA.pill, FLORA.hair, FLORA.fg, FOCUS,
        "transition-colors duration-fast",
        "enabled:hover:border-line-strong enabled:hover:text-fg-strong",
        "disabled:cursor-default",
        className,
      )}
    >
      {checking ? (
        <Loader2 className="size-3 shrink-0 text-fg-muted motion-safe:animate-spin" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-[6px] shrink-0 rounded-full",
            DOT[meta.tone],
            // Chấm nhấp nháy CHỈ khi đang có việc chạy — chuyển động phải có nghĩa.
            meta.tone === "running" && "motion-safe:animate-kg-pulse",
          )}
        />
      )}
      {/* CHỮ là bắt buộc (audit I1). Ẩn ở màn cực hẹp, khi ấy aria-label vẫn đủ nghĩa. */}
      <span className="hidden whitespace-nowrap sm:inline">{meta.label}</span>
    </button>
  );
}
