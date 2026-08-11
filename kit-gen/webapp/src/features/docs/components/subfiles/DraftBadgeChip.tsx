import { HardDrive, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DraftBadge } from "../../lib";

/**
 * Huy hiệu «bản nháp cục bộ» — VẼ dữ liệu mà `lib/draft-badge.ts` (provider FE-1) trả về.
 * Không tự nghĩ câu chữ ở đây: một nguồn copy duy nhất, đổi ở lib là đổi mọi nơi.
 *
 * Vì sao bắt buộc hiện (FE-PLAN Q3): file con đang nằm trong IndexedDB của trình duyệt,
 * chưa nằm trong thư mục dự án. Người dùng không biết điều đó sẽ đổi máy rồi mất việc.
 * Badge luôn có CHỮ + icon (luật A3), tooltip nói câu đầy đủ.
 */
export function DraftBadgeChip({ badge }: { badge: DraftBadge }) {
  if (badge.level === "none") return null;
  const warn = badge.level === "warn";
  const Icon = warn ? TriangleAlert : HardDrive;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge tone={warn ? "warn" : "never"} tabIndex={0} className="cursor-help">
          <Icon aria-hidden strokeWidth={1.5} />
          {badge.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs whitespace-normal">
        {badge.explain}
      </TooltipContent>
    </Tooltip>
  );
}
