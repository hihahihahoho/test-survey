import * as React from "react";
import { useViewport, type Rect } from "@/lib/viewport";
import type { CanvasDoc, DraftBadge } from "@/features/docs/lib";
import { cn } from "@/lib/utils";
import { contentRectOf, showsViewport, type CanvasPhase, type CanvasSaveState } from "../lib/canvas-state";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasRail } from "./CanvasRail";
import { CanvasEmptyCard } from "./CanvasEmptyCard";
import { CanvasStatusStrip } from "./CanvasStatusStrip";
import { CanvasWorld } from "./CanvasWorld";
import { CanvasFloatRow, CanvasSafeArea, CanvasStripRow } from "./CanvasLayers";
import { CanvasAgentOffline, CanvasError, CanvasLoading, CanvasTimeout } from "./CanvasStates";
import { isCompactFrame } from "../lib/canvas-layers";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * KHUNG BÀN LÀM VIỆC (canvas shell) — FE-2 · D1
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ĐÂY LÀ **KHUNG XEM TRƯỚC**, KHÔNG PHẢI CANVAS THẬT. Ranh giới cứng của FE2-PLAN §3-D1:
 * không node N1–N7, không chọn/kéo/resize/undo/thả file/đông cứng, không `@use-gesture`,
 * không `@dnd-kit`, không ghi contract, không clipboard Figma. Những thứ đó là FE-3/FE-5.
 * Cái CÓ THẬT ở đây: pan/zoom chạy được, dot-grid, thanh công cụ nổi, 5 trạng thái tử tế.
 *
 * DÙNG LẠI HẠ TẦNG, KHÔNG VIẾT LẠI:
 *   · `useViewport` (`@/lib/viewport`, FE-1·B1) — toàn bộ toán pan/zoom/fit + bàn phím.
 *   · `FloatingToolbar` (`@/components/common`, FE-1·B2) — pill/blur/vòng phím APG.
 *   · `docsRepo().load/save` qua `useCanvasDoc` — cửa dữ liệu duy nhất (§4).
 *
 * ROUTER-AGNOSTIC: component nhận dữ liệu + callback, không import router. E1 nối route
 * `/p/:projectId/f/:fileId`; đổi router không phải sửa file này (cùng luật với `FileTabsBar`).
 */
export interface CanvasShellProps {
  projectId?: string;
  /** Tên file con để hiện trên nhãn nhỏ phía trên (FLORA-REF §2.6). */
  docName: string;
  phase: CanvasPhase;
  canvas: CanvasDoc | null;
  errorTitle: string;
  errorDetail?: string;
  onRetry: () => void;
  /** Đường lùi: mở bộ kit ở dạng form khi bàn làm việc không mở được (UX-V3 §6 hàng C1). */
  onOpenWorkflow?: () => void;
  saveState: CanvasSaveState;
  badge: DraftBadge;
  agentOffline?: boolean;
  /** Lệnh chạy công cụ local — khung app truyền xuống (ngoài glob D). */
  agentCommand?: string;
  /**
   * ══ THÊM Ở C2 ══ Hộp «✨ Nhờ máy vẽ» (`features/gen`). Truyền qua đây thay vì import
   * thẳng: `CanvasShell` giữ nguyên tính thuần-trình-bày, story dựng được mọi ca mà không
   * cần cả feature gen. Bỏ trống ⇒ `CanvasToolbar` hiện nút khoá có lý do.
   */
  genSlot?: React.ReactNode;
  /** Mở lớp phủ «📦 Đóng gói» (C2). Bỏ trống ⇒ nút giữ trạng thái «sắp có». */
  onPack?: () => void;
  canCopy?: boolean;
  onCanvasChange?: (next: CanvasDoc) => void;
  onCanvasTool?: (tool: "select" | "frame" | "image" | "note" | "link") => void;
  /**
   * TẦNG 5 — lớp phủ C2 phủ kín khung canvas (trên cả floatbar). Nó là lớp phủ **mỏng**:
   * user vẫn thấy bàn của mình mờ phía sau (UX-V3 §4.2), nên nó nằm TRONG khung này
   * chứ không phải một màn riêng.
   */
  packLayer?: React.ReactNode;
  className?: string;
}

