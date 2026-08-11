import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorDocsPanel } from "./ErrorDocsPanel";

/**
 * Trợ giúp mã lỗi dạng LỚP PHỦ — để nút [Xem hướng dẫn] ở giữa một luồng làm việc không
 * ném user ra khỏi việc họ đang làm (đang có nháp chưa lưu, đang xem lượt chạy…).
 *
 * §2.1 nói "không có màn nào khác; mọi thứ còn lại là overlay của 8 màn" — nên trang trợ
 * giúp xuất hiện theo hai cách và cả hai đều hợp spec: overlay này, và một mục trong S6.
 * A11y: Radix Dialog lo focus trap + Esc + trả focus (§5.8-A7).
 */
export function ErrorDocsDialog({
  open,
  onOpenChange,
  code = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Mã cần mở sẵn. `null` ⇒ mở ở mục lục. */
  code?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Tra cứu lỗi</DialogTitle>
          <DialogDescription>
            Mỗi mã lỗi mà công cụ local trả về đều có một mục giải thích và cách xử lý.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ErrorDocsPanel focusCode={code} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
