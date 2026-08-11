import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

/**
 * §W2A-4 — SLIDER: trả mint về làm NHẤN.
 *
 * Bản cũ: `<Range className="absolute h-full bg-accent" />` — ray tô MINT ĐẶC từ mép
 * trái. Trên màn "Phong cách" có 8 trục ⇒ **8 thanh mint đặc xếp chồng**, vật ồn nhất
 * toàn app (ảnh 09). Sai cả ngữ nghĩa: 8 trục này là **thang LƯỠNG CỰC** (Chín chắn ↔
 * Trẻ trung), tô đầy từ mép trái nghĩa là "càng phải càng nhiều" — thang lưỡng cực
 * không có "nhiều/ít", nó có "lệch về phía nào so với GIỮA".
 *
 * Nay: ray xám trung tính + vạch mốc ở giữa + **chỉ cái núm giữ mint**. Mắt đọc ra
 * "núm này lệch trái/phải bao nhiêu so với mốc", đúng thứ thang này muốn nói.
 *
 * Vì sao `bg-line` chứ không phải `bg-fg-strong/25` như toa ghi: toa đó **làm đỏ cổng
 * contrast** — đã thử và đo, `bg-fg-strong/25` FAIL 3 phép ở CẢ hai theme (dark
 * 3.33/2.90, light 4.35 — xem W2A-DONE §W2A-4). `--kg-line` là token có sẵn với đúng
 * nhiệm vụ đó: *"viền CONTROL, ≥3:1 (WCAG 1.4.11)"*, đã được đo PASS trên cả 4 lớp
 * nền, và **không đẻ thêm mức alpha thứ 13** — đúng tinh thần "chuẩn hoá về thang
 * alpha đã có" của cùng wave này.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative h-1.5 w-full grow overflow-hidden rounded-full bg-raised",
        // vạch giữa = mốc "mặc định" của thang lưỡng cực. `after` + `z-10` để nó
        // KHÔNG bị `Range` (absolute, vẽ sau) nuốt khi núm đi qua nửa phải.
        "after:absolute after:left-1/2 after:top-0 after:z-10 after:h-full after:w-px after:-translate-x-1/2 after:bg-line-subtle",
      )}
    >
      <SliderPrimitive.Range className="absolute h-full bg-line" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block size-4 rounded-full border-2 border-accent bg-canvas transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-0 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:border-line disabled:bg-raised"
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
