/* @vitest-environment jsdom */
/**
 * BẰNG CHỨNG CHO ĐỢT 2026-08-14 — "SETTING SAO NÓ THÔ THẾ NÀY".
 *
 * Chủ sản phẩm nhìn trang Skeleton UI và chỉ đúng vào chỗ hỏng: mỗi thẻ thành phần lộ
 * ra hai ô nhập "Rộng %"/"Cao %" cộng một nút Chi tiết, nhân với 42 món thành một bức
 * tường control. Lời chốt: *"KIỂU ĐỂ HẾT TRONG 1 CÁI POPUP THÔI, ĐỪNG LỘ RA NGOÀI"*.
 *
 * Bốn thứ được khoá ở đây, mỗi thứ ứng với một câu trong spec mới:
 *  ① lưới thành phần KHÔNG còn một ô nhập nào nằm trần — phát biểu bằng phép QUÉT cả
 *    lưới (`querySelectorAll("input")`), không bằng cách đếm tay hai ô: đếm tay thì
 *    lần rò tiếp theo ở một control khác sẽ lọt;
 *  ② nút Chi tiết trên thẻ mở popup, và ô kích thước nằm TRONG popup đó;
 *  ③ lưới dáng mascot cũng theo đúng luật đó, và hai danh sách của trang Mascot cuộn
 *    được (`overflow-y-auto`) chứ không đổ tràn ra trang;
 *  ④ `?group=` cũ vẫn có đích để cuộn tới — anchor của mỗi nhóm là một hợp đồng giữa
 *    nơi vẽ khối và nơi cuộn, nên hình dạng của nó phải bị khoá.
 */
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "@/features/workflow-v4/lib/model";
import { KitsetStep } from "@/features/workflow-v4/steps/KitsetStep";
import { MascotStep } from "@/features/workflow-v4/steps/MascotStep";
import { RESULT_GROUP_ORDER, groupAnchorId } from "@/features/workflow-v4/lib/generated-results";

const PID = "kit-quan-ly";

const mount = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider><WorkflowStoreProvider projectId={PID}>{ui}</WorkflowStoreProvider></TooltipProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

/** Lưới thành phần/dáng của một màn — vùng mà "đừng lộ control ra ngoài" nói tới. */
const gridOf = (container: HTMLElement) => container.querySelector(".compact-element-grid")!;

describe("① lưới thành phần của trang Skeleton UI không còn control trần", () => {
  it("KHÔNG một ô nhập nào nằm ngoài popup — quét cả lưới, không đếm tay", () => {
    const { container } = mount(<KitsetStep variant="manage" />);
    const grid = gridOf(container);
    expect(grid.querySelectorAll(".compact-element").length).toBeGreaterThan(0);
    expect(grid.querySelectorAll("input")).toHaveLength(0);
    expect(grid.querySelectorAll("select, textarea")).toHaveLength(0);
  });

  it("thẻ vẫn giữ đủ ba thứ của nó: tên, hình và dấu chọn bấm được", () => {
    const { container } = mount(<KitsetStep variant="manage" />);
    const card = gridOf(container).querySelector<HTMLElement>(".compact-element")!;
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(card.querySelector(".compact-element-art svg")).toBeTruthy();
    expect(card.querySelector("strong")!.textContent).toBeTruthy();
    fireEvent.click(card);
    expect(card.getAttribute("aria-pressed")).toBe("false");
  });

  it("bản `wizard` KHÔNG mọc thêm nút Chi tiết — nó chỉ là bước chọn", () => {
    mount(<KitsetStep variant="wizard" />);
    expect(screen.queryAllByRole("button", { name: /^Chi tiết / })).toHaveLength(0);
  });
});

describe("② một popup gom hết mọi control chỉnh", () => {
  it("nút Chi tiết trên thẻ mở popup, và hai ô kích thước nằm TRONG popup", () => {
    const { container } = mount(<KitsetStep variant="manage" />);
    const detail = within(gridOf(container) as HTMLElement)
      .getAllByRole("button", { name: /^Chi tiết / })[0]!;
    fireEvent.click(detail);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Rộng %")).toBeTruthy();
    expect(within(dialog).getByLabelText("Cao %")).toBeTruthy();
    expect(within(dialog).getByText("Prompt sẽ gửi đi")).toBeTruthy();
  });

  it("số gõ trong popup đi thẳng vào lớp đè của dự án", () => {
    const { container } = mount(<KitsetStep variant="manage" />);
    const card = gridOf(container).querySelector<HTMLElement>(".compact-element")!;
    const file = createWorkflowStore(PID).getState().elements.find((element) => element.label === card.querySelector("strong")!.textContent)?.file;
    fireEvent.click(within(gridOf(container) as HTMLElement).getAllByRole("button", { name: /^Chi tiết / })[0]!);

    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Rộng %"), { target: { value: "42" } });
    expect(createWorkflowStore(PID).getState().elements.find((element) => element.file === file)?.skel?.w).toBe(0.42);
  });

  it("tick chọn cũng ở trong popup — sửa xong kích thước là bật/tắt được ngay", () => {
    const { container } = mount(<KitsetStep variant="manage" />);
    fireEvent.click(within(gridOf(container) as HTMLElement).getAllByRole("button", { name: /^Chi tiết / })[0]!);
    const box = within(screen.getByRole("dialog")).getByRole("checkbox", { name: /Vẽ thành phần này/ });
    const before = createWorkflowStore(PID).getState().elements.filter((element) => element.selected).length;
    fireEvent.click(box);
    expect(createWorkflowStore(PID).getState().elements.filter((element) => element.selected).length).toBe(before - 1);
  });
});

describe("③ trang Mascot theo cùng một luật, và hai danh sách cuộn được", () => {
  it("lưới dáng không còn control trần; nút Chi tiết mở popup của dáng", () => {
    const { container } = mount(<MascotStep variant="manage" />);
    const grid = gridOf(container);
    expect(grid.querySelectorAll("input")).toHaveLength(0);

    fireEvent.click(within(grid as HTMLElement).getAllByRole("button", { name: /^Chi tiết dáng / })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: /Vẽ dáng này/ })).toBeTruthy();
    expect(within(dialog).getByText(/30% × 85%/)).toBeTruthy();
  });

  it("lưới dáng CUỘN trong khối của nó, và chiều cao không bị bó cứng", () => {
    const { container } = mount(<MascotStep variant="manage" />);
    const cls = gridOf(container).className;
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toMatch(/max-h-/);
    // `h-[…]` cố định là thứ bị cấm: ít dáng thì khối phải co lại, không để hộp rỗng.
    expect(cls).not.toMatch(/(^|\s)h-\[/);
  });
});

describe("④ anchor của từng nhóm — hợp đồng của `?group=` cũ", () => {
  it("mỗi nhóm một id ổn định, không nhóm nào trùng nhóm nào", () => {
    const ids = RESULT_GROUP_ORDER.map(groupAnchorId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(groupAnchorId("mascot")).toBe("nhom-mascot");
    expect(groupAnchorId("prop")).toBe("nhom-prop");
  });

  it("thứ tự cuộn phủ ĐỦ mọi nhóm — thiếu một nhóm là ảnh của nhóm đó biến mất", () => {
    for (const group of ["mascot", "background", "popup", "ui", "prop", "other"] as const) {
      expect(RESULT_GROUP_ORDER).toContain(group);
    }
  });
});
