import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Sparkles, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineBanner, LoadingState, ErrorState } from "@/components/common";
import { useAgentStatus, useElementLib, useProject } from "@/lib/hooks";
import { useGenerateRun } from "@/features/runs";
import { toast } from "@/components/ui/sonner";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { useWorkflowStore, WorkflowStoreProvider } from "./lib/model";
import { ContractSyncProvider, useContractSync } from "./lib/contract-sync";
import { toKitsetRefs, useWorkflowRefs } from "./lib/refs-sync";
import { DownloadKitButton, CopyFigmaButton } from "./components/KitExits";
import { SyncBadge } from "./components/SyncBadge";
import { WorkflowStepper } from "./steps/Stepper";
import { BriefStep } from "./steps/BriefStep";
import { StyleStep } from "./steps/StyleStep";
import { KitsetStep } from "./steps/KitsetStep";
import { MascotStep } from "./steps/MascotStep";
import { ReviewStep, DrawConfirmDialog, drawableOf } from "./steps/ReviewStep";
import { ResultStep } from "./steps/ResultStep";

/**
 * MÀN WORKFLOW — stepper 6 bước, một mạch.
 *
 * Hai luật của hàng nút cuối trang (`.workflow-actions`), cả hai đều từ UPGRADE-PLAN:
 *  · **§W1-10** — nút chính LUÔN ở góc dưới-phải. Bước 5 từng đặt ở đó một *câu xám*
 *    ("Cửa sổ xác nhận luôn hiện đủ số lượt…") còn nút thật thì nằm giữa thân trang.
 *    Câu đó đã xoá hẳn; nút "Vẽ bộ kit này" về đúng chỗ 4 bước trước đã dạy.
 *  · **§W1-2** — bước 6 phải có CỬA RA. Trước đây hàng nút cuối chỉ còn "Quay lại":
 *    cả mạch 6 bước kết thúc bằng không gì cả.
 *
 * Bản nháp khoá theo `projectId` (§W1-1): provider bọc quanh nội dung, 6 file step
 * không biết gì về chuyện đó.
 */
export function WorkflowScreen({ projectId }: { projectId: string }) {
  return (
    <WorkflowStoreProvider projectId={projectId}>
      <WorkflowBody projectId={projectId} />
    </WorkflowStoreProvider>
  );
}

