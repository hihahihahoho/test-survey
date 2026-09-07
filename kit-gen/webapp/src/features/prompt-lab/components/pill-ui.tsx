import * as React from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PillImage } from "@/features/prompt-canvas/lib/pill-image";
import { hasBlankChoice, inheritsWhenEmpty, labelOf, nounOf, pillOptions, type PillKind } from "../lib/pill-registry";
import { usePresets } from "../lib/presets-store";
import { RefImageBody } from "./RefImagePill";
import { SourcePicker, useDismiss, type SourceGroup } from "./SourcePicker";

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

/* ══════════════════════════════════════════════════════════════════════════
   LẬT MENU LÊN TRÊN KHI PHÍA DƯỚI HẾT CHỖ
   ══════════════════════════════════════════════════════════════════════════ */

/** Trần cao của `PillMenu` — PHẢI khớp `max-h-80` trong class của nó. */
export const PILL_MENU_MAX_PX = 320;
/** Trần cao của `SourcePicker` — PHẢI khớp `max-h-[22.5rem]` trong class của nó. */
export const SOURCE_PICKER_MAX_PX = 360;
/** Khe giữa nút và menu — khớp `calc(100% + 8px)` ở cả hai chiều. */
export const PILL_MENU_GAP_PX = 8;

/**
 * Menu này có nên mở NGƯỢC LÊN không.
 *
 * Hàm thuần nhận sẵn hình chữ nhật của nút: chỗ nào cũng đo được, và test được
 * mà không cần một trình duyệt thật.
 *
 * Hai điều kiện, và điều kiện thứ hai mới là điều dễ quên: (1) phía dưới không
 * đủ chỗ, VÀ (2) phía trên rộng hơn phía dưới. Thiếu (2) thì một nút nằm gần đỉnh
 * màn hình sẽ lật lên trên để rồi bị cắt còn tệ hơn.
 */
export function shouldDropUp(rect: DOMRect, maxPx: number, gapPx: number = PILL_MENU_GAP_PX): boolean {
  const below = window.innerHeight - rect.bottom;
  return below < maxPx + gapPx && rect.top > below;
}

/**
 * Trạng thái mở + phép lật của một menu neo dưới nút.
 *
 * ╔══ VÌ SAO ĐO NGAY LÚC BẤM, KHÔNG ĐO TRONG EFFECT ═════════════════════════╗
 * ║ Đo trong một effect sau khi menu đã render thì menu đã đẩy chiều cao trang ║
 * ║ (và có thể đã kéo cả thanh cuộn), nên phép đo "còn bao nhiêu chỗ phía dưới"║
 * ║ trả lời cho một trang khác với trang lúc người dùng bấm.                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Nhà của hook này là `pill-ui` chứ không phải một màn cụ thể: luật lật từng chỉ
 * sống trong `UiKitBlockView` (hộp tra danh mục), và vì thế mọi menu khác của màn
 * — kể cả «Thêm thẻ» ở cuối trang, nơi thiếu chỗ nhất — không có nó.
 */
export function useMenuFlip(maxPx: number = PILL_MENU_MAX_PX) {
  const [open, setOpen] = React.useState(false);
  const [dropUp, setDropUp] = React.useState(false);

  const toggle = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setDropUp(shouldDropUp(event.currentTarget.getBoundingClientRect(), maxPx));
      setOpen((v) => !v);
    },
    [maxPx],
  );

  return { open, setOpen, dropUp, toggle };
}

