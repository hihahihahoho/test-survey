import * as React from "react";
import { AlertTriangle, Download, Layers, Loader2, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KitImage } from "@/features/kit/components/KitImage";
import { loadFull } from "@/features/kit/lib/image-source";
import { saveProjectFile } from "@/features/kit/lib/download";
import { copyAssetAsFigmaNode } from "@/features/kit-core/lib/figma-node";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import type { KitFile } from "@/lib/types";
import { cellName } from "../../lib/result/sheet-files";
import { fileMtime } from "@/features/kit/lib/kit-model";

/**
 * TAB «ĐÃ CROP» — lưới ô đã cắt CỦA ĐÚNG TẤM NÀY.
 *
 * ╔══ TẠI SAO LƯỚI CÓ THỂ TRỐNG MÀ KHÔNG PHẢI LỖI ═══════════════════════════╗
 * ║ Engine bắn HAI sự kiện cho một tấm, cách nhau cả chục giây:               ║
 * ║   · `sheet.image` — ảnh raw vừa ghi xong, ĐỌC ĐƯỢC NGAY. Kho kit CHƯA đổi. ║
 * ║   · `sheet.ready` — đã cắt xong, giờ `kits/manifest.json` mới có ô mới.    ║
 * ║ Giữa hai mốc đó tab này trống một cách hoàn toàn bình thường. Nói "chưa có ║
 * ║ ô nào" lúc ấy là nói sai; phải nói "đang cắt". Cờ `cutting` do panel cha    ║
 * ║ truyền xuống chính là khoảng giữa ấy.                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG tự dựng pipeline tách element nào ở đây: ô đã cắt là sản phẩm của
 * `slice.py`, webapp chỉ đọc `#42 GET /api/projects/:id/kit` và bày ra.
 */
export interface SheetCellGridProps {
  projectId: string;
  /** Ô đã lọc sẵn theo tấm (xem `lib/result/sheet-files.ts:cellsOfSheet`). */
  cells: readonly KitFile[];
  /** true ⇒ lượt chạy đã ghi ảnh raw nhưng chưa tới `sheet.ready`. */
  cutting?: boolean;
  /** true ⇒ `#42` còn đang tải; khác hẳn "cắt xong mà không có ô nào". */
  loading?: boolean;
  /** Ô nhân vật xuất 1:1 (`contract` → `poseFileSet`); rỗng ⇒ đoán theo tên file. */
  poseFiles?: ReadonlySet<string>;
  className?: string;
}

const NO_POSE: ReadonlySet<string> = new Set<string>();

export function SheetCellGrid({
  projectId, cells, cutting = false, loading = false, poseFiles = NO_POSE, className,
}: SheetCellGridProps) {
  if (loading) {
    return (
      <p className={cn("flex items-center gap-2 text-body text-fg-muted", className)}>
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Đang mở kho ô đã cắt…
      </p>
    );
  }

  if (cells.length === 0) {
    return (
      <div className={cn("rounded-3 border border-dashed border-line-subtle bg-surface p-6 text-center", className)}>
        <Scissors className="mx-auto size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
        <p className="mt-2 text-label text-fg-strong">
          {cutting ? "Đang cắt…" : "Chưa có ô nào được cắt"}
        </p>
        <p className="mt-1 text-caption text-fg-muted">
          {cutting
            ? "Ảnh gốc đã có (xem tab «Ảnh gốc»); ô đã crop hiện ra ngay khi bước cắt xong."
            : "Ô đã crop xuất hiện sau khi lượt tạo chạy xong bước cắt của tấm này."}
        </p>
      </div>
    );
  }

  /* TẤM KHÔNG CÓ NỀN TRONG SUỐT — phải nói ra, không được để người dùng tự đoán.
     `slice.py` KHÔNG còn từ chối cắt tấm đục (từ chối là giữ ảnh của người dùng làm
     con tin) và tuyệt đối KHÔNG tự chế alpha — đoán đâu là nền chính là cỗ máy tách
     nền vừa bị bỏ, và đoán sai thì nó gặm vào giữa hình. Nên ô vẫn ra file, và chỗ
     duy nhất còn có thể nói sự thật là đây. Kit cắt bằng bản slice.py cũ không có
     khoá `mode` ⇒ im lặng đúng như trước. */
  const duc = cells.some((cell) => cell.mode === "rgb");

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {duc && (
        <p className="flex items-start gap-2 rounded-3 border border-dashed border-line p-3 text-caption text-on-tint-warn">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            <strong>Tấm này không có nền trong suốt.</strong> Máy vẽ trả ảnh đục, nên ô cắt ra
            mang theo cả nền. Bước cắt không tự tách nền hộ (tách bằng máy là gặm vào hình) —
            hãy tạo lại tấm này.
          </span>
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cells.map((cell) => (
          <CellCard key={cell.path} projectId={projectId} cell={cell} poseFiles={poseFiles} />
        ))}
      </ul>
    </div>
  );
}

