import * as React from "react";
import { Check, ImagePlus, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PillImage } from "@/features/prompt-canvas/lib/pill-image";
import { useRefThumb } from "./RefImagePill";

/**
 * SourcePicker — MỘT hộp chọn cho MỌI câu hỏi "cái này lấy từ đâu".
 *
 * ╔══ VÌ SAO PHẢI GOM LẠI, VÀ VÌ SAO BA NGẢ PHẢI Ở ĐẦU HỘP ══════════════════╗
 * ║ Bản trước nhét ba ngả vào một danh sách dài: mười mục có sẵn, rồi mới tới ║
 * ║ «Gõ mô tả riêng…» và «Đính ảnh tham chiếu» ở CUỐI. Chủ sản phẩm nhìn ảnh  ║
 * ║ chụp và nói đúng chỗ đau: *"phải scroll xuống dưới mới thấy được custom"* ║
 * ║ — hai đường quan trọng nhất bị chôn dưới một thanh cuộn, tức là với người ║
 * ║ chưa biết chúng tồn tại thì chúng KHÔNG tồn tại.                          ║
 * ║ Cách chữa không phải "kéo hai mục lên đầu": chúng không cùng hạng với một ║
 * ║ mục danh mục. «Tết» là một CÂU TRẢ LỜI; «gõ riêng» là một CÁCH TRẢ LỜI.   ║
 * ║ Nên hộp này chia theo CÁCH: một thanh ba nấc ghim cứng ở đầu, không bao   ║
 * ║ giờ cuộn đi đâu, và nấc đang hiệu lực được tô sẵn lúc mở — mở ra là thấy  ║
 * ║ ngay mình đang trả lời bằng đường nào và còn hai đường nào khác.          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ MỘT HỘP CHO BỐN CHỖ, VÀ ĐÓ LÀ CẢ Ý NGHĨA CỦA FILE NÀY ═════════════════╗
 * ║ Theme · phong cách · nhân vật · trang phục đều hỏi cùng một câu và đều    ║
 * ║ nhận được ba loại nguyên liệu. Chủ sản phẩm: *"ui nên đồng nhất cho mấy   ║
 * ║ cái này"*. Nếu mỗi chỗ tự vẽ hộp của mình thì bốn chỗ sẽ có bốn thứ tự    ║
 * ║ nút, bốn kiểu báo "đang chọn cái này", và người dùng học bốn lần.         ║
 * ║ Nấc nào KHÔNG áp dụng thì ẩn (trang phục không có ảnh), và khi chỉ còn    ║
 * ║ một nấc thì cả thanh biến mất — hộp tự thu về đúng một danh sách chọn,    ║
 * ║ y như mọi pill dáng/góc/nét mặt vẫn luôn là.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ KHÔNG dùng Radix Popover, dù repo có sẵn — cùng lý do đã ghi ở `pill-ui.tsx`:
 * focus-trap của Radix giành con trỏ với ProseMirror ở vùng `contenteditable`.
 */

/** Ngưỡng bày ô tìm nhanh. Dưới mức này thì mắt quét nhanh hơn tay gõ. */
const SEARCH_MIN = 6;

/** Một mục chọn sẵn. `en` là cụm sẽ vào prompt — hiện luôn để không ai phải đoán. */
export interface SourceOption {
  value: string;
  vi: string;
  en?: string;
  /** Ghi chú phụ (tên ảnh của một nhân vật mẫu chẳng hạn). */
  hint?: string;
}

/** Một nhóm mục có tiêu đề — dùng khi danh sách đến từ hai kho khác nhau. */
export interface SourceGroup {
  /** Rỗng/vắng ⇒ nhóm không có tiêu đề, danh sách chạy một mạch. */
  title?: string;
  options: readonly SourceOption[];
}

/** Ba cách trả lời. Thứ tự này là thứ tự nút trên thanh, và nó cố định. */
export type SourceTab = "preset" | "ref" | "custom";

const TAB_LABEL: Record<SourceTab, string> = {
  preset: "Chọn sẵn",
  ref: "Đính ảnh",
  custom: "Gõ riêng",
};

