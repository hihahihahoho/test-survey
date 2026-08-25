/**
 * features/demo/lib/scene-dom.ts — ③ DỰNG DOM CỦA MÀN. MỘT HÀM, HAI CHỖ DÙNG.
 *
 * Bản XEM TRƯỚC trong dialog và bản ĐEM CHỤP cho Figma đi qua **cùng một hàm** —
 * không có chuyện "xem một đằng dán một nẻo". Khác nhau duy nhất là chỗ cắm: xem
 * trước cắm vào một khung trong dialog, bản chụp cắm vào sân khấu tàng hình.
 *
 * ╔══ BỐN LUẬT CỨNG CỦA DOM ĐEM CHỤP — mỗi luật là một lỗi đã đo được ════════╗
 * ║ ① KHÔNG `transform`. `transform:translate(-50%,-50%)` của prototype        ║
 * ║   (`screens.html:30`) kích hoạt nhánh ma trận của encoder (`computeLocal`  ║
 * ║   `Matrix:775-784` → `centerSolve`/`buildQuad:827-857`) ⇒ node mọc thêm    ║
 * ║   `rect.quad`, một nhánh chưa ai đo với Figma. Tầng ② đã tính sẵn          ║
 * ║   `left/top` nên ở đây không cần dịch chuyển gì.                          ║
 * ║ ② KHÔNG `border-image`. `ImageCollector.collectFor` chỉ quét               ║
 * ║   `styles.backgroundImage` (`figma-h2d.global.js:289-296`) trong khi       ║
 * ║   `borderImageSource` vẫn lọt vào `node.styles` (`:338`) ⇒ payload mang    ║
 * ║   một URL không có blob, dán ra Figma là hình RỖNG **và không báo lỗi**.   ║
 * ║ ③ KHÔNG `display:none` / `visibility:hidden`. Cái đầu làm encoder ném      ║
 * ║   (`:1073`, `assertLayout:1131-1136`), cái sau di truyền xuống con và bị   ║
 * ║   chụp vào styles ⇒ node dán ra Figma bị ẩn. Sân khấu dùng `opacity:0`.    ║
 * ║ ④ KHÔNG `z-index`. Thứ tự layer = thứ tự DOM; tầng ② đã sắp xếp sẵn.       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `aria-label` là đường DUY NHẤT để đặt tên node: `pickAttributes:906-919` chỉ giữ
 * `ATTR_ALLOWLIST` + mọi thuộc tính `aria-*`; `data-name` bị loại thẳng (`:920`), và
 * khoá `name` truyền vào `captureElement` thì bị bỏ qua hoàn toàn (`:1172-1177`) —
 * đúng chỗ prototype `screens.html:259` đã làm hụt.
 */
import { mountStage } from "@/features/kit-core/lib/figma-node";
import type { ResolvedScene, SceneLayer } from "./resolve-scene";
import type { ScreenTextSpec } from "./screen-spec";

/** Class chỉ để tìm lại trong test/Playwright — mọi kiểu dáng đều là style nội tuyến. */
export const SCREEN_CLASS = "kg-demo-screen";
export const BACKGROUND_CLASS = "kg-demo-bg";
export const FRAME_CLASS = "kg-demo-frame";
export const TEXT_CLASS = "kg-demo-text";

/**
 * Font của chữ trong màn. Figma cài sẵn **Inter**, nên đây là lựa chọn ít bị thay thế
 * nhất; font của app (Geist) thì máy designer thường không có. Vẫn phải nói trước với
 * người dùng là chữ CÓ THỂ xê dịch — `FontCollector` đo font trên máy người gửi
 * (`figma-h2d.global.js:94-207`), Figma bên nhận tự thay font gần nhất (rủi ro R5).
 */
export const SCENE_FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

export interface SceneDom {
  /** ROOT của document H2D ở chế độ `nested`. */
  screen: HTMLElement;
  /** Khung nền — root của document nền ở chế độ `flat`. `null` nếu màn không có nền. */
  background: HTMLElement | null;
  /** Mỗi ô một safe-frame, cùng thứ tự với `scene.layers`. */
  frames: HTMLElement[];
}

/** Mọi đường dẫn ảnh màn cần — nơi gọi phải `loadFull()` hết trước khi dựng DOM. */
export function scenePaths(scene: ResolvedScene): string[] {
  const out: string[] = [];
  if (scene.background !== null) out.push(scene.background.path);
  for (const layer of scene.layers) out.push(layer.path);
  return [...new Set(out)];
}

function urlOf(urls: ReadonlyMap<string, string>, path: string): string {
  const url = urls.get(path);
  if (url === undefined || url === "") {
    throw new Error(`Chưa tải được ảnh «${path}» nên không dựng được màn.`);
  }
  return url;
}

