/**
 * figma-node.ts — "COPY TO FIGMA" RA **NODE FIGMA THẬT**, KHÔNG PHẢI BITMAP TRẦN.
 *
 * ╔══ HỢP ĐỒNG (docs/SPRITESHEET-SAFE-ZONE-HANDOFF.md §3.3) ══════════════════╗
 * ║ • Artwork phải là **image node raster**.                                   ║
 * ║ • Safe zone / hitbox là một **frame riêng**.                               ║
 * ║ • Frame lấy kích thước **từ contract** và `Clip content = off`.            ║
 * ║ • Image đặt theo **offset** để decoration tràn ra ngoài frame.             ║
 * ║ • Không biến image thành frame giả và **không kéo méo image**.             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Nói bằng số — đúng bốn dòng của `figma-export/copy-sprite-images.mjs:41-48`, bản
 * đã dán thử thành công và được ghi lại ở handoff §7.2:
 *
 *     frame.w  = safe.w              × scale
 *     frame.h  = safe.h              × scale
 *     image.x  = (contentAt.x − safe.x) × scale     ← THƯỜNG ÂM
 *     image.y  = (contentAt.y − safe.y) × scale     ← THƯỜNG ÂM
 *     image.w  = <cỡ pixel thật của PNG>  × scale
 *     image.h  = <cỡ pixel thật của PNG>  × scale
 *
 * ┌── VÌ SAO OFFSET ÂM, VÀ VÌ SAO CLIP PHẢI TẮT ─────────────────────────────┐
 * │ `safe` là HITBOX — cái mà layout của app phải căn theo. Ruột đã cắt       │
 * │ (`content`) thường TO HƠN hitbox vì mang theo đổ bóng, viền vàng, hoa lá  │
 * │ (§3.2: "overflow decoration"). Đo trên kit thật `blindtest-a`, ô          │
 * │ `15-reward-giftbox`: safe 737×696 nhưng ruột 787×704 — thừa 50×8 px. Nếu  │
 * │ đặt ảnh ở (0,0) thì hitbox lệch đúng bằng phần thừa đó; nếu bật clip thì  │
 * │ decoration bị cắt cụt. Đặt lệch ÂM + clip OFF là cách duy nhất giữ được   │
 * │ CẢ HAI: layout theo hitbox, mà mắt vẫn thấy đủ hình.                      │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌── HAI BẢN PNG, HAI PHÉP OFFSET KHÁC NHAU ────────────────────────────────┐
 * │ `slice.py:950-953` ghi mỗi ô ra HAI file, và lưới kết quả ưu tiên `tight/`│
 * │ (`CutAssetGrid.cutAssets` ①). Chúng có gốc toạ độ khác nhau:              │
 * │   • `tight/<file>.png` — đúng bằng `content`, gốc đặt tại `contentAt`.    │
 * │   • `<file>.png`       — đúng bằng `canvas`, gốc đặt tại (0, 0).          │
 * │ Đo lại trên đĩa (kit `blindtest-a`, 6 ô, cả hai bản): khớp 12/12. Dùng    │
 * │ nhầm công thức ⇒ ảnh lệch cả trăm px mà KHÔNG có gì báo lỗi. Vì vậy       │
 * │ `geometryOf` đối chiếu `file.w/h` thật với cả hai bộ số trước khi chọn.   │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * KHÔNG hứa quá: encoder (`@/vendor/figma-h2d`) là bundle của bên thứ ba và
 * `navigator.clipboard.write` cần HTTPS/localhost + cử chỉ người dùng. Mọi lỗi ở
 * đây đều ném ra ngoài để `CutAssetGrid` rơi về **đường bitmap cũ** và NÓI RÕ là
 * đang dùng đường lùi — không bao giờ báo "đã copy node" khi chưa copy được.
 */
import type { KitFile } from "@/lib/types";
import { scaleOf } from "@/features/kit/lib/export-scale";
import { loadFigmaH2D, type H2DDocument, type H2DNode } from "@/vendor/figma-h2d";

/* ══════════════════════════════════════════════════════════════════════════
   ① PHẦN THUẦN — số học safe zone. Không chạm DOM ⇒ test được bằng số thật.
   ══════════════════════════════════════════════════════════════════════════ */

/** Ô này chưa có hình học safe zone ⇒ không dựng được node, phải rơi về bitmap. */
export class FigmaNodeUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FigmaNodeUnsupported";
  }
}

/** Bản PNG nào đang được dán: ruột đã cắt sát, hay bản còn đệm bleed. */
export type AssetSource = "tight" | "canvas";

