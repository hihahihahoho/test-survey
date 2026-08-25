import * as React from "react";
import { Check, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKit } from "@/lib/hooks";
import { saveExportZip } from "../lib/download";
import { buildFigmaBoard, BoardCancelled, type BoardProgress } from "../lib/figma-board";
import {
  batchGroups, cellsOf, copyKitDoc, packKitDoc, type KitDocGroup,
} from "../lib/figma-kit-doc";
import { loadFull } from "../lib/image-source";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";

/**
 * HAI CỬA RA MANG PHẦN THƯỞNG (§W3-7) — cả hai **0 đồng**.
 *
 * ⚠️ ĐÃ DỌN NHÀ: file này từng ở `features/kit-core/components/`, nhà cũ của wizard.
 * Cả bốn thứ nó gọi (`lib/download`, `lib/figma-board`, `lib/figma-kit-doc`,
 * `lib/image-source`) đều là của `features/kit`, và người dùng nó nay là màn
 * «Kết quả & xuất kit» — không còn một sợi dây nào nối về wizard. Để nó nằm lại
 * kit-core là giữ một thư mục sống chỉ vì một file trọ nhờ.
 *
 * W1 đã dựng hai nút này ở trạng thái khoá kèm lý do ("Mở khi bộ kit đã có ảnh thật"),
 * đúng chủ ý: bật bừa thì tải về một file `.zip` rỗng. Nay chúng mở thật, và điều kiện
 * mở là **có ảnh đã cắt** (`useKit`) chứ không phải một cái cờ nào đó.
 */

/**
 * ══ DẤU XÁC NHẬN TẠI CHỖ, KHÔNG CHỈ TOAST ═══════════════════════════════════
 *
 * Hai người test mù báo "bấm [Tải .zip] / [Copy sang Figma] im lặng, không biết có
 * chạy không", trong khi một người trong số đó ĐÃ xác nhận qua network log rằng file
 * 2.67 MB tải về thành công. Đo lại bằng trình duyệt thật (cả bản dev lẫn bản 2.1.29
 * đang chạy): toast KHÔNG hỏng — nó hiện, `z-index` 999999999, không bị che, nằm trong
 * khung nhìn ở mọi cỡ màn đã thử.
 *
 * Cái hỏng là KHOẢNG CÁCH: hai nút này ở góc trên-phải, toast nổi ở góc dưới-phải,
 * cách nhau gần cả màn hình và chỉ sống 4 giây; nút thì nhấp nháy "Đang gói…" rồi trở
 * lại y như chưa ai bấm. Người dùng nhìn vào nút, không nhìn vào góc đối diện.
 *
 * `feedback.ts:8-10` đã ra luật cho đúng ca này: "Toast KHÔNG BAO GIỜ là nơi DUY NHẤT
 * báo… chỗ nào gây lỗi thì chỗ đó phải hiện inline". Hai nút này là hai chỗ cuối còn
 * chỉ có toast. Dấu ✓ ở lại ngay trên nút vài giây là lớp báo thứ hai, đặt đúng nơi
 * mắt đang nhìn — toast vẫn giữ nguyên vì nó chở chi tiết (tên file, dung lượng).
 */
const DONE_FLASH_MS = 5000;

function useDoneFlash(): [boolean, () => void] {
  const [done, setDone] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = React.useCallback(() => {
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), DONE_FLASH_MS);
  }, []);
  return [done, flash];
}

/* ── Tải .zip ────────────────────────────────────────────────────────────────
   KHÔNG dùng `<a href download>`. `features/kit/lib/download.ts` đã đo và ghi lại:
   điều hướng trình duyệt không gắn được header `X-KitGen-Client: 1` ⇒ agent trả **403**.
   Phải tải qua transport rồi dựng object URL — đúng việc `saveExportZip` làm.

   ⚠️ ĐI QUA `saveExportZip`, KHÔNG TỰ GHÉP. Bản trước ghép `exportZipPath` — đường
   dẫn API đầy đủ — vào `saveProjectFile`, vốn nhận đường dẫn tương đối trong dự án rồi
   tự bọc `/files/…` ⇒ request đi ra là `/api/projects/<id>/files/api/projects/<id>/
   export.zip%3Finclude%3Dkits`, agent trả 400 PATH_ESCAPE và bấm nút không ra file nào.
   Có ca khoá ở `features/kit/__tests__/export-zip.test.ts`. */

