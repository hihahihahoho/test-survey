// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * presets-store — DANH MỤC ĐÃ RỜI localStorage LÊN WORKSPACE (Wave 4·A).
 *
 * ╔══ BỐN THỨ TEST NÀY KHOÁ, VÀ VÌ SAO ĐÚNG BỐN THỨ ĐÓ ══════════════════════╗
 * ║ 1. `id` bundle KHÔNG phải id server. Id bundle nằm trong tài liệu đã lưu   ║
 * ║    (`elementId` mỗi ô, giá trị pill phong cách). Nếu một ngày ai đó "dọn   ║
 * ║    dẹp" bằng cách dùng thẳng `row.id`, mọi tài liệu cũ trỏ vào hư không —  ║
 * ║    và hỏng đó CÂM: prompt chỉ thiếu một mảnh, không ai thấy.               ║
 * ║ 2. Gieo hạt ĐÚNG MỘT LẦN. Giữa lúc POST bay đi và lúc query trả về, mảng   ║
 * ║    `presets` vẫn RỖNG; năm component cùng gọi `usePresets` sẽ cùng thấy    ║
 * ║    "kho rỗng, gieo đi" nếu cờ chống lặp không dùng chung.                  ║
 * ║ 3. Ghi GỘP và ghi ĐÚNG CÁI ĐỔI. Màn preset sửa theo từng phím; mỗi phím    ║
 * ║    một PATCH cho mọi dòng là hàng trăm request và một cuộc đua ghi đè.     ║
 * ║ 4. Ghi HỎNG phải NÓI RA. Bản localStorage hỏng thì cùng lắm mất lúc mở     ║
 * ║    lại; bản này hỏng mà im lặng thì người dùng tưởng đã lưu.               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Mock ở tầng `@/lib/api/endpoints` chứ không ở tầng `fetch`: đó là ranh giới mà
 * store thật sự nói chuyện qua, và nó cũng là cửa của `useUserLibrary()` — nên
 * một mock phục vụ cả đường đọc lẫn đường ghi, không phải bịa hai lần.
 */

const get = vi.fn();
const addPreset = vi.fn();
const patchPreset = vi.fn();
const removePreset = vi.fn();

vi.mock("@/lib/api/endpoints", () => ({
  api: { library: { get, addPreset, patchPreset, removePreset } },
}));

const {
  usePresets, usePresetSyncError, setPresets, seedPresets, __resetPresetsStoreForTest,
} = await import("../presets-store");

type Row = { id: string; kind: string; name: string; data: Record<string, unknown> };

const library = (presets: Row[]) => ({
  version: 4,
  brands: [],
  settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 },
  items: [],
  presets,
});

/** Bản ghi server giả — luôn có `data.key`, đúng như `payloadOf` ghi ra. */
const row = (id: string, kind: string, name: string, data: Record<string, unknown>): Row =>
  ({ id, kind, name, data });

let seen: ReturnType<typeof seedPresets> | null = null;
let lastError: string | null = null;

function Probe() {
  seen = usePresets();
  lastError = usePresetSyncError();
  return null;
}

function mount(count = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      {Array.from({ length: count }, (_, index) => <Probe key={index} />)}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  __resetPresetsStoreForTest();
  seen = null;
  lastError = null;
  get.mockReset();
  addPreset.mockReset();
  patchPreset.mockReset();
  removePreset.mockReset();
  addPreset.mockImplementation(async (input: { kind: string; name: string; data: Record<string, unknown> }) =>
    row(`preset_server_${String(input.data.key)}`, input.kind, input.name, input.data));
  patchPreset.mockResolvedValue(undefined);
  removePreset.mockResolvedValue(undefined);
});

afterEach(() => { cleanup(); });

