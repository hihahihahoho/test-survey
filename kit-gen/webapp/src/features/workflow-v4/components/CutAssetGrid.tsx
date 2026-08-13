import * as React from "react";
import { Copy, Image as ImageIcon, Layers, MoreHorizontal, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KitImage } from "@/features/kit/components/KitImage";
import { loadFull } from "@/features/kit/lib/image-source";
import { buildFigmaBoard, BoardCancelled } from "@/features/kit/lib/figma-board";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";
import type { Contract, KitFile } from "@/lib/types";
import { useKit } from "@/lib/hooks";
import {
  categoryOfSheet, groupLabel, sheetLabel,
  type ResultCategory, type ResultGroup,
} from "../lib/generated-results";
import { blobOfImage, copyImageBlob, cropCellBlob, locateComponent, rawSheetPath } from "../lib/result-copy";

/**
 * ══ TAB "ẢNH THẬT" — Ô ĐÃ CẮT, KHÔNG PHẢI SHEET THÔ ═════════════════════════
 *
 * PRODUCT-SITEMAP §12: chroma và lưới **phải** bị loại bằng hậu xử lý deterministic
 * (`slice.py`), và thứ người dùng nhận là image asset của từng ô. Bản cũ của màn
 * "Ảnh đã tạo" hiện `raw/<job>.png` — nguyên sheet nền magenta với vài hình bé tí
 * bên trong. Đó là ảnh trung gian của pipeline, không phải sản phẩm.
 *
 * Nguồn ở đây là `#42 GET /api/projects/:id/kit` = `kits/manifest.json` do `slice.py`
 * ghi, tức là đúng những ô đã cắt (`kits/<variant>/<file>.png`, và `tight/` cho bản
 * ôm sát). Sheet thô vẫn xem được — ở tab "Ảnh gốc" bên cạnh.
 */

export interface CutAsset {
  file: KitFile;
  /** Tên ô, đã bỏ tiền tố thư mục (`tight/01-btn` → `01-btn`). */
  name: string;
  sheet: string;
  category: ResultCategory;
}

const stemOf = (file: string): string => file.slice(file.lastIndexOf("/") + 1);
const isTight = (file: KitFile): boolean => file.file.startsWith("tight/");

/**
 * Danh sách ô đã cắt để hiện lên lưới.
 *
 * Hai việc, đều bắt buộc:
 *  ① **Ưu tiên `kits/<variant>/tight/`** — `slice.py:950-953` ghi hai bản cho mỗi ô:
 *    bản canvas (còn đệm bleed trong suốt) và bản `tight/` ôm sát ruột. Lưới kết quả
 *    phải hiện bản ôm sát, đúng lời brief; giữ cả hai thì mỗi ô hiện HAI LẦN.
 *  ② **Sheet của ô**: `file.sheet` do agent trả (đối chiếu `kits/manifest.json`), và
 *    contract là đường lùi cho agent đời cũ. Không có sheet thì ô rơi vào "Khác" —
 *    hiện ra chứ không nuốt.
 */
export function cutAssets(files: readonly KitFile[], contract: Contract | null): CutAsset[] {
  const usable = files.filter((file) => !file.empty && !stemOf(file.file).startsWith("_empty"));
  const tightNames = new Set(usable.filter(isTight).map((file) => stemOf(file.file)));
  return usable
    .filter((file) => isTight(file) || !tightNames.has(stemOf(file.file)))
    .map((file) => {
      const name = stemOf(file.file);
      const sheet = file.sheet
        ?? (contract ? locateComponent(contract, name)?.sheet.id : undefined)
        ?? "";
      return { file, name, sheet, category: categoryOfSheet(sheet) };
    });
}

