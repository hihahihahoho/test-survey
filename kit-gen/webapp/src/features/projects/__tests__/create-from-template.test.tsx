/* @vitest-environment jsdom */
/**
 * HỘP TẠO DỰ ÁN — «Bắt đầu từ» một template đã lưu.
 *
 * Chủ sản phẩm (30/09/2026): «…khi tạo mới 1 project -> sẽ có thể chọn template sẵn».
 * Lượt 2 cùng ngày: «Bắt đầu từ» thành MỘT Ô CHỌN (popover + ô tìm) thay cho danh sách
 * dòng to không đáy; nút xoá rời khỏi hộp sang màn «Template dự án».
 *
 * Những sợi dây hỏng thì KHÔNG CÓ GÌ BÁO:
 *  ① chọn template mà không gửi `fromTemplate` ⇒ dự án mới ra TRẮNG, người dùng tưởng
 *    template hỏng;
 *  ② luật điền tên đè chữ người dùng vừa gõ;
 *  ③ nút xoá mọc lại trong ô chọn — một cú trượt tay ném đi template dựng cả buổi;
 *  ④ danh sách rỗng mà không nói template từ đâu ra ⇒ tính năng vô hình;
 *  ⑤ «Tạo dự án» trên thẻ template mở hộp ở «Dự án trống» ⇒ bấm nút của một template
 *    mà ra một dự án trắng;
 *  ⑥ Esc trong ô tìm đóng luôn CẢ HỘP ⇒ mất tên vừa gõ.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Template } from "@/lib/types";

/* cmdk đo danh sách bằng ResizeObserver và cuộn dòng đang trỏ vào tầm nhìn — jsdom
   không có cả hai. */
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;

