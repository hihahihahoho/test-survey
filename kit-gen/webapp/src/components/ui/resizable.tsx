import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

/**
 * Dùng cho editor 3 vùng của S3 (cây 260px · lưới · thuộc tính 320px).
 *
 * GHI CHÚ QUAN TRỌNG CHO TEAM MÀN — API v4 KHÁC shadcn docs:
 * react-resizable-panels@4 đã đổi tên `PanelGroup/PanelResizeHandle` →
 * `Group/Separator`, và `direction` → `orientation` ("horizontal"|"vertical").
 * File này giữ TÊN EXPORT kiểu shadcn để code màn quen tay, nhưng prop phải
 * dùng `orientation`. Kiểm bằng `npx tsc --noEmit` nếu nhầm.
 *
 * A11y: `Separator` của v4 tự đặt role="separator" + tabIndex=0 +
 * aria-valuenow/min/max ⇒ đổi kích thước được bằng mũi tên (A6). Đã đọc
 * dist/react-resizable-panels.js dòng ~2219 để xác nhận, không tin suông.
 * Trạng thái style qua thuộc tính `data-separator` = hover|active|focus.
 */
const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof Group>) => (
  <Group className={cn("flex size-full", className)} {...props} />
);

const ResizablePanel = Panel;

/**
 * ══ B4 — TAY KÉO ĐÈ LÊN CHỮ ═══════════════════════════════════════════════════
 * `Separator` của v4 đặt inline-style `flexBasis:auto; flexGrow:0; flexShrink:0`
 * (dist/react-resizable-panels.js ~dòng 2226) và KHÔNG tự cho kích thước. Bản cũ
 * ở đây cũng không khai `w-*`/`h-*` ⇒ vạch ngăn rộng 0px, còn cái grip
 * `h-6 w-3` bên trong TRÀN ra hai bên và nằm ĐÈ lên nội dung cột — đúng "handle
 * kéo đè lên chữ" trong ảnh 09.
 * SỬA: vạch ngăn có bề dày thật (1px hairline) + vùng bấm 9px nhờ padding âm ảo
 * (`after:`), grip đặt `absolute` nên không ăn vào luồng bố cục nữa.
 * Vùng chạm vẫn ≥24px theo A6 nhờ `after:` phủ rộng hơn phần nhìn thấy.
 */
const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) => (
  <Separator
    className={cn(
      "relative flex items-center justify-center bg-line-subtle transition-colors duration-fast",
      /* Bề dày thật của vạch. Thuộc tính có thật trên DOM là `aria-orientation`
         (dòng 2213 của dist) và nó NGƯỢC hướng group: group ngang ⇒ vạch dọc. */
      "aria-[orientation=vertical]:w-px aria-[orientation=vertical]:cursor-col-resize",
      "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize",
      // vùng bấm rộng hơn phần nhìn thấy, KHÔNG chiếm chỗ trong luồng bố cục
      "after:absolute after:content-['']",
      "aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-left-1.5 aria-[orientation=vertical]:after:w-4",
      "aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:-top-1.5 aria-[orientation=horizontal]:after:h-4",
      "data-[separator=hover]:bg-line data-[separator=active]:bg-accent",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
      className
    )}
    {...props}
  >
    {withHandle && (
      <div className="pointer-events-none absolute z-10 flex h-6 w-3 items-center justify-center rounded-1 border border-line-subtle bg-overlay">
        <GripVertical className="size-2.5 text-fg-muted-raised" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
