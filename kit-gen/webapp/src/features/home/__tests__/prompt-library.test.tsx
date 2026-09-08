// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * MÀN «THƯ VIỆN PROMPT» — bốn thứ mà hỏng thì HỎNG CÂM.
 *
 * ╔══ VÌ SAO ĐÚNG BỐN, KHÔNG PHẢI MỘT BỘ TEST UI ĐẦY ĐỦ ═════════════════════╗
 * ║ ① `?kind=` MỞ ĐÚNG DANH MỤC — đó là đích của lối tắt trên mọi menu pill.  ║
 * ║   Sai thì lối tắt vẫn "chạy", chỉ là đổ người dùng xuống một danh mục     ║
 * ║   khác, và không có gì báo.                                              ║
 * ║ ② SỬA XONG THÌ PILL ĐỔI THEO — đây là toàn bộ lý do màn này tồn tại. Nếu ║
 * ║   `pillOptions` không đọc kho thì màn vẫn sửa được, vẫn lưu được, và vẫn  ║
 * ║   vô dụng.                                                               ║
 * ║ ③ DÒNG HỆ THỐNG KHÔNG XOÁ ĐƯỢC — `auto`/`none`/`balanced` là giá trị mặc  ║
 * ║   định mà mã nguồn gọi tên thẳng; xoá chúng là để lại một mặc định không  ║
 * ║   tra ra dòng nào, và câu rụng khỏi prompt trong im lặng.                 ║
 * ║ ④ XOÁ PHẢI HAI CHẠM — một cú chạm trượt không được ném đi câu tiếng Anh   ║
 * ║   người ta vừa viết mười phút.                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const navigate = vi.fn();
let searchParams: { kind?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useSearch: () => searchParams,
}));

/* Vỏ app bị thay bằng một khung trần: nó kéo theo thanh bên, đồng hồ quota và nút
   cập nhật — ba thứ gọi API riêng và không liên quan gì tới thứ ca này đo. */
vi.mock("../components/HomeWorkspaceShell", () => ({
  HomeWorkspaceShell: ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
    <div><h1>{title}</h1>{action}{children}</div>
  ),
}));

const get = vi.fn();
vi.mock("@/lib/api/endpoints", () => ({
  api: {
    library: {
      get: (...args: unknown[]) => get(...args),
      addPreset: vi.fn(async () => ({ id: "x", kind: "style", name: "", data: {} })),
      patchPreset: vi.fn(async () => undefined),
      removePreset: vi.fn(async () => undefined),
    },
  },
}));

const { PromptLibraryScreen } = await import("../PromptLibraryScreen");
const { seedRowsOf, __resetPresetsStoreForTest } = await import("@/features/prompt-lab/lib/presets-store");
const { CATALOG_ORDER } = await import("@/features/prompt-lab/lib/catalog-seeds");
const { pillOptions } = await import("@/features/prompt-lab/lib/pill-registry");

/** Kho giả ĐÃ GIEO XONG — nếu thiếu một trục thì store bắn một loạt POST gieo hạt. */
function fullLibrary() {
  const presets = [
    ...seedRowsOf("style").map((row) => ({ id: `s_${row.id}`, kind: "style", name: row.vi, data: { key: row.id, en: row.en } })),
    ...seedRowsOf("element").map((row) => ({
      id: `e_${row.id}`, kind: "element", name: row.vi,
      data: { key: row.id, en: row.en, decor: row.element?.decor ?? "medium", glazeId: row.element?.glazeId ?? "auto", sizeId: "", ...(row.element?.skel ? { skel: row.element.skel } : {}) },
    })),
    ...CATALOG_ORDER.flatMap((kind) => seedRowsOf(kind).map((row) => ({
      id: `${kind}_${row.id}`, kind, name: row.vi,
      data: { key: row.id, en: row.en, ...(row.hint ? { hint: row.hint } : {}), ...(row.en2 ? { en2: row.en2 } : {}) },
    }))),
  ];
  return { version: 4, brands: [], settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 }, items: [], presets };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><PromptLibraryScreen /></QueryClientProvider>);
}

/** Chờ kho nạp xong — trước đó màn vẫn vẽ, nhưng bằng hạt giống trong RAM. */
const ready = () => waitFor(() => expect(screen.getByRole("navigation", { name: "Danh mục prompt" })).toBeTruthy());

beforeEach(() => {
  __resetPresetsStoreForTest();
  navigate.mockReset();
  searchParams = {};
  get.mockReset();
  get.mockResolvedValue(fullLibrary());
});

afterEach(() => cleanup());

