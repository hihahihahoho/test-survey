import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * §5.5 Drawer — trượt phải, rộng 480px (log: 640px qua size="wide").
 * Dùng cho: log 1 lượt · lịch sử bản thiết kế · thư viện element · trạng thái agent.
 */
const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-scrim bg-scrim/[var(--kg-scrim-a)]",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  cn(
    "fixed z-drawer flex flex-col gap-0 border-line-subtle bg-raised shadow-3 transition ease-out",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-2 data-[state=open]:duration-2"
  ),
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-drawer max-w-[calc(100vw-2rem)] border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right: "inset-y-0 right-0 h-full w-drawer max-w-[calc(100vw-2rem)] border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
      },
      size: { default: "", wide: "sm:w-drawer-wide" },
    },
    defaultVariants: { side: "right", size: "default" },
  }
);

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>
>(({ side = "right", size, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side, size }), className)} {...props}>
      {children}
      <SheetPrimitive.Close
        className={cn(
          "absolute right-3 top-3 rounded-1 p-1 text-fg-muted-raised transition-colors hover:bg-overlay hover:text-fg-strong",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-raised"
        )}
      >
        <X className="size-4" />
        <span className="sr-only">Đóng</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex shrink-0 flex-col gap-1 border-b border-line-subtle p-4 pr-12", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

/** `overscroll-contain` — cùng luật với `DialogBody`: lớp nổi cuộn tới biên thì dừng. */
const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-4", className)} {...props} />
);
SheetBody.displayName = "SheetBody";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex shrink-0 flex-col-reverse gap-2 border-t border-line-subtle p-4 sm:flex-row sm:justify-end", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-title text-fg-strong", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-body text-fg", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent,
  SheetHeader, SheetBody, SheetFooter, SheetTitle, SheetDescription,
};