/* ══════════════════════════════════════════════════════════════════════════
   ĐÓNG HỘP — một hook, vì có hai hộp cần đúng luật này
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Bấm ra ngoài / Escape ⇒ đóng.
 *
 * Nghe ở pha CAPTURE để bắt được cả cú bấm rơi vào vùng `contenteditable`:
 * ProseMirror gọi `preventDefault()` khá sớm ở pha bubble, nên một listener
 * thường sẽ không bao giờ chạy khi hộp đang mở trong một câu tự do.
 *
 * Nhà của hook ở đây chứ không ở `pill-ui.tsx` để tránh vòng import: `pill-ui`
 * đọc file này (pill mở hộp), nên file này không được đọc ngược lại.
 */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, onClose: () => void): void {
  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as globalThis.Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref, onClose]);
}

/* ══════════════════════════════════════════════════════════════════════════
   Hộp
   ══════════════════════════════════════════════════════════════════════════ */

export interface SourcePickerProps {
  /** Tên của thứ đang chọn («theme», «nhân vật») — đi vào mọi nhãn trợ năng. */
  label: string;
  groups: readonly SourceGroup[];
  /** Nhãn của mục "để trống" đứng đầu danh sách; vắng ⇒ không có mục ấy. */
  emptyLabel?: string;
  /** Mục có sẵn đang chọn. */
  value: string;
  /** Chữ người dùng tự gõ — có chữ thì nó THẮNG `value`. */
  custom: string;
  /** Ảnh đang dùng cho pill này. */
  image: PillImage | null;
  /** Dự án đang mở — cần để đọc thumbnail. */
  projectId?: string | null;
  onChoose: (value: string) => void;
  /** Vắng ⇒ KHÔNG có nấc «Gõ riêng». */
  onCustom?: (text: string) => void;
  /**
   * RUỘT RIÊNG cho nấc «Gõ riêng», thay cho ô ba dòng mặc định.
   *
   * ╔══ VÌ SAO LÀ MỘT KHE, KHÔNG PHẢI MỘT HỘP THỨ HAI ════════════════════════╗
   * ║ Pill CỠ cũng hỏi đúng câu của hộp này («chọn sẵn hay tự điền?») nhưng    ║
   * ║ thứ tự điền của nó là HAI Ô SỐ, không phải một câu văn. Chép cả hộp ra   ║
   * ║ một bản thứ hai để đổi mỗi cái ruột là có ngay hai thanh nấc trôi khỏi   ║
   * ║ nhau — đúng thứ file này sinh ra để chặn. Nên chỗ khác nhau duy nhất     ║
   * ║ được mở thành một khe, còn khung, thanh nấc và luật đóng thì dùng chung. ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   * Nhận `close` để ruột tự đóng hộp sau khi chốt.
   */
  renderCustom?: (close: () => void) => React.ReactNode;
  /** Vắng ⇒ KHÔNG có nấc «Đính ảnh». */
  onAttach?: (file: File) => void;
  /** Bỏ tấm ảnh đang dùng. Vắng ⇒ không bày nút bỏ. */
  onDropImage?: () => void;
  onClose: () => void;
  /** Mở ngược lên trên — xem `useMenuFlip` ở `pill-ui.tsx`. */
  dropUp?: boolean;
}

