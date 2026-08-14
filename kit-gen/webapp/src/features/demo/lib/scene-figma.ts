/**
 * features/demo/lib/scene-figma.ts — ④ MÀN → PAYLOAD CLIPBOARD FIGMA.
 *
 * ╔══ VÌ SAO PHẢI CÓ ĐƯỜNG RIÊNG, KHÔNG DÙNG `copyAssetAsFigmaNode` ══════════╗
 * ║                     một ô (`figma-node.ts`)   một màn (file này)           ║
 * ║ chữ ký              `(asset, url, meta)`      cả một cảnh                  ║
 * ║ sân khấu            tự dựng rồi tự xoá        sống suốt lượt dựng nhiều màn ║
 * ║ assert              ném khi `overflow:hidden` màn **cần** clip ON (§4.5)    ║
 * ║ số document         luôn 1                    1 hoặc N+1 tuỳ `mode`        ║
 * ║ ⇒ Tầng số học thì TÁI DÙNG NGUYÊN (`buildFigmaNodeForAsset`, `geometryOf`  ║
 * ║   qua `resolve-scene.ts`); chỉ tầng chụp/kiểm là mới.                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── HAI CHẾ ĐỘ, VÀ RỦI RO ĐỨNG SAU CÔNG TẮC NÀY (R1) ──────────────────────┐
 * │ `figma-export/copy-sprite-images.mjs:4-7` ghi lại một hành vi ĐÃ QUAN SÁT  │
 * │ ĐƯỢC của bên nhận: *"Figma flatten wrapper trong suốt khi nó nằm bên trong │
 * │ một board"* — chính vì thế bản sprite phải bắn 1 document / 1 frame.       │
 * │ Màn demo lại CẦN cây lồng nhau, tức đúng cái ca đã từng bị làm phẳng.      │
 * │                                                                            │
 * │   `nested` — 1 document, root là frame màn, các ô là frame con.            │
 * │   `flat`   — N+1 document: nền + mỗi ô một document. `computeRect:858-861` │
 * │              trả toạ độ viewport tuyệt đối cho root ⇒ **vị trí vẫn đúng**, │
 * │              chỉ mất một tầng nhóm (người dùng tự Cmd+G).                  │
 * │                                                                            │
 * │ Chủ sản phẩm đã chốt: nếu Figma làm phẳng thì đi đường `flat` — "mỗi thành │
 * │ phần một node sửa được" quan trọng hơn "một frame gọn". Công tắc có sẵn ở  │
 * │ đây nên phép đo ở lát 1 không kéo theo việc sửa kiến trúc.                 │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { loadFigmaH2D, type H2DDocument, type H2DNode } from "@/vendor/figma-h2d";
import { sceneImageCount, type ResolvedScene } from "./resolve-scene";
import { buildSceneDom, mountSceneStage, waitForSceneImages } from "./scene-dom";

export type SceneCopyMode = "nested" | "flat";

/** Nguồn ghi vào metadata payload — để soi lại lượt dán nào đến từ màn demo. */
export const SCENE_CLIPBOARD_SOURCE = "kitgen-demo-screen";

export interface SceneDocExpectation {
  /** `aria-label` mà root PHẢI mang — tên frame trong Figma. */
  label: string;
  size: { w: number; h: number };
  /** Số node `IMG` phải có trong cây. */
  images: number;
  /** Root được phép bật clip (frame màn / khung nền) hay không (safe-frame ô lẻ). */
  clip: boolean;
}

function walk(node: H2DNode | undefined, visit: (n: H2DNode) => void): void {
  if (node === undefined || node === null) return;
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
}

/**
 * Soi lại IR TRƯỚC khi ghi clipboard.
 *
 * Encoder NUỐT lỗi tải ảnh vào `assets[…].error` rồi vẫn trả một document "hợp lệ"
 * (`figma-h2d.global.js:275`, `:280`) — dán cái đó ra Figma là khung rỗng mà người
 * dùng không hiểu vì sao. Luật `assets[].blob !== null` chép từ
 * `figma-node.ts:295-298`; ba luật còn lại là của riêng đường màn:
 *
 *   • đếm `IMG` — thiếu một ô nghĩa là DOM dựng hụt, phải biết ngay chứ không phải
 *     lúc designer đếm layer;
 *   • cấm `borderImageSource` — cái bẫy §4.4, hỏng IM LẶNG nên phải có cổng máy;
 *   • cấm `transform` — nhánh ma trận `rect.quad` chưa ai đo với Figma (§5.3 luật ①).
 */