export function CutAssetGrid({ projectId, contract, category = "all" }: {
  projectId: string;
  contract: Contract | null;
  category?: ResultGroup;
}) {
  const kit = useKit(projectId);
  const assets = React.useMemo(
    () => cutAssets(kit.data?.files ?? [], contract).filter((a) => category === "all" || a.category === category),
    [category, contract, kit.data?.files],
  );
  const variant = kit.data?.variant ?? "";

  const bySheet = React.useMemo(() => {
    const map = new Map<string, CutAsset[]>();
    for (const asset of assets) {
      const bucket = map.get(asset.sheet);
      if (bucket) bucket.push(asset);
      else map.set(asset.sheet, [asset]);
    }
    return [...map.entries()];
  }, [assets]);

  if (kit.isLoading) return <p className="text-body text-fg-muted">Đang mở ảnh đã cắt…</p>;
  if (assets.length === 0) {
    return (
      <div className="rounded-4 border border-dashed border-line-subtle bg-surface p-8 text-center">
        <Scissors className="mx-auto size-6 text-fg-muted" aria-hidden />
        <p className="mt-3 text-label text-fg-strong">Chưa có ô nào được cắt</p>
        <p className="mt-1 text-body text-fg-muted">
          Ảnh từng ô xuất hiện sau khi lượt tạo chạy xong bước cắt. Sheet gốc xem ở tab «Ảnh gốc».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bySheet.map(([sheet, items]) => (
        <section key={sheet || "khac"} className="rounded-4 border border-line-subtle bg-surface p-4" aria-label={sheetLabel(sheet)}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-label text-fg-strong">{sheet ? sheetLabel(sheet) : groupLabel("other")}</h4>
            <span className="text-caption text-fg-muted">{items.length} ô</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((asset) => (
              <CutAssetCard key={asset.file.path} projectId={projectId} variant={variant} asset={asset} contract={contract} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CutAssetCard({ projectId, variant, asset, contract }: {
  projectId: string;
  variant: string;
  asset: CutAsset;
  contract: Contract | null;
}) {
  const [busy, setBusy] = React.useState(false);
  const name = asset.name;

  const run = async (label: string, make: () => Promise<Blob>) => {
    setBusy(true);
    try {
      const blob = await make();
      const res = await copyImageBlob(blob, `${name}.png`);
      if (res.outcome === "clipboard") toastSuccess(`Đã copy ${label}`, name);
      else toastInfo("Trình duyệt không cho copy ảnh", `Đã tải ${name}.png về máy.${res.reason ? ` (${res.reason})` : ""}`);
    } catch (err) {
      toastError(err, {});
    } finally {
      setBusy(false);
    }
  };

  /* Copy ảnh ĐÃ CẮT — object URL nội bộ rồi vẽ lại qua canvas để giữ alpha. */
  const copyCut = () => void run("ảnh đã cắt", async () => blobOfImage(await loadFull(projectId, asset.file.path).promise));

  /**
   * Copy ô GỐC chưa tách nền: cắt đúng ô đó ra khỏi `raw/<variant>-<sheet>.png` bằng
   * lưới của contract. Không định vị được (contract lệch, sheet lạ) thì copy nguyên
   * sheet và NÓI RÕ — không im lặng đưa nhầm ảnh.
   */
  const copyRaw = () => void run("ảnh gốc", async () => {
    const sheetId = asset.sheet || null;
    const hit = contract ? locateComponent(contract, name, sheetId) : null;
    const id = hit?.sheet.id ?? sheetId;
    if (!id) throw new Error("Không tìm được sheet gốc của ô này.");
    const url = await loadFull(projectId, rawSheetPath(variant, id)).promise;
    if (!hit) {
      toastInfo("Chưa xác định được vị trí ô", "Đã dùng nguyên sheet gốc thay cho một ô.");
      return blobOfImage(url);
    }
    return cropCellBlob(url, hit.sheet.grid, hit.index);
  });

  /**
   * Copy sang Figma cho MỘT ô. Dùng đúng `buildFigmaBoard` của `features/kit` — giới
   * hạn của nó vẫn nguyên: kết quả dán vào Figma là MỘT image bitmap (kèm nhãn tên),
   * chưa phải node `figh2d` nhiều lớp. Bảng một ô là cách dùng hợp lệ, không phải bản
   * rút gọn tạm bợ.
   */
  const copyFigma = () => {
    setBusy(true);
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await buildFigmaBoard({
          projectId,
          files: [asset.file],
          poseFiles: new Set(asset.category === "mascot" ? [name] : []),
          variantLabel: name,
          onProgress: () => {},
          signal: ac.signal,
        });
        if (res.outcome === "clipboard") toastSuccess("Đã copy sang Figma", `${name} · dán bằng Ctrl/Cmd+V.`);
        else toastInfo("Trình duyệt không cho copy ảnh", `Đã tải ảnh về máy để bạn kéo vào Figma.${res.fallbackReason ? ` (${res.fallbackReason})` : ""}`);
      } catch (err) {
        if (!(err instanceof BoardCancelled)) toastError(err, {});
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <article className="overflow-hidden rounded-3 border border-line-subtle bg-raised">
      <KitImage
        projectId={projectId}
        path={asset.file.path}
        alt={`${sheetLabel(asset.sheet)} · ${name}`}
        backdrop="checker"
        className="aspect-square rounded-none border-0"
      />
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg-strong" title={name}>{name}</p>
          <p className="truncate text-caption text-fg-muted">
            {asset.file.w && asset.file.h ? `${asset.file.w}×${asset.file.h}` : "Ô đã cắt"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Thao tác khác cho ${name}`}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={copyFigma}><Layers aria-hidden />Copy to Figma</DropdownMenuItem>
            <DropdownMenuItem onSelect={copyCut}><Copy aria-hidden />Copy ảnh</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={copyRaw}><ImageIcon aria-hidden />Copy ảnh gốc chưa tách nền</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
