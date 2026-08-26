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
import { seedPresets } from "../lib/presets-store";
import { PILL_SLOTS, docHasBrokenPill, repairPills, retitleCellDoc, uiCellDoc } from "../lib/doc-templates";
import { serializeComposer } from "../lib/serialize-composer";
import {
  moveCell,
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

  it("`moveCell` đưa dòng cuối lên đầu, giữ nguyên phần còn lại", () => {
    const moved = moveCell(cells(), 2, 0);
    expect(moved.map((c) => c.elementId)).toEqual(["panel", "button", "coin"]);
  });

  it("chỉ số ngoài khoảng KHÔNG cắt xén mảng — `splice` âm sẽ ném dòng sang đầu kia", () => {
    const base = cells();
    for (const [from, to] of [[-1, 0], [0, 9], [3, 1], [0, -2]] as const) {
      expect(moveCell(base, from, to).map((c) => c.elementId)).toEqual(["button", "coin", "panel"]);
    }
  });

  it("đổi thứ tự dòng ⇒ ĐỔI thứ tự `components[]`, không chỉ đổi trên màn", () => {
    const before = cellNames(cells());
    expect(before).toEqual(["Nút bấm", "Icon tiền", "Bảng nền"]);

    const after = cellNames(moveCell(cells(), 2, 0));
    expect(after).toEqual(["Bảng nền", "Nút bấm", "Icon tiền"]);
  });

  it("tên tệp của ô bám VỊ TRÍ, không bám element — số thứ tự phải chạy lại sau khi kéo", () => {
    const contract = composerToContract(state([uikit(moveCell(cells(), 2, 0))]), { presets: PRESETS });
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
    expect(screen.queryByRole("button", { name: "Nút bấm" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Icon tiền" })).toBeNull();
    expect(screen.getByRole("button", { name: /Element/ })).toBeTruthy();
  });

  it("bấm ra hộp tra danh mục, gõ để lọc, chọn thì thêm ĐÚNG món", () => {
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    const box = screen.getByRole("dialog", { name: /Thêm món/ });
    expect(box).toBeTruthy();

    /* Gõ KHÔNG DẤU: người ta tra danh mục bằng cách gõ nhanh, không bỏ dấu. */
    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "icon tien" } });
    expect(screen.queryByRole("option", { name: /Nút bấm/ })).toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /Icon tiền/ }));

    /* Dòng vừa thêm phải hiện ra ngay, mang đúng tên món đã chọn. */
    expect(screen.getByLabelText("Ghi chú cho Icon tiền")).toBeTruthy();
    expect(screen.queryByLabelText("Ghi chú cho Nút bấm")).toBeNull();
  });

  /* HỘP KHÔNG TỰ ĐÓNG SAU MỖI LẦN CHỌN — và đó là một quyết định, không phải một
     chỗ quên. Dựng một bộ kit là thêm dăm bảy món liền tay; đóng hộp sau mỗi món
     là bắt người dùng mở lại và gõ lại chuỗi tìm kiếm mỗi lần. Đóng bằng Escape,
     bấm ra ngoài, hoặc bấm lại chính cái nút. */
  it("thêm hai món liền tay ⇒ hai dòng, thứ tự đúng thứ tự bấm", () => {
    fireEvent.click(screen.getByRole("button", { name: /Element/ }));
    for (const name of [/Nút bấm/, /Bảng nền/]) {
      fireEvent.click(screen.getAllByRole("option", { name })[0]!);
    }
    const handles = screen.getAllByRole("button", { name: /^Đổi chỗ/ });
    expect(handles).toHaveLength(2);
    expect(handles[0]!.getAttribute("aria-label")).toContain("Nút bấm");
    expect(handles[1]!.getAttribute("aria-label")).toContain("Bảng nền");
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
    expect(screen.getByLabelText("Ghi chú cho Nút bấm")).toBeTruthy();
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
    expect(screen.queryByLabelText("Ghi chú cho Nút bấm")).toBeNull();

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
    render(<Harness initial={uikit([{ ...newCell("coin", PRESETS), id: "c1" }], "free")} />);
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    const pills = [...document.querySelectorAll("[data-kg-node='optionPill']")];
    expect(pills.map((p) => p.getAttribute("data-kind"))).toEqual(["style", "decor", "material"]);
    /* "Icon tiền" mang sẵn mức viền 2 và chất liệu kim loại vàng — giá trị THẬT
       của ô phải nằm trong DOM, không phải mặc định của schema. */
    expect(pills.map((p) => p.getAttribute("data-value"))).toEqual(["", "2", "gold-metal"]);
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
    /* Mức viền mặc định của "Nút bấm" là 4 — cụm EN của nó, không phải chữ "Vừa". */
    expect(spec).toContain("a beveled border with a subtle gradient face");
    expect(spec).not.toContain("Vừa");
  });

  it("prompt copy ra ChatGPT nói CÙNG một điều với contract", () => {
    const line = serializeComposer(state([uikit(cells(), "free")]), PRESETS);
    expect(line).toContain("khắc hình con rồng ở giữa");
    /* Vẫn giữ khung "cell N (tên)" để người đọc prompt đối chiếu được với màn. */
    expect(line).toContain("cell 1 (Nút bấm)");
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
    const cell: UiCell = { ...newCell("coin", PRESETS), id: "c1", decor: "6", materialId: "gold-metal" };
    render(<Harness initial={uikit([cell], "template")} />);

    fireEvent.click(screen.getByRole("button", { name: "Tự do" }));
    await waitFor(() => expect(document.querySelector(".ProseMirror")).not.toBeNull());

    const pills = [...document.querySelectorAll("[data-kg-node='optionPill']")];
    expect(pills.map((p) => p.getAttribute("data-kind"))).toEqual(["style", "decor", "material"]);
    /* Chính chỗ chủ sản phẩm chỉ mặt: pill 2 và 3 KHÔNG được rỗng. */
    expect(pills.map((p) => p.getAttribute("data-value"))).toEqual(["", "6", "gold-metal"]);
  });

  it("tài liệu đã lưu bị mất attrs ⇒ CỨU LẠI theo vị trí + ba trường của ô", () => {
    /* Đúng hình dạng đọc được từ `workflow-draft.json` của dự án đang hỏng. */
    const broken: JSONContent = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "a coin currency icon, " },
          { type: "optionPill", attrs: { kind: null, value: null } },
          { type: "text", text: ", " },
          { type: "optionPill", attrs: { kind: null, value: null } },
          { type: "text", text: ", " },
          { type: "optionPill", attrs: { kind: null, value: null } },
        ],
      }],
    };
    const healed = repairPills(broken, PILL_SLOTS.uikit, ["", "2", "gold-metal"]);
    const pills = (healed.content![0]!.content ?? []).filter((n) => n.type === "optionPill");
    expect(pills.map((p) => p.attrs!["kind"])).toEqual(["style", "decor", "material"]);
    expect(pills.map((p) => p.attrs!["value"])).toEqual(["", "2", "gold-metal"]);
    /* Chữ của người dùng KHÔNG được đụng tới trong lúc cứu hộ. */
    expect(JSON.stringify(healed)).toContain("a coin currency icon");
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

    /* Bấm pill CHẤT LIỆU trong câu và chọn một giá trị — trước lượt này việc đó
       chỉ đổi tài liệu, còn `materialId` của ô thì đứng yên. */
    const materialPill = [...document.querySelectorAll("[data-kg-node='optionPill']")]
      .find((p) => p.getAttribute("data-kind") === "material")!;
    fireEvent.click(materialPill.querySelector("button")!);
    fireEvent.click(screen.getAllByRole("option")[1]!);

    await waitFor(() => expect(latest?.cells[0]?.materialId).toBeTruthy());
    const picked = latest!.cells[0]!.materialId;

    /* Về khuôn: không hỏi (chỉ đổi pill thì chẳng có chữ nào để mất) và giá trị
       vừa bấm phải còn nguyên trong trường có cấu trúc. */
    fireEvent.click(screen.getByRole("button", { name: "Theo template" }));
    await waitFor(() => expect(latest?.mode).toBe("template"));
    expect(latest!.cells[0]!.materialId).toBe(picked);
    expect(latest!.cells[0]!.doc).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ TÊN ELEMENT LÀ PILL CHỌN ĐƯỢC
   ══════════════════════════════════════════════════════════════════════════ */
