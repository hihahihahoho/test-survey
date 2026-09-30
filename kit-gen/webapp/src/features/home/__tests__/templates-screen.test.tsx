// @vitest-environment jsdom
/**
 * MÀN «TEMPLATE DỰ ÁN» (`/templates`) — nơi quản lý template sau khi nút xoá rời khỏi
 * ô «Bắt đầu từ» của hộp Tạo dự án.
 *
 * Những thứ hỏng thì HỎNG CÂM:
 *  ① lối vào bị quên (thanh bên / ⌘K) ⇒ màn chạy đúng mà không ai tìm ra — mọi ca khác
 *    render thẳng component, bỏ qua lớp vỏ, nên chỉ ca riêng mới bắt được;
 *  ② «Tạo dự án» trên thẻ mở hộp ở «Dự án trống» ⇒ bấm nút của template ra dự án trắng;
 *  ③ đổi tên gửi đi một tên trống / quá 80 ký tự ⇒ agent 400, người dùng thấy băng lỗi
 *    chung chung thay vì lý do ngay dưới ô;
 *  ④ xoá ở cú bấm đầu, hoặc xoá hỏng mà hộp đã đóng ⇒ thẻ quay lại không một lời giải thích;
 *  ⑤ ảnh bìa thẻ to dùng chung tấm 128px của ô chọn nhỏ ⇒ nhoè, không lỗi;
 *  ⑥ «sửa nội dung» (bìa · tên · menu) mở nhầm phiên, hoặc tự chọn thay người dùng giữa
 *    «tiếp tục bản dở» và «bỏ bản dở» ⇒ mất công sửa hôm qua, không một lời báo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Template } from "@/lib/types";

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;

const CONNECTED = { pill: "ok", connected: true, readOnly: false, case: "ok", code: null };
const OFFLINE = { pill: "off", connected: false, readOnly: true, case: "agent-not-running", code: "AGENT_NOT_RUNNING" };

const H = vi.hoisted(() => ({
  navigate: vi.fn(),
  list: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
  coverBlob: vi.fn(),
  create: vi.fn(),
  trash: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  forget: vi.fn(),
  startEdit: vi.fn(),
  discardEdit: vi.fn(),
  status: { current: null as unknown },
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => H.navigate }));

/* Hai mảnh chân thanh bên tự mở query và probe `/health` — không liên quan gì ở đây. */
vi.mock("../components/UsageMeter", () => ({ UsageMeter: () => null }));
vi.mock("../components/UpdateSidebarButton", () => ({ UpdateSidebarButton: () => null }));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as { api: Record<string, Record<string, unknown>>; [k: string]: unknown };
  const api = {
    ...real.api,
    templates: {
      ...real.api.templates, list: H.list, patch: H.patch, remove: H.remove, coverBlob: H.coverBlob,
      startEdit: H.startEdit, discardEdit: H.discardEdit,
    },
    projects: { ...real.api.projects, create: H.create },
    trash: { ...real.api.trash, list: H.trash },
  };
  return { ...real, api, default: api };
});

vi.mock("@/lib/hooks", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  useAgentStatus: () => ({ status: H.status.current, recheck: vi.fn(), runBridgeProbe: vi.fn() }),
}));

vi.mock("@/features/projects/lib/feedback", async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  toastSuccess: H.toastSuccess,
  toastInfo: H.toastInfo,
}));

vi.mock("@/features/projects/lib/agent-blob", async (orig) => {
  const real = (await orig()) as typeof import("@/features/projects/lib/agent-blob");
  return {
    ...real,
    forgetTemplateCover: (id: string) => { H.forget(id); real.forgetTemplateCover(id); },
  };
});

const { TemplatesScreen } = await import("../TemplatesScreen");
const { loadTemplateCover, forgetTemplateCover } = await import("@/features/projects/lib/agent-blob");

