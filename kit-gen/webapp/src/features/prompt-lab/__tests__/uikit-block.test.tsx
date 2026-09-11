/* @vitest-environment jsdom */
/**
 * BLOCK «BỘ UI» — BA VIỆC CHỦ SẢN PHẨM CHỈ TẬN TAY, VÀ CẢ BA ĐỀU CÓ THỂ HỎNG CÂM.
 *
 *  ① THỨ TỰ DÒNG LÀ DỮ LIỆU. Kéo dòng #2 lên trên #1 phải đổi thứ tự ô trong
 *    `components[]` của contract — nếu không thì phép kéo thả chỉ là một hiệu ứng
 *    đẹp mắt, người dùng sắp xong xuôi rồi bấm Vẽ và nhận về đúng bố cục cũ.
 *  ② BỘ CHỌN PHẢI THÊM ĐÚNG MÓN. Dãy chip cũ ghi tên ngay trên nút nên bấm nhầm
 *    thì thấy ngay; bộ chọn có ô tìm kiếm thì cái được thêm là kết quả của một
 *    phép lọc — sai một bước lọc là thêm nhầm món mà không ai đối chiếu được.
 *  ③ CHẾ ĐỘ TỰ DO PHẢI ĐI TỚI CONTRACT. Người dùng gõ một câu riêng cho một
 *    element; nếu câu ấy không vào `components[].spec` thì họ gõ vào hư không —
 *    màn hình vẫn hiện chữ họ viết, còn máy vẽ không bao giờ thấy nó. Đây là
 *    kiểu hỏng tệ nhất của cả ba: nó trông như đang chạy.
 *
 * Ca ②③ mount DOM thật vì chúng nói về hai thứ chỉ tồn tại trong DOM: một hộp
 * popover có ô tìm kiếm, và một instance TipTap. Ca ① thì thuần — thứ nó khoá là
 * phép dịch sang contract, không phải cú kéo chuột.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/react";

import { composerToContract } from "@/features/prompt-canvas/lib/composer-to-contract";
import {
  CUSTOM_ELEMENT_SKEL,
  REFERENCE_CELL_PX,
  MAX_SIZE_PX,
  MIN_SIZE_PX,
  SIZE_PRESETS,
  defaultSizeOf,
  defaultSizePx,
  stepSizePx,
  sizePx,
  skelSizePx,
} from "../lib/cell-size";
import { elementSets, getPresets, seedPresets, type ElementPreset } from "../lib/presets-store";
import { PILL_SLOTS, docHasBrokenPill, repairPills, retitleCellDoc, uiCellDoc } from "../lib/doc-templates";
import { serializeComposer } from "../lib/serialize-composer";
import {
  moveRow,
  newCell,
  type ComposerState,
  type UiCell,
  type UiKitBlock,
} from "../lib/composer-model";
import { UiKitBlockBody } from "../components/UiKitBlockView";

const PRESETS = seedPresets();

/* Kho preset thật đi qua TanStack Query + agent. Ca ở đây nói về block, không về
   đường tải danh mục, nên `usePresets` trả thẳng hạt giống — cùng bộ dữ liệu mà
   phần thuần của file này dùng, để hai nửa không đối chiếu với hai danh mục. */
vi.mock("../lib/presets-store", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const seed = (real["seedPresets"] as () => unknown)();
  return { ...real, usePresets: () => seed, getPresets: () => seed };
});

const state = (blocks: UiKitBlock[]): ComposerState => ({
  themeValue: "a Vietnamese Tết festive outfit",
  styleId: PRESETS.styles[0]!.id,
  brandColors: [],
  themeCustom: "",
  styleCustom: "",
  brandId: "",
  contextRefs: [],
  brandAssets: {},
  contextMode: "template",
  blocks,
});

const uikit = (cells: UiCell[], mode: UiKitBlock["mode"] = "template"): UiKitBlock => ({
  id: "u1",
  kind: "uikit",
  mode,
  cells,
});

/** Tên tiếng Việt của từng ô trong tấm UI đầu tiên, THEO THỨ TỰ vẽ. */
function cellNames(cells: UiCell[], mode: UiKitBlock["mode"] = "template"): string[] {
  const contract = composerToContract(state([uikit(cells, mode)]), { presets: PRESETS });
  return (contract.sheets[0]?.components ?? []).map((component) => component.vi).filter(Boolean);
}

afterEach(cleanup);

describe("① thứ tự dòng = thứ tự ô trong contract", () => {
  const cells = () => [
    { ...newCell("button", PRESETS), id: "c1" },
    { ...newCell("coin", PRESETS), id: "c2" },
    { ...newCell("panel", PRESETS), id: "c3" },
  ];

  it("`moveRow` đưa dòng cuối lên đầu, giữ nguyên phần còn lại", () => {
    const moved = moveRow(cells(), 2, 0);
    expect(moved.map((c) => c.elementId)).toEqual(["panel", "button", "coin"]);
  });

  it("chỉ số ngoài khoảng KHÔNG cắt xén mảng — `splice` âm sẽ ném dòng sang đầu kia", () => {
    const base = cells();
    for (const [from, to] of [[-1, 0], [0, 9], [3, 1], [0, -2]] as const) {
      expect(moveRow(base, from, to).map((c) => c.elementId)).toEqual(["button", "coin", "panel"]);
    }
  });

  it("đổi thứ tự dòng ⇒ ĐỔI thứ tự `components[]`, không chỉ đổi trên màn", () => {
    /* Chữ ở đây là NHÃN ĐẦY ĐỦ («tên bộ · tên phần», xem `elementLabel`), không
       phải `element.vi` trần — một ô tên «primary» đứng một mình trong bảng kết
       quả thì không ai đọc ra nó là nút của bộ nào. */
    const before = cellNames(cells());
    expect(before).toEqual(["Button · primary", "Coin counter · coin", "Panel"]);

    const after = cellNames(moveRow(cells(), 2, 0));
    expect(after).toEqual(["Panel", "Button · primary", "Coin counter · coin"]);
  });

  it("tên tệp của ô bám VỊ TRÍ, không bám element — số thứ tự phải chạy lại sau khi kéo", () => {
    const contract = composerToContract(state([uikit(moveRow(cells(), 2, 0))]), { presets: PRESETS });
    const files = (contract.sheets[0]?.components ?? []).map((component) => component.file);
    expect(files.slice(0, 3)).toEqual(["01-panel", "02-button", "03-coin"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Vỏ điều khiển được — block là state, đúng như màn thật giữ nó
   ══════════════════════════════════════════════════════════════════════════ */

function Harness({ initial, onState }: { initial: UiKitBlock; onState?: (next: UiKitBlock) => void }) {
  const [block, setBlock] = React.useState(initial);
  return (
    <UiKitBlockBody
      block={block}
      onChange={(updater) =>
        setBlock((prev) => {
          const next = updater(prev);
          onState?.(next);
          return next;
        })
      }
    />
  );
}

describe("② nút «+ Element» + bộ chọn", () => {
  beforeEach(() => {
    render(<Harness initial={uikit([])} />);
  });

  it("dãy chip cũ đã BIẾN MẤT — chỉ còn một nút mở bộ chọn", () => {
    /* Bản trước dựng MỘT nút cho MỖI element trong danh mục. Ca này canh đúng
       cái đã bỏ: không còn nút riêng nào mang tên element. */
    expect(screen.queryByRole("button", { name: "Button · primary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Coin counter · coin" })).toBeNull();
    expect(screen.getByRole("button", { name: /Element/ })).toBeTruthy();
  });

  it("bấm ra hộp tra danh mục, gõ để lọc, chọn thì thêm ĐÚNG món", () => {
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    const box = screen.getByRole("dialog", { name: /Thêm món/ });
    expect(box).toBeTruthy();

    /* «Panel» không đeo nhãn bộ, nên dòng của nó là một BỘ MỘT PHẦN và bấm ra
       đúng một ô — ca này đo đường ấy, còn bộ nhiều phần có ca riêng ở
       `element-sets.test.tsx`. */
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "panel" } });
    expect(screen.queryByRole("option", { name: /^Button/ })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /^Panel/ }));

    /* Dòng vừa thêm phải hiện ra ngay, mang đúng tên món đã chọn. */
    expect(screen.getByLabelText("Ghi chú cho Panel")).toBeTruthy();
    expect(screen.queryByLabelText("Ghi chú cho Button · primary")).toBeNull();
  });

  /* HỘP KHÔNG TỰ ĐÓNG SAU MỖI LẦN CHỌN — và đó là một quyết định, không phải một
     chỗ quên. Dựng một bộ kit là thêm dăm bảy món liền tay; đóng hộp sau mỗi món
     là bắt người dùng mở lại và gõ lại chuỗi tìm kiếm mỗi lần. Đóng bằng Escape,
     bấm ra ngoài, hoặc bấm lại chính cái nút. */
  it("thêm hai món liền tay ⇒ hai dòng, thứ tự đúng thứ tự bấm", () => {
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    /* HAI BỘ MỘT PHẦN: mỗi cú bấm đúng một dòng. Bấm một bộ nhiều phần thì một cú
       ra nhiều dòng — đó là chuyện khác và có ca riêng, trộn vào đây thì ca này hết
       đo được "thứ tự dòng đúng thứ tự bấm". */
    for (const name of [/^Panel/, /^Badge/]) {
      fireEvent.click(screen.getAllByRole("option", { name })[0]!);
    }
    const handles = screen.getAllByRole("button", { name: /^Đổi chỗ/ });
    expect(handles).toHaveLength(2);
    expect(handles[0]!.getAttribute("aria-label")).toContain("Panel");
    expect(handles[1]!.getAttribute("aria-label")).toContain("Badge");
  });

  it("gõ chuỗi không khớp gì ⇒ NÓI RA, không im lặng trả về hộp trống", () => {
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "khong-co-mon-nao" } });
    expect(screen.getByText(/Không có món nào khớp/)).toBeTruthy();
  });
});

