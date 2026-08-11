import * as React from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

/**
 * "Đang chọn 3 → thêm vào: (•) sheet main (còn 1 ô) ( ) sheet mới «main3»"
 * — đúng wireframe cuối §3-S3.
 *
 * KHÔNG GIẤU HỆ QUẢ (nguyên tắc "thấy trước hậu quả" của §3-S3): thiếu ô trống thì
 * nói thẳng lưới sẽ được nới ngay tại chỗ chọn, chứ không để user bấm xong mới ngã ngửa.
 */

export interface AddDestinationProps {
  count: number;
  /** Sheet đích do màn S3 truyền xuống; `null` = project chưa có sheet nào. */
  targetSheetLabel: string | null;
  freeSlots: number;
  toNewSheet: boolean;
  onToNewSheetChange: (v: boolean) => void;
  suggestedNewId?: string | undefined;
}

export function AddDestination({
  count, targetSheetLabel, freeSlots, toNewSheet, onToNewSheetChange, suggestedNewId,
}: AddDestinationProps): React.ReactElement {
  const id = React.useId();
  const hasTarget = targetSheetLabel !== null;
  const overflow = Math.max(0, count - freeSlots);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-fg-strong">
        Đang chọn <b>{count}</b> element → thêm vào:
      </p>

      <RadioGroup
        value={toNewSheet ? "new" : "sheet"}
        onValueChange={(v) => onToNewSheetChange(v === "new")}
        className="flex flex-col gap-2"
      >
        {hasTarget && (
          <div className="flex items-center gap-2">
            <RadioGroupItem value="sheet" id={`${id}-sheet`} />
            <Label htmlFor={`${id}-sheet`} className="font-normal">
              Sheet «{targetSheetLabel}» <span className="text-fg-muted-raised">— còn {freeSlots} ô trống</span>
            </Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <RadioGroupItem value="new" id={`${id}-new`} />
          <Label htmlFor={`${id}-new`} className="font-normal">
            Sheet mới
            {suggestedNewId !== undefined && <span className="text-fg-muted-raised"> «{suggestedNewId}»</span>}
          </Label>
        </div>
      </RadioGroup>

      {!toNewSheet && hasTarget && (
        <Consequence
          tone={overflow > 0 ? "warn" : "info"}
          text={
            overflow > 0
              ? `Chỉ còn ${freeSlots} ô trống cho ${count} element — lưới sẽ được nới thêm hàng cho đủ chỗ. Không element nào bị ghi đè.`
              : `Vừa đủ: ${count} element điền vào ${count} trong ${freeSlots} ô trống, lưới giữ nguyên.`
          }
        />
      )}
      {toNewSheet && (
        <Consequence
          tone="info"
          text={`Tạo một sheet mới chứa ${count} element. Mỗi sheet là một lượt sinh ảnh riêng cho từng phong cách.`}
        />
      )}
      {!hasTarget && (
        <Consequence tone="info" text="Project chưa có sheet nào, nên element sẽ vào một sheet mới." />
      )}
    </div>
  );
}

function Consequence({ tone, text }: { tone: "info" | "warn"; text: string }): React.ReactElement {
  return (
    <p
      className={cn(
        "inline-flex items-start gap-1.5 rounded-1 px-2 py-1.5 text-caption",
        tone === "warn" ? "kg-tint-warn text-on-tint-warn" : "bg-raised text-fg"
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{text}</span>
    </p>
  );
}
