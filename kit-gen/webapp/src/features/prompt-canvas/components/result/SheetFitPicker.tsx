import * as React from "react";
import { Minus, Plus, Scaling } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FIGMA_FIT,
  FIGMA_FIT_MODES,
  FIT_SCALE_MAX,
  FIT_SCALE_MIN,
  FIT_SCALE_STEP,
  fitScalePercentOf,
  type FigmaFit,
  type FigmaFitMode,
} from "@/features/prompt-lab/lib/composer-model";

/**
 * BỘ ĐIỀU KHIỂN «KHỚP KHUNG» — đứng cạnh nút copy sang Figma.
 *
 * ╔══ VÌ SAO NÓ PHẢI CÓ MẶT, DÙ ĐÃ CÓ MỘT LUẬT TỰ ĐỘNG ══════════════════════╗
 * ║ Chủ sản phẩm gen một tấm bằng prompt tỉ lệ mới, dán ra Figma, rồi hỏi:     ║
 * ║ *"giờ làm sao để chỉnh cái khung bắn ra và cỡ của ảnh bên trong, cho vào   ║
 * ║ tâm?"*. Câu hỏi ấy trước lượt này KHÔNG có chỗ nào trả lời được: phép khớp ║
 * ║ tự chọn một trong hai hộp làm lõi bằng một luật dung sai, và người dùng    ║
 * ║ không nhìn thấy luật ấy, cũng không đổi được nó.                           ║
 * ║ Ba nấc dưới đây KHÔNG phải ba thuật toán mới — chúng là hai nhánh vốn đã   ║
 * ║ chạy, cộng chính cái luật cũ; thứ mới duy nhất là quyền chọn. Xem           ║
 * ║ `FigmaFitMode` (`composer-model.ts`) và `contractFramed` (`sheet-files`).  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO LÀ MỘT POPOVER, KHÔNG PHẢI MỘT HÀNG PILL BÀY SẴN ═══════════════╗
 * ║ Ba nấc này chỉ đọc được khi có câu giải thích đi kèm — không ai đoán ra    ║
 * ║ «Thân lấp khung» khác «Cả món vừa khung» ở chỗ nào từ bốn chữ. Bày cả ba   ║
 * ║ câu ra hàng nút dưới ảnh thì hàng ấy dài hơn cả cụm nút chính, và nấc này  ║
 * ║ là thứ người ta đặt MỘT LẦN rồi quên. Nên nút đóng lại chỉ nói NẤC ĐANG    ║
 * ║ DÙNG (bấm vào mới thấy lựa chọn) — trạng thái vẫn hiện thường trực, chỉ    ║
 * ║ phần chọn là gấp lại.                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/** Tên nấc — chữ này đi cả vào nút, vào popover, và vào câu báo lúc copy. */
export const FIT_MODE_LABEL: Record<FigmaFitMode, string> = {
  whole: "Cả món vừa khung",
  body: "Thân lấp khung",
  auto: "Tự động",
};

/**
 * HỆ QUẢ của mỗi nấc, nói bằng thứ người dùng nhìn thấy trên bàn Figma.
 *
 * Mỗi câu phải chứa CÁI GIÁ của nấc ấy, không chỉ cái lợi: nấc nào cũng đánh đổi
 * một thứ, và giấu vế đắt đi là để người dùng tự phát hiện lúc đã dán vào file thật.
 */
export const FIT_MODE_HINT: Record<FigmaFitMode, string> = {
  whole:
    "Toàn bộ phần đục của món nằm gọn trong khung, không ô nào đè sang ô bên cạnh. Đổi lại, thân món có thể không lấp kín khung.",
  body:
    "Lấp khung theo thân máy đoán; không đoán được thì cả món. Bóng đổ và trang trí tràn ra ngoài khung, nên ô có thể đè sang ô bên cạnh.",
  auto:
    "Từng ô một: máy vẽ sát cỡ đã đặt thì thân lấp khung, vẽ lố quá nhiều thì ôm cả món vào khung.",
};

