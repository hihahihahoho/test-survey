import * as React from "react";
import { cn } from "@/lib/utils";
import type { RenameState } from "../../hooks/use-subfile-actions";

/**
 * ĐỔI TÊN TẠI CHỖ trên tab (§4.4: `F2`, 1–48 ký tự, không trùng, `Esc` huỷ).
 *
 * Cắm vào `renderTabLabel` mà C1 đã chừa ⇒ **không sửa `FileTab.tsx`**.
 *
 * BỐN CHI TIẾT DỄ MẤT:
 *  · `Esc` huỷ, `Enter` lưu, mất focus (blur) cũng LƯU — người dùng bấm ra ngoài
 *    thường có ý "xong rồi", vứt chữ họ vừa gõ là mất việc không lý do.
 *  · Sự kiện bàn phím/chuột KHÔNG được nổi bọt lên tab: đang gõ mà `←/→` lại nhảy
 *    tab thì không sửa nổi tên. `stopPropagation` cho cả hai.
 *  · Lỗi hiện NGAY dưới ô (`role="alert"` + `aria-describedby`), không chỉ toast.
 *  · Ô nhập TỰ VẼ (không dùng `Input` của R0) vì nó phải nằm gọn trong tab cao 36px,
 *    trong suốt, không viền — `Input` là control cao 32px có nền `raised` và viền,
 *    nhét vào tab sẽ vỡ nhịp. Vẫn 0 literal màu: dùng token `text-fg-strong`,
 *    `ring-focus-ring`, `border-danger`.
 */
export interface TabRenameInputProps {
  state: RenameState;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

export function TabRenameInput({ state, onChange, onCommit, onCancel }: TabRenameInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  const errId = `kg-rename-err-${state.docId}`;
  const cancelled = React.useRef(false);

  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [state.docId]);

  return (
    <span className="relative flex min-w-0 items-center">
      <input
        ref={ref}
        value={state.value}
        disabled={state.pending}
        maxLength={64}
        autoComplete="off"
        spellCheck={false}
        aria-label={`Đổi tên file, hiện là ${state.value}`}
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? errId : undefined}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelled.current = true;
            onCancel();
          }
        }}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          onCommit();
        }}
        className={cn(
          "w-32 min-w-0 rounded-1 bg-transparent px-1 text-label text-fg-strong",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          state.error && "ring-1 ring-danger",
        )}
      />
      {state.error && (
        <span
          id={errId}
          role="alert"
          className="absolute left-0 top-full z-dropdown mt-1 w-max max-w-xs rounded-2 border border-line-subtle bg-overlay px-2 py-1 text-caption text-danger shadow-2"
        >
          {state.error}
        </span>
      )}
    </span>
  );
}
