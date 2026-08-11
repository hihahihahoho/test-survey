import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * MODAL "RỜI MÀN KHI CÒN THAY ĐỔI" (§3-S3 / B5).
 *
 * `beforeunload` chỉ cứu ca đóng tab và F5. Bấm sang màn khác trong SPA thì
 * trình duyệt không hỏi gì cả — mà đó mới là ca xảy ra thường xuyên hơn.
 *
 * BA LỐI RA, và lối "mất dữ liệu" KHÔNG phải mặc định:
 *   [Ở lại] (focus đầu tiên) · [Lưu rồi đi tiếp] (primary) · [Rời đi, bỏ thay đổi] (danger)
 *
 * Câu chốt quan trọng: nói cho user biết **nháp vẫn còn** nếu họ rời đi. Không có
 * câu đó, "Rời đi, bỏ thay đổi" nghe như mất trắng, và user sẽ do dự ở một thao
 * tác thật ra an toàn.
 */
export function LeaveGuardDialog({
  open,
  dirtyCount,
  saving,
  canSave,
  onStay,
  onLeave,
  onSaveAndLeave,
}: {
  open: boolean;
  dirtyCount: number;
  saving: boolean;
  /** false khi agent chưa chạy — lúc đó chỉ còn 2 lối ra thật. */
  canSave: boolean;
  onStay: () => void;
  onLeave: () => void;
  onSaveAndLeave: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && !saving && onStay()}>
      <AlertDialogContent onEscapeKeyDown={(e) => saving && e.preventDefault()}
        /* AlertDialog của Radix vốn KHÔNG đóng khi click ra ngoài (chỉ Dialog thường mới
           đóng), nên ở đây không cần chặn thêm — đã đọc dist/react-alert-dialog. */>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden />
            <AlertDialogTitle>Rời khỏi bản thiết kế khi chưa lưu?</AlertDialogTitle>
          </div>
        </AlertDialogHeader>

        <AlertDialogBody>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-body text-fg">
              <p>
                Bạn có <strong className="text-fg-strong">{dirtyCount} thay đổi chưa lưu</strong>.
              </p>
              <p className="text-caption text-fg-muted-raised">
                {canSave
                  ? "Nếu rời đi, bản nháp vẫn được giữ trên máy này và sẽ được hỏi khôi phục khi bạn quay lại."
                  : "Chưa lưu được vì công cụ local đang không chạy. Bản nháp vẫn được giữ trên máy này và sẽ được hỏi khôi phục khi bạn quay lại."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogBody>

        <AlertDialogFooter className="sm:justify-between">
          <Button variant="ghost" disabled={saving} onClick={onLeave}>
            Rời đi, bỏ thay đổi
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" autoFocus disabled={saving} onClick={onStay}>
              Ở lại
            </Button>
            {canSave && (
              <Button variant="primary" loading={saving} onClick={onSaveAndLeave}>
                Lưu rồi đi tiếp
              </Button>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
