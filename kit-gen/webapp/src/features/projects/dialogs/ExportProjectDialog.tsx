import * as React from "react";
import { Download } from "lucide-react";
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { Project } from "@/lib/types";
import { bytes, count, exportFileName } from "../lib/format";
import { downloadPath } from "../lib/agent-blob";
import { errorDetail, toastError, toastSuccess } from "../lib/feedback";
import type { Gate } from "../lib/gate";
import { CheckRow, InfoNotice, InlineError, OfflineNotice } from "./parts";

/**
 * §4.7 XUẤT .ZIP.
 *
 * ⚠ KHÔNG dùng `<a href={api.projects.exportUrl(...)} download>`: điều hướng của
 * trình duyệt không gửi được `X-KitGen-Client: 1` ⇒ agent trả **403**.
 * ĐÃ ĐO THẬT (agent 1.2.0, 127.0.0.1:8791):
 *     không header → HTTP 403 · có header → HTTP 200, 3921 byte,
 *     Content-Disposition: attachment; filename="kitgen-tet-2026-vietinbank-20260806.zip"
 * Nên phải tải qua transport rồi lưu bằng Blob — xem `lib/agent-blob.ts`.
 *
 * Tiến trình: agent CÓ trả `Content-Length` (đo được ở trên), nhưng `fetch` +
 * `.blob()` không cho ta callback theo byte. Ta hiện thanh **indeterminate** và
 * nói đúng những gì đang xảy ra ("đang đóng gói…"), thay vì vẽ một thanh % giả.
 * Xem NEEDS N6 nếu muốn % thật (cần đọc `res.body` theo chunk ở tầng R0).
 */
export function ExportProjectDialog({
  projects,
  open,
  onOpenChange,
  gate,
}: {
  /** 1 project (menu ⋯) hoặc nhiều (thanh chọn nhiều). */
  projects: readonly Project[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gate: Gate;
}) {
  const [inc, setInc] = React.useState({ refs: true, raw: false, kits: true, runs: false });
  const [busy, setBusy] = React.useState(false);
  const [progressText, setProgressText] = React.useState("");
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (!open) return;
    setInc({ refs: true, raw: false, kits: true, runs: false });
    setBusy(false);
    setProgressText("");
    setFailure(null);
  }, [open]);

  if (projects.length === 0) return null;
  const many = projects.length > 1;
  const one = projects[0]!;
  const totalDisk = projects.reduce((n, p) => n + Number(p.stats?.diskBytes ?? 0), 0);

  const include = ["contract", ...(inc.refs ? ["refs"] : []), ...(inc.raw ? ["raw"] : []), ...(inc.kits ? ["kits"] : []), ...(inc.runs ? ["runs"] : [])];

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    let ok = 0;
    try {
      for (const p of projects) {
        setProgressText(
          many ? `Đang đóng gói «${p.name}» (${ok + 1}/${projects.length})…` : "Công cụ local đang đóng gói…",
        );
        const qs = `?include=${encodeURIComponent(include.join(","))}`;
        const res = await downloadPath(
          `/api/projects/${encodeURIComponent(p.id)}/export.zip${qs}`,
          exportFileName(p.slug ?? p.id),
        );
        ok += 1;
        if (!many) {
          onOpenChange(false);
          toastSuccess(`Đã tải ${res.fileName}`, bytes(res.bytes));
          return;
        }
      }
      onOpenChange(false);
      toastSuccess(`Đã tải ${count(ok, "file zip")}`);
    } catch (e) {
      // Lỗi hiện INLINE ở đây (§5.5) — toast chỉ là lớp phụ.
      setFailure(e);
      if (ok > 0) toastError(e, { titleOverride: `Đã tải ${ok}/${projects.length} file rồi dừng` });
    } finally {
      setBusy(false);
      setProgressText("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent size="md" onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{many ? `Xuất ${projects.length} dự án` : `Xuất «${one.name}»`}</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {gate.readOnly && <OfflineNotice text={gate.longReason} />}

          <p className="text-body text-fg">Dữ liệu dự án luôn được xuất. Chọn thêm nội dung cần tải:</p>

          <fieldset className="flex flex-col gap-0.5">
            <legend className="sr-only">Nội dung file zip</legend>
            <CheckRow id="exp-contract" checked locked label="Dữ liệu dự án" hint="luôn xuất" />
            <CheckRow
              id="exp-refs"
              checked={inc.refs}
              onCheckedChange={(v) => setInc((p) => ({ ...p, refs: v }))}
              label="Ảnh tham khảo"
              hint="nhẹ, nên giữ"
            />
            <CheckRow
              id="exp-raw"
              checked={inc.raw}
              onCheckedChange={(v) => setInc((p) => ({ ...p, raw: v }))}
              label={many ? "Ảnh gốc đã tạo" : `Ảnh gốc đã tạo (${count(one.stats?.rawPresent ?? 0, "lượt")})`}
              hint="dung lượng lớn"
            />
            <CheckRow
              id="exp-kits"
              checked={inc.kits}
              onCheckedChange={(v) => setInc((p) => ({ ...p, kits: v }))}
              label={many ? "Ảnh đã tách" : `Ảnh đã tách (${count(one.stats?.kitsCut ?? 0, "file")})`}
              hint="các file dùng riêng"
            />
            <CheckRow
              id="exp-runs"
              checked={inc.runs}
              onCheckedChange={(v) => setInc((p) => ({ ...p, runs: v }))}
              label="Lịch sử lượt chạy"
              hint="chỉ để tra cứu"
            />
          </fieldset>

          <p className="text-caption text-fg-muted-raised">
            {many ? (
              <>
                {count(projects.length, "file zip")} sẽ được tải lần lượt. Tổng dữ liệu gốc {bytes(totalDisk)}.
              </>
            ) : (
              <>
                Tên file: <span className="font-mono text-fg">{exportFileName(one.slug ?? one.id)}</span>
                {(inc.raw || inc.runs) && <> · dự án đang chiếm {bytes(one.stats?.diskBytes ?? 0)} nên file có thể lớn</>}
              </>
            )}
          </p>

          <InfoNotice>
            File zip giữ nguyên cấu trúc thư mục để có thể chuyển sang máy khác.
          </InfoNotice>

          {busy && (
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <p className="text-caption text-fg">{progressText}</p>
              {/* Indeterminate: không vẽ % giả khi không đo được % thật. */}
              <Progress value={undefined} className="animate-pulse" aria-label="Đang đóng gói" />
            </div>
          )}

          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Đóng
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={() => void submit()}
          >
            <Download aria-hidden />
            {many ? `Tải ${projects.length} file .zip` : "Tải .zip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
