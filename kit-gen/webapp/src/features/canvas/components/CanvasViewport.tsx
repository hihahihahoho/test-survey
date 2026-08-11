import * as React from "react";
import { cn } from "@/lib/utils";
import type { UseViewportResult } from "@/lib/viewport";
import { dotGridStyle } from "../lib/dot-grid";
import { isTypingTarget } from "../lib/canvas-state";

/**
 * KHUNG NHÌN — phần tử bị cắt + lớp thế giới có `transform`.
 *
 * Chia đôi trách nhiệm rất rõ để FE-3 cắm node vào mà không phải mở lại file này:
 *   · `<div>` ngoài  = khung chứa (nhận `containerRef`, bắt phím/chuột, vẽ dot-grid)
 *   · `<div>` trong  = LỚP THẾ GIỚI, mọi thứ con của nó dùng toạ độ thế giới.
 * Toán pan/zoom KHÔNG nằm ở đây — nó là `@/lib/viewport` (provider FE-1), file này chỉ
 * gắn dây. Copy lại toán là chuyện FE2-PLAN §0-N2 cấm.
 *
 * A11Y (tiêu chí D1):
 *  · `role="application"` + `aria-label`: đây là widget nhận phím riêng (mũi tên = cuộn
 *    khung nhìn, không phải cuộn trang), trình đọc màn hình phải nhường phím cho nó.
 *  · `tabIndex={0}`: có Tab tới được thì bàn phím mới dùng được; focus ring dùng token
 *    chung của `globals.css` (`:focus-visible`), không tự vẽ.
 *  · Hướng dẫn phím nằm trong một khối `sr-only` được `aria-describedby` trỏ tới —
 *    thông tin bằng CHỮ, không chỉ bằng hình.
 *
 * `transform-origin: 0 0` là BẮT BUỘC — quy ước toạ độ của `lib/viewport` giả định đúng
 * điều này (`screen = world * k + (x, y)`); đổi origin là sai toàn bộ phép neo zoom.
 */
export interface CanvasViewportProps {
  vp: UseViewportResult;
  /** Nhãn cho trình đọc màn hình — bắt buộc vì một màn có thể có nhiều vùng cuộn. */
  label: string;
  /** Mô tả thêm (tên file, trạng thái) đọc kèm nhãn. */
  describedBy?: string;
  /** Nội dung ở HỆ TOẠ ĐỘ THẾ GIỚI. FE-2 truyền khối rỗng minh hoạ; FE-3 truyền node. */
  children?: React.ReactNode;
  /** Nội dung ghim theo MÀN HÌNH (thanh công cụ nổi, dải trạng thái). */
  overlay?: React.ReactNode;
  className?: string;
}

export function CanvasViewport({ vp, label, describedBy, children, overlay, className }: CanvasViewportProps) {
  const hintId = React.useId();

  /**
   * CHẶN TRƯỚC `useViewport.onKeyDown`: hook của B1 KHÔNG tự biết người dùng đang gõ chữ —
   * nó thấy `ArrowRight` là pan và `preventDefault()`. Sự kiện bàn phím nổi bọt từ ô nhập
   * liệu bên trong khung (ô đổi tên node của FE-3, ô tìm kiếm trong panel) sẽ bị nuốt:
   * con trỏ văn bản không di chuyển được. Đây đúng tiêu chí D1 «mũi tên không bắt phím khi
   * đang gõ», và nó phải nằm ở CHỖ GỌI vì hook là tầng trung lập, không biết DOM của màn.
   */
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      vp.onKeyDown(e);
    },
    [vp],
  );

  return (
    <div className={cn("relative min-h-0 flex-1 overflow-hidden", className)}>
      <div
        ref={vp.containerRef}
        role="application"
        aria-label={label}
        aria-describedby={describedBy ? `${hintId} ${describedBy}` : hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        {...vp.bindPointer}
        style={dotGridStyle(vp.viewport)}
        className={cn(
          "absolute inset-0 touch-none select-none",
          // Con trỏ nói đúng việc đang làm: giữ Space = sắp kéo, đang kéo = đang nắm.
          vp.isPanning ? "cursor-grabbing" : vp.isSpaceHeld ? "cursor-grab" : "cursor-default",
        )}
      >
        <p id={hintId} className="sr-only">
          Vùng làm việc có thể kéo và phóng to. Dùng mũi tên để cuộn khung nhìn, giữ Shift để cuộn nhanh
          hơn. Ctrl hoặc Command kèm dấu cộng để phóng to, dấu trừ để thu nhỏ, số 0 để về 100%, số 1 để
          xem vừa khít tất cả. Giữ phím cách rồi kéo chuột để di chuyển khung nhìn.
        </p>
        <div
          data-testid="canvas-world"
          style={{ transform: vp.transform, transformOrigin: "0 0" }}
          className="absolute left-0 top-0"
        >
          {children}
        </div>
      </div>
      {overlay}
    </div>
  );
}