export function SourcePicker(props: SourcePickerProps) {
  const { label, groups, emptyLabel, value, custom, image, onClose, dropUp } = props;
  const box = React.useRef<HTMLSpanElement>(null);
  useDismiss(box, onClose);

  const hasPreset = emptyLabel !== undefined || groups.some((group) => group.options.length > 0);
  const tabs: SourceTab[] = [
    ...(hasPreset ? (["preset"] as const) : []),
    ...(props.onAttach ? (["ref"] as const) : []),
    ...(props.onCustom || props.renderCustom ? (["custom"] as const) : []),
  ];

  /* Nấc mở sẵn = nấc ĐANG HIỆU LỰC, không phải nấc đầu tiên. Mở ra mà thấy danh
     sách chọn sẵn trong khi pill đang mang một tấm ảnh là hộp nói khác cái pill. */
  const live: SourceTab = image?.path ? "ref" : custom ? "custom" : "preset";
  const [tab, setTab] = React.useState<SourceTab>(tabs.includes(live) ? live : (tabs[0] ?? "preset"));

  return (
    /* `<span>` chứ không `<div>`, và đây KHÔNG phải chuyện gu: câu Ngữ cảnh chung
       là một `<p>`, mà một `<div>` nằm trong `<p>` bị trình duyệt ĐÓNG THẺ `<p>`
       lại trước khi chèn — tức là hộp bị văng ra khỏi câu ngay ở tầng parser HTML.
       React client-render che được, nhưng mọi đường đi qua HTML thật thì không.
       Toàn bộ ruột dưới đây theo cùng luật; `display` đến từ class, không từ thẻ. */
    <span
      ref={box}
      aria-label={`Nguồn cho ${label}`}
      /* `text-body`: hộp KHÔNG kế thừa cỡ chữ của câu (20px) — một danh sách 10
         mục ở cỡ tiêu đề thì cao hơn cả màn hình. */
      className={cn(
        "absolute left-0 z-40 flex max-h-[22.5rem] w-80 flex-col rounded-2 border border-line-subtle bg-overlay text-body shadow-2",
        dropUp ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]",
      )}
    >
      {/* THANH BA NẤC — `shrink-0` là thứ giữ nó đứng yên khi ruột cuộn. Đây
          chính là cái vá cho *"phải scroll xuống dưới mới thấy được custom"*. */}
      {tabs.length > 1 && (
        <span role="tablist" aria-label={`Cách chọn ${label}`} className="flex shrink-0 gap-1 border-b border-line-subtle p-1">
          {tabs.map((item) => (
            <TabButton key={item} active={tab === item} live={live === item} onPick={() => setTab(item)}>
              {TAB_LABEL[item]}
            </TabButton>
          ))}
        </span>
      )}

      {tab === "preset" && (
        <PresetPanel
          label={label}
          groups={groups}
          {...(emptyLabel === undefined ? {} : { emptyLabel })}
          value={value}
          /* Đang dùng ảnh hoặc chữ ⇒ KHÔNG mục nào được đánh dấu đang chọn: dấu
             tick ở đây sẽ nói rằng preset ấy đang có hiệu lực, mà nó thì không. */
          marked={!custom && !image?.path}
          onChoose={(next) => {
            props.onChoose(next);
            onClose();
          }}
        />
      )}

      {tab === "ref" && props.onAttach && (
        <RefPanel
          label={label}
          projectId={props.projectId ?? null}
          image={image}
          onAttach={(file) => {
            props.onAttach?.(file);
            onClose();
          }}
          {...(props.onDropImage
            ? {
                onDrop: () => {
                  props.onDropImage?.();
                  onClose();
                },
              }
            : {})}
        />
      )}

      {tab === "custom" && props.renderCustom?.(onClose)}

      {tab === "custom" && !props.renderCustom && props.onCustom && (
        <CustomPanel
          label={label}
          custom={custom}
          onCustom={(text) => {
            props.onCustom?.(text);
            onClose();
          }}
        />
      )}
    </span>
  );
}

/**
 * Một nấc trên thanh.
 *
 * `live` (nấc đang hiệu lực) và `active` (nấc đang xem) là HAI thứ: mở hộp ở nấc
 * ảnh rồi bấm sang nấc chọn sẵn thì người dùng vẫn phải thấy được "cái đang có
 * hiệu lực là tấm ảnh" — nếu không, họ chọn một preset và ngạc nhiên vì ảnh biến
 * mất. Nên nấc hiệu lực đeo một chấm, kể cả khi không phải nấc đang xem.
 */
function TabButton({
  active,
  live,
  onPick,
  children,
}: {
  active: boolean;
  live: boolean;
  onPick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onPick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-1 px-2 py-1.5 text-caption",
        "transition-colors duration-fast ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        active ? "bg-raised text-fg-strong" : "text-fg-muted hover:text-fg",
      )}
    >
      {children}
      {live && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Nấc ① — chọn sẵn
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Bỏ dấu để «nhan vat» tìm được «Nhân vật» — người đang gõ dở một câu hiếm khi
 * bật bộ gõ dấu chỉ để lọc một danh sách.
 *
 * Dải dấu tổ hợp viết bằng `new RegExp("[\\u0300-\\u036f]")` chứ không phải ký tự
 * thật trong mã nguồn: cùng lý do đã ghi ở `slash-items.ts` — ký tự tổ hợp trần
 * nằm giữa hai dấu ngoặc vuông là thứ mọi công cụ chuẩn hoá văn bản đều có thể
 * lặng lẽ sửa, và sửa xong thì ô tìm chỉ đơn giản là thôi khớp.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "").replace(/đ/gi, "d").toLowerCase();
}