const H = vi.hoisted(() => ({
  list: vi.fn(),
  coverBlob: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const api = {
    ...real.api,
    templates: { ...real.api.templates, list: H.list, coverBlob: H.coverBlob },
    projects: { ...real.api.projects, create: H.create },
  };
  return { ...real, api, default: api };
});

const { CreateModeDialog } = await import("../dialogs/CreateModeDialog");
const { ProjectDialogs } = await import("../ProjectDialogs");
const { createNav } = await import("../lib/nav");
const { matchesTemplate, nameAfterPick, savedDay, templateCaption, templateNameError } = await import("../lib/templates");
const { qk } = await import("@/lib/hooks");

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

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function mount(props: Partial<React.ComponentProps<typeof CreateModeDialog>> = {}, qc = newClient()) {
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
/** Ô chọn «Bắt đầu từ» — tên đọc lên = nhãn + lựa chọn đang dùng. */
const picker = () => screen.getByRole("button", { name: /^Bắt đầu từ/ });
const findPicker = () => screen.findByRole("button", { name: /^Bắt đầu từ/ });
const searchBox = () => screen.getByPlaceholderText("Tìm template…") as HTMLInputElement;
const option = (name: RegExp | string) => screen.getByRole("option", { name });

async function openPicker() {
  fireEvent.click(await findPicker());
  return screen.findByRole("listbox", { name: "Bắt đầu từ" });
}

/** Mở ô chọn rồi bấm một dòng — đường chuột. */
async function choose(name: RegExp | string) {
  await openPicker();
  fireEvent.click(option(name));
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

beforeEach(() => {
  for (const fn of Object.values(H)) fn.mockReset();
  H.list.mockResolvedValue({ items: [GAME, SHOP] });
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

  it("tìm theo TÊN, bỏ dấu, không phân biệt hoa thường — không khớp id", () => {
    expect(matchesTemplate(SHOP, "tet")).toBe(true);
    expect(matchesTemplate(SHOP, "  SHOP ")).toBe(true);
    expect(matchesTemplate(SHOP, "")).toBe(true);
    expect(matchesTemplate(SHOP, "9c0d")).toBe(false); // đuôi hex của id
    expect(matchesTemplate(GAME, "tet")).toBe(false);
  });

  it("tên template: trống hoặc quá 80 ký tự ⇒ nói lý do (đúng luật agent)", () => {
    expect(templateNameError("Game UI")).toBeNull();
    expect(templateNameError("   ")).toBe("Đặt tên cho template.");
    expect(templateNameError("x".repeat(80))).toBeNull();
    expect(templateNameError(`  ${"x".repeat(80)}  `)).toBeNull(); // agent trim trước khi đếm
    expect(templateNameError("x".repeat(81))).toBe("Tên dài tối đa 80 ký tự — đang có 81.");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ Ô chọn một dòng + gợi ý khi rỗng
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Bắt đầu từ» — ô chọn một dòng", () => {
  it("mặc định «Dự án trống»; bấm mở popover: «Dự án trống» đầu, rồi nhóm «Template đã lưu · N», mỗi dòng có caption", async () => {
    mount();
    const trigger = await findPicker();
    // Tên đọc lên = nhãn nhìn thấy + lựa chọn đang dùng.
    expect(trigger.textContent).toContain("Dự án trống");
    expect(trigger.textContent).toContain("Bắt đầu từ trang trắng");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // Đã có template ⇒ không cần câu chỉ đường.
    expect(screen.queryByText(/bấm «Lưu làm template» để dùng lại/)).toBeNull();

    const list = await openPicker();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const opts = within(list).getAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Dự án trống"),
      expect.stringContaining("Game UI"),
      expect.stringContaining("Shop Tết"),
    ]);
    expect(opts[1]!.textContent).toMatch(/3 thẻ · 6 ảnh · lưu /);
    expect(opts[2]!.textContent).toMatch(/1 thẻ · 0 ảnh · lưu /);
    expect(screen.getByText("Template đã lưu · 2")).toBeTruthy();
    // Lựa chọn đang dùng được ĐÁNH DẤU (✓ + aria-checked), và là dòng đang trỏ khi mở.
    expect(opts[0]!.getAttribute("aria-checked")).toBe("true");
    expect(opts[0]!.getAttribute("aria-selected")).toBe("true");
    expect(opts[1]!.getAttribute("aria-checked")).toBe("false");
  });

  it("③ KHÔNG có nút xoá nào trong ô chọn — xoá đã dọn sang màn «Template dự án»", async () => {
    mount();
    await openPicker();
    const popover = screen.getByRole("dialog", { name: "Bắt đầu từ" });
    expect(within(popover).queryAllByRole("button")).toEqual([]);
    expect(popover.textContent).not.toMatch(/Xoá/);
    // Ngoài popover cũng không (hộp chỉ còn ô tên, ô chọn, nút Tiếp tục).
    expect(document.body.textContent).not.toMatch(/Xoá template|Xoá thật/);
  });

  it("chưa có template ⇒ KHÔNG có ô chọn, chỉ câu chỉ đường tới nút «Lưu làm template»", async () => {
    H.list.mockResolvedValue({ items: [] });
    mount();
    expect(await screen.findByText("Mở một dự án và bấm «Lưu làm template» để dùng lại nó ở đây.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Bắt đầu từ/ })).toBeNull();
  });

  it("đang tải ⇒ nói ra, chưa dựng ô chọn", async () => {
    H.list.mockReturnValue(new Promise(() => {}));
    mount();
    expect(await screen.findByText("Đang tải template…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Bắt đầu từ/ })).toBeNull();
  });

  it("tải danh sách hỏng ⇒ nói ra, và VẪN tạo được dự án trống", async () => {
    H.list.mockRejectedValue(new Error("boom"));
    const { onCreated } = mount();
    expect(await screen.findByText(/Chưa tải được danh sách template/)).toBeTruthy();
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("bấm một dòng ⇒ chọn, popover đóng, ô hiện đúng template + caption", async () => {
    mount();
    await choose(/Game UI/);
    expect(picker().getAttribute("aria-expanded")).toBe("false");
    expect(picker().textContent).toContain("Game UI");
    expect(picker().textContent).toMatch(/3 thẻ · 6 ảnh · lưu /);
    expect(screen.getByRole("button", { name: /^Bắt đầu từ Game UI$/ })).toBeTruthy();
    // Mở lại: dòng đang trỏ là lựa chọn hiện tại, không phải dòng đầu.
    await openPicker();
    expect(option(/Game UI/).getAttribute("aria-selected")).toBe("true");
    expect(option(/Game UI/).getAttribute("aria-checked")).toBe("true");
  });

  it("bàn phím: mũi tên đi, Enter chọn và đóng", async () => {
    mount();
    await openPicker();
    const input = searchBox();
    expect(document.activeElement).toBe(input); // mở ra là gõ được ngay
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(option(/Game UI/).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(option(/Shop Tết/).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(picker().textContent).toContain("Shop Tết");
    expect(nameBox().value).toBe("Shop Tết (mới)");
  });

  it("gõ để lọc theo tên (không dấu) — Enter chọn dòng khớp đầu tiên, không phải «Dự án trống»", async () => {
    mount();
    await openPicker();
    fireEvent.change(searchBox(), { target: { value: "tet" } });
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");
    // Chỉ còn Shop Tết + dòng chân «Quản lý…» (nếu có — ở đây không truyền, nên không có).
    expect(opts.map((o) => o.textContent)).toEqual([expect.stringContaining("Shop Tết")]);
    fireEvent.keyDown(searchBox(), { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(picker().textContent).toContain("Shop Tết");
  });

  it("gõ không khớp gì ⇒ nói thẳng, không để popover trống trơn", async () => {
    mount();
    await openPicker();
    fireEvent.change(searchBox(), { target: { value: "zzz" } });
    expect(screen.getByText("Không có template nào tên «zzz».")).toBeTruthy();
    expect(screen.queryAllByRole("option")).toEqual([]);
  });

  it("⑥ Esc đóng popover, KHÔNG đóng hộp — tên vừa gõ còn nguyên", async () => {
    const { onOpenChange } = mount();
    await findPicker();
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết 2027" } });
    await openPicker();
    fireEvent.keyDown(searchBox(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Tạo dự án" })).toBeTruthy();
    expect(nameBox().value).toBe("Chợ Tết 2027");
  });

  it("đang tạo / chỉ-đọc ⇒ ô chọn khoá", async () => {
    mount({ gate: { readOnly: true, reason: "Cần công cụ local đang chạy", longReason: "Mở Terminal…", code: null } });
    const trigger = (await findPicker()) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   «Quản lý template…»
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Quản lý template…» ở chân popover", () => {
  it("bấm ⇒ đóng hộp rồi gọi nơi mở hộp điều hướng", async () => {
    const onManageTemplates = vi.fn();
    const { onOpenChange } = mount({ onManageTemplates });
    await openPicker();
    fireEvent.click(option("Quản lý template…"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onManageTemplates).toHaveBeenCalledTimes(1);
  });

  it("không truyền `onManageTemplates` ⇒ không có dòng ấy (đang ở chính màn quản lý)", async () => {
    mount();
    await openPicker();
    expect(screen.queryByRole("option", { name: "Quản lý template…" })).toBeNull();
  });

  it("từ danh sách dự án: dây nối tới router đi đúng `/templates` (cùng tab)", async () => {
    const navigate = vi.fn();
    const setOpen = vi.fn();
    const dialogs = {
      open: "create" as const, target: null, targets: [],
      openDialog: vi.fn(), openForMany: vi.fn(), close: vi.fn(),
      isOpen: (k: string) => k === "create",
      setOpen: () => setOpen,
    };
    render(
      <QueryClientProvider client={newClient()}>
        <ProjectDialogs dialogs={dialogs} all={[]} gate={GATE} nav={createNav(navigate as never)} onDeleted={() => {}} />
      </QueryClientProvider>,
    );
    await openPicker();
    fireEvent.click(option("Quản lý template…"));
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(navigate).toHaveBeenCalledWith({ to: "/templates" });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② Điền tên
   ══════════════════════════════════════════════════════════════════════════ */

describe("điền tên khi chọn template", () => {
  it("ô trống ⇒ «<tên template> (mới)»; đổi template ⇒ chữ máy đổi theo; về trống ⇒ rút đi", async () => {
    mount();
    await choose(/Game UI/);
    expect(nameBox().value).toBe("Game UI (mới)");
    await choose(/Shop Tết/);
    expect(nameBox().value).toBe("Shop Tết (mới)");
    await choose(/Dự án trống/);
    expect(nameBox().value).toBe("");
    expect(picker().textContent).toContain("Dự án trống");
  });

  it("chữ người dùng đã gõ ⇒ KHÔNG bị đè, dù chọn template nào", async () => {
    mount();
    await findPicker();
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết 2027" } });
    await choose(/Game UI/);
    expect(nameBox().value).toBe("Chợ Tết 2027");
    await choose(/Shop Tết/);
    expect(nameBox().value).toBe("Chợ Tết 2027");
    await choose(/Dự án trống/);
    expect(nameBox().value).toBe("Chợ Tết 2027");
  });

  it("câu mô tả của hộp đổi theo lựa chọn; thẻ «Các bước tiếp theo» chỉ ở dự án trống", async () => {
    mount();
    expect(screen.getByText("Đặt tên trước, sau đó điền yêu cầu theo từng bước.")).toBeTruthy();
    expect(screen.getByText("Các bước tiếp theo")).toBeTruthy();
    await choose(/Game UI/);
    expect(screen.getByText(/mọi thẻ, cài đặt và ảnh tham chiếu của «Game UI»\. Ảnh đã vẽ không đi theo\./)).toBeTruthy();
    expect(screen.queryByText("Các bước tiếp theo")).toBeNull();
  });

  it("template đang chọn bị xoá ở nơi khác ⇒ ô về «Dự án trống» NHÌN THẤY ĐƯỢC, chữ máy điền rút đi", async () => {
    const { qc } = mount();
    await choose(/Game UI/);
    expect(nameBox().value).toBe("Game UI (mới)");
    H.list.mockResolvedValue({ items: [SHOP] });
    await act(async () => { await qc.invalidateQueries({ queryKey: qk.templates.all() }); });
    await waitFor(() => expect(picker().textContent).toContain("Dự án trống"));
    expect(nameBox().value).toBe("");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ Chọn sẵn khi mở (nút «Tạo dự án» trên thẻ template)
   ══════════════════════════════════════════════════════════════════════════ */

describe("`initialTemplateId` — mở hộp với template chọn sẵn", () => {
  it("cache còn nóng ⇒ chọn NGAY, ô tên tự điền như chọn tay", async () => {
    const qc = newClient();
    qc.setQueryData(qk.templates.list(), { items: [GAME, SHOP] });
    mount({ initialTemplateId: "shop-9c0d" }, qc);
    expect(picker().textContent).toContain("Shop Tết");
    expect(nameBox().value).toBe("Shop Tết (mới)");
    expect(screen.queryByText("Các bước tiếp theo")).toBeNull();
  });

  it("danh sách về SAU khi mở ⇒ vẫn chọn đúng template khi nó về", async () => {
    mount({ initialTemplateId: "game-ui-a1b2" });
    await waitFor(() => expect(picker().textContent).toContain("Game UI"));
    expect(nameBox().value).toBe("Game UI (mới)");
  });

  it("người dùng gõ tên trong lúc đợi danh sách ⇒ chữ của họ KHÔNG bị đè", async () => {
    let resolve: (v: unknown) => void = () => {};
    H.list.mockReturnValue(new Promise((r) => { resolve = r; }));
    mount({ initialTemplateId: "game-ui-a1b2" });
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết 2027" } });
    await act(async () => { resolve({ items: [GAME, SHOP] }); });
    await waitFor(() => expect(picker().textContent).toContain("Game UI"));
    expect(nameBox().value).toBe("Chợ Tết 2027");
  });

  it("id không còn trong danh sách ⇒ mở ở «Dự án trống», không bịa lựa chọn", async () => {
    mount({ initialTemplateId: "da-xoa-0000" });
    await waitFor(() => expect(picker().textContent).toContain("Dự án trống"));
    expect(nameBox().value).toBe("");
  });

  it("đóng rồi mở lại với template khác ⇒ chọn template mới, ô tên tính lại từ đầu", async () => {
    const qc = newClient();
    qc.setQueryData(qk.templates.list(), { items: [GAME, SHOP] });
    const props = { onOpenChange: vi.fn(), gate: GATE, onCreated: vi.fn() };
    const view = render(
      <QueryClientProvider client={qc}><CreateModeDialog open initialTemplateId="game-ui-a1b2" {...props} /></QueryClientProvider>,
    );
    expect(nameBox().value).toBe("Game UI (mới)");
    view.rerender(<QueryClientProvider client={qc}><CreateModeDialog open={false} initialTemplateId="game-ui-a1b2" {...props} /></QueryClientProvider>);
    view.rerender(<QueryClientProvider client={qc}><CreateModeDialog open initialTemplateId="shop-9c0d" {...props} /></QueryClientProvider>);
    await waitFor(() => expect(picker().textContent).toContain("Shop Tết"));
    expect(nameBox().value).toBe("Shop Tết (mới)");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ① Gửi `fromTemplate`
   ══════════════════════════════════════════════════════════════════════════ */

describe("tạo dự án", () => {
  it("chọn template ⇒ gửi `fromTemplate`, rồi điều hướng như dự án trống", async () => {
    const { onCreated, onOpenChange } = mount();
    await choose(/Game UI/);
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
    await findPicker();
    fireEvent.change(nameBox(), { target: { value: "Chợ Tết" } });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(H.create).toHaveBeenCalledTimes(1));
    expect(H.create.mock.calls[0]![0]).not.toHaveProperty("fromTemplate");
    expect(H.create.mock.calls[0]![0]).toMatchObject({ name: "Chợ Tết", template: "blank" });
  });

  it("chọn sẵn qua `initialTemplateId` ⇒ bấm Tiếp tục là gửi đúng `fromTemplate`", async () => {
    const qc = newClient();
    qc.setQueryData(qk.templates.list(), { items: [GAME, SHOP] });
    mount({ initialTemplateId: "shop-9c0d" }, qc);
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(H.create).toHaveBeenCalledTimes(1));
    expect(H.create.mock.calls[0]![0]).toMatchObject({ name: "Shop Tết (mới)", fromTemplate: "shop-9c0d" });
  });

  it("agent báo template đã mất ⇒ lỗi hiện tại chỗ, danh sách mời lại, về «Dự án trống»", async () => {
    const { AgentError } = await import("@/lib/api/client");
    const { onCreated } = mount();
    await choose(/Game UI/);
    H.create.mockRejectedValueOnce(new AgentError({ code: "TEMPLATE_NOT_FOUND", status: 404, message: "template not found" }));
    H.list.mockResolvedValue({ items: [SHOP] });
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(picker().textContent).toContain("Dự án trống"));
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
