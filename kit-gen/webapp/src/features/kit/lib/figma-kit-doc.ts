/**
 * features/kit/lib/figma-kit-doc.ts — NÚT HEADER "COPY SANG FIGMA" RA **NHIỀU NODE**.
 *
 * ╔══ BA BỆNH ĐANG CHỮA (chủ sản phẩm báo 14/08, có ảnh bằng chứng) ═══════════╗
 * ║ ① Dán ra Figma **mờ tịt / vỡ pixel**. Gốc bệnh nằm ở `figma-board.ts:228`: ║
 * ║   `ctx.drawImage(bmp, x, y, cell.w, cell.h)` với `cell.w/h = exportSize()`  ║
 * ║   — tức UI bị vẽ lại ở **50%**. Đó là RESAMPLE thật, pixel mất vĩnh viễn:   ║
 * ║   ô nền `25-bg-home` 1392×2088 rơi xuống 696×1044 rồi bake vào một PNG      ║
 * ║   phẳng, designer kéo to lại trong Figma là thấy răng cưa.                  ║
 * ║ ② Ra **một tấm PNG phẳng**, không có layer.                                 ║
 * ║ ③ (phụ, nhưng đã đo) `figma-board.ts` nhận NGUYÊN `kit.files`, mà #42 phát  ║
 * ║   mỗi ô HAI bản ghi (`tight/x` và `x`) ⇒ bảng cũ hiện mỗi ô **hai lần**.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── CÁCH CHỮA: TỈ LỆ LÀ CỠ NODE, KHÔNG PHẢI CỠ ẢNH ────────────────────────┐
 * │ `buildFigmaNodeForAsset` đã nói đúng điều đó từ đầu — `scale` chỉ nhân vào │
 * │ `frame.w/h` và `image.w/h`, tức **kích thước node CSS**. Ảnh nhúng vào     │
 * │ payload là blob PNG GỐC: `ImageCollector.addImage(el.currentSrc)` →        │
 * │ `fetchImage` trả nguyên `res.blob()` (`figma-h2d.global.js:248-259`), KHÔNG │
 * │ đi qua canvas nào (nhánh `transcodeToWebp` chỉ chạm avif/heif). Vì vậy một │
 * │ ô UI ra node 368×348 nhưng fill vẫn là ảnh 787×704 — zoom trong Figma nét. │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ┌── MỘT DOCUMENT / MỘT Ô, KHÔNG PHẢI MỘT CÂY LỒNG NHAU ───────────────────┐
 * │ `figma-export/copy-sprite-images.mjs:4-7` ghi lại hành vi ĐÃ QUAN SÁT của  │
 * │ bên nhận: *Figma flatten wrapper trong suốt khi nó nằm trong một board*.   │
 * │ Bọc cả kit vào một `<div>` cha là đi thẳng vào ca đó. `scene-figma.ts` đã  │
 * │ có sẵn lối thoát và đã đo: chế độ `flat` bắn N document rời, `computeRect` │
 * │ trả toạ độ viewport TUYỆT ĐỐI cho root ⇒ **vị trí lưới vẫn đúng**, chỉ mất │
 * │ một tầng nhóm (người dùng Cmd+G nếu muốn). File này đi đúng lối đó.        │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * KHÔNG hứa quá: encoder là bundle bên thứ ba, clipboard cần HTTPS/localhost +
 * cử chỉ người dùng, và payload full-res thì TO (đo thật ở `estimateBytes`). Mọi
 * lỗi ném ra ngoài để nơi gọi rơi về bảng bitmap cũ (`figma-board.ts`) và NÓI RÕ.
 */
import type { KitFile } from "@/lib/types";
import {
  FigmaNodeUnsupported, assertDocShape, assetName, buildFigmaNodeForAsset, mountStage, renderSpec,
  type FigmaNodeSpec,
} from "@/features/kit-core/lib/figma-node";
import {
  RESULT_GROUP_ORDER, categoryOfSheet, groupLabel, type ResultCategory,
} from "@/features/kit-core/lib/generated-results";
import { loadFigmaH2D, type H2DDocument } from "@/vendor/figma-h2d";

/** Nguồn ghi vào metadata payload — soi lại lượt dán nào đến từ nút header. */
export const KIT_DOC_SOURCE = "kitgen-kit-board";

/* ══════════════════════════════════════════════════════════════════════════
   ① PHẦN THUẦN — chọn file, xếp lưới, ước lượng cỡ. Không chạm DOM.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Bỏ bản trùng: `slice.py:950-953` ghi mỗi ô ra HAI file và `#42` phát cả hai, nên
 * không lọc thì bảng có mỗi ô hai lần (một bản ôm sát, một bản còn đệm bleed).
 * Luật chọn chép nguyên `CutAssetGrid.cutAssets` ① — ưu tiên `tight/`.
 */
