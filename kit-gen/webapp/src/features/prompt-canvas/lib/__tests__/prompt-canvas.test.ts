import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";

import { contractJobs, contractSchema } from "@/lib/types/contract";
import { HINT_SQUARE, MAIN_VARIANT_ID, resolveElementSpec } from "@/features/kit-core/lib/kitset-to-contract";
import { glazeFromMaterial, glazePhrase } from "@/features/kit-core/lib/glaze";
import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { EXPRESSIONS, OUTFIT_THEMES } from "@/features/kit-core/lib/poses";

import { SIZE_PRESETS, SQUARE_CANVAS_PX } from "@/features/prompt-lab/lib/cell-size";
import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import { backgroundDoc, contextDoc, mascotDoc } from "@/features/prompt-lab/lib/doc-templates";
import { NODE } from "@/features/prompt-lab/lib/schema";
import { phraseOf } from "@/features/prompt-lab/lib/pill-registry";
import { countComposerImages, serializeComposer } from "@/features/prompt-lab/lib/serialize-composer";
import type { Block, ComposerState, UiCell } from "@/features/prompt-lab/lib/composer-model";

import { COMPOSER_DOC_VERSION, emptyComposerDoc, migrateComposerDoc, type ComposerDoc } from "../composer-doc";
import { composerStyleLine, composerToContract } from "../composer-to-contract";
import { EMPTY_PILL_IMAGE, dataUrlToFile, readPillImage } from "../pill-image";

/**
 * Test của TẦNG LOGIC prompt-first. Phạm vi cố ý hẹp và nói rõ hẹp ở đâu.
 *
 * Thứ được KHOÁ ở đây là ba dây nối mà hỏng thì KHÔNG CÓ GÌ BÁO:
 *  ① migrate — mở một dự án có bản nháp wizard cũ mà đọc nhầm thành composer;
 *  ② dịch ra contract — sai một khoá là `gen.sh` vẽ sai hoặc agent từ chối ghi;
 *  ③ đường ảnh — `blob:` cũ hoặc đường dẫn có `..` lọt vào `sheet.ref`.
 *
 * Thứ KHÔNG khoá: hook `useComposerDoc` (cần React + TanStack Query + DOM ⇒ thuộc
 * `*.dom.test.tsx`, hạ tầng đó chưa có — xem đầu `vitest.config.ts`) và
 * `uploadPillImage` (cần agent thật; đường mạng của nó là `api.refs.add`, đã có
 * ca riêng ở tầng transport). Phần THUẦN của cả hai thì được khoá đủ.
 */

const PRESETS = seedPresets();

const state = (partial: Partial<ComposerState> = {}): ComposerState => ({
  themeValue: OUTFIT_THEMES[0]!.value,
  styleId: PRESETS.styles[0]!.id,
  brandColors: [],
  contextMode: "template",
  blocks: [],
  ...partial,
});

/** Nối thêm một mẩu chữ vào cuối câu template — đúng thứ người dùng gõ thêm. */
function withExtraText(doc: JSONContent, extra: string): JSONContent {
  const para = doc.content?.[0];
  return {
    ...doc,
    content: [{ ...para, content: [...(para?.content ?? []), { type: "text", text: extra }] }],
  };
}

/** Đặt ảnh (đã tải lên) vào pill ảnh ĐẦU TIÊN của tài liệu. */
function withImage(doc: JSONContent, refName: string): JSONContent {
  let done = false;
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === NODE.imagePill && !done) {
      done = true;
      return { ...node, attrs: { refName, path: `refs/${refName}` } };
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node;
  };
  return walk(doc);
}

/* ══════════════════════════════════════════════════════════════════════════ */

