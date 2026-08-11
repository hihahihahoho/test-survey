import { CARD, SERIF } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
import { CARD_COMPACT_MAX_H_PX, CARD_FULL_MAX_H_PX } from "../lib/canvas-layers";

/**
 * THẺ «BÀN CÒN TRỐNG» — tầng 2 của UX-V3 §7.2.
 *
 * ══ ĐỔI GÌ Ở C1 (FLOW-V3 §5) ══
 * 1. **Không còn nút trong thẻ.** Copy chốt UX-V3 §5.3 chỉ thẳng xuống nút **✨ Nhờ máy vẽ**
 *    ở thanh nổi; ba nút khoá cũ («Kéo ảnh tham khảo», «Lấy element từ thư viện», «Dán ghi
 *    chú brief») là ba mảnh chữ đặc nằm giữa thẻ, và chính chúng đẩy thẻ cao tới mức tràn
 *    xuống đè floatbar. Bỏ nút cũng đóng luôn L1 («một màn = một nút phát sáng») và bỏ chữ
 *    cấm `element` (UX-V3 §5.4).
 * 2. **Copy đúng UX-V3 §5.3/§4.1**, serif italic nhấn ĐÚNG MỘT TỪ: *Bàn còn **trống***.
 * 3. **Có dạng thu gọn** (`compact`): khung cao < 520px thì giữ tiêu đề + 1 câu, bỏ dòng gợi ý.
 *
 * Vì sao không dùng `EmptyState` của R0: nó đòi đúng 1 nút primary, mà tầng 2 **không được
 * phép** có nút mint (nút nằm ở tầng 4). Đã xin nới ở `NEEDS-fe3-c.md` N3; trước khi có thì
 * tự dựng bằng `CARD` — đúng đường vòng UX-V3 §9-N2 cho phép.
 *
 * `max-h` là chốt chặn cuối: dù chữ có dài bất thường (dịch, cỡ chữ hệ thống lớn), thẻ vẫn
 * không tràn khỏi vùng an toàn — nó tự cuộn bên trong thay vì trườn xuống đè thanh nổi.
 */
export interface CanvasEmptyCardProps {
  /** Khung thấp ⇒ bản rút gọn (UX-V3 §7.3). Component KHÔNG tự đo; `CanvasShell` quyết. */
  compact?: boolean;
  className?: string;
}

export function CanvasEmptyCard({ compact = false, className }: CanvasEmptyCardProps) {
  return (
    <div
      data-testid="canvas-empty-card"
      data-compact={compact ? "true" : "false"}
      style={{ maxHeight: compact ? CARD_COMPACT_MAX_H_PX : CARD_FULL_MAX_H_PX }}
      className={cn(
        CARD,
        "rounded-5 flex max-w-lg flex-col items-center overflow-y-auto text-center",
        compact ? "gap-2 px-8 py-6" : "gap-4 px-10 py-10",
        className,
      )}
    >
      {/* `text-display` = bậc lớn nhất của thang §5.2 (24px/32px) — không mở bậc arbitrary mới. */}
      <h2 className="text-display text-fg-strong">
        Bàn còn <em className={SERIF}>trống</em>
      </h2>
      <p className="max-w-[46ch] text-body text-fg">
        Bấm Nhờ máy vẽ ở thanh dưới để bắt đầu.
      </p>
      {/*
        Dòng ba của UX-V3 §5.3. Thao tác thả ảnh CHƯA chạy ở FE-3 (không nhánh nào được
        cấp việc đó), nên câu chốt được giữ nguyên chữ nhưng gắn thêm «· sắp có» — luật
        L4/N5 cấm hứa việc máy chưa làm được, mà xoá hẳn câu thì mất chỉ dẫn của UX-V3.
        Ghi rõ mâu thuẫn này ở `NEEDS-fe3-c.md` N4 để nhánh làm thả ảnh gỡ đúng 3 chữ.
      */}
      {!compact && (
        <p className="max-w-[46ch] text-label text-fg-muted-raised">
          hoặc kéo ảnh tham khảo thả vào bàn <span className="text-fg-muted">· sắp có</span>
        </p>
      )}
    </div>
  );
}
