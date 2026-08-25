import * as React from "react";
import { AlertTriangle, Copy, Image as ImageIcon, Layers, MoreHorizontal, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FOCUS } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
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

/**
 * ══ CỜ QA "LỆCH BỘ KHUNG" — ĐỌC Ở ĐÂY, KHÔNG PHẢI CHỈ Ở TAB PHỤ ═════════════
 *
 * `slice.py` đo từng ô rồi ghi `sizeDeviation.flagged` khi cạnh lệch quá ngưỡng
 * (mặc định 15px); agent chuyển tiếp nguyên vẹn ở `#42 GET …/kit`. Trước bản này
 * webapp **vứt số đo ở tầng schema**, nên tab "Ảnh thật" — tab MẶC ĐỊNH, và cũng là
 * nguồn của [Tải .zip] / [Copy sang Figma] — im lặng hoàn toàn khi engine đã tự chấm
 * `validation.ok:false`. Ba người test mù độc lập đều xuất ảnh lỗi mà không hay.
 *
 * Ở đây CHỈ báo, không thêm nút vẽ lại: đường tạo lại đã có đúng MỘT chỗ (tab "Ảnh
 * gốc" → [Tạo lại nhóm]), và mở thêm một cửa nữa là mở thêm một đường đốt quota.
 */
export function deviationOf(asset: CutAsset): { maxEdgePx: number; threshold?: number } | null {
  const dev = asset.file.sizeDeviation;
  if (!dev?.flagged || typeof dev.maxEdgePx !== "number") return null;
  return { maxEdgePx: Math.round(Math.abs(dev.maxEdgePx)), threshold: dev.threshold };
}

