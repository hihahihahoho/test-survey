import { FolderOpen } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/common";
import { useRevealProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { errorDetail, toastError, toastSuccess } from "../lib/feedback";
import type { Gate } from "../lib/gate";

/**
 * Chi tiết "project.json hỏng" (§3-S1-4, §3.9 `PROJECT_BROKEN`).
 *
 * Nguyên tắc §1.1-5: 1 câu người thật hiểu + ≥1 nút hành động + panel dev GẬP LẠI.
 * `error.message` của agent chỉ được xuất hiện trong panel đó — không bao giờ ở
 * thân modal.
 *
 * Ghi chú trung thực: `teams/qa-web/QA-VERDICT.md` L-05 nói agent hiện trả
 * `line: null` cho `PROJECT_BROKEN`. UI vì thế phải chịu được thiếu số dòng —
 * hiện "chưa xác định được dòng" thay vì "dòng null".
 */
export function BrokenProjectDialog({
  project,
  open,
  onOpenChange,
  gate,
}: {
  project: Project | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gate: Gate;
}) {
  // Hook phải chạy vô điều kiện (luật hook) — id rỗng thì nút Mở thư mục cũng
  // không hiện vì modal chỉ render khi có project.
  const reveal = useRevealProject(project?.id ?? "");
  if (!project) return null;
  const err = project.error;
  const doReveal = () =>
    reveal.mutate(undefined, {
      onSuccess: () => toastSuccess(`Đã mở thư mục của «${project.name}»`),
      onError: (e) => toastError(e),
    });

  const rows: [string, string][] = [
    ["Thư mục", project.id],
    ["File", err?.file ?? "project.json"],
    ["Dòng", err?.line != null ? String(err.line) : "chưa xác định được"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Không đọc được «{project.name}»</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <p className="text-body text-fg">
            Công cụ local đọc được thư mục nhưng không hiểu nội dung file mô tả project. Project vẫn nằm nguyên trên
            máy bạn — không có gì bị xoá.
          </p>

          <dl className="flex flex-col gap-1.5 rounded-2 border border-line-subtle bg-canvas p-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-20 shrink-0 text-label text-fg-muted-raised">{k}</dt>
                <dd className="min-w-0 break-all font-mono text-mono text-fg-strong">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="text-body text-fg">
            Cách sửa: mở thư mục, sửa lại file bằng trình soạn thảo (thường là thiếu hoặc thừa một dấu phẩy), rồi bấm
            Làm mới ở danh sách.
          </p>

          <details className="group">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-1 text-label text-fg-muted-raised hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-raised">
              Chi tiết cho lập trình viên
            </summary>
            <CopyableCode
              className="mt-2"
              value={errorDetail({ code: "PROJECT_BROKEN", message: err?.message, details: err })}
            />
          </details>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            variant="primary"
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={doReveal}
          >
            <FolderOpen aria-hidden />
            Mở thư mục
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