/** Câu một dòng cho nút và cho câu báo lúc copy: «Cả món vừa khung · 100%». */
export function fitSummary(fit: FigmaFit): string {
  return `${FIT_MODE_LABEL[fit.mode]} · ${fit.scale}%`;
}

export interface SheetFitPickerProps {
  fit: FigmaFit;
  onChange: (next: FigmaFit) => void;
  className?: string;
}

export function SheetFitPicker({ fit, onChange, className }: SheetFitPickerProps) {
  const [open, setOpen] = React.useState(false);
  const step = (delta: number) =>
    onChange({ ...fit, scale: fitScalePercentOf(fit.scale + delta) });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          title="Chọn cách đặt ảnh vào khung khi copy sang Figma"
        >
          <Scaling aria-hidden strokeWidth={1.5} />
          Khớp khung: {fitSummary(fit)}
        </Button>
      </PopoverTrigger>
      {/* Rộng hơn mặc định vì mỗi nấc kéo theo một câu hai dòng — bóp lại thì câu
          giải thích vỡ thành năm dòng và cả popover thành một bức tường chữ. */}
      <PopoverContent align="start" className="w-80">
        <div role="radiogroup" aria-label="Cách khớp khung" className="flex flex-col gap-1">
          {FIGMA_FIT_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={fit.mode === m}
              onClick={() => onChange({ ...fit, mode: m })}
              className={cn(
                "rounded-2 px-2 py-1.5 text-left transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                fit.mode === m ? "bg-raised" : "hover:bg-raised",
              )}
            >
              <span className={cn("block text-body", fit.mode === m ? "text-fg-strong" : "text-fg")}>
                {FIT_MODE_LABEL[m]}
              </span>
              {/* Câu gợi ý nằm DƯỚI TỪNG NẤC chứ không gom một chỗ: đọc một câu tả
                  nấc mình đang trỏ tay vào thì mới quyết được, còn ba câu xếp rời
                  bên dưới thì phải tự ghép lại với đúng nút. */}
              <span className="mt-0.5 block text-caption text-fg-muted">{FIT_MODE_HINT[m]}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-line-subtle pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body text-fg">Tỉ lệ thêm</span>
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-FIT_SCALE_STEP)}
                disabled={fit.scale <= FIT_SCALE_MIN}
                aria-label="Thu ảnh nhỏ lại"
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full border border-line-subtle text-fg-muted",
                  "hover:text-fg-strong disabled:bg-raised disabled:hover:text-fg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              >
                <Minus aria-hidden className="size-3" />
              </button>
              {/* `aria-live` để người đọc màn hình nghe con số mới ngay sau cú bấm —
                  nếu không, hai nút +/− chỉ là hai cú bấm không có hồi âm. */}
              <span aria-live="polite" className="min-w-10 text-center text-body text-fg-strong">
                {fit.scale}%
              </span>
              <button
                type="button"
                onClick={() => step(FIT_SCALE_STEP)}
                disabled={fit.scale >= FIT_SCALE_MAX}
                aria-label="Phóng ảnh to lên"
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full border border-line-subtle text-fg-muted",
                  "hover:text-fg-strong disabled:bg-raised disabled:hover:text-fg-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              >
                <Plus aria-hidden className="size-3" />
              </button>
            </span>
          </div>
          <p className="mt-1 text-caption text-fg-muted">
            Khung vẫn đúng cỡ bạn đã đặt — chỉ ảnh bên trong to hay nhỏ đi. 100% là đúng như máy tính ra.
          </p>
          {fit.scale !== DEFAULT_FIGMA_FIT.scale && (
            <button
              type="button"
              onClick={() => onChange({ ...fit, scale: DEFAULT_FIGMA_FIT.scale })}
              className={cn(
                "mt-2 text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              )}
            >
              Về 100%
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
