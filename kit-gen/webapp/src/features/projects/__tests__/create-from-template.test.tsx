/* @vitest-environment jsdom */
/**
 * HỘP TẠO DỰ ÁN — «Bắt đầu từ» một template đã lưu.
 *
 * Chủ sản phẩm (30/09/2026): «…khi tạo mới 1 project -> sẽ có thể chọn template sẵn».
 *
 * Bốn sợi dây hỏng thì KHÔNG CÓ GÌ BÁO:
 *  ① chọn template mà không gửi `fromTemplate` ⇒ dự án mới ra TRẮNG, người dùng tưởng
 *    template hỏng;
 *  ② luật điền tên đè chữ người dùng vừa gõ;
 *  ③ nút xoá xoá ngay ở chạm đầu — một cú trượt tay ném đi template dựng cả buổi;
 *  ④ danh sách rỗng mà không nói template từ đâu ra ⇒ tính năng vô hình.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Template } from "@/lib/types";

const H = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  coverBlob: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const api = {
    ...real.api,
    templates: { ...real.api.templates, list: H.list, remove: H.remove, coverBlob: H.coverBlob },
    projects: { ...real.api.projects, create: H.create },
  };
  return { ...real, api, default: api };
});

const { CreateModeDialog } = await import("../dialogs/CreateModeDialog");
const { nameAfterPick, savedDay, templateCaption } = await import("../lib/templates");

const GATE = { readOnly: false, reason: "", longReason: "", code: null };
const NOW = Date.parse("2026-09-30T10:00:00.000Z");

const tpl = (id: string, name: string, over: Partial<Template> = {}): Template => ({
  id,
  name,
  description: "",
  tags: [],
  /* Giữa trưa UTC ⇒ cùng một ngày lịch ở mọi múi giờ UTC−11…UTC+11 (caption đọc giờ máy). */
  createdAt: "2026-09-12T12:00:00.000Z",
  updatedAt: "2026-09-12T12:00:00.000Z",
  sourceProjectId: "game-7f3a",
  sourceProjectName: "Game",
  stats: { blocks: 3, refs: 6, bytes: 2048 },
  hasCover: false,
  ...over,
});

const GAME = tpl("game-ui-a1b2", "Game UI");
const SHOP = tpl("shop-9c0d", "Shop Tết", { stats: { blocks: 1, refs: 0, bytes: 0 } });

function mount(props: Partial<React.ComponentProps<typeof CreateModeDialog>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={qc}>
      <CreateModeDialog open onOpenChange={onOpenChange} gate={GATE} onCreated={onCreated} {...props} />
    </QueryClientProvider>,
  );
  return { ...utils, onCreated, onOpenChange, qc };
}

const nameBox = () => screen.getByLabelText("Tên dự án") as HTMLInputElement;
const radio = (name: RegExp | string) => screen.getByRole("radio", { name });

beforeEach(() => {
  for (const fn of Object.values(H)) fn.mockReset();
  H.list.mockResolvedValue({ items: [GAME, SHOP] });
  H.remove.mockResolvedValue({ ok: true });
  H.coverBlob.mockRejectedValue(new Error("no cover in test"));
  H.create.mockImplementation(async (input: { name: string }) => ({
    project: { id: "moi-1c2d", name: input.name, slug: "moi", tags: [], broken: false },
    warnings: [],
  }));
});

afterEach(cleanup);

/* ══════════════════════════════════════════════════════════════════════════
   Luật thuần — không cần DOM
   ══════════════════════════════════════════════════════════════════════════ */

