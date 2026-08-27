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
      /* `min-w-0` để pill CO ĐƯỢC khi nằm trong một hàng `flex-nowrap` (hàng 1 của
         dòng element). Thiếu nó thì nội dung giữ nguyên bề rộng tự nhiên và hàng
         tràn ngang — đúng chỗ vỡ bố cục mà hàng element vừa phải sửa. */
      "min-w-0",
      compact ? "px-2 py-0.5 text-caption" : "px-3 py-1",
      "border-line bg-raised text-fg-strong",
      "transition-colors duration-fast ease-out hover:border-line-strong hover:bg-overlay",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
      /* ĐANG MỞ MENU ⇒ vòng 1px của riêng nó. Viền accent một mình không đủ: pill
         vốn đã có viền, nên "đổi màu viền" là một thay đổi người ta chỉ thấy khi
         đã biết mà tìm. Thêm một vòng mỏng thì cái pill đang mở tự tách ra khỏi
         hàng pill cạnh nó — cùng ngôn ngữ 1px với vòng focus của vùng soạn thảo
         (xem `prompt-lab.css`), nên cả màn chỉ có MỘT kiểu "đang được chú ý". */
      active && "border-accent ring-1 ring-accent",
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
 * TÊN TRỤC in mờ NGAY TRONG pill — «Phong cách: Chibi ⌄».
 *
 * ╔══ VÌ SAO CHỮ NỐI RỜI KHỎI PILL PHẢI BIẾN MẤT ════════════════════════════╗
 * ║ Hàng element trước đây là một câu: `— phong cách [pill], đục nền [pill],` ║
 * ║ `viền [pill], cỡ [pill],` rồi tới ô ghi chú. Bốn cụm chữ nối ấy là bốn    ║
 * ║ vật KHÔNG CO ĐƯỢC nằm xen giữa bốn vật co được, nên khi tên element dài   ║
 * ║ ra thì thứ bị đẩy xuống hàng dưới là ô ghi chú — và mỗi dòng cao một kiểu.║
 * ║ Chủ sản phẩm chỉ đúng chỗ ấy: *"bố cục vỡ, mỗi dòng cao thấp khác nhau"*. ║
 * ║ Gộp nhãn trục VÀO pill thì hàng chỉ còn TOÀN vật co được: nó không bao    ║
 * ║ giờ wrap nữa, nó chỉ cắt bớt chữ — mà chữ bị cắt là nhãn, còn giá trị thì ║
 * ║ vẫn đọc được vì nó đứng sau dấu hai chấm và được ưu tiên giữ.             ║
 * ║ Tiện thể nó trả lời luôn *"sao vẫn không thấy select điền size"*: pill cỡ ║
 * ║ nay TỰ XƯNG TÊN («Cỡ: theo hệ thống ⌄») thay vì là một chữ trôi nổi.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function PillAxis({ children }: { children: React.ReactNode }) {
  /* `shrink-0` cho nhãn, còn phần giá trị mới là phần co: khi hàng chật, thứ đáng
     giữ là "đây là pill gì" — mất nó thì bốn pill giống hệt nhau. */
  return <span className="shrink-0 text-fg-muted">{children}:</span>;
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
  axis,
}: {
  kind: PillKind;
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
  /**
   * Tên trục in mờ trong pill («Phong cách»). Chỉ truyền ở chỗ pill đứng THÀNH
   * HÀNG cạnh nhau (dòng element) — trong một câu mad-lib thì câu đã nói ra trục
   * rồi, thêm nhãn nữa là đọc hai lần cùng một chữ.
   */
  axis?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const presets = usePresets();
  const options = React.useMemo(() => pillOptions(kind, presets), [kind, presets]);
  const canInherit = inheritsWhenEmpty(kind);

  return (
    <span className={cn("relative inline-block", axis && "min-w-0")}>
      <PillButton
        compact={compact}
        active={open}
        muted={!value}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        /* `aria-label` chỉ khi có nhãn trục: trình đọc màn hình phải nghe được
           TRỤC lẫn GIÁ TRỊ, mà `truncate` thì chỉ cắt phần nhìn thấy. */
        {...(axis ? { "aria-label": `${axis}: ${labelOf(kind, value, presets)}` } : {})}
        className={axis ? "max-w-full" : undefined}
      >
        {axis && <PillAxis>{axis}</PillAxis>}
        <span className={cn(axis && "truncate")}>{labelOf(kind, value, presets)}</span>
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