function PresetPanel({
  label,
  groups,
  emptyLabel,
  value,
  marked,
  onChoose,
}: {
  label: string;
  groups: readonly SourceGroup[];
  emptyLabel?: string;
  value: string;
  marked: boolean;
  onChoose: (value: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const total = groups.reduce((sum, group) => sum + group.options.length, 0);
  const needle = fold(query.trim());

  const shown = React.useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          options: needle
            ? group.options.filter((option) => fold(`${option.vi} ${option.en ?? ""}`).includes(needle))
            : [...group.options],
        }))
        .filter((group) => group.options.length > 0),
    [groups, needle],
  );

  return (
    <>
      {total > SEARCH_MIN && (
        /* Ô tìm GHIM cùng thanh nấc, không cuộn theo danh sách: một ô tìm trôi
           lên khỏi tầm mắt sau ba nhịp cuộn thì đúng bằng không có nó. */
        <span className="block shrink-0 border-b border-line-subtle p-1">
          <span className="flex items-center gap-2 rounded-1 px-2 py-1">
            <Search aria-hidden className="size-4 shrink-0 text-fg-muted" />
            <input
              value={query}
              aria-label={`Tìm trong danh sách ${label}`}
              placeholder="Tìm nhanh…"
              onChange={(event) => setQuery(event.target.value)}
              className="w-full min-w-0 bg-transparent text-body text-fg-strong outline-none placeholder:text-fg-muted"
            />
          </span>
        </span>
      )}

      <span role="listbox" aria-label={`Danh sách ${label}`} className="block min-h-0 flex-1 overflow-y-auto p-1">
        {/* Mục "để trống" luôn đứng đầu và KHÔNG bị ô tìm lọc mất: nó là đường
            LÙI, mà đường lùi biến mất giữa chừng là người dùng kẹt với lựa chọn
            vừa bấm. */}
        {emptyLabel !== undefined && (
          <SourceRow selected={marked && !value} onSelect={() => onChoose("")}>
            <span className="text-fg-muted">{emptyLabel}</span>
          </SourceRow>
        )}

        {shown.map((group, at) => (
          <React.Fragment key={group.title || `nhom-${at}`}>
            {group.title && (
              <span className="block px-2 pb-0.5 pt-2 text-caption text-fg-muted">{group.title}</span>
            )}
            {group.options.map((option) => (
              <SourceRow
                key={option.value}
                selected={marked && option.value === value}
                onSelect={() => onChoose(option.value)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg-strong">{option.vi}</span>
                  {/* Hiện luôn cụm tiếng Anh SẼ vào prompt — người dùng thấy trước
                      cái máy sẽ đọc, không phải đoán. */}
                  {option.en && <span className="block truncate text-caption text-fg-muted">{option.en}</span>}
                  {option.hint && <span className="block truncate text-caption text-fg-muted">{option.hint}</span>}
                </span>
              </SourceRow>
            ))}
          </React.Fragment>
        ))}

        {shown.length === 0 && (
          <span className="block px-2 py-3 text-body text-fg-muted">Không có mục nào khớp chữ bạn gõ.</span>
        )}
      </span>
    </>
  );
}

/**
 * Một dòng chọn được.
 *
 * Mũi tên lên/xuống đi giữa các dòng: hộp này cao tới 360px và danh sách phong
 * cách dài hơn thế, nên người dùng bàn phím không được phải Tab qua từng mục để
 * ra khỏi nó.
 */
function SourceRow({
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
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const rows = [...(event.currentTarget.closest("[role='listbox']")?.querySelectorAll("[role='option']") ?? [])];
        const at = rows.indexOf(event.currentTarget);
        const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (!(next instanceof HTMLElement)) return;
        event.preventDefault();
        next.focus();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-1 px-2 py-1.5 text-left text-body",
        "hover:bg-accent/[var(--kg-tint-a)] hover:text-fg-strong",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
        selected ? "text-fg-strong" : "text-fg",
      )}
    >
      {/* Ô tick giữ chỗ CỐ ĐỊNH kể cả khi trống: để nó xuất hiện/biến mất thì cả
          cột chữ nhảy ngang 24px mỗi lần đổi lựa chọn. */}
      <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center">
        {selected && <Check className="size-4 text-accent-text" />}
      </span>
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Nấc ② — đính ảnh
   ══════════════════════════════════════════════════════════════════════════ */

const ACCEPT = "image/png,image/jpeg,image/webp";