const tpl = (id: string, name: string, over: Partial<Template> = {}): Template => ({
  id,
  name,
  description: "",
  tags: [],
  createdAt: "2026-09-12T12:00:00.000Z",
  updatedAt: "2026-09-12T12:00:00.000Z",
  sourceProjectId: "game-7f3a",
  sourceProjectName: "Game ăn xu",
  stats: { blocks: 3, refs: 6, bytes: 2048 },
  hasCover: false,
  ...over,
});

const GAME = tpl("game-ui-a1b2", "Game UI", { description: "Bộ UI game casual, nền tím", hasCover: true });
const SHOP = tpl("shop-9c0d", "Shop Tết", { stats: { blocks: 1, refs: 0, bytes: 0 }, sourceProjectName: "Shop 2026" });

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const utils = render(<QueryClientProvider client={qc}><TemplatesScreen /></QueryClientProvider>);
  return { ...utils, qc };
}

const card = (name: string) => screen.getByRole("article", { name });
const findCard = (name: string) => screen.findByRole("article", { name });
/** Tên thẻ là NÚT THẬT nằm trong heading — cửa vào «sửa nội dung» cho bàn phím. */
const titleButton = (name: string) =>
  within(within(card(name)).getByRole("heading", { level: 2 })).getByRole("button") as HTMLButtonElement;
/** Bìa: cùng cửa ấy cho chuột — rời cây a11y có chủ ý, nên tìm bằng thuộc tính. */
const coverButton = (name: string) => card(name).querySelector("[data-template-open]") as HTMLButtonElement;

/** Phiên sửa mà agent trả — dự án làm việc ẩn mang `templateEdit`. */
function session(templateId: string, over: { resumed: boolean; projectId?: string; startedAt?: string }) {
  const t = templateId === GAME.id ? GAME : SHOP;
  const projectId = over.projectId ?? `tpl-edit-${templateId}`;
  const startedAt = over.startedAt ?? "2026-09-30T09:00:00.000Z";
  return {
    project: {
      id: projectId, name: t.name, tags: [], broken: false,
      templateEdit: { templateId, templateName: t.name, startedAt, templateUpdatedAt: t.updatedAt },
    },
    template: { ...t, editing: { projectId, startedAt } },
    resumed: over.resumed,
  };
}

/** Radix mở menu bằng `pointerdown` mà jsdom không dựng `PointerEvent` — đi đường bàn phím. */
async function openMenu(name: string) {
  const trigger = within(await findCard(name)).getByRole("button", { name: `Thao tác khác cho ${name}` });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.findByRole("menu");
}

beforeEach(() => {
  for (const fn of [
    H.navigate, H.list, H.patch, H.remove, H.coverBlob, H.create, H.trash, H.toastSuccess, H.toastInfo, H.forget,
    H.startEdit, H.discardEdit,
  ]) fn.mockReset();
  H.status.current = CONNECTED;
  H.list.mockResolvedValue({ items: [GAME, SHOP] });
  H.trash.mockResolvedValue({ items: [] });
  H.coverBlob.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  H.patch.mockImplementation(async (id: string, input: { name?: string; description?: string }) => ({
    ...(id === GAME.id ? GAME : SHOP), ...input, updatedAt: "2026-09-30T10:00:00.000Z",
  }));
  H.remove.mockResolvedValue({ ok: true });
  H.discardEdit.mockResolvedValue({ ok: true });
  H.startEdit.mockImplementation(async (id: string) => session(id, { resumed: false }));
  H.create.mockImplementation(async (input: { name: string }) => ({
    project: { id: "moi-1c2d", name: input.name, slug: "moi", tags: [], broken: false },
    warnings: [],
  }));
  /* jsdom không có object URL. Cache ảnh bìa là cấp module ⇒ dọn giữa các ca, không thì
     ca sau "thấy" ảnh ca trước tải và không gọi agent nữa. */
  URL.createObjectURL = vi.fn(() => "blob:cover");
  URL.revokeObjectURL = vi.fn();
  for (const id of [GAME.id, SHOP.id, "cover-cache-0001"]) forgetTemplateCover(id);
  H.forget.mockReset();
});

afterEach(cleanup);

