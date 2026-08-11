/* @vitest-environment jsdom */
/**
 * §SEGBAR — thanh phong cách đổi HÌNH THÁI: núm trượt → 7 khúc bấm được.
 *
 * Coverage cũ của núm trượt không bị xoá, nó ĐỔI THEO: ba điều cũ phải giữ (7 trục
 * đều là `role="slider"`, có nhãn hai cực, điều khiển được bằng bàn phím) cộng hai
 * điều mới (bấm khúc = nhảy nấc, chữ "nấc N trên 7" không còn hiện ra).
 *
 * Phát biểu ở dạng HÌNH DẠNG NHÌN ĐƯỢC chứ không phải chuỗi class: "có bao nhiêu
 * khúc đang tô đầy" đọc qua `data-on`, nên đổi token màu sau này không làm đỏ oan.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SemanticSlider, stepFromKey } from "../components/SemanticSlider";
import { STYLE_AXES, sliderValueText } from "../lib/style-phrases";

afterEach(cleanup);

const AXIS = STYLE_AXES[0]!; // Chín chắn ↔ Trẻ trung
const segs = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("[data-step]")];
const filled = (root: HTMLElement) => segs(root).filter((s) => s.dataset.on === "true").length;

describe("SEGBAR · hình thái: 7 khúc rời, tô đầy từ trái tới nấc đang chọn", () => {
  it("đủ 7 khúc, và số khúc tô đầy = giá trị", () => {
    for (const value of [1, 4, 7]) {
      const { container, unmount } = render(<SemanticSlider axis={AXIS} value={value} onChange={vi.fn()} />);
      expect(segs(container).length).toBe(7);
      expect(filled(container), `nấc ${value}`).toBe(value);
      unmount();
    }
  });

  it("nhãn hai cực vẫn còn — không có chúng thì thanh không nói lên trục nào", () => {
    render(<SemanticSlider axis={AXIS} value={4} onChange={vi.fn()} />);
    expect(screen.getByText("Chín chắn")).toBeTruthy();
    expect(screen.getByText("Trẻ trung")).toBeTruthy();
  });

  it("KHÔNG còn dòng chữ «nấc N trên 7» hiện ra dưới thanh", () => {
    const { container } = render(<SemanticSlider axis={AXIS} value={4} onChange={vi.fn()} />);
    expect(container.textContent).not.toMatch(/nấc \d+ trên 7/);
  });

  it("nghĩa của nấc KHÔNG mất, nó chuyển vào aria cho trình đọc màn hình", () => {
    render(<SemanticSlider axis={AXIS} value={6} onChange={vi.fn()} />);
    const bar = screen.getByRole("slider");
    expect(bar.getAttribute("aria-valuenow")).toBe("6");
    expect(bar.getAttribute("aria-valuemin")).toBe("1");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
    expect(bar.getAttribute("aria-label")).toBe("Chín chắn đến Trẻ trung");
    expect(bar.getAttribute("aria-valuetext")).toBe(sliderValueText(AXIS, 6));
  });
});

describe("SEGBAR · bấm khúc nào thì nhảy về khúc đó", () => {
  it("bấm khúc 6 ⇒ onChange(6); bấm khúc 2 ⇒ onChange(2)", () => {
    const onChange = vi.fn();
    const { container } = render(<SemanticSlider axis={AXIS} value={4} onChange={onChange} />);
    fireEvent.click(segs(container)[5]!);
    expect(onChange).toHaveBeenLastCalledWith(6);
    fireEvent.click(segs(container)[1]!);
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it("bấm đúng khúc đang chọn thì không bắn sự kiện thừa", () => {
    const onChange = vi.fn();
    const { container } = render(<SemanticSlider axis={AXIS} value={4} onChange={onChange} />);
    fireEvent.click(segs(container)[3]!);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("SEGBAR · bàn phím không được thụt lùi so với núm trượt", () => {
  it("thanh nhận được focus (tabIndex=0)", () => {
    render(<SemanticSlider axis={AXIS} value={4} onChange={vi.fn()} />);
    expect(screen.getByRole("slider").getAttribute("tabindex")).toBe("0");
  });

  it.each([
    ["ArrowRight", 5],
    ["ArrowUp", 5],
    ["ArrowLeft", 3],
    ["ArrowDown", 3],
    ["Home", 1],
    ["End", 7],
  ])("phím %s ở nấc 4 ⇒ nấc %i", (key, want) => {
    const onChange = vi.fn();
    render(<SemanticSlider axis={AXIS} value={4} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key });
    expect(onChange).toHaveBeenCalledWith(want);
  });

  it("kẹp ở hai đầu, và phím lạ không đụng vào giá trị", () => {
    expect(stepFromKey("ArrowLeft", 1)).toBe(1);
    expect(stepFromKey("ArrowRight", 7)).toBe(7);
    expect(stepFromKey("Tab", 4)).toBe(null);
    expect(stepFromKey("Enter", 4)).toBe(null);
  });
});

describe("SEGBAR · chống hồi quy về núm trượt", () => {
  const src = readFileSync(resolve(process.cwd(), "src/features/kit-form/components/SemanticSlider.tsx"), "utf8");

  it("không import lại primitive `ui/slider`", () => {
    expect(src).not.toMatch(/from "@\/components\/ui\/slider"/);
  });

  it("có ghi rõ đây là lựa chọn của chủ dự án — để wave sau khỏi 'sửa ngược'", () => {
    expect(src).toContain("LỰA CHỌN CỦA CHỦ DỰ ÁN");
  });
});
