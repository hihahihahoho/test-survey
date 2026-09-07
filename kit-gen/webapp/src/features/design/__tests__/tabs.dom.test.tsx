/**
 * TAB PHONG CÁCH + TAB NÂNG CAO — hai điều spec đòi mà rất dễ làm dối:
 *
 *  1. §3-S3.5 / audit C3: segmented control KHÔNG được giấu dữ liệu im lặng.
 *     Chọn "Gõ mô tả" mà vẫn còn ảnh inspo ⇒ PHẢI có dòng "đang KHÔNG được dùng".
 *  2. M4 (teams/design/INTEGRATION.md §5): `bleed` và `quality` KHÔNG có tác dụng thật.
 *     UI phải NÓI RA. Ca test này là cam kết không hứa suông — nếu ai đó xoá lời cảnh
 *     báo đi cho "đỡ xấu", test đỏ ngay.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Contract } from "@/lib/types/contract";
import { StylesTab } from "../components/StylesTab";
import { AdvancedTab } from "../components/AdvancedTab";
import { validateDesign } from "../lib/validate";

afterEach(cleanup);

const base = (over: Partial<Contract> = {}): Contract => ({
  schemaVersion: 4,
  characterPoses: [],
  sheets: [],
  variants: [
    {
      id: "tet",
      vi: "Tết đỏ",
      style: "vibrant Vietnamese Tet",
      styleMode: "prompt",
      bg: "pure vivid magenta #FF00FF",
      brand: { mode: "colors", primary: "#d42a1e", refs: ["brand-a.png", "brand-b.png"] },
      inspo: ["inspo-1.png", "inspo-2.png"],
      characters: [],
    },
  ],
  ...over,
});

function renderStyles(contract: Contract, over: Record<string, unknown> = {}) {
  const noop = () => {};
  return render(
    <TooltipProvider>
      <StylesTab
        contract={contract}
        validation={validateDesign(contract)}
        readOnly={false}
        readOnlyReason=""
        selectedVariantId={null}
        onSelectVariant={noop}
        onAdd={noop}
        onPatch={noop}
        onRenameId={noop}
        onPatchBrand={noop}
        onDuplicate={noop}
        onRemove={noop}
        {...over}
      />
    </TooltipProvider>,
  );
}

describe("tab Phong cách — đóng audit C3", () => {
  it('chọn "Gõ mô tả" mà còn ảnh inspo ⇒ nói rõ ảnh KHÔNG được dùng, có nút [Xem]', () => {
    renderStyles(base());
    expect(screen.getByText(/2 ảnh tham khảo đã tải đang KHÔNG được dùng/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Xem/ })[0]!);
    expect(screen.getByText("inspo-1.png")).toBeTruthy();
  });

  it('chọn "Chọn màu" mà còn ảnh brand ⇒ cũng phải nói ra', () => {
    renderStyles(base());
    expect(screen.getByText(/2 ảnh brand đã tải đang KHÔNG được dùng/)).toBeTruthy();
  });

  it('đổi sang "Dùng ảnh tham khảo" thì tới lượt đoạn mô tả bị báo là không dùng', () => {
    const c = base();
    c.variants![0]!.styleMode = "inspo";
    renderStyles(c);
    expect(screen.getByText(/Đoạn mô tả art style đang KHÔNG được dùng/)).toBeTruthy();
  });

  it("empty: 0 phong cách ⇒ nói được việc tiếp theo, không phải 'không có dữ liệu'", () => {
    renderStyles(base({ variants: [] }));
    expect(screen.getByText("Chưa có phong cách nào")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Thêm phong cách đầu tiên/ })).toBeTruthy();
  });

  it("chỉ-đọc: nút vẫn HIỆN, chỉ bị khoá kèm lý do (§2.5-2 cấm ẩn nút)", () => {
    renderStyles(base(), { readOnly: true, readOnlyReason: "Cần công cụ local đang chạy" });
    const add = screen.getByRole("button", { name: /Thêm phong cách/ });
    expect(add.hasAttribute("disabled")).toBe(true);
    expect(add.getAttribute("title")).toBe("Cần công cụ local đang chạy");
  });
});

describe("tab Nâng cao — TRUNG THỰC về thứ không chạy", () => {
  /* ĐỔI SỰ THẬT, KHÔNG ĐỔI NGUYÊN TẮC (07/09/2026). Tab này từng bày «Ngưỡng tách»,
     «Ngưỡng nghiêm», «Vành ngoài ô» và «Chất lượng tách» (ViTMatte/PyMatting) — cả
     bốn thuộc cỗ máy TÁCH NỀN mà `slice.py` không còn chạy. Một cái núm không nối
     vào gì tệ hơn hẳn một chỗ trống có lời giải thích, nên chúng bị bỏ và ca test
     đổi sang canh chuyện đó: không núm nào sống lại, và lý do phải đọc được. */
  function renderAdv() {
    return render(
      <TooltipProvider>
        <AdvancedTab onCheckMachine={() => {}} />
      </TooltipProvider>,
    );
  }

  it("KHÔNG còn núm tham số cắt nào để bấm", () => {
    renderAdv();
    for (const nhan of ["Ngưỡng tách", "Ngưỡng nghiêm", "Vành ngoài ô"]) {
      expect(screen.queryByLabelText(nhan)).toBeNull();
    }
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("nói thẳng VÌ SAO không còn gì để chỉnh", () => {
    renderAdv();
    expect(screen.getByText(/Không còn tham số nào để chỉnh/)).toBeTruthy();
    expect(screen.getByText(/cắt theo toạ độ ô/)).toBeTruthy();
  });

  it("không còn hứa hẹn ViTMatte/PyMatting — nói rõ là đã bỏ khỏi engine", () => {
    renderAdv();
    expect(screen.getByText(/đã bỏ khỏi engine/)).toBeTruthy();
    expect(screen.queryByText("✓ đã cài")).toBeNull();
    expect(screen.queryByText("chưa kiểm tra")).toBeNull();
  });

  it('nút "Kiểm tra máy" vẫn còn — doctor không dính gì tới tách nền', () => {
    renderAdv();
    expect(screen.getByRole("button", { name: "Kiểm tra máy" })).toBeTruthy();
  });
});