function textNode(text: ScreenTextSpec, label: string): HTMLElement {
  const el = document.createElement("div");
  el.className = TEXT_CLASS;
  el.setAttribute("aria-label", `Nhãn · ${label}`);
  el.textContent = text.value;
  el.style.cssText =
    `position:absolute;left:0;top:${text.dy ?? 0}px;width:100%;height:100%;`
    + "display:flex;align-items:center;justify-content:center;text-align:center;"
    + `font-family:${SCENE_FONT};font-size:${text.size}px;font-weight:${text.weight ?? 800};`
    + `color:${text.color ?? "#ffffff"};white-space:pre-line`;
  return el;
}

function frameOf(layer: SceneLayer, urls: ReadonlyMap<string, string>): HTMLElement {
  const frame = document.createElement("div");
  frame.className = FRAME_CLASS;
  frame.setAttribute("aria-label", layer.name);
  /* `overflow` để mặc định (visible) ⇒ Clip content = OFF, trang trí tràn ra ngoài
     hitbox vẫn thấy — đúng hợp đồng §3.3 cho TỪNG Ô (khác frame màn, xem dưới). */
  frame.style.cssText =
    `position:absolute;left:${layer.left}px;top:${layer.top}px;`
    + `width:${layer.frame.w}px;height:${layer.frame.h}px`;

  const img = document.createElement("img");
  img.alt = `Image · ${layer.name}`;
  img.src = urlOf(urls, layer.path);
  img.style.cssText =
    `position:absolute;left:${layer.image.x}px;top:${layer.image.y}px;`
    + `width:${layer.image.w}px;height:${layer.image.h}px;display:block;max-width:none`
    + (layer.blend === null ? "" : `;mix-blend-mode:${layer.blend}`);
  frame.appendChild(img);

  if (layer.text !== null) frame.appendChild(textNode(layer.text, layer.text.value));
  return frame;
}

/**
 * Dựng cây DOM của một màn và cắm vào `parent`.
 *
 * Frame màn CÓ `overflow:hidden` (⇒ Clip content = ON trong Figma) và đó là **đúng ý**:
 * một màn game phải cắt phần thừa của ảnh nền. Chính vì thế đường này KHÔNG dùng lại
 * `assertDocShape` — hàm đó ném khi thấy `overflow:hidden` (`figma-node.ts:294`), luật
 * đúng cho một ô đứng lẻ nhưng sai cho một màn. Xem `assertSceneDoc`.
 */
export function buildSceneDom(
  scene: ResolvedScene,
  urls: ReadonlyMap<string, string>,
  parent: HTMLElement,
): SceneDom {
  const screen = document.createElement("div");
  screen.className = SCREEN_CLASS;
  screen.setAttribute("aria-label", scene.name);
  screen.style.cssText =
    `position:relative;width:${scene.size.w}px;height:${scene.size.h}px;`
    + `overflow:hidden;background:${scene.ground}`;

  let background: HTMLElement | null = null;
  if (scene.background !== null) {
    /* Nền nằm trong khung riêng để ở chế độ `flat` nó vẫn là MỘT document tự đứng
       được: khung cắt đúng cỡ màn, ảnh bên trong đã tính sẵn phép "cover". */
    background = document.createElement("div");
    background.className = BACKGROUND_CLASS;
    background.setAttribute("aria-label", `Nền · ${scene.name}`);
    background.style.cssText =
      `position:absolute;left:0;top:0;width:${scene.size.w}px;height:${scene.size.h}px;`
      + `overflow:hidden;background:${scene.ground}`;
    const img = document.createElement("img");
    img.alt = `Nền · ${scene.background.name}`;
    img.src = urlOf(urls, scene.background.path);
    img.style.cssText =
      `position:absolute;left:${scene.background.left}px;top:${scene.background.top}px;`
      + `width:${scene.background.w}px;height:${scene.background.h}px;display:block;max-width:none`;
    background.appendChild(img);
    screen.appendChild(background);
  }

  const frames = scene.layers.map((layer) => {
    const frame = frameOf(layer, urls);
    screen.appendChild(frame);
    return frame;
  });

  parent.appendChild(screen);
  return { screen, background, frames };
}

/**
 * Sân khấu tàng hình dùng chung với đường copy một ô (`figma-node.ts:231-241`):
 * `position:fixed; opacity:0` — có layout thật nên encoder đo được, mà mắt không thấy.
 */
export function mountSceneStage(): HTMLDivElement {
  return mountStage();
}

/**
 * Chờ ảnh giải mã xong. Kích thước đã ghi thẳng vào style nên layout KHÔNG phụ thuộc
 * việc này; chờ chỉ để bản xem trước không chớp và để lỗi ảnh lộ ra sớm. Ảnh hỏng
 * KHÔNG ném ở đây — `assertSceneDoc` mới là nơi chặn, vì nó thấy cả blob trong payload.
 */
export async function waitForSceneImages(root: HTMLElement): Promise<void> {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(imgs.map(async (img) => {
    if (typeof img.decode !== "function") return;
    try {
      await img.decode();
    } catch {
      /* ảnh hỏng: để payload báo, đừng chặn cả màn ở đây */
    }
  }));
}
