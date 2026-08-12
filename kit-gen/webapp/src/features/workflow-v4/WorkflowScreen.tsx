import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/common";
import { useAgentStatus, useElementLib, useProject, useSaveWorkflowDraft, useUserLibrary, useWorkflowDraft } from "@/lib/hooks";
import { useGenerateRun } from "@/features/runs";
import { toast } from "@/components/ui/sonner";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { hydrateWorkflowStore, useWorkflowStore, useWorkflowStoreApi, workflowDraftOf, WorkflowStoreProvider } from "./lib/model";
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
import { mergeElements, userUiElements } from "./lib/user-library";

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
  const store = useWorkflowStoreApi();
  const diskDraft = useWorkflowDraft(projectId);
  const saveDraft = useSaveWorkflowDraft(projectId);
  const hydrated = React.useRef(false);
  const [drawOpen, setDrawOpen] = React.useState(false);
  const startRun = useGenerateRun(projectId);

  React.useEffect(() => {
    if (hydrated.current || !diskDraft.isSuccess) return;
    hydrateWorkflowStore(store, diskDraft.data.draft);
    hydrated.current = true;
  }, [diskDraft.data?.draft, diskDraft.isSuccess, store]);

  React.useEffect(() => {
    if (!hydrated.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe(state => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => saveDraft.mutate({ completed: false, draft: workflowDraftOf(state) }), 600);
    });
    return () => { unsubscribe(); if (timer) clearTimeout(timer); };
  }, [saveDraft, store]);

  /* §W3-5 — kho element THẬT của agent, bản đóng gói là đường lùi (đọc đĩa, 0 đồng). */
  const libQ = useElementLib();
  const userLibrary = useUserLibrary();
  const lib = React.useMemo(() => {
    const agent = libQ.data ? fromAgentLib(libQ.data).elements : [];
    const custom = userUiElements(userLibrary.data?.items ?? []);
    const merged = mergeElements(custom, agent);
    return merged.length > 0 ? merged : undefined;
  }, [libQ.data, userLibrary.data?.items]);

  /* §W3-3 — ref có thật trên đĩa THẮNG bản nháp khi dựng contract. */
  const refs = useWorkflowRefs(projectId);
  const kitsetRefs = React.useMemo(() => (refs.ready ? toKitsetRefs(refs.groups) : undefined), [refs.ready, refs.groups]);
  const limits = React.useMemo(() => {
    const shared = userLibrary.data?.settings;
    const project = s.sheetLimits;
    return {
      background: project.background ?? shared?.background,
      popup: project.popup ?? shared?.popup,
      small: project.small ?? shared?.small,
      mascot: project.mascot ?? shared?.mascot,
    };
  }, [s.sheetLimits, userLibrary.data?.settings]);

  /* §W3-2 — dựng MỘT contract rồi phát xuống: bước ⑤ và ⑥ phải nói cùng một con số. */
  const sync = useContractSync(projectId, s, status, {
    ...(lib ? { lib } : {}),
    ...(kitsetRefs ? { refs: kitsetRefs } : {}),
    limits,
  });

  React.useEffect(() => {
    const name = project.data?.name?.trim();
    if (name && (s.kitName === "Dự án mới" || s.kitName === "Bộ quay may mắn")) s.set({ kitName: name });
  }, [project.data?.name, s.kitName, s.set]);

  if (project.isLoading || diskDraft.isLoading || !hydrated.current) return <LoadingState count={4} label="Đang mở bản nháp dự án…" />;
  if (project.error)
    return (
      <ErrorState
        title="Chưa mở được dự án"
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
          <p className="eyebrow">{project.data?.name ?? s.kitName}</p>
          {s.step === 1 && (
            <>
              <h1>Tạo <em>dự án</em></h1>
              <p>Điền yêu cầu, chọn bộ khung rồi tạo ảnh.</p>
            </>
          )}
        </div>
        <div className="workflow-hero-status">
          <SyncBadge sync={sync} />
        </div>
      </div>
      <WorkflowStepper />
      <div className="kg-page workflow-content">{content}</div>
      <WorkflowActions
        step={s.step}
        drawable={drawableOf(s.elements).length}
        onBack={s.back}
        onNext={s.next}
        onDraw={() => setDrawOpen(true)}
        onDone={() => { void (async () => {
          await sync.saveNow();
          await saveDraft.mutateAsync({ completed: true, draft: workflowDraftOf(store.getState()) });
          void navigate({ to: "/p/$projectId", params: { projectId } });
        })(); }}
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
              toast.error("Chưa lưu được thay đổi nên chưa thể tạo ảnh.");
              return;
            }
            try {
              const run = await startRun.startContract(sync.contract);
              s.addVersion(s.stylePrompt, "rendering", run.runId);
              setDrawOpen(false);
              s.next();
              toast.success("Đã bắt đầu tạo ảnh.");
            } catch {
              toast.error("Chưa tạo ảnh được. Kiểm tra công cụ tạo ảnh trong Cài đặt.");
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
          <Sparkles aria-hidden />Tạo ảnh
        </Button>
      )}
      {step === 6 && (
        <>
          {/* §W3-7 — hai cửa ra MANG PHẦN THƯỞNG nay mở thật (cả hai 0 đồng: `.zip` là
              đọc đĩa, Copy Figma là canvas + clipboard). W1 để chúng khoá kèm lý do vì
              chưa có ảnh kit; điều kiện mở nay là `useKit` có file, không phải một cái cờ. */}
          {exits}
          <Button variant="primary" size="lg" onClick={onDone}>
            <Check aria-hidden />Xong — về dự án
          </Button>
        </>
      )}
    </div>
  );
}
