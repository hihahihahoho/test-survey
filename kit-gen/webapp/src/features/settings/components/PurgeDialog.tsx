import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineBanner } from "@/components/common";
import { presentError } from "@/lib/api";
import { usePurgeTrash, useRequestPurgeCode } from "@/lib/hooks";
import { bytes } from "@/lib/format";
import type { TrashItem } from "@/lib/types";
import { toastSuccess } from "@/features/projects/lib/feedback";

/**
 * XOÁ VĨNH VIỄN — modal thứ hai của §4.4, lớp bảo vệ 8 của arch §3.4.
 *
 * ╔══ LUẬT KHÔNG THƯƠNG LƯỢNG ════════════════════════════════════════════════╗
 * ║ MÃ 4 SỐ KHÔNG ĐƯỢC LƯU Ở BẤT CỨ ĐÂU TRONG TRÌNH DUYỆT (arch §4.3-7).      ║
 * ║ Nó chỉ sống trong `React.useState` của modal này và bị xoá khi modal đóng: ║
 * ║ không localStorage, không IDB, không store Zustand (persist của R0 có bộ   ║
 * ║ dò secret, nhưng cách chắc chắn nhất là KHÔNG BAO GIỜ đưa nó vào store).   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Mã do AGENT in ra terminal — web không sinh, không đoán, không hiện lại mã.
 * Sai 3 lần ⇒ khoá 60 giây (§4.4), đếm ngược hiện ngay tại chỗ để user không
 * tưởng app bị treo.
 *
 * `Enter` KHÔNG phải nút phá huỷ: form submit chỉ chạy khi đã đủ 4 số và chưa bị
 * khoá, và nút xác nhận là `danger` chứ không phải nút mặc định.
 */
export function PurgeDialog({
  item,
  onClose,
  onPurged,
}: {
  item: TrashItem | null;
  onClose: () => void;
  onPurged: () => void;
}) {
  const requestCode = useRequestPurgeCode();
  const purge = usePurgeTrash();

  const [code, setCode] = React.useState("");
  const [wrong, setWrong] = React.useState(0);
  const [lockUntil, setLockUntil] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());

  const open = item !== null;

  /* Mở modal: xin agent in mã, và DỌN SẠCH mọi vết của lần trước. */
  React.useEffect(() => {
    if (!open || !item) return;
    setCode("");
    setWrong(0);
    setLockUntil(0);
    requestCode.mutate(item.trashId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.trashId]);

  /* Đồng hồ cho phần đếm ngược khoá. */
  React.useEffect(() => {
    if (lockUntil === 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockUntil]);

  const lockLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const locked = lockLeft > 0;
  const ready = code.length === 4 && !locked && !purge.isPending;

  const submit = () => {
    if (!item || !ready) return;
    purge.mutate(
      { trashId: item.trashId, code },
      {
        onSuccess: () => {
          toastSuccess(`Đã xoá vĩnh viễn «${item.name ?? "Dự án"}»`);
          setCode("");
          onPurged();
        },
        onError: () => {
          const n = wrong + 1;
          setWrong(n);
          setCode("");
          if (n >= 3) {
            setLockUntil(Date.now() + 60_000);
            setWrong(0);
          }
        },
      },
    );
  };

  const name = item?.name ?? item?.projectId ?? "dự án này";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setCode(""); // mã không bao giờ sống lâu hơn modal
          onClose();
        }
      }}
    >
      <DialogContent className="w-modal-md">
        <DialogHeader>
          <DialogTitle>Xoá vĩnh viễn «{name}»?</DialogTitle>
          <DialogDescription>
            Không thể phục hồi.{" "}
            {item?.bytes !== undefined ? `${bytes(item.bytes)} sẽ bị xoá khỏi ổ đĩa.` : "Dữ liệu sẽ bị xoá khỏi ổ đĩa."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <InlineBanner
            tone="warning"
            title="Mở cửa sổ Terminal đang chạy công cụ local"
            description="Bạn sẽ thấy một mã 4 số ở đó. Mã này chỉ hiện trên máy bạn — trang web không biết nó là gì."
          />

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Label htmlFor="purge-code">Mã 4 số</Label>
            <Input
              id="purge-code"
              value={code}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
              disabled={locked}
              aria-describedby="purge-code-help"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-32 text-center font-mono text-title tracking-[0.5em]"
            />
            <p id="purge-code-help" className="text-caption text-fg-muted">
              {locked
                ? `Sai mã. Hãy xem lại cửa sổ Terminal. Thử lại sau ${lockLeft} giây.`
                : wrong > 0
                  ? `Sai mã. Còn ${3 - wrong} lần thử.`
                  : "Mã không được lưu lại ở trình duyệt này."}
            </p>
          </form>

          {purge.error && wrong === 0 && !locked && (
            <p className="flex items-start gap-2 text-body text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {presentError(purge.error).explain}
            </p>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            loading={requestCode.isPending}
            onClick={() => item && requestCode.mutate(item.trashId)}
          >
            Gửi lại mã
          </Button>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button variant="danger" disabled={!ready} loading={purge.isPending} onClick={submit}>
            Xoá vĩnh viễn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
