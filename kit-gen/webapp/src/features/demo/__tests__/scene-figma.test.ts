/**
 * scene-figma.test.ts — CỔNG SOI PAYLOAD TRƯỚC KHI GHI CLIPBOARD.
 *
 * ╔══ VÌ SAO PHẢI CÓ MỘT HÀM ASSERT RIÊNG CHO MÀN ════════════════════════════╗
 * ║ `assertDocShape` (`figma-node.ts:289-304`) NÉM khi thấy `overflow:hidden` —║
 * ║ luật đúng cho một ô đứng lẻ (clip tắt để trang trí tràn ra ngoài hitbox),  ║
 * ║ nhưng SAI cho một màn game: màn thì phải cắt phần thừa của ảnh nền. Nới    ║
 * ║ luật cũ để dùng chung sẽ làm hỏng cổng của đường copy-một-ô, nên đường màn ║
 * ║ có `assertSceneDoc` riêng — cùng luật "asset nào cũng phải có blob", cộng  ║
 * ║ ba luật mà chỉ cây nhiều node mới cần.                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Encoder NUỐT lỗi tải ảnh vào `assets[…].error` rồi vẫn trả document "hợp lệ"
 * (`figma-h2d.global.js:275`, `:280`) ⇒ nếu không soi lại ở đây, người dùng được báo
 * "đã copy" và dán ra Figma một khung rỗng.
 */
import { describe, expect, it } from "vitest";
import type { H2DDocument, H2DNode } from "@/vendor/figma-h2d";
import { assertSceneDoc, type SceneDocExpectation } from "../lib/scene-figma";

const SCREEN: SceneDocExpectation = {
  label: "Màn HOME", size: { w: 400, h: 600 }, images: 3, clip: true,
};

function img(styles: Record<string, string> = {}): H2DNode {
  return { nodeType: 1, tag: "IMG", attributes: { alt: "Image · x" }, styles, rect: { x: 0, y: 0, width: 10, height: 10 } };
}

function frame(label: string, kids: H2DNode[], styles: Record<string, string> = {}): H2DNode {
  return {
    nodeType: 1, tag: "DIV", attributes: { "aria-label": label },
    styles, rect: { x: 0, y: 0, width: 300, height: 102 }, childNodes: kids,
  };
}

/** Một document màn "khoẻ mạnh": frame màn clip ON, nền + hai ô, ảnh nhúng đủ. */
function doc(over: Partial<{ root: H2DNode; assets: H2DDocument["assets"] }> = {}): H2DDocument {
  const root: H2DNode = {
    nodeType: 1, tag: "DIV", attributes: { "aria-label": "Màn HOME" },
    styles: { overflow: "hidden" },
    rect: { x: 0, y: 0, width: 400, height: 600 },
    childNodes: [
      frame("Nền · Màn HOME", [img()], { overflow: "hidden" }),
      frame("01-btn-pill-red", [img(), { nodeType: 3, content: "CHƠI NGAY" }]),
      frame("04-btn-circle", [img()]),
    ],
  };
  const assets: H2DDocument["assets"] = new Map([
    ["blob:a", { url: "blob:a", blob: new Blob(["a"]) }],
  ]);
  return {
    root: over.root ?? root,
    assets: over.assets ?? assets,
    documentRect: { x: 0, y: 0, width: 400, height: 600 },
    viewportRect: { x: 0, y: 0, width: 400, height: 600 },
    devicePixelRatio: 2,
    version: 1,
  };
}

