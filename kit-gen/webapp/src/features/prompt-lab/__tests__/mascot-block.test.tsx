/* @vitest-environment jsdom */
/**
 * PILL «CHỌN NHÂN VẬT» — NÓ ĐI THEO THƯƠNG HIỆU, VÀ CHỈ THEO THƯƠNG HIỆU.
 *
 * ╔══ VÌ SAO CA NÀY PHẢI MOUNT DOM THẬT ═════════════════════════════════════╗
 * ║ Luật ở đây là một luật về CÁI GÌ ĐƯỢC BÀY RA, và nó không để lại dấu vết  ║
 * ║ nào trong contract: một hộp bày thừa nấc «Chọn sẵn» rỗng, hay bày lại      ║
 * ║ danh mục nhân vật dùng chung đã bỏ, vẫn sinh ra đúng cái contract cũ. Chỉ  ║
 * ║ có người mở hộp mới thấy — nên chỉ có ca dựng hộp thật mới bắt được.       ║
 * ║ Chủ sản phẩm nói thẳng: *"nó chỉ đi theo cái nhận diện thương hiệu thôi,   ║
 * ║ thương hiệu ko có con mascot nào thì ko có cái này nhé, cho up ảnh hoặc gõ ║
 * ║ text thôi"*.                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PromptProjectContext } from "@/features/prompt-canvas/lib/project-context";
import { BrandBindingProvider } from "../extensions/BrandProfilePill";
import type { BrandBinding, BrandMascot } from "../components/BrandPickerPill";
import { newMascotBlock, type MascotBlock } from "../lib/composer-model";
import { MascotBlockBody } from "../components/MascotBlockView";

/* Kho preset thật đi qua TanStack Query + agent; ca ở đây nói về pill, không về
   đường tải danh mục — cùng thủ pháp với `uikit-block.test.tsx`. */
vi.mock("../lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const seed = (real["seedPresets"] as () => unknown)();
  return { ...real, usePresets: () => seed, getPresets: () => seed };
});

/** Dây thương hiệu tối thiểu — chỉ những thứ pill nhân vật thật sự đọc. */
function binding(mascots: BrandMascot[], copyAsset = vi.fn()): BrandBinding {
  return {
    brands: [{ id: "b1", name: "Vinamilk", colors: [] }],
    brandId: "b1",
    name: "Vinamilk",
    colorsEdited: false,
    busy: false,
    mascots,
    pick: vi.fn(),
    restoreColors: vi.fn(),
    copyAsset,
  };
}

function Harness({
  brand,
  onChange,
}: {
  /** Vắng ⇒ KHÔNG có Provider nào, đúng ca "chưa chọn thương hiệu". */
  brand?: BrandBinding;
  onChange?: (next: MascotBlock) => void;
}) {
  const [block, setBlock] = React.useState<MascotBlock>(() => newMascotBlock());
  const body = (
    <MascotBlockBody
      block={block}
      onChange={(updater) =>
        setBlock((prev) => {
          const next = updater(prev);
          onChange?.(next);
          return next;
        })
      }
    />
  );
  return (
    <PromptProjectContext.Provider value="p1">
      {brand ? <BrandBindingProvider value={brand}>{body}</BrandBindingProvider> : body}
    </PromptProjectContext.Provider>
  );
}

/** Mở hộp nguồn của pill nhân vật trong câu đầu thẻ. */
async function openMascotPill(): Promise<void> {
  const pill = await waitFor(() => {
    const found = document.querySelector("[data-kg-node='optionPill'][data-kind='mascot'] button");
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
  fireEvent.click(pill);
}

afterEach(cleanup);

describe("pill nhân vật: danh sách chọn sẵn CHỈ đến từ thương hiệu", () => {
  it("chưa chọn thương hiệu ⇒ hộp chỉ còn «Đính ảnh · Gõ riêng», không có nấc «Chọn sẵn»", async () => {
    render(<Harness />);
    await openMascotPill();

    expect(screen.queryByRole("tab", { name: "Chọn sẵn" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Đính ảnh" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gõ riêng" })).toBeTruthy();
    /* Nấc mở sẵn phải là một nấc CÓ THẬT — rơi về «Chọn sẵn» đã ẩn là mở ra một
       hộp trống. */
    expect(screen.getByRole("tab", { name: "Đính ảnh" }).getAttribute("aria-selected")).toBe("true");
  });

  it("thương hiệu KHÔNG có linh vật nào ⇒ y hệt ca chưa chọn thương hiệu", async () => {
    render(<Harness brand={binding([])} />);
    await openMascotPill();
    expect(screen.queryByRole("tab", { name: "Chọn sẵn" })).toBeNull();
  });

  it("thương hiệu CÓ linh vật ⇒ nhóm mang tên thương hiệu, và KHÔNG có danh mục dùng chung nào", async () => {
    render(<Harness brand={binding([{ assetId: "a1", name: "Gấu Vàng" }])} />);
    await openMascotPill();

    expect(screen.getByRole("tab", { name: "Chọn sẵn" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Linh vật của Vinamilk")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Gấu Vàng/ })).toBeTruthy();

    /* Danh mục nhân vật dùng chung («Linh vật chính», «Nhân vật phụ» của
       `presets.mascots`) ĐÃ BỎ — một con không thuộc thương hiệu nào là một con
       không ai đặt hàng. */
    expect(screen.queryByRole("option", { name: /Linh vật chính/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Nhân vật phụ/ })).toBeNull();
    /* Và không có mục "để trống": bỏ một linh vật nghĩa là bỏ tấm ảnh đã chép
       vào dự án, mà đường ấy nằm ở nấc «Đính ảnh». */
    expect(screen.queryByRole("option", { name: /để trống/ })).toBeNull();
  });

  it("bấm một linh vật ⇒ chép asset vào dự án, ảnh vào thẳng pill", async () => {
    const copyAsset = vi.fn().mockResolvedValue({ refName: "gau-vang.png", path: "refs/gau-vang.png" });
    let latest: MascotBlock | null = null;
    render(
      <Harness
        brand={binding([{ assetId: "a1", name: "Gấu Vàng" }], copyAsset)}
        onChange={(next) => { latest = next; }}
      />,
    );
    await openMascotPill();
    fireEvent.click(screen.getByRole("option", { name: /Gấu Vàng/ }));

    expect(copyAsset).toHaveBeenCalledWith("a1");
    /* Ảnh phải nằm trong ATTR của chính pill — đó là thứ `mascotSheets` đọc ra
       `sheet.ref`. Nằm ở đâu khác thì màn hình vẫn đẹp còn máy vẽ không thấy gì. */
    await waitFor(() => expect(JSON.stringify(latest?.doc)).toContain("refs/gau-vang.png"));
  });
});
