import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BACKDROPS, type Backdrop } from "../lib/backdrop";

/**
 * SegmentedControl chọn nền xem thử (§5.6). Dùng `ToggleGroup` của R0 — chính là
 * nền của SegmentedControl trong design system, KHÔNG tự vẽ lại.
 *
 * §5.6 đòi SegmentedControl "luôn kèm dòng ⓘ khi nhánh không chọn vẫn có dữ liệu"
 * (đóng C3). Ở đây mỗi lựa chọn có tooltip nói nó dùng để thấy điều gì, và có dòng
 * giải thích rằng nền CHỈ để xem — không nằm trong file PNG. Không nói câu đó thì
 * sớm muộn có người tưởng mình vừa xuất kit nền trắng.
 */
export function BackdropPicker({
  value,
  onChange,
}: {
  value: Backdrop;
  onChange: (b: Backdrop) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-fg-muted-raised">Nền xem thử</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (v) onChange(v as Backdrop);
        }}
        size="sm"
        aria-label="Nền xem thử — chỉ để nhìn, không nằm trong file PNG"
      >
        {BACKDROPS.map((b, i) => (
          <Tooltip key={b.value}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={b.value} aria-label={`Nền ${b.label} — ${b.hint}`}>
                <span
                  aria-hidden
                  className={
                    "size-3 rounded-1 border border-line " +
                    (b.value === "checker" ? "kg-checkerboard" : b.value === "dark" ? "bg-canvas" : "bg-fg-strong")
                  }
                />
                {b.label}
                <span className="sr-only"> (phím {i + 1})</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              {b.hint} · phím {i + 1}
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </div>
  );
}
