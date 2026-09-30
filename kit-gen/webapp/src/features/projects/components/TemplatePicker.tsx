import * as React from "react";
import { Check, ChevronsUpDown, FilePlus2, LayoutTemplate, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Template } from "@/lib/types";
import { useTemplateCover } from "../lib/useTemplateCover";
import { matchesTemplate, templateCaption } from "../lib/templates";

/**
 * «BẮT ĐẦU TỪ» — chọn nguồn cho dự án mới trong hộp Tạo dự án: «Dự án trống» hoặc
 * một template người dùng đã lưu (nút «Lưu làm template» ở màn soạn / menu thẻ).
 *
 * ╔══ VÌ SAO LÀ MỘT Ô CHỌN MỘT DÒNG, KHÔNG CÒN LÀ DANH SÁCH BÀY SẴN ══════════╗
 * ║ Chủ sản phẩm (30/09/2026, kèm ảnh chụp hộp Tạo dự án): lưu nhiều template  ║
 * ║ là «Bắt đầu từ» thành một cột dòng to không đáy, đẩy nút «Tiếp tục» ra     ║
 * ║ khỏi màn. Nay ô đóng chỉ nói LỰA CHỌN ĐANG DÙNG (bìa + tên + dòng phụ), cao ║
 * ║ đúng một dòng dù có ba hay ba chục template; bấm vào mới bung danh sách —  ║
 * ║ có ô tìm, cuộn bên trong, tối đa chừng sáu dòng.                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * CUỘN RIÊNG Ở ĐÂY LÀ ĐƯỢC, dù `CoverPicker` cấm: luật ấy cấm hai tầng cuộn LỒNG
 * nhau trong `DialogBody`. Danh sách này nằm trong một popover dựng qua portal, ra
 * ngoài thân dialog — nó là ổ cuộn duy nhất dưới con trỏ.
 *
 * POPOVER `modal` — không phải cho đẹp: dialog Tạo dự án khoá cuộn mọi thứ nằm ngoài
 * thân nó (react-remove-scroll), mà popover qua portal thì nằm ngoài ⇒ lăn chuột trên
 * danh sách không nhúc nhích. Popover modal dựng khoá cuộn CỦA NÓ lên đầu ngăn xếp, và
 * chỉ khoá trên cùng có hiệu lực. Esc đóng popover trước (lớp trên cùng), dialog vẫn mở.
 *
 * KHÔNG CÒN NÚT XOÁ Ở ĐÂY. Chọn và xoá đứng cạnh nhau trong cùng một danh sách là một
 * cú trượt tay ném đi template dựng cả buổi; xoá, đổi tên, mô tả dọn sang màn «Template
 * dự án» (`/templates`), mở từ dòng «Quản lý template…» ở chân popover.
 *
 * A11y: nút mở là `<button>` thật, tên = «Bắt đầu từ» + tên lựa chọn đang dùng
 * (`aria-labelledby` ghép nhãn nhìn thấy với ô giá trị — nói đúng chữ người ta đọc),
 * dòng phụ nối bằng `aria-describedby`; Radix gắn `aria-expanded`/`aria-controls`.
 * Trong popover là mẫu combobox của cmdk: ô tìm giữ focus, mũi tên đi, Enter chọn và
 * đóng. Lựa chọn đang dùng mang `aria-checked` (cmdk dùng `aria-selected` cho dòng
 * đang TRỎ, không phải dòng đã CHỌN) kèm dấu ✓.
 */

/** Giá trị cmdk của hai dòng không phải template. Id template khớp `^[a-z0-9]…` nên không đụng. */
const BLANK = "__blank__";
const MANAGE = "__manage__";
const BLANK_TITLE = "Dự án trống";
const BLANK_CAPTION = "Bắt đầu từ trang trắng";
// kg-allow-jargon: «template» là TÊN TÍNH NĂNG do chủ sản phẩm đặt («save template»), không phải chữ kỹ thuật lọt ra.
const SEARCH_PLACEHOLDER = "Tìm template…";
const SEARCH_LABEL = "Tìm template"; // kg-allow-jargon: tên tính năng, như trên.
const MANAGE_LABEL = "Quản lý template…"; // kg-allow-jargon: tên tính năng, như trên.
const savedHeading = (n: number) => `Template đã lưu · ${n}`; // kg-allow-jargon: tên tính năng, như trên.
const noMatch = (q: string) => `Không có template nào tên «${q}».`; // kg-allow-jargon: tên tính năng, như trên.