describe("đọc: server là nguồn, id bundle giữ nguyên qua `data.key`", () => {
  it("dựng lại ba mảng từ mảng `presets` của GET /api/library", async () => {
    get.mockResolvedValue(library([
      row("preset_aaaa", "style", "Cổ tích", { key: "fairy", en: "storybook" }),
      /* Id KHÔNG nằm trong hạt giống ⇒ không dính bảng di trú hình dạng/cỡ ở dưới;
         ca này khoá điều khoản #1 (id = `data.key`), không khoá di trú. */
      row("preset_bbbb", "element", "Khiên", { key: "shield", en: "shield", decor: 6, glazeId: "ice", sizeId: "m" }),
      row("preset_cccc", "mascot", "Sóc", { key: "squirrel", en: "a squirrel", refName: "soc.png" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.styles).toHaveLength(1));
    /* ĐIỀU KHOẢN #1: id là `data.key`, KHÔNG phải `preset_aaaa`. */
    expect(seen?.styles[0]).toEqual({ id: "fairy", vi: "Cổ tích", en: "storybook" });
    expect(seen?.elements[0]).toEqual({ id: "shield", vi: "Khiên", en: "shield", decor: 6, glazeId: "ice", sizeId: "m" });
    expect(seen?.mascots[0]).toEqual({ id: "squirrel", vi: "Sóc", en: "a squirrel", refName: "soc.png" });
    /* Kho đã có bản ghi ⇒ KHÔNG gieo lại đè lên danh mục của người ta. */
    expect(addPreset).not.toHaveBeenCalled();
  });

  it("đọc phòng thủ: thiếu `key`, `data` rỗng, `kind` lab chưa dùng — không ném, không nuốt", async () => {
    get.mockResolvedValue(library([
      row("preset_dddd", "style", "Không có key", {}),
      /* `material` là kind agent chấp nhận nhưng lab chưa vẽ. Một bản web cũ
         không được làm hỏng dữ liệu mà bản mới vừa ghi ⇒ bỏ qua, không ném. */
      row("preset_eeee", "material", "Kim loại", { key: "metal", en: "brushed metal" }),
      row("preset_ffff", "element", "Sai kiểu decor", { key: "odd", en: "x", decor: "sáu" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.styles).toHaveLength(1));
    /* Thiếu `key` thì thà một id xấu (id server) còn hơn nuốt mất bản ghi. */
    expect(seen?.styles[0]!.id).toBe("preset_dddd");
    expect(seen?.elements).toHaveLength(1);
    expect(seen?.elements[0]!.decor).toBe(4);
    expect(seen?.mascots).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DI TRÚ HÌNH DẠNG — bản ghi đời trước KHÔNG có `skel`
   ══════════════════════════════════════════════════════════════════════════
   Hạt giống chỉ gieo vào kho RỖNG, nên mọi workspace đã mở app trước 07/09/2026
   đang giữ tám bản ghi element không có `skel` và có `sizeId` ghim theo bốn nấc
   S/M/L/XL. Không vá thì lượt sửa này chỉ chạy trên máy chưa ai dùng — đúng cái
   bẫy mà `LEGACY_ELEMENT_EN` đã phải đi vòng để tránh. */
describe("di trú: hình dạng cho bản ghi element đời trước", () => {
  const seed = seedPresets();
  const seedOf = (id: string) => seed.elements.find((element) => element.id === id);

  it("thiếu `skel` + id hạt giống ⇒ vá hình dạng theo bảng hạt giống", async () => {
    get.mockResolvedValue(library([
      row("preset_h1", "element", "Thanh máu", { key: "healthbar", en: "health bar", decor: 3, glazeId: "", sizeId: "" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen?.elements[0]!.skel).toEqual(seedOf("healthbar")!.skel);
  });

  it("`sizeId` ĐÚNG BẰNG nấc hạt giống đời trước ⇒ trả về rỗng để hình dạng lên tiếng", async () => {
    get.mockResolvedValue(library([
      /* `l` là nấc mà hạt giống cũ ghim cho thanh máu. Giữ nó lại thì hộp ra
         256×192 (1,3:1) — vẫn không phải hình dạng của một thanh máu. */
      row("preset_h1", "element", "Thanh máu", { key: "healthbar", en: "health bar", decor: 3, glazeId: "", sizeId: "l" }),
      /* «M» KHÔNG phải nấc cũ của thanh máu ⇒ đó là lựa chọn của người dùng, giữ. */
      row("preset_b1", "element", "Nút bấm", { key: "button", en: "button", decor: 4, glazeId: "", sizeId: "l" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(2));
    expect(seen?.elements[0]!.sizeId).toBe("");
    expect(seen?.elements[1]!.sizeId).toBe("l");
  });

  it("`skel` ĐÃ có trên đĩa ⇒ nó thắng bảng hạt giống", async () => {
    const mine = { shape: "rrect", w: 0.5, h: 0.5 };
    get.mockResolvedValue(library([
      row("preset_h1", "element", "Thanh máu", { key: "healthbar", en: "health bar", decor: 3, glazeId: "", sizeId: "", skel: mine }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen?.elements[0]!.skel).toEqual(mine);
  });

  it("`skel` RÁC trên đĩa ⇒ bỏ, không đẩy một hộp âm vào contract", async () => {
    get.mockResolvedValue(library([
      row("preset_x1", "element", "Khiên", { key: "shield", en: "shield", decor: 4, glazeId: "", sizeId: "", skel: { shape: "khong-co-that", w: 9 } }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    /* Id lạ ⇒ không có bảng hạt giống nào để rơi về ⇒ `undefined`, và
       `CUSTOM_ELEMENT_SKEL` lo phần còn lại ở chỗ dùng. */
    expect(seen?.elements[0]!.skel).toBeUndefined();
  });
});

describe("gieo hạt: đúng một lần, kể cả khi nhiều màn cùng mở", () => {
  it("kho rỗng ⇒ POST đủ bộ hạt giống, mỗi bản ghi một lần", async () => {
    const seed = seedPresets();
    const total = seed.styles.length + seed.elements.length + seed.mascots.length;
    get.mockResolvedValue(library([]));
    /* ĐIỀU KHOẢN #2: năm `usePresets` cùng lúc — đúng như app thật (composer,
       pill-ui, UiKitBlockView, canvas, màn preset). */
    mount(5);

    await waitFor(() => expect(addPreset).toHaveBeenCalledTimes(total));
    const keys = addPreset.mock.calls.map(([input]) => `${input.kind}:${String(input.data.key)}`);
    expect(new Set(keys).size).toBe(total);
    expect(keys).toContain("style:" + seed.styles[0]!.id);
    expect(keys).toContain("element:button");
    expect(keys).toContain("mascot:mascot-default");
  });

  it("tải lại trang giữa lúc gieo ⇒ lần gieo thứ hai KHÔNG đẻ thêm bản trùng", async () => {
    /* ══ ĐÂY LÀ CA TÁI HIỆN ĐÚNG CÁI ĐÃ LÀM BẨN `~/KitGen-dev` ══════════════
       Cờ `seedState` chỉ sống trong MỘT lần tải trang. Tải lại trang giữa lúc bộ
       POST đầu chưa về ⇒ lần tải mới có cờ tinh khôi VÀ một ảnh chụp query vẫn
       còn rỗng ⇒ nó gieo lần nữa. Kho thành 11 element với 3 bản trùng.

       Dựng lại chính xác cảnh đó ở đây: `__resetPresetsStoreForTest()` CHÍNH LÀ
       một lần tải lại trang (module state về mặc định), còn `mockImplementationOnce`
       dựng "ảnh chụp query đã cũ" — cửa đọc đầu tiên của lần tải thứ hai trả về
       kho RỖNG, trong khi kho thật đã có đủ 17 bản. */
    const server: Row[] = [];
    addPreset.mockImplementation(async (input: { kind: string; name: string; data: Record<string, unknown> }) => {
      const created = row(`preset_server_${String(input.data.key)}`, input.kind, input.name, input.data);
      server.push(created);
      return created;
    });

    get.mockImplementation(async () => library([...server]));
    mount();
    const seed = seedPresets();
    const total = seed.styles.length + seed.elements.length + seed.mascots.length;
    await waitFor(() => expect(server).toHaveLength(total));
    cleanup();

    /* ── LẦN TẢI TRANG THỨ HAI ─────────────────────────────────────────────── */
    __resetPresetsStoreForTest();
    addPreset.mockClear();
    /* Cửa đọc của query: ảnh chụp CŨ, rỗng. Mọi cửa đọc sau đó (gồm cửa mà
       `seedOnce` tự gọi ngay trước khi ghi) thấy kho THẬT. */
    get.mockImplementationOnce(async () => library([]));
    mount();

    /* Hạt giống đã có đủ trên server ⇒ KHÔNG một POST nào bay đi nữa. */
    await waitFor(() => expect(seen?.elements.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(addPreset).not.toHaveBeenCalled();
    expect(server).toHaveLength(total);
    /* Và điều thật sự cần khoá: mỗi khoá đúng MỘT bản trong kho. */
    const keys = server.map((entry) => `${entry.kind}:${String(entry.data.key)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gieo hụt để lại kho DỞ DANG ⇒ lần sau chỉ gieo phần CÒN THIẾU", async () => {
    /* Nhánh còn lại của cùng một vết: lần gieo đầu chết giữa chừng (agent tắt),
       để lại kho có style nhưng chưa có element/mascot. Lần gieo sau không được
       POST lại những khoá đã nằm sẵn — nếu không thì mỗi lần thử lại là một lớp
       style trùng chồng lên. */
    const seed = seedPresets();
    const already = seed.styles.map((preset) => row(`preset_s_${preset.id}`, "style", preset.vi, { key: preset.id, en: preset.en }));
    /* Query thấy rỗng (ảnh chụp cũ), kho thật đã có toàn bộ style. */
    get.mockImplementationOnce(async () => library([]));
    get.mockImplementation(async () => library([...already]));
    mount();

    await waitFor(() => expect(addPreset).toHaveBeenCalledTimes(seed.elements.length + seed.mascots.length));
    const kinds = new Set(addPreset.mock.calls.map(([input]) => input.kind));
    expect(kinds).toEqual(new Set(["element", "mascot"]));
  });

  it("gieo hụt (agent tắt) ⇒ màn vẫn có hạt giống trong RAM và nói ra lỗi", async () => {
    get.mockResolvedValue(library([]));
    addPreset.mockRejectedValue(new Error("Agent không phản hồi"));
    mount();

    await waitFor(() => expect(lastError).toBe("Agent không phản hồi"));
    expect(seen?.elements.map((element) => element.id)).toContain("button");
  });
});

describe("ghi: gộp, chỉ đụng cái đổi, và không im lặng khi hỏng", () => {
  const three = () => library([
    row("preset_s1", "style", "Cổ tích", { key: "fairy", en: "storybook" }),
    row("preset_e1", "element", "Khiên", { key: "shield", en: "shield", decor: 4, glazeId: "", sizeId: "" }),
    row("preset_m1", "mascot", "Sóc", { key: "squirrel", en: "a squirrel", refName: "" }),
  ]);

  it("sửa một dòng ⇒ đúng MỘT PATCH; hai dòng kia không bị đụng", async () => {
    get.mockResolvedValue(three());
    mount();
    await waitFor(() => expect(seen?.styles).toHaveLength(1));

    setPresets({ ...seen!, styles: [{ id: "fairy", vi: "Cổ tích mới", en: "storybook" }] });

    await waitFor(() => expect(patchPreset).toHaveBeenCalledTimes(1));
    expect(patchPreset).toHaveBeenCalledWith("preset_s1", {
      kind: "style", name: "Cổ tích mới", data: { key: "fairy", en: "storybook" },
    });
    /* ĐIỀU KHOẢN #3: hai dòng không đổi ⇒ không một request nào. */
    expect(addPreset).not.toHaveBeenCalled();
    expect(removePreset).not.toHaveBeenCalled();
  });

  it("gõ nhiều phím liên tiếp ⇒ GỘP thành một lần ghi, lấy giá trị cuối", async () => {
    get.mockResolvedValue(three());
    mount();
    await waitFor(() => expect(seen?.styles).toHaveLength(1));

    for (const text of ["C", "Cổ", "Cổ t", "Cổ tí", "Cổ tích 2"]) {
      setPresets({ ...seen!, styles: [{ id: "fairy", vi: text, en: "storybook" }] });
    }

    await waitFor(() => expect(patchPreset).toHaveBeenCalledTimes(1));
    expect(patchPreset.mock.calls[0]![1].name).toBe("Cổ tích 2");
  });

  it("thêm và xoá ⇒ POST cái mới, DELETE cái biến mất, không đụng cái còn lại", async () => {
    get.mockResolvedValue(three());
    mount();
    await waitFor(() => expect(seen?.elements).toHaveLength(1));

    setPresets({
      ...seen!,
      elements: [
        seen!.elements[0]!,
        { id: "slider", vi: "Thanh trượt", en: "slider", decor: 3, glazeId: "", sizeId: "" },
      ],
      mascots: [],
    });

    await waitFor(() => expect(removePreset).toHaveBeenCalledWith("preset_m1"));
    expect(addPreset).toHaveBeenCalledTimes(1);
    expect(addPreset.mock.calls[0]![0]).toEqual({
      kind: "element", name: "Thanh trượt", data: { key: "slider", en: "slider", decor: 3, glazeId: "", sizeId: "" },
    });
    expect(patchPreset).not.toHaveBeenCalled();
  });

  it("ghi hỏng ⇒ hiện lỗi VÀ giữ nguyên thứ người dùng vừa gõ", async () => {
    get.mockResolvedValue(three());
    mount();
    await waitFor(() => expect(seen?.styles).toHaveLength(1));

    patchPreset.mockRejectedValue(new Error("Workspace chỉ đọc"));
    setPresets({ ...seen!, styles: [{ id: "fairy", vi: "Đang gõ dở", en: "storybook" }] });

    /* ĐIỀU KHOẢN #4. Và bản trong RAM KHÔNG được quay về giá trị server —
       người dùng đang nhìn vào chính ký tự họ vừa gõ. */
    await waitFor(() => expect(lastError).toBe("Workspace chỉ đọc"));
    expect(seen?.styles[0]!.vi).toBe("Đang gõ dở");
  });
});