/**
 * Hộp menu thả xuống dưới pill.
 *
 * Đóng bằng ba đường, vì thiếu đường nào cũng có người kẹt: bấm ra ngoài (chuột),
 * Escape (bàn phím), và chọn một mục (đường thường). Hai đường đầu do `useDismiss`
 * lo — CÙNG hàm mà `SourcePicker` dùng, nên hai hộp trên cùng một màn không bao
 * giờ đóng theo hai luật khác nhau.
 *
 * ⚠️ MENU NEO VÀO ĐÚNG CÁI NÚT, VÀ VÌ THẾ VỎ BỌC PHẢI ÔM SÁT NÚT.
 * `top-[calc(100%+8px)]` đo từ đáy của phần tử `relative` gần nhất — không phải
 * từ đáy nút. Bọc nút trong một khối `relative` CÓ ĐỆM DƯỚI là menu rơi xuống
 * dưới lớp đệm ấy: đã dính thật ở nút «Thêm thẻ» (`pb-16` ⇒ menu lơ lửng cách nút
 * ~70px, dính đáy khung nhìn). Vỏ của menu chỉ được là một `relative inline-block`
 * ôm sát nút; mọi khoảng cách để ở lớp NGOÀI.
 */
export function PillMenu({
  label,
  onClose,
  dropUp,
  children,
}: {
  label: string;
  onClose: () => void;
  /** Mở ngược lên trên — xem `useMenuFlip`. */
  dropUp?: boolean;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  /* Luật đóng nằm ở `useDismiss` — CÙNG một luật với `SourcePicker`, vì hai hộp
     này đứng cạnh nhau trên màn và một cái đóng theo kiểu khác là một thứ nữa
     phải học. */
  useDismiss(ref, onClose);

  return (
    /* `<span className="block">` chứ không `<div>`: menu này cũng mọc ra từ một
       pill nằm giữa một `<p>` (câu Ngữ cảnh chung), và `<div>` trong `<p>` là
       một thẻ bị parser HTML đẩy ra ngoài câu — xem `SourcePicker`. */
    <span
      ref={ref}
      role="listbox"
      aria-label={label}
      /* `text-body`: menu KHÔNG kế thừa cỡ chữ của câu. Một menu 10 mục ở cỡ
         tiêu đề thì cao hơn cả màn hình. */
      className={cn(
        "absolute left-0 z-40 block max-h-80 w-72 overflow-y-auto rounded-2 border border-line-subtle bg-overlay p-1 text-body shadow-2",
        dropUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
      )}
    >
      {children}
    </span>
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
 * BỀ NGANG CHỮ TỰ GÕ hiện trên pill trước khi bị cắt.
 *
 * Cắt là bắt buộc, không phải thẩm mỹ: chuỗi này đi NGUYÊN VĂN vào prompt nên nó
 * dài bao nhiêu cũng hợp lệ, mà một câu 300 ký tự nằm trong một cái pill thì đẩy
 * cả đoạn văn quanh nó xuống bốn hàng. Chữ đầy đủ vẫn đọc được ở `title`.
 */
const CUSTOM_MAX = 40;

function shorten(value: string): string {
  return value.length > CUSTOM_MAX ? `${value.slice(0, CUSTOM_MAX)}…` : value;
}

/**
 * PILL CHỌN-MỘT hoàn chỉnh — nhãn + hộp nguồn, đọc danh mục theo `kind`.
 *
 * Đây là thứ mà cả node view TipTap lẫn ô lưới React đều gọi. Nhận `value` +
 * `onChange` chứ không tự giữ state: nguồn sự thật là tài liệu ProseMirror (ca
 * thứ nhất) hoặc mảng ô trong React (ca thứ hai), không phải cái nút.
 *
 * ╔══ BA NGẢ, VÀ VÌ SAO CHÚNG KHÔNG CÒN LÀ BA MỤC CUỐI MENU ═════════════════╗
 * ║ Bản trước để «Gõ mô tả riêng…» và «Đính ảnh tham chiếu» làm hai MỤC nằm   ║
 * ║ dưới đáy danh sách. Với danh mục 10 mục thì chúng rơi ra ngoài tầm nhìn,  ║
 * ║ và chủ sản phẩm bắt đúng: *"phải scroll xuống dưới mới thấy được custom"*.║
 * ║ Nay ba ngả là ba NẤC ghim ở đầu hộp (`SourcePicker`) — cùng một hộp cho   ║
 * ║ theme, phong cách, nhân vật và trang phục, nên bốn chỗ trông và bấm giống ║
 * ║ hệt nhau. Pill chỉ còn lo phần NHÌN: nó đang trả lời bằng đường nào.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ ẢNH NẰM TRONG PILL, KHÔNG ĐỨNG CẠNH PILL ══════════════════════════════
 * Bản trước đính ảnh xong thì thả một pill ảnh RỜI ngay sau pill — hai vật cho
 * một câu trả lời, và người dùng phải tự hiểu rằng chúng đi cùng nhau. Nay một
 * pill là một nguồn: tấm ảnh thành thumbnail ngay trong chính pill ấy.
 */
export function OptionPill({
  kind,
  value,
  onChange,
  compact,
  axis,
  custom = "",
  onCustom,
  image = null,
  onAttach,
  onDropImage,
  attaching,
  extraGroups,
  projectId,
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
  /**
   * Chữ NGƯỜI DÙNG TỰ GÕ. Có chữ ⇒ nó THẮNG `value` cả trên pill lẫn trong
   * prompt (xem `pillText` ở `serialize.ts`), và `value` vẫn nằm nguyên đó để
   * bỏ chữ đi là quay về đúng lựa chọn cũ.
   */
  custom?: string;
  /** Vắng ⇒ hộp KHÔNG bày nấc «Gõ riêng». */
  onCustom?: (next: string) => void;
  /** Ảnh đang dùng cho pill này — hiện thành thumbnail ĐỨNG TRƯỚC nhãn. */
  image?: PillImage | null;
  /** Vắng ⇒ hộp KHÔNG bày nấc «Đính ảnh» — xem `takesImage`. */
  onAttach?: (file: File) => void;
  /** Bỏ tấm ảnh đang dùng. */
  onDropImage?: () => void;
  /** Đang tải tấm ảnh vừa chọn lên dự án. */
  attaching?: boolean;
  /**
   * Nhóm mục ĐỨNG TRƯỚC danh mục của `kind` — chỗ để mời linh vật của thương
   * hiệu đang chọn. Đứng trước vì nó CỤ THỂ hơn: người đã chọn thương hiệu thì
   * thứ họ tìm gần như chắc chắn nằm ở đó.
   *
   * Với pill nhân vật thì đây là nguồn DUY NHẤT (`pillOptions("mascot")` rỗng):
   * rỗng cả hai ⇒ hộp không còn nấc «Chọn sẵn» nào để bày.
   */
  extraGroups?: readonly SourceGroup[];
  /** Dự án đang mở — cần để hộp đọc được thumbnail của ảnh đã đính. */
  projectId?: string | null;
}) {
  const flip = useMenuFlip(SOURCE_PICKER_MAX_PX);
  const button = React.useRef<HTMLButtonElement>(null);
  const presets = usePresets();
  const options = React.useMemo(() => pillOptions(kind, presets), [kind, presets]);
  const canInherit = inheritsWhenEmpty(kind);
  const noun = nounOf(kind);

  /* Nhóm RỖNG bị loại ngay ở đây, không đẩy xuống cho hộp tự lọc: `SourcePicker`
     quyết định có bày nấc «Chọn sẵn» hay không bằng chính mảng này, nên một nhóm
     rỗng lọt vào là một nấc trống mở ra không có gì. */
  const groups: SourceGroup[] = React.useMemo(
    () => [...(extraGroups ?? []), { options }].filter((group) => group.options.length > 0),
    [extraGroups, options],
  );

  const shot = image?.path ? image : null;
  /**
   * CHỮ trên pill.
   *
   * Ảnh KHÔNG nuốt chữ, nó chỉ đứng thêm vào: một pill có cả ảnh lẫn một mục
   * chọn sẵn là chuyện thường (ảnh nhân vật + tên nhân vật trong thư viện), và
   * nếu ảnh che mất nhãn thì người vừa bấm "Tết" sẽ tưởng cú bấm của mình rơi
   * đâu mất. Chỉ khi KHÔNG có gì khác để nói thì tên tệp mới làm nhãn.
   */
  /* `value` chỉ được lên nhãn khi CÓ danh mục để tra nó: pill nhân vật không còn
     danh mục nào (xem `pillOptions`), nên một `value` sót lại từ bản nháp lượt
     trước sẽ hiện ra nguyên id thô ("mascot-default") — một chữ người dùng chưa
     bao giờ gõ, cho một lựa chọn không còn tồn tại. */
  const label = custom
    ? shorten(custom)
    : value && options.length > 0
      ? labelOf(kind, value, presets)
      : shot
        ? shot.refName
        : labelOf(kind, "", presets);
  const title = custom || undefined;

  /* Đóng hộp thì trả focus VỀ ĐÚNG cái pill vừa mở nó. Thiếu bước này thì người
     dùng bàn phím bị thả về đầu tài liệu sau mỗi lượt chọn. */
  const close = React.useCallback(() => {
    flip.setOpen(false);
    button.current?.focus();
  }, [flip]);

  return (
    <span className={cn("relative inline-block", axis && "min-w-0")}>
      <PillButton
        ref={button}
        compact={compact}
        active={flip.open}
        muted={!value && !custom && !shot}
        onClick={flip.toggle}
        aria-haspopup="listbox"
        aria-expanded={flip.open}
        /* `aria-label` chỉ khi có nhãn trục: trình đọc màn hình phải nghe được
           TRỤC lẫn GIÁ TRỊ, mà `truncate` thì chỉ cắt phần nhìn thấy. */
        {...(axis ? { "aria-label": `${axis}: ${label}` } : {})}
        {...(title ? { title } : {})}
        className={axis ? "max-w-full" : undefined}
      >
        {axis && <PillAxis>{axis}</PillAxis>}
        {/* Thumbnail đứng TRƯỚC chữ. Nút bỏ ảnh nằm ngay trên nó vì đó là hành
            động duy nhất người ta muốn làm với tấm ảnh mà không cần mở hộp. */}
        {shot && onDropImage && (
          <RefImageBody projectId={projectId ?? null} image={shot} onRemove={onDropImage} />
        )}
        <span className={cn(axis && "truncate")}>{label}</span>
        {/* Cái bút nói ra "chữ này do bạn viết, không phải một mục có sẵn" — nếu
            không thì một mô tả tự gõ trông y hệt một preset và người dùng đi tìm
            nó trong danh sách. */}
        {!shot && custom && <Pencil aria-hidden className="size-3.5 shrink-0 opacity-60" />}
        {attaching && <Loader aria-hidden />}
        <PillCaret compact={compact} />
      </PillButton>

      {flip.open && (
        <SourcePicker
          label={noun}
          groups={groups}
          {...(hasBlankChoice(kind) ? { emptyLabel: canInherit ? "— theo cái chung —" : "— để trống —" } : {})}
          value={value}
          custom={custom}
          image={shot}
          projectId={projectId ?? null}
          dropUp={flip.dropUp}
          onClose={close}
          /* Bấm một mục có sẵn ⇒ chữ tự gõ bị GỠ. Giữ lại là pill hiện chữ cũ
             trong khi người dùng vừa bấm một mục khác — hai câu trả lời cho một
             câu hỏi. Ảnh thì KHÔNG bị gỡ: một tấm ảnh nhân vật vẫn đúng khi đổi
             tên nhân vật, và gỡ nó là xoá thứ đắt nhất họ đã tải lên. */
          onChoose={(next) => {
            onChange(next);
            onCustom?.("");
          }}
          {...(onCustom ? { onCustom } : {})}
          {...(onAttach ? { onAttach } : {})}
          {...(onDropImage ? { onDropImage } : {})}
        />
      )}
    </span>
  );
}

/** Vòng xoay bé xíu, chỉ dùng trong pill — không kéo cả một component trạng thái. */
function Loader(props: { "aria-hidden"?: boolean }) {
  return (
    <span
      {...props}
      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"
    />
  );
}
