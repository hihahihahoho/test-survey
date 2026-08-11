import * as React from "react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Bộ chọn "món điều khiển" của thanh. Nút đang `:disabled` bị loại KHỎI vòng di
 * chuyển (APG: toolbar bỏ qua món không dùng được) — nên test bắt buộc có ca
 * "nút khoá không nhận focus".
 */
const ITEM_SELECTOR = [
  "button:not(:disabled)",
  "[href]",
  "[role='button']:not([aria-disabled='true'])",
  "[role='checkbox']:not([aria-disabled='true'])",
  "[role='radio']:not([aria-disabled='true'])",
  "[role='switch']:not([aria-disabled='true'])",
].join(",");

/** Chỉ lấy món thuộc CHÍNH thanh này — thanh lồng trong thanh không bị trộn vòng. */
function toolbarItems(toolbar: HTMLElement): HTMLElement[] {
  return Array.from(toolbar.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter(
    (item) => item.closest('[role="toolbar"]') === toolbar && !item.hidden,
  );
}

export interface FloatingToolbarProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /**
   * BẮT BUỘC (FE-PLAN §3-B2): một màn có thể có nhiều thanh nổi (canvas · xem
   * trước · lưới), trình đọc màn hình phải phân biệt được. Kiểu `Omit<…,
   * "aria-label">` + khai lại ở đây làm việc thiếu nhãn thành LỖI BIÊN DỊCH.
   */
  "aria-label": string;
  /** Slot trái — công cụ chọn/chế độ. */
  left?: React.ReactNode;
  /** Slot giữa — zoom / trạng thái khung nhìn. */
  center?: React.ReactNode;
  /** Slot phải — hành động (Copy Figma, đông cứng…). */
  right?: React.ReactNode;
}

/**
 * THANH CÔNG CỤ NỔI — hạ tầng dùng chung cho canvas (FE-3) và S3 (FE-4).
 * Đặc tả: FE-PLAN §3-B2 · UI-SPEC-V2 §2.2 · FLORA-REF §1/§2-7/§3.
 *
 * THỊ GIÁC (0 literal màu — mọi giá trị lấy từ token của R0):
 * - pill `rounded-full` (999px) + hairline `border-line-subtle` + `shadow-3`,
 *   nền `bg-overlay` (#191919 dark) = "overlay rgba(25,25,25,.9)" của FLORA-REF §1.
 * - `bg-overlay/90` + `backdrop-blur-lg` (blur **16px**, đúng số FLORA-REF §2.2)
 *   CHỈ bật trong `@supports (backdrop-filter: blur(0px))`. Trình duyệt không hỗ
 *   trợ ⇒ GIỮ nền ĐẶC, chữ không bao giờ nằm trên nền trong suốt.
 * - `prefers-reduced-transparency: reduce` ⇒ nền đặc + tắt blur.
 * - Tương phản (nhóm alpha của A1, `npm run contrast`): `bg-overlay/90` với
 *   fg-default = 8.47:1 dark · 8.33:1 light; với fg-muted = 7.39:1 · 7.35:1.
 *
 * BÀN PHÍM (WAI-ARIA APG · Toolbar):
 * - MỘT điểm dừng Tab cho cả thanh (roving `tabindex`); ← → (và ↑ ↓) di chuyển
 *   có quấn vòng; Home/End về đầu/cuối; Enter/Space do chính `Button` xử lý.
 * - Nút `disabled` bị loại khỏi vòng di chuyển.
 * - Mũi tên kèm ⌘/Ctrl/⌥ được NHƯỜNG cho phím tắt app (`useViewport` của B1 dùng
 *   mũi tên + modifier để pan) — không chiếm phím của người khác.
 *
 * TODO(FE-1·B2 → nhánh A): bộ class nền/blur dưới đây LẶP LẠI tiện ích
 * `.kg-floatbar` (styles/globals.css:71) nhưng có thêm hai đường lùi mà tiện ích
 * đó CHƯA có. `styles/**` thuộc glob nhánh A ⇒ B không sửa; đã ghi
 * `teams/react/NEEDS-fe1-b2.md` N1. Khi N1 xong thì đổi về `FLOATBAR`.
 *
 * KHÔNG tự vẽ nút/vạch: nội dung slot phải là `Button`/`Tooltip` của R0, vạch
 * ngăn giữa các slot là `Separator` của R0.
 */
export const FloatingToolbar = React.forwardRef<HTMLDivElement, FloatingToolbarProps>(
  ({ "aria-label": ariaLabel, left, center, right, className, onKeyDown, onFocus, ...props }, forwardedRef) => {
    const localRef = React.useRef<HTMLDivElement | null>(null);
    const setRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [forwardedRef],
    );

    /* useEffect (KHÔNG useLayoutEffect): việc này chỉ đặt thuộc tính `tabindex`,
       không ảnh hưởng bố cục ⇒ không cần chạy trước khi vẽ, và useLayoutEffect
       sẽ in cảnh báo khi màn nào render thanh này bằng renderToStaticMarkup. */
    React.useEffect(() => {
      const toolbar = localRef.current;
      if (!toolbar) return;
      const items = toolbarItems(toolbar);
      const activeIndex = items.findIndex((item) => item.tabIndex === 0);
      items.forEach((item, index) => item.setAttribute("tabindex", index === Math.max(activeIndex, 0) ? "0" : "-1"));
    }, [left, center, right]);

    const moveFocus = React.useCallback((edgeOrDelta: "first" | "last" | number) => {
      const toolbar = localRef.current;
      if (!toolbar) return;
      const items = toolbarItems(toolbar);
      if (!items.length) return;

      const current = document.activeElement instanceof HTMLElement
        ? items.indexOf(document.activeElement)
        : -1;
      let next = 0;
      if (edgeOrDelta === "last") next = items.length - 1;
      else if (typeof edgeOrDelta === "number") {
        next = (Math.max(current, 0) + edgeOrDelta + items.length) % items.length;
      }

      items.forEach((item, index) => item.setAttribute("tabindex", index === next ? "0" : "-1"));
      items[next]?.focus();
    }, []);

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;

      const action = event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : event.key === "Home"
            ? "first"
            : event.key === "End"
              ? "last"
              : null;
      if (action === null) return;
      event.preventDefault();
      moveFocus(action);
    };

    const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
      onFocus?.(event);
      if (event.defaultPrevented) return;
      const toolbar = localRef.current;
      if (!toolbar || event.target === toolbar) return;
      toolbarItems(toolbar).forEach((item) => {
        item.setAttribute("tabindex", item === event.target ? "0" : "-1");
      });
    };

    const groups = [left, center, right].filter((slot) => slot !== null && slot !== undefined && slot !== false);

    return (
      <div
        {...props}
        ref={setRef}
        role="toolbar"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className={cn(
          "z-floatbar inline-flex max-w-full items-center gap-2 rounded-full border border-line-subtle bg-overlay px-2 py-2 shadow-3",
          "supports-[backdrop-filter:blur(0px)]:bg-overlay/90 supports-[backdrop-filter:blur(0px)]:backdrop-blur-lg",
          "[@media_(prefers-reduced-transparency:_reduce)]:bg-overlay [@media_(prefers-reduced-transparency:_reduce)]:backdrop-blur-none",
          className,
        )}
      >
        {groups.map((group, index) => (
          <React.Fragment key={index}>
            {index > 0 && <Separator orientation="vertical" className="h-5" />}
            <div className="flex min-w-0 items-center gap-1">{group}</div>
          </React.Fragment>
        ))}
      </div>
    );
  },
);
FloatingToolbar.displayName = "FloatingToolbar";
