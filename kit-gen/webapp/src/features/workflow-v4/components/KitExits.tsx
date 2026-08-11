import * as React from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKit } from "@/lib/hooks";
import { saveProjectFile, exportZipPath } from "@/features/kit/lib/download";
import { buildFigmaBoard, BoardCancelled, type BoardProgress } from "@/features/kit/lib/figma-board";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";
import { MAIN_VARIANT_ID } from "../lib/kitset-to-contract";

/**
 * HAI CỬA RA MANG PHẦN THƯỞNG Ở BƯỚC ⑥ (§W3-7) — cả hai **0 đồng**.
 *
 * W1 đã dựng hai nút này ở trạng thái khoá kèm lý do ("Mở khi bộ kit đã có ảnh thật"),
 * đúng chủ ý: bật bừa thì tải về một file `.zip` rỗng. Nay chúng mở thật, và điều kiện
 * mở là **có ảnh đã cắt** (`useKit`) chứ không phải một cái cờ nào đó.
 */

/* ── Tải .zip ────────────────────────────────────────────────────────────────
   KHÔNG dùng `<a href download>`. `features/kit/lib/download.ts` đã đo và ghi lại:
   điều hướng trình duyệt không gắn được header `X-KitGen-Client: 1` ⇒ agent trả **403**.
   Phải tải qua transport rồi dựng object URL — đúng việc `saveProjectFile` làm. */

export function DownloadKitButton({ projectId }: { projectId: string }) {
  const kit = useKit(projectId);
  const [busy, setBusy] = React.useState(false);
  const files = kit.data?.files ?? [];
  const ready = files.length > 0;

  const onClick = async () => {
    setBusy(true);
    try {
      const path = exportZipPath(projectId, ["kits"], MAIN_VARIANT_ID);
      const saved = await saveProjectFile(projectId, path);
      toastSuccess("Đã tải ảnh", `${saved.fileName} · ${Math.max(1, Math.round(saved.bytes / 1024))} KB`);
    } catch (err) {
      toastError(err, {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      disabled={!ready || busy}
      title={ready ? `Tải ${files.length} ảnh đã cắt về máy` : "Mở sau khi dự án có ảnh đã cắt"}
      onClick={() => void onClick()}
    >
      {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Download aria-hidden />}
      {busy ? "Đang gói…" : "Tải .zip"}
    </Button>
  );
}

/* ── Copy sang Figma ─────────────────────────────────────────────────────────
   Hoàn toàn client-side: canvas + clipboard, không một request sinh ảnh nào.
   `buildFigmaBoard` có 4 pha, huỷ được, và **có đường lùi**: clipboard hỏng thì nó
   tải `.png` xuống và trả `outcome:"download"` kèm `fallbackReason`. Chỗ này phải
   đọc `outcome` — báo "đã copy" khi thật ra đã tải file là nói dối người dùng. */

export function CopyFigmaButton({ projectId, kitName }: { projectId: string; kitName: string }) {
  const kit = useKit(projectId);
  const [progress, setProgress] = React.useState<BoardProgress | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const files = kit.data?.files ?? [];
  const ready = files.length > 0;

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const onClick = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    setProgress({ phase: 1, label: "Chuẩn bị…", done: 0, total: files.length });
    try {
      // Ô dáng nhận diện bằng SHEET trước, tên file sau: tên ô dáng của W3 là
      // `NN-pose-<id>` (phải khớp V-01 của agent), nên `startsWith("pose-")` — mẫu
      // mà `kit/lib/export-scale.ts` tự khai là mong manh — sẽ bắt hụt.
      const isPose = (f: { file: string; sheet?: string }) =>
        (f.sheet?.startsWith("pose") ?? false) || /(^|-)pose-/.test(f.file);
      const poseFiles = new Set(files.filter(isPose).map((f) => f.file));
      const res = await buildFigmaBoard({
        projectId,
        files,
        poseFiles,
        variantLabel: kitName,
        onProgress: setProgress,
        signal: ac.signal,
      });
      if (res.outcome === "clipboard") {
        toastSuccess("Đã copy sang clipboard", `${res.files} ảnh · dán thẳng vào Figma (Ctrl/Cmd+V).`);
      } else {
        // Nói ĐÚNG chuyện đã xảy ra, kèm lý do — không giả vờ đã copy.
        toastInfo("Trình duyệt không cho copy ảnh", `Đã tải bảng ${res.width}×${res.height} về máy để bạn kéo vào Figma.${res.fallbackReason ? ` (${res.fallbackReason})` : ""}`);
      }
    } catch (err) {
      if (err instanceof BoardCancelled || ac.signal.aborted) return;
      toastError(err, {});
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const busy = progress !== null;
  return (
    <Button
      variant="secondary"
      disabled={!ready || busy}
      title={ready ? `Ghép ${files.length} ảnh thành một bảng rồi copy` : "Mở sau khi dự án có ảnh đã cắt"}
      onClick={() => void onClick()}
    >
      {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Copy aria-hidden />}
      {busy ? `${progress.label} ${progress.total ? `${progress.done}/${progress.total}` : ""}`.trim() : "Copy sang Figma"}
    </Button>
  );
}
