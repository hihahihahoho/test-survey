import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Images, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/common";
import { useAgentStatus, useElementLib, useProject, useSaveWorkflowDraft, useUserLibrary, useWorkflowDraft } from "@/lib/hooks";
import { activeRunWarning, useGenerateRun } from "@/features/runs";
import { presentError } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { hasGeneratedOutput } from "@/features/projects/lib/nav";
import { hydrateWorkflowStore, useWorkflowStore, useWorkflowStoreApi, workflowDraftOf, WorkflowStoreProvider } from "./lib/model";
import { ContractSyncProvider, useContractSync } from "./lib/contract-sync";
import { toKitsetRefs, useWorkflowRefs } from "./lib/refs-sync";
import { SyncBadge } from "./components/SyncBadge";
import { WorkflowStepper } from "./steps/Stepper";
import { BriefStep } from "./steps/BriefStep";
import { StyleStep } from "./steps/StyleStep";
import { KitsetStep } from "./steps/KitsetStep";
import { MascotStep } from "./steps/MascotStep";
import { ReviewStep, DrawConfirmDialog, drawableOf } from "./steps/ReviewStep";
import { mergeElements, userUiElements } from "./lib/user-library";

/**
 * MÀN WORKFLOW — stepper **5 bước**, một mạch, và mạch đó kết thúc bằng cách RỜI KHỎI
 * wizard: bấm "Tạo ảnh" ở bước ⑤ là đóng dấu bản nháp hoàn tất rồi vào thẳng màn quản
 * lý dự án, tab "Ảnh đã tạo".
 *
 * Bước ⑥ "Kết quả" cũ đã bỏ. Nó là một bản nghèo hơn của tab "Ảnh đã tạo" (không
 * sidebar, không nhóm, không đường sửa lại) và bắt người dùng bấm thêm một nút "Xong"
 * để tới đúng nơi họ đằng nào cũng phải tới.
 *
 * Luật còn lại của hàng nút cuối trang (`.workflow-actions`) — từ UPGRADE-PLAN:
 *  · **§W1-10** — nút chính LUÔN ở góc dưới-phải. Bước 5 từng đặt ở đó một *câu xám*
 *    ("Cửa sổ xác nhận luôn hiện đủ số lượt…") còn nút thật thì nằm giữa thân trang.
 *    Câu đó đã xoá hẳn; nút "Tạo ảnh" về đúng chỗ 4 bước trước đã dạy.
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

  /**
   * MỘT CÂU DUY NHẤT cho ca "đang có lượt chạy", dùng cho CẢ HAI lớp (biết trước từ
   * `state`, và 409 RUN_CONFLICT của agent) — hai lớp nói hai câu khác nhau là cách
   * người dùng kết luận app đang đoán mò.
   *
   * Vừa BÁO vừa ĐƯA TỚI: người dùng bấm "Tạo ảnh" là để thấy ảnh chạy, nên câu trả lời
   * đúng cho "đã có lượt đang chạy rồi" là mở thẳng tiến trình đó, không phải một dialog
   * xác nhận thứ hai. Có `runId` thì vào đúng màn lượt chạy; chưa kịp có (run vừa khởi
   * động, `activeRun` còn rỗng) thì về mục "Ảnh đã tạo" — nơi tiến trình cũng hiện.
   */
  const showActiveRun = React.useCallback((runId: string | null, done: number, total: number) => {
    toast.info("Dự án đang có lượt chạy — xem tiến trình", {
      description: total > 0
        ? `Lượt hiện tại đã xong ${done}/${total}. Chờ xong hoặc dừng lượt đó rồi mới tạo lượt mới.`
        : "Chờ lượt đó xong hoặc dừng nó, rồi mới tạo được lượt mới.",
    });
    if (runId) void navigate({ to: "/p/$projectId/runs/$runId", params: { projectId, runId } });
    else void navigate({ to: "/p/$projectId", params: { projectId }, search: { section: "images" } });
  }, [navigate, projectId]);

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
      props: project.props ?? shared?.props,
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

  const steps = [<BriefStep />, <StyleStep />, <KitsetStep />, <MascotStep />, <ReviewStep />];
  /* Bản nháp cũ có thể mang `step: 6` (bước "Kết quả" đã bỏ) ⇒ kẹp về bước cuối còn
     tồn tại thay vì render `undefined` và để lại một trang trắng. */
  const content = steps[Math.min(s.step, steps.length) - 1];

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
          {/* ══ §B2 — ĐƯỜNG VỀ VỚI ẢNH ĐÃ CÓ ═══════════════════════════════════
              Wizard là màn "chưa có gì", nên nó chưa từng có một link nào trỏ sang
              trang kết quả. Với dự án đã gen xong thì đó là lỗ hổng thật: mở
              `/k/:id` (bookmark, nút Back, hay bị đá về) là mất hẳn đường tới
              `/p/:id?section=images` — kết quả vẫn nằm nguyên trên đĩa mà không ai
              vào xem được. Nút chỉ hiện khi ĐÃ CÓ ảnh; dự án trắng không thấy nó. */}
          {hasGeneratedOutput(project.data) && (
            <Button
              variant="secondary"
              onClick={() => void navigate({ to: "/p/$projectId", params: { projectId }, search: { section: "images" } })}
            >
              <Images aria-hidden />Xem ảnh đã tạo
            </Button>
          )}
          <SyncBadge sync={sync} />
        </div>
      </div>
      <WorkflowStepper />
      <div className="kg-page workflow-content">{content}</div>
      <WorkflowActions
        step={Math.min(s.step, steps.length)}
        drawable={drawableOf(s.elements).length}
        onBack={s.back}
        onNext={s.next}
        onDraw={() => {
          /* ĐANG CÓ LƯỢT CHẠY ⇒ NÓI THẲNG, ĐỪNG MỞ DIALOG XÁC NHẬN.
             Blind-test: bấm "Tạo ảnh" lúc dự án đang chạy thì dialog vẫn mở, nút đổi
             thành "Đang bắt đầu…" rồi im — agent trả 409 RUN_CONFLICT (đúng), nhưng
             câu duy nhất người dùng đọc được là "Chưa tạo ảnh được. Kiểm tra công cụ
             tạo ảnh trong Cài đặt." ⇒ họ tưởng mình vừa bấm hỏng cái gì đó.
             Cùng cách `GenerateDialog` (§④) đã làm ở màn dự án: biết trước thì đừng
             để user bấm rồi ăn 409. `activeRunWarning` là hàm CHUNG đã có sẵn cho
             việc này, nhìn cả `state.activeRun` lẫn `state.jobs` (ca run vừa khởi
             động, `activeRun` còn rỗng). */
          const active = activeRunWarning(project.data);
          if (active.hasActiveRun) {
            showActiveRun(active.runId, active.done, active.total);
            return;
          }
          setDrawOpen(true);
        }}
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
              /**
               * ⚠️ WIZARD KẾT THÚC Ở ĐÂY (mục ① của đợt tái cấu trúc).
               *
               * Trước đây `s.next()` đẩy người dùng sang bước ⑥ "Kết quả" — một bản
               * nghèo hơn của tab "Ảnh đã tạo" (không có sidebar, không có nhóm, không
               * có đường sửa lại), rồi bắt họ bấm thêm "Xong — về dự án". Nay bản nháp
               * được đóng dấu HOÀN TẤT và người dùng vào thẳng màn quản lý dự án.
               *
               * `completed: true` phải ghi TRƯỚC khi điều hướng: `ProjectScreen` thấy
               * `completed === false` là đá ngược về `/k/:id`, nên vào sớm một nhịp là
               * rơi vào vòng lặp wizard ⇄ dự án.
               */
              await saveDraft.mutateAsync({ completed: true, draft: workflowDraftOf(store.getState()) });
              toast.success("Đã bắt đầu tạo ảnh.", { description: "Theo dõi trong mục Ảnh đã tạo của dự án." });
              void navigate({ to: "/p/$projectId", params: { projectId }, search: { section: "images" } });
            } catch (err) {
              /* Lớp thứ hai của cùng một sự thật: agent mới là trọng tài. Cache của
                 `useProject` có staleTime 5s nên vẫn có khe cho một run khởi động
                 ngay trước cú bấm — 409 RUN_CONFLICT phải nói ĐÚNG câu như lớp trên,
                 không rơi vào câu "kiểm tra công cụ tạo ảnh" (sai địa chỉ hoàn toàn). */
              const v = presentError(err);
              if (v.code === "RUN_CONFLICT") {
                setDrawOpen(false);
                const d = v.details as { runId?: string } | null;
                showActiveRun(typeof d?.runId === "string" ? d.runId : null, 0, 0);
                return;
              }
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
/**
 * ⚠️ HAI CỬA RA (§W3-7 — `.zip` và Copy Figma) KHÔNG còn ở đây.
 *
 * Chúng từng nằm ở bước ⑥ "Kết quả". Bước đó đã bỏ, và ở bước ⑤ chúng luôn khoá vì
 * chưa có một ảnh nào được cắt. Nhà mới của chúng là tab **Ảnh đã tạo** trong màn quản
 * lý dự án (`features/project/sections/ImagesSection.tsx`) — nơi ảnh đã có thật.
 */
export function WorkflowActions({
  step, drawable, onBack, onNext, onDraw,
}: {
  step: number;
  drawable: number;
  onBack: () => void;
  onNext: () => void;
  onDraw: () => void;
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
    </div>
  );
}
