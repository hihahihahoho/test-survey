import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * ══ P-SWEEP·14 · HAI LỚP KHỐI CHO MỘT HÀNG NHÃN → KHÔNG LỚP NÀO ═════════════
 * Bản trước: cả hàng tab nằm trong MỘT khối nền `bg-surface` bo 12px, rồi tab đang
 * chọn lại đắp thêm một khối `bg-overlay` + `shadow-1` nữa. Hai lớp khối chồng nhau
 * chỉ để nói "cái này đang mở" (ảnh 28) — nặng hơn cả nội dung bên dưới nó.
 *
 * Nay: hàng nhãn PHẲNG trên một hairline, tab đang chọn nhận gạch chân 2px accent.
 * Gạch chân là ngôn ngữ tab quen thuộc nhất, chiếm đúng 2px, và trùng đường hairline
 * đã có nên không thêm một hình khối nào vào trang.
 *
 * `-mb-px` để gạch chân của tab đè đúng lên hairline của hàng, không nằm dưới nó.
 * Viền dưới của tab KHÔNG chọn là `border-transparent` chứ không phải bỏ hẳn: có
 * viền sẵn thì chữ không nhảy 2px lúc đổi tab.
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex items-center justify-start gap-5 border-b border-line-subtle", className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "-mb-px inline-flex items-center justify-center gap-2 whitespace-nowrap border-b-2 border-transparent pb-2.5 pt-1 text-label font-medium text-fg transition-colors duration-fast",
      "hover:text-fg-strong",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
      "disabled:pointer-events-none disabled:text-fg-muted",
      "data-[state=active]:border-accent data-[state=active]:text-fg-strong",
      "[&_svg]:size-4 [&_svg]:shrink-0",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
