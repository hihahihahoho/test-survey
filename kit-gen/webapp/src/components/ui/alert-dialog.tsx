import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/** Modal xác nhận phá huỷ. KHÔNG có nút ✕, KHÔNG đóng khi click scrim (§5.5). */
const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-scrim bg-scrim/[var(--kg-scrim-a)]",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-modal flex max-h-modal w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col sm:max-w-modal-md",
        // §W2A-6 — VỎ PHẢI KHỚP `dialog.tsx:59`. Trước đây app có HAI vỏ modal khác
        // hẳn nhau: dialog thường `rounded-5 bg-overlay/90 backdrop-blur-xl`, còn
        // alert-dialog `rounded-3 bg-raised` KHÔNG blur. Cùng một app, mở hai modal
        // ra hai chất liệu — đó là lỗi hệ thống, không phải lựa chọn thiết kế.
        "rounded-5 border border-line-subtle bg-overlay/90 backdrop-blur-xl shadow-3 duration-2",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

/**
 * §W2A-6 — BA PRIMITIVE DƯỚI ĐÂY THEO ĐÚNG LUẬT ĐÃ ĐẶT Ở `dialog.tsx` (W1-5).
 *
 * Mặc định **KHÔNG kẻ**, và padding thẳng cột với `dialog.tsx` (`p-5 pb-3` / `px-5 py-2`
 * / `p-5 pt-4`). Lý do đầy đủ nằm ở khối chú thích trong `dialog.tsx` — tóm tắt: hai
 * hairline full-bleed mặc định là **cái bẫy** đã bẫy 3 vòng review, vì khi thân modal
 * chỉ có một dòng thì chúng thôi làm ranh giới và bắt đầu **kẹp** dòng chữ thành một
 * dải đọc-ra-ô-input. Alert-dialog là nơi cái bẫy đó dễ sập NHẤT: modal xác nhận gần
 * như luôn chỉ có một câu hỏi.
 *
 * Modal nào có thân THẬT SỰ CUỘN thì tự thêm `className="border-t border-line-subtle"`
 * cho `AlertDialogFooter` — quyết định tại chỗ, nhìn được, không mặc định cho cả app.
 */
const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex shrink-0 flex-col gap-1 p-5 pb-3", className)} {...props} />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-2", className)} {...props} />
);
AlertDialogBody.displayName = "AlertDialogBody";

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex shrink-0 flex-col-reverse gap-2 p-5 pt-4 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-title text-fg-strong", className)} {...props} />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn("text-body text-fg", className)} {...props} />
));
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants({ variant: "danger" }), className)} {...props} />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel ref={ref} className={cn(buttonVariants({ variant: "secondary" }), className)} {...props} />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog, AlertDialogPortal, AlertDialogOverlay, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogBody, AlertDialogFooter, AlertDialogTitle,
  AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
};