export interface FigmaNodeSpec {
  /** Tên frame trong Figma. */
  name: string;
  /** Frame = ĐÚNG hitbox (safe zone), đã nhân tỉ lệ xuất. */
  frame: { w: number; h: number };
  /** Ảnh raster trong frame; `x`/`y` âm nghĩa là decoration tràn ra ngoài. */
  image: { x: number; y: number; w: number; h: number };
  /** Luôn `false` — §3.3 "Clip content = off". Để kiểu literal cho test khỏi trôi. */
  clipsContent: false;
  source: AssetSource;
  /** Tỉ lệ xuất đã áp cho CẢ frame lẫn ảnh (không bao giờ lệch trục). */
  scale: number;
}

export interface KitMeta {
  /** Tên ô đã bỏ tiền tố thư mục (`tight/01-btn` → `01-btn`). */
  name?: string;
  /** Ô mascot (`skel.shape === "pose"`) xuất 1:1, còn lại 50% — `export-scale.ts`. */
  poseFiles?: ReadonlySet<string>;
  /** Ép tỉ lệ, chỉ dùng khi gọi lại từ test hoặc từ một quy ước xuất khác. */
  scale?: number;
}

const POSE_NONE: ReadonlySet<string> = new Set<string>();

/** `[x, y, w, h]` từ `kits/manifest.json`; thiếu/không đủ bốn số ⇒ `null`. */
function box4(v: readonly number[] | undefined): { x: number; y: number; w: number; h: number } | null {
  if (v === undefined || v.length < 4) return null;
  const [x, y, w, h] = v;
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { x, y, w, h };
}

/** `[w, h]` — kích thước, phải dương. */
function size2(v: readonly number[] | undefined): { w: number; h: number } | null {
  if (v === undefined || v.length < 2) return null;
  const [w, h] = v;
  if (w === undefined || h === undefined) return null;
  if (!(w > 0) || !(h > 0)) return null;
  return { w, h };
}

/**
 * `[x, y]` — TOẠ ĐỘ, nên `0` là giá trị hợp lệ. Không dùng chung `size2` ở đây:
 * `content_at` bằng `[0, y]` xảy ra thật khi ruột chạm mép canvas, mà `size2` lại
 * loại số 0 ⇒ ô đó sẽ âm thầm rơi sang công thức `canvas` và lệch cả trăm px.
 */
