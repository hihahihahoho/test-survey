import * as React from "react";
import { Download, FolderOpen, RefreshCw, SkipForward } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { KeyboardHint } from "@/components/common";
import { useRegisterCommands } from "@/components/layout";
import { useAgentStatus } from "@/lib/hooks";
import type { BridgeResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS, GHOST_PILL } from "@/components/layout/flora";
import { WizardStepper } from "./components/WizardStepper";
import { DisplayTitle } from "./components/StepShell";
import { InlineBanner } from "./components/InlineBanner";
import { useSetupExit, type ExitIntent } from "./hooks/use-setup-exit";
import { useSetupWizard } from "./hooks/use-setup-wizard";
import { useSetupDoctor } from "./hooks/use-setup-doctor";
import { useSetupKeys } from "./hooks/use-setup-keys";
import { persistableMode } from "./lib/doctor-view";
import { StepInstall } from "./steps/StepInstall";
import { StepConnect } from "./steps/StepConnect";
import { StepWorkspace } from "./steps/StepWorkspace";
import { StepImageGen } from "./steps/StepImageGen";

/**
 * S0 · ONBOARDING / SETUP LẦN ĐẦU — `/setup` (UX-SPEC §3-S0).
 *
 * Điểm vào duy nhất của màn, theo hợp đồng lazy-mount của R1-P1
 * (`features/setup/SetupScreen.tsx`, export default + named).
 *
 * Mục đích của cả màn, nói bằng một câu: đưa người mới từ "vừa mở link" tới "đã có công
 * cụ local chạy + biết thư mục làm việc ở đâu + biết tạo ảnh được hay không" trong ≤5
 * phút, KHÔNG cần đọc README và KHÔNG phải gõ đường dẫn nào vào web.
 *
 * BỐN QUYẾT ĐỊNH ĐÁNG GHI LẠI:
 *
 * 1. Màn này KHÔNG bọc `AppShell`. Header của AppShell có agent pill + workspace pill +
 *    ⌘K — toàn thứ chưa có nghĩa với người chưa cài xong công cụ. Wireframe §3-S0 cũng
 *    vẽ một thanh tối giản chỉ có logo và nút "Bỏ qua". Route cha (R1-P1) vì thế không
 *    cần truyền gì; màn tự dựng khung của nó.
 *
 * 2. Trạng thái kết nối lấy từ `useAgentStatus()` của R0 — nhịp probe backoff
 *    1.5→3→6→15s, tab ẩn thì dừng. Màn KHÔNG tự viết vòng poll: hai vòng probe song song
 *    là cách chắc chắn nhất để có hai câu trả lời khác nhau trên cùng một màn hình.
 *
 * 3. Tiến độ wizard nằm trong `kitgen.setup.v1` (Zustand persist của R0) ⇒ tắt tab giữa
 *    chừng, mở lại vẫn đúng bước. Xem `lib/steps.ts` để biết vì sao phải MAP enum.
 *
 * 4. Không có đường nào ở màn này ghi/log thứ gì liên quan đăng nhập. Thứ duy nhất đi
 *    vào localStorage khi kết thúc là: cờ `completed`, bước, version + protocol đã thấy,
 *    và **enum** mode tạo ảnh.
 */
export interface SetupScreenProps {
  /**
   * Hợp đồng `ScreenProps` của R1-P1 không truyền gì cho màn này (S0 không thuộc ngữ
   * cảnh project). Prop dưới đây chỉ để test và để R1-P1 chèn điều hướng riêng nếu cần —
   * KHÔNG truyền thì màn tự đi bằng router, xem `useSetupExit`.
   */
  onDone?: (intent: ExitIntent) => void;
}