describe("migrateComposerDoc — thiếu docVersion thì KHÔNG cố dịch", () => {
  it("bản nháp wizard cũ trong workflow-draft.json ⇒ tài liệu RỖNG, không ném", () => {
    /* Hình dạng thật của `draft` mà `useSaveWorkflowDraft` của wizard đời cũ ghi. */
    const wizard = {
      kitName: "Kit Tết",
      styleAxes: { age: 3, energy: 5 },
      elements: [{ file: "01-btn-primary", selected: true }],
      mascotPoses: ["idle", "wave"],
      completedSteps: 4,
    };
    const doc = migrateComposerDoc(wizard, PRESETS);
    expect(doc.docVersion).toBe(COMPOSER_DOC_VERSION);
    expect(doc.composer.blocks).toEqual([]);
    expect(doc.updatedAt).toBe("");
    /* Không một mảnh nào của wizard được đoán sang composer. */
    expect(JSON.stringify(doc)).not.toContain("Kit Tết");
  });

  it.each([[null], [undefined], ["chuỗi rác"], [42], [[1, 2, 3]], [{ docVersion: "1" }], [{ docVersion: 2 }]])(
    "rác %p ⇒ tài liệu rỗng mặc định",
    (raw) => {
      expect(() => migrateComposerDoc(raw, PRESETS)).not.toThrow();
      expect(migrateComposerDoc(raw, PRESETS).composer.blocks).toEqual([]);
    },
  );

  it("tài liệu đúng phiên bản ⇒ giữ nguyên, block hỏng bị bỏ RIÊNG nó", () => {
    const good: ComposerDoc = {
      docVersion: COMPOSER_DOC_VERSION,
      updatedAt: "2026-08-24T10:00:00.000Z",
      composer: state({
        brandColors: ["#ff5533"],
        blocks: [
          { id: "b1", kind: "background", mode: "free", doc: backgroundDoc() },
          { id: "u1", kind: "uikit", mode: "template", cells: [] },
        ],
      }),
    };
    const raw = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
    (raw["composer"] as { blocks: unknown[] }).blocks.push({ id: "x", kind: "khong-co-that" });

    const doc = migrateComposerDoc(raw, PRESETS);
    expect(doc.updatedAt).toBe("2026-08-24T10:00:00.000Z");
    expect(doc.composer.blocks).toHaveLength(2);
    expect(doc.composer.blocks[0]).toMatchObject({ id: "b1", kind: "background", mode: "free" });
    expect(doc.composer.brandColors).toEqual(["#ff5533"]);
  });

  it("tài liệu rỗng mặc định vẫn là một tài liệu hợp lệ", () => {
    const doc = emptyComposerDoc(PRESETS);
    expect(migrateComposerDoc(doc, PRESETS)).toEqual(doc);
  });
});

