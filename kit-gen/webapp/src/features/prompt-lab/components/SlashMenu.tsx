import * as React from "react";
import { cn } from "@/lib/utils";
import type { SlashItem } from "../lib/slash-items";

/**
 * SlashMenu — hộp hiện ra khi gõ `/`.
 *
 * Cách nó được đưa lên màn hình khác hẳn phần còn lại của app: nó KHÔNG nằm
 * trong cây React của màn. `@tiptap/suggestion` dựng nó bằng `ReactRenderer` rồi
 * `props.mount()` gắn thẳng vào `document.body` và tự neo theo con trỏ. Hệ quả
 * thực dụng: component này không được đọc bất kỳ context nào của app (theme
 * store, tooltip provider…) vì nó ở ngoài mọi provider — mọi thứ nó cần phải
 * đến qua props. Màu thì vẫn đúng, vì token màu là biến CSS trên `:root`.
 */
export interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

/** Cửa để plugin đẩy phím xuống — xem `onKeyDown` trong SlashCommand.ts. */
export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashMenu = React.forwardRef<SlashMenuHandle, SlashMenuProps>(({ items, command }, ref) => {
  const [selected, setSelected] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  /* Danh sách đổi (người dùng gõ thêm chữ) ⇒ về mục đầu. Không reset thì con trỏ
     chọn ở vị trí 6 trong danh sách 2 mục và Enter không chèn được gì. */
  React.useEffect(() => setSelected(0), [items]);

  /* Cuộn mục đang chọn vào tầm nhìn — menu cao tối đa 20rem, 10 mục là đã tràn. */
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  React.useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelected((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        /* Tab chọn luôn, giống mọi menu `/` mà người dùng đã quen (Notion, Slack).
           Không nhận Tab thì tiêu điểm nhảy ra khỏi editor giữa chừng. */
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  if (items.length === 0) {
    return (
      <div className="w-80 rounded-2 border border-line-subtle bg-overlay p-3 text-body text-fg-muted shadow-2">
        Không có mục nào khớp
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Chèn nhanh"
      className="max-h-80 w-80 overflow-y-auto rounded-2 border border-line-subtle bg-overlay p-1 text-body shadow-2"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selected}
          data-active={index === selected}
          /* `onMouseDown` + preventDefault, KHÔNG phải `onClick`: bấm chuột vào
             một phần tử ngoài editor sẽ cướp selection của ProseMirror trước khi
             `click` kịp bắn, và lệnh chèn sẽ chèn vào hư không. Chặn ngay ở
             mousedown thì con trỏ vẫn nằm nguyên chỗ gõ `/`. */
          onMouseDown={(event) => {
            event.preventDefault();
            command(item);
          }}
          onMouseEnter={() => setSelected(index)}
          className={cn(
            "flex w-full flex-col items-start gap-0.5 rounded-1 px-2 py-1.5 text-left",
            index === selected ? "bg-accent/[var(--kg-tint-a)] text-fg-strong" : "text-fg",
          )}
        >
          <span className="text-body font-medium text-fg-strong">{item.title}</span>
          <span className="text-caption text-fg-muted">{item.hint}</span>
        </button>
      ))}
    </div>
  );
});
SlashMenu.displayName = "SlashMenu";
