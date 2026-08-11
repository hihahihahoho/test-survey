/**
 * features/projects/lib/feedback.ts — TOAST của S1 (§5.5) + trình bày lỗi (§3.9).
 *
 * BA LUẬT KHÔNG ĐƯỢC PHÁ:
 *  1. `error.message` kỹ thuật KHÔNG BAO GIỜ ra thân UI. Chỉ `devDetails()` (R0)
 *     mới được trả nó, và chỉ để đổ vào panel gập "Chi tiết cho lập trình viên".
 *  2. Copy lỗi LUÔN lấy từ bảng tĩnh `presentError()` (R0) — màn không tự viết.
 *  3. Toast KHÔNG BAO GIỜ là nơi DUY NHẤT báo lỗi của thao tác đang trên màn:
 *     chỗ nào gây lỗi thì chỗ đó phải hiện inline (§5.5). Các dialog ở đây đều
 *     hiện lỗi inline TRƯỚC, toast chỉ là lớp phụ.
 *
 * Thời lượng đúng §5.5: success 4s · có [Hoàn tác] 10s · info 5s · warning 8s ·
 * error KHÔNG tự đóng.
 */
import { toast, KG_TOAST_DURATION } from "@/components/ui/sonner";
import { devDetails, presentError, type PresentedError } from "@/lib/api";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function toastSuccess(title: string, description?: string, action?: ToastAction): void {
  toast.success(title, {
    ...(description ? { description } : {}),
    duration: KG_TOAST_DURATION.success,
    ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
  });
}

export function toastInfo(title: string, description?: string): void {
  toast.info(title, { ...(description ? { description } : {}), duration: KG_TOAST_DURATION.info });
}

export function toastWarning(title: string, description?: string, action?: ToastAction): void {
  toast.warning(title, {
    ...(description ? { description } : {}),
    duration: KG_TOAST_DURATION.warning,
    ...(action ? { action: { label: action.label, onClick: action.onClick } } : {}),
  });
}

/**
 * Toast lỗi. KHÔNG tự đóng (§5.5) — lỗi mà tự biến mất thì user không kịp đọc.
 * `title`/`description` lấy từ bảng §3.9; message kỹ thuật KHÔNG được truyền vào.
 */
export function toastError(err: unknown, opts: {
  action?: ToastAction;
  titleOverride?: string;
  descriptionOverride?: string;
} = {}): PresentedError {
  const v = presentError(err);
  toast.error(opts.titleOverride ?? v.title, {
    description: opts.descriptionOverride ?? v.explain,
    duration: KG_TOAST_DURATION.error,
    ...(opts.action ? { action: { label: opts.action.label, onClick: opts.action.onClick } } : {}),
  });
  return v;
}

/**
 * Toast HOÀN TÁC 10 GIÂY (§4.4). Ba ràng buộc của spec, thi công đúng:
 *  · 10s (không phải 4s như success thường)
 *  · KHÔNG tự đóng khi hover/focus — sonner có sẵn hành vi pause-on-hover
 *  · bấm [Hoàn tác] gọi `POST /api/trash/:trashId/restore`
 */
export function toastUndo(opts: {
  title: string;
  description?: string;
  onUndo: () => void;
}): void {
  toast.success(opts.title, {
    ...(opts.description ? { description: opts.description } : {}),
    duration: KG_TOAST_DURATION.successWithUndo,
    action: { label: "Hoàn tác", onClick: opts.onUndo },
  });
}

/** Chuỗi cho panel "Chi tiết cho lập trình viên ▾". Chỗ DUY NHẤT chứa từ kỹ thuật. */
export function errorDetail(err: unknown): string {
  return devDetails(err);
}

export { presentError };