export function assertSceneDoc(doc: H2DDocument, expect: SceneDocExpectation): void {
  const root = doc.root;
  if (root?.tag !== "DIV") {
    throw new Error(`Root của payload không phải frame DIV (${String(root?.tag)}).`);
  }
  const label = root.attributes?.["aria-label"];
  if (label !== expect.label) {
    throw new Error(`Frame trong payload tên «${String(label)}», chờ «${expect.label}».`);
  }
  const rw = root.rect?.width ?? 0;
  const rh = root.rect?.height ?? 0;
  if (Math.abs(rw - expect.size.w) > 1 || Math.abs(rh - expect.size.h) > 1) {
    throw new Error(`Frame «${expect.label}» đo được ${rw}×${rh}, chờ ${expect.size.w}×${expect.size.h}.`);
  }
  if (!expect.clip && root.styles?.overflow === "hidden") {
    throw new Error(`Frame «${expect.label}» đang bật clip content — sai hợp đồng §3.3.`);
  }

  let images = 0;
  walk(root, (n) => {
    if (n.tag === "IMG") images += 1;
    const styles = n.styles ?? {};
    if (typeof styles["borderImageSource"] === "string" && styles["borderImageSource"] !== "none") {
      throw new Error(
        `Node «${String(n.attributes?.["aria-label"] ?? n.tag)}» dùng border-image — encoder KHÔNG nhúng ảnh cho nó, `
        + "dán ra Figma sẽ là hình rỗng.",
      );
    }
    const transform = styles["transform"];
    if (typeof transform === "string" && transform !== "none" && transform !== "") {
      throw new Error(`Node «${String(n.attributes?.["aria-label"] ?? n.tag)}» có transform — chưa đo được với Figma.`);
    }
  });
  if (images !== expect.images) {
    throw new Error(`Payload «${expect.label}» có ${images} ảnh, chờ ${expect.images}.`);
  }

  const assets = [...doc.assets.values()];
  const failed = assets.filter((a) => a.blob === null);
  if (failed.length > 0) {
    throw new Error(`Không nhúng được ảnh vào payload: ${failed[0]?.error ?? "không rõ lý do"}`);
  }
  if (assets.length === 0) {
    throw new Error(`Payload «${expect.label}» không mang theo ảnh nào.`);
  }
}

export interface SceneEncodeResult {
  /** Chuỗi HTML đã encode — đúng thứ sẽ ghi vào clipboard. */
  html: string;
  /** Số document trong payload (`nested`: 1/màn · `flat`: 1 + số ô). */
  docs: number;
  /** Số ảnh raster đã nhúng. */
  images: number;
  /** Cỡ chuỗi clipboard (byte của chuỗi HTML) — nền chiếm ~91% (§4.8). */
  bytes: number;
  mode: SceneCopyMode;
  screens: number;
}

/**
 * Dựng DOM thật → `captureElement` → kiểm → `toFigmaClipboardHtml`.
 * KHÔNG tự ghi clipboard: nơi gọi ghi trong đúng cử chỉ người dùng và tự quyết đường lùi.
 */
export async function encodeScenes(
  scenes: readonly ResolvedScene[],
  urls: ReadonlyMap<string, string>,
  mode: SceneCopyMode,
): Promise<SceneEncodeResult> {
  if (scenes.length === 0) throw new Error("Không có màn nào để copy.");
  const h2d = await loadFigmaH2D();
  const stage = mountSceneStage();
  try {
    const docs: H2DDocument[] = [];
    let images = 0;
    for (const scene of scenes) {
      if (scene.background === null) {
        throw new Error(`Màn «${scene.name}» thiếu ảnh nền nên không dựng được.`);
      }
      const dom = buildSceneDom(scene, urls, stage);
      await waitForSceneImages(dom.screen);

      if (mode === "nested") {
        const doc = await h2d.captureElement(dom.screen);
        assertSceneDoc(doc, {
          label: scene.name,
          size: scene.size,
          images: sceneImageCount(scene),
          clip: true,
        });
        docs.push(doc);
        images += sceneImageCount(scene);
      } else {
        /* Nền trước để nó nằm DƯỚI trong Figma — thứ tự document là thứ tự dán. */
        const bgDoc = await h2d.captureElement(dom.background!);
        assertSceneDoc(bgDoc, {
          label: `Nền · ${scene.name}`,
          size: scene.size,
          images: 1,
          clip: true,
        });
        docs.push(bgDoc);
        images += 1;
        for (const [i, frame] of dom.frames.entries()) {
          const layer = scene.layers[i]!;
          const doc = await h2d.captureElement(frame);
          assertSceneDoc(doc, {
            label: layer.name,
            size: layer.frame,
            images: 1,
            clip: false,
          });
          docs.push(doc);
          images += 1;
        }
      }
    }
    const { html } = await h2d.toFigmaClipboardHtml(docs, { source: SCENE_CLIPBOARD_SOURCE });
    return { html, docs: docs.length, images, bytes: html.length, mode, screens: scenes.length };
  } finally {
    stage.remove();
  }
}

export interface SceneCopyResult extends SceneEncodeResult {
  /** Số node người dùng sẽ thấy trong Figma: frame màn + từng ô (hoặc N+1 doc rời). */
  nodes: number;
}

/**
 * Đường đầy đủ cho nút "Copy màn này sang Figma".
 * Ném (kèm câu tiếng Việt) ở mọi bước hỏng — nơi gọi bắt và NÓI RÕ, không bao giờ báo
 * "đã copy" khi chưa copy được (luật `figma-node.ts:42-45`).
 */
export async function copyScenesAsFigmaNodes(
  scenes: readonly ResolvedScene[],
  urls: ReadonlyMap<string, string>,
  mode: SceneCopyMode,
): Promise<SceneCopyResult> {
  const encoded = await encodeScenes(scenes, urls, mode);
  if (typeof ClipboardItem !== "function" || !navigator.clipboard?.write) {
    throw new Error("Trình duyệt này không cho ghi HTML vào bộ nhớ tạm.");
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/html": new Blob([encoded.html], { type: "text/html" }),
      "text/plain": new Blob([""], { type: "text/plain" }),
    }),
  ]);
  const nodes = mode === "nested"
    ? scenes.reduce((n, s) => n + 1 + sceneImageCount(s), 0)
    : encoded.docs;
  return { ...encoded, nodes };
}
