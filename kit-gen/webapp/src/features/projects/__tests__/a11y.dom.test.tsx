/**
 * §5.8 — ĐIỀU KIỆN NGHIỆM THU về a11y, không phải mong muốn.
 * Bộ này kiểm những mục kiểm được không cần trình duyệt thật:
 *   A3  không dùng màu làm dấu hiệu duy nhất (mọi trạng thái có CHỮ)
 *   A5  ô tương tác là control THẬT, không `<div onclick>`
 *   A6  điều hướng bàn phím đủ; lưới là composite widget MỘT tabstop
 *   A9  ảnh có alt có nghĩa; icon-only có aria-label
 *   A12 tên do user nhập luôn escape
 *
 * KHÔNG kiểm được ở đây (nói thẳng): A1/A2 tương phản, A4 focus ring NHÌN THẤY,
 * A10 reduced-motion, A11 zoom 200%/reflow 320px — đều cần layout engine thật.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/hooks";
import { configureClient, _resetClient, } from "@/lib/api/client";
import { checkingStatus } from "@/lib/api";
import { _setBackend, memoryBackend } from "@/lib/store";
import { projectSchema, type Project } from "@/lib/types";
import { gateOf } from "../lib/gate";
import { ProjectCard } from "../components/ProjectCard";
import { ProjectsListView } from "../components/ProjectsListView";
import { useGridKeys, columnsOf } from "../lib/useGridKeys";
import type { ProjectActions } from "../components/ProjectMenu";

const GATE = gateOf({ ...checkingStatus(null), pill: "connected", connected: true, readOnly: false, case: "none" });
const P = (o: Record<string, unknown> & { id: string }): Project => projectSchema.parse({ name: o.id, ...o });

const items = [
  P({ id: "a", name: 'Tết "26" <b>xss</b>', tags: ["tet"], stats: { sheets: 5, diskBytes: 1 }, state: { jobs: { j: "stale" } } }),
  P({ id: "b", name: "Candy Lite", stats: { sheets: 3, diskBytes: 2 }, state: { jobs: { j: "ok" } } }),
  P({ id: "c", name: "Mid-Autumn", stats: { sheets: 0, diskBytes: 0 }, state: { jobs: {} } }),
];

const noop = () => {};
const ACTIONS: ProjectActions = {
  open: noop, rename: noop, duplicate: noop, exportZip: noop, clean: noop, remove: noop,
};

function wrap(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Component thử nghiệm dùng ĐÚNG hook thật của màn. */
function Grid({ onOpen, onDelete }: { onOpen?: (id: string) => void; onDelete?: (id: string) => void }) {
  const ids = items.map((p) => p.id);
  const grid = useGridKeys(ids, { ...(onOpen ? { onOpen } : {}), ...(onDelete ? { onDelete } : {}) });
  return (
    <div ref={grid.containerRef} role="list">
      {items.map((p, i) => (
        <ProjectCard
          key={p.id} project={p} actions={ACTIONS} gate={GATE} fromCache={false}
          tabIndex={grid.tabIndexFor(i)} onNextStep={noop} onBrokenDetail={noop}
        />
      ))}
    </div>
  );
}