/**
 * MỘT Ô + hai thao tác hiện khi rê chuột.
 *
 * Lớp phủ dùng `opacity` + `focus-within` chứ không phải `hidden`: ẩn hẳn bằng
 * `display:none` thì bàn phím không tab tới được hai cái nút, tức là tính năng chỉ
 * tồn tại cho người dùng chuột.
 */
function CellCard({ projectId, cell, poseFiles }: {
  projectId: string;
  cell: KitFile;
  poseFiles: ReadonlySet<string>;
}) {
  const [busy, setBusy] = React.useState(false);
  const name = cellName(cell);

  /**
   * Copy MỘT Ô → node Figma thật. Dùng NGUYÊN `copyAssetAsFigmaNode` của
   * `kit-core/lib/figma-node.ts` — hàm đã được 4 bộ test khoá và đã dán thử thật
   * ra Figma desktop. Không chép lại số học safe zone sang đây: hai bản số sẽ trôi
   * khỏi nhau, và cái trôi sai là cái không ai đo lại.
   */
  const copyFigma = () => {
    setBusy(true);
    void (async () => {
      try {
        const url = await loadFull(projectId, cell.path).promise;
        const spec = await copyAssetAsFigmaNode(cell, url, { name, poseFiles });
        /* Số đo rút ra TRƯỚC khi ghép câu — cùng cách với `OnePrompt` (`CanvasBlock.tsx:300`).
           Cổng từ cấm §5.4 quét cả biểu thức trong chuỗi mẫu, nên `spec.frame.w` giữa một câu
           tiếng Việt bị đọc là chữ «frame» hiện ra UI; và nó nói đúng — câu này người dùng đọc,
           nên gọi bằng tiếng Việt: «khung an toàn». */
        const w = Math.round(spec.frame.w);
        const h = Math.round(spec.frame.h);
        toastSuccess(
          "Đã copy sang Figma",
          `${name} · khung an toàn ${w}×${h}. Dán bằng Ctrl/Cmd+V.`,
        );
      } catch (err) {
        /* KHÔNG có đường lùi bitmap cho MỘT ô (đường lùi ấy chỉ có ở nút "copy cả
           bảng" của `features/kit/components/KitExits`). Nên tuyệt đối không báo
           "đã copy" — nói thẳng là hỏng và vì sao. */
        toastError(err, {});
      } finally {
        setBusy(false);
      }
    })();
  };

  const download = () => {
    setBusy(true);
    void saveProjectFile(projectId, cell.path)
      .then((saved) => toastSuccess("Đã tải ô về máy", saved.fileName))
      .catch((err: unknown) => toastError(err, {}))
      .finally(() => setBusy(false));
  };

  return (
    <li className="group relative overflow-hidden rounded-3 border border-line-subtle bg-raised">
      <KitImage
        projectId={projectId}
        path={cell.path}
        alt={name}
        full={false}
        width={256}
        /* Ô cắt lại GIỮ NGUYÊN đường dẫn, chỉ `mtime` đổi. Không truyền nó xuống thì
           lượt cắt mới hiện lại đúng ảnh cũ cho tới khi F5 (lỗi 07/09/2026). */
        version={fileMtime(cell)}
        className="aspect-square rounded-none border-0"
      />
      <div className="flex items-center gap-1 p-2">
        <p className="min-w-0 flex-1 truncate text-caption text-fg" title={name}>{name}</p>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-within:opacity-100">
          <Button
            type="button" variant="ghost" size="icon-sm" disabled={busy}
            aria-label={`Copy ${name} sang Figma`} onClick={copyFigma}
          >
            <Layers aria-hidden strokeWidth={1.5} />
          </Button>
          <Button
            type="button" variant="ghost" size="icon-sm" disabled={busy}
            aria-label={`Tải ${name} về máy`} onClick={download}
          >
            <Download aria-hidden strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </li>
  );
}
