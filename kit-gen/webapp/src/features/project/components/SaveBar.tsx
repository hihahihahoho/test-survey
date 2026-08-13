import { RefreshCw, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * HÀNG NÚT LƯU dùng chung cho cả ba nơi sửa được của dự án: dialog Cài đặt, trang
 * Skeleton UI và trang Mascot.
 *
 * Một component chứ không ba: ba bản sao là ba cơ hội để một nơi quên mất nút [Huỷ],
 * hoặc gọi `save()` mà quên chờ nó xong trước khi bật dialog tạo lại. Thứ tự nút cũng
 * là hợp đồng — hành động phá huỷ (Huỷ/hoàn tác) đứng TRÁI, hành động chính đứng PHẢI.
 *
 * `dirty === false` ⇒ cả ba nút tắt, KHÔNG ẩn: nút biến mất rồi hiện lại làm hàng nút
 * nhảy chỗ ngay dưới ngón tay người dùng.
 */
export function SaveBar({
  dirty, saving, onSave, onSaveAndRegenerate, onRevert,
  regenerateLabel = "Lưu và tạo lại ảnh",
  saveLabel = "Lưu cài đặt",
  canRegenerate = true,
  className,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onSaveAndRegenerate: () => void;
  onRevert: () => void;
  regenerateLabel?: string;
  saveLabel?: string;
  canRegenerate?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <p className="mr-auto text-caption text-fg-muted" role="status">
        {saving
          ? "Đang lưu…"
          : dirty
            ? "Có thay đổi chưa lưu. Ảnh đã tạo giữ nguyên cho tới khi bạn lưu."
            : "Không có thay đổi nào chưa lưu."}
      </p>
      <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={onRevert}>
        <RotateCcw aria-hidden />Huỷ
      </Button>
      <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={onSave}>
        <Save aria-hidden />{saveLabel}
      </Button>
      <Button type="button" variant="primary" disabled={!dirty || saving || !canRegenerate} onClick={onSaveAndRegenerate}>
        <RefreshCw aria-hidden />{regenerateLabel}
      </Button>
    </div>
  );
}
