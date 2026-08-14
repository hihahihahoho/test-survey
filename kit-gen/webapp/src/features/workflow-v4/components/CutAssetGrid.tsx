import * as React from "react";
import { Copy, Image as ImageIcon, Layers, MoreHorizontal, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KitImage } from "@/features/kit/components/KitImage";
import { GLOW_FIGMA_HINT, isGlowAsset } from "@/features/kit/lib/blend";
import { loadFull } from "@/features/kit/lib/image-source";
import { buildFigmaBoard, BoardCancelled } from "@/features/kit/lib/figma-board";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";
import type { Contract, KitFile } from "@/lib/types";
import { useKit } from "@/lib/hooks";
import {
  categoryOfSheet, groupAnchorId, groupLabel, sheetLabel, RESULT_GROUP_ORDER,
  type ResultCategory, type ResultGroup,
} from "../lib/generated-results";
import { blobOfImage, copyImageBlob, cropCellBlob, locateComponent, rawSheetPath } from "../lib/result-copy";
import { copyAssetAsFigmaNode } from "../lib/figma-node";

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

/** Gom theo sheet, giữ nguyên thứ tự gặp — đây là đơn vị nhỏ nhất của lưới. */
function bySheetOf(assets: readonly CutAsset[]): [string, CutAsset[]][] {
  const map = new Map<string, CutAsset[]>();
  for (const asset of assets) {
    const bucket = map.get(asset.sheet);
    if (bucket) bucket.push(asset);
    else map.set(asset.sheet, [asset]);
  }
  return [...map.entries()];
}

export function CutAssetGrid({ projectId, contract, category = "all", sectioned = false }: {
  projectId: string;
  contract: Contract | null;
  category?: ResultGroup;
  /**
   * true ⇒ chia thêm một tầng KHỐI THEO NHÓM (Mascot · Nền · Popup · UI nhỏ · Đạo cụ),
   * mỗi khối có tiêu đề và `id` để `?group=` cũ cuộn tới. Đây là hình dạng thay cho hàng
   * chip lọc vừa bị bỏ: cuộn xuống là thấy hết, không nhóm nào bị giấu sau một cú bấm.
   */
  sectioned?: boolean;
}) {
  const kit = useKit(projectId);
  const assets = React.useMemo(
    () => cutAssets(kit.data?.files ?? [], contract).filter((a) => category === "all" || a.category === category),
    [category, contract, kit.data?.files],
  );
  const variant = kit.data?.variant ?? "";

  /** Khối theo nhóm, đúng thứ tự cuộn; nhóm rỗng bị bỏ hẳn thay vì để lại ô trống. */
  const byGroup = React.useMemo(
    () => RESULT_GROUP_ORDER
      .map((group) => [group, assets.filter((asset) => asset.category === group)] as const)
      .filter(([, items]) => items.length > 0),
    [assets],
  );

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

  if (!sectioned) return <SheetBlocks projectId={projectId} variant={variant} contract={contract} assets={assets} showHeading />;

  return (
    <div className="space-y-8">
      {byGroup.map(([group, items]) => (
        /* KHÔNG đặt `aria-label` ở đây: `groupLabel("mascot")` là "Mascot pose", trùng
           đúng `sheetLabel` của tấm pose bên trong ⇒ hai landmark cùng tên lồng nhau.
           Tiêu đề `<h3>` đã nói đủ, và `<section>` không tên thì không phải landmark. */
        <section key={group} id={groupAnchorId(group)} className="scroll-mt-20 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-subtle pb-2">
            <h3 className="text-subtitle text-fg-strong">{groupLabel(group)}</h3>
            <span className="text-caption text-fg-muted">{items.length} ô</span>
          </div>
          {/* Nhóm chỉ có MỘT tấm ⇒ bỏ tiêu đề tấm: `sheetLabel("pose-nhan-vat")` và
              `groupLabel("mascot")` đều là "Mascot pose", nên giữ cả hai là in đúng một
              chữ hai lần, cách nhau 12px. Tên tấm vẫn còn trong `aria-label` của vùng. */}
          <SheetBlocks
            projectId={projectId} variant={variant} contract={contract} assets={items}
            showHeading={bySheetOf(items).length > 1}
          />
        </section>
      ))}
    </div>
  );
}

