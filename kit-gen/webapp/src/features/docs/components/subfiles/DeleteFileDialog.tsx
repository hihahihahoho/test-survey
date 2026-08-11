import { AlertTriangle } from "lucide-react";
import { ConfirmDestructive } from "@/components/common";
import { cn } from "@/lib/utils";
import { CARD } from "@/components/layout/flora";
import { deleteDocDescription, runNoticeForDoc } from "../../lib/subfile-actions";
import type { Doc } from "../../lib";

/**
 * XÁC NHẬN XOÁ FILE CON (§4.4) — dùng `ConfirmDestructive` của R0, **không** truyền
 * `confirmText`.
 *
 * VÌ SAO KHÔNG BẮT GÕ TÊN: chốt X6 của R0 — ma sát phải tương xứng hậu quả. Ở đây
 * hậu quả gần bằng không (soft-delete, Hoàn tác 10s, thùng rác 30 ngày, sản phẩm
 * không đụng tới). Bắt gõ tên cho một thao tác vô hại là dạy người dùng gõ bừa,
 * làm hỏng ma sát ở chỗ THẬT SỰ nguy hiểm.
 *
 * ⚠ C-01 CHO FILE CON (§4.4): nếu file trỏ tới sheet đang chạy, ta **vẫn cho xoá**
 * và nói rõ *"lượt này vẫn chạy tiếp"*. Khác hẳn xoá project (ở đó lượt bị dừng).
 * File này KHÔNG import, không gọi bất kỳ API run/cancel nào — có grep trong report.
 */
export interface DeleteFileDialogProps {
  doc: Doc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
  /** id sheet đang có lượt chạy — chỉ để CẢNH BÁO, không dùng để chặn. */
  runningSheetIds?: readonly string[];
  errorTitle?: string | null;
  errorDetail?: string | null;
}

export function DeleteFileDialog(props: DeleteFileDialogProps) {
  const { doc, open, onOpenChange, onConfirm, pending, runningSheetIds = [], errorTitle, errorDetail } = props;
  if (!doc) return null;

  const run = runNoticeForDoc(doc, runningSheetIds);

  return (
    <ConfirmDestructive
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      title={`Xoá file «${doc.name}»?`}
      description={deleteDocDescription(doc.name)}
      actionLabel="Chuyển vào thùng rác"
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-3">
        <div className={cn(CARD, "flex flex-col gap-1 p-3")}>
          <p className="text-label text-fg-strong">Cái gì KHÔNG bị xoá</p>
          <ul className="flex flex-col gap-0.5">
            {[
              "Sheet và bản thiết kế — thuộc về dự án",
              "Ảnh AI đã sinh và kit đã cắt — vẫn nằm nguyên trong dự án",
              "Các file con khác — không bị ảnh hưởng",
            ].map((t) => (
              <li key={t} className="text-caption text-fg">
                {t}
              </li>
            ))}
          </ul>
          <p className="pt-1 text-caption text-fg-muted-raised">
            File này chỉ là một góc làm việc: nó nhớ bạn đang xem sheet nào và ghi chú gì.
          </p>
        </div>

        {run.affected && (
          <div role="alert" className={cn(CARD, "flex items-start gap-2 p-3")}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden strokeWidth={1.5} />
            <div className="flex flex-col gap-0.5">
              <p className="text-label text-fg-strong">{run.message}</p>
              <p className="text-caption text-fg">
                Xoá file không dừng lượt nào. Ảnh sinh xong vẫn về đúng dự án và bạn xem được ở «Tất cả sheet».
              </p>
            </div>
          </div>
        )}

        {errorTitle && (
          <div role="alert" className={cn(CARD, "flex flex-col gap-1 p-3")}>
            <p className="text-body text-fg-strong">{errorTitle}</p>
            {errorDetail && (
              <details>
                <summary className="cursor-pointer list-none text-caption text-fg-muted-raised">
                  Chi tiết cho lập trình viên
                </summary>
                <code className="mt-1 block font-mono text-caption text-fg-muted-raised">{errorDetail}</code>
              </details>
            )}
          </div>
        )}
      </div>
    </ConfirmDestructive>
  );
}
