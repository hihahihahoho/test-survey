import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatchProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { duplicateNameWarning, validateName } from "../lib/slug";
import { errorDetail, toastSuccess } from "../lib/feedback";
import { InlineError } from "./parts";

/**
 * §4.2 ĐỔI TÊN — modal MỘT ô, thao tác 2 giây.
 *
 * Ba chốt của spec:
 *  · `projectId` và THƯ MỤC KHÔNG ĐỔI → ghi rõ 1 dòng dưới ô nhập, để user không
 *    sợ mất `runs/`, manifest hay đường dẫn ảnh (arch §2.2).
 *  · Đổi SLUG (ảnh hưởng tên file zip) nằm ở S2b, KHÔNG ở đây.
 *  · Trùng tên: cảnh báo, KHÔNG chặn.
 *
 * OPTIMISTIC + ROLLBACK do `usePatchProject` của R0 lo: tên đổi ngay trên thẻ,
 * lỗi thì trả lại nguyên trạng + lỗi hiện inline ở đây.
 */
export function RenameProjectDialog({
  project,
  open,
  onOpenChange,
  existing,
}: {
  project: Project | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: readonly Project[];
}) {
  const patch = usePatchProject(project?.id ?? "");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (!open || !project) return;
    setValue(project.name);
    setError(null);
    setFailure(null);
  }, [open, project]);

  if (!project) return null;

  const others = existing.filter((p) => p.id !== project.id);
  const dup = duplicateNameWarning(value, others);

  const submit = async () => {
    const err = validateName(value);
    setError(err);
    if (err) return;
    if (value.trim() === project.name) {
      onOpenChange(false);
      return;
    }
    setFailure(null);
    try {
      const res = await patch.mutateAsync({ name: value.trim() });
      onOpenChange(false);
      toastSuccess(`Đã đổi tên thành «${res.name}»`);
    } catch (e) {
      setFailure(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={patch.isPending ? () => {} : onOpenChange}>
      <DialogContent size="md" onEscapeKeyDown={(e) => patch.isPending && e.preventDefault()}
        onPointerDownOutside={(e) => patch.isPending && e.preventDefault()}
        onInteractOutside={(e) => patch.isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Đổi tên «{project.name}»</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-input">Tên dự án</Label>
            <Input
              id="rename-input"
              value={value}
              autoFocus
              maxLength={120}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby="rename-help"
            />
            {error && (
              <p role="alert" className="text-caption text-danger">
                {error}
              </p>
            )}
            <p id="rename-help" className="text-caption text-fg-muted-raised">
              Thư mục trên máy vẫn là <span className="font-mono text-fg">{project.id}</span>. Đổi tên file khi
              xuất thì vào Cài đặt project.
            </p>
          </div>

          {dup && (
            <div className="flex items-start gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3" role="status">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
              <p className="text-caption text-fg-strong">{dup.warn}</p>
            </div>
          )}

          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={patch.isPending}>
            Huỷ
          </Button>
          <Button variant="primary" loading={patch.isPending} onClick={() => void submit()}>
            Lưu tên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