describe("luật thuần của template", () => {
  it("caption «N thẻ · M ảnh · lưu <ngày>»", () => {
    expect(templateCaption(GAME, NOW)).toBe("3 thẻ · 6 ảnh · lưu 12/09/2026");
    expect(templateCaption({ ...GAME, createdAt: new Date(NOW).toISOString() }, NOW)).toBe("3 thẻ · 6 ảnh · lưu hôm nay");
    expect(savedDay(new Date(NOW - 864e5).toISOString(), NOW)).toBe("hôm qua");
    expect(savedDay(null, NOW)).toBe("—");
    expect(savedDay("không phải ngày", NOW)).toBe("—");
  });

  it("KHÔNG BAO GIỜ đè chữ người dùng gõ — chỉ thay chữ chính máy vừa điền", () => {
    // Ô trống ⇒ điền.
    expect(nameAfterPick("", null, GAME)).toEqual({ name: "Game UI (mới)", autoFilled: "Game UI (mới)" });
    expect(nameAfterPick("   ", null, GAME).name).toBe("Game UI (mới)");
    // Chữ người dùng ⇒ giữ, dù đổi template bao nhiêu lần.
    expect(nameAfterPick("Chợ Tết", null, GAME)).toEqual({ name: "Chợ Tết", autoFilled: null });
    // Chữ của máy ⇒ theo template mới.
    expect(nameAfterPick("Game UI (mới)", "Game UI (mới)", SHOP)).toEqual({ name: "Shop Tết (mới)", autoFilled: "Shop Tết (mới)" });
    // Người dùng sửa MỘT ký tự của chữ máy ⇒ đã là chữ của họ.
    expect(nameAfterPick("Game UI (mới)!", "Game UI (mới)", SHOP)).toEqual({ name: "Game UI (mới)!", autoFilled: null });
    // Về «Dự án trống»: chữ máy rút đi, chữ người dùng ở lại.
    expect(nameAfterPick("Game UI (mới)", "Game UI (mới)", null)).toEqual({ name: "", autoFilled: null });
    expect(nameAfterPick("Chợ Tết", null, null)).toEqual({ name: "Chợ Tết", autoFilled: null });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ Danh sách + gợi ý khi rỗng
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Bắt đầu từ» — danh sách", () => {
  it("«Dự án trống» đứng đầu và được chọn sẵn; mỗi template một dòng có caption", async () => {
    mount();
    const group = screen.getByRole("radiogroup", { name: "Bắt đầu từ" });
    await within(group).findByRole("radio", { name: /Game UI/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Dự án trống"),
      expect.stringContaining("Game UI"),
      expect.stringContaining("Shop Tết"),
    ]);
    expect(radios[0]!.getAttribute("aria-checked")).toBe("true");
    expect(radios[1]!.textContent).toMatch(/3 thẻ · 6 ảnh · lưu /);
    expect(radios[2]!.textContent).toMatch(/1 thẻ · 0 ảnh · lưu /);
    // Một tabstop cho cả nhóm (mẫu radiogroup).
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    // Đã có template ⇒ không cần câu chỉ đường.
    expect(screen.queryByText(/bấm «Lưu làm template» để dùng lại/)).toBeNull();
  });

  it("chưa có template ⇒ chỉ «Dự án trống» + câu chỉ đường tới nút «Lưu làm template»", async () => {
    H.list.mockResolvedValue({ items: [] });
    mount();
    expect(await screen.findByText("Mở một dự án và bấm «Lưu làm template» để dùng lại nó ở đây.")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });

  it("tải danh sách hỏng ⇒ nói ra, và VẪN tạo được dự án trống", async () => {
    H.list.mockRejectedValue(new Error("boom"));
    const { onCreated } = mount();
    expect(await screen.findByText(/Chưa tải được danh sách template/)).toBeTruthy();
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("mũi tên lên/xuống vừa di chuyển vừa chọn", async () => {
    mount();
    await screen.findByRole("radio", { name: /Game UI/ });
    const blank = radio(/Dự án trống/);
    blank.focus();
    fireEvent.keyDown(blank, { key: "ArrowDown" });
    expect(radio(/Game UI/).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio(/Game UI/));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(radio(/Shop Tết/).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); // vòng về đầu
    expect(radio(/Dự án trống/).getAttribute("aria-checked")).toBe("true");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② Điền tên
   ══════════════════════════════════════════════════════════════════════════ */

describe("điền tên khi chọn template", () => {
  it("ô trống ⇒ «<tên template> (mới)»; đổi template ⇒ chữ máy đổi theo; về trống ⇒ rút đi", async () => {
    mount();
    fireEvent.click(await screen.findByRole("radio", { name: /Game UI/ }));
    expect(nameBox().value).toBe("Game UI (mới)");
    fireEvent.click(radio(/Shop Tết/));
    expect(nameBox().value).toBe("Shop Tết (mới)");
    fireEvent.click(radio(/Dự án trống/));
    expect(nameBox().value).toBe("");
  });

  it("chữ người dùng đã gõ ⇒ KHÔNG bị đè, dù chọn template nào", async () => {
    mount();
    await screen.findByRole("radio", { name: /Game UI/ });
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết 2027" } });
    fireEvent.click(radio(/Game UI/));
    expect(nameBox().value).toBe("Chợ Tết 2027");
    fireEvent.click(radio(/Shop Tết/));
    expect(nameBox().value).toBe("Chợ Tết 2027");
    fireEvent.click(radio(/Dự án trống/));
    expect(nameBox().value).toBe("Chợ Tết 2027");
  });

  it("câu mô tả của hộp đổi theo lựa chọn", async () => {
    mount();
    expect(screen.getByText("Đặt tên trước, sau đó điền yêu cầu theo từng bước.")).toBeTruthy();
    fireEvent.click(await screen.findByRole("radio", { name: /Game UI/ }));
    expect(screen.getByText(/mọi thẻ, cài đặt và ảnh tham chiếu của «Game UI»\. Ảnh đã vẽ không đi theo\./)).toBeTruthy();
    expect(screen.queryByText("Các bước tiếp theo")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ Xoá hai chạm
   ══════════════════════════════════════════════════════════════════════════ */

describe("xoá template — hai chạm, không confirm() của trình duyệt", () => {
  it("chạm đầu chỉ hỏi «Xoá thật?», chạm hai mới xoá, và dòng biến mất", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    mount();
    const del = await screen.findByRole("button", { name: "Xoá template Game UI" });
    fireEvent.click(del);
    expect(H.remove).not.toHaveBeenCalled();
    const sure = screen.getByRole("button", { name: "Xác nhận xoá template Game UI" });
    expect(sure.textContent).toContain("Xoá thật?");

    H.list.mockResolvedValue({ items: [SHOP] }); // agent đã chuyển nó vào thùng rác
    fireEvent.click(sure);
    await waitFor(() => expect(H.remove).toHaveBeenCalledTimes(1));
    expect(H.remove.mock.calls[0]![0]).toBe("game-ui-a1b2");
    await waitFor(() => expect(screen.queryByRole("radio", { name: /Game UI/ })).toBeNull());
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("rời nút (blur) ⇒ thôi hỏi; chạm kế tiếp lại là chạm ĐẦU", async () => {
    mount();
    const del = await screen.findByRole("button", { name: "Xoá template Game UI" });
    fireEvent.click(del);
    fireEvent.blur(screen.getByRole("button", { name: "Xác nhận xoá template Game UI" }));
    const again = screen.getByRole("button", { name: "Xoá template Game UI" });
    fireEvent.click(again);
    expect(H.remove).not.toHaveBeenCalled();
  });

  it("đợi 4 giây ⇒ thôi hỏi", async () => {
    mount();
    const del = await screen.findByRole("button", { name: "Xoá template Game UI" });
    vi.useFakeTimers();
    try {
      fireEvent.click(del);
      expect(screen.getByRole("button", { name: "Xác nhận xoá template Game UI" })).toBeTruthy();
      act(() => { vi.advanceTimersByTime(4100); });
      expect(screen.getByRole("button", { name: "Xoá template Game UI" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("xoá đúng template đang chọn ⇒ lựa chọn về «Dự án trống», chữ máy điền rút đi", async () => {
    mount();
    fireEvent.click(await screen.findByRole("radio", { name: /Game UI/ }));
    expect(nameBox().value).toBe("Game UI (mới)");
    H.list.mockResolvedValue({ items: [SHOP] });
    fireEvent.click(screen.getByRole("button", { name: "Xoá template Game UI" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận xoá template Game UI" }));
    await waitFor(() => expect(radio(/Dự án trống/).getAttribute("aria-checked")).toBe("true"));
    expect(nameBox().value).toBe("");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ① Gửi `fromTemplate`
   ══════════════════════════════════════════════════════════════════════════ */

describe("tạo dự án", () => {
  it("chọn template ⇒ gửi `fromTemplate`, rồi điều hướng như dự án trống", async () => {
    const { onCreated, onOpenChange } = mount();
    fireEvent.click(await screen.findByRole("radio", { name: /Game UI/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(H.create).toHaveBeenCalledTimes(1));
    expect(H.create.mock.calls[0]![0]).toMatchObject({
      name: "Game UI (mới)",
      template: "blank",
      fromTemplate: "game-ui-a1b2",
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]![0]).toMatchObject({ id: "moi-1c2d" });
    expect(onCreated.mock.calls[0]![1]).toBe("workflow");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("dự án trống ⇒ KHÔNG có `fromTemplate` trong thân (đường cũ nguyên vẹn)", async () => {
    mount();
    await screen.findByRole("radio", { name: /Game UI/ });
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(H.create).toHaveBeenCalledTimes(1));
    expect(H.create.mock.calls[0]![0]).not.toHaveProperty("fromTemplate");
    expect(H.create.mock.calls[0]![0]).toMatchObject({ name: "Chợ Tết", template: "blank" });
  });

  it("agent báo template đã mất ⇒ lỗi hiện tại chỗ, danh sách mời lại, về «Dự án trống»", async () => {
    const { AgentError } = await import("@/lib/api/client");
    const { onCreated } = mount();
    fireEvent.click(await screen.findByRole("radio", { name: /Game UI/ }));
    H.create.mockRejectedValueOnce(new AgentError({ code: "TEMPLATE_NOT_FOUND", status: 404, message: "template not found" }));
    H.list.mockResolvedValue({ items: [SHOP] });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(radio(/Dự án trống/).getAttribute("aria-checked")).toBe("true"));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