describe("② tay nắm kéo — bàn phím phải làm được đúng việc của chuột", () => {
  it("mũi tên lên trên tay nắm đổi chỗ dòng THẬT, không chỉ di focus", () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([
          { ...newCell("button", PRESETS), id: "c1" },
          { ...newCell("coin", PRESETS), id: "c2" },
        ])}
        onState={(next) => {
          latest = next;
        }}
      />,
    );

    const handles = screen.getAllByRole("button", { name: /^Đổi chỗ/ });
    fireEvent.keyDown(handles[1]!, { key: "ArrowUp" });

    expect(latest).not.toBeNull();
    expect(latest!.cells.map((c) => c.elementId)).toEqual(["coin", "button"]);
  });
});

describe("③ hai chế độ — dòng element ở «Tự do» là một TipTap thật", () => {
  it("chế độ mặc định là template: có công tắc, KHÔNG có ô soạn nào", () => {
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])} />);
    expect(screen.getByRole("button", { name: "Theo template" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tự do" })).toBeTruthy();
    /* Template = React thuần. Một ProseMirror mọc ra ở đây nghĩa là 16 editor cho
       một bộ kit 16 món — đúng cái giá mà chế độ template tồn tại để không trả. */
    expect(document.querySelector(".ProseMirror")).toBeNull();
    expect(screen.getByLabelText("Ghi chú cho Button · primary")).toBeTruthy();
  });

  it("gạt sang «Tự do» ⇒ mỗi dòng mount một ô soạn, và ô ghi chú lùi đi", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([
          { ...newCell("button", PRESETS), id: "c1" },
          { ...newCell("coin", PRESETS), id: "c2" },
        ])}
        onState={(next) => {
          latest = next;
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tự do" }));

    /* `immediatelyRender: false` ⇒ editor dựng ở effect sau nhịp render đầu. */
    await waitFor(() => expect(document.querySelectorAll(".ProseMirror")).toHaveLength(2));
    expect(screen.queryByLabelText("Ghi chú cho Button · primary")).toBeNull();

    /* Câu khởi điểm được dựng cho MỌI dòng ngay lúc gạt — không đợi ai gõ. */
    expect(latest!.cells.every((cell) => cell.doc)).toBe(true);
  });

  /**
   * PILL TRONG DOM PHẢI TỰ MÔ TẢ ĐƯỢC — xem khối chú thích ở `OptionPill.tsx`.
   *
   * Ca này khoá một vụ MẤT DỮ LIỆU bắt được tận tay: node view vẽ ra một `<span>`
   * trần, nên mọi đường dựng lại tài liệu TỪ DOM đọc ra pill không kind không
   * value, và tài liệu đã lưu của dự án biến thành `{kind: null, value: null}`.
   */
  it("mỗi pill mang `data-kind`/`data-value` ngay trên DOM — đường DOM→doc phục hồi được", async () => {
    const cell: UiCell = { ...newCell("coin", PRESETS), id: "c1", glazeId: "glow" };
    render(<Harness initial={uikit([cell], "free")} />);
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    const pills = [...document.querySelectorAll("[data-kg-node='optionPill']")];
    expect(pills.map((p) => p.getAttribute("data-kind"))).toEqual(["style", "glaze", "decor", "decorPlace"]);
    /* Giá trị THẬT của ô phải nằm trong DOM, không phải mặc định của schema. */
    expect(pills.map((p) => p.getAttribute("data-value"))).toEqual(["", "glow", "light", "balanced"]);
  });
});