/** Ô bị gắn cờ trong tập ĐANG HIỆN — con số trên dải cảnh báo phải đếm đúng thứ mắt thấy. */
export function flaggedAssets(assets: readonly CutAsset[]): CutAsset[] {
  return assets.filter((asset) => deviationOf(asset) !== null);
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

export function CutAssetGrid({ projectId, contract, category = "all", exclude, sectioned = false }: {
  projectId: string;
  contract: Contract | null;
  category?: ResultGroup;
  /**
   * Nhóm bị LOẠI khỏi khung nhìn — đối xứng với `exclude` của `RawSheetsPanel`, và có
   * mặt vì cùng một lý do: trang **UI Elements** cần đúng "mọi thành phẩm TRỪ mascot",
   * còn mascot đã có trang riêng. Không có prop này thì `category="all"` kéo cả mascot
   * sang, tạo hai lối vào cho cùng một thứ.
   */
  exclude?: ResultCategory;
  /**
   * true ⇒ chia thêm một tầng KHỐI THEO NHÓM (Mascot · Nền · Popup · UI nhỏ · Đạo cụ),
   * mỗi khối có tiêu đề và `id` để `?group=` cũ cuộn tới. Đây là hình dạng thay cho hàng
   * chip lọc vừa bị bỏ: cuộn xuống là thấy hết, không nhóm nào bị giấu sau một cú bấm.
   */
  sectioned?: boolean;
}) {
  const kit = useKit(projectId);
  const assets = React.useMemo(
    () => cutAssets(kit.data?.files ?? [], contract)
      .filter((a) => category === "all" || a.category === category)
      .filter((a) => a.category !== exclude),
    [category, exclude, contract, kit.data?.files],
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

  const flagged = flaggedAssets(assets);
  /* Tổng của CẢ bộ kit (`manifest.qa`, agent trả ở `#42`). Khi khung nhìn đang lọc theo
     nhóm, con số này lớn hơn số ô thấy được — và người dùng phải biết là còn ô khác. */
  const kitQa = kit.data?.qa?.sizeDeviation;

  if (!sectioned) return (
    <div className="space-y-4">
      <QaDeviationBanner assets={flagged} kitTotal={kitQa?.flaggedCount} />
      <SheetBlocks projectId={projectId} variant={variant} contract={contract} assets={assets} showHeading />
    </div>
  );

  return (
    <div className="space-y-8">
      <QaDeviationBanner assets={flagged} kitTotal={kitQa?.flaggedCount} />
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

/**
 * DẢI CẢNH BÁO ĐẦU TAB "ẢNH THẬT".
 *
 * Nói ba thứ và dừng: bao nhiêu ô, lệch tới đâu, và đi đâu để vẽ lại. KHÔNG có nút
 * ở đây — nút vẽ lại nằm ở tab "Ảnh gốc" và nó tiêu lượt, nên nó phải ở đúng một chỗ.
 */
function QaDeviationBanner({ assets, kitTotal }: {
  assets: readonly CutAsset[];
  /** `manifest.qa.sizeDeviation.flaggedCount` — số ô bị gắn cờ trên CẢ bộ kit. */
  kitTotal?: number;
}) {
  if (assets.length === 0) return null;
  const devs = assets.map(deviationOf).filter((d): d is { maxEdgePx: number; threshold?: number } => d !== null);
  const worst = Math.max(...devs.map((d) => d.maxEdgePx));
  const threshold = devs.find((d) => typeof d.threshold === "number")?.threshold;
  const hidden = typeof kitTotal === "number" && kitTotal > assets.length ? kitTotal - assets.length : 0;
  return (
    <div role="status" className="flex gap-3 rounded-3 border border-warn/60 kg-tint-warn p-4 text-on-tint-warn">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-label">
          {assets.length} ảnh lệch bộ khung
          {/* Trang dự án lọc theo nhóm ⇒ ô bị gắn cờ ở nhóm khác không hiện ra đây.
              Im lặng về chúng là để người dùng tin nhầm rằng đã xem hết chỗ hỏng. */}
          {hidden > 0 ? ` ở đây · còn ${hidden} ô nữa ở nhóm khác` : ""}
        </p>
        <p className="mt-1 text-caption">
          Máy đo được cạnh lệch tới {worst}px{typeof threshold === "number" ? ` (ngưỡng ${threshold}px)` : ""} so với ô trong bản thiết kế.
          {" "}Ảnh vẫn tải và copy được, nhưng ghép vào bố cục sẽ không khớp ô.
          {" "}Muốn vẽ lại thì sang tab «Ảnh gốc» — nút [Tạo lại nhóm] ở đó, và nó tiêu lượt tạo.
        </p>
      </div>
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
  const [zoom, setZoom] = React.useState(false);
  const name = asset.name;

  /**
   * ⚠️ VẬT LIỆU PHÁT SÁNG: PAYLOAD ĐÃ CHỞ BLEND, NHƯNG CHƯA AI THẤY FIGMA NHẬN.
   *
   * Manifest ghi `blend:"screen"` cho ô `matte:"glow"` (slice.py, P1-3) và web preview
   * đọc được nó. Backlog #19 đã ĐO (14/08): `figma-node.ts` đặt `mix-blend-mode:screen`
   * lên `<img>` sân khấu thì khối `figh2d` mang theo `"mixBlendMode":"screen"` — tức
   * **bên GỬI đã làm hết phần mình**. Nhưng bên NHẬN là trình phân tích H2D trong Figma
   * desktop; không ai đọc được mã của nó, và chưa ai dán thử một ô glow rồi soi layer.
   *
   * ⇒ TOAST NÀY Ở LẠI cho tới khi chủ sản phẩm dán thật và xác nhận layer lên đúng
   * blend mode. Bỏ nhắc dựa trên suy đoán "chắc Figma đọc" là đúng kiểu hỏng mà P0-2
   * và P1-3 vừa cứu về: quầng sáng bị nền nuốt, còn designer thì không được báo gì.
   * Đường lùi bitmap thì chắc chắn phẳng, nên ở nhánh đó nhắc lại càng đúng.
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

  /* Cờ QA của ĐÚNG ô này — viền đổi màu để thấy từ xa, chi tiết nằm ở chân thẻ. */
  const deviation = deviationOf(asset);

  return (
    <article className={cn(
      "overflow-hidden rounded-3 border bg-raised",
      deviation ? "border-warn/60" : "border-line-subtle",
    )}>
      {/* Ô LƯỚI giữ nguyên bản `?w=256` (§6.5-5) — đúng cỡ cho một ô ~230px và là lý do
          mở kit 500 ảnh không nuốt hết RAM. Cái THIẾU trước đây là đường tới ảnh GỐC:
          `features/kit/components/Lightbox.tsx` có sẵn từ S5 nhưng KHÔNG được màn nào
          gọi (`KitScreen` không nằm trong `routeTree`), nên trong app đang chạy không có
          một chỗ nào xem ảnh ở độ nét thật. Bấm vào ô là đường đó. */}
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label={`Xem ảnh gốc ${name}`}
        className={cn("block w-full", FOCUS)}
      >
        <KitImage
          projectId={projectId}
          path={asset.file.path}
          alt={`${sheetLabel(asset.sheet)} · ${name}`}
          backdrop="checker"
          /* Ô phát sáng tự đổi sang nền đo tối + `mix-blend-mode` — xem `lib/blend.ts`. */
          blend={asset.file.blend}
          className="aspect-square rounded-none border-0"
        />
      </button>
      <AssetZoomDialog
        open={zoom}
        onOpenChange={setZoom}
        projectId={projectId}
        asset={asset}
      />
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg-strong" title={name}>{name}</p>
          {deviation ? (
            /* Chip trên nền ĐẶC của chân thẻ, không đè lên ảnh: nền ô là bàn cờ trong
               suốt nên chữ đặt lên đó không giữ được độ tương phản ở mọi ảnh. */
            <span
              className="mt-1 inline-flex items-center gap-1 rounded-1 kg-tint-warn px-1.5 py-0.5 text-caption text-on-tint-warn"
              title={`Cạnh lệch ${deviation.maxEdgePx}px so với ô trong bản thiết kế`
                + (typeof deviation.threshold === "number" ? ` · ngưỡng ${deviation.threshold}px` : "")
                + ". Xem tab «Ảnh gốc» để tạo lại."}
            >
              <AlertTriangle className="size-3 shrink-0" aria-hidden />
              Lệch bộ khung {deviation.maxEdgePx}px
            </span>
          ) : (
            <p className="truncate text-caption text-fg-muted">
              {asset.file.w && asset.file.h ? `${asset.file.w}×${asset.file.h}` : "Ô đã cắt"}
            </p>
          )}
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

/**
 * XEM ẢNH GỐC — popup chi tiết cho một ô đã cắt.
 *
 * ╔══ VÌ SAO PHẢI CÓ, VÀ VÌ SAO PHẢI LÀ `full` ═══════════════════════════════╗
 * ║ Mọi ô trong app đang chạy đều vẽ bằng bản `?w=256` (`KitImage` mặc định).   ║
 * ║ Đúng cho lưới, nhưng KHÔNG có cửa nào ra ảnh thật: `Lightbox` của S5 chưa   ║
 * ║ được màn nào gọi. Người dùng vì thế chỉ có một cỡ duy nhất để soi — đúng    ║
 * ║ triệu chứng "ảnh preview trong app cũng bé tí".                            ║
 * ║ `full` ⇒ `loadImage(…, null)` ⇒ URL KHÔNG kèm `?w=` ⇒ agent phục vụ file    ║
 * ║ PNG gốc (`agent/routes/files.mjs:34-36` chỉ resize khi có `w`).             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `eager`: dialog chỉ tồn tại khi đã mở, nên chờ `IntersectionObserver` là chờ vô ích.
 */
function AssetZoomDialog({ open, onOpenChange, projectId, asset }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  asset: CutAsset;
}) {
  const size = asset.file.w && asset.file.h ? `${asset.file.w}×${asset.file.h} pixel` : "chưa rõ cỡ";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="!max-h-[min(90dvh,720px)]">
        <DialogHeader>
          <DialogTitle className="font-mono text-subtitle">{asset.name}</DialogTitle>
          <DialogDescription>
            Ảnh gốc {size}
            {asset.sheet ? ` · ${sheetLabel(asset.sheet)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* `DialogBody` là ổ cuộn DUY NHẤT. Khung ảnh có chiều cao cố định theo
              viewport để ảnh dọc/ngang dùng `object-contain` xem trọn mặc định; ở màn
              cực thấp, chính body (đã được Radix khóa nền) là vùng cuộn duy nhất. */}
          <div
            data-testid="asset-preview-frame"
            className="flex h-[min(70dvh,calc(100dvh-10rem))] w-full items-center justify-center rounded-2 border border-line-subtle bg-surface p-3"
          >
            {open && (
              <KitImage
                projectId={projectId}
                path={asset.file.path}
                alt={`${asset.name} — ảnh gốc`}
                backdrop="checker"
                blend={asset.file.blend}
                full
                eager
                empty={asset.file.empty}
                className="h-full w-full border-0"
              />
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
