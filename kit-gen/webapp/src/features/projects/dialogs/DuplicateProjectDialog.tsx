import * as React from "react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDuplicateProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { copyName } from "../lib/slug";
import { errorDetail, toastSuccess } from "../lib/feedback";
import type { Gate } from "../lib/gate";
import { InlineError, InfoNotice, OfflineNotice } from "./parts";

/**
 * §4.3 NHÂN BẢN CÓ CHỌN LỌC — use case CHÍNH của tool
 * (audit §3.1: "cùng bộ element, thử 5 hướng art style") nên phải làm tốt nhất.
 *
 * Bốn ràng buộc của spec:
 *  · Bản thiết kế LUÔN copy (tick khoá, ghi "luôn copy").
 *  · Mặc định contract + refs — nhẹ, nhanh. KHÔNG copy raw/kits mặc định.
 *  · 3 lựa chọn phong cách sau khi nhân bản (giữ / chỉ 1 / xoá hết + tạo mới).
 *  · Ước lượng tính từ `stats` THẬT. Không bịa tỉ lệ cho từng phần: `#7` chỉ có
 *    tổng `diskBytes` + số file, nên ta nói đúng những gì biết.
 *
 * Xong → mở project MỚI ở S3?tab=styles (việc tiếp theo chắc chắn là sửa art style)
 * + toast có nút [Về project cũ].
 */
export function DuplicateProjectDialog({
  project,
  open,
  onOpenChange,
  existing,
  gate,
  onDone,
  onBackToOld,
}: {
  project: Project | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: readonly Project[];
  gate: Gate;
  onDone: (created: Project) => void;
  onBackToOld: (old: Project) => void;
}) {
  const dup = useDuplicateProject(project?.id ?? "");
  const [name, setName] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (!open || !project) return;
    setName(copyName(project.name, existing));
    setNameError(null);
    setFailure(null);
  }, [open, project, existing]);

  if (!project) return null;

  const submit = async () => {
    const n = name.trim();
    if (n === "") {
      setNameError("Nhập tên cho bản sao.");
      return;
    }
    setFailure(null);
    try {
      const res = await dup.mutateAsync({
        name: n,
        include: ["contract", "refs"],
        variants: "all",
      });
      onOpenChange(false);
      toastSuccess(
        `Đã tạo bản sao: «${res.project.name}»`,
        "Đã chép bộ khung và ảnh tham chiếu. Ảnh đã tạo thì không chép.",
        { label: "Về dự án cũ", onClick: () => onBackToOld(project) },
      );
      onDone(res.project);
    } catch (e) {
      setFailure(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={dup.isPending ? () => {} : onOpenChange}>
      <DialogContent size="lg" onEscapeKeyDown={(e) => dup.isPending && e.preventDefault()}
        onPointerDownOutside={(e) => dup.isPending && e.preventDefault()}
        onInteractOutside={(e) => dup.isPending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Nhân bản dự án «{project.name}»</DialogTitle>
          <DialogDescription>Đặt tên cho dự án mới. Bản gốc vẫn giữ nguyên.</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {gate.readOnly && <OfflineNotice text={gate.longReason} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dup-name">Tên dự án mới</Label>
            <Input
              id="dup-name"
              value={name}
              autoFocus
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              aria-invalid={Boolean(nameError) || undefined}
            />
            {nameError && (
              <p role="alert" className="text-caption text-danger">
                {nameError}
              </p>
            )}
          </div>

          <InfoNotice>
            Chỉ chép bộ khung và ảnh tham chiếu. Ảnh đã tạo thì không chép.
          </InfoNotice>

          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={dup.isPending}>
            Huỷ
          </Button>
          <Button
            variant="primary"
            loading={dup.isPending}
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={() => void submit()}
          >
            Tạo dự án
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
