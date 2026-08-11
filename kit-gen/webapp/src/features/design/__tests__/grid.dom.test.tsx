/**
 * LƯỚI Ô — kiểm HÀNH VI THẬT trên DOM, không phải kiểm "component render không lỗi".
 *
 * Ba thứ spec đòi mà chỉ đo được bằng cách mount thật:
 *   · composite widget: role=grid/row/gridcell, MỘT tabstop (§5.8-A6)
 *   · ⌥←→↑↓ ĐỔI VỊ TRÍ element, mũi tên trần chỉ di chuyển con trỏ
 *   · ô trống / ô lỗi phân biệt được KHÔNG CẦN MÀU (A3) — qua aria-label và ký hiệu
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import type { Sheet } from "@/lib/types/contract";
import { CellGrid } from "../components/CellGrid";
import { validateDesign } from "../lib/validate";

afterEach(cleanup);

function makeSheet(): Sheet {
  return {
    id: "main",
    grid: { cols: 2, rows: 2 },
    orient: "landscape",
    components: [
      { file: "01-btn-red", vi: "Nút đỏ", spec: "x", skel: { shape: "pill", w: 0.8, h: 0.4, matte: "glow" } },
      { file: "02-btn-blue", vi: "Nút xanh", spec: "y", skel: { shape: "pill", w: 0.8, h: 0.4, slice9: true } },
      { file: "", vi: "", spec: "", skel: { shape: "empty", w: 1, h: 1 } },
      { file: "SAI TÊN", vi: "Hỏng", spec: "z", skel: { shape: "rrect", w: 0.5, h: 0.5, free: true } },
    ],
  };
}

function renderGrid(over: Partial<React.ComponentProps<typeof CellGrid>> = {}) {
  const sheet = makeSheet();
  const validation = validateDesign({ sheets: [sheet], characterPoses: [], variants: [] });
  const onMove = vi.fn();
  const onSelect = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <CellGrid
      sheet={sheet}
      validation={validation}
      selectedIndex={0}
      onSelect={onSelect}
      onMove={onMove}
      onDelete={onDelete}
      {...over}
    />,
  );
  return { ...utils, onMove, onSelect, onDelete, sheet };
}

describe("a11y: composite widget đúng §5.8-A6", () => {
  it("có role grid/row/gridcell và ĐÚNG MỘT tabstop", () => {
    renderGrid();
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getAllByRole("gridcell")).toHaveLength(4);
    const focusable = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
    expect(focusable, "chỉ một ô nhận Tab").toHaveLength(1);
  });

  it("aria-label đủ nghĩa khi đọc một mình: vị trí, nội dung, cờ, lỗi", () => {
    renderGrid();
    const labels = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? "");
    expect(labels[0]).toContain("Ô 1");
    expect(labels[0]).toContain("Nút đỏ");
    expect(labels[0]).toContain("glow"); // cờ matte đọc được, không chỉ là icon
    expect(labels[0]).toContain("đang chọn");
    expect(labels[1]).toContain("Cắt 9 lát");
    expect(labels[2]).toContain("trống"); // ô trống phân biệt bằng CHỮ, không chỉ màu
    expect(labels[3]).toContain("có lỗi"); // ô sai V-01 nói ra là có lỗi
    expect(labels[3]).toContain("Khung tự do");
  });

  it("ô là <button> thật, không phải div bấm được (đóng audit I2/A5)", () => {
    renderGrid();
    for (const b of screen.getAllByRole("button")) expect(b.tagName).toBe("BUTTON");
  });
});

describe("bàn phím", () => {
  it("mũi tên TRẦN chỉ di chuyển con trỏ, KHÔNG đổi vị trí element", () => {
    const { onSelect, onMove } = renderGrid();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("⌥→ và ⌥↓ ĐỔI VỊ TRÍ (yêu cầu §2 của brief)", () => {
    const { onMove } = renderGrid();
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowRight", altKey: true });
    expect(onMove).toHaveBeenCalledWith(0, 1);
    fireEvent.keyDown(grid, { key: "ArrowDown", altKey: true });
    expect(onMove).toHaveBeenCalledWith(0, 2); // xuống 1 hàng = +cols
  });

  it("không đi ra ngoài biên lưới", () => {
    const { onSelect, onMove } = renderGrid();
    const grid = screen.getByRole("grid");
    fireEvent.keyDown(grid, { key: "ArrowLeft" }); // đang ở ô 0
    fireEvent.keyDown(grid, { key: "ArrowUp" });
    fireEvent.keyDown(grid, { key: "ArrowLeft", altKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("⌫ xoá ô đang chọn; chế độ chỉ-đọc thì KHÔNG", () => {
    const a = renderGrid();
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Backspace" });
    expect(a.onDelete).toHaveBeenCalledWith(0);
    cleanup();

    const b = renderGrid({ readOnly: true });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Backspace" });
    expect(b.onDelete).not.toHaveBeenCalled();
  });

  it("chỉ-đọc: ⌥→ chỉ di chuyển con trỏ, không sửa dữ liệu", () => {
    const { onMove, onSelect } = renderGrid({ readOnly: true });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "ArrowRight", altKey: true });
    expect(onMove).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("Home/End nhảy đầu/cuối HÀNG (không phải đầu/cuối lưới)", () => {
    const { onSelect } = renderGrid({ selectedIndex: 2 }); // hàng 2, ô đầu
    fireEvent.keyDown(screen.getByRole("grid"), { key: "End" });
    expect(onSelect).toHaveBeenCalledWith(3);
  });
});

describe("hiển thị", () => {
  it("ô trống có ký hiệu ␀ (không chỉ dựa vào nét đứt/màu)", () => {
    renderGrid();
    expect(screen.getByText("␀")).toBeTruthy();
    expect(screen.getAllByText("trống").length).toBeGreaterThan(0);
  });

  it("badge cờ matte/slice9/free hiện đủ ba (yêu cầu §2 của brief)", () => {
    renderGrid();
    expect(screen.getByText("glow")).toBeTruthy();
    expect(screen.getByTitle("Cắt 9 lát (co giãn giữ góc)")).toBeTruthy();
    expect(screen.getByText("tự do")).toBeTruthy();
  });

  it("lưới vẽ ĐÚNG cols×rows ô, kể cả khi sheet có ít component hơn", () => {
    const sheet: Sheet = { id: "s", grid: { cols: 3, rows: 2 }, components: [] };
    render(
      <CellGrid
        sheet={sheet}
        validation={validateDesign({ sheets: [sheet], characterPoses: [] })}
        selectedIndex={0}
        onSelect={() => {}}
        onMove={() => {}}
      />,
    );
    expect(screen.getAllByRole("gridcell")).toHaveLength(6);
  });
});