export function TemplatePicker({
  templates,
  loading,
  failed,
  value,
  onChange,
  onManage,
  disabled,
}: {
  templates: readonly Template[];
  loading: boolean;
  /** Tải danh sách hỏng (KHÔNG phải agent đời cũ — ca đó đã là danh sách rỗng). */
  failed: boolean;
  /** Id template đang chọn; `null` = «Dự án trống». */
  value: string | null;
  onChange: (id: string | null) => void;
  /** «Quản lý template…» ở chân popover. Không truyền ⇒ không có dòng ấy (vd đang ở chính màn quản lý). */
  onManage?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const captionId = `${uid}-caption`;

  const chosen = value ? (templates.find((t) => t.id === value) ?? null) : null;
  /* Chưa có template nào thì ô chọn chỉ có đúng MỘT lựa chọn — một ô bấm vào chỉ để
     thấy «Dự án trống» là một cú bấm phí. Khi đó chỉ còn câu chỉ đường bên dưới. */
  const hasChoices = templates.length > 0;
  const empty = !loading && !failed && !hasChoices;

  React.useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label text-fg-strong">Bắt đầu từ</span>
      {hasChoices && (
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-labelledby={`${labelId} ${valueId}`}
              aria-describedby={captionId}
              className={cn(
                /* Cùng chất liệu với ô «Tên dự án» ngay trên (`Input`): viền `line`, nền
                   `raised`, bo `rounded-2`, focus viền accent + ring. Cao hơn ô ấy vì phải
                   chứa HAI dòng (tên + dòng phụ) — cắt dòng phụ đi là mất đúng thứ phân
                   biệt hai template trùng tên. */
                "group flex w-full items-center gap-3 rounded-2 border border-line bg-raised py-1.5 pl-1.5 pr-3 text-left",
                "transition-colors duration-fast hover:border-line-strong data-[state=open]:border-accent",
                "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                /* Khoá = màu TRUNG TÍNH ĐẶC, không `opacity-*`: chữ nhoè theo nền là rớt
                   tương phản (scripts/check-contrast.mjs ③, cùng luật với `button.tsx`). */
                "disabled:cursor-not-allowed disabled:border-line-subtle disabled:hover:border-line-subtle",
              )}
            >
              {chosen ? <TemplateThumb template={chosen} size="sm" /> : <BlankThumb size="sm" />}
              <span className="min-w-0 flex-1">
                <span id={valueId} className="block truncate text-label text-fg-strong group-disabled:text-fg-muted">
                  {chosen ? chosen.name : BLANK_TITLE}
                </span>
                <span id={captionId} className="block truncate text-caption text-fg-muted">
                  {chosen ? templateCaption(chosen) : BLANK_CAPTION}
                </span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            /* LUÔN NẰM DƯỚI Ô, không lật (thử trên màn thật 30/09/2026): hộp Tạo dự án ở giữa
               màn nên chỗ trống dưới ô thường không đủ 6 dòng ⇒ Radix lật danh sách lên TRÊN,
               che ô tên — rồi gõ tìm vài chữ, danh sách ngắn lại vừa chỗ dưới, nó NHẢY xuống
               ngay dưới ngón tay. Thay vì lật: danh sách co theo chỗ trống bên dưới (khối
               cuộn ở `SourceMenu`), như một ô chọn thường nối dài xuống. */
            side="bottom"
            avoidCollisions={false}
            aria-labelledby={labelId}
            /* Rộng đúng bằng ô mở nó: danh sách là phần nối dài của ô, không phải một
               menu nổi rộng tuỳ ý che mất ô tên phía trên. */
            className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
          >
            <SourceMenu
              templates={templates}
              value={chosen ? chosen.id : null}
              onPick={(id) => {
                setOpen(false);
                onChange(id);
              }}
              onManage={onManage ? () => { setOpen(false); onManage(); } : undefined}
            />
          </PopoverContent>
        </Popover>
      )}
      {loading && <p className="text-caption text-fg-muted">Đang tải template…</p>}
      {failed && <p className="text-caption text-fg-muted">Chưa tải được danh sách template — vẫn tạo được dự án trống.</p>}
      {empty && (
        <p className="text-caption text-fg-muted">
          Mở một dự án và bấm «Lưu làm template» để dùng lại nó ở đây.
        </p>
      )}
    </div>
  );
}

/**
 * Ruột popover. Tách riêng để ô tìm SINH RA cùng popover: đóng rồi mở lại là ô tìm
 * trống và dòng được trỏ là lựa chọn đang dùng — không kẹt lại chữ tìm của lần trước
 * với một danh sách đã lọc mất lựa chọn hiện tại.
 */