export function CanvasShell(props: CanvasShellProps) {
  const {
    projectId, docName, phase, canvas, errorTitle, errorDetail, onRetry, onOpenWorkflow,
    saveState, badge, agentOffline, agentCommand, genSlot, onPack, canCopy, packLayer, onCanvasChange, onCanvasTool, className,
  } = props;

  // Bbox nội dung được tính LẠI theo `canvas` chứ không cache trong ref: FE-2 luôn rỗng,
  // nhưng FE-3 sẽ đổi node liên tục và một ref cũ sẽ làm `⌘1` fit vào chỗ không còn gì.
  const rectRef = React.useRef<Rect | null>(null);
  rectRef.current = contentRectOf(canvas);

  const vp = useViewport({
    initial: canvas?.viewport ?? { x: 0, y: 0, k: 1 },
    getContentRect: () => rectRef.current,
    // Chưa có "vật đang chọn" ở FE-2 ⇒ `⌘2` hành xử như `⌘1` (`applyCommand` đã lo).
    // Không trả rect giả để tránh phím chết (a11y §5.8).
    getSelectionRect: () => null,
    disabled: !showsViewport(phase),
  });

  const canFit = rectRef.current !== null;
  const headingId = React.useId();

  /**
   * Khung thấp (< 520px) ⇒ thẻ giới thiệu thu gọn (UX-V3 §7.3). Chiều cao lấy từ
   * `vp.containerSize` — chính con số `useViewport` đã đo bằng `ResizeObserver`, KHÔNG
   * gắn thêm observer thứ hai và KHÔNG đọc `window.innerHeight` (khung canvas nhỏ hơn
   * cửa sổ vì còn header + banner agent).
   */
  const compact = isCompactFrame(vp.containerSize.height);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex h-full min-h-0 flex-1 overflow-hidden bg-canvas", className)}
    >
      <CanvasRail onTool={onCanvasTool} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/*
          ══ SỬA LỖI «TIÊU ĐỀ LẶP» (FLOW-V3 §5, UX-V3 §7.1/§7.3) ══
          Bản cũ in `{docName} · bàn ý tưởng` NGAY DƯỚI breadcrumb đã mang tên file ⇒ tên
          bộ kit hiện hai lần, đọc ra thành «Bàn ý tưởng · bàn ý tưởng». Ở IA mới **file và
          bộ kit là một** (BA-V3 §3.5) nên cấp `doc` biến mất và dòng này không còn lý do
          tồn tại. Tiêu đề nhìn thấy được thuộc breadcrumb 2 cấp của khung app (chủ: E).

          Vẫn giữ MỘT `h1` cho `aria-labelledby` của `<section>`: bỏ hẳn thì vùng mốc mất
          tên, trình đọc màn hình chỉ đọc «region». Nó `sr-only` và **không chứa tên bộ
          kit** ⇒ không đếm vào lần xuất hiện thứ hai.
        */}
        <h1 id={headingId} className="sr-only">
          Bàn làm việc
        </h1>

        {agentOffline && (
          <div className="shrink-0 px-5 pb-3">
            <CanvasAgentOffline command={agentCommand} />
          </div>
        )}

        {phase === "loading" ? (
          <CanvasLoading />
        ) : phase === "timeout" ? (
          <CanvasTimeout onRetry={onRetry} />
        ) : phase === "error" ? (
          <CanvasError title={errorTitle} detail={errorDetail} onRetry={onRetry} onFallback={onOpenWorkflow} />
        ) : (
          <CanvasViewport
            vp={vp}
            label={`Bàn làm việc ${docName}`}
            overlay={
              <>
                {/*
                  BA TẦNG GHIM THEO MÀN HÌNH — mỗi tầng một khung neo RỜI (UX-V3 §7.2).
                  Thứ tự viết ở đây là thứ tự Tab: thẻ (tầng 2) → dải (tầng 3) → thanh nổi
                  (tầng 4); rail đứng trước cả khối này trong DOM nên vòng Tab ra đúng
                  rail → thẻ → dải → thanh nổi (tiêu chí §7.3).

                  Ca EMPTY ghim theo MÀN HÌNH chứ không theo thế giới: kéo bàn đi xa thì
                  thẻ vẫn ở giữa tầm mắt, còn thanh nổi bất động.
                */}
                {phase === "empty" && (
                  <CanvasSafeArea>
                    <CanvasEmptyCard compact={compact} className="pointer-events-auto" />
                  </CanvasSafeArea>
                )}
                <CanvasStripRow>
                  <CanvasStatusStrip save={saveState} badge={badge} />
                </CanvasStripRow>
                <CanvasFloatRow>
                  <CanvasToolbar vp={vp} canFit={canFit} genSlot={genSlot} onPack={onPack} canCopy={canCopy ?? canFit} />
                </CanvasFloatRow>
                {/*
                  TẦNG 5 (UX-V3 §7.2 dòng `overlay`): lớp phủ «Đóng gói». Viết CUỐI cùng
                  trong overlay nên nó nằm sau ba tầng kia cả về DOM lẫn về z — không phải
                  đặt thêm số z rời rạc nào ở đây.
                */}
                {packLayer}
              </>
            }
          >
            {/*
              Lớp thế giới của FE-2 CỐ Ý RỖNG. Một ô mốc 1×1px trong suốt được đặt ở gốc
              toạ độ để DevTools/test nhìn thấy `transform` đang áp lên cái gì; nó không
              vẽ gì và không nhận sự kiện. FE-3 thay chỗ này bằng node thật.
            */}
            <div data-testid="canvas-origin" aria-hidden className="pointer-events-none size-px" />
            {canvas && <CanvasWorld projectId={projectId} canvas={canvas} onChange={onCanvasChange} />}
          </CanvasViewport>
        )}
      </div>
    </section>
  );
}
