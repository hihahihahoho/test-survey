import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "@/components/layout/flora";
import { HOME_COPY } from "../lib/home-copy";
import type { Gate } from "@/features/projects/lib/gate";

/**
 * Ô ĐẦU TIÊN CỦA LƯỚI — «✚ Tạo bộ kit mới» (UX-V3 §1.1/§1.2).
 *
 * Đây là **hành động chính duy nhất** của màn H (luật L1: đúng ≤1 nút phát sáng mỗi màn).
 * Nó là một `<button>` THẬT có cỡ đúng bằng thẻ file, không phải một thẻ giả có onClick —
 * «3 GIÂY» của §1.2 nói mắt phải rơi vào đây trước tiên, nên nó phải nhận được focus
 * bằng Tab như một hành động chính, không phải như một ô trong lưới.
 *
 * ⚠️ VÌ SAO Ô NÀY KHÔNG PHẢI LÀ MỘT MẢNG MÀU ĐẶC CỠ THẺ: nền accent đặc (xanh VNPAY,
 * đọc từ `--kg-accent` — file này KHÔNG hardcode hex nào) trên một khối 300×260px sẽ
 * là vật sáng nhất màn hình và nuốt mất mọi ảnh bìa bên cạnh — ngược hẳn FLORA-REF
 * §2.4 «accent dùng RẤT tiết chế».
 *
 * ══ P-SWEEP·6 · ĐĨA ĐẶC 56px ĐÃ ĐI ═══════════════════════════════════════════
 * Bản trước giải quyết bằng cách thu nhỏ mảng accent xuống thành một ĐĨA TRÒN ĐẶC
 * 56px giữa thẻ. Nhỏ hơn thật, nhưng vẫn là **cùng một loài với "cục tròn thô" ở
 * rail mà chủ dự án vừa chỉ**: một khối đặc, tròn, không viền, đứng giữa nền phẳng.
 * Và nó là vật ĐẶC NHẤT toàn trang Home trong khi chỉ nói "thêm mới".
 *
 * Nay: vòng tròn HAIRLINE 40px + dấu `+` nét mảnh màu `fg-muted`. Thẻ đã có viền
 * riêng và dòng chữ "Tạo bộ kit mới" để nói nó là chỗ tạo mới; dấu cộng chỉ cần xác
 * nhận, không cần hét. Hover mới sáng lên `fg-strong` + viền accent (thẻ đã có sẵn
 * `hover:border-accent`) — accent xuất hiện đúng lúc người dùng đang nhắm vào đây.
 * Luật L1 («≤1 nút phát sáng mỗi màn») vẫn đúng theo hướng THIẾU chứ không thừa:
 * Home nay không còn mảng accent đặc nào.
 *
 * Agent chưa chạy ⇒ khoá + `title` nói lý do, KHÔNG ẩn (§6 hàng H).
 */
export function CreateKitTile({
  gate,
  onCreate,
  compact = false,
}: {
  gate: Gate;
  onCreate: () => void;
  /** true khi dùng trong ca empty (đứng một mình giữa màn, không nằm trong lưới). */
  compact?: boolean;
}) {
  const ro = gate.readOnly;
  return (
    <button
      type="button"
      data-create-kit
      disabled={ro}
      aria-disabled={ro || undefined}
      title={ro ? gate.reason : undefined}
      onClick={onCreate}
      className={cn(
        "group flex flex-col items-center justify-center gap-4 rounded-4 border border-line-subtle bg-surface p-6 text-center",
        "transition-[border-color,box-shadow,transform] duration-2 ease-out",
        "hover:-translate-y-1 hover:border-accent hover:shadow-3",
        "disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:border-line-subtle disabled:hover:shadow-none",
        FOCUS,
        compact ? "min-h-[220px] w-full max-w-modal-sm" : "min-h-[220px]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 items-center justify-center rounded-full border border-line-subtle text-fg-muted",
          "transition-colors duration-fast",
          !ro && "group-hover:border-accent group-hover:text-fg-strong",
          "[&_svg]:size-5",
        )}
      >
        <Plus strokeWidth={1.5} />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="text-subtitle text-fg-strong">
          {compact ? "Tạo dự án đầu tiên" : "Tạo dự án"}
        </span>
        <span className={cn("max-w-[26ch] text-caption", FLORA.fgMuted)}>
          {ro ? gate.reason : HOME_COPY.CREATE_TILE_HINT}
        </span>
      </span>
    </button>
  );
}
