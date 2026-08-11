import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, InlineBanner, CopyableCode } from "@/components/common";
import { CARD } from "@/components/layout/flora";
import { cn } from "@/lib/utils";

/**
 * Ba khối trạng thái của bàn làm việc. Tách khỏi `CanvasShell` để mỗi file dưới 400 dòng
 * và để story dựng từng ca mà không phải giả cả một query.
 */

/**
 * LOADING — skeleton ĐÚNG CHỖ, không phải spinner giữa màn.
 * §2.5 nói rõ: khung nhìn hiện skeleton node đúng vị trí đã lưu, "không nhảy layout".
 * FE-2 chưa có node nên chỉ dựng được khung của bàn (dải công cụ + một khối giữa) —
 * đây là giới hạn thật, và nó được nói ra ở đây thay vì giả vờ dựng node ma.
 */
export function CanvasLoading({ label = "Đang mở bàn làm việc…" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-8">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-40 w-full max-w-lg rounded-5" />
      <Skeleton className="h-10 w-64 rounded-full" />
    </div>
  );
}

/**
 * TIMEOUT — quá 20s (`DOCS_LOADING_TIMEOUT_MS`). Skeleton chạy vĩnh viễn là cách tệ nhất
 * để báo hỏng: người dùng ngồi chờ một thứ không bao giờ tới.
 */
export function CanvasTimeout({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <ErrorState
        title="Bàn làm việc mở lâu bất thường."
        description="Bạn thử mở lại nhé. Ảnh và bản thiết kế của dự án không bị ảnh hưởng."
        actions={
          <Button variant="secondary" onClick={onRetry}>
            <RotateCw aria-hidden strokeWidth={1.5} />
            Thử lại
          </Button>
        }
      />
    </div>
  );
}

/**
 * ERROR — câu đời thường + hành động; chuỗi kỹ thuật CHỈ nằm trong panel
 * «Chi tiết cho lập trình viên» của `ErrorState` (ràng buộc cứng của brief).
 *
 * ══ ĐỔI Ở C1 ══ «quy trình chuẩn» là **từ cấm** của UX-V3 §5.4 (tên nội bộ, người dùng
 * chưa từng thấy chữ đó ở đâu). Bảng §6 hàng C1 chốt đường lùi là **«Mở dạng form»**.
 * Chỉ đổi CHỮ; prop `onFallback` và mọi dây nối giữ nguyên.
 */
export function CanvasError({
  title, detail, onRetry, onFallback,
}: {
  title: string;
  detail?: string;
  onRetry: () => void;
  onFallback?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <ErrorState
        title={title}
        description="Bạn mở lại bàn làm việc, hoặc chuyển sang dạng form để tiếp tục làm."
        detail={detail}
        actions={
          <>
            <Button variant="secondary" onClick={onRetry}>
              <RotateCw aria-hidden strokeWidth={1.5} />
              Thử lại
            </Button>
            {onFallback && (
              <Button variant="ghost" onClick={onFallback}>
                Mở dạng form
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}

/**
 * AGENT CHƯA CHẠY — §2.5 hàng cuối (UX-V3 §6 hàng C1: «bàn vẫn kéo/zoom/ghi chú được»):
 * banner nói rõ **vẫn xem và sắp xếp được**, kèm
 * `CopyableCode` lệnh chạy. KHÔNG khoá khung nhìn: dữ liệu bàn làm việc nằm trên máy,
 * khoá màn ở đây là nói dối về nguyên nhân (đúng bệnh mà `AgentBanner` đã bị QA bắt).
 *
 * ══ ĐỔI Ở C1 ══ bỏ hai từ cấm §5.4 khỏi câu mô tả: «sinh ảnh hay đông cứng khung thành
 * **sheet**» → «nhờ máy vẽ hay đóng gói thành **bộ kit**». Test soi từ cấm nay chạy trên
 * cả 6 ca của màn, không riêng ca empty — đây chính là ca nó bắt được.
 *
 * `command` do màn truyền xuống: lệnh thật thuộc `components/layout/agent-commands.ts`
 * (ngoài glob D) và chỉ khung app mới biết đang chạy ở entry nào.
 */
export function CanvasAgentOffline({ command }: { command?: string }) {
  return (
    <InlineBanner
      tone="warning"
      title="Công cụ trên máy chưa chạy"
      description={
        <div className="flex flex-col gap-2">
          <span>
            Bạn vẫn xem và sắp xếp bàn làm việc được — nó nằm trên máy bạn. Những việc cần công cụ,
            như nhờ máy vẽ hay đóng gói thành bộ kit, sẽ mở lại khi kết nối được.
          </span>
          {command && <CopyableCode label="Lệnh chạy công cụ local" value={command} />}
        </div>
      }
      className={cn(CARD, "rounded-4")}
    />
  );
}
