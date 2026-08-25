/* @vitest-environment jsdom */
/**
 * scene-dom.test.ts — CÂY DOM ĐEM CHỤP PHẢI SẠCH BA THỨ ĐÃ ĐO ĐƯỢC LÀ HỎNG.
 *
 * Không có test này thì cả ba lỗi dưới đây đều **im lặng**: DOM vẫn hiện đúng trên
 * màn hình, payload vẫn "hợp lệ", chỉ có node dán ra Figma là sai — và người phát
 * hiện sẽ là designer, muộn nhất có thể.
 *
 *   `border-image`  ⇒ ảnh KHÔNG được nhúng (`figma-h2d.global.js:289-296` chỉ quét
 *                     `backgroundImage`) ⇒ hình rỗng, không lỗi.
 *   `transform`     ⇒ encoder rẽ sang nhánh ma trận `rect.quad` (`:775-784`,
 *                     `:827-857`) — nhánh chưa ai đo với Figma.
 *   `display:none`  ⇒ `assertLayout` ném giữa lượt chụp (`:1073`, `:1131-1136`).
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema } from "@/lib/types/api";
import type { KitFile } from "@/lib/types";
import { STAGE_ID } from "@/features/kit-core/lib/figma-node";
import { screenSpecById } from "../data/screens.default";
import { resolveScene, type ResolvedScene } from "../lib/resolve-scene";
import {
  BACKGROUND_CLASS, FRAME_CLASS, SCREEN_CLASS, TEXT_CLASS,
  buildSceneDom, mountSceneStage, scenePaths,
} from "../lib/scene-dom";
import manifest from "./fixtures/kits-4.manifest.json";

type Asset = {
  file: string; canvas: number[]; cell: number[]; bleed: number[];
  content: number[]; content_at: number[]; safe: number[]; blend?: string;
};
const assets = manifest.styles.ipay.assets as Asset[];

function files(): KitFile[] {
  return assets.map((a) => {
    const bare = a.file.replace(/\.png$/, "");
    return kitFileSchema.parse({
      file: `tight/${bare}`, path: `kits/chinh/tight/${a.file}`,
      w: a.content[0], h: a.content[1], bytes: 1, sheet: "main", cellIndex: null,
      safe: a.safe, contentAt: a.content_at, content: a.content,
      canvas: a.canvas, cell: a.cell, bleed: a.bleed,
    });
  });
}

const HOME = screenSpecById("home")!;
function sceneAndUrls(): { scene: ResolvedScene; urls: Map<string, string> } {
  const scene = resolveScene(HOME, files(), { char: "taxi" });
  const urls = new Map(scenePaths(scene).map((p) => [p, `blob:fake/${p}`]));
  return { scene, urls };
}

const allElements = (root: HTMLElement) => [root, ...root.querySelectorAll<HTMLElement>("*")];

describe("DOM của màn dựng đúng hình dạng hợp đồng", () => {
  it("root là frame màn có tên, đúng cỡ, và BẬT clip", () => {
    const { scene, urls } = sceneAndUrls();
    const host = document.createElement("div");
    const dom = buildSceneDom(scene, urls, host);

    expect(dom.screen.className).toBe(SCREEN_CLASS);
    expect(dom.screen.getAttribute("aria-label")).toBe("Màn HOME");
    expect(dom.screen.style.width).toBe("400px");
    expect(dom.screen.style.height).toBe("600px");
    /* Màn game PHẢI cắt phần thừa của ảnh nền ⇒ Clip content = ON. Đây chính là lý do
       đường này không dùng lại `assertDocShape` (nó ném khi thấy `overflow:hidden`). */
    expect(dom.screen.style.overflow).toBe("hidden");
    expect(host.firstElementChild).toBe(dom.screen);
  });

  it("nền nằm trong khung riêng, ảnh đã tính sẵn phép cover (không object-fit)", () => {
    const { scene, urls } = sceneAndUrls();
    const dom = buildSceneDom(scene, urls, document.createElement("div"));
    const bg = dom.background!;
    expect(bg.className).toBe(BACKGROUND_CLASS);
    expect(bg.getAttribute("aria-label")).toBe("Nền · Màn HOME");
    const img = bg.querySelector("img")!;
    expect(img.style.getPropertyValue("object-fit")).toBe("");
    expect(img.style.width).toBe("400px");
    expect(img.style.height).toBe("600px");
    expect(img.getAttribute("alt")).toBe("Nền · 25-bg-home");
  });

  it("mỗi ô một safe-frame có aria-label, ảnh lệch âm và KHÔNG bị co về vừa khung", () => {
    const { scene, urls } = sceneAndUrls();
    const dom = buildSceneDom(scene, urls, document.createElement("div"));
    expect(dom.frames.map((f) => f.getAttribute("aria-label")))
      .toEqual(scene.layers.map((l) => l.name));

    const i = scene.layers.findIndex((l) => l.name === "01-btn-pill-red");
    const frame = dom.frames[i]!;
    expect(frame.className).toBe(FRAME_CLASS);
    expect(frame.style.left).toBe("50px");
    expect(frame.style.top).toBe("495px");
    expect(frame.style.width).toBe("300px");
    expect(frame.style.height).toBe("102px");
    /* Clip của TỪNG Ô phải TẮT (mặc định `visible`) để trang trí tràn ra ngoài
       hitbox vẫn thấy — ngược với frame màn. */
    expect(frame.style.overflow).toBe("");

    const img = frame.querySelector("img")!;
    expect(img.style.left).toBe("26px");
    expect(img.style.top).toBe("-3px");
    expect(img.style.width).toBe("248px");
    expect(img.style.height).toBe("110px");
    expect(img.style.maxWidth).toBe("none");
    expect(img.getAttribute("alt")).toBe("Image · 01-btn-pill-red");
  });

  it("chữ ra node riêng, có tên, nằm trong frame của ô", () => {
    const { scene, urls } = sceneAndUrls();
    const dom = buildSceneDom(scene, urls, document.createElement("div"));
    const texts = [...dom.screen.querySelectorAll(`.${TEXT_CLASS}`)];
    expect(texts.map((t) => t.textContent)).toEqual(["1.250", "SĂN QUÀ MAY MẮN", "CHƠI NGAY"]);
    const cta = texts.find((t) => t.textContent === "CHƠI NGAY")!;
    expect(cta.getAttribute("aria-label")).toBe("Nhãn · CHƠI NGAY");
    expect(cta.parentElement?.getAttribute("aria-label")).toBe("01-btn-pill-red");
  });

  it("thứ tự DOM = thứ tự layer (không dùng z-index)", () => {
    const { scene, urls } = sceneAndUrls();
    const dom = buildSceneDom(scene, urls, document.createElement("div"));
    const kids = [...dom.screen.children] as HTMLElement[];
    expect(kids[0]!.className).toBe(BACKGROUND_CLASS);
    expect(kids.slice(1).map((k) => k.getAttribute("aria-label")))
      .toEqual(scene.layers.map((l) => l.name));
    for (const el of allElements(dom.screen)) expect(el.style.zIndex).toBe("");
  });
});