describe("① rail danh mục + `?kind=`", () => {
  it("bày đủ 12 danh mục, mỗi mục kèm số dòng của nó", async () => {
    mount();
    await ready();
    const rail = screen.getByRole("navigation", { name: "Danh mục prompt" });
    expect(within(rail).getAllByRole("button")).toHaveLength(12);
    for (const label of ["Phong cách", "Chủ đề", "Khung cảnh", "Bố cục", "Đục nền", "Trang trí", "Bố trí", "Món giao diện", "Dáng", "Góc máy", "Biểu cảm", "Trang phục"]) {
      expect(within(rail).getByText(label)).toBeTruthy();
    }
  });

  /**
   * BỐN NHÓM, VÀ KHÔNG DANH MỤC NÀO RƠI RA NGOÀI.
   *
   * Rail vẽ theo `RAIL_GROUPS` chứ không theo `MANAGED_ORDER` nữa. Hai bảng lệch
   * nhau thì hỏng CÂM đúng kiểu tệ nhất: màn vẫn chạy, chỉ là một danh mục không
   * còn đường nào mở ra ngoài việc gõ tay `?kind=`. Đếm 12 nút ở ca trên bắt được
   * ca THIẾU; ca này bắt thêm ca nhóm bị đặt sai tên hoặc mất tiêu đề.
   */
  it("chia bốn nhóm theo đúng thứ tự thẻ của màn soạn", async () => {
    mount();
    await ready();
    const rail = screen.getByRole("navigation", { name: "Danh mục prompt" });
    for (const title of ["Ngữ cảnh chung", "Background", "Bộ UI", "Nhân vật"]) {
      expect(within(rail).getByText(title)).toBeTruthy();
    }
    /* Thứ tự ĐỌC TỪ DOM, không từ mảng nguồn — nếu đọc mảng thì ca tự so với chính nó. */
    const order = [...rail.querySelectorAll("p")].map((node) => node.textContent);
    expect(order).toEqual(["Ngữ cảnh chung", "Background", "Bộ UI", "Nhân vật"]);
  });

  /**
   * CỘT THỨ BA LUÔN CÓ MẶT — xem `EmptyEditor`. Chưa chọn dòng nào mà cột biến mất
   * thì màn trông như vỡ layout, và đó chính là báo cáo *"UI có vẻ lỗi"* của chủ
   * sản phẩm.
   */
  it("chưa chọn dòng nào ⇒ cột sửa vẫn đứng đó với lời mời chọn", async () => {
    mount();
    await ready();
    const panel = screen.getByRole("complementary", { name: "Chưa chọn mục nào" });
    expect(within(panel).getByText("Chọn một mục để sửa")).toBeTruthy();
  });

  it("`?kind=scene` mở thẳng danh mục Khung cảnh, không đổ về mục đầu", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();
    expect(screen.getByRole("region", { name: "Khung cảnh" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("a main menu screen background")).toBeTruthy());
  });

  it("`?kind=` rác rơi về danh mục đầu chứ không làm trắng màn", async () => {
    searchParams = { kind: "khong-co-that" };
    mount();
    await ready();
    expect(screen.getByRole("region", { name: "Phong cách" })).toBeTruthy();
  });

  it("bấm một danh mục ⇒ ghi lên URL, không giấu trong state", async () => {
    mount();
    await ready();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Danh mục prompt" })).getByText("Dáng"));
    expect(navigate).toHaveBeenCalledWith({ to: "/library/prompts", search: { kind: "pose" } });
  });
});

