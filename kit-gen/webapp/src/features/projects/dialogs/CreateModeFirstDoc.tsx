import * as React from "react";
import { CheckCircle2, HardDrive, Loader2 } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common";
import { cn } from "@/lib/utils";
import { FLORA } from "@/components/layout/flora";
import type { CreateIntent } from "../lib/create-mode";
import { FIRST_DOC_DELAY_MS, FIRST_DOC_NO_SHEETS_NOTE, partialSuccessCopy } from "../lib/create-mode-firstdoc";
import { useFirstDocRun, type FirstDocRun } from "../lib/create-mode-firstdoc-run";

/**
 * MÀN CHUYỂN TIẾP giữa "project đã tạo" và "mở file đầu tiên".
 *
 * Chỉ hiện khi cần: pha `creating` mà xong nhanh thì người dùng gần như không thấy nó
 * (chỗ gọi trì hoãn `FIRST_DOC_DELAY_MS` trước khi mở). Nó tồn tại vì **pha `failed`**:
 *
 *  · KHÔNG trắng trang, KHÔNG toast rồi biến mất — người dùng phải hiểu chuyện gì đã xảy ra;
 *  · điều CHẮC CHẮN ĐÚNG nói trước: **project đã tạo xong, không mất gì**;
 *  · hai đường đi rõ ràng: [Thử tạo file lại] (chỉ tạo lại FILE, không tạo lại project)
 *    và [Mở quy trình chuẩn] (bỏ qua file con, vào màn project — đường đã qua QA);
 *  · chi tiết kỹ thuật CHỈ nằm trong «Chi tiết cho lập trình viên».
 *
 * Dialog này KHÔNG có nút đóng bằng Esc/click-ngoài trong lúc đang tạo (cùng luật §1.4
 * với dialog tạo project: thao tác đang chạy thì không cho đóng nửa chừng).
 */
export function CreateModeFirstDoc({
  open,
  intent,
  projectName,
  run,
  onSkip,
}: {
  open: boolean;
  intent: CreateIntent;
  projectName: string;
  run: FirstDocRun;
  /** Bỏ qua file con và mở màn project — đường lùi luôn có, kể cả lúc đang chạy. */
  onSkip: () => void;
}) {
  const failed = run.phase === "failed";
  const copy = partialSuccessCopy(projectName, intent.firstDoc.name);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        size="md"
        hideClose
        onEscapeKeyDown={(e) => !failed && e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{failed ? copy.title : `Đang chuẩn bị «${projectName}»`}</DialogTitle>
          <DialogDescription>
            {failed ? copy.reassure : `Đang tạo file đầu tiên «${intent.firstDoc.name}».`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {run.phase === "creating" && (
            <p role="status" className="flex items-center gap-2 text-body text-fg">
              <Loader2 className="size-4 animate-spin text-fg-muted-raised" aria-hidden />
              Đang tạo file…
            </p>
          )}

          {run.phase === "done" && (
            <p role="status" className="flex items-start gap-2 text-body text-fg">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
              Xong. Đang mở «{intent.firstDoc.name}».
            </p>
          )}

          {failed && (
            <div role="alert" className="flex flex-col gap-3">
              <div className={cn("flex flex-col gap-1 border border-line-subtle bg-raised p-3", FLORA.r12)}>
                <p className="text-body text-fg-strong">{copy.whatFailed}</p>
                <p className="text-caption text-fg">{run.failure?.title}</p>
              </div>
              <p className="flex items-start gap-2 text-caption text-fg-muted-raised">
                <HardDrive className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                File con được lưu trong trình duyệt của máy này, tách khỏi thư mục project trên đĩa. Vì vậy
                thư mục project vẫn nguyên vẹn dù bước này hỏng.
              </p>
              {run.failure?.detail && (
                <details>
                  <summary className="cursor-pointer list-none text-label text-fg-muted-raised hover:text-fg-strong">
                    Chi tiết cho lập trình viên
                  </summary>
                  <CopyableCode className="mt-2" value={run.failure.detail} />
                </details>
              )}
            </div>
          )}

          {run.phase === "done" && run.withoutSheets && (
            <p className="pt-3 text-caption text-fg-muted-raised">{FIRST_DOC_NO_SHEETS_NOTE}</p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onSkip}>
            {failed ? copy.fallbackLabel : "Bỏ qua, mở project"}
          </Button>
          {failed && (
            <Button type="button" variant="primary" onClick={run.retry}>
              {copy.retryLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═════════════ CONTAINER ═════════════ */

/**
 * Bọc `useFirstDocRun` + luật "chỉ hiện hộp khi thật sự cần".
 *
 * Vì sao tách container khỏi phần vẽ: hook chạy **ngay khi mount**, nên nó phải sống trong
 * một component chỉ tồn tại đúng lúc có việc — mount nó ở `ProjectDialogs` sẽ khiến việc
 * tạo file chạy cả khi không có project nào vừa được tạo.
 *
 * Luật hiện hộp: im lặng trong `FIRST_DOC_DELAY_MS` đầu (đường local thường xong trong
 * vài ms — chớp một hộp thoại rồi tắt còn khó chịu hơn không hiện gì), sau đó mới hiện.
 * Pha `failed` thì hiện NGAY, không chờ.
 */
export function FirstDocGate({
  projectId,
  projectName,
  intent,
  onOpenDoc,
  onSkip,
}: {
  projectId: string;
  projectName: string;
  intent: CreateIntent;
  /** Tạo xong: mở file. Trả `false` nghĩa là chưa mở được đúng file (route E1 chưa có). */
  onOpenDoc: (docId: string, docName: string, withoutSheets: boolean) => void;
  onSkip: () => void;
}) {
  const [late, setLate] = React.useState(false);
  const run = useFirstDocRun({
    projectId,
    intent,
    onCreated: (doc, withoutSheets) => onOpenDoc(doc.id, doc.name, withoutSheets),
  });

  React.useEffect(() => {
    const t = setTimeout(() => setLate(true), FIRST_DOC_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const show = run.phase === "failed" || (run.phase === "creating" && late);
  return (
    <CreateModeFirstDoc open={show} intent={intent} projectName={projectName} run={run} onSkip={onSkip} />
  );
}