export function DownloadKitButton({ projectId }: { projectId: string }) {
  const kit = useKit(projectId);
  const [busy, setBusy] = React.useState(false);
  const [done, flashDone] = useDoneFlash();
  const files = kit.data?.files ?? [];
  const ready = files.length > 0;

  const onClick = async () => {
    setBusy(true);
    try {
      // MỌI phong cách, không lọc `variant`: con số trên `title` của nút đến từ
      // `useKit(projectId)` — cũng không lọc phong cách. Khoá cứng `variant=chinh`
      // vừa nói dối con số đó, vừa ăn 422 UNKNOWN_VARIANT ở dự án không do wizard tạo.
      const saved = await saveExportZip(projectId, ["kits"]);
      toastSuccess("Đã tải ảnh", `${saved.fileName} · ${Math.max(1, Math.round(saved.bytes / 1024))} KB`);
      flashDone();
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
      title={ready
        ? `Tải ${files.length} ảnh đã cắt về máy — không tiêu lượt tạo nào`
        : "Mở sau khi dự án có ảnh đã cắt"}
      onClick={() => void onClick()}
    >
      {busy ? <Loader2 aria-hidden className="animate-spin" />
        : done ? <Check aria-hidden />
          : <Download aria-hidden />}
      {busy ? "Đang gói…" : done ? "Đã tải về máy" : "Tải .zip"}
    </Button>
  );
}

/* ── Copy sang Figma ─────────────────────────────────────────────────────────
   Hoàn toàn client-side: encoder `figh2d` + clipboard, không một request sinh ảnh nào.

   ╔══ P4-1 — TỪ MỘT TẤM PNG PHẲNG SANG NHIỀU NODE ════════════════════════════╗
   ║ Bản trước gọi thẳng `buildFigmaBoard`: nó vẽ mọi ô lên MỘT `<canvas>` ở cỡ ║
   ║ `exportSize()` (UI = 50%) rồi copy một `image/png`. Hai hậu quả người dùng ║
   ║ thấy đúng như chủ sản phẩm báo: dán ra Figma **không có layer**, và ảnh    ║
   ║ **mờ/vỡ pixel** vì `drawImage` đã resample xuống một nửa — pixel mất thật, ║
   ║ kéo to lại trong Figma không lấy về được.                                  ║
   ║ Nay đường CHÍNH là `figma-kit-doc.ts`: mỗi ô một frame safe-zone đúng tên,  ║
   ║ ảnh nhúng là **blob PNG gốc** (tỉ lệ xuất chỉ nhân vào cỡ NODE). Bảng      ║
   ║ bitmap ở lại làm ĐƯỜNG LÙI khi encoder/clipboard hỏng — đúng lối           ║
   ║ `CutAssetGrid` đã dùng cho từng ô, và toast phải nói rõ đang đi đường nào. ║
   ╚═══════════════════════════════════════════════════════════════════════════╝

   PAYLOAD TO LÀ CHUYỆN CÓ THẬT: ảnh gốc bị base64 HAI LẦN (~1.78×), kit `ipay`
   thật ⇒ ~24 MB một lượt. Vì thế `batchGroups` chia theo NHÓM khi vượt trần, và
   nút nhớ đợt kế tiếp — bấm lại là copy tiếp, toast nói còn nhóm nào. */

/** Nhãn 4 pha của đường node. Pha 3 khác đường bitmap ("Ghép bảng element"). */
const NODE_PHASE: Record<BoardProgress["phase"], string> = {
  1: "Chuẩn bị danh sách",
  2: "Tải ảnh gốc",
  3: "Dựng node Figma",
  4: "Đưa vào bộ nhớ tạm",
};

export function CopyFigmaButton({ projectId, kitName }: { projectId: string; kitName: string }) {
  const kit = useKit(projectId);
  const [progress, setProgress] = React.useState<BoardProgress | null>(null);
  const [done, flashDone] = useDoneFlash();
  const abortRef = React.useRef<AbortController | null>(null);
  /** Đợt kế tiếp khi kit phải chia nhiều lượt copy. Reset khi copy xong đợt cuối. */
  const [batchAt, setBatchAt] = React.useState(0);
  const files = kit.data?.files ?? [];
  const ready = files.length > 0;

  React.useEffect(() => () => abortRef.current?.abort(), []);
  // Kit đổi (cắt lại, đổi dự án) ⇒ con trỏ đợt cũ vô nghĩa.
  React.useEffect(() => setBatchAt(0), [projectId, files.length]);

  // Ô dáng nhận diện bằng SHEET trước, tên file sau: tên ô dáng của W3 là
  // `NN-pose-<id>` (phải khớp V-01 của agent), nên `startsWith("pose-")` — mẫu
  // mà `kit/lib/export-scale.ts` tự khai là mong manh — sẽ bắt hụt.
  const poseFiles = React.useMemo(() => {
    const isPose = (f: { file: string; sheet?: string }) =>
      (f.sheet?.startsWith("pose") ?? false) || /(^|-)pose-/.test(f.file);
    return new Set(files.filter(isPose).map((f) => f.file));
  }, [files]);

  const batches = React.useMemo(
    () => batchGroups(packKitDoc(files, poseFiles).groups),
    [files, poseFiles],
  );

  /** Đường lùi: bảng bitmap phẳng như trước P4-1, và NÓI RÕ là đang đi đường lùi. */
  const copyBitmap = async (why: string, signal: AbortSignal) => {
    const res = await buildFigmaBoard({
      projectId, files, poseFiles, variantLabel: kitName, onProgress: setProgress, signal,
    });
    const tail = res.outcome === "clipboard"
      ? `Đã copy MỘT ẢNH BITMAP phẳng ${res.width}×${res.height} thay cho ${res.files} node — dán vẫn được, nhưng không có layer và ảnh đã thu 50%.`
      : `Đã tải bảng ${res.width}×${res.height} về máy để bạn kéo vào Figma.${res.fallbackReason ? ` (${res.fallbackReason})` : ""}`;
    toastInfo("Chưa dựng được node Figma", `${why} ${tail}`);
  };

  const onClick = async () => {
    const ac = new AbortController();
    abortRef.current = ac;
    const batch: KitDocGroup[] = batches[Math.min(batchAt, Math.max(batches.length - 1, 0))] ?? [];
    const cells = cellsOf(batch);
    setProgress({ phase: 1, label: NODE_PHASE[1], done: 0, total: cells.length });
    try {
      if (cells.length === 0) throw new Error("Không ô nào trong kit có đủ toạ độ safe zone để dựng node.");

      /* 2/4 — ẢNH GỐC, không thumbnail. `loadFull` = `/files/…` KHÔNG kèm `?w=`;
         `loadThumb` sẽ ép `?w=256` (`image-source.ts:152`) và dán ra Figma một kit mờ. */
      const paths = [...new Set(cells.map((c) => c.file.path))];
      const handles = paths.map((path) => ({ path, handle: loadFull(projectId, path) }));
      const onAbort = () => handles.forEach((h) => h.handle.cancel());
      ac.signal.addEventListener("abort", onAbort, { once: true });
      const urls = new Map<string, string>();
      for (const [i, { path, handle }] of handles.entries()) {
        if (ac.signal.aborted) throw new BoardCancelled();
        setProgress({ phase: 2, label: NODE_PHASE[2], done: i, total: handles.length });
        urls.set(path, await handle.promise);
      }

      /* 3/4 + 4/4 — chụp từng ô rồi ghi clipboard trong CÙNG một cử chỉ người dùng. */
      setProgress({ phase: 3, label: NODE_PHASE[3], done: 0, total: cells.length });
      const res = await copyKitDoc(cells, urls, (done, total) => {
        setProgress({ phase: 3, label: NODE_PHASE[3], done, total });
      });
      setProgress({ phase: 4, label: NODE_PHASE[4], done: 1, total: 1 });

      const names = batch.map((g) => g.label).join(", ");
      const more = batchAt + 1 < batches.length;
      setBatchAt(more ? batchAt + 1 : 0);
      toastSuccess(
        more ? `Đã copy nhóm ${names}` : "Đã copy sang Figma",
        `${res.docs} node · ${Math.round(res.bytes / 1024 / 1024)} MB · ảnh giữ nguyên pixel gốc. Dán bằng Ctrl/Cmd+V`
        + (more ? `, rồi bấm lại nút này để lấy nhóm tiếp theo (${batches.length - batchAt - 1} đợt nữa).` : "."),
      );
      flashDone();
    } catch (err) {
      if (err instanceof BoardCancelled || ac.signal.aborted) return;
      try {
        await copyBitmap(err instanceof Error ? err.message : String(err), ac.signal);
      } catch (fallbackErr) {
        if (!(fallbackErr instanceof BoardCancelled)) toastError(fallbackErr, {});
      }
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const busy = progress !== null;
  const label = batchAt > 0 && batchAt < batches.length
    ? `Copy nhóm tiếp theo (${batchAt + 1}/${batches.length})`
    : "Copy sang Figma";
  return (
    <Button
      variant="secondary"
      disabled={!ready || busy}
      title={ready
        ? `Copy ${files.length} ảnh thành node Figma (mỗi ô một frame safe zone, ảnh giữ pixel gốc) — không tiêu lượt tạo nào`
        : "Mở sau khi dự án có ảnh đã cắt"}
      onClick={() => void onClick()}
    >
      {busy ? <Loader2 aria-hidden className="animate-spin" />
        : done ? <Check aria-hidden />
          : <Copy aria-hidden />}
      {busy ? `${progress.label} ${progress.total ? `${progress.done}/${progress.total}` : ""}`.trim()
        /* Còn đợt sau ⇒ KHÔNG nói "đã copy xong" trơn: nhãn `label` đang mời bấm tiếp,
           và hai câu ngược nhau trên cùng một nút là cách chắc chắn nhất để mất đợt cuối. */
        : done && batchAt === 0 ? "Đã copy · dán bằng Ctrl/Cmd+V"
          : label}
    </Button>
  );
}