describe("② sửa một dòng ⇒ menu pill đổi theo NGAY", () => {
  it("đổi nhãn + câu tiếng Anh của một khung cảnh", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();
    await waitFor(() => expect(screen.getByText("Cửa hàng")).toBeTruthy());

    fireEvent.click(screen.getByText("Cửa hàng"));
    const vi = screen.getByLabelText("Nhãn tiếng Việt") as HTMLInputElement;
    fireEvent.change(vi, { target: { value: "Quầy hàng" } });
    const en = screen.getByLabelText("Câu tiếng Anh gửi máy vẽ") as HTMLTextAreaElement;
    fireEvent.change(en, { target: { value: "a market stall background" } });

    /* ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA CẢ FILE: `pillOptions` phải đọc kho. Trước
       09/2026 nó đọc một bảng cứng, nên mọi thứ ở trên vẫn "chạy" mà pill không đổi. */
    const shop = pillOptions("scene").find((option) => option.value === "shop");
    expect(shop?.vi).toBe("Quầy hàng");
    expect(shop?.en).toBe("a market stall background");
  });

  it("ẩn một dòng ⇒ nó rời menu pill, nhưng câu cũ vẫn tra ra đúng nhãn", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();
    await waitFor(() => expect(screen.getByText("Bản đồ")).toBeTruthy());

    fireEvent.click(screen.getByText("Bản đồ"));
    fireEvent.click(screen.getByLabelText("Hiện mục này trong menu"));

    expect(pillOptions("scene").some((option) => option.value === "map")).toBe(false);
    const { labelOf } = await import("@/features/prompt-lab/lib/pill-registry");
    expect(labelOf("scene", "map")).toBe("Bản đồ");
  });

  it("thêm một dòng ⇒ mục mới nằm cuối danh mục và mở sẵn ô nhãn", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();
    const before = pillOptions("scene").length;

    fireEvent.click(screen.getByRole("button", { name: /Thêm mục/ }));
    fireEvent.change(screen.getByLabelText("Nhãn tiếng Việt"), { target: { value: "Hầm ngục" } });
    fireEvent.change(screen.getByLabelText("Câu tiếng Anh gửi máy vẽ"), { target: { value: "a dungeon background" } });

    const options = pillOptions("scene");
    expect(options).toHaveLength(before + 1);
    expect(options.at(-1)!.vi).toBe("Hầm ngục");
  });

  /**
   * DÒNG MỚI KHÔNG ĐƯỢC RA ĐỜI VỚI NHÃN RỖNG.
   *
   * Agent từ chối `name` rỗng bằng 400, mà kho ghi theo từng phím — nên một dòng
   * rỗng nghĩa là cú bấm «Thêm mục» kéo theo một dải cảnh báo đỏ trước khi người
   * dùng kịp gõ ký tự đầu tiên. Xem khối chú thích ở `add()`.
   */
  it("dòng vừa thêm có nhãn tạm, không phải nhãn rỗng", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();

    fireEvent.click(screen.getByRole("button", { name: /Thêm mục/ }));
    expect((screen.getByLabelText("Nhãn tiếng Việt") as HTMLInputElement).value).toBe("Mục mới");
    expect(pillOptions("scene").at(-1)!.vi).toBe("Mục mới");
  });
});

describe("③ dòng hệ thống · trục không thêm được", () => {
  it("«Tự động» của Đục nền: sửa được câu, KHÔNG có nút xoá", async () => {
    searchParams = { kind: "glaze" };
    mount();
    await ready();
    await waitFor(() => expect(screen.getByText("Tự động")).toBeTruthy());

    fireEvent.click(screen.getByText("Tự động"));
    expect(screen.getByLabelText("Câu tiếng Anh gửi máy vẽ")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Xoá" })).toBeNull();
    expect(screen.getByText(/không xoá được/)).toBeTruthy();
  });

  it("«Kính trong» thì xoá được — khoá chỉ áp cho dòng mặc định", async () => {
    searchParams = { kind: "glaze" };
    mount();
    await ready();
    await waitFor(() => expect(screen.getByText("Kính trong")).toBeTruthy());

    fireEvent.click(screen.getByText("Kính trong"));
    expect(screen.getByRole("button", { name: "Xoá" })).toBeTruthy();
  });

  it("Dáng: nút «Thêm mục» khoá, và màn NÓI RA vì sao", async () => {
    searchParams = { kind: "pose" };
    mount();
    await ready();
    expect((screen.getByRole("button", { name: /Thêm mục/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/bảng góc khớp của hình nộm 3D/)).toBeTruthy();
  });
});

describe("④ xoá hai chạm", () => {
  it("chạm 1 chỉ đổi chữ nút; chạm 2 mới thật sự bỏ dòng", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();
    await waitFor(() => expect(screen.getByText("Màn chờ")).toBeTruthy());
    const before = pillOptions("scene").length;

    fireEvent.click(screen.getByText("Màn chờ"));
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));

    /* Chạm 1: chưa mất gì, nút đổi thành lời hỏi có TÊN của dòng — để một cú bấm
       trượt vào đúng toạ độ ấy vẫn còn cơ hội đọc mình đang xoá cái gì. */
    expect(pillOptions("scene")).toHaveLength(before);
    const ask = screen.getByRole("button", { name: "Xoá Màn chờ?" });

    fireEvent.click(ask);
    expect(pillOptions("scene")).toHaveLength(before - 1);
    expect(pillOptions("scene").some((option) => option.value === "loading")).toBe(false);
  });

  it("khôi phục mặc định cũng hai chạm, và trả đúng hạt giống", async () => {
    searchParams = { kind: "scene" };
    mount();
    await ready();
    await waitFor(() => expect(screen.getByText("Cửa hàng")).toBeTruthy());

    fireEvent.click(screen.getByText("Cửa hàng"));
    fireEvent.change(screen.getByLabelText("Nhãn tiếng Việt"), { target: { value: "Đã sửa" } });
    expect(pillOptions("scene").find((option) => option.value === "shop")?.vi).toBe("Đã sửa");

    fireEvent.click(screen.getByRole("button", { name: /Khôi phục mặc định/ }));
    fireEvent.click(screen.getByRole("button", { name: /Bỏ hết và về mặc định/ }));

    expect(pillOptions("scene").find((option) => option.value === "shop")?.vi).toBe("Cửa hàng");
  });
});
