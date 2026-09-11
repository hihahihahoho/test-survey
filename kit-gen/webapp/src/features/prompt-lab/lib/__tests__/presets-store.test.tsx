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
  usePresets, usePresetSyncError, setPresets, seedPresets, seedRowsOf, DECOR_DEFAULT,
  MANAGED_ORDER, managedRows, withManagedRows, setManagedRows, themeOutfitEN, nextRowId, getPresets,
  elementLabel, __resetPresetsStoreForTest,
} = await import("../presets-store");
const { pillOptions, phraseOf, labelOf } = await import("../pill-registry");
const { CATALOG_ORDER } = await import("../catalog-seeds");

type Row = { id: string; kind: string; name: string; data: Record<string, unknown> };

/**
 * Kho giả của workspace.
 *
 * ╔══ `catalogs` MẶC ĐỊNH CÓ MẶT, VÀ ĐÓ LÀ MỘT QUYẾT ĐỊNH ═══════════════════╗
 * ║ Từ 09/2026 kho còn giữ mười danh mục dòng-đơn (chủ đề · khung cảnh ·      ║
 * ║ dáng…). `needsSeed` coi một trục KHÔNG có dòng nào là "chưa gieo" và bắn   ║
 * ║ ngay một loạt POST — đúng hành vi cần có, nhưng nó sẽ nhấn chìm con số mà ║
 * ║ mọi ca đo phép GHI đang đếm ("sửa một dòng ⇒ đúng một PATCH"). Nên fixture║
 * ║ mặc định là một workspace ĐÃ GIEO XONG, còn ca nào muốn đo chính việc     ║
 * ║ gieo thì truyền `false`.                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const library = (presets: Row[], withCatalogs = true) => ({
  version: 4,
  brands: [],
  settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 },
  items: [],
  presets: withCatalogs ? [...presets, ...catalogRows()] : presets,
});

/** Bản ghi server giả — luôn có `data.key`, đúng như `payloadOf` ghi ra. */
const row = (id: string, kind: string, name: string, data: Record<string, unknown>): Row =>
  ({ id, kind, name, data });

/** Bản ghi server của mười danh mục dòng-đơn, dựng từ CHÍNH hạt giống. */
const catalogRows = (): Row[] =>
  CATALOG_ORDER.flatMap((kind) => seedRowsOf(kind).map((seedRow) => row(
    `preset_${kind}_${seedRow.id}`, kind, seedRow.vi,
    {
      key: seedRow.id, en: seedRow.en,
      ...(seedRow.hint ? { hint: seedRow.hint } : {}),
      ...(seedRow.en2 ? { en2: seedRow.en2 } : {}),
    },
  )));