describe("composerToContract — kết quả phải QUA ĐƯỢC schema contract", () => {
  const full = (): ComposerState =>
    state({
      brandColors: ["#ff5533", "#112233"],
      blocks: [
        { id: "b1", kind: "background", mode: "template", doc: withImage(backgroundDoc(), "inspo-1.png") },
        {
          id: "u1",
          kind: "uikit",
          mode: "template",
          cells: [
            { id: "c1", elementId: "button", styleId: "", decor: "4", glazeId: "glass", sizeId: "", note: "bo góc to" },
            { id: "c2", elementId: "coin", styleId: "match3", decor: "2", glazeId: "", sizeId: "xl", note: "" },
          ],
        },
        { id: "m1", kind: "mascot", mode: "template", doc: withImage(mascotDoc(), "char-lan.png") },
      ],
    });

  it("round-trip: contract sinh ra parse lại KHÔNG lỗi", () => {
    const contract = composerToContract(full(), { presets: PRESETS, kitName: "Kit Tết" });
    expect(() => contractSchema.parse(contract)).not.toThrow();
    expect(contract.sheets.map((s) => s.id)).toEqual(["nen", "ui", "nhan-vat"]);
    expect(contract.variants?.[0]?.id).toBe(MAIN_VARIANT_ID);
    expect(contract.variants?.[0]?.vi).toBe("Kit Tết");
    /* Job = phong cách × tấm, đúng `contractJobs` của agent. */
    expect(contractJobs(contract).map((j) => j.job)).toEqual(["chinh-nen", "chinh-ui", "chinh-nhan-vat"]);
  });

  it("nhận cả ComposerDoc lẫn ComposerState — cùng một kết quả", () => {
    const composer = full();
    const doc: ComposerDoc = { docVersion: COMPOSER_DOC_VERSION, updatedAt: "", composer };
    expect(composerToContract(doc, { presets: PRESETS })).toEqual(composerToContract(composer, { presets: PRESETS }));
  });

  it("câu theme tổng + màu thương hiệu đi vào variant.style, KHÔNG lặp ở từng ô", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    const style = contract.variants![0]!.style;
    expect(style).toContain(PRESETS.styles[0]!.en);
    expect(style).toContain(OUTFIT_THEMES[0]!.value);
    /* `describeBrandColors` — chữ dẫn hướng kèm mã hex, đúng thứ tự vai trò. */
    expect(style).toContain("dominant brand colour");
    expect(style).toContain("#ff5533");
    expect(contract.variants![0]!.brand?.primary).toBe("#ff5533");
    expect(contract.variants![0]!.brand?.secondary).toBe("#112233");
    for (const sheet of contract.sheets) {
      for (const c of sheet.components) expect(c.spec).not.toContain("#ff5533");
    }
  });

  it("ảnh của pill → sheet.ref, đường dẫn TƯƠNG ĐỐI refs/…", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    expect(contract.sheets.find((s) => s.id === "nen")?.ref).toBe("refs/inspo-1.png");
    const mascot = contract.sheets.find((s) => s.id === "nhan-vat");
    expect(mascot?.ref).toBe("refs/char-lan.png");
    /* Có ảnh mẫu ⇒ tấm dáng phải mang `note` "cùng một nhân vật", nếu không mỗi
       ô ra một con khác nhau. */
    expect(mascot?.note).toContain("REFERENCE PHOTO");
    expect(contract.variants![0]!.characters?.[0]?.ref).toBe("refs/char-lan.png");
    expect(contract.characterPoses).toEqual(["idle"]);
  });

  it("ô UI kit → components 4 khoá đúng, ô thừa được pad bằng _empty-N", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    const ui = contract.sheets.find((s) => s.id === "ui")!;
    expect(ui.grid).toEqual({ cols: 2, rows: 2 });
    expect(ui.components).toHaveLength(4);
    expect(Object.keys(ui.components[0]!)).toEqual(["file", "vi", "spec", "skel"]);

    const first = ui.components[0]!;
    expect(first.file).toBe("01-button");
    expect(first.vi).toBe("Nút bấm");
    expect(first.spec).toContain(PRESETS.elements.find((e) => e.id === "button")!.en);
    expect(first.spec).toContain(phraseOf("decor", "4", PRESETS));
    /* Đục nền nối qua `resolveElementSpec`, không phải một luật nối chuỗi thứ hai. */
    expect(first.spec).toContain(glazePhrase("glass"));
    /* DANH TỪ THUẦN: mô tả có thuộc tính đã bị bỏ khỏi danh mục (ý kiến chủ SP). */
    expect(first.spec.startsWith("button,")).toBe(true);
    expect(first.spec).toContain("bo góc to");

    /* Ô 2 tự chọn phong cách ⇒ phong cách RIÊNG nằm trong spec của chính nó. */
    expect(ui.components[1]!.spec).toContain(PRESETS.styles.find((s) => s.id === "match3")!.en);

    /* Ô trống phải có TÊN khác nhau, nếu không V-02 (trùng tên trong tấm) nổ. */
    expect(ui.components.slice(2).map((c) => c.file)).toEqual(["_empty-1", "_empty-2"]);
    expect(ui.components.slice(2).every((c) => c.skel.shape === "empty")).toBe(true);
  });

  /* ══ WAVE 7 — ba trục mới của một dòng element ══════════════════════════════
     Ba ca dưới khoá đúng ba thứ chủ sản phẩm xin và ba thứ hỏng thì KHÔNG CÓ GÌ BÁO:
     danh từ thuần trong `spec`, đục nền kéo theo `matte`, cỡ đi vào `skel`. */

  it("tấm Bộ UI: canvas VUÔNG + cell_hint 1:1, `orient` vẫn còn cho engine đời cũ", () => {
    const ui = composerToContract(full(), { presets: PRESETS }).sheets.find((s) => s.id === "ui")!;
    expect(ui.canvas).toBe("square");
    expect(ui.cell_hint).toBe(HINT_SQUARE);
    /* Lưới n×n trên canvas vuông ⇒ ô 1:1, đúng thứ "canvas lưới UI 1:1" đòi. */
    expect(ui.grid.cols).toBe(ui.grid.rows);
    expect(ui.orient).toBe("landscape");
  });

  it("spec của ô là DANH TỪ THUẦN — không còn câu mô tả thuộc tính", () => {
    const ui = composerToContract(full(), { presets: PRESETS }).sheets.find((s) => s.id === "ui")!;
    for (const preset of PRESETS.elements) {
      /* Danh mục hạt giống KHÔNG được mang mạo từ hay tính từ thẩm mỹ. Đây là ca
         bắt được đúng lời than "a rounded background panel for a dialog". */
      expect(preset.en.startsWith("a "), preset.id).toBe(false);
      expect(preset.en.split(" ").length, preset.id).toBeLessThanOrEqual(3);
    }
    expect(ui.components[0]!.spec.startsWith("button,")).toBe(true);
    expect(ui.components[0]!.spec).not.toContain("centered label");
  });

  it("đục nền kéo theo CÁCH TÁCH: `matte` + câu alpha, không phải chỉ chữ", () => {
    const ui = composerToContract(full(), { presets: PRESETS }).sheets.find((s) => s.id === "ui")!;
    const glassy = ui.components[0]!;
    /* Nửa PROMPT… */
    expect(glassy.spec).toContain("alpha about 64 of 255");
    /* …và nửa SLICER. Thiếu nửa này thì máy vẽ ra kính đục và slice cắt như mảng đặc. */
    expect(glassy.skel.matte).toBe("glass");
    /* Ô không chọn đục nền ⇒ KHÔNG mọc `matte` (không âm thầm hạ chất lượng tách). */
    expect(ui.components[1]!.skel.matte).toBeUndefined();
  });

  it("chất liệu ĐỜI CŨ được dịch sang đục nền, không rơi mất và không nói chữ thẩm mỹ", () => {
    expect(glazeFromMaterial("ice")).toBe("ice");
    expect(glazeFromMaterial("fire")).toBe("glow");
    expect(glazeFromMaterial("glass")).toBe("glass");
    /* Gỗ/đá/kim loại là THẨM MỸ ⇒ về "nền đặc": thẩm mỹ nay do prompt tổng lo. */
    expect(glazeFromMaterial("wood")).toBe("");
    expect(glazeFromMaterial("gold-metal")).toBe("");
    const legacySpec = resolveElementSpec({ spec: "coin icon", skel: { shape: "rrect" } }, { material: "ice" });
    expect(legacySpec).toContain("alpha about 128 of 255");
    expect(legacySpec).not.toContain("glacial");
  });

  it("cỡ safe zone → skel.w/h theo Ô THẬT của lưới, kẹp trần 1", () => {
    const ui = composerToContract(full(), { presets: PRESETS }).sheets.find((s) => s.id === "ui")!;
    /* Lưới 2×2 trên canvas 1254 ⇒ ô 627px; "XL · 304px" ⇒ 304/627 ≈ 0.485. */
    const cellPx = SQUARE_CANVAS_PX / ui.grid.cols;
    const xl = SIZE_PRESETS.find((p) => p.id === "xl")!;
    expect(ui.components[1]!.skel.w).toBeCloseTo(xl.w / cellPx, 2);
    expect(ui.components[1]!.skel.h).toBeCloseTo(xl.h / cellPx, 2);
    /* Không chọn cỡ ⇒ GIỮ khung mặc định — một lượt sửa không được đổi kích thước
       những dòng người dùng đã vẽ xong. */
    expect(ui.components[0]!.skel.w).toBe(0.8);
    expect(ui.components[0]!.skel.h).toBe(0.6);
  });

  it("cỡ TỰ ĐIỀN: chuỗi `<w>x<h>` px vào skel, và cỡ to hơn ô thì kẹp về tràn ô", () => {
    const cells: UiCell[] = [
      { id: "c1", elementId: "panel", styleId: "", decor: "4", glazeId: "", sizeId: "120x80", note: "" },
      { id: "c2", elementId: "panel", styleId: "", decor: "4", glazeId: "", sizeId: "9999x9999", note: "" },
    ];
    const ui = composerToContract(state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }), {
      presets: PRESETS,
    }).sheets[0]!;
    const cellPx = SQUARE_CANVAS_PX / ui.grid.cols;
    expect(ui.components[0]!.skel.w).toBeCloseTo(120 / cellPx, 2);
    expect(ui.components[0]!.skel.h).toBeCloseTo(80 / cellPx, 2);
    /* V-06 cấm `w`/`h` > 1 ⇒ phải kẹp, không được ném: người điền 9999 muốn "tràn ô". */
    expect(ui.components[1]!.skel.w).toBe(1);
    expect(ui.components[1]!.skel.h).toBe(1);
    expect(() => contractSchema.parse(ui)).not.toThrow();
  });

  it("element TỰ ĐẶT TÊN: file id an toàn + spec là chính danh từ người dùng gõ", () => {
    const custom = { id: "tu-dat-khung-nhiem-vu", vi: "Khung nhiệm vụ", en: "Khung nhiệm vụ", decor: 4, glazeId: "", sizeId: "" };
    const presets = { ...PRESETS, elements: [...PRESETS.elements, custom] };
    const cells: UiCell[] = [
      { id: "c1", elementId: custom.id, styleId: "", decor: "1", glazeId: "", sizeId: "", note: "" },
    ];
    const ui = composerToContract(state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }), {
      presets,
    }).sheets[0]!;
    const cell = ui.components[0]!;
    /* Tên file phải khớp `^[0-9]{2}-[a-z0-9-]+$` (V-01) — dấu tiếng Việt mà lọt vào
       đây thì agent TỪ CHỐI GHI cả contract, im lặng với người dùng. */
    expect(cell.file).toMatch(/^[0-9]{2}-[a-z0-9-]+$/);
    expect(cell.file).toBe("01-tu-dat-khung-nhiem-vu");
    expect(cell.vi).toBe("Khung nhiệm vụ");
    expect(cell.spec.startsWith("Khung nhiệm vụ,")).toBe(true);
    expect(() => contractSchema.parse(ui)).not.toThrow();
  });

  it("prompt tổng phong cách = ĐÚNG `variant.style`, không phải một bản ghép thứ hai", () => {
    const composer = full();
    const contract = composerToContract(composer, { presets: PRESETS, kitName: "Kit Tết" });
    expect(composerStyleLine(composer, { presets: PRESETS, kitName: "Kit Tết" })).toBe(contract.variants![0]!.style);
  });

  it("block Nhân vật: dáng lấy câu của POSE_SPEC và nét mặt vào đúng chỗ", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    const cell = contract.sheets.find((s) => s.id === "nhan-vat")!.components[0]!;
    expect(cell.skel.shape).toBe("pose");
    expect(cell.skel.pose).toBe("idle");
    expect(cell.spec).toContain("neutral relaxed idle pose");
    expect(cell.spec).toContain(EXPRESSIONS[0]!.value);
    /* Pill trang phục để TRỐNG ⇒ kế thừa theme chung, không biến mất. */
    expect(cell.spec).toContain(`wearing ${OUTFIT_THEMES[0]!.value}`);
    expect(cell.spec).toContain("full body");
  });

  it("chế độ TỰ DO ⇒ promptOverride (thay trọn prompt), KHÔNG phải directive", () => {
    const doc = withExtraText(backgroundDoc(), " với cá chép vàng bơi ngang");
    const contract = composerToContract(
      state({ blocks: [{ id: "b1", kind: "background", mode: "free", doc }] }),
      { presets: PRESETS },
    );
    const sheet = contract.sheets[0]!;
    expect(sheet.promptOverride).toContain("cá chép vàng");
    expect(sheet.promptOverride).toContain(phraseOf("scene", "main-menu", PRESETS));
    expect(sheet.directive).toBeUndefined();
  });

  it("chế độ template + chữ gõ THÊM ⇒ directive, và chỉ phần gõ thêm", () => {
    const doc = withExtraText(backgroundDoc(), " thêm mấy con cá chép");
    const contract = composerToContract(
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc }] }),
      { presets: PRESETS },
    );
    const sheet = contract.sheets[0]!;
    expect(sheet.directive).toBe("thêm mấy con cá chép");
    expect(sheet.promptOverride).toBeUndefined();
    /* Khung template KHÔNG được lọt vào directive. */
    expect(sheet.directive).not.toContain("Vẽ cảnh nền");
    /* Mô tả ô là TIẾNG ANH thuần, không mang scaffolding tiếng Việt. */
    expect(sheet.components[0]!.spec).not.toContain("không khí");
    expect(sheet.components[0]!.spec).toContain(phraseOf("mood", "festive", PRESETS));
  });

  it("block template không sửa gì ⇒ KHÔNG mọc thêm khoá nào", () => {
    const contract = composerToContract(
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc: backgroundDoc() }] }),
      { presets: PRESETS },
    );
    expect("directive" in contract.sheets[0]!).toBe(false);
    expect("promptOverride" in contract.sheets[0]!).toBe(false);
    expect("ref" in contract.sheets[0]!).toBe(false);
  });

  it("pill lạ chèn bằng `/` KHÔNG bị thả rơi", () => {
    const doc = backgroundDoc();
    const para = doc.content![0]!;
    para.content!.push({ type: NODE.optionPill, attrs: { kind: "material", value: "gold-metal" } });
    const contract = composerToContract(
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc }] }),
      { presets: PRESETS },
    );
    expect(contract.sheets[0]!.components[0]!.spec).toContain(
      MATERIAL_PRESETS.find((m) => m.id === "gold-metal")!.en,
    );
  });

  it("màn trống ⇒ contract hợp lệ, không tấm nào — không sinh tấm ma", () => {
    const contract = composerToContract(state(), { presets: PRESETS });
    expect(contract.sheets).toEqual([]);
    expect(contract.characterPoses).toEqual([]);
    expect(contract.variants?.[0]?.characters).toBeUndefined();
    expect(() => contractSchema.parse(contract)).not.toThrow();
  });

  it("nhiều block cùng loại ⇒ id nối tiếp kiểu styles.json (nen, nen2), không trùng", () => {
    const blocks: Block[] = [
      { id: "b1", kind: "background", mode: "template", doc: backgroundDoc() },
      { id: "b2", kind: "background", mode: "template", doc: backgroundDoc() },
      { id: "m1", kind: "mascot", mode: "template", doc: mascotDoc() },
      { id: "m2", kind: "mascot", mode: "template", doc: mascotDoc() },
    ];
    const contract = composerToContract(state({ blocks }), { presets: PRESETS });
    expect(contract.sheets.map((s) => s.id)).toEqual(["nen", "nen2", "nhan-vat", "nhan-vat2"]);
  });

  it("quá trần ô ⇒ tách thành nhiều tấm, mỗi tấm lưới vuông đủ ô", () => {
    const cells: UiCell[] = Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      elementId: "button",
      styleId: "",
      decor: "4",
      glazeId: "",
      sizeId: "",
      note: "",
    }));
    const contract = composerToContract(state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }), {
      presets: PRESETS,
      limits: { small: 4 },
    });
    expect(contract.sheets.map((s) => s.id)).toEqual(["ui", "ui2"]);
    for (const sheet of contract.sheets) {
      expect(sheet.components).toHaveLength(sheet.grid.cols * sheet.grid.rows);
    }
  });
});

