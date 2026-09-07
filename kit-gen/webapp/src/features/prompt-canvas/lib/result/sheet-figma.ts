/**
 * features/prompt-canvas/lib/result/sheet-figma.ts
 * ────────────────────────────────────────────────────────────────────────────
 * COPY **CẢ TẤM** SANG FIGMA — node thật, không phải bitmap trần.
 *
 * ╔══ VÌ SAO LÀ FILE MỚI, KHÔNG SỬA `kit-core/lib/figma-node.ts` ══════════╗
 * ║ `figma-node.ts` + `vendor/figma-h2d/` đang bị BỐN bộ test khoá             ║
 * ║ (`vendor-integrity`, `figma-node`, `generated-results`, `result-copy`),    ║
 * ║ trong đó `vendor-integrity` khoá theo HASH file. Encoder là thứ đã dán thử ║
 * ║ thành công ra Figma desktop; sửa nó để thêm một ca dùng mới là đánh đổi    ║
 * ║ sai chiều. Nên ở đây CHỈ BỌC LẠI hai cửa công khai của nó:                 ║
 * ║   · `encodeFigmaNode(spec, imageUrl)` — tự gọi `renderSpec` dựng sân khấu  ║
 * ║     tàng hình, chụp bằng vendor, rồi `assertDocShape` soi lại IR.          ║
 * ║   · `FigmaNodeSpec` — hình dạng spec, giữ nguyên để `assertDocShape` vẫn   ║
 * ║     đo được frame.                                                        ║
 * ║ Không một byte nào của vendor lẫn `figma-node.ts` bị chạm.                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ CẢ TẤM KHÁC MỘT Ô Ở ĐÂU ════════════════════════════════════════════════╗
 * ║ Một ô đã cắt có safe zone riêng, và ruột thường TO HƠN safe zone ⇒ ảnh đặt ║
 * ║ lệch ÂM (`buildFigmaNodeForAsset`). Cả tấm thô thì KHÔNG có safe zone nào: ║
 * ║ nó là đúng một ảnh chữ nhật `w×h` mà engine vừa ghi ra `raw/<job>.png`.    ║
 * ║ ⇒ frame ≡ ảnh, offset (0,0), `source: "canvas"`. Đừng "mượn" số safe zone  ║
 * ║ của một ô nào đó cho cả tấm — đó là cách nhanh nhất để dán ra Figma lệch   ║
 * ║ vài trăm pixel mà không có gì báo.                                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import {
  FigmaNodeUnsupported, encodeFigmaNode, type FigmaNodeSpec,
} from "@/features/kit-core/lib/figma-node";

export interface SheetFigmaOptions {
  /**
   * Tỉ lệ dán. **Mặc định 1** — cố ý khác quy ước 50% của ô UI
   * (`features/kit/lib/export-scale.ts`): quy ước đó nói về ASSET đã cắt đặt vào
   * layout thiết kế, còn cả tấm thô là ảnh tham chiếu để soi bố cục. Thu nhỏ nó
   * một nửa là làm mất đúng thứ người dùng mở nó ra để nhìn.
   */
  scale?: number;
}

/**
 * Spec Figma cho NGUYÊN MỘT TẤM `w×h`.
 *
 * Hàm THUẦN — không chạm DOM, không mạng, nên mọi con số kiểm được bằng test.
 * Ném `FigmaNodeUnsupported` (cùng lớp lỗi mà `CutAssetGrid` đã biết bắt) khi số đo
 * không dùng được: thà nói "chưa đo được cỡ ảnh" còn hơn dán ra một frame 0×0.
 */
export function figmaNodeForSheet(
  w: number,
  h: number,
  name: string,
  opts: SheetFigmaOptions = {},
): FigmaNodeSpec {
  if (!Number.isFinite(w) || !Number.isFinite(h) || !(w > 0) || !(h > 0)) {
    throw new FigmaNodeUnsupported(
      `Chưa đo được cỡ thật của tấm «${name}» (${w}×${h}) — không dựng được node Figma.`,
    );
  }
  const scale = opts.scale ?? 1;
  if (!Number.isFinite(scale) || !(scale > 0)) {
    throw new FigmaNodeUnsupported(`Tỉ lệ xuất không hợp lệ: ${scale}`);
  }
  const label = String(name).trim() === "" ? "sheet" : String(name).trim();
  return {
    name: label,
    frame: { w: w * scale, h: h * scale },
    /* Ảnh ≡ frame: tấm thô không có decoration tràn ra ngoài để mà đặt lệch âm. */
    image: { x: 0, y: 0, w: w * scale, h: h * scale },
    /* Vẫn TẮT clip cho đúng hợp đồng §3.3 — và để `assertDocShape` không đỏ. */
    clipsContent: false,
    source: "canvas",
    scale,
  };
}

/**
 * Đo cỡ pixel THẬT của một ảnh đã tải (object URL của `image-source.ts`).
 *
 * Không tin `contract` để suy ra khổ ảnh: contract nói khổ *đáng lẽ*, còn thứ dán ra
 * Figma phải khớp file *thật sự* trên đĩa. Lệch nhau là chuyện đã xảy ra (model trả
 * ảnh sai khổ), và `assertDocShape` sẽ bắt được — nhưng chỉ khi số đo là số đo thật.
 */
export function measureImage(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) resolve({ w, h });
      else reject(new FigmaNodeUnsupported("Ảnh tải về có kích thước 0 — file hỏng hoặc chưa ghi xong."));
    };
    img.onerror = () => reject(new Error("Không giải mã được ảnh của tấm."));
    img.src = url;
  });
}

/**
 * Chụp + encode + GHI CLIPBOARD cho cả tấm. Đối xứng với `copyAssetAsFigmaNode`
 * của `figma-node.ts` (một ô) và ném y hệt kiểu đó ở mọi bước hỏng, để nơi gọi
 * còn kịp rơi về đường tải ảnh về máy và NÓI RÕ là đang dùng đường lùi.
 */
export async function copySheetAsFigmaNode(
  imageUrl: string,
  size: { w: number; h: number },
  name: string,
  opts: SheetFigmaOptions = {},
): Promise<FigmaNodeSpec> {
  const spec = figmaNodeForSheet(size.w, size.h, name, opts);
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
