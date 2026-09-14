import { describe, expect, it } from "vitest";

import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import { mascotDoc } from "@/features/prompt-lab/lib/doc-templates";
import { OUTFIT_THEMES } from "@/features/kit-core/lib/poses";
import {
  newCell,
  newMascotPose,
  type ComposerState,
  type MascotBlock,
  type UiCell,
  type UiKitBlock,
} from "@/features/prompt-lab/lib/composer-model";

import { composerToContract } from "../composer-to-contract";
import { FINGERPRINT_VERSION, sheetFingerprint, stampFingerprints } from "../fingerprint";

/**
 * VÂN TAY CỦA TỪNG TẤM — cái khoá giữ cho "sửa tấm 2 thì chỉ tấm 2 được vẽ lại".
 *
 * ╔══ BA CÁCH HỎNG, VÀ CẢ BA ĐỀU IM LẶNG ═══════════════════════════════════╗
 * ║ ① VÂN TAY KHÔNG ỔN ĐỊNH (cùng dữ liệu ra hai chuỗi) ⇒ không tấm nào được  ║
 * ║   giữ, mọi lượt Vẽ lại tiêu đủ tiền như cũ. Không ai thấy gì sai cả — chỉ ║
 * ║   là tính năng không tồn tại.                                            ║
 * ║ ② VÂN TAY QUÁ RỘNG (sửa tấm 2 làm đổi cả vân tay tấm 1) ⇒ y hệt ①.        ║
 * ║ ③ VÂN TAY QUÁ HẸP (đổi phong cách chung mà vân tay đứng im) ⇒ TỆ NHẤT:    ║
 * ║   agent bỏ qua tấm mà người dùng vừa sửa, và họ ngồi nhìn một tấm cũ với  ║
 * ║   chữ «giữ nguyên, chưa đổi gì» — một lời nói dối có bằng chứng.          ║
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

function uiBlock(ids: readonly string[]): UiKitBlock {
  const cells: UiCell[] = ids.map((id) => newCell(id, PRESETS));
  return { id: "u1", kind: "uikit", mode: "template", cells };
}

function mascotBlock(n: number): MascotBlock {
  return {
    id: "m1",
    kind: "mascot",
    mode: "template",
    doc: mascotDoc(),
    poses: Array.from({ length: n }, () => newMascotPose()),
  };
}

/** Vân tay của từng tấm, theo thứ tự tấm. */
const printsOf = (s: ComposerState) =>
  composerToContract(s, { presets: PRESETS }).sheets.map((sheet) => sheet.fingerprint);

/** Sáu món ⇒ hai tấm (4 + 2) ở nấc mặc định. */
const SIX = ["button", "coin", "panel", "badge", "popover", "trophy"];

/** Bản sao của một thẻ Bộ UI với ô thứ `at` được ghi thêm một câu. */
function withNote(block: UiKitBlock, at: number, note: string): UiKitBlock {
  return { ...block, cells: block.cells.map((cell, i) => (i === at ? { ...cell, note } : cell)) };
}

describe("vân tay ỔN ĐỊNH — cùng dữ liệu, cùng con dấu", () => {
  it("dịch hai lần cùng một tài liệu ⇒ vân tay không đổi một ký tự", () => {
    const doc = state([uiBlock(SIX)]);
    expect(printsOf(doc)).toEqual(printsOf(doc));
  });

  it("mỗi tấm một vân tay, và vân tay mang số hiệu đời phép băm", () => {
    const prints = printsOf(state([uiBlock(SIX)]));
    expect(prints).toHaveLength(2);
    expect(prints[0]).not.toBe(prints[1]);
    for (const print of prints) expect(print).toMatch(new RegExp(`^${FINGERPRINT_VERSION}-[0-9a-f]{16}$`));
  });

  it("đóng dấu LẠI lên một contract đã có dấu ⇒ ra đúng dấu cũ", () => {
    /* Nếu không, mọi lượt dịch thứ hai (PUT lại contract, xem trước prompt) đều
       làm mọi tấm "đã đổi" và phép bỏ qua thành vô dụng. */
    const contract = composerToContract(state([uiBlock(SIX)]), { presets: PRESETS });
    expect(stampFingerprints(contract).sheets.map((s) => s.fingerprint))
      .toEqual(contract.sheets.map((s) => s.fingerprint));
  });
});

