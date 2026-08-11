import { LayoutGrid, LibraryBig, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useCompactViewport } from "@/features/projects/lib/gate";
import { EmptyState } from "@/components/common";
import { useEditorStore } from "@/lib/store";
import type { JobStatus } from "@/lib/status";
import type { Contract } from "@/lib/types/contract";
import type { DesignApi } from "../contracts";
import type { DesignActions } from "../lib/useDesignActions";
import { findSheet } from "../lib/ops";
import { DesignTree } from "./DesignTree";
import { SheetCanvas } from "./SheetCanvas";
import { PropsPanel } from "./PropsPanel";
import { ValidateBar } from "./ValidateBar";

/**
 * TAB "Sheet & element" — KHUNG 3 VÙNG (§3-S3.1) bằng shadcn resizable.
 *
 * Tách khỏi `DesignScreen.tsx` để mỗi file dưới ~400 dòng và để chỗ này chỉ nói về
 * BỐ CỤC: ba cột co giãn, mỗi cột cuộn riêng, vùng ② còn thanh Validate dính đáy.
 *
 * Ba cột CUỘN ĐỘC LẬP là yêu cầu của spec, không phải sở thích: sheet 16 ô + panel
 * thuộc tính dài hơn màn hình, cuộn chung sẽ làm mất lưới khỏi tầm mắt khi sửa `spec`.
 */
export interface SheetsWorkspaceProps {
  api: DesignApi;
  contract: Contract;
  actions: DesignActions;
  sheetStatus: Record<string, JobStatus>;
  extraShapes: readonly string[];
  libIndex: Map<string, { spec?: string; skel?: Record<string, unknown> }>;
  stale: boolean;
  refUrlFor: (name: string | undefined) => string | null;
  imageFor: (comp: { file: string }, index: number) => { src: string; alt: string } | null;
  onOpenLibrary: () => void;
  onOpenResize: (sheetId: string) => void;
  onGenSheet: (sheetId: string) => void;
  onGoStyles: () => void;
  onOpenProjectSettings: () => void;
}