describe("③ câu tự do của một dòng ĐI TỚI ĐƯỢC contract và prompt", () => {
  /** Nối thêm chữ vào cuối câu tự do của một ô — đúng thứ người dùng gõ. */
  function withText(cell: UiCell, extra: string): UiCell {
    const doc = uiCellDoc(cell, PRESETS) as JSONContent;
    const para = doc.content![0]!;
    return { ...cell, doc: { ...doc, content: [{ ...para, content: [...para.content!, { type: "text", text: extra }] }] } };
  }

  const cells = () => [
    withText({ ...newCell("button", PRESETS), id: "c1" }, ", khắc hình con rồng ở giữa"),
    { ...newCell("coin", PRESETS), id: "c2" },
  ];

  it("chữ gõ thêm nằm trong `spec` của ĐÚNG ô đó, không lây sang ô bên cạnh", () => {
    const contract = composerToContract(state([uikit(cells(), "free")]), { presets: PRESETS });
    const [first, second] = contract.sheets[0]!.components;
    expect(first!.spec).toContain("khắc hình con rồng ở giữa");
    expect(second!.spec).not.toContain("khắc hình con rồng ở giữa");
  });

  it("KHÔNG đi vào `directive` của tấm — một dòng không được chỉ đạo cả 16 ô", () => {
    const contract = composerToContract(state([uikit(cells(), "free")]), { presets: PRESETS });
    expect(contract.sheets[0]!.directive ?? "").not.toContain("khắc hình con rồng");
    expect(contract.sheets[0]!.promptOverride ?? "").toBe("");
  });

  it("pill trong câu vẫn ra cụm TIẾNG ANH, không ra nhãn tiếng Việt", () => {
    const contract = composerToContract(state([uikit(cells(), "free")]), { presets: PRESETS });
    const spec = contract.sheets[0]!.components[0]!.spec;
    expect(spec).toContain(PRESETS.elements.find((e) => e.id === "button")!.en);
    /* Lượng trang trí mặc định của «Button · primary» là «Ít» — cụm EN của nó,
       không phải chữ "Vừa". */
    expect(spec).toContain("a simple rim and at most one small accent");
    expect(spec).not.toContain("Ít");
    /* Và câu BỐ TRÍ đi cùng nó, cũng bằng tiếng Anh: hai pill, hai câu, một dòng. */
    expect(spec).toContain("ornaments mirrored symmetrically");
    expect(spec).not.toContain("Cân đối");
  });

  it("prompt copy ra ChatGPT nói CÙNG một điều với contract", () => {
    const line = serializeComposer(state([uikit(cells(), "free")]), PRESETS);
    expect(line).toContain("khắc hình con rồng ở giữa");
    /* Vẫn giữ khung "cell N (tên)" để người đọc prompt đối chiếu được với màn. */
    expect(line).toContain("cell 1 (Button · primary)");
  });

  it("xoá sạch một dòng tự do ⇒ rơi về khuôn, KHÔNG ra ô không mô tả gì", () => {
    const empty: UiCell = { ...newCell("button", PRESETS), id: "c1", doc: { type: "doc", content: [] } };
    const contract = composerToContract(state([uikit([empty], "free")]), { presets: PRESETS });
    expect(contract.sheets[0]!.components[0]!.spec).toContain(
      PRESETS.elements.find((e) => e.id === "button")!.en,
    );
  });

  it("chế độ template KHÔNG đọc `doc` — có câu tự do cũ nằm đó cũng không lọt vào", () => {
    const contract = composerToContract(state([uikit(cells(), "template")]), { presets: PRESETS });
    expect(contract.sheets[0]!.components[0]!.spec).not.toContain("khắc hình con rồng");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ PILL PHẢI GIỮ ĐƯỢC DANH TÍNH QUA MỌI LẦN GẠT CÔNG TẮC
   ══════════════════════════════════════════════════════════════════════════
   Chủ sản phẩm mở chế độ tự do và thấy CẢ BA pill của mọi dòng đều ghi "theo
   phong cách chung" — đáng lẽ pill 2 là mức viền, pill 3 là chất liệu. Nguyên
   nhân đo được trên đĩa: tài liệu đã lưu mang `{kind: null, value: null}`, và
   `OptionPillView` lặng lẽ quy null về mặc định `style`/rỗng. Tức là MẤT DỮ
   LIỆU đội lốt một giá trị hợp lệ.

   Ba ca dưới khoá ba mắt xích của cùng một đường: dựng đúng → cứu được cái đã
   hỏng → gạt về khuôn không mất thứ vừa bấm. */
describe("④ pill của dòng tự do: đúng kind, đúng value, không mất khi gạt lại", () => {
  it("Template → Tự do: ba pill mang ĐÚNG kind và ĐÚNG value của ô", async () => {
    const cell: UiCell = { ...newCell("coin", PRESETS), id: "c1", decor: "rich", glazeId: "ice" };
    render(<Harness initial={uikit([cell], "template")} />);

    fireEvent.click(screen.getByRole("button", { name: "Tự do" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    const pills = [...document.querySelectorAll("[data-kg-node='optionPill']")];
    expect(pills.map((p) => p.getAttribute("data-kind"))).toEqual(["style", "glaze", "decor", "decorPlace"]);
    /* Chính chỗ chủ sản phẩm chỉ mặt: pill 2 và 3 KHÔNG được rỗng. */
    expect(pills.map((p) => p.getAttribute("data-value"))).toEqual(["", "ice", "rich", "balanced"]);
  });

  it("tài liệu đã lưu bị mất attrs ⇒ CỨU LẠI theo vị trí + ba trường của ô", () => {
    /* Đúng hình dạng đọc được từ `workflow-draft.json` của dự án đang hỏng. */
    const broken: JSONContent = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "coin icon, " },
          { type: "optionPill", attrs: { kind: null, value: null } },
          { type: "text", text: ", " },
          { type: "optionPill", attrs: { kind: null, value: null } },
          { type: "text", text: ", " },
          { type: "optionPill", attrs: { kind: null, value: null } },
        ],
      }],
    };
    const healed = repairPills(broken, PILL_SLOTS.uikit, ["", "ice", "2"]);
    const pills = (healed.content![0]!.content ?? []).filter((n) => n.type === "optionPill");
    expect(pills.map((p) => p.attrs!["kind"])).toEqual(["style", "glaze", "decor"]);
    expect(pills.map((p) => p.attrs!["value"])).toEqual(["", "ice", "2"]);
    /* Chữ của người dùng KHÔNG được đụng tới trong lúc cứu hộ. */
    expect(JSON.stringify(healed)).toContain("coin icon");
  });

  it("tài liệu LÀNH đi qua nguyên vẹn — cứu hộ không phải một lượt viết lại", () => {
    const good = uiCellDoc({ ...newCell("coin", PRESETS), id: "c1" }, PRESETS);
    expect(docHasBrokenPill(good)).toBe(false);
    expect(repairPills(good, PILL_SLOTS.uikit, ["x", "y", "z"])).toEqual(good);
  });

  it("Tự do → Template: pill đã bấm trong câu KHÔNG bị mất", async () => {
    let latest: UiKitBlock | null = null;
    const cell: UiCell = { ...newCell("button", PRESETS), id: "c1" };
    render(<Harness initial={uikit([cell], "free")} onState={(next) => { latest = next; }} />);
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    /* Bấm pill ĐỤC NỀN trong câu và chọn một giá trị — trước lượt này việc đó
       chỉ đổi tài liệu, còn trường có cấu trúc của ô thì đứng yên. */
    const glazePill = [...document.querySelectorAll("[data-kg-node='optionPill']")]
      .find((p) => p.getAttribute("data-kind") === "glaze")!;
    fireEvent.click(glazePill.querySelector("button")!);
    fireEvent.click(screen.getAllByRole("option")[1]!);

    await waitFor(() => expect(latest?.cells[0]?.glazeId).toBeTruthy());
    const picked = latest!.cells[0]!.glazeId;

    /* Về khuôn: không hỏi (chỉ đổi pill thì chẳng có chữ nào để mất) và giá trị
       vừa bấm phải còn nguyên trong trường có cấu trúc. */
    fireEvent.click(screen.getByRole("button", { name: "Theo template" }));
    await waitFor(() => expect(latest?.mode).toBe("template"));
    expect(latest!.cells[0]!.glazeId).toBe(picked);
    expect(latest!.cells[0]!.doc).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ PILL TÊN TRÊN DÒNG CHỌN THEO BỘ
   ══════════════════════════════════════════════════════════════════════════
   Chủ sản phẩm, nhìn hộp của pill trên dòng: *«select cả cụm chứ»*. Bản trước cho
   riêng hộp này một danh mục PHẲNG (từng phần rời: «Thanh máu · phần đầy», «Hộp
   thoại · bảng tên»…). Ba thứ ca dưới đây khoá lại:
    · KHÔNG hộp nào còn bày một phần rời — hai hộp bày CÙNG một danh sách bộ;
    · chọn bộ trên dòng k ⇒ dòng k thành phần đầu, phần còn lại CHÈN NGAY SAU nó
      (không nối vào cuối: thứ tự dòng là thứ tự ô trên tấm, và cả bộ phải đứng
      liền một cụm ở đúng chỗ người dùng đang nhìn);
    · dòng ĐANG là một phần của chính bộ ấy ⇒ KHÔNG đổi gì (bấm «Dialog» trên một
      dòng vốn đã là «Dialog · name plate» là cú bấm không có ý định nào — chạy nó
      thì dòng ấy mất phần đã chọn và hai dòng trùng mọc ra bên dưới). */
describe("⑤ pill tên trên dòng chọn cả bộ", () => {
  it("hộp «Đổi loại món» bày ĐÚNG danh sách bộ của «+ Element» — không dòng phần rời", () => {
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])} />);

    fireEvent.click(screen.getByRole("button", { name: /Đổi loại món/ }));
    expect(screen.getByRole("dialog", { name: "Đổi loại món" })).toBeTruthy();

    /* Đúng bằng số BỘ trong kho, và mỗi dòng nói ra số phần: thừa một dòng nghĩa
       là một phần nào đó đã lọt ra ngoài dưới dạng lựa chọn riêng. */
    const rows = screen.getAllByRole("option").map((node) => node.textContent ?? "");
    expect(rows).toHaveLength(elementSets(PRESETS).length);
    for (const row of rows) expect(row).toMatch(/· \d+ phần/);

    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "health" } });
    expect(screen.getByRole("option", { name: /^Health bar · 2 phần/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Coin counter/ })).toBeNull();
  });

  it("chọn bộ trên dòng ⇒ dòng thành phần ĐẦU, các phần còn lại CHÈN NGAY SAU nó", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([
          { ...newCell("button", PRESETS), id: "c1" },
          { ...newCell("badge", PRESETS), id: "c2" },
        ])}
        onState={(next) => { latest = next; }}
      />,
    );

    /* Pill của dòng ĐẦU — dòng thứ hai phải ở nguyên chỗ của nó, SAU cả bộ mới. */
    fireEvent.click(screen.getAllByRole("button", { name: /Đổi loại món/ })[0]!);
    fireEvent.click(screen.getByRole("option", { name: /^Dialog · 3 phần/ }));

    await waitFor(() =>
      expect(latest?.cells.map((cell) => cell.elementId))
        .toEqual(["dialog-panel", "dialog-name", "dialog-next", "badge"]),
    );
    /* Phần chèn thêm mang MẶC ĐỊNH CỦA CHÍNH NÓ, y như khi thêm bằng «+ Element». */
    const next = PRESETS.elements.find((e) => e.id === "dialog-next")!;
    expect(latest!.cells[2]!.decor).toBe(next.decor);
    expect(latest!.cells[2]!.glazeId).toBe(next.glazeId);
  });

  it("dòng ĐANG là một phần của chính bộ ấy ⇒ bấm lại KHÔNG đổi gì", async () => {
    const changes: UiKitBlock[] = [];
    render(
      <Harness
        initial={uikit([
          { ...newCell("dialog-panel", PRESETS), id: "c1" },
          /* Dòng ĐANG MỞ là phần THỨ HAI của bộ, không phải phần đầu: nếu code
             chỉ so với phần đầu thì ca này đỏ đúng chỗ. */
          { ...newCell("dialog-name", PRESETS), id: "c2" },
        ])}
        onState={(next) => changes.push(next)}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Đổi loại món/ })[1]!);
    fireEvent.click(screen.getByRole("option", { name: /^Dialog · 3 phần/ }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Đổi loại món" })).toBeNull());
    /* Không dòng nào mọc thêm, không dòng nào đổi loại — kể cả một lượt ghi "y hệt
       cái cũ" cũng là một lượt đánh dấu tài liệu đã đổi. */
    expect(changes.map((block) => block.cells.map((cell) => cell.elementId)))
      .toEqual([["dialog-panel", "dialog-name"]]);
  });

  it("đổi sang bộ khác ⇒ đổi ô trong contract, nhưng GIỮ viền · đục nền · ghi chú của dòng", async () => {
    let latest: UiKitBlock | null = null;
    /* Ba thứ người dùng đã chỉnh tay. `decor: "rich"` cố ý KHÁC mặc định của cả hai
       element, để nếu code lỡ áp preset của element mới thì ca này đỏ. */
    const cell: UiCell = {
      ...newCell("button", PRESETS), id: "c1",
      decor: "rich", glazeId: "ice", note: "bo góc thật tròn",
    };
    render(<Harness initial={uikit([cell])} onState={(next) => { latest = next; }} />);

    fireEvent.click(screen.getByRole("button", { name: /Đổi loại món/ }));
    fireEvent.click(screen.getByRole("option", { name: /^Health bar · 2 phần/ }));

    await waitFor(() => expect(latest?.cells[0]?.elementId).toBe("healthbar"));
    expect(latest!.cells[0]!.decor).toBe("rich");
    expect(latest!.cells[0]!.glazeId).toBe("ice");
    expect(latest!.cells[0]!.note).toBe("bo góc thật tròn");
    /* Phần thứ hai của bộ là một dòng MỚI: nó không thừa hưởng gì của dòng cũ. */
    expect(latest!.cells[1]!.elementId).toBe("hp-fill");
    expect(latest!.cells[1]!.note).toBe("");

    const contract = composerToContract(state([uikit(latest!.cells)]), { presets: PRESETS });
    const component = contract.sheets[0]!.components[0]!;
    expect(component.vi).toBe("Health bar · frame");
    expect(component.spec).toContain(PRESETS.elements.find((e) => e.id === "healthbar")!.en);
    expect(component.spec).toContain("bo góc thật tròn");
  });

  it("dòng TỰ DO: đổi loại vá đúng cụm EN mở đầu, chữ người dùng viết thêm còn nguyên", () => {
    const doc = uiCellDoc({ ...newCell("button", PRESETS), id: "c1" }, PRESETS);
    const mine: JSONContent = {
      ...doc,
      content: [{ ...doc.content![0], content: [...doc.content![0]!.content!, { type: "text", text: ", khắc hình rồng" }] }],
    };
    const buttonEN = PRESETS.elements.find((e) => e.id === "button")!.en;
    const healthEN = PRESETS.elements.find((e) => e.id === "healthbar")!.en;

    const swapped = retitleCellDoc(mine, buttonEN, healthEN);
    const flat = JSON.stringify(swapped);
    expect(flat).toContain(healthEN);
    expect(flat).not.toContain(buttonEN);
    expect(flat).toContain("khắc hình rồng");
  });

  it("người dùng đã sửa cụm mở đầu ⇒ KHÔNG đụng vào chữ của họ", () => {
    const mine: JSONContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "cái nút của riêng tôi, " }] }],
    };
    expect(retitleCellDoc(mine, "a primary action button with a centered label", "X")).toEqual(mine);
  });

  /* ══ PILL HIỆN TIÊU ĐỀ CỦA MỤC, KHÔNG HIỆN DÒNG MÔ TẢ ═══════════════════════
     Chủ sản phẩm, sau khi bấm «Health bar · 2 phần» rồi nhìn pill hiện «Thanh máu
     · phần đầy»: *«nó lấy tên TIÊU ĐỀ chứ, ai lại lấy tên des để thể hiện
     select»*. Pill là cái nút MỞ hộp chọn, nên chữ chính của nó phải là chữ vừa
     được bấm — tức dòng tiêu đề của mục, không phải dòng mô tả bên dưới (nơi tên
     các phần nằm). Tên phần ở lại nhưng xuống hạng phụ, mờ. */
  const nameTiers = (pill: HTMLElement) => [...pill.querySelectorAll("span")].map((node) => node.textContent);

  it("pill dòng hiện TIÊU ĐỀ BỘ làm chữ chính, tên phần làm chữ phụ MỜ", () => {
    render(<Harness initial={uikit([{ ...newCell("hp-fill", PRESETS), id: "c1" }])} />);

    const pill = screen.getByRole("button", { name: /Đổi loại món/ });
    expect(nameTiers(pill)).toEqual(["Health bar", "fill"]);

    const [title, part] = [...pill.querySelectorAll("span")];
    /* Chữ chính KHÔNG được là tên phần — đúng lỗi vừa bị chỉ mặt. */
    expect(title!.textContent).toBe("Health bar");
    expect(title!.className).toContain("font-medium");
    /* Tên phần mờ, cùng kiểu chữ với dòng mô tả của mục trong hộp chọn. */
    expect(part!.className).toContain("text-fg-muted");

    /* `aria-label` vẫn là chuỗi ĐẦY ĐỦ một dòng: trình đọc màn hình nghe một
       chuỗi liền, nó không nghe ra hai hạng chữ. */
    expect(pill.getAttribute("aria-label")).toBe("Đổi loại món — đang là Health bar · fill");
  });

  it("bộ MỘT PHẦN ⇒ pill chỉ một hạng chữ, không đẻ ra tên phần rỗng", () => {
    render(<Harness initial={uikit([{ ...newCell("trophy", PRESETS), id: "c1" }])} />);

    const pill = screen.getByRole("button", { name: /Đổi loại món/ });
    expect(nameTiers(pill)).toEqual(["Trophy"]);
  });

  it("hai dòng CÙNG một bộ vẫn phân biệt được — chữ phụ mới là chỗ khác nhau", () => {
    render(
      <Harness initial={uikit([
        { ...newCell("healthbar", PRESETS), id: "c1" },
        { ...newCell("hp-fill", PRESETS), id: "c2" },
      ])} />,
    );

    const pills = screen.getAllByRole("button", { name: /Đổi loại món/ });
    expect(pills.map(nameTiers)).toEqual([["Health bar", "frame"], ["Health bar", "fill"]]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ BỐ CỤC HAI TẦNG CỦA MỘT DÒNG ELEMENT
   ══════════════════════════════════════════════════════════════════════════
   Chủ sản phẩm: *"dấu × bị lỗi"* và *"bố cục vỡ, mỗi dòng cao thấp khác nhau"*.
   Nguyên nhân là một dải `flex-wrap` duy nhất chứa cả pill lẫn ô ghi chú lẫn
   dấu ×: dòng nào có tên element dài thì ô ghi chú tụt xuống hàng dưới và kéo
   dấu × theo, dòng nào tên ngắn thì tất cả nằm chung một hàng.

   Ba ca dưới khoá cái KHÔNG ĐO ĐƯỢC BẰNG SNAPSHOT: THỨ TỰ và QUAN HỆ CHA-CON
   trong DOM. Chiều cao thật thì jsdom không tính (không có layout engine), nên
   thứ duy nhất kiểm được — và cũng là thứ quyết định — là "× nằm trong hàng 1
   cùng cha với pill" và "ô ghi chú là con RIÊNG của dòng, không nằm trong hàng
   1". Hễ ai đó nhét lại ô ghi chú vào chuỗi pill thì ca ⑦.2 đỏ. */
describe("⑦ dòng element: hàng 1 có ×, hàng 2 là ghi chú", () => {
  const rowOf = (label: string) =>
    screen.getByLabelText(`Ghi chú cho ${label}`).closest("div")!;

  beforeEach(() => {
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])} />);
  });

  it("dấu × ở CUỐI hàng 1, cùng cha với tay nắm và các pill — không cạnh ô ghi chú", () => {
    const remove = screen.getByRole("button", { name: /^Bỏ element/ });
    const grip = screen.getByRole("button", { name: /^Đổi chỗ/ });
    const top = remove.parentElement!;

    /* Cùng CHA với tay nắm ⇒ cùng hàng 1. Trước lượt này nó là anh em với ô ghi
       chú trong một dải wrap, nên vị trí của nó phụ thuộc độ dài tên element. */
    expect(grip.parentElement).toBe(top);
    expect(top.contains(screen.getByLabelText(/^Cỡ của/))).toBe(true);

    /* Và nó là con CUỐI CÙNG của hàng ấy — «× căn phải, cùng hàng với pill». */
    expect(top.lastElementChild).toBe(remove);

    /* Ô ghi chú KHÔNG nằm trong hàng 1. Đây là mấu chốt: nó ở tầng dưới. */
    expect(top.contains(screen.getByLabelText("Ghi chú cho Button · primary"))).toBe(false);
  });

  it("ô ghi chú là con RIÊNG của dòng, đứng SAU hàng 1 — luôn ở dòng của nó", () => {
    const note = screen.getByLabelText("Ghi chú cho Button · primary");
    const row = rowOf("Button · primary");
    const kids = [...row.children];

    expect(kids).toHaveLength(2);
    expect(kids[1]).toBe(note);
    /* Hàng 1 KHÔNG được wrap: mọi con của nó co được, nên ô ghi chú không bao giờ
       bị đẩy đi đâu — và dấu × cũng vậy. */
    expect(kids[0]!.className).toContain("flex-nowrap");
  });

  it("chữ nối «— phong cách», «, đục nền», «, viền», «, cỡ» đã BIẾN MẤT khỏi dòng", () => {
    /* Chúng là bốn vật không co được nằm xen giữa các pill — đúng thứ đã làm vỡ
       bố cục. Nhãn trục nay nằm TRONG pill (xem `PillAxis`), nên bốn cụm rời này
       phải không còn tồn tại; nếu ai đó thêm lại thì ca này đỏ. */
    const row = rowOf("Button · primary");
    expect(row.textContent).not.toContain("— phong cách");
    expect(row.textContent).not.toContain(", đục nền");
    expect(row.textContent).not.toContain(", viền");

    /* Nhưng TÊN TRỤC thì vẫn phải đọc được — bỏ chữ nối không phải bỏ nhãn. */
    for (const axis of ["Phong cách:", "Đục nền:", "Trang trí:", "Bố trí:", "Cỡ:"]) {
      expect(row.textContent).toContain(axis);
    }
  });

  /* ── PILL «BỐ TRÍ» LÀ PILL DUY NHẤT ĐƯỢC PHÉP VẮNG MẶT ─────────────────────
     Hàng 1 là `flex-nowrap`, và sáu pill đã là chật. Ẩn hẳn thay vì làm mờ vì hai
     lẽ: một pill mờ VẪN chiếm chỗ trong hàng ấy, và nó vẫn mời người ta bấm vào
     một câu hỏi không còn nghĩa ("xếp hoa văn ở đâu" cho ô không có hoa văn). */
  it("ô «Không trang trí» ⇒ pill Bố trí BIẾN MẤT khỏi hàng, không phải mờ đi", () => {
    cleanup();
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1", decor: "none" }])} />);
    const row = rowOf("Button · primary");
    expect(row.textContent).toContain("Trang trí:Không");
    expect(row.textContent).not.toContain("Bố trí:");
    expect(screen.queryByLabelText(/^Bố trí:/)).toBeNull();
  });

  it("kéo trang trí lên lại ⇒ pill Bố trí trở về VỚI ĐÚNG lựa chọn cũ", async () => {
    cleanup();
    /* Ô đã chọn «Lệch phải» rồi mới bị hạ xuống «Không»: giá trị ấy nằm yên trong
       `cell.decorPlace` (không bị xoá theo), nên nó phải hiện lại nguyên vẹn. */
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1", decor: "none", decorPlace: "right" }])} />);
    expect(screen.queryByLabelText(/^Bố trí:/)).toBeNull();

    fireEvent.click(screen.getByLabelText(/^Trang trí:/));
    fireEvent.click(screen.getByRole("option", { name: /Nhiều/ }));

    await waitFor(() => expect(screen.getByLabelText(/^Bố trí:/)).not.toBeNull());
    expect(screen.getByLabelText(/^Bố trí:/).textContent).toContain("Lệch phải");
  });

  /**
   * LỐI TẮT TỚI CHỖ SỬA DANH MỤC — ghim ở chân hộp «Chọn sẵn».
   *
   * Người dùng phát hiện danh mục thiếu một mục ĐÚNG LÚC mở hộp này ra và không
   * thấy thứ mình cần. Không có lối tắt thì họ gõ đại vào nấc «Gõ riêng», rồi lần
   * sau gõ lại y như thế — danh mục vĩnh viễn không bao giờ đầy lên.
   */
  it("chân hộp «Chọn sẵn» có lối tắt sang Thư viện prompt, mở đúng danh mục của pill", () => {
    cleanup();
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])} />);
    fireEvent.click(screen.getByLabelText(/^Trang trí:/));

    const link = screen.getByRole("link", { name: /Thư viện prompt/ }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/library/prompts?kind=decor");
    /* TAB MỚI, không điều hướng tại chỗ: hộp này sống trong một câu đang soạn dở. */
    expect(link.getAttribute("target")).toBe("_blank");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑧ PILL CỠ — CÙNG MỘT HỘP «CHỌN SẴN · GÕ RIÊNG» VỚI MỌI PILL KHÁC
   ══════════════════════════════════════════════════════════════════════════
   Hai lời của chủ sản phẩm chồng lên nhau ở đúng cái pill này:
    · *"sao vẫn không thấy select điền size"* — cửa tự điền phải TÌM RA ĐƯỢC;
    · *"giống như mấy cái kia có mode select với tự điền đó, nhất quán vào chứ"*
      — và nó phải tìm ra được Ở ĐÚNG CHỖ mà bảy pill kia đặt cửa ấy, tức là một
      nấc trên thanh ghim đầu hộp, không phải một khối dán ở đáy danh sách.
    · *"cỡ theo hệ thống là sao nhỉ, kiểu chọn mặc định 1 cái thôi chứ?"* — nên
      mục rỗng biến mất, và cả ba đường vào (thêm dòng, mở nháp cũ, đổi loại)
      đều phải cho ra một con số. */
describe("⑧ pill cỡ dùng chung hộp chọn nguồn", () => {
  const openSize = () => fireEvent.click(screen.getByLabelText(/^Cỡ của Button · primary/));

  beforeEach(() => {
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])} />);
  });

  it("pill TỰ XƯNG TÊN — «Cỡ: …», không phải một chữ trôi nổi cạnh chữ nối mờ", () => {
    expect(screen.getByLabelText(/^Cỡ của Button · primary/).textContent).toContain("Cỡ:");
  });

  it("mở ra: thanh hai nấc y như pill theme/phong cách", () => {
    openSize();
    expect(screen.getByRole("tab", { name: "Chọn sẵn" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Gõ riêng" })).toBeTruthy();
    /* KHÔNG có nấc ảnh: một cỡ không đến từ tấm ảnh nào. */
    expect(screen.queryByRole("tab", { name: "Đính ảnh" })).toBeNull();
  });

  it("hộp NÓI RA con số này là cỡ ĐẦU RA, không phải cỡ máy vẽ", () => {
    /* Từ 07/09/2026 ô luôn được vẽ to hết cỡ lề cho phép (`drawBox`), nên chọn «S»
       không làm món đồ nhỏ đi trên tấm sheet. Không nói ra thì người dùng mở ảnh ra,
       thấy nút to bằng cả ô, và kết luận pill hỏng. Nhãn đứng ĐÚNG MỘT LẦN. */
    openSize();
    const note = screen.getAllByText("Cỡ khi xuất ra Figma/PNG");
    expect(note).toHaveLength(1);
  });

  it("nấc «Chọn sẵn» = cỡ mặc định CỦA LOẠI + 4 nấc, mỗi mục kèm số px thật", () => {
    openSize();
    const options = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(options).toHaveLength(SIZE_PRESETS.length + 1);
    expect(options.join(" ")).not.toContain("theo hệ thống");
    /* Mục đầu nói RA con số của chính loại element — «Button · primary» là một hộp
       rộng-mỏng, không phải hộp 4:3 dùng chung như trước 07/09/2026. */
    const button = PRESETS.elements.find((e) => e.id === "button");
    const px = defaultSizePx(button);
    expect(options[0]).toContain("Mặc định của Button · primary");
    expect(options[0]).toContain(`${px.w}×${px.h}px`);
    expect(px.w / px.h).toBeGreaterThan(2);
    for (const preset of SIZE_PRESETS) {
      const hit = options.find((text) => text.includes(preset.vi));
      expect(hit).toBeTruthy();
      /* Con số là cả điểm của danh sách: "L · lớn" một mình không nói được nó lớn
         hơn "M" bao nhiêu — mà đó đúng là câu người thiết kế đang hỏi. Và nay con
         số ấy GIỮ TỈ LỆ của element: nút pill ở nấc L ra 256×89, không phải 256×192. */
      const step = stepSizePx(preset.long, button?.skel);
      expect(hit).toContain(`${step.w}×${step.h}px`);
      expect(step.w).toBe(preset.long);
    }
  });

  it("cỡ mặc định TRÙNG một nấc ⇒ GỘP làm một mục, không bày hai dòng cùng số", () => {
    /* Ca hiếm nhưng có thật: một hình vuông 0,815 ra đúng 256×256 = nấc L. Bày cả
       «Mặc định của …» lẫn «L · lớn» lúc ấy là hai dòng khác tên, cùng số, cùng
       giá trị — người dùng phải tự đoán chúng có khác nhau không.
       Danh mục sống được lấy qua `getPresets()` (đã mock ở đầu file thành CHÍNH
       object mà `usePresets` trả về), nên thêm một loại vào đây là màn thấy ngay. */
    const live = getPresets();
    const plate: ElementPreset = {
      id: "dia-tron", vi: "Đĩa tròn", en: "round plate", decor: "medium", glazeId: "", sizeId: "",
      skel: { shape: "circle", w: 0.815, h: 0.815 },
    };
    live.elements.push(plate);
    try {
      cleanup();
      render(<Harness initial={uikit([{
        id: "c1", elementId: plate.id, styleId: "", decor: "medium", decorPlace: "balanced", glazeId: "",
        sizeId: defaultSizeOf(plate), note: "",
      }])} />);
      fireEvent.click(screen.getByLabelText(/^Cỡ của Đĩa tròn/));
      const options = screen.getAllByRole("option").map((o) => o.textContent ?? "");
      expect(options).toHaveLength(SIZE_PRESETS.length);
      expect(options.join(" ")).not.toContain("Mặc định của Đĩa tròn");
      const hit = options.find((text) => text.includes("L · lớn"))!;
      expect(hit).toContain("(mặc định)");
      expect(hit).toContain("256×256px");
    } finally {
      live.elements.splice(live.elements.indexOf(plate), 1);
    }
  });

  it("chọn một nấc ⇒ ghi ĐÚNG id preset vào ô, và pill đọc ra nhãn của nấc ấy", async () => {
    let latest: UiKitBlock | null = null;
    cleanup();
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])}
        onState={(next) => { latest = next; }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^Cỡ của Button · primary/));
    fireEvent.click(screen.getByRole("option", { name: /XL · tràn ô/ }));

    await waitFor(() => expect(latest?.cells[0]?.sizeId).toBe("xl"));
    expect(screen.getByLabelText(/^Cỡ của Button · primary/).textContent).toContain("XL · tràn ô");
  });

  it("nấc «Gõ riêng» có hai ô W×H + nút chốt — và nó ghi ra chuỗi «<w>x<h>»", async () => {
    let latest: UiKitBlock | null = null;
    cleanup();
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])}
        onState={(next) => { latest = next; }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^Cỡ của Button · primary/));
    fireEvent.click(screen.getByRole("tab", { name: "Gõ riêng" }));

    fireEvent.change(screen.getByLabelText("Bề rộng của Button · primary"), { target: { value: "160" } });
    fireEvent.change(screen.getByLabelText("Bề cao của Button · primary"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Dùng cỡ này" }));

    await waitFor(() => expect(latest?.cells[0]?.sizeId).toBe("160x120"));
    /* Chốt xong thì hộp đóng lại và pill nói ra con số vừa gõ — không phải chuỗi
       lưu `160x120` chưa được dịch. */
    expect(screen.getByLabelText(/^Cỡ của Button · primary/).textContent).toContain("160×120px");
  });

  it("Enter trong ô số = bấm nút chốt — không ai phải rê chuột để lưu số vừa gõ", async () => {
    let latest: UiKitBlock | null = null;
    cleanup();
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])}
        onState={(next) => { latest = next; }}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^Cỡ của Button · primary/));
    fireEvent.click(screen.getByRole("tab", { name: "Gõ riêng" }));
    const wide = screen.getByLabelText("Bề rộng của Button · primary");
    fireEvent.change(wide, { target: { value: "200" } });
    fireEvent.keyDown(wide, { key: "Enter" });

    await waitFor(() => expect(latest?.cells[0]?.sizeId).toMatch(/^200x/));
  });

  it("cỡ đang dùng là chuỗi tự gõ ⇒ hộp mở SẴN ở nấc «Gõ riêng», không nấc nào được tick", () => {
    cleanup();
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1", sizeId: "160x120" }])} />);
    openSize();
    expect(screen.getByRole("tab", { name: "Gõ riêng" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Chọn sẵn" }));
    for (const option of screen.getAllByRole("option")) {
      expect(option.getAttribute("aria-selected")).toBe("false");
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑧b CỠ LUÔN LÀ MỘT CON SỐ, VÀ CON SỐ ẤY THEO *HÌNH DẠNG* CỦA LOẠI ELEMENT
   ══════════════════════════════════════════════════════════════════════════
   *"Mà cỡ theo hệ thống là sao nhỉ, kiểu chọn mặc định 1 cái thôi chứ?"*
   Ba đường sinh ra một dòng element, và chỉ cần MỘT đường còn để rỗng là câu hỏi
   ấy quay lại: rỗng nghĩa là 0,8×0,6 của Ô, mà ô thì co giãn theo lưới — thêm
   một món vào thẻ là mọi món rỗng đổi cỡ theo, không ai bấm gì cả.

   Và từ 07/09/2026 còn một luật nữa, nặng hơn: một con số CHUNG cho mọi loại là
   sai ngang với rỗng. Prompt của tấm thật hứa cùng hộp `251x188` cho «thanh máu»
   và «khung avatar» — xem khối đo ở đầu `cell-size.ts`. */
describe("⑧b cỡ luôn cụ thể, và cụ thể theo hình dạng của loại", () => {
  it("thêm dòng: cỡ = hộp đo từ `skel` của chính loại element", () => {
    const button = PRESETS.elements.find((e) => e.id === "button");
    expect(newCell("button", PRESETS).sizeId).toBe(defaultSizeOf(button));
    expect(sizePx(newCell("button", PRESETS).sizeId, button?.skel)).toEqual(skelSizePx(button?.skel));
  });

  it("thanh máu ra hộp RỘNG-MỎNG, khung avatar ra hộp VUÔNG — không còn cùng một hộp", () => {
    const barEl = PRESETS.elements.find((e) => e.id === "healthbar");
    const avatarEl = PRESETS.elements.find((e) => e.id === "avatar-frame");
    const bar = sizePx(newCell("healthbar", PRESETS).sizeId, barEl?.skel)!;
    const avatar = sizePx(newCell("avatar-frame", PRESETS).sizeId, avatarEl?.skel)!;
    expect(bar.w / bar.h).toBeGreaterThan(3);
    expect(avatar.w).toBe(avatar.h);
    expect(bar).not.toEqual(avatar);
  });

  it("element KHÔNG khai hình dạng (tự đặt tên) ⇒ hộp trung tính, không ra rỗng", () => {
    const bare = { ...PRESETS, elements: PRESETS.elements.map((e) => ({ ...e, sizeId: "", skel: undefined })) };
    const cell = newCell("button", bare);
    /* Không gõ lại "251x188" ở đây: ca này khoá QUAN HỆ (khung trung tính ⇄ con số
       hiện trên pill), không khoá một chuỗi. */
    expect(sizePx(cell.sizeId, undefined)).toEqual(skelSizePx(CUSTOM_ELEMENT_SKEL, REFERENCE_CELL_PX));
  });

  /* ══ NẤC S/M/L/XL = CẠNH DÀI, KHÔNG PHẢI HỘP CỐ ĐỊNH ══════════════════════
     Chủ sản phẩm nhìn pill Cỡ của «Avatar frame» rồi hỏi: *"mà avatar sao lại có
     256×192 nhỉ…"*. Bốn nấc cũ là bốn hộp đóng cứng, nên chọn «L» cho một khung
     vuông là tự tay phá đúng cái hình dạng vừa dựng lên ở lượt trước. */
  it("một nấc, ba tỉ lệ, ba hộp — và cạnh dài LUÔN đúng con số của nấc", () => {
    const of = (id: string) => PRESETS.elements.find((e) => e.id === id)?.skel;
    const l = SIZE_PRESETS.find((p) => p.id === "l")!;
    expect(stepSizePx(l.long, of("avatar-frame"))).toEqual({ w: 256, h: 256 });
    expect(stepSizePx(l.long, of("healthbar"))).toEqual({ w: 256, h: 65 });
    /* Nút pill 0,78/0,27 = 2,889 ⇒ 256/2,889 = 88,6 ⇒ 89 (làm tròn, không cắt cụt:
       thanh máu ở nấc S ra 28,65 và phải là 29 chứ không phải 28). */
    expect(stepSizePx(l.long, of("button"))).toEqual({ w: 256, h: 89 });
    /* Element TỰ ĐẶT TÊN đi cùng luật, qua hộp trung tính 0,8×0,6 (4:3). */
    expect(stepSizePx(l.long, undefined)).toEqual({ w: 256, h: 192 });
    for (const preset of SIZE_PRESETS) {
      for (const id of ["avatar-frame", "healthbar", "button"]) {
        const px = stepSizePx(preset.long, of(id));
        expect(Math.max(px.w, px.h)).toBe(preset.long);
      }
    }
  });

  it("hình CAO hơn rộng ⇒ cạnh dài là CHIỀU CAO, không phải chiều ngang", () => {
    const tall = { shape: "rrect" as const, w: 0.4, h: 0.8 };
    expect(stepSizePx(112, tall)).toEqual({ w: 56, h: 112 });
    expect(stepSizePx(304, tall)).toEqual({ w: 152, h: 304 });
  });

  it("kẹp biên: tỉ lệ hoang không đẻ ra cạnh 0, nấc quá khổ không vượt canvas", () => {
    const det = { shape: "bar" as const, w: 1, h: 0.02 };   // 50:1
    expect(stepSizePx(112, det)).toEqual({ w: 112, h: MIN_SIZE_PX });
    expect(stepSizePx(99_999, { shape: "circle" as const, w: 0.5, h: 0.5 }))
      .toEqual({ w: MAX_SIZE_PX, h: MAX_SIZE_PX });
    /* Hình dạng hỏng (thiếu `h`) ⇒ tỉ lệ của hộp trung tính, không phải NaN. */
    expect(stepSizePx(256, { shape: "rrect" as const, w: 0.8 })).toEqual({ w: 256, h: 192 });
  });

  it("nháp cũ lưu một nấc ⇒ nay ĐỌC LẠI theo hình dạng, có chủ ý", () => {
    /* Một dòng «Avatar frame» lưu `"l"` trước lượt này đọc ra 256×192; nay 256×256.
       `"l"` luôn có nghĩa «nấc lớn», và nghĩa của nấc lớn nay là «cạnh dài 256, giữ
       hình». Chuỗi TỰ ĐIỀN thì không đi qua bảng nấc nên không đổi một pixel. */
    const avatar = PRESETS.elements.find((e) => e.id === "avatar-frame")?.skel;
    expect(sizePx("l", avatar)).toEqual({ w: 256, h: 256 });
    expect(sizePx("256x192", avatar)).toEqual({ w: 256, h: 192 });
  });

  it("cỡ mặc định TRÙNG một nấc ⇒ giá trị lưu là id nấc ấy, không phải chuỗi px", () => {
    /* 314 × 0,815 = 255,9 ⇒ 256 — đúng cạnh dài của nấc L, và hình vuông nên cả hai
       cạnh khớp. Đây là ca duy nhất mà hộp chọn phải GỘP hai mục làm một. */
    const plate = { skel: { shape: "circle" as const, w: 0.815, h: 0.815 } };
    expect(defaultSizePx(plate)).toEqual({ w: 256, h: 256 });
    expect(defaultSizeOf(plate)).toBe("l");
    /* Còn tám loại hạt giống thì KHÔNG trùng nấc nào ⇒ mục «Mặc định của …» vẫn
       đứng riêng, và hộp chọn có 5 mục (xem ca ⑧). */
    for (const element of PRESETS.elements) {
      expect(SIZE_PRESETS.some((preset) => preset.id === defaultSizeOf(element))).toBe(false);
    }
  });

  it("đổi loại element: cỡ CHƯA bị chỉnh tay ⇒ đi theo loại mới", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])}
        onState={(next) => { latest = next; }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Đổi loại/ }));
    /* «Panel» là một bộ MỘT PHẦN, nên cú bấm này đổi đúng dòng đang mở và không
       chèn thêm dòng nào — ca cỡ nói về đúng một dòng. */
    fireEvent.click(screen.getByRole("option", { name: /^Panel/ }));
    /* Một cái nút 245×85 đổi thành bảng nền mà vẫn 245×85 là một cái bảng bằng
       cái nút — nên cỡ phải đi theo hình dạng của loại MỚI. */
    const panel = defaultSizeOf(PRESETS.elements.find((e) => e.id === "panel"));
    await waitFor(() => expect(latest?.cells[0]?.sizeId).toBe(panel));
  });

  it("đổi loại element: cỡ ĐÃ chỉnh tay ⇒ GIỮ NGUYÊN, không bị mặc định đắp lên", async () => {
    let latest: UiKitBlock | null = null;
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1", sizeId: "240x90" }])}
        onState={(next) => { latest = next; }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Đổi loại/ }));
    fireEvent.click(screen.getByRole("option", { name: /^Panel/ }));
    await waitFor(() => {
      expect(latest?.cells[0]?.elementId).toBe("panel");
      /* Trong CÙNG một `waitFor`: đọc `latest` sau đó thì TypeScript đã thu hẹp nó
         về `null` (gán nằm trong closure), và một `as` chỉ để chiều compiler là
         chỗ dễ nói dối nhất trong cả file. */
      expect(latest?.cells[0]?.sizeId).toBe("240x90");
    });
  });
});