describe("⑤ đổi loại element tại chỗ", () => {
  it("bấm tên ⇒ mở CÙNG bộ tra danh mục, tìm được bằng chữ không dấu", () => {
    render(<Harness initial={uikit([{ ...newCell("button", PRESETS), id: "c1" }])} />);

    fireEvent.click(screen.getByRole("button", { name: /Đổi loại món/ }));
    expect(screen.getByRole("dialog", { name: "Đổi loại món" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Tìm trong danh mục"), { target: { value: "thanh mau" } });
    expect(screen.getByRole("option", { name: /Thanh máu/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Icon tiền/ })).toBeNull();
  });

  it("đổi loại ⇒ đổi ô trong contract, nhưng GIỮ viền · chất liệu · ghi chú", async () => {
    let latest: UiKitBlock | null = null;
    /* Ba thứ người dùng đã chỉnh tay. `decor: "7"` cố ý KHÁC mặc định của cả hai
       element, để nếu code lỡ áp preset của element mới thì ca này đỏ. */
    const cell: UiCell = {
      ...newCell("button", PRESETS), id: "c1",
      decor: "7", materialId: "gold-metal", note: "bo góc thật tròn",
    };
    render(<Harness initial={uikit([cell])} onState={(next) => { latest = next; }} />);

    fireEvent.click(screen.getByRole("button", { name: /Đổi loại món/ }));
    fireEvent.click(screen.getByRole("option", { name: /Thanh máu/ }));

    await waitFor(() => expect(latest?.cells[0]?.elementId).toBe("healthbar"));
    expect(latest!.cells[0]!.decor).toBe("7");
    expect(latest!.cells[0]!.materialId).toBe("gold-metal");
    expect(latest!.cells[0]!.note).toBe("bo góc thật tròn");

    const contract = composerToContract(state([uikit(latest!.cells)]), { presets: PRESETS });
    const component = contract.sheets[0]!.components[0]!;
    expect(component.vi).toBe("Thanh máu");
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