export function SheetsWorkspace(props: SheetsWorkspaceProps) {
  const { api, contract, actions, refUrlFor } = props;
  const layer = useEditorStore((s) => s.canvasLayer);
  const setLayer = useEditorStore((s) => s.setCanvasLayer);
  const previewVariantId = useEditorStore((s) => s.previewVariantId);
  const setPreviewVariant = useEditorStore((s) => s.setPreviewVariant);

  const activeSheet = api.activeSheetId ? findSheet(contract, api.activeSheetId) : null;
  const selectedIndex = api.selection.kind === "component" ? api.selection.index : null;
  const disProps = api.readOnly ? { disabled: true, title: api.readOnlyReason, "aria-disabled": true } : {};

  /* ── empty: project chưa có sheet nào (§3-S3 "empty (0 sheet)") ── */
  if (contract.sheets.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Chưa có sheet nào"
        description="Sheet là một tấm ảnh chứa nhiều element xếp theo lưới. Cách nhanh nhất là chọn element có sẵn trong thư viện."
        className="h-full"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="lg" className="gap-2" {...disProps} onClick={props.onOpenLibrary}>
              <LibraryBig className="size-4" aria-hidden />
              Chọn từ thư viện element
            </Button>
            <Button variant="secondary" size="lg" className="gap-2" {...disProps} onClick={() => actions.addSheet("blank")}>
              <Plus className="size-4" aria-hidden />
              Tạo sheet trống
            </Button>
          </div>
        }
      />
    );
  }

  /* §2.2 — dưới 1024px ba vùng phải XẾP DỌC.
     `key` đổi theo hướng vì `Group` giữ layout cũ nếu chỉ đổi prop `orientation`.

     ══ B4 — NGUYÊN NHÂN GỐC CỦA "RAIL TRÁI VỠ, CHỮ CẮT CỤT" ═══════════════════
     `defaultSize={20} minSize={14}` TRÔNG như phần trăm, nhưng
     react-resizable-panels@4 quy ước: **số = PIXEL**, chỉ chuỗi mới là phần trăm
     (dist/react-resizable-panels.js dòng 19-24: `case "number": return [e,"px"]`).
     Nên cây thiết kế được đặt rộng 20px với sàn 14px, panel thuộc tính 26px/18px
     ⇒ đúng cái rail ~40px với chữ cụt "Chu"/"bộ"/"pro" và panel phải bị xén ở mép
     màn hình mà chủ dự án nhìn thấy (ảnh 09).
     SỬA: mọi kích thước đều ghi RÕ ĐƠN VỊ. Tỉ lệ dùng "%", còn sàn dùng "px" thật
     để chữ trong rail không bao giờ bị cắt — đây mới là ràng buộc mình cần. */
  const compact = useCompactViewport();
  const orientation = compact ? "vertical" : "horizontal";

  return (
    <ResizablePanelGroup
      key={orientation}
      orientation={orientation}
      className={compact ? "h-full flex-col overflow-auto" : "h-full"}
    >
      {/* ① CÂY THIẾT KẾ */}
      <ResizablePanel
        defaultSize={compact ? "26%" : "22%"}
        minSize={compact ? "18%" : "232px"}
        maxSize={compact ? "50%" : "34%"}
        className="min-w-0"
      >
        <DesignTree
          contract={contract}
          validation={api.validation}
          selection={api.selection}
          activeSheetId={api.activeSheetId}
          sheetStatus={props.sheetStatus}
          readOnly={api.readOnly}
          readOnlyReason={api.readOnlyReason}
          onSelect={api.select}
          onAddSheet={actions.addSheet}
          onSheetMenu={(sheetId, action) => {
            if (action === "resize") props.onOpenResize(sheetId);
            else if (action === "duplicate") actions.duplicateSheet(sheetId);
            else if (action === "delete") actions.deleteSheet(sheetId);
            else api.select({ kind: "sheet", sheetId });
          }}
          onMoveSheet={actions.moveSheet}
          onAddCharacter={actions.addCharacter}
          onGoStyles={props.onGoStyles}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* ② KHUNG SHEET + thanh Validate */}
      <ResizablePanel defaultSize={compact ? "44%" : "52%"} minSize={compact ? "30%" : "360px"} className="min-w-0">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            {activeSheet ? (
              <SheetCanvas
                contract={contract}
                sheet={activeSheet}
                validation={api.validation}
                selectedIndex={selectedIndex}
                layer={layer}
                onLayerChange={setLayer}
                previewVariantId={previewVariantId}
                onPreviewVariantChange={setPreviewVariant}
                readOnly={api.readOnly}
                readOnlyReason={api.readOnlyReason}
                stale={props.stale}
                imageFor={props.imageFor}
                onSelect={(i) => api.select({ kind: "component", sheetId: activeSheet.id, index: i })}
                onActivate={(i) => api.select({ kind: "component", sheetId: activeSheet.id, index: i })}
                onMove={(from, to) => actions.moveCell(activeSheet.id, from, to)}
                onDelete={(i) => actions.deleteCell(activeSheet.id, i)}
                onResize={() => props.onOpenResize(activeSheet.id)}
                onOpenLibrary={props.onOpenLibrary}
                onGenSheet={() => props.onGenSheet(activeSheet.id)}
              />
            ) : (
              <EmptyState
                icon={LayoutGrid}
                title="Chọn một sheet"
                description="Bấm vào một sheet ở cây bên trái để xem lưới ô của nó."
                className="h-full"
              />
            )}
          </div>
          <ValidateBar
            validation={api.validation}
            onGoTo={api.goToTarget}
            onQuickFix={actions.quickFix}
            readOnly={api.readOnly}
          />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* ③ THUỘC TÍNH */}
      <ResizablePanel
        defaultSize={compact ? "30%" : "26%"}
        minSize={compact ? "20%" : "280px"}
        maxSize={compact ? "55%" : "40%"}
        className="min-w-0"
      >
        <PropsPanel
          contract={contract}
          selection={api.selection}
          validation={api.validation}
          readOnly={api.readOnly}
          readOnlyReason={api.readOnlyReason}
          extraShapes={props.extraShapes}
          libIndex={props.libIndex}
          refUrlFor={refUrlFor}
          handlers={{
            patchCell: actions.patchCell,
            deleteCell: actions.deleteCell,
            resetCellToLib: (sheetId, index) => {
              const comp = findSheet(contract, sheetId)?.components[index];
              const lib = comp ? props.libIndex.get(comp.file) : null;
              if (lib) actions.resetCellToLib(sheetId, index, lib);
            },
            patchSheet: actions.patchSheet,
            renameSheet: actions.renameSheet,
            setSheetVariants: actions.setSheetVariants,
            resizeSheet: props.onOpenResize,
            deleteSheet: actions.deleteSheet,
            genSheet: props.onGenSheet,
            sliceSheet: props.onGenSheet,
            patchCharacter: actions.patchCharacter,
            togglePose: actions.togglePose,
            pickCharacterRef: props.onOpenProjectSettings,
            deleteCharacter: actions.deleteCharacter,
            goStyles: props.onGoStyles,
          }}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
