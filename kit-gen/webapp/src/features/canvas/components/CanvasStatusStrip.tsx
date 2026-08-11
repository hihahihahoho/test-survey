import { HardDrive, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DraftBadge } from "@/features/docs/lib";
import { saveCopy, type CanvasSaveState } from "../lib/canvas-state";

/**
 * DẢI TRẠNG THÁI nổi ở góc — «đang lưu / đã lưu trên máy» + badge «chưa lưu».
 *
 * Vì sao badge nháp phải luôn hiện (FE-PLAN Q3 / FE2-PLAN §4): bàn làm việc đang nằm
 * trong IndexedDB của trình duyệt, CHƯA nằm trong thư mục dự án. Người dùng không biết
 * điều đó sẽ đổi máy rồi mất việc. Câu chữ lấy nguyên từ `lib/draft-badge.ts` — một
 * nguồn copy duy nhất, không viết lại ở đây.
 *
 * `DraftBadgeChip` của nhánh C làm đúng việc này nhưng nằm trong `features/docs/
 * components/subfiles/**` (glob C, FE2-PLAN §1) và không được xuất ra ngoài feature;
 * import sâu xuyên nhánh sẽ khoá chân C khi họ đổi. Bản ở đây chỉ 20 dòng, dùng cùng
 * `Badge`/`Tooltip` của R0 và cùng nguồn copy ⇒ không lệch nội dung. Đề nghị gộp đã ghi
 * `teams/react/NEEDS-fe2-d.md` N2.
 *
 * A11y: `role="status"` cho tiến trình thường; ca `conflict`/`error` là `role="alert"`
 * vì người dùng phải biết ngay là thay đổi CHƯA được giữ.
 */
export interface CanvasStatusStripProps {
  save: CanvasSaveState;
  badge: DraftBadge;
}

export function CanvasStatusStrip({ save, badge }: CanvasStatusStripProps) {
  const copy = saveCopy(save);
  const warn = badge.level === "warn";
  const Icon = warn ? TriangleAlert : HardDrive;

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <span
        role={copy.urgent ? "alert" : "status"}
        className={copy.urgent ? "text-caption text-warn" : "text-caption text-fg-muted-raised"}
      >
        {copy.label}
      </span>
      {badge.level !== "none" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge tone={warn ? "warn" : "never"} tabIndex={0} className="cursor-help">
              <Icon aria-hidden strokeWidth={1.5} />
              {badge.label === "bản nháp cục bộ" ? "Chưa lưu" : badge.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs whitespace-normal">
            {badge.explain}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