export function preferTight(files: readonly KitFile[]): KitFile[] {
  const stem = (f: KitFile) => String(f.file).slice(String(f.file).lastIndexOf("/") + 1);
  const usable = files.filter((f) => !f.empty && !stem(f).startsWith("_empty"));
  const tight = new Set(usable.filter((f) => String(f.file).startsWith("tight/")).map(stem));
  return usable.filter((f) => String(f.file).startsWith("tight/") || !tight.has(stem(f)));
}

export interface KitDocCell {
  file: KitFile;
  name: string;
  group: ResultCategory;
  spec: FigmaNodeSpec;
  /** Góc trên-trái của frame trên sân khấu (px CSS). */
  left: number;
  top: number;
}

export interface KitDocGroup {
  category: ResultCategory;
  label: string;
  cells: KitDocCell[];
  /** Ước lượng byte payload của riêng nhóm này — xem `estimateBytes`. */
  bytes: number;
}

export interface KitDocLayout {
  groups: KitDocGroup[];
  /** Ô không dựng được node (manifest thiếu/lệch) — bỏ qua nhưng phải NÓI RA. */
  skipped: ReadonlyArray<{ name: string; reason: string }>;
  width: number;
  height: number;
}

/** Cùng bề rộng bảng với đường bitmap cũ, để lưới quen mắt người dùng. */
export const BOARD_W = 2400;
const PAD = 24;
const GAP = 24;
/** Khoảng cách giữa hai nhóm — đủ rộng để mắt tách được khối trong Figma. */
const GROUP_GAP = 120;

/**
 * ẢNH GỐC → BYTE PAYLOAD: **base64 HAI LẦN**.
 *
 * `toFigmaClipboardHtml` gói `blob` thành data-URL (`blobToDataUrl`, +33%) rồi
 * `JSON.stringify` cả mảng document và base64 lần nữa (`base64Utf8`, +33%)
 * — `figma-h2d.global.js:1272`, `:1292`. ⇒ hệ số lý thuyết 1.33² ≈ 1.78.
 *
 * ĐO THẬT trên bốn kit trong `kits/` của repo (cộng cả phần JSON cây node):
 *
 *     kit     ô tight   PNG gốc   payload HTML   hệ số
 *     candy      50     7.7 MB       13.8 MB     1.80
 *     rnd        58     8.4 MB       15.1 MB     1.80
 *     tet        58    10.6 MB       18.9 MB     1.79
 *     ipay       80    13.0 MB       23.3 MB     1.79
 *
 * Cả bốn đều lọt MỘT đợt dưới `CLIPBOARD_SOFT_MAX`. Con số này KHÔNG phải để hù
 * doạ: nó là thứ quyết định chia mấy đợt, nên lấy 1.80 (mép trên đã đo) chứ không
 * lấy 1.78 — ước thiếu thì đợt cuối mới vỡ, mà lúc đó người dùng đã dán nửa kit.
 */
export const BASE64_FACTOR = 1.8;
/** Phần JSON cây node cho mỗi ô (đo thô: ~2 KB/ô kể cả styles). */
const NODE_OVERHEAD = 2048;

export function estimateBytes(files: readonly KitFile[]): number {
  let total = 0;
  for (const f of files) total += (typeof f.bytes === "number" ? f.bytes : 0) * BASE64_FACTOR + NODE_OVERHEAD;
  return Math.round(total);
}

/**
 * TRẦN MỘT ĐỢT COPY.
 *
 * Không có con số chính thức nào cho `ClipboardItem`: Chromium chở HTML qua IPC
 * mojo và một chuỗi vài chục MB có thể ném `NotAllowedError`/`DataError` hoặc treo
 * tab. 24 MB là mức mà kit to nhất trong repo (`ipay`: 80 ô, 23.3 MB đo được) vẫn
 * lọt MỘT đợt — chọn cao hơn nữa là đánh cược, thấp hơn là chia đợt cho cả kit thường.
 * Vượt trần ⇒ chia theo NHÓM (mascot/nền/popup/UI/đạo cụ), không cắt giữa nhóm.
 */
export const CLIPBOARD_SOFT_MAX = 24 * 1024 * 1024;

