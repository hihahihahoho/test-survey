import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * CẢNH BÁO RỜI TRANG KHI CHƯA LƯU.
 *
 * Từ lúc màn dự án thôi autosave, "đi sang mục khác" trở thành một cách mất chữ. Điều
 * hướng trong app không kích hoạt `beforeunload` của trình duyệt, nên phải có cửa hỏi
 * của riêng app — và nó phải cho cả HAI đường ra: lưu rồi đi, hoặc bỏ thay đổi rồi đi.
 * Chỉ có [Ở lại] / [Đi luôn] là bắt người dùng tự nhớ quay lại bấm Lưu.
 */
export function UnsavedGuardDialog({
  open, onOpenChange, saving, onSaveAndLeave, onDiscardAndLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSaveAndLeave: () => void;
  onDiscardAndLeave: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Còn thay đổi chưa lưu</AlertDialogTitle>
          <AlertDialogDescription>
            Rời khỏi đây bây giờ là mất những gì bạn vừa sửa. Ảnh đã tạo không bị ảnh hưởng.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Ở lại</AlertDialogCancel>
          <AlertDialogCancel onClick={onDiscardAndLeave}>Bỏ thay đổi</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={onSaveAndLeave}>
            {saving ? "Đang lưu…" : "Lưu rồi đi"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
