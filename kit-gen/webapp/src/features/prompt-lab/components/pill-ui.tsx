import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { inheritsWhenEmpty, labelOf, pillOptions, type PillKind } from "../lib/pill-registry";
import { usePresets } from "../lib/presets-store";

/**
 * pill-ui.tsx — HÌNH DẠNG CHUNG của mọi pill, dùng ở HAI NƠI.
 *
 * ┌── VÌ SAO CÙNG MỘT PILL PHẢI CHẠY CẢ TRONG LẪN NGOÀI TIPTAP ──────────────┐
 * │ Pill xuất hiện ở hai chỗ có bản chất khác nhau:                          │
 * │  · TRONG câu mad-lib của block Background/Mascot ⇒ là node ProseMirror;  │
 * │  · TRONG ô của lưới UI kit và hàng theme tổng ⇒ chỉ là React thuần, vì   │
 * │    chỗ đó không có văn bản nào để soạn (xem `composer-model.ts`).        │
 * │ Nếu mỗi bên tự vẽ pill của mình thì cùng một vật sẽ có hai hình dạng và  │
 * │ hai hành vi — người dùng học hai lần. Nên phần NHÌN + BẤM nằm ở đây,     │
 * │ node view chỉ bọc thêm lớp ProseMirror quanh nó.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ KHÔNG dùng Radix DropdownMenu, dù repo có sẵn. Radix quản focus bằng
 * focus-trap và trả focus về trigger khi đóng; trigger lại nằm TRONG một vùng
 * `contenteditable` mà ProseMirror cũng đang quản selection. Hai bên cùng giành
 * một con trỏ ⇒ mở menu là mất chỗ nháy, đóng menu là con trỏ nhảy về đầu bài.
 * Menu ở đây cố ý thô sơ: một hộp tuyệt đối + click ra ngoài để đóng, không đụng
 * vào focus của editor. Làm thật thì đây là chỗ phải đàm phán lại tử tế với
 * ProseMirror, không phải chỗ để tiết kiệm.
 */

/** Nút pill — vật bấm được duy nhất trong câu mad-lib. */
export const PillButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; muted?: boolean; compact?: boolean }
>(({ className, active, muted, compact, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      /* `align-baseline` + cỡ chữ KẾ THỪA: pill nằm trong câu `text-prose` (20px).
         Không khai cỡ riêng ở đây là có chủ ý — đổi bậc của câu thì pill đi theo,
         nên chữ và pill không bao giờ lệch cỡ nhau. Ghim đường chân chữ vì nếu
         không, mỗi pill đẩy dòng của nó cao thêm vài px và cả đoạn răng cưa. */
      "inline-flex items-center gap-1.5 rounded-full border align-baseline",
      compact ? "px-2 py-0.5 text-caption" : "px-3 py-1",
      "border-line bg-raised text-fg-strong",
      "transition-colors duration-fast ease-out hover:border-line-strong hover:bg-overlay",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      active && "border-accent",
      muted && "text-fg-muted",
      className,
    )}
    {...props}
  >
    {children}
  </button>
));
PillButton.displayName = "PillButton";

/** Mũi tên ⌄ của pill mở được menu — đúng dấu hiệu trong ảnh mẫu. */
export function PillCaret({ compact }: { compact?: boolean }) {
  return <ChevronDown aria-hidden className={cn("shrink-0 opacity-60", compact ? "size-3" : "size-4")} />;
}

/**
 * Hộp menu thả xuống dưới pill.
 *
 * Đóng bằng ba đường, vì thiếu đường nào cũng có người kẹt: bấm ra ngoài (chuột),
 * Escape (bàn phím), và chọn một mục (đường thường). Nghe ở pha CAPTURE để bắt
 * được cả cú bấm rơi vào vùng contenteditable — ProseMirror gọi
 * `preventDefault()` khá sớm ở pha bubble.
 */
export function PillMenu({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as globalThis.Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      /* `text-body`: menu KHÔNG kế thừa cỡ chữ của câu. Một menu 10 mục ở cỡ
         tiêu đề thì cao hơn cả màn hình. */
      className="absolute left-0 top-[calc(100%+8px)] z-40 max-h-80 w-72 overflow-y-auto rounded-2 border border-line-subtle bg-overlay p-1 text-body shadow-2"
    >
      {children}
    </div>
  );
}

/** Một mục chọn được trong menu. */
export function PillMenuItem({
  selected,
  onSelect,
  children,
}: {
  selected?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={!!selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-1 px-2 py-1.5 text-left text-body",
        "hover:bg-accent/[var(--kg-tint-a)] hover:text-fg-strong",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        selected ? "text-fg-strong" : "text-fg",
      )}
    >
      {children}
    </button>
  );
}

/**
 * PILL CHỌN-MỘT hoàn chỉnh — nhãn + menu, đọc danh mục theo `kind`.
 *
 * Đây là thứ mà cả node view TipTap lẫn ô lưới React đều gọi. Nhận `value` +
 * `onChange` chứ không tự giữ state: nguồn sự thật là tài liệu ProseMirror (ca
 * thứ nhất) hoặc mảng ô trong React (ca thứ hai), không phải cái nút.
 */
export function OptionPill({
  kind,
  value,
  onChange,
  compact,
}: {
  kind: PillKind;
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const presets = usePresets();
  const options = React.useMemo(() => pillOptions(kind, presets), [kind, presets]);
  const canInherit = inheritsWhenEmpty(kind);

  return (
    <span className="relative inline-block">
      <PillButton
        compact={compact}
        active={open}
        muted={!value}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{labelOf(kind, value, presets)}</span>
        <PillCaret compact={compact} />
      </PillButton>

      {open && (
        <PillMenu label={`Chọn ${labelOf(kind, "", presets)}`} onClose={() => setOpen(false)}>
          {/* Mục "để trống" luôn có mặt. Với kind kế thừa thì nó là MẶC ĐỊNH có
              nghĩa ("theo cái chung"); với kind còn lại nó là đường lùi khi lỡ
              tay chọn. Không có nó là người dùng kẹt với lựa chọn đầu tiên. */}
          <PillMenuItem
            selected={!value}
            onSelect={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span className="text-fg-muted">{canInherit ? "— theo cái chung —" : "— để trống —"}</span>
          </PillMenuItem>

          {options.map((option) => (
            <PillMenuItem
              key={option.value}
              selected={option.value === value}
              onSelect={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg-strong">{option.vi}</span>
                {/* Hiện luôn cụm tiếng Anh SẼ vào prompt. Đây là cả điểm của
                    demo: người dùng thấy trước cái máy sẽ đọc, không phải đoán. */}
                <span className="block truncate text-caption text-fg-muted">{option.en}</span>
              </span>
            </PillMenuItem>
          ))}
        </PillMenu>
      )}
    </span>
  );
}
