import { afterEach, describe, expect, it } from "vitest";
import { contractSchema } from "@/lib/types/contract";
import { buildKitsetContract } from "../kitset-to-contract";
import { importedElementsOf, workflowPatchFromContract } from "../contract-import";
import { createWorkflowStore, resetWorkflowStores } from "../model";

afterEach(() => {
  resetWorkflowStores();
});

const imported = contractSchema.parse({
  schemaVersion: 4,
  variants: [{
    id: "tet",
    vi: "Tết",
    style: "Sơn mài đỏ và vàng",
    styleMode: "inspo",
    bg: "pure vivid green #00FF00",
    brand: { mode: "colors", primary: "#AA0000", secondary: "#FFD000" },
    characters: [{ id: "meo", vi: "Mèo", ref: "refs/char-meo.png", poses: ["idle"] }],
    inspo: ["refs/inspo-1.png"],
  }],
  characterPoses: ["idle"],
  slice: { threshold: 144 },
  sheets: [
    {
      id: "nen-cu",
      grid: { cols: 1, rows: 1 },
      cell_hint: "full-bleed portrait scene",
      components: [{ file: "25-bg-home", vi: "Nền Home", spec: "home", skel: { shape: "full", w: 1, h: 1 } }],
    },
    {
      id: "popup-cu",
      grid: { cols: 1, rows: 1 },
      cell_hint: "landscape 3:2 cell",
      components: [{ file: "09-popup-panel", vi: "Popup", spec: "popup", skel: { shape: "rrect", w: 0.8, h: 0.7 } }],
    },
  ],
});

describe("chuyển bản thiết kế đã nhập sang trình quản lý mới", () => {
  it("nạp phong cách, màu, ảnh, mascot và ngưỡng cắt", () => {
    const patch = workflowPatchFromContract(imported, "Dự án Tết");
    expect(patch).toMatchObject({
      kitName: "Dự án Tết",
      stylePrompt: "Sơn mài đỏ và vàng",
      styleMode: "inspo",
      primaryColor: "#AA0000",
      secondaryColor: "#FFD000",
      chroma: "green",
      sliceThreshold: 144,
      mascotEnabled: true,
      mascotName: "Mèo",
      mascotRef: { name: "char-meo.png" },
      mascotPoses: ["idle"],
    });
    expect(patch.styleRefs).toEqual([{ name: "inspo-1.png", kind: "style" }]);
  });

  it("giữ các component cũ khi dựng lại contract workflow", () => {
    const state = createWorkflowStore("du-an-nhap").getState();
    const patch = workflowPatchFromContract(imported, "Dự án Tết");
    const lib = importedElementsOf(imported);
    const converted = buildKitsetContract({ ...state, ...patch }, { lib });
    const files = converted.sheets.flatMap((sheet) => sheet.components.map((item) => item.file));
    expect(files).toContain("25-bg-home");
    expect(files).toContain("09-popup-panel");
    expect(converted.variants?.[0]?.id).toBe("chinh");
  });
});
