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
 *  ③ lưới dáng mascot cũng theo đúng luật đó, và hai danh sách của trang Mascot đổ
 *    THẲNG ra trang — không khối nào tự mọc thanh cuộn riêng (đợt 2026-08-14b, xem
 *    describe ③ bên dưới để biết vì sao đảo lại yêu cầu cũ);
 *  ④ `?group=` cũ vẫn có đích để cuộn tới — anchor của mỗi nhóm là một hợp đồng giữa
 *    nơi vẽ khối và nơi cuộn, nên hình dạng của nó phải bị khoá.
 */
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "@/features/kit-core/lib/model";
import { KitsetStep } from "@/features/kit-core/steps/KitsetStep";
import { MascotStep } from "@/features/kit-core/steps/MascotStep";
import { RESULT_GROUP_ORDER, groupAnchorId } from "@/features/kit-core/lib/generated-results";

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

/**
 * ĐỢT 2026-08-14b — ĐẢO LẠI YÊU CẦU CỦA ③. Đọc trước khi định "sửa lại cho giống cũ".
 *
 * Chủ sản phẩm báo kèm ảnh: *lăn chuột ngang qua khu "Bộ dáng" là trang khựng khựng*.
 * Thủ phạm là chính hộp cuộn mà bản trước dựng lên:
 * `max-h-[min(60vh,34rem)] overflow-y-auto overscroll-contain`.
 *
 * Cơ chế (đo bằng Chromium, không suy đoán): `overflow-y-auto` biến khối thành scroll
 * container NGAY CẢ KHI nội dung không tràn — một nhóm dáng chỉ có 3–4 thẻ nên khối cao
 * 200px, còn trần là 540px. Cộng `overscroll-behavior-y: contain` thì container ấy NUỐT
 * wheel event thay vì nhả cho trang. Số đo: contain+auto ⇒ `scrollY` đứng im 0 · auto
 * trần ⇒ 200 · không overflow ⇒ 200.
 *
 * "MASCOT, CHO NÓ SHOW SCROLL ĐƯỢC" nghĩa là XEM ĐƯỢC HẾT, không phải "có hộp con mang
 * thanh cuộn". Nên ca test nay phát biểu ở dạng PHỦ ĐỊNH HÌNH DẠNG và quét CẢ CÂY DOM
 * của bước, chứ không chỉ nhìn một class trên lưới: rò rỉ ở khối cha hay khối con thì
 * đếm tay đều lọt.
 */
describe("③ trang Mascot theo cùng một luật, và không khối nào cuộn riêng", () => {
  it("lưới dáng không còn control trần; nút Chi tiết mở popup của dáng", () => {
    const { container } = mount(<MascotStep variant="manage" />);
    const grid = gridOf(container);
    expect(grid.querySelectorAll("input")).toHaveLength(0);

    fireEvent.click(within(grid as HTMLElement).getAllByRole("button", { name: /^Chi tiết dáng / })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: /Vẽ dáng này/ })).toBeTruthy();
    expect(within(dialog).getByText(/30% × 85%/)).toBeTruthy();
  });

  it("lưới dáng KHÔNG còn là ổ cuộn riêng — nó nở hết cho trang cuộn một mạch", () => {
    const { container } = mount(<MascotStep variant="manage" />);
    const cls = gridOf(container).className;
    expect(cls).not.toMatch(/overflow-(y-)?(auto|scroll)/);
    expect(cls).not.toMatch(/(^|\s)max-h-/);
    // …và cũng không bó cứng chiều cao bằng đường vòng.
    expect(cls).not.toMatch(/(^|\s)h-\[/);
  });

  it("QUÉT CẢ BƯỚC: không một khối trong-trang nào tự mọc thanh cuộn dọc", () => {
    for (const variant of ["manage", "wizard"] as const) {
      const { container, unmount } = mount(<MascotStep variant={variant} />);
      const offenders = [...container.querySelectorAll<HTMLElement>("[class]")]
        .filter((el) => /overflow-(y-)?(auto|scroll)/.test(el.className))
        .map((el) => el.className);
      expect(offenders, `bản ${variant} còn hộp cuộn lồng`).toEqual([]);
      unmount();
    }
  });

  it("bù lại: popup Chi tiết dáng VẪN cuộn nội bộ, và chạm biên thì dừng", () => {
    const { container } = mount(<MascotStep variant="manage" />);
    fireEvent.click(within(gridOf(container) as HTMLElement).getAllByRole("button", { name: /^Chi tiết dáng / })[0]!);

    const body = screen.getByTestId("dialog-body");
    expect(body.className).toContain("overflow-y-auto");
    // `overscroll-contain` chỉ hợp lệ trong lớp NỔI: nền sau đã bị Radix khoá cuộn,
    // nên chặn chaining ở đây không cướp mất cú lăn nào của người dùng.
    expect(body.className).toContain("overscroll-contain");
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
