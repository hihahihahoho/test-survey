/* @vitest-environment jsdom */
/**
 * BẰNG CHỨNG CHO ĐỢT TÁI CẤU TRÚC MÀN DỰ ÁN.
 *
 * Bốn thứ được khoá ở đây, mỗi thứ ứng với một lỗi thật đã sửa:
 *  ① `resolveProjectView` — mở dialog Cài đặt KHÔNG được đổi mục nền (lỗi #5), và link
 *     `?section=` cũ vẫn phải mở đúng chỗ.
 *  ② `projectBufferOf` — mốc so sánh "có thay đổi chưa lưu" không được tính cả vị trí
 *     con trỏ wizard, nếu không vừa mở màn đã báo bẩn.
 *  ③ `SaveBar` — ba nút, và cả ba TẮT khi không có gì để lưu (tắt chứ không biến mất).
 *  ④ kích thước riêng của dự án đi được tới contract, và KHÔNG đụng thư viện chung.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { resolveProjectView } from "@/routes/search-schemas";
import { projectBufferOf } from "../lib/useProjectBuffer";
import { SaveBar } from "../components/SaveBar";
import { createWorkflowStore, resetWorkflowStores } from "@/features/workflow-v4/lib/model";
import { buildKitsetContract, resolveKitset } from "@/features/workflow-v4/lib/kitset-to-contract";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { itemPromptFor, poseCellFile } from "@/features/workflow-v4/lib/item-prompt";

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

describe("① URL của màn dự án — ba trục độc lập", () => {
  it("mặc định là tab Ảnh đã tạo, nhóm tất cả, dialog đóng", () => {
    expect(resolveProjectView({})).toEqual({ section: "images", group: "all", settingsTab: null });
  });

  it("mở Cài đặt KHÔNG đổi mục nền — đây là lỗi #5, phát biểu ở dạng thuần", () => {
    const view = resolveProjectView({ section: "mascot", group: "popup", settings: "style" });
    expect(view.section).toBe("mascot");
    expect(view.group).toBe("popup");
    expect(view.settingsTab).toBe("style");
  });

  it("link cũ `?section=props` vẫn mở đúng nhóm Đạo cụ của trang Ảnh đã tạo", () => {
    expect(resolveProjectView({ section: "props" })).toEqual({ section: "images", group: "props", settingsTab: null });
  });

  it("link cũ `?section=settings` mở dialog nhưng nền đứng ở mục mặc định", () => {
    expect(resolveProjectView({ section: "settings" })).toEqual({ section: "images", group: "all", settingsTab: "requirements" });
  });

  it("tham số mới THẮNG suy diễn từ giá trị cũ", () => {
    expect(resolveProjectView({ section: "props", group: "mascot" }).group).toBe("mascot");
  });

  it("giá trị lạ rơi về mặc định thay vì ném", () => {
    expect(resolveProjectView({ section: "khong-co-that" }).section).toBe("images");
  });
});

describe("② mốc so sánh của bản nháp", () => {
  it("KHÔNG tính `step`/`unlocked`: vị trí con trỏ wizard không phải nội dung dự án", () => {
    const store = createWorkflowStore("kit-buffer");
    const before = projectBufferOf(store.getState());
    store.setState({ step: 3, unlocked: 4 });
    expect(projectBufferOf(store.getState())).toEqual(before);
    expect(Object.keys(before)).not.toContain("step");
    expect(Object.keys(before)).not.toContain("unlocked");
  });

  it("đổi nội dung THẬT thì mốc phải khác — nếu không nút Lưu không bao giờ sáng", () => {
    const store = createWorkflowStore("kit-buffer-2");
    const before = JSON.stringify(projectBufferOf(store.getState()));
    store.setState({ brief: "brief mới" });
    expect(JSON.stringify(projectBufferOf(store.getState()))).not.toBe(before);
  });
});

describe("③ hàng nút Lưu / Lưu + Gen lại / Huỷ", () => {
  const mount = (dirty: boolean, handlers: Partial<Record<"save" | "regen" | "revert", () => void>> = {}) =>
    render(
      <SaveBar
        dirty={dirty}
        saving={false}
        onSave={handlers.save ?? (() => {})}
        onSaveAndRegenerate={handlers.regen ?? (() => {})}
        onRevert={handlers.revert ?? (() => {})}
      />,
    );

  it("không có thay đổi ⇒ cả ba nút TẮT, không biến mất", () => {
    mount(false);
    for (const name of [/Huỷ/, /Lưu cài đặt/, /Lưu và tạo lại ảnh/]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
    expect(screen.getByRole("status").textContent).toContain("Không có thay đổi");
  });

  it("có thay đổi ⇒ ba nút mở, và mỗi nút gọi đúng việc của nó", () => {
    const save = vi.fn();
    const regen = vi.fn();
    const revert = vi.fn();
    mount(true, { save, regen, revert });
    fireEvent.click(screen.getByRole("button", { name: /Huỷ/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lưu cài đặt/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lưu và tạo lại ảnh/ }));
    expect(revert).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(regen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("chưa lưu");
  });
});

describe("④ kích thước ô riêng của dự án", () => {
  const anyElement = () => loadBundledV2().elements.find((element) => element.skel.shape !== "full")!;

  it("`setElementSkel` ghi lớp đè, và xoá lớp đè khi cả hai cạnh về rỗng", () => {
    const store = createWorkflowStore("kit-skel");
    const file = anyElement().file;
    store.getState().setElementSkel(file, { w: 0.5 });
    expect(store.getState().elements.find((e) => e.file === file)?.skel).toEqual({ w: 0.5 });
    store.getState().setElementSkel(file, { w: null });
    expect(store.getState().elements.find((e) => e.file === file)?.skel).toBeUndefined();
  });

  it("lớp đè được trộn vào `skel` khi giải kitset — và KHÔNG sửa thư viện chung", () => {
    const element = anyElement();
    const lib = loadBundledV2().elements;
    const before = lib.find((e) => e.file === element.file)!.skel.w;
    const { drawable } = resolveKitset(
      [{ file: element.file, label: element.vi, role: "", cell: "ngang", selected: true, skel: { w: 0.42 } }],
      lib,
    );
    expect(drawable[0]!.skel.w).toBe(0.42);
    expect(lib.find((e) => e.file === element.file)!.skel.w).toBe(before);
  });

  it("số đè đi tới tận contract — nếu không thì ô nhập chỉ là đồ trang trí", () => {
    const store = createWorkflowStore("kit-skel-2");
    const file = anyElement().file;
    store.setState({ elements: [{ file, label: "Món thử", role: "", cell: "ngang", selected: true, skel: { w: 0.33, h: 0.44 } }] });
    const contract = buildKitsetContract(store.getState());
    const cell = contract.sheets.flatMap((sheet) => sheet.components).find((component) => component.file === file);
    expect(cell?.skel.w).toBe(0.33);
    expect(cell?.skel.h).toBe(0.44);
  });
});

describe("prompt của một ô — đọc từ contract, không dựng lại bản thứ hai", () => {
  it("dòng prompt mang đúng SỐ THỨ TỰ Ô và mô tả của ô đó", () => {
    const store = createWorkflowStore("kit-prompt");
    const contract = buildKitsetContract(store.getState());
    const sheet = contract.sheets.find((item) => item.components.some((component) => component.skel.shape !== "empty"))!;
    const index = sheet.components.findIndex((component) => component.skel.shape !== "empty");
    const component = sheet.components[index]!;

    const prompt = itemPromptFor(contract, component.file)!;
    expect(prompt.sheetId).toBe(sheet.id);
    expect(prompt.cellNumber).toBe(index + 1);
    expect(prompt.line).toBe(`${index + 1}) ${component.spec}`);
    expect(prompt.text).toContain(prompt.line);
  });

  it("ô không có trong contract ⇒ `null`, để UI nói ra thay vì hiện prompt rỗng", () => {
    const contract = buildKitsetContract(createWorkflowStore("kit-prompt-2").getState());
    expect(itemPromptFor(contract, "khong-co-o-nay")).toBeNull();
    expect(itemPromptFor(null, "gi-cung-duoc")).toBeNull();
  });

  it("tên ô của một dáng được DÒ trong contract, không đoán bằng công thức", () => {
    const store = createWorkflowStore("kit-prompt-3");
    store.setState({ mascotEnabled: true, mascotPoses: ["idle"] });
    const contract = buildKitsetContract(store.getState());
    const file = poseCellFile(contract, "idle");
    expect(file).toMatch(/^\d{2}-pose-idle$/);
    expect(itemPromptFor(contract, file!)?.line).toContain("idle");
  });
});
