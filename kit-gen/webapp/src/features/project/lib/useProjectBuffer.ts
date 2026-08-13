/**
 * useProjectBuffer.ts — SỬA LÀ BUFFER, LƯU MỚI LÀ LƯU.
 *
 * ══ BỆNH ĐANG CHỮA ═══════════════════════════════════════════════════════════
 * Màn quản lý dự án trước đây dùng nguyên bộ autosave của wizard: chạm vào bất kỳ ô
 * nào là 700ms sau contract trên đĩa đã bị ghi đè, kèm dòng chữ *"Thay đổi được lưu
 * tự động. Tạo lại để áp dụng vào ảnh."*. Hậu quả người dùng thấy ngay: ảnh vừa tạo
 * xong bị đối chiếu với contract MỚI và lập tức mang nhãn *"15 ô lệch bộ khung · Cần
 * tạo lại"* — họ chưa quyết định gì cả, mới chỉ chạm thử một ô.
 *
 * ══ CÁCH CHỮA ════════════════════════════════════════════════════════════════
 * `useContractSync(..., { autosave: false })` ⇒ KHÔNG có đường nào ghi đĩa ngoài
 * `save()` ở đây. Store zustand vẫn là nơi mọi form ghi vào (không phải viết lại 4
 * form), nhưng nó nay đóng vai **bản nháp trong RAM**: `baseline` là ảnh chụp lần lưu
 * gần nhất, `dirty` là phép so với ảnh chụp đó, `revert()` là dán ảnh chụp trở lại.
 *
 * Nhờ vậy việc "đánh dấu lệch / cần tạo lại" chỉ có thể xảy ra SAU một cú bấm Lưu —
 * đúng yêu cầu, và cũng đúng §2 của sitemap ("sửa dữ liệu không tự tiêu quota").
 */
import * as React from "react";
import { useSaveWorkflowDraft } from "@/lib/hooks";
import { toast } from "@/components/ui/sonner";
import { workflowDraftOf, type WorkflowState, type WorkflowStore } from "@/features/workflow-v4/lib/model";
import type { ContractSync } from "@/features/workflow-v4/lib/contract-sync";

/**
 * Phần state được coi là "nội dung dự án". `step`/`unlocked` bị loại: chúng là vị trí
 * con trỏ trong wizard, không phải dữ liệu, và để chúng vào thì mở màn ra đã thấy bẩn.
 */
export function projectBufferOf(state: WorkflowState): Record<string, unknown> {
  const { step: _step, unlocked: _unlocked, ...rest } = workflowDraftOf(state);
  return rest;
}

const snapshotOf = (state: WorkflowState) => JSON.stringify(projectBufferOf(state));

export interface ProjectBuffer {
  /** Có thay đổi chưa lưu không. */
  dirty: boolean;
  saving: boolean;
  /** Ghi contract + bản nháp xuống đĩa. `false` ⇒ chưa lưu được, đã báo cho người dùng. */
  save: () => Promise<boolean>;
  /** Bỏ mọi thay đổi chưa lưu, quay về đúng bản đã lưu gần nhất. */
  revert: () => void;
}

export function useProjectBuffer(input: {
  projectId: string;
  store: WorkflowStore;
  /** Trạng thái store hiện tại — truyền vào để hook tính lại `dirty` theo mỗi lần render. */
  state: WorkflowState;
  sync: ContractSync;
  /** `false` khi màn còn đang nạp ⇒ chưa chốt mốc so sánh. */
  ready: boolean;
}): ProjectBuffer {
  const { projectId, store, state, sync, ready } = input;
  const saveDraft = useSaveWorkflowDraft(projectId);
  const [baseline, setBaseline] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  /* Mốc so sánh được chốt MỘT lần, ngay khi màn có đủ dữ liệu. Chốt sớm hơn (lúc còn
     `loading`) thì mốc là state rỗng ⇒ vừa mở màn đã "có thay đổi chưa lưu". */
  React.useEffect(() => {
    if (!ready || baseline !== null) return;
    setBaseline(snapshotOf(store.getState()));
  }, [baseline, ready, store]);

  const current = snapshotOf(state);
  const dirty = baseline !== null && baseline !== current;

  const save = React.useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const wrote = await sync.saveNow();
      if (!wrote) {
        toast.error("Chưa lưu được cài đặt", { description: "Kiểm tra công cụ local rồi thử lại. Thay đổi của bạn vẫn còn trên máy." });
        return false;
      }
      try {
        await saveDraft.mutateAsync({ completed: true, draft: workflowDraftOf(store.getState()) });
      } catch {
        /* Contract — thứ quyết định ảnh — đã ghi xong. Bản nháp hỏng là chuyện nhỏ hơn
           hẳn, và nói ra bằng một toast lỗi ở đây sẽ mâu thuẫn với việc vừa lưu được. */
      }
      setBaseline(snapshotOf(store.getState()));
      return true;
    } finally {
      setSaving(false);
    }
  }, [saveDraft, store, sync]);

  const revert = React.useCallback(() => {
    if (baseline === null) return;
    store.setState(JSON.parse(baseline) as Partial<WorkflowState>);
  }, [baseline, store]);

  /* Rời TRANG (đóng tab, F5, bấm link ra ngoài app) khi còn thay đổi chưa lưu ⇒ trình
     duyệt hỏi lại. Điều hướng TRONG app được chặn bằng dialog riêng ở `ProjectScreen`. */
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return { dirty, saving, save, revert };
}