describe("assertSceneDoc cho phép đúng cái màn cần, chặn đúng cái đã đo là hỏng", () => {
  it("màn hợp lệ: clip BẬT ở frame màn vẫn đi qua", () => {
    expect(() => assertSceneDoc(doc(), SCREEN)).not.toThrow();
  });

  it("ô lẻ thì clip phải TẮT — bật là sai hợp đồng §3.3", () => {
    const one: SceneDocExpectation = { label: "01-btn-pill-red", size: { w: 300, h: 102 }, images: 1, clip: false };
    expect(() => assertSceneDoc(doc({ root: frame("01-btn-pill-red", [img()]) }), one)).not.toThrow();
    expect(() => assertSceneDoc(
      doc({ root: frame("01-btn-pill-red", [img()], { overflow: "hidden" }) }), one,
    )).toThrow(/clip content/);
  });

  it("ảnh không nhúng được ⇒ NÉM, không bao giờ báo đã copy", () => {
    const broken: H2DDocument["assets"] = new Map([
      ["blob:a", { url: "blob:a", blob: null, error: "tải quá 8 giây" }],
    ]);
    expect(() => assertSceneDoc(doc({ assets: broken }), SCREEN)).toThrow(/tải quá 8 giây/);
  });

  it("không có asset nào ⇒ NÉM (payload rỗng vẫn dán được nhưng vô nghĩa)", () => {
    expect(() => assertSceneDoc(doc({ assets: new Map() }), SCREEN)).toThrow(/không mang theo ảnh/);
  });

  /** Cái bẫy §4.4: style đi qua nhưng ẢNH thì không — hỏng IM LẶNG nếu không có cổng. */
  it("border-image lọt vào payload ⇒ NÉM kèm lý do", () => {
    const root = doc().root;
    root.childNodes![1] = frame("01-btn-pill-red", [img()], {
      borderImageSource: 'url("blob:x")',
    });
    expect(() => assertSceneDoc(doc({ root }), SCREEN)).toThrow(/border-image/);
  });

  it("transform lọt vào payload ⇒ NÉM (nhánh ma trận chưa ai đo với Figma)", () => {
    const root = doc().root;
    root.childNodes![2] = frame("04-btn-circle", [img()], { transform: "matrix(1, 0, 0, 1, -8, -8)" });
    expect(() => assertSceneDoc(doc({ root }), SCREEN)).toThrow(/transform/);
    // `transform:none` là giá trị mặc định, không phải lỗi
    root.childNodes![2] = frame("04-btn-circle", [img()], { transform: "none" });
    expect(() => assertSceneDoc(doc({ root }), SCREEN)).not.toThrow();
  });

  it("thiếu một ô trong cây ⇒ NÉM (đếm ảnh, không tin mắt)", () => {
    const root = doc().root;
    root.childNodes = root.childNodes!.slice(0, 2);
    expect(() => assertSceneDoc(doc({ root }), SCREEN)).toThrow(/có 2 ảnh, chờ 3/);
  });

  it("tên frame sai ⇒ NÉM: tên node CHỈ đến từ aria-label", () => {
    const root = doc().root;
    root.attributes = { "aria-label": "Untitled" };
    expect(() => assertSceneDoc(doc({ root }), SCREEN)).toThrow(/tên «Untitled»/);
    const noLabel = doc().root;
    delete noLabel.attributes;
    expect(() => assertSceneDoc(doc({ root: noLabel }), SCREEN)).toThrow(/undefined/);
  });

  it("cỡ frame lệch quá 1px ⇒ NÉM", () => {
    const root = doc().root;
    root.rect = { x: 0, y: 0, width: 400, height: 590 };
    expect(() => assertSceneDoc(doc({ root }), SCREEN)).toThrow(/400×590, chờ 400×600/);
    // lệch dưới 1px là chuyện làm tròn của trình duyệt, không phải lỗi
    const near = doc().root;
    near.rect = { x: 0, y: 0, width: 400.4, height: 599.6 };
    expect(() => assertSceneDoc(doc({ root: near }), SCREEN)).not.toThrow();
  });

  it("root không phải DIV ⇒ NÉM (ảnh trần không phải một frame)", () => {
    expect(() => assertSceneDoc(doc({ root: img() }), SCREEN)).toThrow(/không phải frame DIV/);
  });
});
