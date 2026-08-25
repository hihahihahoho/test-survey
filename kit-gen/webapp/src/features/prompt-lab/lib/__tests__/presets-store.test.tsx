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
  poseTemplates: [],
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
      row("preset_bbbb", "element", "Nút bấm", { key: "button", en: "a button", decor: 6, materialId: "gold-metal" }),
      row("preset_cccc", "mascot", "Sóc", { key: "squirrel", en: "a squirrel", refName: "soc.png" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.styles).toHaveLength(1));
    /* ĐIỀU KHOẢN #1: id là `data.key`, KHÔNG phải `preset_aaaa`. */
    expect(seen?.styles[0]).toEqual({ id: "fairy", vi: "Cổ tích", en: "storybook" });
    expect(seen?.elements[0]).toEqual({ id: "button", vi: "Nút bấm", en: "a button", decor: 6, materialId: "gold-metal" });
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
    row("preset_e1", "element", "Nút bấm", { key: "button", en: "a button", decor: 4, materialId: "" }),
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
        { id: "slider", vi: "Thanh trượt", en: "a slider", decor: 3, materialId: "" },
      ],
      mascots: [],
    });

    await waitFor(() => expect(removePreset).toHaveBeenCalledWith("preset_m1"));
    expect(addPreset).toHaveBeenCalledTimes(1);
    expect(addPreset.mock.calls[0]![0]).toEqual({
      kind: "element", name: "Thanh trượt", data: { key: "slider", en: "a slider", decor: 3, materialId: "" },
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