function SourceMenu({
  templates,
  value,
  onPick,
  onManage,
}: {
  templates: readonly Template[];
  value: string | null;
  onPick: (id: string | null) => void;
  onManage?: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim();
  const shown = q ? templates.filter((t) => matchesTemplate(t, q)) : templates;
  /* Đang tìm thì «Dự án trống» chỉ ở lại nếu chính nó khớp: gõ «shop» rồi Enter phải ra
     template tên Shop, không phải dòng trống đứng đầu danh sách. */
  const blankShown = !q || matchesTemplate({ name: BLANK_TITLE }, q);

  return (
    <Command
      /* Tự lọc (theo TÊN, bỏ dấu — `matchesTemplate`): bộ lọc mờ mặc định của cmdk chấm
         điểm cả id, nên «a1» khớp mọi template có đuôi hex chứa a1. */
      shouldFilter={false}
      loop
      /* Mở ra là trỏ sẵn vào lựa chọn đang dùng (và cuộn tới nó), không phải dòng đầu. */
      defaultValue={value ?? BLANK}
      label={SEARCH_LABEL}
      className={cn(
        "rounded-none bg-transparent",
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2",
        "[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:text-fg-muted-raised",
      )}
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder={SEARCH_PLACEHOLDER} />
      {/* Bỏ trần cao + cuộn của `CommandList`: ổ cuộn là khối bên trong, để dòng «Quản
          lý template…» đứng yên ở chân thay vì trôi mất dưới đáy danh sách dài. */}
      <CommandList label="Bắt đầu từ" className="max-h-none overflow-visible p-0">
        <div
          data-template-scroll
          /* ~6 dòng; chỗ trống DƯỚI ô ít hơn thì co lại theo đó (trừ ô tìm + chân), nhưng
             không dưới ~2,5 dòng — màn quá thấp thì thà tràn mép dưới một chút còn hơn một
             khe cuộn chỉ lọt nửa dòng. */
          className="max-h-[max(9rem,min(20rem,calc(var(--radix-popover-content-available-height)_-_7rem)))] overflow-y-auto overscroll-contain p-1"
        >
          {blankShown && (
            <SourceItem value={BLANK} checked={value === null} onSelect={() => onPick(null)}
              thumb={<BlankThumb size="md" />} title={BLANK_TITLE} caption={BLANK_CAPTION} />
          )}
          {shown.length > 0 && (
            <CommandGroup heading={savedHeading(templates.length)} className="p-0">
              {shown.map((t) => (
                <SourceItem key={t.id} value={t.id} checked={value === t.id} onSelect={() => onPick(t.id)}
                  thumb={<TemplateThumb template={t} size="md" />} title={t.name} caption={templateCaption(t)} />
              ))}
            </CommandGroup>
          )}
          {!blankShown && shown.length === 0 && (
            <p className="px-2 py-6 text-center text-body text-fg">{noMatch(q)}</p>
          )}
        </div>
        {onManage && (
          <div className="border-t border-line-subtle p-1">
            <CommandItem value={MANAGE} onSelect={onManage} className="text-fg">
              <Settings2 aria-hidden />
              {MANAGE_LABEL}
            </CommandItem>
          </div>
        )}
      </CommandList>
    </Command>
  );
}

function SourceItem({
  value, checked, onSelect, thumb, title, caption,
}: {
  value: string;
  checked: boolean;
  onSelect: () => void;
  thumb: React.ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} aria-checked={checked} className="gap-3 py-1.5">
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label text-fg-strong">{title}</span>
        <span className="block truncate text-caption text-fg-muted">{caption}</span>
      </span>
      {/* Chỗ của dấu ✓ luôn được giữ: dòng chọn và dòng không chọn cùng một bề ngang chữ. */}
      {checked ? <Check aria-hidden className="text-accent-text" /> : <span aria-hidden className="size-4 shrink-0" />}
    </CommandItem>
  );
}

const THUMB_SIZE = { sm: "size-8", md: "size-10" } as const;

function ThumbBox({ size, children }: { size: keyof typeof THUMB_SIZE; children: React.ReactNode }) {
  return (
    <span className={cn(
      "flex shrink-0 items-center justify-center overflow-hidden rounded-1 border border-line-subtle bg-raised",
      THUMB_SIZE[size],
    )}>
      {children}
    </span>
  );
}

function BlankThumb({ size }: { size: keyof typeof THUMB_SIZE }) {
  return <ThumbBox size={size}><FilePlus2 aria-hidden className="size-4 text-fg-muted" /></ThumbBox>;
}

/** Ảnh bìa nhỏ của template (`?w=128` — đủ nét cho ô 40px ở màn retina). Không bìa / tải hỏng ⇒ ô giữ chỗ. */
function TemplateThumb({ template, size }: { template: Template; size: keyof typeof THUMB_SIZE }) {
  const url = useTemplateCover(template, 128);
  return (
    <ThumbBox size={size}>
      {url
        ? <img src={url} alt="" className="size-full object-cover" />
        : <LayoutTemplate aria-hidden className="size-4 text-fg-muted" />}
    </ThumbBox>
  );
}
