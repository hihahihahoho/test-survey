import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common";
import { presentError, type BridgeResult, type ConnectionStatus } from "@/lib/api";
import { InlineBanner } from "../components/InlineBanner";
import { Disclosure } from "../components/Disclosure";
import { StepCard, StepShell, Note } from "../components/StepShell";
import { WaitingRow } from "../components/WaitingRow";
import { ConnectedCard } from "./parts/ConnectedCard";
import { RUN_CMD, RUN_CMD_REPO, updateCmd } from "../lib/commands";

/**
 * S0 · BƯỚC 2 — KẾT NỐI (§3-S0 wireframe "bước 3/4, trường hợp trình duyệt chặn").
 *
 * ĐÂY LÀ CHỖ DỄ NÓI DỐI NGƯỜI DÙNG NHẤT, nên viết theo đúng bài học của
 * `teams/qa-ux/browser-evidence.md` TRUNG BÌNH-01: bản cũ hiện *"Trình duyệt đang chặn
 * kết nối"* trong khi thực tế **agent trả HTTP 403 ORIGIN_NOT_ALLOWED**, đẩy user đi tắt
 * ad-blocker và đổi trình duyệt trong khi lỗi nằm ở agent.
 *
 * Nên màn này KHÔNG TỰ ĐOÁN. Nó chỉ vẽ theo `status.case` mà `lib/api/connection.ts` đã
 * phân xử, và mỗi ca có copy + hành động riêng:
 *
 *   agent-http-error        → "Công cụ local từ chối trang này" (thủ phạm: AGENT)
 *   agent-not-running       → "Chưa thấy công cụ local" + lệnh chạy   (kết luận CHẮC)
 *   unreachable-ambiguous   → KHÔNG kết luận bên nào; mời bấm cầu dò popup
 *   blocked-by-browser      → chỉ nói câu này KHI cầu dò đã xác nhận agent sống
 *   protocol-mismatch       → agent sống, chỉ lệch phiên bản
 *
 * Toàn bộ tiêu đề/giải thích lấy từ bảng tĩnh `presentError()` (§3.9) — màn không tự
 * viết copy lỗi, và `error.message` kỹ thuật không bao giờ ra thân UI.
 */
export interface StepConnectProps {
  status: ConnectionStatus;
  bridgeResult: BridgeResult | null;
  probing: boolean;
  onProbe: () => void;
  onRecheck: () => void;
  onNext: () => void;
}