export interface PackOptions {
  /**
   * ÉP TỈ LỆ XUẤT cho MỌI ô, thay cho quy ước «mascot 1:1 · UI 50%» của
   * `export-scale.ts`.
   *
   * Quy ước 50% ấy có gốc thật (`studio.html:715`: "asset gen là @2x") và màn «Thư
   * viện kit» vẫn sống bằng nó — nên nó KHÔNG bị đổi. Nhưng ở màn prompt-first thì
   * người dùng vừa tự đặt cỡ safe zone bằng pixel và vừa đọc con số ấy trong prompt;
   * dán ra Figma một khung bằng nửa con số đó là biến lựa chọn của họ thành một câu
   * đố. Ở đó — và chỉ ở đó — tỉ lệ là 1.
   *
   * Vắng ⇒ giữ nguyên `scaleOf` như cũ.
   *
   * ╔══ VÌ SAO NHẬN CẢ MỘT HÀM ════════════════════════════════════════════════╗
   * ║ Một con số chung là đủ khi tỉ lệ là một QUY ƯỚC (mascot 1:1 · UI 50%).    ║
   * ║ Ở màn prompt-first thì tỉ lệ là một PHÉP ĐO của riêng từng ô: model vẽ ô  ║
   * ║ này lố 35%, ô kia lố 8%, và mỗi ô phải co đúng phần lố của chính nó thì   ║
   * ║ lõi mới vừa khít hộp người dùng chọn (`prompt-canvas/lib/result/          ║
   * ║ sheet-files.ts:contractFramed`). Ép một số chung lên cả tấm là dựng lại    ║
   * ║ đúng cái sai vừa gỡ, chỉ ở một chỗ khác.                                  ║
   * ║ Hàm trả `undefined` cho một ô ⇒ ô đó rơi về `scaleOf` như cũ.             ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  scale?: number | ((file: KitFile) => number | undefined);
}

/**
 * Xếp lưới: mỗi nhóm một dải ngang riêng, trong dải thì xếp "kệ" (hết bề rộng thì
 * xuống dòng). Hàm THUẦN ⇒ kiểm được bằng kit thật, không cần trình duyệt.
 */
export function packKitDoc(
  files: readonly KitFile[],
  poseFiles: ReadonlySet<string>,
  boardWidth: number = BOARD_W,
  opts: PackOptions = {},
): KitDocLayout {
  const byGroup = new Map<ResultCategory, KitFile[]>();
  for (const f of preferTight(files)) {
    const g = categoryOfSheet(String(f.sheet ?? ""));
    const bucket = byGroup.get(g);
    if (bucket) bucket.push(f);
    else byGroup.set(g, [f]);
  }

  const skipped: Array<{ name: string; reason: string }> = [];
  const groups: KitDocGroup[] = [];
  const inner = Math.max(boardWidth - PAD * 2, 1);
  let y = PAD;

  for (const category of RESULT_GROUP_ORDER) {
    const bucket = byGroup.get(category);
    if (bucket === undefined || bucket.length === 0) continue;

    const cells: KitDocCell[] = [];
    let x = PAD;
    let rowH = 0;
    let bytes = 0;

    for (const file of bucket) {
      const name = assetName(file);
      const scale = typeof opts.scale === "function" ? opts.scale(file) : opts.scale;
      let spec: FigmaNodeSpec;
      try {
        spec = buildFigmaNodeForAsset(file, { name, poseFiles, ...(scale === undefined ? {} : { scale }) });
      } catch (err) {
        skipped.push({ name, reason: err instanceof FigmaNodeUnsupported ? err.message : String(err) });
        continue;
      }
      const w = Math.max(spec.frame.w, 1);
      const h = Math.max(spec.frame.h, 1);
      if (x > PAD && x - PAD + w > inner) {
        x = PAD;
        y += rowH + GAP;
        rowH = 0;
      }
      cells.push({ file, name, group: category, spec, left: x, top: y });
      bytes += estimateBytes([file]);
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }

    if (cells.length === 0) continue;
    groups.push({ category, label: groupLabel(category), cells, bytes });
    y += rowH + GROUP_GAP;
  }

  return { groups, skipped, width: boardWidth, height: Math.max(y - GROUP_GAP + PAD, PAD * 2) };
}

/**
 * Chia nhóm thành các ĐỢT copy dưới trần. Một nhóm to hơn trần vẫn đi RIÊNG một đợt
 * (không cắt giữa nhóm): thà thử và để clipboard tự báo hỏng còn hơn cắt vụn một
 * nhóm rồi bắt designer ghép tay — và đường lùi bitmap vẫn còn đó.
 */
export function batchGroups(
  groups: readonly KitDocGroup[],
  cap: number = CLIPBOARD_SOFT_MAX,
): KitDocGroup[][] {
  const out: KitDocGroup[][] = [];
  let cur: KitDocGroup[] = [];
  let size = 0;
  for (const g of groups) {
    if (cur.length > 0 && size + g.bytes > cap) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(g);
    size += g.bytes;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

export const cellsOf = (groups: readonly KitDocGroup[]): KitDocCell[] =>
  groups.flatMap((g) => g.cells);

/* ══════════════════════════════════════════════════════════════════════════
   ② PHẦN CHẠM DOM — sân khấu tàng hình, encoder, clipboard.
   ══════════════════════════════════════════════════════════════════════════ */

export interface KitDocEncodeResult {
  /** Chuỗi HTML đã encode — đúng thứ sẽ ghi vào clipboard. */
  html: string;
  /** Số document = số node người dùng thấy trong Figma (1 frame / ô). */
  docs: number;
  /** Cỡ chuỗi clipboard THẬT (ký tự) — dùng để đối chiếu với `estimateBytes`. */
  bytes: number;
}

/**
 * Dựng sân khấu, chụp TỪNG ô thành một document, rồi gói cả mảng vào payload.
 *
 * `onEncoded` báo tiến trình: một kit thật là 50–80 lần `captureElement`, mỗi lần
 * còn `fetch` lại blob ảnh — vài giây là chuyện bình thường và người dùng phải thấy.
 */
export async function encodeKitDoc(
  cells: readonly KitDocCell[],
  urls: ReadonlyMap<string, string>,
  onEncoded?: (done: number, total: number) => void,
): Promise<KitDocEncodeResult> {
  if (cells.length === 0) throw new Error("Không có ô nào dựng được node Figma.");
  const h2d = await loadFigmaH2D();
  const stage = mountStage();
  try {
    const frames = cells.map((cell) => {
      const url = urls.get(cell.file.path);
      if (url === undefined || url === "") {
        throw new Error(`Chưa tải được ảnh «${cell.name}» nên không dựng được node.`);
      }
      return renderSpec(cell.spec, url, stage, { x: cell.left, y: cell.top });
    });

    const docs: H2DDocument[] = [];
    for (const [i, frame] of frames.entries()) {
      const doc = await h2d.captureElement(frame);
      assertDocShape(doc, cells[i]!.spec);
      docs.push(stripPageTitle(doc));
      onEncoded?.(i + 1, frames.length);
    }
    const { html } = await h2d.toFigmaClipboardHtml(docs, { source: KIT_DOC_SOURCE });
    return { html, docs: docs.length, bytes: html.length };
  } finally {
    stage.remove();
  }
}

/**
 * BỎ TIÊU ĐỀ TRANG khỏi payload — nếu không, tên node dán ra Figma mọc thêm đuôi.
 *
 * ╔══ ĐO ĐƯỢC, KHÔNG ĐOÁN ═══════════════════════════════════════════════════╗
 * ║ Chủ sản phẩm chụp màn Figma: node tên `01-button (test · Thư viện kit ·   ║
 * ║ kit-…)`. Nửa trong ngoặc KHÔNG đến từ `assetName` — nó là `document.title`║
 * ║ của chính tab web: `AppLayout.tsx:71` đặt `[tên dự án, tên màn, "kit-gen"]║
 * ║ .join(" · ")`, và encoder chở nó đi nguyên vẹn                            ║
 * ║ (`figma-h2d.global.js:1194`: `documentTitle: doc.title || void 0`, rồi     ║
 * ║ `serializeDocument` `JSON.stringify` cả object).                          ║
 * ║                                                                          ║
 * ║ Đúng chỗ để chữa là Ở ĐÂY, không phải trong vendor (khoá theo hash) và    ║
 * ║ cũng không phải bằng cách đổi `document.title` — đổi tiêu đề tab để lấy    ║
 * ║ một cái tên node là sửa nhầm cái. Encoder chính nó ghi `void 0` khi trang ║
 * ║ không có tiêu đề, nên `undefined` ở đây là một giá trị nó vẫn sinh ra —   ║
 * ║ `JSON.stringify` bỏ hẳn khoá, và Figma còn đúng tên frame để đặt.         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function stripPageTitle(doc: H2DDocument): H2DDocument {
  const { documentTitle: _pageTitle, ...rest } = doc as H2DDocument & { documentTitle?: unknown };
  return rest as H2DDocument;
}

/** Đường đầy đủ: ô đã cắt → nhiều node Figma trong bộ nhớ tạm. Ném ở mọi bước hỏng. */
export async function copyKitDoc(
  cells: readonly KitDocCell[],
  urls: ReadonlyMap<string, string>,
  onEncoded?: (done: number, total: number) => void,
): Promise<KitDocEncodeResult> {
  const encoded = await encodeKitDoc(cells, urls, onEncoded);
  if (typeof ClipboardItem !== "function" || !navigator.clipboard?.write) {
    throw new Error("Trình duyệt này không cho ghi HTML vào bộ nhớ tạm.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([encoded.html], { type: "text/html" }),
      "text/plain": new Blob([""], { type: "text/plain" }),
    }),
  ]);
  return encoded;
}