function SheetBlocks({ projectId, variant, contract, assets, showHeading }: {
  projectId: string;
  variant: string;
  contract: Contract | null;
  assets: readonly CutAsset[];
  showHeading: boolean;
}) {
  return (
    <div className="space-y-4">
      {bySheetOf(assets).map(([sheet, items]) => (
        <section key={sheet || "khac"} className="rounded-4 border border-line-subtle bg-surface p-4" aria-label={sheetLabel(sheet)}>
          {showHeading ? (
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="text-label text-fg-strong">{sheet ? sheetLabel(sheet) : groupLabel("other")}</h4>
              <span className="text-caption text-fg-muted">{items.length} ô</span>
            </div>
          ) : null}
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

  /**
   * ⚠️ VẬT LIỆU PHÁT SÁNG KHÔNG QUA ĐƯỢC BỘ NHỚ TẠM.
   *
   * Manifest ghi `blend:"screen"` cho ô `matte:"glow"` (slice.py, P1-3) và web preview
   * đọc được nó, nhưng payload clipboard của Figma thì KHÔNG mang blend mode: encoder
   * `@/vendor/figma-h2d` chỉ dựng frame + image từ DOM (`figma-node.ts`), và đường lùi
   * bitmap còn phẳng hơn nữa. Dán xong, layer nằm ở Normal ⇒ quầng sáng bị nền nuốt,
   * đúng thứ mà cả P0-2 lẫn P1-3 vừa cứu về. Không tự sửa được thì phải NÓI —
   * im lặng ở đây là để designer tự phát hiện bằng mắt, hoặc không phát hiện.
   */
  const remindGlowBlend = () => {
    if (!isGlowAsset(asset.file)) return;
    toastInfo("Asset phát sáng", GLOW_FIGMA_HINT);
  };

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

  /** Ô mascot xuất 1:1, còn lại 50% — cùng quy ước với `export-scale.ts`. */
  const poseFiles = React.useMemo(
    () => new Set(asset.category === "mascot" ? [asset.file.file] : []),
    [asset.category, asset.file.file],
  );

  /** Đường lùi khi encoder hỏng: bảng một ô ⇒ MỘT bitmap phẳng, đúng như trước P3-14. */
  const copyFigmaBitmap = async (why: string) => {
    const res = await buildFigmaBoard({
      projectId,
      files: [asset.file],
      poseFiles,
      variantLabel: name,
      onProgress: () => {},
      signal: new AbortController().signal,
    });
    const tail = res.outcome === "clipboard"
      ? "Đã copy một ẢNH BITMAP phẳng thay cho node — dán vẫn được, nhưng không có frame safe zone."
      : `Đã tải ảnh về máy để bạn kéo vào Figma.${res.fallbackReason ? ` (${res.fallbackReason})` : ""}`;
    toastInfo("Chưa dựng được node Figma", `${why} ${tail}`);
    remindGlowBlend();
  };

  /**
   * Copy sang Figma cho MỘT ô → **NODE FIGMA THẬT** (P3-14).
   *
   * `figma-node.ts` dựng frame đúng bằng safe zone, ảnh đặt lệch âm theo `contentAt`,
   * clip tắt (handoff §3.3). Encoder là bundle bên thứ ba và clipboard cần quyền, nên
   * MỌI lỗi đều rơi về bảng bitmap cũ — và toast phải NÓI RÕ là đang dùng đường lùi,
   * không được báo "đã copy sang Figma" như thể node đã ra đúng.
   */
  const copyFigma = () => {
    setBusy(true);
    void (async () => {
      try {
        const url = await loadFull(projectId, asset.file.path).promise;
        const spec = await copyAssetAsFigmaNode(asset.file, url, { name, poseFiles });
        toastSuccess(
          "Đã copy sang Figma",
          `${name} · frame ${Math.round(spec.frame.w)}×${Math.round(spec.frame.h)} theo safe zone, `
          + "clip content tắt. Dán bằng Ctrl/Cmd+V.",
        );
        remindGlowBlend();
      } catch (err) {
        try {
          await copyFigmaBitmap(err instanceof Error ? err.message : String(err));
        } catch (fallbackErr) {
          if (!(fallbackErr instanceof BoardCancelled)) toastError(fallbackErr, {});
        }
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
        /* Ô phát sáng tự đổi sang nền đo tối + `mix-blend-mode` — xem `lib/blend.ts`. */
        blend={asset.file.blend}
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