describe("ba thứ bị cấm trong cây đem chụp", () => {
  it("không transform · không border-image · không display:none/visibility:hidden", () => {
    const { scene, urls } = sceneAndUrls();
    const dom = buildSceneDom(scene, urls, document.createElement("div"));
    for (const el of allElements(dom.screen)) {
      const css = el.style.cssText.toLowerCase();
      expect(el.style.transform).toBe("");
      expect(css).not.toContain("border-image");
      expect(css).not.toContain("display: none");
      expect(css).not.toContain("visibility: hidden");
    }
  });

  it("mọi ảnh đều có src thật; thiếu URL thì NÉM chứ không dựng khung rỗng", () => {
    const { scene, urls } = sceneAndUrls();
    const dom = buildSceneDom(scene, urls, document.createElement("div"));
    for (const img of dom.screen.querySelectorAll("img")) {
      expect(img.getAttribute("src")).toMatch(/^blob:fake\//);
    }
    const thiếu = new Map(urls);
    thiếu.delete(scene.layers[0]!.path);
    expect(() => buildSceneDom(scene, thiếu, document.createElement("div")))
      .toThrow(/Chưa tải được ảnh/);
  });
});

describe("sân khấu tàng hình", () => {
  it("có layout thật (opacity 0, position fixed) và không dựng chồng hai cái", () => {
    const a = mountSceneStage();
    expect(a.id).toBe(STAGE_ID);
    expect(a.style.position).toBe("fixed");
    expect(a.style.opacity).toBe("0");
    expect(a.style.display).not.toBe("none");
    expect(a.getAttribute("aria-hidden")).toBe("true");
    const b = mountSceneStage();
    expect(document.querySelectorAll(`#${STAGE_ID}`)).toHaveLength(1);
    b.remove();
    expect(document.getElementById(STAGE_ID)).toBeNull();
  });
});