/* ══════════════════════════════════════════════════════════════════════════
   ① Lối vào
   ══════════════════════════════════════════════════════════════════════════ */

describe("lối vào — thanh bên", () => {
  it("«Template dự án» nằm trong nhóm «Quản lý», đang được đánh dấu, bấm thì đi `/templates`", async () => {
    mount();
    const group = screen.getByRole("navigation", { name: "Quản lý" });
    const entry = within(group).getByRole("button", { name: "Template dự án" });
    expect(entry.getAttribute("aria-current")).toBe("page");
    // Đứng cuối nhóm, sau ba thư viện nguyên liệu.
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Nhận dạng thương hiệu", "Prompt", "Ảnh phong cách", "Template dự án",
    ]);
    fireEvent.click(entry);
    expect(H.navigate).toHaveBeenCalledWith({ to: "/templates" });
  });

  it("tiêu đề trang là «Template dự án»", () => {
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Template dự án" })).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Lưới thẻ + các trạng thái
   ══════════════════════════════════════════════════════════════════════════ */

describe("lưới thẻ", () => {
  it("mỗi template một thẻ: tên, mô tả, caption, «Từ dự án», nút «Tạo dự án»", async () => {
    mount();
    const game = await findCard("Game UI");
    expect(within(game).getByRole("heading", { level: 2, name: "Game UI" })).toBeTruthy();
    expect(game.textContent).toContain("Bộ UI game casual, nền tím");
    expect(game.textContent).toMatch(/3 thẻ · 6 ảnh · lưu /);
    expect(game.textContent).toContain("Từ dự án: Game ăn xu");
    expect(within(game).getByRole("button", { name: "Tạo dự án từ Game UI" })).toBeTruthy();

    const shop = card("Shop Tết");
    expect(shop.textContent).toMatch(/1 thẻ · 0 ảnh · lưu /);
    expect(shop.textContent).toContain("Từ dự án: Shop 2026");
    // Không mô tả ⇒ không có dòng trống giả làm mô tả.
    expect(shop.querySelector(".line-clamp-2")).toBeNull();
  });

  it("⑤ ảnh bìa thẻ xin `?w=512`; template không có bìa thì KHÔNG hỏi agent, hiện ô giữ chỗ có chữ", async () => {
    mount();
    const game = await findCard("Game UI");
    await waitFor(() => expect(game.querySelector("img")?.getAttribute("src")).toBe("blob:cover"));
    expect(H.coverBlob).toHaveBeenCalledWith("game-ui-a1b2", 512);
    expect(H.coverBlob.mock.calls.some(([id]) => id === "shop-9c0d")).toBe(false);
    expect(card("Shop Tết").textContent).toContain("Chưa có ảnh bìa");
  });

  it("chưa có template ⇒ chỉ đường: mở dự án, bấm «Lưu làm template» (cả ở menu thẻ), chọn ở «Bắt đầu từ»", async () => {
    H.list.mockResolvedValue({ items: [] });
    mount();
    expect(await screen.findByText("Chưa có template nào")).toBeTruthy();
    expect(screen.getByText(/Ở màn soạn, bấm «Lưu làm template»\. Nút này cũng có trong menu ⋯ của thẻ dự án\./)).toBeTruthy();
    expect(screen.getByText(/chọn template ở ô «Bắt đầu từ»/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mở danh sách dự án" }));
    expect(H.navigate).toHaveBeenCalledWith({ to: "/", search: {} });
  });

  it("đang tải ⇒ khung chờ có nhãn đọc được, không phải màn trắng", () => {
    H.list.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByText("Đang tải danh sách template…")).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
  });

  it("tải hỏng ⇒ nói ra + Thử lại mời lại danh sách", async () => {
    H.list.mockRejectedValueOnce(new Error("boom"));
    mount();
    expect(await screen.findByText("Chưa lấy được danh sách template.")).toBeTruthy();
    H.list.mockResolvedValue({ items: [GAME] });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await findCard("Game UI")).toBeTruthy();
  });

  it("≤ 8 template ⇒ không có ô tìm; > 8 ⇒ có, lọc theo tên (không dấu)", async () => {
    mount();
    await findCard("Game UI");
    expect(screen.queryByRole("searchbox", { name: "Tìm template" })).toBeNull();
    cleanup();

    const many = Array.from({ length: 9 }, (_, i) => tpl(`mau-${i}-0000`, `Mẫu số ${i}`));
    H.list.mockResolvedValue({ items: [...many, SHOP] });
    mount();
    const search = await screen.findByRole("searchbox", { name: "Tìm template" });
    fireEvent.change(search, { target: { value: "tet" } });
    expect(screen.getAllByRole("article").map((a) => a.getAttribute("data-template-card"))).toEqual(["shop-9c0d"]);
    fireEvent.change(search, { target: { value: "khong co" } });
    expect(screen.getByText("Không có template nào tên «khong co»")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xoá từ khoá" }));
    expect(screen.getAllByRole("article")).toHaveLength(10);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② «Tạo dự án»
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Tạo dự án» trên thẻ", () => {
  it("mở hộp Tạo dự án với ĐÚNG template chọn sẵn, tạo xong đi khu soạn như tạo từ danh sách dự án", async () => {
    mount();
    fireEvent.click(within(await findCard("Shop Tết")).getByRole("button", { name: "Tạo dự án từ Shop Tết" }));
    const dialog = await screen.findByRole("dialog", { name: "Tạo dự án" });
    expect((within(dialog).getByLabelText("Tên dự án") as HTMLInputElement).value).toBe("Shop Tết (mới)");
    expect(within(dialog).getByRole("button", { name: /^Bắt đầu từ Shop Tết$/ })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Tiếp tục" }));
    await waitFor(() => expect(H.create).toHaveBeenCalledTimes(1));
    expect(H.create.mock.calls[0]![0]).toMatchObject({ name: "Shop Tết (mới)", fromTemplate: "shop-9c0d" });
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith({ to: "/k/$projectId", params: { projectId: "moi-1c2d" } }));
  });

  it("đang ở chính màn quản lý ⇒ popover không có dòng «Quản lý template…»", async () => {
    mount();
    fireEvent.click(within(await findCard("Game UI")).getByRole("button", { name: "Tạo dự án từ Game UI" }));
    const dialog = await screen.findByRole("dialog", { name: "Tạo dự án" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Bắt đầu từ/ }));
    await screen.findByRole("listbox");
    expect(screen.queryByRole("option", { name: "Quản lý template…" })).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ Đổi tên & mô tả
   ══════════════════════════════════════════════════════════════════════════ */

describe("«Đổi tên & mô tả»", () => {
  async function openEdit(name: string) {
    await openMenu(name);
    fireEvent.click(screen.getByRole("menuitem", { name: "Đổi tên & mô tả" }));
    return screen.findByRole("dialog", { name: "Đổi tên & mô tả" });
  }

  it("mở ra điền sẵn tên + mô tả hiện tại", async () => {
    mount();
    await openEdit("Game UI");
    expect((screen.getByLabelText("Tên template") as HTMLInputElement).value).toBe("Game UI");
    expect((screen.getByLabelText(/Mô tả/) as HTMLTextAreaElement).value).toBe("Bộ UI game casual, nền tím");
  });

  it("tên trống ⇒ lý do ngay dưới ô, KHÔNG gọi agent", async () => {
    mount();
    await openEdit("Game UI");
    fireEvent.change(screen.getByLabelText("Tên template"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(screen.getByRole("alert").textContent).toBe("Đặt tên cho template.");
    expect(screen.getByLabelText("Tên template").getAttribute("aria-invalid")).toBe("true");
    expect(H.patch).not.toHaveBeenCalled();
  });

  it("tên quá 80 ký tự ⇒ nói số đang có, KHÔNG cắt lặng lẽ, KHÔNG gọi agent", async () => {
    mount();
    await openEdit("Game UI");
    const long = "x".repeat(81);
    fireEvent.change(screen.getByLabelText("Tên template"), { target: { value: long } });
    // Ô không có trần ⇒ chữ dán vào còn nguyên, và bộ đếm đổi màu nói trước.
    expect((screen.getByLabelText("Tên template") as HTMLInputElement).value).toBe(long);
    expect(screen.getByText("81/80 ký tự")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    expect(screen.getByRole("alert").textContent).toBe("Tên dài tối đa 80 ký tự — đang có 81.");
    expect(H.patch).not.toHaveBeenCalled();
  });

  it("hợp lệ ⇒ PATCH tên + mô tả (đã trim), đóng hộp, thẻ đổi theo", async () => {
    mount();
    await openEdit("Game UI");
    fireEvent.change(screen.getByLabelText("Tên template"), { target: { value: "  Game UI Tết  " } });
    fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: " Bản cho chiến dịch Tết " } });
    H.list.mockResolvedValue({ items: [{ ...GAME, name: "Game UI Tết", description: "Bản cho chiến dịch Tết" }, SHOP] });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(H.patch).toHaveBeenCalledTimes(1));
    expect(H.patch).toHaveBeenCalledWith("game-ui-a1b2", { name: "Game UI Tết", description: "Bản cho chiến dịch Tết" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Đổi tên & mô tả" })).toBeNull());
    expect(await findCard("Game UI Tết")).toBeTruthy();
    expect(H.toastSuccess).toHaveBeenCalledWith("Đã lưu «Game UI Tết»");
  });

  it("xoá mô tả cho trống ⇒ gửi chuỗi rỗng (agent xoá mô tả), không bỏ qua", async () => {
    mount();
    await openEdit("Game UI");
    fireEvent.change(screen.getByLabelText(/Mô tả/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(H.patch).toHaveBeenCalledWith("game-ui-a1b2", { name: "Game UI", description: "" }));
  });

  it("không đổi gì ⇒ đóng hộp, không gọi agent", async () => {
    mount();
    await openEdit("Shop Tết");
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Đổi tên & mô tả" })).toBeNull());
    expect(H.patch).not.toHaveBeenCalled();
  });

  it("agent từ chối ⇒ lỗi hiện TRONG hộp (không chỉ toast), hộp vẫn mở", async () => {
    const { AgentError } = await import("@/lib/api/client");
    H.patch.mockRejectedValue(new AgentError({ code: "INVALID_NAME", status: 400, message: "template name must be 1..80 chars" }));
    mount();
    await openEdit("Game UI");
    fireEvent.change(screen.getByLabelText("Tên template"), { target: { value: "Tên mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    const dialog = screen.getByRole("dialog", { name: "Đổi tên & mô tả" });
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("Tên chưa dùng được"));
    expect(H.toastSuccess).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ Xoá
   ══════════════════════════════════════════════════════════════════════════ */

describe("xoá template", () => {
  async function openDelete(name: string) {
    await openMenu(name);
    fireEvent.click(screen.getByRole("menuitem", { name: "Xoá" }));
    return screen.findByRole("alertdialog", { name: `Xoá template “${name}”?` });
  }

  it("KHÔNG xoá ở cú bấm menu — hộp xác nhận nói rõ hệ quả", async () => {
    mount();
    const dialog = await openDelete("Game UI");
    expect(H.remove).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("Các dự án đã tạo từ template này vẫn giữ nguyên");
    expect(dialog.textContent).toContain("giữ 30 ngày trong thư mục thùng rác của thư mục làm việc");
    expect(dialog.textContent).toContain("không hiện ở màn «Thùng rác»");
    // Focus mặc định ở nút AN TOÀN.
    expect(document.activeElement?.textContent).toBe("Huỷ");
  });

  it("xác nhận ⇒ DELETE đúng id, quên ảnh bìa đã cache, thẻ biến mất, hộp đóng", async () => {
    mount();
    await openDelete("Game UI");
    H.list.mockResolvedValue({ items: [SHOP] });
    fireEvent.click(screen.getByRole("button", { name: "Xoá template" }));
    await waitFor(() => expect(H.remove).toHaveBeenCalledWith("game-ui-a1b2"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByRole("article", { name: "Game UI" })).toBeNull();
    expect(H.forget).toHaveBeenCalledWith("game-ui-a1b2");
    expect(H.toastSuccess).toHaveBeenCalledWith("Đã xoá template «Game UI»");
  });

  it("agent từ chối ⇒ thẻ QUAY LẠI và hộp đứng nguyên báo lỗi tại chỗ", async () => {
    const { AgentError } = await import("@/lib/api/client");
    H.remove.mockRejectedValue(new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }));
    mount();
    await openDelete("Game UI");
    fireEvent.click(screen.getByRole("button", { name: "Xoá template" }));
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeTruthy());
    // Hộp modal che phần còn lại (aria-hidden) ⇒ nhìn thẻ sau khi đóng, đúng như người dùng.
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(await findCard("Game UI")).toBeTruthy();
    expect(H.forget).not.toHaveBeenCalled();
    expect(H.toastSuccess).not.toHaveBeenCalled();
  });

  it("huỷ ⇒ không gọi gì", async () => {
    mount();
    await openDelete("Shop Tết");
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(H.remove).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ «Sửa nội dung» — bìa · tên · menu, và câu hỏi «tiếp tục hay bỏ bản dở»
   ══════════════════════════════════════════════════════════════════════════ */

describe("⑥ «Sửa nội dung»", () => {
  const toKit = (projectId: string) => ({ to: "/k/$projectId", params: { projectId } });
  const STARTED = "2026-09-30T09:00:00.000Z";
  const GAME_EDITING = { ...GAME, editing: { projectId: "tpl-edit-cu", startedAt: STARTED } };

  it("bấm TÊN ⇒ mở phiên của đúng template rồi vào màn soạn của dự án làm việc", async () => {
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-game-ui-a1b2")));
    expect(H.startEdit).toHaveBeenCalledTimes(1);
    expect(H.startEdit).toHaveBeenCalledWith("game-ui-a1b2");
    // Phiên mới ⇒ không có gì để hỏi.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("bấm BÌA ⇒ cùng cửa ấy (và bìa rời thứ tự Tab — tên mới là cửa cho bàn phím)", async () => {
    mount();
    await findCard("Shop Tết");
    const cover = coverButton("Shop Tết");
    expect(cover.tabIndex).toBe(-1);
    expect(cover.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(cover.querySelector("[data-template-cover]")!);
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-shop-9c0d")));
    expect(H.startEdit).toHaveBeenCalledWith("shop-9c0d");
  });

  it("menu ⋯: «Sửa nội dung» ĐỨNG ĐẦU, bấm thì mở phiên; «Tạo dự án» vẫn là nút riêng ở chân thẻ", async () => {
    mount();
    const menu = await openMenu("Shop Tết");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Sửa nội dung", "Đổi tên & mô tả", "Xoá"]);
    fireEvent.click(items[0]!);
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-shop-9c0d")));
    expect(within(card("Shop Tết")).getByRole("button", { name: "Tạo dự án từ Shop Tết" })).toBeTruthy();
  });

  it("agent trả `resumed: true` (danh sách cũ hơn tab khác) ⇒ HỎI, không tự đi; «Tiếp tục sửa» vào thẳng phiên ấy", async () => {
    H.startEdit.mockImplementation(async (id: string) => session(id, { resumed: true, projectId: "tpl-edit-cu" }));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    const dialog = await screen.findByRole("dialog", { name: "Tiếp tục bản sửa dở?" });
    expect(H.navigate).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain("Bạn có bản sửa dở của template «Game UI» từ");
    expect(dialog.textContent).toContain("không hoàn tác được");
    expect(within(dialog).getByRole("button", { name: "Bỏ bản dở, mở lại từ template" })).toBeTruthy();
    // Focus mặc định ở lựa chọn KHÔNG làm mất gì.
    expect(document.activeElement?.textContent).toBe("Tiếp tục sửa");

    fireEvent.click(within(dialog).getByRole("button", { name: "Tiếp tục sửa" }));
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-cu")));
    // Phiên đã nằm trong tay ⇒ không gọi agent lần hai, không bỏ gì.
    expect(H.startEdit).toHaveBeenCalledTimes(1);
    expect(H.discardEdit).not.toHaveBeenCalled();
  });

  it("thẻ có phiên dở ⇒ nhãn «Đang sửa dở»; bấm ⇒ hỏi NGAY, chưa gọi agent", async () => {
    H.list.mockResolvedValue({ items: [GAME_EDITING, SHOP] });
    mount();
    const game = await findCard("Game UI");
    expect(within(game).getByText("Đang sửa dở")).toBeTruthy();
    expect(within(card("Shop Tết")).queryByText("Đang sửa dở")).toBeNull();
    fireEvent.click(coverButton("Game UI"));
    await screen.findByRole("dialog", { name: "Tiếp tục bản sửa dở?" });
    expect(H.startEdit).not.toHaveBeenCalled();
    expect(H.navigate).not.toHaveBeenCalled();
  });

  it("«Tiếp tục sửa» từ nhãn ⇒ nối lại phiên (agent trả đúng phiên cũ) rồi đi, không nhắc gì thêm", async () => {
    H.list.mockResolvedValue({ items: [GAME_EDITING, SHOP] });
    H.startEdit.mockImplementation(async (id: string) => session(id, { resumed: true, projectId: "tpl-edit-cu" }));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    const dialog = await screen.findByRole("dialog", { name: "Tiếp tục bản sửa dở?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tiếp tục sửa" }));
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-cu")));
    expect(H.startEdit).toHaveBeenCalledWith("game-ui-a1b2");
    expect(H.discardEdit).not.toHaveBeenCalled();
    expect(H.toastInfo).not.toHaveBeenCalled();
  });

  it("bản dở biến mất giữa lúc hỏi và lúc bấm «Tiếp tục» ⇒ vẫn mở (bản sạch) nhưng NÓI RA", async () => {
    H.list.mockResolvedValue({ items: [GAME_EDITING, SHOP] });
    H.startEdit.mockImplementation(async (id: string) => session(id, { resumed: false, projectId: "tpl-edit-moi" }));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    const dialog = await screen.findByRole("dialog", { name: "Tiếp tục bản sửa dở?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tiếp tục sửa" }));
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-moi")));
    expect(H.toastInfo).toHaveBeenCalledWith("Bản sửa dở không còn nữa", expect.stringContaining("mở lại từ nội dung đang lưu"));
  });

  it("«Bỏ bản dở, mở lại từ template» ⇒ bỏ phiên cũ TRƯỚC, mở phiên mới SAU, rồi vào phiên mới", async () => {
    H.list.mockResolvedValue({ items: [GAME_EDITING, SHOP] });
    H.startEdit.mockImplementation(async (id: string) => session(id, { resumed: false, projectId: "tpl-edit-moi" }));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    const dialog = await screen.findByRole("dialog", { name: "Tiếp tục bản sửa dở?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Bỏ bản dở, mở lại từ template" }));
    await waitFor(() => expect(H.navigate).toHaveBeenCalledWith(toKit("tpl-edit-moi")));
    expect(H.discardEdit).toHaveBeenCalledWith("game-ui-a1b2");
    expect(H.discardEdit.mock.invocationCallOrder[0]!).toBeLessThan(H.startEdit.mock.invocationCallOrder[0]!);
  });

  it("bỏ bản dở HỎNG ⇒ lỗi trong hộp, hộp vẫn mở, không mở phiên nào", async () => {
    const { AgentError } = await import("@/lib/api/client");
    H.list.mockResolvedValue({ items: [GAME_EDITING, SHOP] });
    H.discardEdit.mockRejectedValue(new AgentError({ code: "AGENT_NOT_RUNNING", status: 0, message: "fetch failed" }));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    const dialog = await screen.findByRole("dialog", { name: "Tiếp tục bản sửa dở?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Bỏ bản dở, mở lại từ template" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toBeTruthy());
    expect(H.startEdit).not.toHaveBeenCalled();
    expect(H.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Tiếp tục bản sửa dở?" })).toBeTruthy();
  });

  it("mở phiên hỏng ⇒ lỗi hiện NGAY TRÊN THẺ ấy (chữ từ bảng lỗi), không đi đâu", async () => {
    const { AgentError } = await import("@/lib/api/client");
    H.startEdit.mockRejectedValue(new AgentError({ code: "TEMPLATE_NOT_FOUND", status: 404, message: "template gone" }));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    await waitFor(() => expect(within(card("Game UI")).getByRole("alert").textContent).toContain("Template không còn ở đây"));
    expect(within(card("Shop Tết")).queryByRole("alert")).toBeNull();
    expect(H.navigate).not.toHaveBeenCalled();
  });

  it("đang mở phiên ⇒ thẻ nói «Đang mở để sửa…» và cửa vào của MỌI thẻ khoá (một lượt một lúc)", async () => {
    H.startEdit.mockReturnValue(new Promise(() => {}));
    mount();
    await findCard("Game UI");
    fireEvent.click(titleButton("Game UI"));
    await waitFor(() => expect(within(card("Game UI")).getByRole("status").textContent).toBe("Đang mở để sửa…"));
    expect(card("Game UI").getAttribute("aria-busy")).toBe("true");
    expect(titleButton("Shop Tết").disabled).toBe(true);
    fireEvent.click(coverButton("Shop Tết"));
    expect(H.startEdit).toHaveBeenCalledTimes(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Chỉ-đọc
   ══════════════════════════════════════════════════════════════════════════ */

describe("công cụ local chưa chạy ⇒ nút ghi KHOÁ kèm lý do, không ẩn", () => {
  it("«Tạo dự án» khoá + title nói lý do; mục menu khoá + nói lý do trong chữ", async () => {
    H.status.current = OFFLINE;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["templates", "list"], { items: [GAME] });
    render(<QueryClientProvider client={qc}><TemplatesScreen /></QueryClientProvider>);
    const create = within(card("Game UI")).getByRole("button", { name: "Tạo dự án từ Game UI" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(create.title).toBe("Cần công cụ local đang chạy");
    const menu = await openMenu("Game UI");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Sửa nội dung — Cần công cụ local đang chạy",
      "Đổi tên & mô tả — Cần công cụ local đang chạy",
      "Xoá — Cần công cụ local đang chạy",
    ]);
    expect(items.every((i) => i.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("«Sửa nội dung» qua bìa / tên cũng khoá — bấm không gọi agent", () => {
    H.status.current = OFFLINE;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["templates", "list"], { items: [GAME] });
    render(<QueryClientProvider client={qc}><TemplatesScreen /></QueryClientProvider>);
    const title = titleButton("Game UI");
    expect(title.disabled).toBe(true);
    expect(title.title).toBe("Cần công cụ local đang chạy");
    expect(coverButton("Game UI").disabled).toBe(true);
    fireEvent.click(title);
    fireEvent.click(coverButton("Game UI"));
    expect(H.startEdit).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ Cache ảnh bìa theo bề rộng
   ══════════════════════════════════════════════════════════════════════════ */

describe("`loadTemplateCover` — bề rộng nằm trong khoá cache", () => {
  it("128 và 512 là HAI tấm khác nhau; cùng bề rộng thì dùng lại; quên là quên mọi bề rộng", async () => {
    const id = "cover-cache-0001";
    await loadTemplateCover(id, "t1");
    await loadTemplateCover(id, "t1", 512);
    await loadTemplateCover(id, "t1", 512);
    expect(H.coverBlob.mock.calls).toEqual([[id, 128], [id, 512]]);
    forgetTemplateCover(id);
    await act(async () => { await loadTemplateCover(id, "t1", 512); });
    expect(H.coverBlob.mock.calls).toEqual([[id, 128], [id, 512], [id, 512]]);
  });
});
