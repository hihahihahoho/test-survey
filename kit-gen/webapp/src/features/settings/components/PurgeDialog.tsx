import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presentError } from "@/lib/api";
import { usePurgeTrash } from "@/lib/hooks";
import { bytes } from "@/lib/format";
import type { TrashItem } from "@/lib/types";
import { toastSuccess } from "@/features/projects/lib/feedback";

const CONFIRM_TEXT = "xac-nhan";

export function PurgeDialog({ item, onClose, onPurged }: { item: TrashItem | null; onClose: () => void; onPurged: () => void }) {
  const purge = usePurgeTrash();
  const [confirm, setConfirm] = React.useState("");
  const open = item !== null;
  React.useEffect(() => setConfirm(""), [item?.trashId]);

  const projectId = item?.projectId ?? "";
  const ready = confirm.trim().toLowerCase() === CONFIRM_TEXT && projectId.length > 0 && !purge.isPending;
  const name = item?.name ?? projectId ?? "dự án này";
  const submit = () => {
    if (!item || !ready) return;
    purge.mutate({ trashId: item.trashId, projectId, confirm }, {
      onSuccess: () => { toastSuccess(`Đã xoá vĩnh viễn «${name}»`); setConfirm(""); onPurged(); },
    });
  };

  return <Dialog open={open} onOpenChange={(value) => { if (!value) { setConfirm(""); onClose(); } }}>
    <DialogContent className="w-modal-md">
      <DialogHeader>
        <DialogTitle>Xoá vĩnh viễn «{name}»?</DialogTitle>
        <DialogDescription>Không thể phục hồi. {item?.bytes !== undefined ? `${bytes(item.bytes)} sẽ bị xoá khỏi ổ đĩa.` : "Dữ liệu sẽ bị xoá khỏi ổ đĩa."}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <div className="rounded-3 border border-danger/60 bg-danger/10 p-4">
          <p className="text-label text-fg-strong">Kiểm tra đúng dự án trước khi xoá</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption"><dt className="text-fg-muted">Tên</dt><dd>{name}</dd><dt className="text-fg-muted">Mã dự án</dt><dd className="font-mono">{projectId}</dd></dl>
        </div>
        <div>
          <Label htmlFor="purge-confirm">Nhập “{CONFIRM_TEXT}” để xác nhận</Label>
          <Input id="purge-confirm" value={confirm} autoComplete="off" onChange={(event) => setConfirm(event.target.value)} />
        </div>
        {purge.error && <p role="alert" className="flex gap-2 text-body text-danger"><AlertTriangle className="size-4" aria-hidden />{presentError(purge.error).explain}</p>}
      </DialogBody>
      <DialogFooter><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button variant="danger" disabled={!ready} loading={purge.isPending} onClick={submit}>Xoá đúng dự án này</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
