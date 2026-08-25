/* @vitest-environment jsdom */
/**
 * HỒI QUY QA-BLIND §2 + §3 — BƯỚC "SKELETON UI" PHẢI ĐẾM ĐÚNG THỨ MẮT THẤY.
 *
 * Hai lỗi khác nhau, cùng một triệu chứng ("con số không khớp thứ đang tick"), cả ba
 * người test mù độc lập đều báo:
 *
 *  ① **Phần tử "ma"** — `PRESET_MISSING_DESIGN` nhồi `wheel-board` vào kitset
 *    (`lib/model.ts:170`) nhưng `element-lib-v2.json` không có món ấy ⇒ không render
 *    ô tick nào, mà bộ đếm lại đọc `workflow.elements` toàn store ⇒ dư đúng +1 vĩnh
 *    viễn. Bỏ tick sạch cả bốn nhóm vẫn thấy "1 đã chọn".
 *
 *  ② **Một món hai nhóm** — `22-board-panel` khớp CẢ vị từ `popup` (regex bắt chữ
 *    "panel") lẫn `props` (`isPropElement` có `board-panel` trong danh sách trắng) ⇒
 *    hiện ở hai tab, dùng chung một ô tick; bấm "Bỏ chọn nhóm này" bên Popup thì số
 *    đếm Đạo cụ tự tụt mà người dùng không đụng gì bên đó.
 *
 * `wheel-board` KHÔNG bị xoá khỏi kitset — nó mang `mock:true` và `buildKitsetContract`
 * đã loại nó khỏi contract kèm lý do, tức PHẠM VI GEN vốn đã đúng. Ca cuối khoá đúng
 * điều đó lại: sửa bộ đếm không được phép đụng vào thứ gửi đi gen.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { KitsetStep, groupOf } from "../steps/KitsetStep";

const PID = "kit-qa-dem";
const LIB = loadBundledV2().elements;
const GROUP_LABELS = ["Nền", "Popup", "UI nhỏ", "Đạo cụ"] as const;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <WorkflowStoreProvider projectId={PID}><KitsetStep /></WorkflowStoreProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

const state = () => createWorkflowStore(PID).getState();

/**
 * Chip nhóm hiện ĐÚNG "Nhãn" hoặc "Nhãn · N" — khớp cả chuỗi, không khớp tiền tố:
 * thẻ element cũng có tên bắt đầu bằng "Nền…" ("Nền trang chủ"), nên `/^Nền/` mơ hồ.
 */
const chip = (label: string): HTMLElement => {
  const re = new RegExp(`^${label}( · \\d+)?$`);
  const hit = screen.getAllByRole("button").find((b) => re.test((b.textContent ?? "").trim()));
  if (!hit) throw new Error(`không thấy chip nhóm "${label}"`);
  return hit;
};
const chipCount = (label: string): number => {
  const m = /·\s*(\d+)/.exec(chip(label).textContent ?? "");
  return m ? Number(m[1]) : 0;
};
const counterText = () => screen.getByText(/đã chọn$/).textContent ?? "";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