describe("ảnh của pill — không còn blob:, và không có đường thoát ra khỏi project", () => {
  it("attr đời cũ (`refs: [{url: blob:…}]`) đọc ra ảnh RỖNG, không giả vờ còn ảnh", () => {
    expect(readPillImage({ refs: [{ id: "1", name: "a.png", url: "blob:abc" }] })).toEqual(EMPTY_PILL_IMAGE);
  });

  it("đường dẫn có `..`, `/` đứng đầu hay thư mục con ⇒ BỊ LOẠI, không bị 'sửa cho hợp lệ'", () => {
    for (const path of ["refs/../gen.sh", "/etc/passwd", "refs/sub/dir.png", "..", ""]) {
      expect(readPillImage({ refName: "x", path }).path).toBe("");
    }
    expect(readPillImage({ refName: "char-lan.png", path: "refs/char-lan.png" })).toEqual({
      refName: "char-lan.png",
      path: "refs/char-lan.png",
    });
    /* Tên trần (agent trả `name`) vẫn được chuẩn hoá về `refs/<tên>`. */
    expect(readPillImage({ refName: "", path: "char-lan.png" })).toEqual({
      refName: "char-lan.png",
      path: "refs/char-lan.png",
    });
  });

  it("dataURL → File: giải mã tay, đuôi tệp khớp MIME (đường của capturePoseRef)", () => {
    /* PNG 1×1 thật, base64 — dùng byte thật để phép giải mã được kiểm, không phải mock. */
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = dataUrlToFile(png, "dang-dung");
    expect(file.name).toBe("dang-dung.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBeGreaterThan(60);
    expect(() => dataUrlToFile("khong-phai-data-url", "x")).toThrow();
    expect(() => dataUrlToFile("data:image/gif;base64,AAAA", "x")).toThrow(/GIF|gif|không nhận/);
  });

  it("prompt xem trước vẫn chạy: chỉ ảnh CÓ THẬT mới được đánh số", () => {
    const s = state({
      blocks: [
        { id: "b1", kind: "background", mode: "template", doc: withImage(backgroundDoc(), "inspo-1.png") },
        { id: "m1", kind: "mascot", mode: "template", doc: mascotDoc() },
      ],
    });
    const out = serializeComposer(s, PRESETS);
    expect(out).toContain("[ảnh tham chiếu 1]");
    /* Hai pill ảnh của câu Nhân vật chưa chọn ảnh ⇒ móc KHÔNG số. */
    expect(out).toContain("[ảnh tham chiếu]");
    expect(out).not.toContain("[ảnh tham chiếu 2]");
    expect(countComposerImages(s)).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   NGỮ CẢNH CHUNG Ở CHẾ ĐỘ TỰ DO
   ══════════════════════════════════════════════════════════════════════════
   Câu này đi vào `variant.style` — mệnh đề mà `gen.sh` chèn vào MỌI tấm. Nếu
   chữ người dùng gõ không tới được đó thì họ gõ vào hư không: màn hình vẫn hiện
   câu của họ, còn máy vẽ nhận câu ghép sẵn. Hỏng kiểu trông-như-đang-chạy. */
describe("ngữ cảnh chung tự do → variant.style", () => {
  /** Câu ngữ cảnh có người dùng viết thêm một mệnh đề của riêng họ. */
  const written = (extra: string): JSONContent => {
    const doc = contextDoc({ themeValue: OUTFIT_THEMES[0]!.value, styleId: PRESETS.styles[0]!.id });
    const para = doc.content![0]!;
    return { ...doc, content: [{ ...para, content: [...(para.content ?? []), { type: "text", text: extra }] }] };
  };

  const freeState = (extra: string) =>
    state({
      brandColors: ["#ff5533", "#112233"],
      contextMode: "free",
      contextDoc: written(extra),
    });

  it("câu người dùng gõ ĐI VÀO variant.style", () => {
    const contract = composerToContract(freeState(" tiết chế, như poster phim 80s"), { presets: PRESETS });
    expect(contract.variants![0]!.style).toContain("tiết chế, như poster phim 80s");
  });

  it("pill trong câu vẫn ra cụm TIẾNG ANH, và dãy màu vẫn thành chữ", () => {
    const style = composerToContract(freeState(""), { presets: PRESETS }).variants![0]!.style;
    expect(style).toContain(PRESETS.styles[0]!.en);
    expect(style).toContain(OUTFIT_THEMES[0]!.value);
    /* `brandPill` là node RỖNG — chữ phải đến từ `SerializeContext.brandColors`,
       nên nếu ai đó quên nối dây ấy thì mã màu biến mất khỏi câu. */
    expect(style).toContain("#ff5533");
  });

  it("hex VẪN đi vào brand.primary/secondary — hai đường khác nhau, không thay nhau", () => {
    const variant = composerToContract(freeState("gì đó"), { presets: PRESETS }).variants![0]!;
    expect(variant.brand?.primary).toBe("#ff5533");
    expect(variant.brand?.secondary).toBe("#112233");
  });

  it("KHÔNG nuốt `styleAxes`/`avoid` — câu tự do chỉ thay phần mô tả bộ kit", () => {
    const contract = composerToContract(freeState("câu của tôi"), {
      presets: PRESETS,
      styleAvoid: "chữ nhỏ, hoa văn rối",
    });
    const style = contract.variants![0]!.style;
    expect(style).toContain("câu của tôi");
    /* Hai thiết lập này đến từ chỗ khác trên màn; người dùng vẫn thấy chúng,
       nên chúng phải còn trong prompt. */
    expect(style).toContain("avoid: chữ nhỏ, hoa văn rối");
  });

  it("câu tự do RỖNG ⇒ lùi về bản ghép, không gửi đi một bộ kit không phong cách", () => {
    const empty = state({ contextMode: "free", contextDoc: { type: "doc", content: [] } });
    const style = composerToContract(empty, { presets: PRESETS }).variants![0]!.style;
    expect(style).toContain(PRESETS.styles[0]!.en);
  });

  it("chế độ khuôn KHÔNG đọc `contextDoc` — câu cũ nằm đó cũng không lọt vào", () => {
    const kept = state({ contextMode: "template", contextDoc: written(" câu cũ còn sót") });
    expect(composerToContract(kept, { presets: PRESETS }).variants![0]!.style).not.toContain("câu cũ còn sót");
  });

  it("prompt copy ra ChatGPT nói CÙNG một điều với contract", () => {
    const line = serializeComposer(freeState(" tiết chế hết mức"), PRESETS);
    expect(line).toContain("tiết chế hết mức");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   CỨU HỘ PILL MẤT ATTRS, NGAY TRÊN ĐƯỜNG ĐỌC TÀI LIỆU
   ══════════════════════════════════════════════════════════════════════════ */
describe("migrateComposerDoc — chữa tài liệu đã lưu với pill `{kind: null}`", () => {
  /** Đúng hình dạng đọc được từ `workflow-draft.json` của dự án đang hỏng. */
  const nullPills = (count: number): JSONContent => ({
    type: "doc",
    content: [{
      type: "paragraph",
      content: Array.from({ length: count }, () => ({ type: NODE.optionPill, attrs: { kind: null, value: null } })),
    }],
  });

  const saved = (composer: unknown) => ({ docVersion: COMPOSER_DOC_VERSION, updatedAt: "", composer });

  it("ô của block Bộ UI: lấy lại CẢ kind lẫn value từ ba trường có cấu trúc", () => {
    const doc = migrateComposerDoc(
      saved({
        blocks: [{
          id: "u1", kind: "uikit", mode: "free",
          cells: [{ id: "c1", elementId: "coin", styleId: "", decor: "2", materialId: "ice", note: "", doc: nullPills(3) }],
        }],
      }),
      PRESETS,
    );
    const cell = (doc.composer.blocks[0] as { cells: UiCell[] }).cells[0]!;
    const pills = (cell.doc as JSONContent).content![0]!.content!;
    expect(pills.map((p) => p.attrs!["kind"])).toEqual(["style", "glaze", "decor"]);
    /* `materialId: "ice"` của bản nháp cũ đã được DỊCH sang đục nền trước khi vào
       phép cứu hộ — nếu truyền id chất liệu thô thì pill `glaze` nhận một giá trị
       lạ và lựa chọn rụng khỏi prompt mà không ai báo. */
    expect(pills.map((p) => p.attrs!["value"])).toEqual(["", "ice", "2"]);
    expect(cell.glazeId).toBe("ice");
  });

  it("câu Cảnh nền: lấy lại được kind, còn value thì để RỖNG chứ không bịa", () => {
    const doc = migrateComposerDoc(
      saved({ blocks: [{ id: "b1", kind: "background", mode: "free", doc: nullPills(2) }] }),
      PRESETS,
    );
    const pills = ((doc.composer.blocks[0] as { doc: JSONContent }).doc).content![0]!.content!;
    expect(pills.map((p) => p.attrs!["kind"])).toEqual(["scene", "mood"]);
    /* Giá trị người dùng từng chọn đã mất thật. Điền một mặc định vào đây là đặt
       một lựa chọn họ chưa từng bấm vào prompt sắp tiêu lượt vẽ. */
    expect(pills.map((p) => p.attrs!["value"])).toEqual(["", ""]);
  });

  it("câu Ngữ cảnh chung cũng đi qua cùng phép cứu hộ", () => {
    const doc = migrateComposerDoc(saved({ contextMode: "free", contextDoc: nullPills(2) }), PRESETS);
    const pills = (doc.composer.contextDoc as JSONContent).content![0]!.content!;
    expect(pills.map((p) => p.attrs!["kind"])).toEqual(["theme", "style"]);
  });

  it("dự án đời trước (chưa có `contextMode`) đọc ra `template`, không tự bật tự do", () => {
    const doc = migrateComposerDoc(saved({ blocks: [] }), PRESETS);
    expect(doc.composer.contextMode).toBe("template");
    expect(doc.composer.contextDoc).toBeUndefined();
  });
});
