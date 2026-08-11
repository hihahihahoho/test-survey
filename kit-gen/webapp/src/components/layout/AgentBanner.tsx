import * as React from "react";
import { AlertTriangle, ExternalLink, HelpCircle, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common";
import { presentError, devDetails, type ConnectionStatus } from "@/lib/api";
import { RUN_CMD, RUN_CMD_REPO, updateCmd } from "./agent-commands";
import { cn } from "@/lib/utils";

/**
 * §2.5 BANNER CHẾ ĐỘ CHỈ-ĐỌC — sticky dưới header, 1 dòng, luôn có nút.
 *
 * ĐÂY LÀ CHỖ DỄ NÓI DỐI NHẤT CỦA APP. Bản vanilla đã nói dối và bị QA bắt:
 * `teams/qa-ux/browser-evidence.md` TRUNG BÌNH-01 — banner ghi *"Trình duyệt
 * đang chặn kết nối"* trong khi sự thật là **agent trả HTTP 403
 * ORIGIN_NOT_ALLOWED**. User bị đẩy đi tắt ad-blocker, đổi trình duyệt, tìm cờ
 * Chrome, trong khi lỗi nằm ở agent.
 *
 * NÊN Ở ĐÂY: component KHÔNG tự suy đoán chữ nào. Nó đọc `status.case` do
 * `lib/api/connection.ts` phân xử (đã có bằng chứng: có response hay không, có
 * same-origin hay không, cầu dò popup nói gì) rồi tra bảng tĩnh §3.9. Ba ca:
 *
 *   agent-http-error       → "Công cụ local từ chối trang này"  (KHÔNG đổ tội trình duyệt)
 *   agent-not-running      → "Chưa thấy công cụ local"          (kết luận chắc, same-origin)
 *   unreachable-ambiguous  → "Chưa gọi được công cụ local"      (CHƯA kết luận, mời bấm dò)
 *   blocked-by-browser     → chỉ khi cầu dò đã XÁC NHẬN agent sống
 */
export interface AgentBannerProps {
  status: ConnectionStatus;
  onRecheck: () => void;
  /** Cầu dò popup — CHỈ chạy từ cử chỉ user (popup không do user bấm sẽ bị chặn). */
  onBridgeProbe: () => void;
  probing?: boolean;
  onOpenAgentSheet?: () => void;
}

export function AgentBanner({ status, onRecheck, onBridgeProbe, probing = false, onOpenAgentSheet }: AgentBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [reconnected, setReconnected] = React.useState(false);
  const wasDown = React.useRef(false);

  /* ══ B5 — "Đã kết nối lại" DÍNH VĨNH VIỄN Ở MỌI MÀN ═════════════════════════
   * HAI lỗi chồng nhau, cả hai đều ở đây:
   *
   * ① Bộ đếm tự ẩn nằm CHUNG effect với việc phát hiện reconnect, mà cờ
   *    `wasDown` lại bị hạ NGAY trong lần chạy đó. Dưới `React.StrictMode`
   *    (main.tsx) effect chạy 2 lần: lần 1 bật `reconnected`, đặt timer, rồi
   *    cleanup XOÁ timer; lần 2 `wasDown` đã false ⇒ KHÔNG ai đặt lại timer nữa
   *    ⇒ `reconnected` kẹt `true` tới hết phiên. Đúng triệu chứng chủ dự án thấy.
   *    SỬA: tách bộ đếm sang effect RIÊNG phụ thuộc `reconnected` — dựng và dọn
   *    đối xứng, StrictMode chạy bao nhiêu lần cũng ra cùng kết quả.
   *
   * ② Banner còn nổi lên khi KHÔNG hề mất kết nối: lúc mở app trạng thái đầu
   *    tiên là `checking` (chưa dò xong, `connected === false`) và bị tính là
   *    "đang hỏng". `AppLayout` mount lại theo từng route ⇒ mỗi lần chuyển màn
   *    lại chào "Đã kết nối lại". SỬA: chỉ coi là MẤT KẾT NỐI khi đã dò xong và
   *    kết luận là hỏng thật (`pill !== "checking"`).
   */
  React.useEffect(() => {
    if (status.pill === "checking") return; // chưa có kết luận ⇒ chưa phán gì
    if (!status.connected) {
      wasDown.current = true;
      setDismissed(false);
      return;
    }
    if (wasDown.current) {
      wasDown.current = false;
      setReconnected(true);
    }
    return;
  }, [status.connected, status.pill]);

  // §2.5-5: banner xanh chỉ sống 3s. Effect riêng ⇒ luôn có người dọn.
  React.useEffect(() => {
    if (!reconnected) return;
    const t = setTimeout(() => setReconnected(false), 3000);
    return () => clearTimeout(t);
  }, [reconnected]);

  if (status.connected && reconnected) {
    return (
      <Bar tone="ok" role="status">
        <span className="text-label text-accent-text">Đã kết nối lại — đã làm mới danh sách.</span>
      </Bar>
    );
  }
  // Đang dò lần đầu: không kêu la gì cả. Kêu "chưa thấy công cụ" khi mới 300ms
  // là nói sớm hơn sự thật.
  if (status.connected || status.pill === "checking" || dismissed) return null;

  const p = presentError({ code: status.code ?? "AGENT_NOT_RUNNING" });

  return (
    <Bar tone="warn" role="status">
      <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-label text-fg-strong">
          {p.title}
          <span className="ml-2 font-normal text-fg">{p.explain}</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {status.needsBridgeProbe && (
          <Button size="sm" variant="primary" onClick={onBridgeProbe} loading={probing}>
            {probing ? <Loader2 aria-hidden /> : <HelpCircle aria-hidden />}
            Kiểm tra giúp tôi
          </Button>
        )}
        {(status.case === "blocked-by-browser" ||
          status.case === "agent-http-error") && (
          <Button size="sm" variant="secondary" asChild>
            <a href={status.mirrorUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> Mở bản chạy tại máy
            </a>
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRecheck}>
          <RefreshCw aria-hidden /> Thử lại
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenAgentSheet}>
          Vì sao?
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => setDismissed(true)}
          aria-label="Ẩn thông báo này"
        >
          <X aria-hidden />
        </Button>
      </div>
    </Bar>
  );
}

/**
 * Khối chi tiết dùng trong Sheet trạng thái (bấm vào agent pill).
 * Đây là nơi DUY NHẤT trong khung app được hiện thông tin kỹ thuật, và vẫn
 * phải nằm trong panel gập.
 */
export function AgentDiagnosticBody({ status }: { status: ConnectionStatus }) {
  const p = presentError({ code: status.code ?? "AGENT_NOT_RUNNING" });
  const cmd = status.entry === "mirror" ? RUN_CMD_REPO : RUN_CMD;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-subtitle text-fg-strong">{status.connected ? "Công cụ local đang chạy" : p.title}</p>
        <p className="text-body text-fg">{status.connected ? "Mọi thao tác đều dùng được." : p.explain}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-label">
        <Row label="Thư mục làm việc" value={status.workspaceLabel ?? "—"} />
        <Row label="Phiên bản công cụ" value={status.agentVersion ?? "—"} />
        <Row label="Tên phiên" value={status.instanceLabel ?? "—"} />
        <Row label="Kiểm tra lúc" value={new Date(status.checkedAt).toLocaleTimeString("vi-VN")} />
      </dl>

      {!status.connected && (
        <div className="flex flex-col gap-2">
          <p className="text-label text-fg-strong">Mở Terminal và chạy:</p>
          <CopyableCode label="Lệnh chạy công cụ local" value={cmd} />
          {status.code === "AGENT_PROTOCOL_OLD" && (
            <CopyableCode label="Lệnh cập nhật công cụ local" value={updateCmd(status.updateCommand)} />
          )}
        </div>
      )}

      <details className="group">
        <summary
          className={cn(
            "inline-flex cursor-pointer list-none items-center gap-1 rounded-1 text-label text-fg-muted-raised hover:text-fg-strong",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-raised",
          )}
        >
          Chi tiết cho lập trình viên
        </summary>
        <CopyableCode
          className="mt-2"
          label="Chi tiết kết nối"
          value={devDetails({
            code: status.code,
            status: status.httpStatus,
            entry: status.entry,
            details: {
              case: status.case,
              sameOrigin: status.sameOrigin,
              base: status.base,
              ambiguous: status.ambiguous,
            },
          })}
        />
      </details>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-fg-muted-raised">{label}</dt>
      <dd className="truncate text-fg-strong">{value}</dd>
    </>
  );
}

function Bar({
  tone,
  role,
  children,
}: {
  tone: "warn" | "ok";
  role: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        // VỎ FLORA: dải mảnh trên nền #000 + hairline, tông màu chỉ nằm ở icon/chữ và
        // một vệt tint rất nhạt — không phải khối màu đặc kín chiều ngang (§2.4 tiết chế).
        "flex items-center gap-2 border-b bg-canvas px-4 py-2 sm:px-6",
        "border-line-subtle",
        tone === "warn" ? "bg-warn/[var(--kg-tint-b)]" : "bg-accent/[var(--kg-tint-b)]",
      )}
    >
      {children}
    </div>
  );
}