export function SetupScreen({ onDone }: SetupScreenProps) {
  const wizard = useSetupWizard();
  const exit = useSetupExit();
  const { status, recheck, runBridgeProbe } = useAgentStatus();
  const [bridgeResult, setBridgeResult] = React.useState<BridgeResult | null>(null);
  const [probing, setProbing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const needsDoctor = wizard.step === "workspace" || wizard.step === "imagegen";
  const doctor = useSetupDoctor({ active: needsDoctor, connected: status.connected });

  /* Tách callback ra biến: `wizard` là object mới mỗi lần render, để nguyên nó trong
     mảng phụ thuộc thì effect chạy lại mỗi render. Các hàm bên trong đã `useCallback`. */
  const { autoAdvanceOnConnect, rememberAgent } = wizard;

  /* Bước 1 tự sang bước 2 khi thấy agent — chỉ một lần, và chỉ khi user chưa tự bấm. */
  React.useEffect(() => {
    autoAdvanceOnConnect(status.connected);
  }, [status.connected, autoAdvanceOnConnect]);

  /* Ghi nhận version/protocol ngay khi kết nối được (bảng trạng thái §3-S0, hàng success). */
  const seenRef = React.useRef("");
  React.useEffect(() => {
    if (!status.connected) return;
    const sig = `${status.agentVersion ?? ""}|${status.health?.protocol ?? ""}`;
    if (seenRef.current === sig) return;
    seenRef.current = sig;
    rememberAgent({
      version: status.agentVersion,
      protocol: status.health?.protocol ?? null,
    });
  }, [status.connected, status.agentVersion, status.health?.protocol, rememberAgent]);

  /* Cầu dò popup — CHỈ từ cử chỉ user, popup tự mở sẽ bị trình duyệt chặn (arch §5.3). */
  const onProbe = React.useCallback(async () => {
    setProbing(true);
    try {
      const r = await runBridgeProbe();
      setBridgeResult(r);
      if (r.blockedPopup) {
        toast.warning("Trình duyệt chặn cửa sổ kiểm tra", {
          description: "Cho phép popup cho trang này rồi bấm lại.",
        });
      }
    } finally {
      setProbing(false);
    }
  }, [runBridgeProbe]);

  const leave = React.useCallback(
    (intent: ExitIntent) => {
      if (onDone) onDone(intent);
      else exit(intent);
    },
    [onDone, exit]
  );

  const finish = React.useCallback(() => {
    wizard.finish(persistableMode(doctor.doctor));
  }, [wizard, doctor.doctor]);

  useSetupKeys({
    containerRef,
    onBack: wizard.back,
    onNext: wizard.next,
  });

  /**
   * Lệnh ⌘K của màn (hợp đồng TUỲ CHỌN của R1-P1). §2.3: "mọi hành động trong spec phải
   * gọi được từ đây". §2.5-2: lệnh không dùng được thì đặt `disabledReason` — KHÔNG ẩn,
   * vì ẩn làm user tưởng tính năng biến mất.
   */
  useRegisterCommands(
    () => [
      {
        id: "setup.recheck",
        label: "Kiểm tra lại công cụ local",
        icon: RefreshCw,
        run: () => {
          recheck();
          doctor.recheck();
        },
      },
      {
        id: "setup.download-script",
        label: "Tải script chuẩn bị máy",
        icon: Download,
        run: () => wizard.goto("install"),
      },
      {
        id: "setup.workspace",
        label: "Chọn thư mục làm việc",
        icon: FolderOpen,
        run: () => wizard.goto("workspace"),
      },
      {
        id: "setup.skip",
        label: "Bỏ qua cài đặt — tôi đã cài rồi",
        icon: SkipForward,
        disabledReason: wizard.rerun ? "Bạn đang chạy lại hướng dẫn, không cần bỏ qua" : null,
        run: wizard.skipToWorkspace,
      },
    ],
    [recheck, doctor.recheck, wizard.goto, wizard.skipToWorkspace, wizard.rerun]
  );

  return (
    <div className={cn("min-h-dvh", FLORA.canvas)}>
      <a href="#kg-setup-main" className="kg-skip-link">
        Tới nội dung chính
      </a>

      {/* Thanh tối giản theo wireframe §3-S0: chỉ logo + lối thoát. Vỏ FLORA: cao 56px,
          nền #000, một hairline dưới. */}
      <header
        className={cn(
          "sticky top-0 z-sticky flex h-14 items-center gap-3 border-b px-4 sm:px-6",
          FLORA.canvas, FLORA.hair,
        )}
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-[18px] rounded-1 border", FLORA.accentBorder, "bg-accent/[var(--kg-tint-a)]")}
          />
          <span className="text-subtitle font-medium tracking-[-0.01em] text-fg-strong">kit-gen</span>
        </span>
        <span className="flex-1" />
        {/* §3-S0: lối thoát cho người đã cài rồi — nhảy thẳng tới bước 3 (Thư mục). */}
        <button
          type="button"
          onClick={() => (wizard.rerun ? leave("home") : wizard.skipToWorkspace())}
          className={cn("inline-flex h-8 items-center px-3.5 text-label", GHOST_PILL, FOCUS)}
        >
          {wizard.rerun ? "Về danh sách project" : "Bỏ qua, tôi đã cài rồi →"}
        </button>
      </header>

      <main
        id="kg-setup-main"
        tabIndex={-1}
        ref={containerRef}
        className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 py-14 focus-visible:outline-none sm:px-6 sm:py-20"
      >
        <div className="flex flex-col gap-6">
          {/* §2.5 FLORA: tiêu đề trang nhấn ĐÚNG 1 từ khoá bằng serif italic. */}
          {/* W2B-5 · luật Playfair điều ②: nhấn tối đa MỘT từ. Chữ đọc ra không đổi
              ("Cài đặt lần đầu"), chỉ ranh giới `<em>` dịch sang phải một từ. */}
          <DisplayTitle lead="Cài đặt lần" accent="đầu" />
          <WizardStepper current={wizard.step} visited={wizard.visited} onGoto={wizard.goto} />
        </div>

        {wizard.rerun && (
          <InlineBanner
            tone="info"
            title="Bạn đang chạy lại hướng dẫn cài"
            description="Đổi thư mục làm việc ở bước 3, xong thì bấm về danh sách project. Dữ liệu hiện có không bị đụng tới."
          />
        )}

        {wizard.step === "install" && (
          <StepInstall connected={status.connected} onNext={wizard.next} onTrouble={() => wizard.goto("connect")} />
        )}

        {wizard.step === "connect" && (
          <StepConnect
            status={status}
            bridgeResult={bridgeResult}
            probing={probing}
            onProbe={onProbe}
            onRecheck={recheck}
            onNext={wizard.next}
          />
        )}

        {wizard.step === "workspace" && (
          <StepWorkspace
            status={status}
            doctor={doctor.doctor}
            doctorLoading={doctor.loading || doctor.refreshing}
            onRecheck={() => {
              recheck();
              doctor.recheck();
            }}
            onNext={wizard.next}
            onWorkspaceChanged={doctor.recheck}
          />
        )}

        {wizard.step === "imagegen" && (
          <StepImageGen
            doctor={doctor.doctor}
            loading={doctor.loading}
            refreshing={doctor.refreshing}
            error={doctor.error}
            agentOffline={doctor.agentOffline}
            onRecheck={() => {
              recheck();
              doctor.recheck();
            }}
            onFinish={finish}
            onCreateFirst={() => leave("create")}
            onImport={() => leave("import")}
          />
        )}

        <footer
          className={cn(
            "mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-5 text-caption",
            FLORA.hair, FLORA.fgMuted,
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <KeyboardHint keys={["enter"]} /> nút chính của bước
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KeyboardHint keys={["alt", "arrowleft"]} /> /
            <KeyboardHint keys={["alt", "arrowright"]} /> lùi · tiến bước
          </span>
          {/* P-SWEEP·8 — câu "Tiến độ được nhớ lại — bạn đóng tab giữa chừng vẫn đi
              tiếp được." ĐÃ BỎ khỏi chân trang. Nó hứa một hành vi mà người dùng chỉ
              kiểm chứng được SAU khi đóng tab, nên đọc lúc này không đổi việc gì họ
              làm; còn hàng chân trang thì phình từ hai mục phím tắt lên ba mục. Wizard
              vẫn nhớ tiến độ y như cũ — bỏ câu quảng cáo, không bỏ tính năng. */}
        </footer>
      </main>
    </div>
  );
}

export default SetupScreen;