beforeEach(() => {
  _setBackend(memoryBackend());
  _resetClient();
  const f = vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
  Object.defineProperty(URL, "createObjectURL", { value: () => "blob:x", writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("A6 — lưới thẻ là composite widget, ĐÚNG MỘT tabstop", () => {
  it("chỉ thẻ đầu có tabIndex=0, còn lại -1", () => {
    wrap(<Grid />);
    const cards = document.querySelectorAll("[data-project-card]");
    expect(cards).toHaveLength(3);
    expect([...cards].map((c) => c.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("→ chuyển focus sang thẻ kế; ← quay lại", () => {
    wrap(<Grid />);
    const cards = [...document.querySelectorAll<HTMLElement>("[data-project-card]")];
    cards[0]!.focus();
    fireEvent.keyDown(cards[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cards[1]);
    fireEvent.keyDown(cards[1]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cards[0]);
  });

  it("End về thẻ cuối, Home về thẻ đầu", () => {
    wrap(<Grid />);
    const cards = [...document.querySelectorAll<HTMLElement>("[data-project-card]")];
    cards[0]!.focus();
    fireEvent.keyDown(cards[0]!, { key: "End" });
    expect(document.activeElement).toBe(cards[2]);
    fireEvent.keyDown(cards[2]!, { key: "Home" });
    expect(document.activeElement).toBe(cards[0]);
  });

  it("Enter MỞ project đang focus", () => {
    const onOpen = vi.fn();
    wrap(<Grid onOpen={onOpen} />);
    const cards = [...document.querySelectorAll<HTMLElement>("[data-project-card]")];
    cards[1]!.focus();
    fireEvent.keyDown(cards[1]!, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith("b");
  });

  it("⌫/Delete gọi luồng XOÁ (có modal xác nhận ở tầng trên)", () => {
    const onDelete = vi.fn();
    wrap(<Grid onDelete={onDelete} />);
    const cards = [...document.querySelectorAll<HTMLElement>("[data-project-card]")];
    cards[0]!.focus();
    fireEvent.keyDown(cards[0]!, { key: "Delete" });
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("KHÔNG cướp phím khi con trỏ đang trong ô nhập (§2.3 câu cuối)", () => {
    const onDelete = vi.fn();
    wrap(
      <div>
        {/* ô nhập nằm TRONG vùng lưới — đúng ca sửa tên inline sau này */}
        <Grid onDelete={onDelete} />
      </div>,
    );
    const gridRoot = document.querySelector<HTMLElement>('[role="list"]')!;
    const input = document.createElement("input");
    gridRoot.appendChild(input);
    input.focus();

    // Bắn sự kiện THẬT từ chính ô nhập, để nó nổi bọt lên listener của lưới.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(onDelete).not.toHaveBeenCalled();

    // Đối chứng: cũng phím đó, bắn từ THẺ thì phải chạy.
    const card = document.querySelector<HTMLElement>("[data-project-card]")!;
    card.focus();
    card.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(onDelete).toHaveBeenCalledWith("a");
  });

  it("columnsOf đo số cột THẬT theo offsetTop (không đoán từ CSS)", () => {
    const mk = (top: number) => ({ offsetTop: top }) as HTMLElement;
    expect(columnsOf([mk(0), mk(0), mk(0), mk(200)])).toBe(3);
    expect(columnsOf([])).toBe(1);
    expect(columnsOf([mk(0)])).toBe(1);
  });
});

describe("A5/A9 — control thật + nhãn", () => {
  it("mọi nút icon-only đều có aria-label", () => {
    wrap(<Grid />);
    for (const btn of screen.getAllByRole("button")) {
      const hasText = (btn.textContent ?? "").trim().length > 0;
      const hasLabel = Boolean(btn.getAttribute("aria-label"));
      expect(hasText || hasLabel, `nút không nhãn: ${btn.outerHTML.slice(0, 90)}`).toBe(true);
    }
  });

  it("menu ⋯ là <button> có aria-label nêu TÊN project", () => {
    wrap(<Grid />);
    expect(screen.getByRole("button", { name: "Thao tác khác cho Candy Lite" })).toBeTruthy();
  });

  it("ô tick trong bảng là control thật, có nhãn riêng cho từng dòng", () => {
    wrap(
      <ProjectsListView
        items={items} actions={ACTIONS} gate={GATE} selected={[]} onSelectedChange={noop}
        tabIndexFor={(i) => (i === 0 ? 0 : -1)} onBrokenDetail={noop}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Chọn Candy Lite" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Chọn tất cả/ })).toBeTruthy();
  });
});

describe("A3 — trạng thái luôn có CHỮ, không chỉ màu", () => {
  it("mỗi thẻ có badge trạng thái đọc được thành chữ", () => {
    wrap(<Grid />);
    expect(screen.getByText("Thiết kế đã đổi sau lần sinh ảnh cuối")).toBeTruthy();
    expect(screen.getByText("Mọi thứ đã đồng bộ")).toBeTruthy();
    expect(screen.getByText("Chưa bắt đầu")).toBeTruthy();
  });
});

describe("A12 — tên user nhập luôn được escape (đóng I6)", () => {
  it('tên `Tết "26" <b>xss</b>` KHÔNG sinh thẻ <b> trong DOM', async () => {
    const { container } = wrap(<Grid />);
    await waitFor(() => expect(screen.getByText('Tết "26" <b>xss</b>')).toBeTruthy());
    expect(container.querySelector("article b")).toBeNull();
  });
});

describe("chọn nhiều: ⇧+click chọn DẢI (§3-S1 phím tắt)", () => {
  it("bấm dòng 1 rồi ⇧+bấm dòng 3 ⇒ chọn cả 3", () => {
    let selected: string[] = [];
    const onChange = vi.fn((ids: string[]) => {
      selected = ids;
    });
    const { rerender } = wrap(
      <ProjectsListView
        items={items} actions={ACTIONS} gate={GATE} selected={selected} onSelectedChange={onChange}
        tabIndexFor={() => -1} onBrokenDetail={noop}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: 'Chọn Tết "26" <b>xss</b>' }));
    expect(selected).toEqual(["a"]);

    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          <ProjectsListView
            items={items} actions={ACTIONS} gate={GATE} selected={selected} onSelectedChange={onChange}
            tabIndexFor={() => -1} onBrokenDetail={noop}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn Mid-Autumn" }), { shiftKey: true });
    expect(new Set(selected)).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("§2.5-3 ảnh: agent tắt ⇒ khung có CHỮ, không icon vỡ", () => {
  it('hiện "Ảnh nằm trên máy bạn" thay vì <img> hỏng', () => {
    const off = gateOf({
      ...checkingStatus(null), pill: "not-found", connected: false, readOnly: true, case: "agent-not-running",
    });
    wrap(
      <ProjectCard
        project={P({ id: "a", name: "Có ảnh bìa", cover: "kits/x.png" })}
        actions={ACTIONS} gate={off} fromCache tabIndex={0} onNextStep={noop} onBrokenDetail={noop}
      />,
    );
    expect(screen.getByText("Ảnh nằm trên máy bạn")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("thẻ vẽ từ cache có NHÃN CHỮ `cache` (§2.5-4), không chỉ xám đi", () => {
    const card = screen.queryByLabelText?.("Project Có ảnh bìa");
    void card;
    wrap(
      <ProjectCard
        project={P({ id: "a", name: "X" })}
        actions={ACTIONS} gate={GATE} fromCache tabIndex={0} onNextStep={noop} onBrokenDetail={noop}
      />,
    );
    const article = screen.getByLabelText("Project X");
    expect(within(article).getByText("cache")).toBeTruthy();
  });
});