/** Tổng số bản ghi của một bộ hạt giống đầy đủ — 3 kho cũ + 10 danh mục mới. */
const seedTotal = () => {
  const seed = seedPresets();
  return seed.styles.length + seed.elements.length + seed.mascots.length
    + CATALOG_ORDER.reduce((sum, kind) => sum + seed.catalogs[kind].length, 0);
};

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
    /* `decor: 6` là ĐỘ DÀY VIỀN trên thang 1..7 đã chết; cửa đọc dịch nó sang nấc
       LƯỢNG TRANG TRÍ («Nhiều»). Không dịch thì số 6 không tra ra mục nào trong
       thang mới ⇒ pill hiện placeholder và câu trang trí rụng khỏi prompt. */
    expect(seen?.elements[0]).toEqual({ id: "shield", vi: "Khiên", en: "shield", decor: "rich", glazeId: "ice", sizeId: "m" });
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
      /* Một chuỗi KHÔNG PHẢI SỐ đi qua nguyên vẹn từ 09/2026: nấc trang trí nay là
         danh mục người dùng sửa được, nên "không nằm trong bốn nấc gốc" KHÔNG còn
         đồng nghĩa với "rác". Rác thật thì vô hại — `phraseOf` trả rỗng như mọi
         giá trị lạ của mọi trục pill. Xem `decorLevelOf`. */
      row("preset_ffff", "element", "Sai kiểu decor", { key: "odd", en: "x", decor: "sáu" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.styles).toHaveLength(1));
    /* Thiếu `key` thì thà một id xấu (id server) còn hơn nuốt mất bản ghi. */
    expect(seen?.styles[0]!.id).toBe("preset_dddd");
    expect(seen?.elements).toHaveLength(1);
    expect(seen?.elements[0]!.decor).toBe("sáu");
    /* Còn THIẾU HẲN trục ấy thì mới rơi về mặc định. */
    expect(DECOR_DEFAULT).toBe("medium");
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

  /* ── TRỤC TRANG TRÍ: SỐ 1..7 ĐỜI TRƯỚC → BỐN NẤC CÓ TÊN ──────────────────
     Cùng một cái bẫy với `skel` ngay trên: hạt giống chỉ gieo vào kho RỖNG, nên
     mọi workspace đã mở app trước lượt này giữ tám bản ghi element mang `decor`
     là SỐ. Số ấy không tra ra mục nào trong thang mới ⇒ `phraseOf` trả rỗng ⇒
     dòng element mất hẳn câu trang trí, im lặng. */
  it("`decor` SỐ đời trước ⇒ dịch sang nấc có tên, theo đúng bảng 1/2-3/4-5/6-7", async () => {
    get.mockResolvedValue(library([
      row("preset_d1", "element", "Một", { key: "e1", en: "e1", decor: 1, glazeId: "", sizeId: "" }),
      row("preset_d3", "element", "Ba", { key: "e3", en: "e3", decor: 3, glazeId: "", sizeId: "" }),
      row("preset_d5", "element", "Năm", { key: "e5", en: "e5", decor: 5, glazeId: "", sizeId: "" }),
      row("preset_d7", "element", "Bảy", { key: "e7", en: "e7", decor: 7, glazeId: "", sizeId: "" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(4));
    expect(seen!.elements.map((element) => element.decor)).toEqual(["none", "light", "medium", "rich"]);
    /* VÀ KHÔNG MỘT REQUEST GHI NÀO chỉ vì mở app: `toBundle` đổi bản sao trong
       RAM, còn `flush` chỉ chạy sau một `setPresets` — tức là sau khi có người
       thật sự sửa danh mục. Vá lúc đọc mà kéo theo một lượt PATCH cả kho là
       đúng thứ chú thích của `payloadOf` cấm. */
    expect(patchPreset).not.toHaveBeenCalled();
    expect(addPreset).not.toHaveBeenCalled();
    expect(removePreset).not.toHaveBeenCalled();
  });
});

describe("gieo hạt: đúng một lần, kể cả khi nhiều màn cùng mở", () => {
  it("kho rỗng ⇒ POST đủ bộ hạt giống, mỗi bản ghi một lần", async () => {
    const seed = seedPresets();
    const total = seedTotal();
    get.mockResolvedValue(library([], false));
    /* ĐIỀU KHOẢN #2: năm `usePresets` cùng lúc — đúng như app thật (composer,
       pill-ui, UiKitBlockView, canvas, màn preset). */
    mount(5);

    await waitFor(() => expect(addPreset).toHaveBeenCalledTimes(total));
    const keys = addPreset.mock.calls.map(([input]) => `${input.kind}:${String(input.data.key)}`);
    expect(new Set(keys).size).toBe(total);
    expect(keys).toContain("style:" + seed.styles[0]!.id);
    expect(keys).toContain("element:button");
    expect(keys).toContain("mascot:mascot-default");
    /* Mười danh mục mới cũng phải được gieo — nếu không thì mọi menu pill rỗng. */
    expect(keys).toContain("scene:main-menu");
    expect(keys).toContain(`pose:${seed.catalogs.pose[0]!.id}`);
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

    get.mockImplementation(async () => library([...server], false));
    mount();
    const total = seedTotal();
    await waitFor(() => expect(server).toHaveLength(total));
    cleanup();

    /* ── LẦN TẢI TRANG THỨ HAI ─────────────────────────────────────────────── */
    __resetPresetsStoreForTest();
    addPreset.mockClear();
    /* Cửa đọc của query: ảnh chụp CŨ, rỗng. Mọi cửa đọc sau đó (gồm cửa mà
       `seedOnce` tự gọi ngay trước khi ghi) thấy kho THẬT. */
    get.mockImplementationOnce(async () => library([], false));
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
    const already = [
      ...seed.styles.map((preset) => row(`preset_s_${preset.id}`, "style", preset.vi, { key: preset.id, en: preset.en })),
      ...catalogRows(),
    ];
    /* Query thấy rỗng (ảnh chụp cũ), kho thật đã có toàn bộ style + mười danh mục. */
    get.mockImplementationOnce(async () => library([], false));
    get.mockImplementation(async () => library(already, false));
    mount();

    await waitFor(() => expect(addPreset).toHaveBeenCalledTimes(seed.elements.length + seed.mascots.length));
    const kinds = new Set(addPreset.mock.calls.map(([input]) => input.kind));
    expect(kinds).toEqual(new Set(["element", "mascot"]));
  });

  it("gieo hụt (agent tắt) ⇒ màn vẫn có hạt giống trong RAM và nói ra lỗi", async () => {
    get.mockResolvedValue(library([], false));
    addPreset.mockRejectedValue(new Error("Agent không phản hồi"));
    mount();

    await waitFor(() => expect(lastError).toBe("Agent không phản hồi"));
    expect(seen?.elements.map((element) => element.id)).toContain("button");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   BỘ MÓN — nhãn bộ trên đĩa, và cửa gieo bù cho máy đời trước
   ══════════════════════════════════════════════════════════════════════════
   Nhãn bộ (`data.set`) là khoá MỚI. Ba câu hỏi ở đây, và cả ba đều hỏng câm nếu
   sai: bản ghi có nhãn đọc ra đúng bộ không · bản ghi ĐỜI CŨ có được vá không ·
   người dùng gỡ một món khỏi bộ thì lượt đọc sau có kéo nó về không. */
describe("bộ món: đọc, vá, và gỡ", () => {
  it("`data.set` trên đĩa ⇒ món thuộc bộ, đọc nguyên cả id lẫn nhãn", async () => {
    get.mockResolvedValue(library([
      row("preset_p1", "element", "Khiên", {
        key: "shield", en: "shield", decor: "light", glazeId: "", sizeId: "",
        set: { id: "phong-thu", vi: "Phòng thủ" },
      }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen?.elements[0]!.set).toEqual({ id: "phong-thu", vi: "Phòng thủ" });
  });

  it("thiếu `set` + id hạt giống CÓ BỘ ⇒ vá theo bảng hạt giống", async () => {
    /* Đây là máy đã dùng app từ trước lượt «bộ»: bản ghi «Thanh máu» của họ không
       có khoá `set` nào, và phần đầy vừa được gieo vào. Không vá thì hai món ấy
       đứng rời nhau thành hai dòng bộ một phần, ngay trên máy của người đã dùng
       app lâu nhất — chọn cái này thì không có cái kia. */
    get.mockResolvedValue(library([
      row("preset_h1", "element", "Thanh máu", { key: "healthbar", en: "health bar", decor: "light", glazeId: "", sizeId: "" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen?.elements[0]!.set?.id).toBe("hp");
  });

  it("`set: null` trên đĩa ⇒ ĐÃ GỠ, và lượt đọc sau KHÔNG kéo về bộ cũ", async () => {
    get.mockResolvedValue(library([
      row("preset_h1", "element", "Thanh máu", { key: "healthbar", en: "health bar", decor: "light", glazeId: "", sizeId: "", set: null }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen?.elements[0]!.set).toBeUndefined();
  });

  it("gỡ một món hạt giống khỏi bộ ⇒ GHI RA `set: null`, không phải vắng khoá", async () => {
    get.mockResolvedValue(library([
      row("preset_h1", "element", "Thanh máu", { key: "healthbar", en: "health bar", decor: "light", glazeId: "", sizeId: "", set: { id: "hp", vi: "Thanh máu" } }),
    ]));
    mount();
    await waitFor(() => expect(seen?.elements).toHaveLength(1));

    const { set: _dropped, ...loose } = seen!.elements[0]!;
    setPresets({ ...seen!, elements: [loose] });

    await waitFor(() => expect(patchPreset).toHaveBeenCalledTimes(1));
    expect(patchPreset.mock.calls[0]![1].data.set).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   DI TRÚ NHÃN — hạt giống tiếng Việt đời trước → thuật ngữ tiếng Anh đời nay
   ══════════════════════════════════════════════════════════════════════════
   Máy nào đã mở app trước 11/09/2026 giữ nguyên `name` tiếng Việt của bốn mươi
   tám bản ghi element, và `seedOnce` cố ý không ghi đè chúng. Chủ sản phẩm nhìn
   thấy hậu quả ngay: nhãn bộ ghép với tên phần cũ ra «Thanh máu · Thanh máu ·
   phần đầy» — một chuỗi đọc hai lần.
   Hai ca dưới đây là HAI VẾ của cùng một luật, và vế thứ hai mới là vế khó:
   di trú phải CÓ ĐIỀU KIỆN, nếu không nó là một lượt ghi đè xoá công sửa tay. */
describe("di trú nhãn: chỉ đổi khi người dùng CHƯA sửa", () => {
  /** Bản ghi đúng như máy đã seed trước 11/09 giữ nó — nhãn cũ ở CẢ phần lẫn bộ. */
  const legacyFill = (name = "Thanh máu · phần đầy", setVi = "Thanh máu") =>
    row("preset_h2", "element", name, {
      key: "hp-fill", en: "the fill bar", decor: "none", glazeId: "auto", sizeId: "",
      set: { id: "hp", vi: setVi },
    });

  it("nhãn phần VÀ nhãn bộ còn đúng nguyên văn hạt giống cũ ⇒ đổi cả hai", async () => {
    get.mockResolvedValue(library([legacyFill()]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    const element = seen!.elements[0]!;
    expect(element.vi).toBe("fill");
    expect(element.set).toEqual({ id: "hp", vi: "Health bar" });
    /* Chỗ vỡ mà chủ sản phẩm chụp lại: nhãn một dòng không còn lặp tên bộ. */
    expect(elementLabel(element, "?")).toBe("Health bar · fill");
  });

  it("`en` và id KHÔNG đổi một chữ nào ⇒ không câu prompt nào phải đo lại", async () => {
    get.mockResolvedValue(library([legacyFill()]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen!.elements[0]!.id).toBe("hp-fill");
    expect(seen!.elements[0]!.en).toBe("the fill bar");
  });

  it("người dùng đã tự đặt tên ⇒ GIỮ NGUYÊN, cả tên phần lẫn tên bộ", async () => {
    /* Không khớp nguyên văn ⇒ không đụng. Đây là thứ phân biệt một phép di trú
       với một lượt ghi đè: bảng chỉ nhận đúng những chuỗi do CHÍNH ta ghi ra. */
    get.mockResolvedValue(library([legacyFill("Máu nhân vật", "Thanh máu của tôi")]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen!.elements[0]!.vi).toBe("Máu nhân vật");
    expect(seen!.elements[0]!.set?.vi).toBe("Thanh máu của tôi");
  });

  it("sửa MỘT trong hai ⇒ chỉ cái còn nguyên văn được đổi", async () => {
    get.mockResolvedValue(library([legacyFill("Máu nhân vật")]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen!.elements[0]!.vi).toBe("Máu nhân vật");
    expect(seen!.elements[0]!.set?.vi).toBe("Health bar");
  });

  it("bản ghi ĐỜI NAY đi qua phép vá không suy suyển", async () => {
    get.mockResolvedValue(library([legacyFill("fill", "Health bar")]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    expect(seen!.elements[0]!.vi).toBe("fill");
    expect(seen!.elements[0]!.set?.vi).toBe("Health bar");
  });

  it("vá LÚC ĐỌC ⇒ mở app KHÔNG sinh một lượt ghi nào", async () => {
    /* Cùng kỷ luật với bốn bảng di trú đã có: nhãn mới có mặt ngay trên màn, còn
       xuống đĩa thì đợi lượt `flush` đầu tiên do người dùng thật sự sửa gì đó.
       Ghi ngược lúc mở app là bốn mươi tám PATCH mà không ai bấm. */
    get.mockResolvedValue(library([legacyFill()]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(patchPreset).not.toHaveBeenCalled();
    expect(addPreset).not.toHaveBeenCalled();
  });
});

describe("gieo bù: máy đã có hạt giống ĐỜI TRƯỚC nhưng chưa có bộ", () => {
  /** Tám món hạt giống đời trước, đúng hình dạng bản ghi mà chúng nằm trên đĩa. */
  const legacyElementRows = (): Row[] =>
    ["button", "popover", "healthbar", "coin", "avatar-frame", "panel", "badge", "progress"].map((key) =>
      row(`preset_element_${key}`, "element", key, { key, en: key, decor: "light", glazeId: "auto", sizeId: "" }));

  it("gieo ĐÚNG những id đời này mới có, KHÔNG đụng tám món cũ", async () => {
    get.mockResolvedValue(library(legacyElementRows()));
    mount();

    await waitFor(() => expect(addPreset).toHaveBeenCalled());
    await waitFor(() => expect(addPreset.mock.calls.length).toBeGreaterThan(30));
    const keys = addPreset.mock.calls.map((call) => String(call[0].data.key));
    expect(keys).toContain("hp-fill");
    expect(keys).toContain("rank-row-self");
    /* Món cũ đã có trên đĩa ⇒ không POST lại. Ghi đè ở đây là xoá công sửa của họ. */
    expect(keys).not.toContain("button");
    expect(keys).not.toContain("panel");
    /* Và KHÔNG trục nào khác bị đụng: một dòng «Trang trí» người dùng đã xoá từ lâu
       không được mọc lại chỉ vì hôm nay ta thêm mấy cái bộ. */
    expect(addPreset.mock.calls.every((call) => call[0].kind === "element")).toBe(true);
  });

  it("đã có dù MỘT id đời này ⇒ im lặng: mọi chỗ trống còn lại là ý người dùng", async () => {
    get.mockResolvedValue(library([
      ...legacyElementRows(),
      row("preset_element_hp-fill", "element", "Thanh máu · phần đầy", { key: "hp-fill", en: "x", decor: "none", glazeId: "auto", sizeId: "" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(addPreset).not.toHaveBeenCalled();
  });

  it("kho toàn món TỰ ĐẶT TÊN ⇒ không nhét bốn mươi dòng vào danh mục người ta tự dựng", async () => {
    get.mockResolvedValue(library([
      row("preset_x1", "element", "Khiên", { key: "tu-dat-khien", en: "shield", decor: "light", glazeId: "auto", sizeId: "" }),
    ]));
    mount();

    await waitFor(() => expect(seen?.elements).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(addPreset).not.toHaveBeenCalled();
  });
});

describe("ghi: gộp, chỉ đụng cái đổi, và không im lặng khi hỏng", () => {
  const three = () => library([
    row("preset_s1", "style", "Cổ tích", { key: "fairy", en: "storybook" }),
    /* `decor` ở đây là ID CHỮ (hình dạng đời nay), cố ý: nhóm ca này đo phép GỘP
       ghi — "sửa một dòng thì hai dòng kia không bị đụng". Một bản ghi đời cũ mang
       số sẽ được cửa đọc dịch sang id, và lượt ghi kế tiếp đóng đinh id ấy xuống
       đĩa — MỘT lượt PATCH di trú đúng nghĩa, nhưng nó là câu chuyện khác và có ca
       riêng ngay dưới. Trộn hai chuyện vào một ca thì ca này không còn đo được gì. */
    row("preset_e1", "element", "Khiên", { key: "shield", en: "shield", decor: "medium", glazeId: "", sizeId: "" }),
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
        { id: "slider", vi: "Thanh trượt", en: "slider", decor: "light", glazeId: "", sizeId: "" },
      ],
      mascots: [],
    });

    await waitFor(() => expect(removePreset).toHaveBeenCalledWith("preset_m1"));
    expect(addPreset).toHaveBeenCalledTimes(1);
    expect(addPreset.mock.calls[0]![0]).toEqual({
      kind: "element", name: "Thanh trượt", data: { key: "slider", en: "slider", decor: "light", glazeId: "", sizeId: "" },
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


/* ══════════════════════════════════════════════════════════════════════════
   MƯỜI DANH MỤC DÒNG-ĐƠN — thứ mà lượt 09/2026 mang vào kho
   ══════════════════════════════════════════════════════════════════════════

   ╔══ VÌ SAO CHÚNG PHẢI CÓ CA RIÊNG ═══════════════════════════════════════╗
   ║ Ba kho cũ (style · element · mascot) hỏng thì màn quản lý hiện sai — dễ ║
   ║ thấy. Mười danh mục này hỏng thì MENU PILL rỗng, và một menu rỗng trông ║
   ║ y hệt "danh mục này vốn chẳng có gì": không có gì báo, và câu prompt     ║
   ║ lặng lẽ mất một mệnh đề.                                                ║
   ╚═════════════════════════════════════════════════════════════════════════╝ */
describe("danh mục dòng-đơn: hạt giống · đọc · ghi", () => {
  it("hạt giống có ĐỦ mười hai danh mục, không danh mục nào rỗng", () => {
    const seed = seedPresets();
    for (const kind of MANAGED_ORDER) {
      expect(managedRows(seed, kind).length, `danh mục ${kind} rỗng`).toBeGreaterThan(0);
    }
  });

  it("`pillOptions` đọc kho cho MỌI trục — không còn bảng cứng nào", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.scene.length).toBeGreaterThan(0));

    /* Đổi nhãn ở kho ⇒ menu pill đổi theo. Đây là điều khoản mà cả màn «Thư viện
       prompt» dựa lên: trước lượt này `pillOptions("scene")` đọc một hằng số. */
    for (const kind of ["theme", "scene", "layout", "glaze", "decor", "decorPlace", "pose", "view", "expression", "outfit"] as const) {
      const rows = managedRows(seen!, kind);
      setPresets(withManagedRows(seen!, kind, rows.map((row, at) => (at === 0 ? { ...row, vi: `Đổi ${kind}` } : row))));
      expect(pillOptions(kind, getSeen())[0]!.vi).toBe(`Đổi ${kind}`);
    }
  });

  it("đổi thứ tự dòng ⇒ menu pill đổi thứ tự theo", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.scene.length).toBeGreaterThan(0));

    const rows = managedRows(seen!, "scene");
    setManagedRows("scene", [rows[2]!, rows[0]!, rows[1]!, ...rows.slice(3)]);
    expect(pillOptions("scene", getSeen()).map((option) => option.value).slice(0, 3))
      .toEqual([rows[2]!.id, rows[0]!.id, rows[1]!.id]);
  });

  it("dòng ẩn: rời MENU nhưng câu cũ vẫn tra ra nhãn và cụm tiếng Anh", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.scene.length).toBeGreaterThan(0));

    const rows = managedRows(seen!, "scene");
    const target = rows[1]!;
    setManagedRows("scene", rows.map((row) => (row.id === target.id ? { ...row, hidden: true } : row)));

    expect(pillOptions("scene", getSeen()).some((option) => option.value === target.id)).toBe(false);
    /* ĐIỀU KHOẢN QUAN TRỌNG NHẤT của cờ `hidden`: ẩn KHÔNG ĐƯỢC giống xoá. */
    expect(labelOf("scene", target.id, getSeen())).toBe(target.vi);
    expect(phraseOf("scene", target.id, getSeen())).toBe(target.en);
  });

  it("dòng bị XOÁ thật: pill hiện chữ trần và rụng khỏi prompt — hành vi đã có, ghi lại thành luật", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.scene.length).toBeGreaterThan(0));

    const rows = managedRows(seen!, "scene");
    setManagedRows("scene", rows.filter((row) => row.id !== "shop"));
    expect(labelOf("scene", "shop", getSeen())).toBe("shop");
    expect(phraseOf("scene", "shop", getSeen())).toBe("");
  });

  it("cụm trang phục của một chủ đề nằm TRONG dòng chủ đề, không tra chéo bằng id", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.theme.length).toBeGreaterThan(0));

    /* Chủ đề hạt giống: `en2` có sẵn. */
    const tet = seen!.catalogs.theme[0]!;
    expect(themeOutfitEN(tet.id, seen!)).toBe(tet.en2);

    /* Chủ đề NGƯỜI DÙNG VỪA THÊM: id là một slug, và tra chéo sang danh mục trang
       phục sẽ đẩy chính cái slug vào prompt («wearing chu-de-...»). */
    const id = nextRowId("theme", "Chủ đề mới", seen!.catalogs.theme.map((row) => row.id));
    setManagedRows("theme", [...managedRows(seen!, "theme"), { id, vi: "Chủ đề mới", en: "a new theme", en2: "a new outfit" }]);
    expect(themeOutfitEN(id, getSeen())).toBe("a new outfit");
    expect(themeOutfitEN(id, getSeen())).not.toContain(id);
  });

  it("ghi một danh mục ⇒ PATCH ĐÚNG bản ghi ấy, đúng `kind`, không đụng danh mục khác", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.scene.length).toBeGreaterThan(0));
    patchPreset.mockClear();

    const rows = managedRows(seen!, "scene");
    setManagedRows("scene", rows.map((row, at) => (at === 0 ? { ...row, en: "a brand new phrase" } : row)));

    await waitFor(() => expect(patchPreset).toHaveBeenCalledTimes(1));
    const [id, payload] = patchPreset.mock.calls[0]!;
    expect(id).toBe(`preset_scene_${rows[0]!.id}`);
    expect(payload.kind).toBe("scene");
    expect(payload.data).toEqual({ key: rows[0]!.id, en: "a brand new phrase" });
  });

  it("mở app KHÔNG sinh một lượt ghi nào, dù kho đã có đủ mười hai danh mục", async () => {
    get.mockResolvedValue(library([]));
    mount();
    await waitFor(() => expect(seen?.catalogs.pose.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(patchPreset).not.toHaveBeenCalled();
    expect(removePreset).not.toHaveBeenCalled();
    expect(addPreset).not.toHaveBeenCalled();
  });

  it("workspace ĐỜI TRƯỚC (chỉ có style/element/mascot) ⇒ mười danh mục rơi về hạt giống, và được gieo", async () => {
    /* Đây là cửa di trú thật: mọi máy đã mở app trước lượt này rơi vào đúng ca này.
       Không có nhánh rơi-về-hạt-giống thì MỌI menu pill rỗng cho tới khi gieo xong. */
    get.mockResolvedValue(library([
      row("preset_s1", "style", "Cổ tích", { key: "fairy", en: "storybook" }),
    ], false));
    mount();

    await waitFor(() => expect(seen?.catalogs.scene.length).toBeGreaterThan(0));
    expect(pillOptions("scene", getSeen()).length).toBeGreaterThan(0);
    /* Và kho được bổ sung phần còn thiếu — không thì danh mục chỉ sống trong RAM. */
    await waitFor(() => expect(addPreset.mock.calls.some(([input]) => input.kind === "scene")).toBe(true));
  });
});

/**
 * BẢN TRONG RAM, không phải bản render gần nhất.
 *
 * `seen` chỉ đổi khi React vẽ lại, mà một `setPresets` gọi ngoài `act()` thì chưa
 * kịp kéo theo lượt vẽ nào. Mọi phép tra ở nhóm ca này hỏi về KHO, nên nó phải hỏi
 * đúng kho — dùng `seen` ở đây là đo một ảnh chụp cũ và tin rằng nó là hiện tại.
 */
function getSeen() {
  return getPresets();
}
