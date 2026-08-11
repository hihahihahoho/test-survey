import { AlertTriangle, Copy, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { diffSentence, summarize } from "./diff";
import { DiffTable, SummaryColumns } from "./DiffTable";
import type { ConflictInfo } from "./types";

export type ConflictChoice = "overwrite" | "reload" | "fork";

/**
 * MODAL XUNG ĐỘT 409 `CONTRACT_CONFLICT` (§3-S3 bảng trạng thái, đóng R7).
 *
 * Spec đòi ĐÚNG BA lối ra, và tôi cố ý KHÔNG thêm lối thứ tư nào ngoài "đóng
 * modal" (bản của user vẫn còn nguyên, họ có thể suy nghĩ thêm):
 *   [Ghi đè bằng bản của tôi] · [Tải lại bản trên đĩa (mất thay đổi)] · [Lưu thành bản sao]
 *
 * BA CHI TIẾT DỄ LÀM SAI, ĐÃ LÀM ĐÚNG:
 *
 * 1. KHÔNG tự chọn hộ, KHÔNG có nút mặc định của Enter là nút phá huỷ. Nút
 *    [Ghi đè] là `danger` và đứng riêng; nút an toàn nhận focus đầu tiên.
 *
 * 2. "Tải lại" là lối ra DUY NHẤT thực sự mất dữ liệu ⇒ nhãn nói thẳng
 *    "(mất thay đổi của bạn)". Còn "Ghi đè" nghe đáng sợ hơn nhưng thật ra KHÔNG
 *    mất gì: agent giữ 50 bản trong `.history/contract/` (#24) — dòng chú thích
 *    dưới nút nói rõ điều đó để user không sợ nhầm chỗ.
 *
 * 3. So sánh là SO SÁNH THẬT (nạp bản trên đĩa rồi diff), không phải chỉ in lại
 *    `diffSummary` của agent. Con số "+2 −1" không giúp user quyết định; biết
 *    "sheet «pose-lan» sẽ mất" thì mới quyết được.
 */
export function ConflictDialog({
  conflict,
  onResolve,
  onDismiss,
  pending = false,
}: {
  conflict: ConflictInfo | null;
  onResolve: (choice: ConflictChoice) => void;
  onDismiss: () => void;
  pending?: boolean;
}) {
  if (!conflict) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onDismiss()}>
      <DialogContent size="lg" onEscapeKeyDown={(e) => pending && e.preventDefault()}
        onPointerDownOutside={(e) => pending && e.preventDefault()}
        onInteractOutside={(e) => pending && e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden />
            <DialogTitle>Bản thiết kế đã đổi ở nơi khác</DialogTitle>
          </div>
          <DialogDescription>
            Một tab khác (hoặc người khác) đã lưu sau khi bạn mở màn này. Chọn cách xử lý — không lựa
            chọn nào làm mất bản của bạn trên máy này trừ khi bạn tự chọn tải lại.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <SummaryColumns
            leftTitle="Bản của bạn (chưa lưu)"
            leftNote={`Dựa trên phiên bản ${conflict.myBaseVersion} · đang nằm trong tab này và trong bản nháp trên máy.`}
            leftSummary={summarize(conflict.mine)}
            rightTitle="Bản trên đĩa"
            rightNote={`Phiên bản ${conflict.serverVersion} · mới hơn bản bạn đang cầm.`}
            rightSummary={summarize(conflict.theirs)}
          />

          <section className="flex flex-col gap-2">
            <h3 className="text-label text-fg-strong">Khác biệt nếu bạn giữ bản của mình</h3>
            {conflict.theirsLoading ? (
              <div className="flex flex-col gap-2" aria-busy>
                <span className="sr-only">Đang đọc bản trên đĩa để so sánh…</span>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : conflict.diff ? (
              <>
                <p className="text-caption text-fg">{diffSentence(conflict.diff)}</p>
                <DiffTable diff={conflict.diff} />
              </>
            ) : (
              <p className="text-caption text-fg-muted-raised">
                Chưa đọc được bản trên đĩa để so sánh. Bạn vẫn chọn được, nhưng nếu không chắc thì
                hãy chọn <strong className="text-fg-strong">Lưu thành bản sao</strong> — cách đó không
                mất gì của ai.
              </p>
            )}
          </section>

          <p className="text-caption text-fg-muted-raised">
            Ghi đè không xoá vĩnh viễn bản trên đĩa: mỗi lần lưu, bản trước đó được giữ trong lịch sử
            (50 bản) và khôi phục lại được.
          </p>
        </DialogBody>

        <DialogFooter className="sm:justify-between">
          <Button variant="secondary" disabled={pending} onClick={() => onResolve("fork")}>
            <Copy aria-hidden />
            Lưu thành bản sao
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" disabled={pending} onClick={() => onResolve("reload")}>
              <Download aria-hidden />
              Tải lại bản trên đĩa (mất thay đổi)
            </Button>
            <Button variant="danger" loading={pending} onClick={() => onResolve("overwrite")}>
              <Upload aria-hidden />
              Ghi đè bằng bản của tôi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
