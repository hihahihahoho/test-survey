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

describe("tab Nâng cao — TRUNG THỰC về M4", () => {
  function renderAdv(over: Record<string, unknown> = {}) {
    const noop = () => {};
    return render(
      <TooltipProvider>
        <AdvancedTab
          contract={base()}
          readOnly={false}
          readOnlyReason=""
          deps={null}
          onPatchSlice={noop}
          onCheckMachine={noop}
          {...over}
        />
      </TooltipProvider>,
    );
  }

  it('ô "Vành ngoài ô" đeo badge «chưa có tác dụng» và giải thích vì sao', () => {
    renderAdv();
    const bleed = screen.getByLabelText("Vành ngoài ô");
    expect(bleed).toBeTruthy();
    // Lời cảnh báo phải nối được với ô nhập qua aria-describedby (screen reader đọc được).
    const describedBy = bleed.getAttribute("aria-describedby")!;
    const why = document.getElementById(describedBy)!;
    expect(why.textContent).toContain("chưa làm thay đổi kết quả cắt");
    expect(screen.getAllByText("chưa có tác dụng").length).toBeGreaterThan(0);
  });

  it("chất lượng tách: nói rõ engine TỰ DÒ, không có công tắc", () => {
    renderAdv();
    expect(screen.getByText(/tự dò/)).toBeTruthy();
    expect(screen.getByText(/không có công tắc để ép/)).toBeTruthy();
  });

  it("ngưỡng tách / ngưỡng nghiêm thì KHÔNG bị gắn nhãn vô hiệu (chúng chạy thật)", () => {
    renderAdv();
    expect(screen.getByLabelText("Ngưỡng tách")).toBeTruthy();
    expect(screen.getByLabelText("Ngưỡng nghiêm")).toBeTruthy();
    expect(screen.getByText(/engine đọc thật khi cắt/)).toBeTruthy();
  });

  it("trạng thái máy: chưa hỏi doctor thì nói 'chưa kiểm tra', không đoán bừa là 'chưa cài'", () => {
    renderAdv();
    expect(screen.getAllByText("chưa kiểm tra")).toHaveLength(2);
    cleanup();
    renderAdv({ deps: { vitmatte: false, pymatting: true } });
    expect(screen.getByText("✗ chưa cài")).toBeTruthy();
    expect(screen.getByText("✓ đã cài")).toBeTruthy();
  });
});
