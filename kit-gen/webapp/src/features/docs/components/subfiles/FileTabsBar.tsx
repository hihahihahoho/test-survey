import * as React from "react";
import { Plus, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FileTab } from "./FileTab";
import { TabOverflowMenu } from "./TabOverflowMenu";
import { AllFilesPopover } from "./AllFilesPopover";
import { DraftBadgeChip } from "./DraftBadgeChip";
import { useTabKeyboard } from "./useTabKeyboard";
import { splitTabs, MAX_VISIBLE_TABS, type TabItem } from "../../lib/subfile-model";
import type { FileTabsModel } from "../../hooks";

/**
 * THANH TAB FILE CON kiểu Figma (§4.3) — thành phần công khai của nhánh C.
 *
 * ROUTER-AGNOSTIC CÓ CHỦ Ý (FE2-PLAN §3-C3 và rủi ro §6 "app shell gắn tab cho 6 màn"):
 * component chỉ nhận `activeId` + gọi `onActivate`. E1 nối vào `?file=` hay route
 * `/p/:id/f/:fileId` tuỳ nó; đổi router không phải sửa file này, và story/test
 * dựng được thanh tab mà không cần dựng cả cây route.
 *
 * NĂM TRẠNG THÁI đều render, không có ca nào trắng trang:
 *  · loading  — skeleton ĐÚNG 3 tab (LoadingState của R0 là danh sách dọc, thanh tab
 *               cần khối ngang nên dùng thẳng `Skeleton`, vẫn là primitive R0).
 *  · timeout  — quá 20s: đổi sang dòng lỗi có [Thử lại], không quay mãi.
 *  · error    — câu đời thường + [Thử lại]; mã lỗi chỉ nằm trong `<details>`.
 *  · empty    — chưa có file con nào: VẪN có tab «Tất cả sheet» (bất biến §4.5)
 *               kèm gợi ý tạo file. Không có ca "thanh tab rỗng".
 *  · ready    — tab + `»` + «Tất cả N».
 *  · agent chưa chạy — không có nhánh riêng, VÌ tab không phụ thuộc agent: dữ liệu
 *               nằm trên máy. Chỗ gọi truyền `agentOffline` để hiện một dòng nói rõ
 *               "vẫn dùng được", thay vì khoá thanh tab.
 *
 * C3 BỔ SUNG (chi tiết + số đo ở `fe2/C3-REPORT.md`): `Mod+1..9` với tới cả tab thu gọn ·
 * `Shift+F10`/phím ☰ mở menu ngữ cảnh · `aria-controls` chỉ đặt khi có panel thật ·
 * thanh tab cuộn ngang có thể thao tác bằng bàn phím và không nuốt tiêu điểm.
 *
 * THỊ GIÁC FLORA: nền thanh = `canvas` (#000), tab đang mở = `surface` (#131416) liền
 * mạch với thân màn, phân cách bằng hairline ở ĐÁY hàng tab. 0 literal màu/khoảng cách.
 */
export interface FileTabsBarProps {
  model: FileTabsModel;
  onActivate: (id: string) => void;
  /** Dialog tạo file là việc của C2 — C1 chỉ phát tín hiệu. Không có ⇒ ẩn nút `+`. */
  onCreate?: () => void;
  onContextMenu?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
  /** Chân popover «Tất cả N» — C2 gắn nút Thùng rác vào đây. */
  allFilesFooter?: React.ReactNode;
  /** Ô đổi tên tại chỗ (C2) render vào tab có id này. */
  renderTabLabel?: (tab: TabItem) => React.ReactNode;
  agentOffline?: boolean;
  /** id `role="tabpanel"` mà chỗ gọi thật sự render (C3). Không có ⇒ không đặt `aria-controls`. */
  panelId?: string;
  className?: string;
}