function WorkflowBody({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const project = useProject(projectId);
  const { status } = useAgentStatus();
  const s = useWorkflowStore();
  const [drawOpen, setDrawOpen] = React.useState(false);
  const startRun = useGenerateRun(projectId);

  /* §W3-5 — kho element THẬT của agent, bản đóng gói là đường lùi (đọc đĩa, 0 đồng). */
  const libQ = useElementLib();
  const lib = React.useMemo(() => {
    const agent = libQ.data ? fromAgentLib(libQ.data).elements : [];
    return agent.length > 0 ? agent : undefined;
  }, [libQ.data]);

  /* §W3-3 — ref có thật trên đĩa THẮNG bản nháp khi dựng contract. */
  const refs = useWorkflowRefs(projectId);
  const kitsetRefs = React.useMemo(() => (refs.ready ? toKitsetRefs(refs.groups) : undefined), [refs.ready, refs.groups]);

  /* §W3-2 — dựng MỘT contract rồi phát xuống: bước ⑤ và ⑥ phải nói cùng một con số. */
  const sync = useContractSync(projectId, s, status, { ...(lib ? { lib } : {}), ...(kitsetRefs ? { refs: kitsetRefs } : {}) });

  if (project.isLoading) return <LoadingState count={4} label="Đang mở workflow…" />;
  if (project.error)
    return (
      <ErrorState
        title="Chưa mở được bộ kit"
        description="Bản nháp trên máy vẫn được giữ. Thử lại khi công cụ local sẵn sàng."
        actions={<Button onClick={() => void project.refetch()}>Thử lại</Button>}
      />
    );

  const content = [<BriefStep />, <StyleStep />, <KitsetStep />, <MascotStep />, <ReviewStep />, <ResultStep />][s.step - 1];

  return (
    <ContractSyncProvider value={sync}>
    <main className="workflow-page">
      {/* §W2A-2 — `kg-page` là container DUY NHẤT của app. Mọi khối cấp trang của
          workflow đeo nó để mép trái trùng Home/Settings/logo header. */}
      {/* ══ §W2B-4 · BA TẦNG TIÊU ĐỀ RÚT CÒN MỘT ═══════════════════════════════
          Từ bước ②, màn có ba thứ cùng đòi làm tiêu đề: H1 "Một mạch để vẽ" (52px)
          → hàng stepper → H2 tên bước ("Phong cách"). Chỉ cái thứ ba nói được người
          ta đang ở đâu; hai cái trên lặp lại thứ stepper đã nói, và cộng lại đẩy ô
          nhập đầu tiên xuống y≈531/900 — quá nếp gấp.

          Hero ĐẦY ĐỦ chỉ ở bước ①, nơi nó là lời chào của cả mạch. Các bước sau giữ
          lại đúng hàng trạng thái, vì `SyncBadge` phải hiện ở MỌI bước (tiêu chí
          nghiệm thu #9 của W3: "nhãn trạng thái lưu nói gì khi công cụ local chưa
          chạy" — hỏi ở hero của mọi bước). Cắt tiêu đề, không cắt sự thật. */}
      <div className={`kg-page workflow-hero${s.step > 1 ? " workflow-hero-compact" : ""}`}>
        <div>
          <p className="eyebrow">{project.data?.name ?? s.kitName} · một mạch</p>
          {s.step === 1 && (
            <>
              <h1>Một mạch để <em>vẽ</em></h1>
              <p>Chọn brief, phong cách, kitset và mascot. Mọi thứ ở cùng một workflow.</p>
            </>
          )}
        </div>
        <div className="workflow-hero-status">
          <SyncBadge sync={sync} />
          {/* P-SWEEP·2 — pill đếm phiên bản BIẾN MẤT ở bước ⑥. Ở đó màn đã có một
              `<Select>` liệt kê từng phiên bản kèm giờ và ghi chú; cái pill "1 phiên
              bản" bên trên chỉ nói lại con số mà select vừa nói bằng chữ đầy đủ.
              Năm bước đầu KHÔNG có select nào ⇒ pill vẫn là nguồn duy nhất, giữ. */}
          {s.step < 6 && (
            <span className="workflow-project-pill">{s.versions.length ? `${s.versions.length} phiên bản` : "Bản nháp"}</span>
          )}
        </div>
      </div>
      {/* ══ P-SWEEP·1 · BÁO MỘT LẦN, KHÔNG ĐI THEO SUỐT 6 BƯỚC ═══════════════════
          Bản thiết kế của người khác (nhập từ tệp cũ) ⇒ vẫn NÓI RA, không âm thầm
          chỉ-đọc. Nhưng nói ở bước ① là đủ: từ bước ② trở đi `SyncBadge` ngay trên
          đầu đã đứng ở trạng thái `foreign` với chữ "Chỉ đọc" và `title` mang đúng
          câu giải thích (`sync.note`) — tức sự thật KHÔNG mất, chỉ thôi chiếm 78px
          đầu trang ở cả 6 bước. Mô tả cũng bỏ: 13 chữ đầu của nó trùng khít tiêu đề. */}
      {sync.state === "foreign" && s.step === 1 && (
        <div className="kg-page">
          <InlineBanner
            tone="warn"
            title="Đã có bản thiết kế riêng — các bước ở đây không ghi đè lên nó."
            icon={WifiOff}
          />
        </div>
      )}
      {(!status.connected || status.readOnly) && (
        /* Bọc `kg-page` thay vì đắp thẳng lên banner: `kg-page` mang padding
           ngang của TRANG, còn banner tự có `p-5` của THẺ — đắp chung thì hai
           padding chồng nhau và thẻ mất mép. */
        <div className="kg-page">
          <InlineBanner
            tone="warn"
            title="Công cụ local chưa chạy"
            description="Bạn vẫn điền brief và xem khung xương. Lưu, upload và vẽ sẽ mở khi kết nối lại."
            icon={WifiOff}
          />
        </div>
      )}
      <WorkflowStepper />
      <div className="kg-page workflow-content">{content}</div>
      <WorkflowActions
        step={s.step}
        drawable={drawableOf(s.elements).length}
        onBack={s.back}
        onNext={s.next}
        onDraw={() => setDrawOpen(true)}
        onDone={() => { sync.saveNow(); void navigate({ to: "/" }); }}
        exits={<><DownloadKitButton projectId={projectId} /><CopyFigmaButton projectId={projectId} kitName={s.kitName} /></>}
      />
      <DrawConfirmDialog
        open={drawOpen}
        onOpenChange={setDrawOpen}
        pending={startRun.isPending || sync.state === "saving"}
        onConfirm={() => {
          void (async () => {
            const saved = await sync.saveNow();
            if (!saved) {
              toast.error("Chưa lưu được bản thiết kế mới nhất nên chưa bắt đầu vẽ.");
              return;
            }
            try {
              const run = await startRun.startContract(sync.contract);
              s.addVersion(s.stylePrompt, "rendering", run.runId);
              setDrawOpen(false);
              toast.success(`Đã bắt đầu lượt vẽ ${run.runId}.`);
              void navigate({ to: "/k/$projectId/studio", params: { projectId } });
            } catch {
              toast.error("Chưa bắt đầu vẽ được. Kiểm tra công cụ tạo ảnh trong Môi trường.");
            }
          })();
        }}
      />
    </main>
    </ContractSyncProvider>
  );
}

/**
 * Hàng nút cuối trang — tách ra để kiểm được từng bước mà không phải dựng cả router
 * lẫn agent giả. `drawable` là số món SẼ ĐƯỢC VẼ THẬT (đã trừ món `mock`).
 */
export function WorkflowActions({
  step, drawable, onBack, onNext, onDraw, onDone, exits,
}: {
  step: number;
  drawable: number;
  onBack: () => void;
  onNext: () => void;
  onDraw: () => void;
  onDone: () => void;
  /** §W3-7 — hai cửa ra mang phần thưởng. Truyền vào để hàng nút kiểm được mà không
   *  cần dựng cả agent giả (chúng tự gọi `useKit`). */
  exits?: React.ReactNode;
}) {
  return (
    <div className="kg-page workflow-actions">
      {step > 1 && (
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft aria-hidden />Quay lại
        </Button>
      )}
      <span className="workflow-action-spacer" />
      {step < 5 && (
        <Button variant="primary" onClick={onNext}>
          Tiếp theo<ArrowRight aria-hidden />
        </Button>
      )}
      {step === 5 && (
        <Button variant="primary" size="lg" disabled={drawable === 0} onClick={onDraw}>
          <Sparkles aria-hidden />Vẽ bộ kit này
        </Button>
      )}
      {step === 6 && (
        <>
          {/* §W3-7 — hai cửa ra MANG PHẦN THƯỞNG nay mở thật (cả hai 0 đồng: `.zip` là
              đọc đĩa, Copy Figma là canvas + clipboard). W1 để chúng khoá kèm lý do vì
              chưa có ảnh kit; điều kiện mở nay là `useKit` có file, không phải một cái cờ. */}
          {exits}
          <Button variant="primary" size="lg" onClick={onDone}>
            <Check aria-hidden />Xong — về danh sách
          </Button>
        </>
      )}
    </div>
  );
}
