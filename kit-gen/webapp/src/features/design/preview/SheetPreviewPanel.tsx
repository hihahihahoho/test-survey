import * as React from "react";
import { Eye, EyeOff, Hash, LayoutGrid, Frame } from "lucide-react";
import type { Sheet } from "@/lib/types/contract";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { gridOf } from "./geometry";
import { SheetMetricsLine } from "./CellMetrics";
import { SkeletonPreview } from "./SkeletonPreview";

/**
 * webapp/src/features/design/preview/SheetPreviewPanel.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * Khối "Khung xương" hoàn chỉnh để R2-P1 nhúng vào tab **Khung xương** của vùng ②
 * (§3-S3.3), hoặc dùng độc lập ở bất cứ đâu cần xem trước bố cục.
 *
 * ĐỦ 4 TRẠNG THÁI + ca agent chưa chạy — không màn nào được treo hay trắng:
 *   · loading → skeleton đúng tỉ lệ khung, không nhảy layout khi có dữ liệu
 *   · empty   → chưa chọn sheet / sheet 0 element, kèm VIỆC TIẾP THEO
 *   · error   → do màn cha truyền `error` (preview không tự gọi API)
 *   · success → hình + số đo thật
 * Preview KHÔNG gọi mạng: nó vẽ từ bản nháp trong bộ nhớ ⇒ agent tắt vẫn xem được
 * bố cục bình thường (đúng tinh thần §2.5: chỉ-đọc chứ không mù).
 */

export interface SheetPreviewPanelProps {
  sheet: Pick<Sheet, "id" | "grid" | "orient" | "components" | "cell_hint"> | null | undefined;
  /** đang nạp bản thiết kế */
  loading?: boolean;
  /** khối lỗi do màn cha dựng (dùng `<ErrorState>` của R0) — preview chỉ chỗ để đặt. */
  error?: React.ReactNode;
  selectedIndex?: number | null;
  markedIndexes?: readonly number[];
  onSelect?: (index: number) => void;
  /** nút [Mở thư viện element] ở trạng thái rỗng — màn cha nối vào drawer. */
  onOpenLibrary?: () => void;
  className?: string;
}

export function SheetPreviewPanel({
  sheet,
  loading = false,
  error,
  selectedIndex = null,
  markedIndexes,
  onSelect,
  onOpenLibrary,
  className,
}: SheetPreviewPanelProps): React.ReactElement {
  const [showIndex, setShowIndex] = React.useState(true);
  const [showSafeFrame, setShowSafeFrame] = React.useState(true);

  if (error) return <div className={className}>{error}</div>;

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy="true">
        <span className="sr-only">Đang dựng khung xương…</span>
        <Skeleton className="aspect-[3/2] w-full rounded-2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (sheet == null) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Chưa chọn sheet nào"
        description="Chọn một sheet ở cây thiết kế bên trái để xem trước bố cục khung xương."
        className={className}
      />
    );
  }

  const grid = gridOf(sheet);
  const comps = Array.isArray(sheet.components) ? sheet.components : [];
  const filled = comps.filter((c) => String(c?.skel?.shape ?? "") !== "empty").length;

  if (comps.length === 0) {
    return (
      <EmptyState
        icon={Frame}
        title={`Sheet «${sheet.id}» chưa có element`}
        description="Thêm element từ thư viện để thấy bố cục — xem trước không tốn lượt sinh ảnh nào."
        action={
          onOpenLibrary ? (
            <Button variant="primary" onClick={onOpenLibrary}>
              Mở thư viện element
            </Button>
          ) : undefined
        }
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-fg-muted-raised">
          Bố cục dự kiến · <b className="font-medium text-fg">{filled}</b>/{grid.cols * grid.rows} ô có element
        </p>
        <div className="flex items-center gap-1">
          <PreviewToggle
            pressed={showIndex}
            onPressedChange={setShowIndex}
            label="Số thứ tự ô"
            hint="Ảnh sinh ra KHÔNG có số — số chỉ để bạn định vị khi soạn."
            OnIcon={Hash}
            OffIcon={Hash}
          />
          <PreviewToggle
            pressed={showSafeFrame}
            onPressedChange={setShowSafeFrame}
            label="Khung an toàn"
            hint="Khung nét đứt là hợp đồng toạ độ: thân element phải lấp đầy khung, trang trí được tràn ra ngoài."
            OnIcon={Eye}
            OffIcon={EyeOff}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2 border border-line-subtle bg-canvas p-2">
        <SkeletonPreview
          sheet={sheet}
          selectedIndex={selectedIndex}
          markedIndexes={markedIndexes}
          showIndex={showIndex}
          showSafeFrame={showSafeFrame}
          onSelect={onSelect}
        />
      </div>

      <SheetMetricsLine sheet={sheet} />
    </div>
  );
}

function PreviewToggle({
  pressed, onPressedChange, label, hint, OnIcon, OffIcon,
}: {
  pressed: boolean;
  onPressedChange: (v: boolean) => void;
  label: string;
  hint: string;
  OnIcon: React.ComponentType<{ className?: string }>;
  OffIcon: React.ComponentType<{ className?: string }>;
}): React.ReactElement {
  const Icon = pressed ? OnIcon : OffIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={pressed}
          onPressedChange={onPressedChange}
          aria-label={`${label}: ${pressed ? "đang hiện" : "đang ẩn"}`}
        >
          <Icon className="size-3.5" />
          <span className="text-caption">{label}</span>
        </Toggle>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}
