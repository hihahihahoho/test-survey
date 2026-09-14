import { describe, expect, it } from "vitest";

import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import { mascotDoc } from "@/features/prompt-lab/lib/doc-templates";
import { OUTFIT_THEMES } from "@/features/kit-core/lib/poses";
import {
  DEFAULT_MAX_PER_SHEET,
  SHEET_MAX_CHOICES,
  mascotSplit,
  maxPerSheetOf,
  newCell,
  newMascotPose,
  sheetBreaks,
  sheetSplitNote,
  splitRows,
  uiKitSplit,
  type ComposerState,
  type MascotBlock,
  type UiCell,
  type UiKitBlock,
} from "@/features/prompt-lab/lib/composer-model";

import { COMPOSER_DOC_VERSION, migrateComposerDoc } from "../composer-doc";
import { composerBlockSheets, composerToContract, mascotSheetPlan, poseSheetKey } from "../composer-to-contract";
import { jobIdOf, lotsOf } from "../block-jobs";

/**
 * TỐI ĐA MỖI TẤM — phép chia một thẻ thành nhiều tấm, và cài đặt điều khiển nó.
 *
 * ╔══ VÌ SAO ĐÁNG MỘT FILE RIÊNG ════════════════════════════════════════════╗
 * ║ Lời chủ sản phẩm: *«không phải xếp 6 cái vào chung 1 page… mặc định là    ║
 * ║ MAX 4 cái 1 sheet gen. Ví dụ trên 1 tấm mà có 1 món → gen full, đỡ tốn    ║
 * ║ khoảng trống»*. Con số này quyết định BA thứ cùng lúc, và cả ba hỏng      ║
 * ║ lặng lẽ nếu phép chia trôi đi:                                            ║
 * ║  ① SỐ LƯỢT GỌI MÁY VẼ — tức là tiền (`lotsOf` đọc thẳng phép chia này);   ║
 * ║  ② CỠ MỖI MÓN trên ảnh ra — lưới 1×1 cho một món, 2×2 cho bốn, 3×3 cho    ║
 * ║    chín; nhầm một nấc là món nhỏ đi hơn hai lần mà không ai báo;          ║
 * ║  ③ BỘ GHÉP (khung + phần đầy) có bị xé sang hai tấm không — xé ra là hai  ║
 * ║    lượt vẽ độc lập, và cái khung thôi ôm được cái ruột.                    ║
 * ║ Badge trên thẻ và bộ dịch contract đọc CÙNG một hàm; ca dưới đây khoá cả  ║
 * ║ hàm ấy lẫn đường nó đi tới `Sheet.grid` thật.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const PRESETS = seedPresets();

const state = (blocks: ComposerState["blocks"]): ComposerState => ({
  themeValue: OUTFIT_THEMES[0]!.value,
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

/** Thẻ Bộ UI từ một danh sách id element, theo đúng thứ tự truyền vào. */
function uiBlock(ids: readonly string[], maxPerSheet?: number): UiKitBlock {
  const cells: UiCell[] = ids.map((id) => newCell(id, PRESETS));
  return { id: "u1", kind: "uikit", mode: "template", cells, ...(maxPerSheet ? { maxPerSheet } : {}) };
}

/** Thẻ Nhân vật với `n` dáng — nội dung dáng không quan trọng, chỉ số lượng. */
function mascotBlock(n: number, maxPerSheet?: number): MascotBlock {
  return {
    id: "m1",
    kind: "mascot",
    mode: "template",
    doc: mascotDoc(),
    poses: Array.from({ length: n }, () => newMascotPose()),
    ...(maxPerSheet ? { maxPerSheet } : {}),
  };
}

/** Số ô THẬT của từng tấm (không tính ô trống độn cho đủ lưới). */
const sizesOf = (block: UiKitBlock) => uiKitSplit(block, PRESETS).map((chunk) => chunk.length);

/** Tấm mà một thẻ sinh ra, qua ĐÚNG đường bộ dịch contract đi. */
const sheetsOf = (block: ComposerState["blocks"][number]) =>
  composerBlockSheets(state([block]), { presets: PRESETS })[0]!.sheets;

