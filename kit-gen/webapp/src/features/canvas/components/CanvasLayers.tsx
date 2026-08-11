import * as React from "react";
import { cn } from "@/lib/utils";
import {
  LAYER_CLASS,
  LAYER_Z,
} from "../lib/canvas-layers";

/**
 * BA KHUNG NEO của các tầng ghim-theo-màn-hình (UX-V3 §7.2).
 *
 * ══ ĐÂY LÀ CHỖ SỬA LỖI FLOW-V3 §5 ══
 * Bản cũ đặt thẻ empty và cụm (dải trạng thái + floatbar) vào **cùng một** overlay, mỗi
 * lớp `absolute` và không lớp nào biết lớp kia:
 *
 *   empty:  absolute inset-0            → thẻ nằm giữa TOÀN khung, tràn được xuống đáy
 *   floats: absolute inset-x-0 bottom-0 flex flex-col → dải + thanh chồng nhau một cột
 *
 * Hệ quả đúng như chủ dự án nhìn thấy: thẻ đè floatbar, và chữ «chưa có thay đổi · bản
 * nháp cục bộ» rơi vào thân thẻ. Bản này tách hẳn ba khung:
 *
 *   ┌ SafeArea  absolute inset-0 bottom-[160px]  ← thẻ căn giữa TRONG ĐÂY, không phải giữa khung
 *   ├ StripRow  absolute inset-x-0 bottom-[88px] h-7   ← hàng RIÊNG, cao cố định
 *   └ FloatRow  absolute inset-x-0 bottom-4            ← hàng RIÊNG
 *
 * Ba khung là ANH EM RỜI: mỗi cái tự neo `bottom` bằng số, không cái nào nằm trong
 * `flex-col` của cái nào ⇒ đổi chiều cao cái này KHÔNG đẩy cái kia (luật thi công §7.2-2).
 *
 * `pointer-events-none` ở khung, `pointer-events-auto` ở ruột: các tầng nổi không được
 * cướp thao tác kéo bàn ở vùng trống.
 */

/** Tầng 2 — vùng an toàn = khung trừ 160px đáy (dải + floatbar + 24px thở). */
export function CanvasSafeArea({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="canvas-safe-area"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center p-6",
        // 160px: UX-V3 §7.2 tầng 2. Số nằm ở `lib/canvas-layers.ts`, test khớp hai bên.
        LAYER_CLASS.safeArea.className,
        LAYER_Z.card,
      )}
    >
      {children}
    </div>
  );
}

/** Tầng 3 — dải trạng thái: hàng riêng, cao CỐ ĐỊNH, không xếp chồng với floatbar. */
export function CanvasStripRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="canvas-strip-row"
      className={cn(
        "pointer-events-none absolute inset-x-0 flex items-center justify-center px-4",
        LAYER_CLASS.stripBottom.className, // bottom-[88px] — UX-V3 §7.2 tầng 3
        LAYER_CLASS.stripHeight.className, // h-7 = 28px cố định
        LAYER_Z.strip,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Tầng 4 — floatbar. `min-h-12` (48px) là chỗ DÀNH RIÊNG đã tính vào 160px của vùng an
 * toàn: thanh có cao thêm một chút vì nút xuống dòng thì nó lớn lên **xuống dưới không
 * được** (đã chạm đáy) nên nó lớn lên trên và ăn vào 24px thở, chứ không đè thẻ.
 * `z` do chính `FloatingToolbar` của R0 đặt (`z-floatbar` = 200) — không đặt đè lên đây.
 */
export function CanvasFloatRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="canvas-float-row"
      className={cn(
        "pointer-events-none absolute inset-x-0 flex items-end justify-center px-4",
        LAYER_CLASS.floatBottom.className, // bottom-4 = 16px
        LAYER_CLASS.floatHeight.className, // min-h-12 = 48px dành riêng
      )}
    >
      <div className="pointer-events-auto max-w-full">{children}</div>
    </div>
  );
}