export function StepConnect({
  status, bridgeResult, probing, onProbe, onRecheck, onNext,
}: StepConnectProps) {
  const lead =
    "Công cụ local là một chương trình nhỏ chạy trên chính máy bạn. Trang web nói chuyện với nó " +
    "qua 127.0.0.1 — không có dữ liệu nào của bạn đi ra Internet.";

  /* ── Đang dò lần đầu ─────────────────────────────────────────────────── */
  if (status.pill === "checking") {
    return (
      <StepShell title="Kết nối với công cụ local" lead={lead}>
        <StepCard>
          <WaitingRow
            label="Đang thử cổng 8765, 8766, 8767 trên máy bạn…"
            hint="Mỗi lần thử tối đa 1,2 giây. Nếu không thấy, chúng tôi sẽ nói rõ vì sao."
          />
        </StepCard>
      </StepShell>
    );
  }

  /* ── SUCCESS ─────────────────────────────────────────────────────────── */
  if (status.connected) {
    return (
      <StepShell title="Kết nối với công cụ local" lead={lead}>
        <ConnectedCard status={status} onNext={onNext} />
      </StepShell>
    );
  }

  const view = presentError({ code: status.code ?? "AGENT_NOT_RUNNING" });
  const blocked = status.case === "blocked-by-browser";
  const protocolOld = status.code === "AGENT_PROTOCOL_OLD";
  const protocolNew = status.code === "AGENT_PROTOCOL_NEW";
  const agentRefused = status.case === "agent-http-error";
  const ambiguous = status.case === "unreachable-ambiguous" || status.ambiguous;

  return (
    <StepShell title="Kết nối với công cụ local" lead={lead}>
      <InlineBanner
        tone={status.case === "none" ? "info" : "warning"}
        title={view.title}
        description={view.explain}
      />

      {/* ── Ca 3b: cầu dò đã xác nhận agent sống ⇒ ĐÚNG là trình duyệt chặn ── */}
      {blocked && (
        <StepCard>
          <p className="text-body text-fg">
            Công cụ local <strong className="text-fg-strong">đang chạy</strong> (đã xác nhận qua cửa
            sổ kiểm tra), nhưng trình duyệt không cho trang này gọi vào máy bạn.
          </p>
          <p className="text-body text-fg">
            Cách dùng: mở bản chạy ngay tại máy — giao diện y hệt, đủ mọi tính năng, cùng dữ liệu.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" asChild data-kg-primary="">
              <a href={status.mirrorUrl}>
                <ExternalLink aria-hidden />
                Mở bản chạy tại máy →
              </a>
            </Button>
          </div>
          <Disclosure summary="Vì sao lại thế?">
            <p>
              Trang này chạy trên HTTPS, còn công cụ local chạy trên http://127.0.0.1. Một số trình
              duyệt không cho trang HTTPS gọi vào máy bạn. Bản chạy tại máy do chính công cụ local
              phục vụ nên không bị chặn.
            </p>
          </Disclosure>
        </StepCard>
      )}

      {/* ── Ca 1: agent TRẢ LỖI. Thủ phạm là agent, không phải trình duyệt. ── */}
      {agentRefused && (
        <StepCard title="Công cụ local đang chạy, nhưng từ chối địa chỉ của trang này">
          <p className="text-body text-fg">
            Chúng tôi gọi tới được và nhận về câu trả lời từ chối — nghĩa là trình duyệt của bạn
            không chặn gì cả. Cách chắc chắn nhất là mở bản chạy ngay tại máy.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" asChild data-kg-primary="">
              <a href={status.mirrorUrl}>
                <ExternalLink aria-hidden />
                Mở bản chạy tại máy →
              </a>
            </Button>
          </div>
          <Note>
            Hoặc cho phép địa chỉ trang này khi chạy công cụ local: thêm tham số
            <code className="mx-1 font-mono">--origin</code>
            với đúng địa chỉ đang hiện trên thanh URL.
          </Note>
        </StepCard>
      )}

      {/* ── Ca protocol lệch: agent SỐNG, chỉ khác phiên bản ─────────────── */}
      {(protocolOld || protocolNew) && (
        <StepCard title={protocolNew ? "Giao diện đang là bản cache cũ" : "Cập nhật công cụ local"}>
          {protocolNew ? (
            <>
              <p className="text-body text-fg">
                Công cụ local mới hơn giao diện đang mở. Tải lại trang để lấy bản giao diện mới.
              </p>
              <div>
                <Button variant="primary" size="lg" onClick={() => window.location.reload()} data-kg-primary="">
                  Tải lại cứng
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-body text-fg">
                Công cụ local cũ hơn giao diện. Chạy lệnh này rồi khởi động lại nó:
              </p>
              <CopyableCode value={updateCmd(status.updateCommand)} label="Lệnh cập nhật công cụ local" />
            </>
          )}
        </StepCard>
      )}

      {/* ── Ca 2 & 3a: chưa gọi được ⇒ hiện lệnh chạy + cầu dò ──────────── */}
      {!blocked && !agentRefused && !protocolOld && !protocolNew && (
        <StepCard title="Đang chờ bạn chạy lệnh này trong Terminal">
          <CopyableCode value={RUN_CMD} label="Lệnh chạy công cụ local" />
          <Note>Nếu bạn chạy từ mã nguồn đã tải về:</Note>
          <CopyableCode value={RUN_CMD_REPO} label="Lệnh chạy công cụ local từ mã nguồn" />
          <WaitingRow label="Tự phát hiện sau mỗi vài giây — không cần bấm gì." />
        </StepCard>
      )}

      {/* ── Cầu dò popup: CHỈ chạy từ cử chỉ user (popup tự mở sẽ bị chặn) ── */}
      {!blocked && (
        <StepCard title="Vẫn không được?">
          {ambiguous && (
            <Note>
              Chúng tôi <strong className="text-fg-strong">chưa kết luận</strong> là do công cụ chưa
              chạy hay do trình duyệt — từ trong trang không phân biệt được hai ca này. Bấm nút dưới
              đây để biết chính xác.
            </Note>
          )}
          {bridgeResult?.blockedPopup === true && (
            <InlineBanner
              tone="warning"
              title="Trình duyệt đã chặn cửa sổ kiểm tra"
              description="Cho phép popup cho trang này rồi bấm lại nút bên dưới."
            />
          )}
          {bridgeResult?.alive === false && bridgeResult.blockedPopup !== true && (
            <InlineBanner
              tone="info"
              title="Cửa sổ kiểm tra không thấy công cụ local nào đang chạy"
              description="Vậy là công cụ chưa chạy — hãy chạy lệnh ở trên rồi quay lại tab này."
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={onProbe} loading={probing}>
              <Search aria-hidden />
              Tôi đã chạy lệnh nhưng vẫn không kết nối được →
            </Button>
            <Button variant="ghost" onClick={onRecheck}>
              <RefreshCw aria-hidden />
              Kiểm tra lại
            </Button>
          </div>
          <Note>Sẽ mở một cửa sổ nhỏ để hỏi thẳng công cụ local xem nó có sống hay không.</Note>
        </StepCard>
      )}
    </StepShell>
  );
}