export function FileTabsBar(props: FileTabsBarProps) {
  const {
    model, onActivate, onCreate, onContextMenu, allFilesFooter, renderTabLabel,
    agentOffline, panelId, className,
  } = props;
  const { phase, tabs, activeId } = model;

  const { visible, overflow } = React.useMemo(
    () => splitTabs(tabs, activeId, MAX_VISIBLE_TABS),
    [tabs, activeId],
  );

  const listRef = React.useRef<HTMLDivElement>(null);
  const { onKeyDown } = useTabKeyboard({
    tabs: visible,
    allTabs: tabs, // `Mod+1..9` phải với tới cả tab đang thu gọn (§4.3) — sửa của C3
    activeId,
    onActivate,
    onCreate,
    onContextMenu,
    listRef,
  });

  return (
    <div className={cn("flex w-full flex-col bg-canvas", className)}>
      <div className="flex items-end gap-2 border-b border-line-subtle px-3">
        {phase === "loading" ? (
          <div className="flex items-end gap-1 py-1.5" aria-busy="true" aria-live="polite">
            <span className="sr-only">Đang mở danh sách file…</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-32 rounded-t-2" />
            ))}
          </div>
        ) : phase === "error" || phase === "timeout" ? (
          <TabsErrorRow model={model} />
        ) : (
          <div
            ref={listRef}
            role="tablist"
            aria-label="File con của dự án"
            aria-orientation="horizontal"
            onKeyDown={onKeyDown}
            className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pt-1.5"
          >
            {visible.map((t) => (
              <FileTab
                key={t.id}
                tab={t}
                active={t.id === activeId}
                onActivate={onActivate}
                onContextMenu={onContextMenu}
                panelId={panelId}
              >
                {renderTabLabel?.(t)}
              </FileTab>
            ))}
            <TabOverflowMenu items={overflow} onActivate={onActivate} onContextMenu={onContextMenu} />
            {onCreate && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCreate}
                aria-label="Tạo file mới trong dự án"
                className="mb-0.5 shrink-0"
              >
                <Plus className="size-4" aria-hidden strokeWidth={1.5} />
              </Button>
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 pb-1">
          <DraftBadgeChip badge={model.badge} />
          {phase === "ready" && (
            <AllFilesPopover tabs={tabs} activeId={activeId} onActivate={onActivate} footer={allFilesFooter} />
          )}
        </div>
      </div>

      <TabsNotices model={model} agentOffline={agentOffline} onCreate={onCreate} />
    </div>
  );
}

/** Hàng lỗi/quá hạn — copy đời thường, kỹ thuật gập trong `<details>` (ràng buộc cứng). */
function TabsErrorRow({ model }: { model: FileTabsModel }) {
  const timeout = model.phase === "timeout";
  return (
    <div role="alert" className="flex min-h-9 flex-1 flex-wrap items-center gap-2 py-1.5 text-label text-fg">
      <span>
        {timeout
          ? "Danh sách file mở lâu bất thường. Bạn thử mở lại nhé — ảnh và bản thiết kế không bị ảnh hưởng."
          : model.errorTitle}
      </span>
      <Button variant="secondary" size="sm" onClick={model.refetch} className="gap-1">
        <RotateCw className="size-3.5" aria-hidden strokeWidth={1.5} />
        Thử lại
      </Button>
      {model.errorDetail && (
        <details className="group">
          <summary className="cursor-pointer list-none text-caption text-fg-muted-raised hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
            Chi tiết cho lập trình viên
          </summary>
          <code className="mt-1 block font-mono text-caption text-fg-muted-raised">{model.errorDetail}</code>
        </details>
      )}
    </div>
  );
}

/** Dải ghi chú dưới thanh tab: ca rỗng, ca deep-link hỏng, ca agent chưa chạy. */
function TabsNotices({
  model, agentOffline, onCreate,
}: { model: FileTabsModel; agentOffline?: boolean; onCreate?: () => void }) {
  if (model.phase !== "ready") return null;
  const empty = !model.tabs.some((t) => !t.virtual);
  const notes: React.ReactNode[] = [];

  if (model.activeFallback) {
    notes.push(
      <span key="fallback">
        Không tìm thấy file bạn vừa mở — có thể nó đã bị xoá. Đang hiện «Tất cả sheet» để bạn không mất chỗ làm.
      </span>,
    );
  }
  if (empty) {
    notes.push(
      <span key="empty" className="inline-flex items-center gap-2">
        Dự án chưa có file con nào. «Tất cả sheet» luôn cho bạn thấy toàn bộ sheet.
        {onCreate && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onCreate}>
            Tạo file đầu tiên
          </Button>
        )}
      </span>,
    );
  }
  if (agentOffline) {
    notes.push(
      <span key="offline">
        Công cụ trên máy chưa chạy. Danh sách file vẫn dùng được vì nó nằm trên máy bạn.
      </span>,
    );
  }

  if (notes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-caption text-fg-muted-raised">
      {notes}
    </div>
  );
}
