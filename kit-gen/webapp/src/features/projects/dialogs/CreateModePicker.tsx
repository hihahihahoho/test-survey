import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { FLORA } from "@/components/layout/flora";
import { MODE_COPY, type CreateMode } from "../lib/create-mode";
import { CanvasArt, WorkflowArt } from "./CreateModeArt";

/**
 * §1.2 — HAI THẺ MODE. `RadioGroup` THẬT của Radix (§5.8-A5: không `<div onclick>`),
 * nên `←/→` đổi mode, screen reader đọc "1 trong 2", và `⏎` vẫn submit form.
 *
 * Thị giác bám FLORA-REF: card bo 20px (`rounded-4`), viền hairline; thẻ đang chọn
 * dùng viền RÕ HƠN (`border-line-strong`) + chấm accent của `RadioGroupItem` — accent
 * dùng tiết chế, không tô nền xanh cả thẻ (FLORA-REF §2-4).
 *
 * A11y: mỗi thẻ có accessible name = tiêu đề, description = mô tả + dòng "hợp khi…"
 * qua `aria-describedby`; minh hoạ SVG `aria-hidden` vì không mang thêm nghĩa.
 */
export function CreateModePicker({
  value,
  onChange,
  disabled,
  labelledBy,
}: {
  value: CreateMode;
  onChange: (v: CreateMode) => void;
  disabled?: boolean;
  /** id của tiêu đề nhóm — radiogroup PHẢI có tên, nếu không SR chỉ đọc "nhóm". */
  labelledBy?: string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as CreateMode)}
      disabled={disabled}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {MODE_COPY.map((m) => {
        const on = value === m.id;
        const Art = m.id === "canvas" ? CanvasArt : WorkflowArt;
        return (
          <Label
            key={m.id}
            htmlFor={`mode-${m.id}`}
            className={cn(
              "group flex cursor-pointer flex-col gap-3 border p-4 transition-colors duration-fast",
              FLORA.r20,
              on ? "border-line-strong bg-raised" : "border-line-subtle bg-surface hover:bg-raised",
              /* KHÔNG dùng `opacity-*` để làm mờ lúc khoá: cổng contrast đo cặp màu
                 SAU khi trộn và `opacity-60` kéo chữ xuống 3.47:1 (<4.5). Trạng thái
                 khoá được nói bằng con trỏ + `disabled` của chính radio, chữ giữ nguyên
                 độ đọc — người dùng vẫn phải ĐỌC ĐƯỢC mô tả mode khi form đang bận. */
              disabled && "cursor-not-allowed border-line-subtle bg-surface",
            )}
          >
            <span className="flex items-center gap-2.5">
              <RadioGroupItem
                id={`mode-${m.id}`}
                value={m.id}
                aria-describedby={`mode-${m.id}-desc`}
                className="shrink-0"
              />
              <span className="flex min-w-0 flex-1 items-center gap-2 text-subtitle text-fg-strong">
                {m.title}
              </span>
              {m.tag && <Badge tone="outline">{m.tag}</Badge>}
            </span>

            {/* Minh hoạ: nhãn hình nằm TRONG khối bo, nền canvas để tách khỏi card. */}
            <span
              className={cn(
                "flex h-[72px] items-center justify-center overflow-hidden border p-2",
                FLORA.r12,
                "border-line-subtle bg-canvas",
              )}
            >
              <Art />
            </span>

            <span id={`mode-${m.id}-desc`} className="flex flex-col gap-1">
              <span className="text-caption font-normal text-fg">{m.body}</span>
              <span className="text-caption font-normal text-fg-muted-raised">↳ {m.fit}</span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}