/* ══════════════════════════════════════════════════════════════════════════
   ① Nấc đọc ra sao
   ══════════════════════════════════════════════════════════════════════════ */

describe("maxPerSheetOf — ba nấc, và mọi thứ khác về mặc định", () => {
  it("mặc định là 4, đúng lời chủ sản phẩm", () => {
    expect(DEFAULT_MAX_PER_SHEET).toBe(4);
    expect(SHEET_MAX_CHOICES).toEqual([1, 4, 9]);
  });

  it("ba nấc hợp lệ đi qua nguyên vẹn", () => {
    for (const choice of SHEET_MAX_CHOICES) expect(maxPerSheetOf(choice)).toBe(choice);
  });

  it("thiếu · lạ · rác đều rơi về mặc định — không có nấc bí ẩn nào", () => {
    /* `16` là TRẦN CŨ: một thẻ lưu từ đời trước không được giữ riêng cho mình một
       nấc mà hộp chọn không bày ra — người dùng sẽ không có cách nào hiểu vì sao
       thẻ ấy xếp khác thẻ bên cạnh. */
    for (const bad of [undefined, null, 0, -1, 2, 3, 5, 7, 16, "4 ", {}, NaN]) {
      expect(maxPerSheetOf(bad)).toBe(DEFAULT_MAX_PER_SHEET);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② Phép chia thuần
   ══════════════════════════════════════════════════════════════════════════ */

describe("splitRows — chia theo thứ tự dòng, không đảo chỗ", () => {
  const rows = ["a", "b", "c", "d", "e"];

  it("N ≤ trần ⇒ đúng một tấm", () => {
    expect(splitRows(rows.slice(0, 4), 4)).toEqual([["a", "b", "c", "d"]]);
  });

  it("N > trần ⇒ ceil(N/trần) tấm, thứ tự giữ nguyên", () => {
    expect(splitRows(rows, 4)).toEqual([["a", "b", "c", "d"], ["e"]]);
    expect(splitRows(rows, 1)).toEqual([["a"], ["b"], ["c"], ["d"], ["e"]]);
  });

  it("danh sách rỗng ⇒ không tấm nào (không phải một tấm rỗng)", () => {
    expect(splitRows([], 4)).toEqual([]);
  });

  it("trần rác ⇒ vẫn chia được, không treo vòng lặp", () => {
    expect(splitRows(rows, 0)).toHaveLength(5);
    expect(splitRows(rows, -3)).toHaveLength(5);
  });

  it("cụm CHỈ gom dòng LIỀN KỀ — hai dòng cùng khoá mà cách nhau không bị kéo lại", () => {
    const tagged = [
      { id: "x", g: "s" },
      { id: "y", g: "" },
      { id: "z", g: "s" },
    ];
    expect(splitRows(tagged, 2, (row) => row.g).map((chunk) => chunk.map((r) => r.id))).toEqual([
      ["x", "y"],
      ["z"],
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ Thẻ Bộ UI — phép chia đi tới tận `Sheet.grid`
   ══════════════════════════════════════════════════════════════════════════ */

describe("thẻ Bộ UI chia tấm theo nấc của chính nó", () => {
  it("MỘT món ⇒ một tấm lưới 1×1 — món chiếm trọn khổ, không chừa chỗ trống", () => {
    const sheets = sheetsOf(uiBlock(["button"]));
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.grid).toEqual({ cols: 1, rows: 1 });
    /* Không một ô `_empty` nào: `padTo` chỉ độn cho đủ `cols*rows`, mà ở đây là 1. */
    expect(sheets[0]!.components).toHaveLength(1);
  });

  it("BỐN món ở nấc mặc định ⇒ vẫn MỘT tấm, lưới 2×2", () => {
    const block = uiBlock(["button", "btn-secondary", "btn-pressed", "btn-disabled"]);
    expect(sizesOf(block)).toEqual([4]);
    const sheets = sheetsOf(block);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.grid).toEqual({ cols: 2, rows: 2 });
  });

  it("NĂM món ở nấc mặc định ⇒ 4 + 1, và tấm thứ hai là lưới 1×1", () => {
    const block = uiBlock(["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover"]);
    expect(sizesOf(block)).toEqual([4, 1]);
    const sheets = sheetsOf(block);
    expect(sheets.map((s) => s.id)).toEqual(["ui", "ui2"]);
    expect(sheets[0]!.grid).toEqual({ cols: 2, rows: 2 });
    expect(sheets[1]!.grid).toEqual({ cols: 1, rows: 1 });
    /* TÊN JOB — thứ POST /runs nhận, và thứ `raw/<job>.png` mang. */
    expect(sheets.map((s) => jobIdOf(s.id))).toEqual(["chinh-ui", "chinh-ui2"]);
  });

  it("SÁU món ở nấc mặc định ⇒ 4 + 2 — đúng ví dụ chủ sản phẩm đưa", () => {
    const block = uiBlock(["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover", "trophy"]);
    expect(sizesOf(block)).toEqual([4, 2]);
    expect(sheetSplitNote(sizesOf(block))).toBe("2 tấm (4 + 2)");
  });

  it("CHÍN món ở nấc 9 ⇒ MỘT tấm lưới 3×3; ở nấc mặc định ⇒ 4 + 4 + 1", () => {
    const ids = ["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover", "trophy", "coin", "avatar-frame", "slider-track"]
      .filter((id) => PRESETS.elements.some((element) => element.id === id));
    expect(ids.length).toBeGreaterThanOrEqual(9);

    const wide = uiBlock(ids.slice(0, 9), 9);
    expect(sizesOf(wide)).toEqual([9]);
    expect(sheetsOf(wide)[0]!.grid).toEqual({ cols: 3, rows: 3 });

    const narrow = uiBlock(ids.slice(0, 9));
    expect(sizesOf(narrow)).toEqual([4, 4, 1]);
    expect(sheetsOf(narrow).map((s) => s.id)).toEqual(["ui", "ui2", "ui3"]);
  });

  it("nấc 1 ⇒ mỗi món một tấm riêng, mỗi tấm lưới 1×1", () => {
    const block = uiBlock(["button", "popover", "trophy"], 1);
    expect(sizesOf(block)).toEqual([1, 1, 1]);
    expect(sheetsOf(block).every((s) => s.grid.cols === 1 && s.grid.rows === 1)).toBe(true);
  });

  it("số lượt vẽ ĐẾM THEO TẤM, nên đổi nấc là đổi tiền", () => {
    const six = ["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover", "trophy"];
    const lots = (max?: number) => lotsOf(composerBlockSheets(state([uiBlock(six, max)]), { presets: PRESETS }));
    expect(lots(1)).toBe(6);
    expect(lots()).toBe(2);
    expect(lots(9)).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ Bộ ghép không bị cắt ngang
   ══════════════════════════════════════════════════════════════════════════ */

describe("bộ ghép (khung + ruột) đi trọn một tấm khi còn chỗ", () => {
  /* `dialog` là bộ `composition` ba phần trong kho gieo sẵn; `btn-*` là bộ
     `variants` — mỗi phần đứng một mình được, nên chúng KHÔNG được gom. */
  const DIALOG = ["dialog-panel", "dialog-name", "dialog-next"];

  it("cụm ba phần thà sang tấm sau còn hơn bị xé — 2 + 3, không phải 4 + 1", () => {
    const block = uiBlock(["button", "btn-secondary", ...DIALOG]);
    expect(sizesOf(block)).toEqual([2, 3]);
    const second = uiKitSplit(block, PRESETS)[1]!.map((cell) => cell.elementId);
    expect(second).toEqual(DIALOG);
  });

  it("cụm vừa khít trần ⇒ không đẩy đi đâu cả", () => {
    const block = uiBlock(["button", ...DIALOG]);
    expect(sizesOf(block)).toEqual([4]);
  });

  it("cụm TO HƠN trần thì buộc phải cắt — nhưng cắt theo thứ tự, không cắt bừa", () => {
    const block = uiBlock(DIALOG, 1);
    expect(uiKitSplit(block, PRESETS).map((chunk) => chunk.map((c) => c.elementId))).toEqual([
      ["dialog-panel"], ["dialog-name"], ["dialog-next"],
    ]);
  });

  it("bộ BIẾN THỂ không được gom — bốn nút vẫn chia đúng 4 + 1", () => {
    const block = uiBlock(["button", "btn-secondary", "btn-pressed", "btn-disabled", "popover"]);
    expect(sizesOf(block)).toEqual([4, 1]);
  });

  it("thêm CÙNG một bộ ghép hai lần ⇒ hai cụm riêng, không thành một cụm to", () => {
    /* Thiếu phép đánh số lượt thì bốn dòng này là MỘT cụm bốn phần; ở nấc 1 nó
       sẽ bị cắt rời y hệt, nên ca này đo ở nấc 2 — nơi hai cách chia khác nhau. */
    const block = uiBlock(["healthbar", "hp-fill", "healthbar", "hp-fill"], 4);
    const cells = uiKitSplit(block, PRESETS, 2).map((chunk) => chunk.map((c) => c.elementId));
    expect(cells).toEqual([["healthbar", "hp-fill"], ["healthbar", "hp-fill"]]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ Thẻ Nhân vật — cùng cơ chế, và ảnh dáng phải theo TỪNG TẤM
   ══════════════════════════════════════════════════════════════════════════ */

describe("thẻ Nhân vật dùng chung một luật chia", () => {
  it("sáu dáng ở nấc mặc định ⇒ 4 + 2, hai tấm mang hai id khác nhau", () => {
    const block = mascotBlock(6);
    expect(mascotSplit(block).map((chunk) => chunk.length)).toEqual([4, 2]);
    const sheets = sheetsOf(block);
    expect(sheets.map((s) => s.id)).toEqual(["nhan-vat", "nhan-vat2"]);
    expect(sheets.map((s) => jobIdOf(s.id))).toEqual(["chinh-nhan-vat", "chinh-nhan-vat2"]);
    expect(sheets[0]!.grid).toEqual({ cols: 2, rows: 2 });
    expect(sheets[1]!.grid).toEqual({ cols: 2, rows: 2 });
  });

  it("một dáng ⇒ một tấm 1×1; chín dáng ở nấc 9 ⇒ một tấm 3×3", () => {
    expect(sheetsOf(mascotBlock(1))[0]!.grid).toEqual({ cols: 1, rows: 1 });
    const nine = sheetsOf(mascotBlock(9, 9));
    expect(nine).toHaveLength(1);
    expect(nine[0]!.grid).toEqual({ cols: 3, rows: 3 });
  });

  it("KẾ HOẠCH TẤM là thứ `ensurePoseRefs` ghép ảnh theo — mỗi tấm một tấm ảnh riêng", () => {
    /* `mascotSheetPlan` là hàm duy nhất trả lời "dòng nào vào tấm nào", và
       `ensurePoseRefs` lặp trên chính nó để dựng `poseSheet.paths[i]`. Lệch một
       nhịp là ô thứ k của ảnh tham chiếu không nằm chồng lên ô thứ k của tấm vẽ. */
    const plans = mascotSheetPlan(mascotBlock(6), { presets: PRESETS });
    expect(plans.map((p) => p.poses.length)).toEqual([4, 2]);
    expect(plans.map((p) => p.grid)).toEqual([{ cols: 2, rows: 2 }, { cols: 2, rows: 2 }]);
  });

  it("ĐỔI NẤC ⇒ VÂN TAY ảnh dáng đổi theo, nên tấm ghép cũ không bị dùng lại", () => {
    const four = poseSheetKey(mascotBlock(6), { presets: PRESETS });
    const nine = poseSheetKey(mascotBlock(6, 9), { presets: PRESETS });
    expect(four).not.toBe(nine);
    /* Vân tay là `r<đời bộ dựng>;<khối lưới>;…` — nấc 9 gom cả sáu dáng vào một
       tấm 3×3 nên chỉ còn MỘT khối lưới, nấc 4 thì hai. */
    expect(nine).toMatch(/^r\d+;3x3:/);
    expect(nine.split(";")).toHaveLength(2);
    expect(four.split(";")).toHaveLength(3);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ Nấc sống bền trong tài liệu
   ══════════════════════════════════════════════════════════════════════════ */

describe("composer-doc — nấc được lưu, và bản nháp cũ về mặc định", () => {
  const docOf = (blocks: unknown[]) =>
    migrateComposerDoc(
      { docVersion: COMPOSER_DOC_VERSION, updatedAt: "", composer: { blocks } },
      PRESETS,
    );

  const uiRaw = (extra: Record<string, unknown> = {}) => ({
    id: "u1", kind: "uikit", mode: "template",
    cells: [{ id: "c1", elementId: "button" }],
    ...extra,
  });

  it("BẢN NHÁP CŨ (không có trường) ⇒ 4, không phải trần 16 đời trước", () => {
    const block = docOf([uiRaw()]).composer.blocks[0] as UiKitBlock;
    expect(block.maxPerSheet).toBe(DEFAULT_MAX_PER_SHEET);
  });

  it("nấc đã lưu đọc lên nguyên vẹn", () => {
    expect((docOf([uiRaw({ maxPerSheet: 9 })]).composer.blocks[0] as UiKitBlock).maxPerSheet).toBe(9);
    expect((docOf([uiRaw({ maxPerSheet: 1 })]).composer.blocks[0] as UiKitBlock).maxPerSheet).toBe(1);
  });

  it("nấc rác trên đĩa ⇒ mặc định, thẻ vẫn mở được", () => {
    expect((docOf([uiRaw({ maxPerSheet: 5 })]).composer.blocks[0] as UiKitBlock).maxPerSheet).toBe(4);
    expect((docOf([uiRaw({ maxPerSheet: "nhiều" })]).composer.blocks[0] as UiKitBlock).maxPerSheet).toBe(4);
  });

  it("thẻ Nhân vật cũng lưu nấc của riêng nó", () => {
    const raw = { id: "m1", kind: "mascot", mode: "template", doc: mascotDoc(), poses: [{ id: "p1", pose: "idle" }], maxPerSheet: 1 };
    expect((docOf([raw]).composer.blocks[0] as MascotBlock).maxPerSheet).toBe(1);
  });

  it("ĐỌC LÊN RỒI DỊCH RA CONTRACT vẫn ra đúng số tấm mà nấc ấy hứa", () => {
    const cells = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, elementId: "button" }));
    const doc = docOf([{ id: "u1", kind: "uikit", mode: "template", cells, maxPerSheet: 1 }]);
    const contract = composerToContract(doc, { presets: PRESETS });
    expect(contract.sheets).toHaveLength(6);
    expect(contract.sheets.map((sheet) => sheet.id)).toEqual(["ui", "ui2", "ui3", "ui4", "ui5", "ui6"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ Chữ trên badge
   ══════════════════════════════════════════════════════════════════════════ */

describe("sheetSplitNote — câu người dùng đọc trên thẻ", () => {
  it("một tấm thì không bày dấu ngoặc rỗng", () => {
    expect(sheetSplitNote([4])).toBe("1 tấm");
    expect(sheetSplitNote([1])).toBe("1 tấm");
  });

  it("nhiều tấm thì nói ra từng tấm mấy ô", () => {
    expect(sheetSplitNote([4, 2])).toBe("2 tấm (4 + 2)");
    expect(sheetSplitNote([4, 4, 1])).toBe("3 tấm (4 + 4 + 1)");
  });

  it("thẻ rỗng nói thẳng là chưa có tấm nào", () => {
    expect(sheetSplitNote([])).toBe("chưa có tấm nào");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ Vạch ranh giới tấm — chỗ cắt mà người dùng NHÌN THẤY
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ╔══ VÌ SAO VẠCH PHẢI TÍNH TỪ KẾT QUẢ CHIA, KHÔNG TỪ `index % trần` ════════╗
 * ║ Bộ ghép làm một tấm NGẮN HƠN trần (cụm không đủ chỗ thì sang tấm sau      ║
 * ║ nguyên vẹn). Một phép `index % 4` vẽ vạch ở dòng 4 trong khi phép chia    ║
 * ║ thật cắt ở dòng 3 — người dùng kéo một món "qua vạch", thấy nó sang tấm 2 ║
 * ║ trên màn, rồi bấm Vẽ và nhận về một tấm 1 vẫn còn nó.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
describe("sheetBreaks — mỗi tấm bắt đầu ở dòng nào", () => {
  it("một tấm ⇒ một mốc duy nhất ở dòng 0", () => {
    expect(sheetBreaks([3])).toEqual([{ no: 1, at: 0, size: 3 }]);
  });

  it("6 dòng trần 4 ⇒ vạch ở dòng 0 và dòng 4", () => {
    expect(sheetBreaks([4, 2])).toEqual([
      { no: 1, at: 0, size: 4 },
      { no: 2, at: 4, size: 2 },
    ]);
  });

  it("không có dòng nào ⇒ không có vạch nào", () => {
    expect(sheetBreaks([])).toEqual([]);
  });

  it("tấm NGẮN vì bộ ghép ⇒ vạch đi theo phép chia thật, không theo trần", () => {
    /* Hai dòng lẻ rồi bộ ghép `dialog` ba phần, trần 4: cụm không còn đủ chỗ ở tấm
       1 nên nó sang tấm 2 NGUYÊN VẸN ⇒ tấm 1 chỉ có 2 ô, và vạch nằm ở dòng 2 —
       không phải dòng 4 như một phép `index % trần` sẽ nói. */
    const block = uiBlock(["button", "btn-secondary", "dialog-panel", "dialog-name", "dialog-next"]);
    const sizes = sizesOf(block);
    expect(sizes).toEqual([2, 3]);
    expect(sheetBreaks(sizes).map((b) => b.at)).toEqual([0, 2]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ Hai tấm của MỘT thẻ: phần chung y hệt, phần ô khác nhau
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Chủ sản phẩm: *"mỗi prompt tấm giống hệt nhau, khác mỗi phần mô tả"*. Đó là một
 * lời hứa ĐO ĐƯỢC ngay ở contract — thứ engine dựng prompt từ đó: khổ, lời gợi ý ô,
 * và câu phong cách của cả bộ phải bằng nhau TỪNG CHỮ giữa hai tấm; chỉ `components`
 * được khác. Lệch một trong mấy trường ấy là hai tấm vẽ ra hai lối, và người dùng
 * không có cách nào đoán vì sao.
 */
describe("một thẻ → nhiều tấm: phần chung không được lệch", () => {
  it("hai tấm cùng khổ, cùng lời gợi ý ô, chỉ khác danh sách ô", () => {
    const sheets = sheetsOf(uiBlock(["button", "coin", "panel", "badge", "button", "coin"]));
    expect(sheets).toHaveLength(2);
    const [one, two] = sheets;
    expect(two!.canvas).toBe(one!.canvas);
    expect(two!.cell_hint).toBe(one!.cell_hint);
    expect(two!.orient).toBe(one!.orient);
    /* Khác id (hai tấm là hai job) và khác danh sách ô — đó là toàn bộ chỗ được khác. */
    expect(two!.id).not.toBe(one!.id);
    expect(two!.components.map((c) => c.vi)).not.toEqual(one!.components.map((c) => c.vi));
  });

  it("tấm 1 ô có lưới 1×1 — món đó chiếm trọn khổ", () => {
    const sheets = sheetsOf(uiBlock(["button", "coin"], 1));
    expect(sheets).toHaveLength(2);
    for (const sheet of sheets) expect(sheet.grid).toEqual({ cols: 1, rows: 1 });
  });

  it("câu phong cách của cả bộ là MỘT, dùng chung cho mọi tấm", () => {
    const contract = composerToContract(
      state([uiBlock(["button", "coin", "panel", "badge", "button", "coin"])]),
      { presets: PRESETS },
    );
    expect(contract.sheets).toHaveLength(2);
    /* Một `variant` duy nhất ⇒ `gen.sh` chèn ĐÚNG một câu phong cách vào cả hai tấm. */
    expect(contract.variants).toHaveLength(1);
    expect(contract.variants?.[0]!.style).not.toBe("");
  });
});
