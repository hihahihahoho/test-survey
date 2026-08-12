import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/types";
import { normalizedPoseIds, userUiElements } from "../user-library";

const item = (patch: Partial<LibraryItem>): LibraryItem => ({
  id: "asset_0123456789abcdef",
  kind: "ui",
  group: "small",
  name: "Nút đặc biệt",
  description: "Nút game có vùng nội dung sạch",
  filename: "asset.png",
  poses: [],
  tags: [],
  ...patch,
});

describe("thư viện dùng chung đi vào pipeline dự án", () => {
  it("đổi một bộ khung người dùng thành phần tử có tên file và safe zone hợp lệ", () => {
    const [element] = userUiElements([item({
      cell: "landscape",
      skel: { shape: "pill", w: 0.78, h: 0.5, slice9: true },
    })]);
    expect(element).toMatchObject({
      file: "90-custom-456789abcdef",
      vi: "Nút đặc biệt",
      spec: "Nút game có vùng nội dung sạch",
      cell: "landscape",
      skel: { shape: "pill", w: 0.78, h: 0.5, slice9: true },
    });
  });

  it("dùng geometry mặc định đúng theo nhóm khi đọc dữ liệu cũ", () => {
    const [background] = userUiElements([item({ group: "background", skel: undefined, cell: undefined })]);
    expect(background).toMatchObject({ cell: "full", skel: { shape: "full", w: 1, h: 1 } });
  });

  it("chuẩn hoá nhãn dáng cũ thành id an toàn cho contract", () => {
    expect(normalizedPoseIds(["Đứng yên", "Ăn mừng", "Góc nghiêng 3/4", "Ăn mừng"]))
      .toEqual(["idle", "cheer", "goc-nghieng-3-4"]);
  });
});