describe("§3 — mỗi thành phần thuộc ĐÚNG một nhóm", () => {
  it("không món nào của thư viện rơi vào hai nhóm, và không món nào rơi ra ngoài", () => {
    const seen = new Map<string, string[]>();
    for (const element of LIB) {
      const g = groupOf(element);
      expect(g, `${element.file} không thuộc nhóm nào`).not.toBeNull();
      seen.set(g!, [...(seen.get(g!) ?? []), element.file]);
    }
    const total = [...seen.values()].reduce((sum, files) => sum + files.length, 0);
    // Tổng bốn nhóm = tổng catalogue. Trước bản vá là 43 trên một thư viện 42 món.
    expect(total).toBe(LIB.length);
  });

  it("`22-board-panel` ở Đạo cụ — nơi `isPropElement` đã cố ý xếp nó — chứ không ở Popup", () => {
    const glass = LIB.find((e) => e.file === "22-board-panel")!;
    expect(groupOf(glass)).toBe("props");
  });

  it("tổng số món hiện ở bốn tab đúng bằng số món của thư viện, không món nào hiện hai lần", () => {
    const { container } = mount();
    const files: string[] = [];
    for (const label of GROUP_LABELS) {
      fireEvent.click(chip(label));
      const grid = container.querySelector(".compact-element-grid") as HTMLElement;
      for (const card of within(grid).getAllByRole("button")) {
        files.push(card.textContent ?? "");
      }
    }
    expect(files).toHaveLength(LIB.length);
    expect(new Set(files).size).toBe(files.length);
  });

  it("bỏ chọn nhóm Popup KHÔNG làm đổi số của nhóm Đạo cụ", () => {
    mount();
    const propsBefore = chipCount("Đạo cụ");
    fireEvent.click(chip("Popup"));
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn nhóm này" }));
    expect(chipCount("Popup")).toBe(0);
    expect(chipCount("Đạo cụ")).toBe(propsBefore);
  });
});

describe("§2 — bộ đếm chỉ đếm thứ có ô tick trên màn", () => {
  it("mở ra: tổng đúng bằng số món của thư viện, KHÔNG dư `wheel-board`", () => {
    mount();
    expect(counterText()).toBe(`${LIB.length}/${LIB.length} đã chọn`);
    // …trong khi store vẫn giữ món mock: bộ đếm được sửa ở tầng ĐẾM, không phải bằng
    // cách rút ruột kitset.
    expect(state().elements.some((e) => e.file === "wheel-board" && e.selected)).toBe(true);
  });

  it("bỏ chọn hết bốn nhóm ⇒ tổng về 0, không còn số dư ma", () => {
    mount();
    for (const label of GROUP_LABELS) {
      fireEvent.click(chip(label));
      fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn nhóm này" }));
    }
    expect(counterText()).toBe(`0/${LIB.length} đã chọn`);
  });

  it("phần tử đã lưu trong bản nháp mà catalogue không còn ⇒ không được đếm", () => {
    /* Cùng vết đau, nguồn thứ hai: bộ khung người dùng tự thêm rồi xoá khỏi thư viện
       vẫn nằm lại trong `elements` đã persist. */
    const store = createWorkflowStore(PID);
    store.setState({
      kitsetTouched: true,
      elements: [
        { file: "90-custom-da-xoa", label: "Món đã xoá", role: "r", cell: "ngang", selected: true },
        { file: LIB[0]!.file, label: LIB[0]!.vi, role: "r", cell: "ngang", selected: true },
      ],
    });
    mount();
    expect(counterText()).toBe(`1/${LIB.length} đã chọn`);
  });
});

describe("§8 — nút bỏ chọn / chọn tất cả toàn cục", () => {
  it("«Bỏ chọn tất cả» quét cả bốn nhóm bằng một cú bấm", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn tất cả" }));
    expect(counterText()).toBe(`0/${LIB.length} đã chọn`);
    for (const label of GROUP_LABELS) expect(chipCount(label)).toBe(0);
  });

  it("«Chọn tất cả N thành phần» đưa về lại đầy đủ", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn tất cả" }));
    fireEvent.click(screen.getByRole("button", { name: `Chọn tất cả ${LIB.length} thành phần` }));
    expect(counterText()).toBe(`${LIB.length}/${LIB.length} đã chọn`);
  });

  it("bỏ chọn tất cả KHÔNG kéo theo món `mock` ra khỏi kitset — phạm vi gen giữ nguyên luật cũ", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn tất cả" }));
    const wheel = state().elements.find((e) => e.file === "wheel-board");
    expect(wheel?.mock).toBe(true);
    // `buildKitsetContract` vẫn là nơi DUY NHẤT quyết định cái gì được vẽ, và nó loại
    // `mock` từ trước bản vá này (`kitset-to-contract.ts:191`).
    expect(state().elements.filter((e) => e.selected && !e.mock)).toHaveLength(0);
  });
});
