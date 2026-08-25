/* @vitest-environment jsdom */
/**
 * Ý KIẾN 2c + 5 — BIỂU CẢM THEO DÁNG và CHỦ ĐỀ TRANG PHỤC, đo ở màn Mascot.
 *
 * Tầng hợp đồng (state → `components[].spec`) đã khoá ở `lib/__tests__/spec-override.test.ts`.
 * Ở đây khoá hai điều mà tầng ấy không thấy được:
 *  · control CÓ MẶT đúng chỗ người dùng tìm — chủ đề cả bộ ở màn Mascot, biểu cảm +
 *    trang phục riêng trong modal của TỪNG con;
 *  · số hàng biểu cảm bám theo DÁNG ĐANG CHỌN, không phải 19 hàng cứng.
 *
 * ⚠️ KHÔNG mở dropdown Radix trong jsdom: nó dựa vào `pointer-events` và `ResizeObserver`
 * mà môi trường này không có. Nên ca test đo Ở ĐÚNG chỗ đo được — cái nhãn, cái trigger,
 * số hàng — và giao phần "chọn xong thì lưu gì" cho ca của `PhraseSelect` phía dưới,
 * nơi gọi thẳng `onChange` như chính Radix sẽ gọi.
 */
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { EXPRESSIONS, OUTFIT_THEMES } from "../lib/poses";
import { PhraseSelect } from "../components/MascotDialog";
import { MascotStep } from "../steps/MascotStep";

const PID = "kit-mat-va-do";

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

const state = () => createWorkflowStore(PID).getState();

describe("chủ đề trang phục của CẢ BỘ nằm ở màn Mascot", () => {
  it("có đúng một ô chọn chủ đề chung, mặc định là «không đặt»", () => {
    mount(<MascotStep />);
    expect(screen.getByLabelText("Chủ đề trang phục cả bộ")).toBeTruthy();
    expect(state().outfitTheme).toBe("");
  });

  it("ô ấy đọc thẳng state — đặt chủ đề trong store thì trigger hiện nhãn tiếng Việt", () => {
    const store = createWorkflowStore(PID);
    store.getState().set({ outfitTheme: "a football kit with a team jersey, shorts and long socks" });
    mount(<MascotStep />);
    expect(screen.getByLabelText("Chủ đề trang phục cả bộ").textContent).toContain("Bóng đá");
  });
});

describe("modal nhân vật: mô tả · trang phục riêng · biểu cảm từng dáng", () => {
  const openDialog = () => {
    fireEvent.click(screen.getByRole("button", { name: /Thêm nhân vật/ }));
    return screen.getByRole("dialog");
  };

  it("ô «Mô tả nhân vật» GIỮ NGUYÊN, và có thêm ô trang phục riêng bên cạnh", () => {
    mount(<MascotStep />);
    const dialog = openDialog();
    expect(within(dialog).getByLabelText("Mô tả nhân vật")).toBeTruthy();
    expect(within(dialog).getByLabelText("Trang phục riêng")).toBeTruthy();
    // Mặc định là "dùng chủ đề chung" — không phải một chủ đề nào cụ thể.
    expect(within(dialog).getByLabelText("Trang phục riêng").textContent).toContain("dùng chủ đề chung");
  });

  it("mỗi DÁNG ĐANG CHỌN đúng một hàng biểu cảm — không phải 19 hàng cứng", () => {
    const store = createWorkflowStore(PID);
    store.getState().set({ mascotPoses: ["idle", "cheer", "sad"] });
    mount(<MascotStep />);
    const dialog = openDialog();
    for (const label of ["Đứng chờ", "Ăn mừng", "Buồn"]) {
      expect(within(dialog).getByLabelText(label), label).toBeTruthy();
    }
    // Dáng KHÔNG được chọn không có hàng nào.
    expect(within(dialog).queryByLabelText("Nhảy múa")).toBeNull();
  });

  it("bỏ chọn hết dáng ⇒ khối biểu cảm biến mất, không để lại một tiêu đề trống", () => {
    const store = createWorkflowStore(PID);
    store.getState().set({ mascotPoses: [] });
    mount(<MascotStep />);
    const dialog = openDialog();
    expect(within(dialog).queryByText("Biểu cảm theo dáng")).toBeNull();
  });

  it("lưu nhân vật ⇒ hai trường mới đi vào store (mặc định là rỗng, không phải `undefined`)", () => {
    mount(<MascotStep />);
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Tên nhân vật"), { target: { value: "Mèo bạc hà" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Thêm nhân vật" }));
    const mascot = state().mascots[0]!;
    expect(mascot.name).toBe("Mèo bạc hà");
    expect(mascot.outfitTheme).toBe("");
    expect(mascot.poseExpressions).toEqual({});
  });
});

/**
 * `PhraseSelect` — ô "chọn preset hoặc tự gõ" dùng ở cả ba chỗ.
 *
 * Đo bằng cách gọi `onChange` như chính Radix gọi, cộng với ca "tự gõ" đi qua ô nhập
 * THẬT (ô ấy là `<input>` thường nên jsdom điều khiển được). Cái phải khoá: sentinel
 * `__none__`/`__custom__` KHÔNG BAO GIỜ rò ra ngoài dưới dạng một giá trị được lưu.
 */
describe("PhraseSelect — preset và tự gõ dùng chung một trường", () => {
  const harness = (initial: string) => {
    const seen: string[] = [];
    function Harness() {
      const [value, setValue] = React.useState(initial);
      return (
        <PhraseSelect
          id="thu" label="Biểu cảm" options={EXPRESSIONS}
          value={value} emptyLabel="— mặc định —" placeholder="tự gõ ở đây"
          onChange={(next) => { seen.push(next); setValue(next); }}
        />
      );
    }
    render(<Harness />);
    return seen;
  };

  it("giá trị rỗng ⇒ trigger hiện câu «chưa đặt», và KHÔNG có ô tự gõ", () => {
    harness("");
    expect(screen.getByLabelText("Biểu cảm").textContent).toContain("— mặc định —");
    expect(screen.queryByLabelText("Biểu cảm — tự gõ")).toBeNull();
  });

  it("giá trị là một preset ⇒ trigger hiện NHÃN TIẾNG VIỆT của nó", () => {
    harness("a big bright smile");
    expect(screen.getByLabelText("Biểu cảm").textContent).toContain("Cười tươi");
    expect(screen.queryByLabelText("Biểu cảm — tự gõ")).toBeNull();
  });

  it("giá trị NGOÀI danh mục ⇒ ô tự gõ hiện sẵn, mang đúng chữ đã lưu", () => {
    harness("a sleepy half-closed-eyes look");
    const input = screen.getByLabelText("Biểu cảm — tự gõ") as HTMLInputElement;
    expect(input.value).toBe("a sleepy half-closed-eyes look");
  });

  it("gõ vào ô tự gõ ⇒ phát ra CHÍNH chữ đó, không phải một sentinel", () => {
    const seen = harness("a sleepy look");
    fireEvent.change(screen.getByLabelText("Biểu cảm — tự gõ"), { target: { value: "a smug grin" } });
    expect(seen).toEqual(["a smug grin"]);
    expect(seen.every((v) => !v.startsWith("__"))).toBe(true);
  });

  it("dùng được cho CẢ danh mục trang phục — một component, ba chỗ gọi", () => {
    render(
      <PhraseSelect
        id="do" label="Trang phục" options={OUTFIT_THEMES}
        value="a Vietnamese Tết festive outfit with red and gold"
        emptyLabel="— dùng chủ đề chung —" placeholder="tự gõ" onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Trang phục").textContent).toContain("Tết");
  });
});