/* ══════════════════════════════════════════════════════════════════════════
   ⑥ EDITOR KHÔNG ĐƯỢC "ĐỔI" KHI KHÔNG CÓ GÌ ĐỔI
   ══════════════════════════════════════════════════════════════════════════
   Lượt bắn `onUpdate` lúc mount là MẮT XÍCH đã đóng dấu bản tài liệu hỏng xuống
   đĩa mà không cần người dùng chạm phím (xem `knownRef` trong `BlockEditor`).
   Ca này canh đúng cái mắt xích ấy. */
describe("⑥ mount một dòng tự do KHÔNG được tự ghi lại tài liệu", () => {
  it("dựng xong editor mà chưa gõ gì ⇒ block KHÔNG bị báo là đã đổi", async () => {
    const changes: UiKitBlock[] = [];
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }], "free")}
        onState={(next) => changes.push(next)}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());
    /* Cho editor thêm một nhịp để mọi transaction khởi tạo chạy xong. */
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(changes).toEqual([]);
  });

  it("gõ thật thì VẪN báo đổi — cửa chặn không được chặn nhầm việc thật", async () => {
    const changes: UiKitBlock[] = [];
    render(
      <Harness
        initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }], "free")}
        onState={(next) => changes.push(next)}
      />,
    );
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    /* Bấm một pill là một thay đổi THẬT của tài liệu. */
    const decorPill = [...document.querySelectorAll("[data-kg-node='optionPill']")]
      .find((p) => p.getAttribute("data-kind") === "decor")!;
    fireEvent.click(decorPill.querySelector("button")!);
    fireEvent.click(screen.getAllByRole("option")[3]!);

    await waitFor(() => expect(changes.length).toBeGreaterThan(0));
  });
});