function point2(v: readonly number[] | undefined): { x: number; y: number } | null {
  if (v === undefined || v.length < 2) return null;
  const [x, y] = v;
  if (x === undefined || y === undefined) return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/** Tên ô, bỏ tiền tố thư mục. */
export function assetName(asset: KitFile): string {
  const bare = String(asset.file ?? "");
  return bare.slice(bare.lastIndexOf("/") + 1);
}

export interface AssetGeometry {
  source: AssetSource;
  safe: { x: number; y: number; w: number; h: number };
  /** Cỡ pixel THẬT của PNG đang dán. */
  pixels: { w: number; h: number };
  /** Gốc toạ độ của PNG đó trong hệ toạ độ canvas của ô. */
  origin: { x: number; y: number };
}

/**
 * Chọn bộ số đúng cho file đang xét — và CHỈ chọn khi số liệu tự nhất quán.
 *
 * Thứ tự quyết định: cỡ pixel thật (`file.w/h`, do agent đo bằng `imageSize`) là
 * trọng tài; đường dẫn `tight/` chỉ là đường lùi khi agent không đọc được cỡ ảnh.
 * Cỡ thật không khớp bộ nào ⇒ NÉM, vì manifest đang mô tả một ảnh khác (kit gen lại
 * mà manifest cũ, hoặc file bị thay tay). Dán nhầm còn tệ hơn không dán.
 */
export function geometryOf(asset: KitFile): AssetGeometry {
  const name = assetName(asset);
  const safe = box4(asset.safe);
  if (safe === null) {
    throw new FigmaNodeUnsupported(
      `Ô «${name}» chưa có toạ độ safe zone trong kits/manifest.json (kit cắt bằng bản slice.py cũ).`,
    );
  }
  const content = size2(asset.content);
  const contentAt = point2(asset.contentAt);
  const canvas = size2(asset.canvas);

  const tight = content !== null && contentAt !== null
    ? { source: "tight" as const, safe, pixels: content, origin: contentAt }
    : null;
  const full = canvas !== null
    ? { source: "canvas" as const, safe, pixels: canvas, origin: { x: 0, y: 0 } }
    : null;

  const w = typeof asset.w === "number" ? asset.w : null;
  const h = typeof asset.h === "number" ? asset.h : null;
  if (w !== null && h !== null) {
    if (tight !== null && tight.pixels.w === w && tight.pixels.h === h) return tight;
    if (full !== null && full.pixels.w === w && full.pixels.h === h) return full;
    throw new FigmaNodeUnsupported(
      `Ô «${name}» có ảnh ${w}×${h} không khớp số nào trong manifest `
      + `(ruột ${tight ? `${tight.pixels.w}×${tight.pixels.h}` : "—"}, `
      + `canvas ${full ? `${full.pixels.w}×${full.pixels.h}` : "—"}).`,
    );
  }

  // Không đo được cỡ ảnh ⇒ tin đường dẫn: lưới kết quả ưu tiên bản `tight/`.
  const byPath = String(asset.file ?? "").startsWith("tight/") ? tight ?? full : full ?? tight;
  if (byPath === null) {
    throw new FigmaNodeUnsupported(
      `Ô «${name}» thiếu cả cặp content/contentAt lẫn canvas trong manifest.`,
    );
  }
  return byPath;
}

/**
 * Dựng CÂY NODE cho một ô: frame = safe box, ảnh đặt lệch (thường âm), clip tắt.
 * Hàm thuần — mọi con số ở đây kiểm được mà không cần trình duyệt lẫn Figma.
 */
export function buildFigmaNodeForAsset(asset: KitFile, kitMeta: KitMeta = {}): FigmaNodeSpec {
  const geo = geometryOf(asset);
  const scale = kitMeta.scale ?? scaleOf(asset, kitMeta.poseFiles ?? POSE_NONE);
  if (!(scale > 0)) throw new FigmaNodeUnsupported(`Tỉ lệ xuất không hợp lệ: ${scale}`);
  return {
    name: kitMeta.name ?? assetName(asset),
    frame: { w: geo.safe.w * scale, h: geo.safe.h * scale },
    image: {
      x: (geo.origin.x - geo.safe.x) * scale,
      y: (geo.origin.y - geo.safe.y) * scale,
      w: geo.pixels.w * scale,
      h: geo.pixels.h * scale,
    },
    clipsContent: false,
    source: geo.source,
    scale,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   ② PHẦN CHẠM DOM — dựng sân khấu tàng hình, gọi encoder, ghi clipboard.
   ══════════════════════════════════════════════════════════════════════════ */

/** `id` của sân khấu; để test/Playwright bắt được và để không dựng chồng hai cái. */
export const STAGE_ID = "kitgen-figma-h2d-stage";

/**
 * Sân khấu phải **có layout thật**: encoder gọi `assertLayout()` rồi
 * `getBoundingClientRect()` từng node (`vendor/figma-h2d/README.md`, ràng buộc 1).
 * `display:none` ⇒ ném; `visibility:hidden` ⇒ di truyền xuống frame và bị chụp vào
 * styles ⇒ node dán ra Figma bị ẩn. `opacity:0` không di truyền thành computed style
 * của con nên an toàn, và `position:fixed` giữ sân khấu ngoài dòng chảy trang.
 */
export function mountStage(): HTMLDivElement {
  document.getElementById(STAGE_ID)?.remove();
  const stage = document.createElement("div");
  stage.id = STAGE_ID;
  stage.setAttribute("aria-hidden", "true");
  stage.style.cssText =
    "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1;"
    + "overflow:visible;background:transparent;contain:none";
  document.body.appendChild(stage);
  return stage;
}

/**
 * Cây DOM = cây node Figma. Giữ ĐÚNG hình dạng và thuộc tính mà
 * `copy-sprite-images.mjs:88-96` đã dán thử thành công — `aria-label` thành tên
 * frame, `overflow:visible` thành `Clip content = off`, `max-width:none` để ảnh
 * to hơn frame không bị co lại.
 *
 * ┌── KHÔNG CÒN `mix-blend-mode` (07/09/2026) ────────────────────────────────┐
 * │ Node từng mang `mixBlendMode:"screen"` cho ô hiệu ứng phát sáng, vì        │
 * │ tách ô đó khỏi một TẤM ĐEN nên PNG của nó là premultiplied `C = α·F` và    │
 * │ chỉ vẽ đúng bằng phép CỘNG. Nhánh nền đen đã bỏ: model trả alpha thật, dao │
 * │ cắt không đụng alpha, quầng sáng nằm sẵn trong kênh α ⇒ dán thường là đúng.│
 * │ Bỏ luôn cả cái toast nhắc người dùng tự chỉnh Linear Dodge trong Figma.    │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌── `at` — NHIỀU Ô TRÊN CÙNG MỘT SÂN KHẤU (P4-1, nút header) ───────────────┐
 * │ Bản đầu chỉ dựng MỘT frame nên frame để `position:static` cũng chạy: ảnh   │
 * │ `position:absolute` rơi về khối chứa gần nhất là **sân khấu** (`fixed`),   │
 * │ mà sân khấu và frame đều ở (0,0) nên hai hệ toạ độ trùng nhau. Đặt hai ô   │
 * │ trở lên là bẫy sập ngay: ô thứ hai nằm dưới trong dòng chảy, còn ảnh của   │
 * │ nó vẫn neo vào sân khấu ⇒ hai ảnh chồng lên nhau. Vì thế frame nay LUÔN có │
 * │ `position` (relative khi đứng một mình, absolute khi có `at`) — số đo của  │
 * │ ca một-ô KHÔNG đổi một pixel, vì frame vẫn ở (0,0).                        │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
export function renderSpec(
  spec: FigmaNodeSpec,
  imageUrl: string,
  stage: HTMLElement,
  at?: { x: number; y: number },
): HTMLElement {
  const frame = document.createElement("div");
  frame.className = "safe-frame";
  frame.setAttribute("aria-label", spec.name);
  frame.style.cssText =
    (at === undefined ? "position:relative;" : `position:absolute;left:${at.x}px;top:${at.y}px;`)
    + `width:${spec.frame.w}px;height:${spec.frame.h}px`;

  const img = document.createElement("img");
  img.alt = `Image · ${spec.name}`;
  img.src = imageUrl;
  img.style.cssText =
    `position:absolute;left:${spec.image.x}px;top:${spec.image.y}px;`
    + `width:${spec.image.w}px;height:${spec.image.h}px;display:block;max-width:none`;

  frame.appendChild(img);
  stage.appendChild(frame);
  return frame;
}

/**
 * Soi lại IR trước khi ghi clipboard. Encoder nuốt lỗi tải ảnh vào `assets[…].error`
 * và vẫn trả về một document "hợp lệ" — dán cái đó ra Figma là một frame RỖNG mà
 * người dùng không hiểu vì sao. Kiểm ở đây để còn kịp rơi về bitmap.
 */
export function assertDocShape(doc: H2DDocument, spec: FigmaNodeSpec): void {
  const root: H2DNode | undefined = doc.root;
  if (root?.tag !== "DIV") throw new Error(`Root của payload không phải frame DIV (${String(root?.tag)}).`);
  const image = root.childNodes?.find((n) => n?.tag === "IMG");
  if (image === undefined) throw new Error("Payload thiếu node ảnh raster bên trong frame.");
  if (root.styles?.overflow === "hidden") throw new Error("Frame đang bật clip content — sai hợp đồng §3.3.");
  const failed = [...doc.assets.values()].filter((a) => a.blob === null);
  if (failed.length > 0) {
    throw new Error(`Không nhúng được ảnh vào payload: ${failed[0]?.error ?? "không rõ lý do"}`);
  }
  const rw = root.rect?.width ?? 0;
  const rh = root.rect?.height ?? 0;
  if (Math.abs(rw - spec.frame.w) > 1 || Math.abs(rh - spec.frame.h) > 1) {
    throw new Error(`Frame đo được ${rw}×${rh}, lệch so với safe zone ${spec.frame.w}×${spec.frame.h}.`);
  }
}

export interface FigmaNodeCopy {
  spec: FigmaNodeSpec;
  /** HTML đã encode — cùng thứ đã ghi vào clipboard, giữ lại để test soi. */
  html: string;
}

/**
 * Chụp + encode một ô thành payload clipboard Figma. KHÔNG tự ghi clipboard, để nơi
 * gọi ghi trong đúng cử chỉ người dùng và tự quyết đường lùi.
 */
export async function encodeFigmaNode(spec: FigmaNodeSpec, imageUrl: string): Promise<FigmaNodeCopy> {
  const h2d = await loadFigmaH2D();
  const stage = mountStage();
  try {
    const frame = renderSpec(spec, imageUrl, stage);
    const doc = await h2d.captureElement(frame);
    assertDocShape(doc, spec);
    const { html } = await h2d.toFigmaClipboardHtml([doc], { source: "kitgen-cut-asset" });
    return { spec, html };
  } finally {
    stage.remove();
  }
}

/**
 * Đường đầy đủ cho menu ⋯: ô đã cắt → node Figma thật trong bộ nhớ tạm.
 * Ném (kèm câu tiếng Việt) ở mọi bước hỏng — nơi gọi bắt và rơi về bitmap.
 */
export async function copyAssetAsFigmaNode(
  asset: KitFile,
  imageUrl: string,
  kitMeta: KitMeta = {},
): Promise<FigmaNodeSpec> {
  const spec = buildFigmaNodeForAsset(asset, kitMeta);
  const { html } = await encodeFigmaNode(spec, imageUrl);
  if (typeof ClipboardItem !== "function" || !navigator.clipboard?.write) {
    throw new Error("Trình duyệt này không cho ghi HTML vào bộ nhớ tạm.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([""], { type: "text/plain" }),
    }),
  ]);
  return spec;
}
