import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogBody, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Modal xác nhận thao tác phá huỷ (§5.5 + §4.4).
 *
 * MỨC MA SÁT PHẢI ĐÚNG VỚI HẬU QUẢ (chốt X6 của §0.2):
 *  - `confirmText` KHÔNG truyền  → chỉ cần bấm nút. Dùng cho thao tác PHỤC HỒI
 *    ĐƯỢC: xoá project vào thùng rác (đã có Hoàn tác 10s + thùng rác 30 ngày).
 *    ĐỪNG bắt gõ tên ở đây — ma sát cao là phản tác dụng.
 *  - `confirmText` CÓ truyền     → phải gõ đúng chuỗi mới bật nút. Dùng cho
 *    XOÁ VĨNH VIỄN (purge) và các thao tác không có đường về.
 *
 * A11y: Radix AlertDialog lo focus trap; focus mặc định vào nút HUỶ (nút an
 * toàn), không phải nút phá huỷ. Khi `pending` thì Esc/click-ngoài KHÔNG đóng
 * (§5.5 "trừ modal đang thực thi").
 */
export interface ConfirmDestructiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Nói RÕ hậu quả: cái gì mất, có lấy lại được không, có tốn quota để làm lại không. */
  description: React.ReactNode;
  /** Nếu có: user phải gõ đúng chuỗi này. Chỉ dùng cho thao tác KHÔNG phục hồi được. */
  confirmText?: string;
  /** Nhãn ô nhập, vd 'Gõ tên project để xác nhận' */
  confirmLabel?: string;
  actionLabel?: string;
  cancelLabel?: string;
  /** Đang thực thi — khoá modal, không cho Esc đóng giữa chừng. */
  pending?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}

export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmLabel,
  actionLabel = "Xoá",
  cancelLabel = "Huỷ",
  pending = false,
  onConfirm,
  children,
}: ConfirmDestructiveProps) {
  const [typed, setTyped] = React.useState("");
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  // reset ô nhập mỗi lần mở lại — không để sót chữ lần trước
  React.useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const needsTyping = Boolean(confirmText);
  const matched = !needsTyping || typed === confirmText;
  const blocked = !matched || pending;

  return (
    <AlertDialog open={open} onOpenChange={pending ? () => {} : onOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={(e) => pending && e.preventDefault()}
        /* AlertDialog của Radix vốn KHÔNG đóng khi click ra ngoài (chỉ Dialog thường mới
           đóng), nên ở đây không cần chặn thêm — đã đọc dist/react-alert-dialog. */
        onOpenAutoFocus={(e) => {
          // focus về nút AN TOÀN, không phải nút phá huỷ
          if (!needsTyping) {
            e.preventDefault();
            cancelRef.current?.focus();
          }
        }}
      >
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-danger" aria-hidden />
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
        </AlertDialogHeader>

        <AlertDialogBody className="flex flex-col gap-4">
          <AlertDialogDescription asChild>
            <div className="text-body text-fg">{description}</div>
          </AlertDialogDescription>

          {children}

          {needsTyping && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kg-confirm-input">
                {confirmLabel ?? (
                  <>
                    Gõ <span className="font-mono text-fg-strong">{confirmText}</span> để xác nhận
                  </>
                )}
              </Label>
              <Input
                id="kg-confirm-input"
                value={typed}
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
                onChange={(e) => setTyped(e.target.value)}
                aria-describedby="kg-confirm-help"
                className={cn(typed && !matched && "border-danger")}
              />
              <p id="kg-confirm-help" className="text-caption text-fg-muted-raised">
                Thao tác này không thể hoàn tác.
              </p>
            </div>
          )}
        </AlertDialogBody>

        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={pending}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked}
            aria-disabled={blocked}
            onClick={(e) => {
              e.preventDefault(); // để cha tự đóng sau khi API xong
              if (!blocked) onConfirm();
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
