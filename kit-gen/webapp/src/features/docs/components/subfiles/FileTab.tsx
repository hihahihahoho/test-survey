import * as React from "react";
import { cn } from "@/lib/utils";
import { KIND_ICON, KIND_LABEL, COLOR_DOT, COLOR_LABEL } from "./doc-visuals";
import { tabDomId } from "../../lib/subfile-a11y";
import type { TabItem } from "../../lib/subfile-model";

/**
 * MỘT TAB FILE — §4.3: bo TRÊN 12px, cao 36px, tab đang mở nền `surface` liền mạch
 * với thân màn (nền `canvas` = #000), tab khác trong suốt + chữ `fg`.
 *
 * A11Y (APG Tabs, roving tabindex):
 *  · `role="tab"` + `aria-selected` + `tabIndex` do CHA quản (chỉ tab đang mở = 0).
 *  · Chấm `●` "chưa lưu" và chấm màu nhãn đều `aria-hidden`; thông tin của chúng
 *    được nói lại bằng CHỮ trong `aria-label` — luật A3 "không dùng màu làm dấu
 *    hiệu duy nhất" áp cho cả dấu chấm.
 *  · Tab ảo «Tất cả sheet» có nhãn nói rõ nó là file hệ thống, vì nó không đổi
 *    tên/xoá được và người dùng cần biết trước khi thử.
 *
 * SỬA CỦA C3 — `aria-controls` KHÔNG được trỏ vào hư không:
 *  bản C1 đặt cứng `aria-controls="kg-file-panel"` trong khi **không màn nào render
 *  phần tử đó** (đo được: `document.getElementById("kg-file-panel")` = `null`, xem
 *  `fe2/C3-REPORT.md` §2). Một `aria-controls` treo khiến trình đọc màn hình hứa một
 *  vùng nội dung rồi không đưa người dùng tới được. Giờ thuộc tính chỉ xuất hiện khi
 *  chỗ gọi (E1) NÓI rằng nó có render panel — truyền `panelId`.
 */
export interface FileTabProps {
  tab: TabItem;
  active: boolean;
  onActivate: (id: string) => void;
  /** menu ngữ cảnh do C2 gắn; C1 chỉ chuyển sự kiện lên, không tự dựng menu. */
  onContextMenu?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  /** id của `role="tabpanel"` mà chỗ gọi THẬT SỰ render. Không có ⇒ bỏ `aria-controls`. */
  panelId?: string;
  /** ô đổi tên tại chỗ (F2) do C2 gắn. Khi có, tab render children thay cho nhãn. */
  children?: React.ReactNode;
}

export const FileTab = React.forwardRef<HTMLButtonElement, FileTabProps>(
  ({ tab, active, onActivate, onContextMenu, panelId, children }, ref) => {
    const Icon = KIND_ICON[tab.kind];
    const parts = [
      tab.name,
      tab.virtual ? "file hệ thống" : KIND_LABEL[tab.kind],
      tab.dirty ? "có thay đổi chưa lưu" : null,
      tab.color !== "none" ? `nhãn ${COLOR_LABEL[tab.color]}` : null,
      tab.staleCount > 0 ? `${tab.staleCount} sheet mất liên kết` : null,
    ].filter(Boolean);

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        id={tabDomId(tab.id)}
        aria-selected={active}
        {...(panelId ? { "aria-controls": panelId } : {})}
        tabIndex={active ? 0 : -1}
        onClick={() => onActivate(tab.id)}
        onContextMenu={(e) => {
          if (!onContextMenu) return;
          e.preventDefault();
          onContextMenu(tab.id, e);
        }}
        aria-label={parts.join(" · ")}
        className={cn(
          "group relative inline-flex h-9 max-w-[200px] shrink-0 items-center gap-2 rounded-t-2 px-3",
          "text-label transition-colors duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          active
            ? "bg-surface text-fg-strong"
            : "bg-transparent text-fg hover:bg-surface/60 hover:text-fg-strong",
        )}
      >
        <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={1.5} />
        {tab.color !== "none" && (
          <span className={cn("size-1.5 shrink-0 rounded-full", COLOR_DOT[tab.color])} aria-hidden />
        )}
        {children ?? <span className="truncate">{tab.name}</span>}
        {tab.dirty && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />}
      </button>
    );
  },
);
FileTab.displayName = "FileTab";