describe("vân tay ĐỦ HẸP — sửa tấm 2 thì tấm 1 phải đứng im", () => {
  it("đổi một dòng của tấm 2 ⇒ chỉ vân tay tấm 2 đổi", () => {
    const before = printsOf(state([uiBlock(SIX)]));
    /* Ô thứ 5 (đếm từ 0) nằm ở TẤM 2 — nấc mặc định 4 ô mỗi tấm. */
    const after = printsOf(state([withNote(uiBlock(SIX), 5, "viền dày hơn")]));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it("đổi một dòng của tấm 1 ⇒ chỉ vân tay tấm 1 đổi", () => {
    const before = printsOf(state([uiBlock(SIX)]));
    const after = printsOf(state([withNote(uiBlock(SIX), 0, "bo góc tròn hơn")]));
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it("thẻ Nhân vật cũng vậy — sửa dáng của tấm 2 không đụng tấm 1", () => {
    const block = mascotBlock(6);
    const before = printsOf(state([block]));
    const moved: MascotBlock = {
      ...block,
      poses: block.poses.map((pose, i) => (i === 5 ? { ...pose, note: "nghiêng người hơn" } : pose)),
    };
    const after = printsOf(state([moved]));
    expect(after).toHaveLength(2);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });
});

describe("vân tay ĐỦ RỘNG — thứ nào vào prompt thì thứ ấy phải có mặt", () => {
  it("đổi bộ màu thương hiệu ⇒ MỌI tấm đổi vân tay", () => {
    /* Màu đi vào `variant.brand`, mà `gen.sh` dựng section bảng màu cho mọi tấm.
       Vân tay mù với nó là bỏ qua đúng cái tấm người dùng vừa đổi màu. */
    const before = printsOf(state([uiBlock(SIX)]));
    const after = printsOf({ ...state([uiBlock(SIX)]), brandColors: ["#ff5533"] });
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it("đổi phong cách chung ⇒ MỌI tấm đổi vân tay", () => {
    const before = printsOf(state([uiBlock(SIX)]));
    const after = printsOf({ ...state([uiBlock(SIX)]), styleCustom: "vẽ tay bằng phấn màu" });
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it("đổi ẢNH THAM CHIẾU của tấm ⇒ vân tay đổi theo", () => {
    /* Ảnh đi tới máy vẽ bằng ĐƯỜNG DẪN trong contract, và `pickRefName` của agent
       không bao giờ ghi đè một tên đã có — nên đường dẫn khác là nội dung khác. */
    const sheet = { id: "ui", grid: { cols: 1, rows: 1 }, components: [], ref: "refs/a.png" } as never;
    const other = { id: "ui", grid: { cols: 1, rows: 1 }, components: [], ref: "refs/b.png" } as never;
    expect(sheetFingerprint(sheet, "")).not.toBe(sheetFingerprint(other, ""));
  });

  it("hai nửa của vân tay không lẫn vào nhau được", () => {
    /* Nối chuỗi thô thì một câu phong cách kết thúc đúng chỗ mục tấm bắt đầu sẽ
       cho cùng một vân tay với một tổ hợp khác. `JSON.stringify` một mảng đóng
       ngoặc giúp tránh đúng chuyện đó. */
    const sheet = { id: "ui", grid: { cols: 1, rows: 1 }, components: [] } as never;
    expect(sheetFingerprint(sheet, "ab")).not.toBe(sheetFingerprint(sheet, "a"));
  });
});
