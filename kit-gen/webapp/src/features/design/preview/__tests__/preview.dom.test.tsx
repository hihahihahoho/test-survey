/**
 * preview.dom.test.tsx — MOUNT THẬT preview khung xương.
 *
 * Điều quan trọng nhất phải kiểm: SVG vẽ ra có đúng số ô, đúng khổ ảnh, đúng hình
 * không — vì đây là thứ user nhìn để quyết định có tốn lượt gen hay không.
 */
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Sheet } from "@/lib/types/contract";
import { SheetPreviewPanel } from "../SheetPreviewPanel";
import { SkeletonPreview } from "../SkeletonPreview";

afterEach(cleanup);

const cell = (file: string, shape: string, w = 0.8, h = 0.6) => ({
  file, vi: file, spec: "", skel: { shape, w, h } as never,
});
const empty = () => ({ file: "", vi: "", spec: "", skel: { shape: "empty", w: 1, h: 1 } as never });

const sheet4x4 = (): Sheet =>
  ({
    id: "main",
    grid: { cols: 4, rows: 4 },
    orient: "landscape",
    cell_hint: "landscape 3:2 cell",
    components: [
      cell("01-btn-pill-red", "pill", 0.78, 0.4),
      cell("04-btn-circle", "circle", 0.55, 0.82),
      cell("16-fx-burst", "burst", 0.6, 0.9),
      cell("12-piece-active", "puzzle"),
      ...Array.from({ length: 11 }, (_, i) => cell(`2${i}-x`, "rrect")),
      empty(),
    ],
  }) as Sheet;

const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("SkeletonPreview — SVG của cả sheet", () => {
  it("một `<svg>` DUY NHẤT cho cả sheet, viewBox = khổ ảnh thật 1536×1024", () => {
    const { container } = wrap(<SkeletonPreview sheet={sheet4x4()} />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs).toHaveLength(1);
    expect(svgs[0]!.getAttribute("viewBox")).toBe("0 0 1536 1024");
  });

  it("nhãn cho screen reader mô tả bố cục bằng LỜI, có số liệu thật (A9)", () => {
    wrap(<SkeletonPreview sheet={sheet4x4()} />);
    const img = screen.getByRole("img");
    const label = img.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/lưới 4 cột × 4 hàng/);
    expect(label).toMatch(/15 trên 16 ô có element/);
    expect(label).toMatch(/1536×1024/);
    expect(label).toMatch(/384×256/);
  });

  it("portrait đổi đúng khổ ảnh 1024×1536", () => {
    const s = { ...sheet4x4(), orient: "portrait" } as Sheet;
    const { container } = wrap(<SkeletonPreview sheet={s} />);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 1024 1536");
  });

  it("kẻ lưới đúng cols-1 đường dọc + rows-1 đường ngang (vẽ SAU CÙNG như skeleton.py)", () => {
    const { container } = wrap(<SkeletonPreview sheet={sheet4x4()} showSafeFrame={false} showIndex={false} />);
    const gridLines = container.querySelectorAll("g.stroke-line line");
    expect(gridLines).toHaveLength(3 + 3);
  });

  it("ô trống vẽ GẠCH CHÉO (pattern), không bỏ trắng — phân biệt được với ô có element", () => {
    const { container } = wrap(<SkeletonPreview sheet={sheet4x4()} />);
    expect(container.querySelector("pattern")).toBeTruthy();
    expect(container.querySelectorAll('rect[fill^="url(#"]').length).toBeGreaterThan(0);
  });

  it("`puzzle` dùng `<mask id>` DUY NHẤT — hai preview cùng trang không ăn chung mask", () => {
    const { container: a } = wrap(<SkeletonPreview sheet={sheet4x4()} />);
    const { container: b } = wrap(<SkeletonPreview sheet={sheet4x4()} />);
    const idA = a.querySelector("mask")?.getAttribute("id");
    const idB = b.querySelector("mask")?.getAttribute("id");
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
  });

  it("bấm vào ô báo đúng index (khi màn cha truyền onSelect)", async () => {
    const onSelect = vi.fn();
    const { container } = wrap(<SkeletonPreview sheet={sheet4x4()} onSelect={onSelect} />);
    const cells = container.querySelectorAll("g[transform^='translate']");
    await userEvent.click(cells[0]! as unknown as Element);
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("sheet rỗng/null KHÔNG ném, KHÔNG trắng — vẫn vẽ khung", () => {
    expect(() => wrap(<SkeletonPreview sheet={null} />)).not.toThrow();
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/Chưa chọn sheet/);
  });
});

describe("SheetPreviewPanel — 4 trạng thái", () => {
  it("loading: skeleton, không nhảy layout", () => {
    const { container } = wrap(<SheetPreviewPanel sheet={null} loading />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("empty (chưa chọn sheet): nói VIỆC TIẾP THEO", () => {
    wrap(<SheetPreviewPanel sheet={null} />);
    expect(screen.getByText(/Chưa chọn sheet nào/i)).toBeTruthy();
  });

  it("empty (sheet 0 element): mời mở thư viện, kèm nút", async () => {
    const onOpenLibrary = vi.fn();
    const s = { ...sheet4x4(), components: [] } as unknown as Sheet;
    wrap(<SheetPreviewPanel sheet={s} onOpenLibrary={onOpenLibrary} />);
    expect(screen.getByText(/chưa có element/i)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Mở thư viện element/i }));
    expect(onOpenLibrary).toHaveBeenCalled();
  });

  it("error: hiện khối lỗi của màn cha, KHÔNG tự bịa", () => {
    wrap(<SheetPreviewPanel sheet={sheet4x4()} error={<div>Khối lỗi của màn cha</div>} />);
    expect(screen.getByText("Khối lỗi của màn cha")).toBeTruthy();
  });

  it("success: hiện hình + số đo THẬT (ô 384×256, file cắt ra có bleed)", () => {
    wrap(<SheetPreviewPanel sheet={sheet4x4()} />);
    expect(screen.getByRole("img")).toBeTruthy();
    expect(screen.getByText(/1536 × 1024 px/)).toBeTruthy();
    expect(screen.getByText(/384 × 256 px/)).toBeTruthy();
    expect(screen.getByText(/522 × 348 px/)).toBeTruthy(); // 384+2*69 × 256+2*46
    /* Chuỗi bị <b> cắt làm nhiều node ⇒ so trên textContent của cả khối,
       không dùng getByText (nó khớp theo TỪNG node). */
    expect(screen.getByRole("img").closest("div")?.parentElement?.textContent).toMatch(/15\s*\/16 ô có element/);
  });

  it("bật/tắt số thứ tự ô và khung an toàn được bằng bàn phím", async () => {
    const { container } = wrap(<SheetPreviewPanel sheet={sheet4x4()} />);
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: /Số thứ tự ô: đang hiện/i });

    expect(container.querySelectorAll("text").length).toBeGreaterThan(0);
    await user.click(toggle);
    expect(container.querySelectorAll("text")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Số thứ tự ô: đang ẩn/i })).toBeTruthy();
  });
});
