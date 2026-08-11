import * as React from "react";
import { useDraftBadge } from "@/features/docs/hooks";
import { GenPopover, PackOverlay, packItems } from "@/features/gen";
import { api } from "@/lib/api";
import { useContract } from "@/lib/hooks";
import { useGenerateRun } from "@/features/runs";
import { toast } from "@/components/ui/sonner";
import { CanvasShell } from "./components/CanvasShell";
import { useCanvasDoc } from "./lib/use-canvas-doc";
import { useGenContext } from "./lib/use-gen-context";

/**
 * ĐIỂM NỐI DỮ LIỆU của bàn làm việc — chỗ DUY NHẤT trong nhánh canvas chạm `docsRepo`
 * (gián tiếp qua `useCanvasDoc`). `CanvasShell` bên dưới thuần trình bày, nhờ vậy story
 * và test dựng được mọi trạng thái mà không cần IndexedDB.
 *
 * E1 (route) import ĐÚNG component này. Nó vẫn không biết router: mọi điều hướng đi ra
 * ngoài bằng callback (`onOpenWorkflow`, `onPacked`).
 *
 * ══ THÊM Ở C2 ══ Nối ba thứ:
 *   · `GenPopover` vào chỗ cắm `genSlot` của thanh nổi (nút accent duy nhất của màn);
 *   · nút «📦 Đóng gói» mở `PackOverlay` (lớp phủ C2, không rời màn);
 *   · `useGenContext` cấp ba con số THẬT (có ảnh nhân vật chưa · đang vẽ không · bàn có
 *     bao nhiêu thứ). Đọc-only, **không** có lời gọi huỷ lượt vẽ nào (C-01).
 *
 * Nút **Vẽ** gọi gateway run thật; agent là lớp duy nhất spawn Codex và tự cắt ảnh.
 */
export interface CanvasFileViewProps {
  projectId: string;
  docId: string;
  docName: string;
  agentOffline?: boolean;
  agentCommand?: string;
  onOpenWorkflow?: () => void;
  /**
   * Đóng gói xong → chuyển sang màn kết quả với bộ lọc = tập id đã chọn (UX-V3 §4.2).
   * Chưa nối (E1 chưa chạy) ⇒ nút khoá **có lý do đọc được**, không im lặng.
   */
  onPacked?: (ids: string[]) => void;
}

export function CanvasFileView(props: CanvasFileViewProps) {
  const { projectId, docId, docName, agentOffline, agentCommand, onOpenWorkflow, onPacked } = props;
  const doc = useCanvasDoc(projectId, docId);
  const badge = useDraftBadge();
  const gen = useGenContext(projectId, doc.canvas);
  const contractQ = useContract(projectId);
  const startRun = useGenerateRun(projectId);
  const [packing, setPacking] = React.useState(false);
  const imageInput = React.useRef<HTMLInputElement>(null);

  const addNode = React.useCallback((type: "frame" | "note" | "image-ref", text: string, refPath?: string) => {
    if (!doc.canvas) return;
    const seq = doc.canvas.nodes.length + 1;
    void doc.save({ ...doc.canvas, nodes: [...doc.canvas.nodes, { id: `node-${Date.now().toString(36)}-${seq}`, type, x: 80 + seq * 24, y: 80 + seq * 24, w: type === "note" ? 220 : 320, h: type === "note" ? 140 : 220, z: seq, text, bind: refPath ? { kind: "ref" as const, id: refPath } : null }] });
  }, [doc.canvas, doc.save]);

  const uploadImage = React.useCallback(async (file: File) => {
    try {
      const uploaded = await api.refs.add(projectId, file, "inspo", file.name);
      addNode("image-ref", file.name, uploaded.path);
      toast.success("Đã thêm ảnh vào bàn.");
    } catch { toast.error("Chưa thêm được ảnh. Hãy thử lại."); }
  }, [projectId, addNode]);

  const items = React.useMemo(() => packItems(doc.canvas), [doc.canvas]);

  return (
    <>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Chọn ảnh đưa vào bàn" onChange={(e) => { const f=e.target.files?.[0]; if(f) void uploadImage(f); e.currentTarget.value=""; }} />
    <CanvasShell
      projectId={projectId}
      docName={docName}
      phase={doc.phase}
      canvas={doc.canvas}
      errorTitle={doc.errorTitle}
      errorDetail={doc.errorDetail}
      onRetry={doc.refetch}
      onOpenWorkflow={onOpenWorkflow}
      saveState={doc.saveState}
      badge={badge}
      agentOffline={agentOffline}
      agentCommand={agentCommand}
      genSlot={
        <GenPopover
          hasCharacterRef={gen.hasCharacterRef}
          selectedComponentCount={0}
          boardItemCount={gen.boardItemCount}
          agentOffline={agentOffline}
          generating={startRun.isPending}
          generateDisabled={!contractQ.data?.contract || contractQ.data.contract.sheets.length === 0}
          onGenerate={() => {
            const contract = contractQ.data?.contract;
            if (!contract) return;
            startRun.startContractWithCallbacks(contract, {
              onSuccess: ({ runId }) => toast.success(`Đã bắt đầu lượt vẽ ${runId}. Ảnh sẽ tự cắt khi hoàn tất.`),
              onError: () => toast.error("Chưa bắt đầu vẽ được. Kiểm tra Codex image trong phần môi trường."),
            });
          }}
        />
      }
      onPack={() => setPacking(true)}
      canCopy={items.length > 0}
      onCanvasChange={(next) => void doc.save(next)}
      onCanvasTool={(tool) => {
        if (tool === "frame") addNode("frame", "Khung mới");
        if (tool === "note") addNode("note", "Ghi chú mới");
        if (tool === "image") imageInput.current?.click();
      }}
      packLayer={
        packing ? (
          <PackOverlay
            items={items}
            runActive={gen.runActive}
            agentOffline={agentOffline}
            agentCommand={agentCommand}
            disabledReason={
              onPacked ? undefined : "Màn kết quả chưa mở ở bản này, nên chưa đóng gói được."
            }
            onPack={(ids) => {
              setPacking(false);
              onPacked?.(ids);
            }}
            onClose={() => setPacking(false)}
          />
        ) : null
      }
    />
    </>
  );
}
