import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * §5.5 Modal — scrim, panel `raised`, r-3, 4 cỡ, cao tối đa min(90vh,720px),
 * body cuộn riêng (header/footer dính).
 * A11y (§5.8-A7): Radix lo focus trap + Esc + aria-modal + trả focus.
 * ĐÃ KIỂM chứ không tin suông — xem trang /__preview mục "Kiểm chứng a11y".
 * Modal đang thực thi: truyền `onEscapeKeyDown`/`onPointerDownOutside` preventDefault
 * (xem ConfirmDestructive) để Esc KHÔNG đóng khi thao tác đang chạy.
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-scrim bg-scrim/[var(--kg-scrim-a)]",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const dialogSizes = cva("", {
  variants: {
    size: {
      sm: "sm:max-w-modal-sm",
      md: "sm:max-w-modal-md",
      lg: "sm:max-w-modal-lg",
      xl: "sm:max-w-modal-xl",
    },
  },
  defaultVariants: { size: "md" },
});

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
    VariantProps<typeof dialogSizes> & { hideClose?: boolean }
>(({ className, children, size, hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-modal flex max-h-modal w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
        "rounded-5 border border-line-subtle bg-overlay/90 backdrop-blur-xl shadow-3 duration-2 ease-out",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-1 data-[state=open]:duration-2",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        dialogSizes({ size }),
        className
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className={cn(
            "absolute right-3 top-3 rounded-1 p-1 text-fg-muted-raised transition-colors hover:bg-overlay hover:text-fg-strong",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-raised"
          )}
        >
          <X className="size-4" />
          <span className="sr-only">Đóng</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

/**
 * ĐƯỜNG KẺ NGANG CỦA DIALOG — đọc trước khi thêm lại `border-b`/`border-t`.
 *
 * Hai hairline full-bleed mặc định là **cái bẫy** đã bẫy 3 vòng review và 1 chung khảo
 * (UPGRADE-PLAN §Đ1). Giải phẫu "header có gạch dưới, footer có gạch trên" chỉ đúng khi
 * thân dialog CÓ NỘI DUNG THẬT và cuộn được: khi đó đường kẻ là ranh giới của ba vùng có
 * thật. Khi thân chỉ có một dòng, hai đường kẻ thôi làm ranh giới và bắt đầu **kẹp** dòng
 * chữ thành một dải — đọc ra một hàng của bảng hoặc một ô input bị vô hiệu hoá.
 *
 * ⇒ Mặc định KHÔNG kẻ. Dialog nào có thân **thật sự cuộn** (`ImportWizard`,
 * `GenerateDialog`, `CreateProjectDialog`…) thì tự thêm
 * `className="border-t border-line-subtle"` cho `DialogFooter` — quyết định tại chỗ,
 * nhìn được, không mặc định cho cả app.
 *
 * Tiêu chí nghiệm thu phát biểu ở dạng PHỦ ĐỊNH HÌNH DẠNG: *"không có đường kẻ ngang nào
 * chạy hết bề ngang dialog trong khoảng giữa title và hàng nút"*.
 */

/** Header dính — không cuộn theo body. */
const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex shrink-0 flex-col gap-1 p-5 pb-3 pr-12", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

/**
 * Body cuộn riêng. CHỈ dùng cho nội dung CẦN CUỘN — một dòng chữ thì đưa vào header.
 * `data-testid` để cổng kiểm phát biểu được ở dạng phủ định: *dialog ngắn KHÔNG có body*.
 */
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-testid="dialog-body" className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-2", className)} {...props} />
);
DialogBody.displayName = "DialogBody";

/** Footer dính — nút xác nhận BÊN PHẢI, Huỷ sát bên trái nó (§5.5). */
const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex shrink-0 flex-col-reverse gap-2 p-5 pt-4 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-title text-fg-strong", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-body text-fg", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
};