function RefPanel({
  label,
  projectId,
  image,
  onAttach,
  onDrop,
}: {
  label: string;
  projectId: string | null;
  image: PillImage | null;
  onAttach: (file: File) => void;
  onDrop?: () => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const thumb = useRefThumb(projectId, image?.path ?? "");

  return (
    <span className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {image?.path && (
        <span className="flex items-center gap-3">
          {thumb ? (
            <img
              src={thumb}
              alt={image.refName}
              className="size-16 shrink-0 rounded-1 border border-line-subtle object-cover"
            />
          ) : (
            <span className="size-16 shrink-0 rounded-1 border border-line-subtle" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-caption text-fg-muted" title={image.refName}>
              {image.refName}
            </span>
            {onDrop && (
              <span>
                <Button variant="ghost" size="sm" onClick={onDrop}>
                  <X aria-hidden strokeWidth={1.5} />
                  Bỏ ảnh
                </Button>
              </span>
            )}
          </span>
        </span>
      )}

      {/* Kéo thả VÀ bấm, không phải chọn một: kéo thả là đường nhanh của người
          đang có ảnh mở sẵn bên cạnh, còn hộp chọn tệp là đường duy nhất của
          người dùng bàn phím. */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file) onAttach(file);
        }}
        className={cn(
          "flex flex-col items-center gap-1 rounded-2 border border-dashed px-3 py-6 text-center",
          "transition-colors duration-fast ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          over ? "border-accent bg-accent/[var(--kg-tint-a)]" : "border-line hover:border-line-strong",
        )}
      >
        <ImagePlus aria-hidden className="size-5 text-fg-muted" />
        <span className="text-body text-fg-strong">
          {image?.path ? `Đổi ảnh cho ${label}` : "Thả ảnh vào đây, hoặc bấm để chọn tệp"}
        </span>
        <span className="text-caption text-fg-muted">PNG · JPG · WebP</span>
      </button>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          /* Xoá value để chọn LẠI ĐÚNG tấm vừa chọn vẫn bắn `change`. */
          event.target.value = "";
          if (file) onAttach(file);
        }}
      />
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Nấc ③ — gõ riêng
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ô gõ mô tả riêng.
 *
 * ══ BA DÒNG, KHÔNG PHẢI MỘT Ô NHẬP TRONG PILL ═════════════════════════════
 * Bản trước cho gõ THẲNG trong pill: ô rộng 12rem, một dòng, nằm giữa một câu.
 * Nó là hai cách nhập cho cùng một việc (menu vẫn có mục «Gõ mô tả riêng…»), và
 * cái nào cũng chật — chữ đi vào đây là một câu tả phong cách, không phải một
 * từ. Nay chỉ còn MỘT cửa, và nó đủ chỗ để đọc lại thứ mình vừa viết.
 */
function CustomPanel({
  label,
  custom,
  onCustom,
}: {
  label: string;
  custom: string;
  onCustom: (text: string) => void;
}) {
  const [draft, setDraft] = React.useState(custom);

  return (
    <span className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <textarea
        autoFocus
        rows={3}
        value={draft}
        aria-label={`Mô tả riêng cho ${label}`}
        placeholder="Chữ bạn viết đi thẳng vào prompt, không dịch…"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          /* Enter CHỐT, Shift+Enter xuống dòng. Escape thì hộp tự đóng (xem
             `useDismiss`) — và đóng mà chưa chốt nghĩa là HUỶ, đúng thứ người ta
             mong khi bỏ dở một câu đang gõ. */
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          onCustom(draft.trim());
        }}
        className={cn(
          "min-h-0 w-full resize-none rounded-1 border border-line bg-raised px-2 py-1.5 text-body text-fg-strong",
          "outline-none placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
        )}
      />
      <span className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => onCustom(draft.trim())}>
          <Pencil aria-hidden strokeWidth={1.5} />
          Dùng chữ này
        </Button>
        {/* Xoá trắng rồi chốt cũng bỏ được chữ, nhưng đó là một mẹo phải biết
            trước. Một cái nút thì không. */}
        {custom !== "" && (
          <Button variant="ghost" size="sm" onClick={() => onCustom("")}>
            Bỏ chữ
          </Button>
        )}
        <span className="ml-auto text-caption text-fg-muted">Enter để chốt</span>
      </span>
    </span>
  );
}
