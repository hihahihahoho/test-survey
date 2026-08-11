import * as React from "react";
import { ShieldAlert } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCleanProject } from "@/lib/hooks";
import type { CleanTarget, Project } from "@/lib/types";
import { bytes } from "../lib/format";
import { errorDetail, toastSuccess } from "../lib/feedback";
import type { Gate } from "../lib/gate";
import { CheckRow, InlineError, OfflineNotice } from "./parts";
import { ActiveRunGuard } from "@/features/runs";

/**
 * §4.5 DỌN CACHE DẪN XUẤT. Không phải xoá project, nhưng vẫn là thao tác phá huỷ
 * ⇒ checklist XEM TRƯỚC + nói rõ hai thứ KHÔNG BAO GIỜ bị dọn.
 *
 * Mặc định tick 2 mục rẻ nhất (khung xương + prompt) đúng wireframe §4.5.
 * "Lịch sử ảnh AI" có cảnh báo vàng vì đó là thứ duy nhất trong danh sách
 * KHÔNG lấy lại được (nhóm "tốn quota" của §1.2).
 *
 * KHÔNG BỊA SỐ: `#7`/`#9` không trả số file/dung lượng theo TỪNG mục dọn, nên ở
 * đây nêu hệ quả bằng CHỮ ("tái tạo trong vài giây") thay vì in ra một con số
 * đoán mò. Con số thật chỉ hiện SAU khi dọn (`freedBytes` của agent).
 */
const TARGETS: { id: CleanTarget; label: string; hint?: string; warn?: string; on: boolean }[] = [
  { id: "skeleton", label: "Khung xương", hint: "tái tạo trong vài giây", on: true },
  { id: "prompts", label: "Prompt đã dựng", hint: "tái tạo trong khoảng 1 giây", on: true },
  { id: "kits", label: "Kit đã cắt", hint: "cắt lại được, mất khoảng 40 giây", on: false },
  { id: "rawHistory", label: "Lịch sử ảnh AI", hint: "giữ 3 đời ảnh cũ", warn: "mất bản sinh cũ, không lấy lại được", on: false },
  { id: "oldLogs", label: "Log lượt chạy cũ hơn 30 ngày", on: false },
];

export function CleanProjectDialog({
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
  const clean = useCleanProject(project?.id ?? "");
  const [picked, setPicked] = React.useState<CleanTarget[]>([]);
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (!open) return;
    setPicked(TARGETS.filter((t) => t.on).map((t) => t.id));
    setFailure(null);
  }, [open]);

  if (!project) return null;

  const toggle = (id: CleanTarget, on: boolean) =>
    setPicked((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  const submit = async () => {
    if (picked.length === 0) return;
    setFailure(null);
    try {
      const res = await clean.mutateAsync(picked);
      onOpenChange(false);
      toastSuccess(`Đã giải phóng ${bytes(res.freedBytes)}`);
    } catch (e) {
      setFailure(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={clean.isPending ? () => {} : onOpenChange}>
      <DialogContent size="md" onEscapeKeyDown={(e) => clean.isPending && e.preventDefault()}
        onPointerDownOutside={(e) => clean.isPending && e.preventDefault()}
        onInteractOutside={(e) => clean.isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Dọn cache của «{project.name}»</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {gate.readOnly && <OfflineNotice text={gate.longReason} />}

          {/* §4.5: dọn khi đang có lượt chạy ⇒ agent trả 409 RUN_ACTIVE. Cảnh báo TRƯỚC
              kèm đường sang lượt đó, thay vì để user bấm rồi mới ăn lỗi
              (NEEDS-safety-runs §N7 đề nghị dùng chung cho cả dialog này). */}
          <ActiveRunGuard project={project} />

          <fieldset className="flex flex-col gap-0.5">
            <legend className="sr-only">Chọn thứ muốn dọn</legend>
            {TARGETS.map((t) => (
              <CheckRow
                key={t.id}
                id={`clean-${t.id}`}
                checked={picked.includes(t.id)}
                onCheckedChange={(v) => toggle(t.id, v)}
                label={t.label}
                {...(t.hint ? { hint: t.hint } : {})}
                {...(t.warn ? { warn: t.warn } : {})}
              />
            ))}
          </fieldset>

          <div className="flex items-start gap-2 rounded-2 border border-line-subtle bg-canvas p-3">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-on-tint-ok" aria-hidden />
            <p className="text-caption text-fg">
              Ảnh AI đang dùng và Bản thiết kế <strong className="text-fg-strong">không bao giờ</strong> bị dọn ở đây.
            </p>
          </div>

          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={clean.isPending}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            loading={clean.isPending}
            disabled={gate.readOnly || picked.length === 0}
            aria-disabled={gate.readOnly || picked.length === 0 || undefined}
            title={gate.readOnly ? gate.reason : picked.length === 0 ? "Chọn ít nhất một mục để dọn" : undefined}
            onClick={() => void submit()}
          >
            Dọn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
