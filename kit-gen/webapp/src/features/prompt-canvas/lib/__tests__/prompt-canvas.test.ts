import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";

import { contractJobs, contractSchema } from "@/lib/types/contract";
import { HINT_SQUARE, MAIN_VARIANT_ID, resolveElementSpec } from "@/features/kit-core/lib/kitset-to-contract";
import { glazeFromMaterial, glazePhrase } from "@/features/kit-core/lib/glaze";
import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { EXPRESSIONS, OUTFIT_THEMES } from "@/features/kit-core/lib/poses";

import { SIZE_PRESETS, SQUARE_CANVAS_PX, SYSTEM_SIZE_VALUE } from "@/features/prompt-lab/lib/cell-size";
import { seedPresets } from "@/features/prompt-lab/lib/presets-store";
import { backgroundDoc, contextDoc, mascotDoc } from "@/features/prompt-lab/lib/doc-templates";
import { NODE } from "@/features/prompt-lab/lib/schema";
import { phraseOf } from "@/features/prompt-lab/lib/pill-registry";
import { countComposerImages, serializeComposer } from "@/features/prompt-lab/lib/serialize-composer";
import { newMascotPose, type Block, type ComposerState, type MascotBlock, type MascotPose, type UiCell } from "@/features/prompt-lab/lib/composer-model";

import { COMPOSER_DOC_VERSION, emptyComposerDoc, migrateComposerDoc, type ComposerDoc } from "../composer-doc";
import { composerBlockSheets, composerStyleLine, composerToContract } from "../composer-to-contract";
import { drawableBlockIds, lotsOf, sheetsHash } from "../block-jobs";
import { sameColors, swapBrandRefs } from "../brand-binding";
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
  themeCustom: "",
  styleCustom: "",
  brandId: "",
  contextRefs: [],
  brandAssets: {},
  contextMode: "template",
  blocks: [],
  ...partial,
});

/**
 * Thẻ Nhân vật ở hình dạng MỚI: một câu danh tính + một danh sách dáng.
 *
 * Mặc định MỘT dáng, vì phần lớn ca ở đây kiểm ô đầu tiên — nhưng nó là một
 * MẢNG, nên ca nào cần tấm nhiều ô thì truyền thêm dáng vào chứ không phải dựng
 * một thẻ khác kiểu.
 */
function mascotBlock(id: string, doc: JSONContent, poses: MascotPose[] = [newMascotPose()]): MascotBlock {
  return { id, kind: "mascot", mode: "template", doc, poses };
}

/** Nối thêm một mẩu chữ vào cuối câu template — đúng thứ người dùng gõ thêm. */
function withExtraText(doc: JSONContent, extra: string): JSONContent {
  const para = doc.content?.[0];
  return {
    ...doc,
    content: [{ ...para, content: [...(para?.content ?? []), { type: "text", text: extra }] }],
  };
}

/**
 * Đặt ảnh (đã tải lên) vào pill MANG ẢNH đầu tiên của tài liệu.
 *
 * Hai loại node cùng mang ảnh từ 09/2026: `imagePill` (ảnh của thẻ Cảnh nền) và
 * `optionPill` có ảnh riêng (theme · phong cách · nhân vật). Helper phải biết cả
 * hai, nếu không mỗi câu lại cần một helper — và ca test sẽ đo hai đường khác
 * nhau cho cùng một luật.
 */
function withImage(doc: JSONContent, refName: string): JSONContent {
  let done = false;
  const walk = (node: JSONContent): JSONContent => {
    if (done) return node;
    /* Ba chỗ nhận ảnh trong ba câu khởi điểm: node ảnh RỜI (bản nháp đời trước),
       pill NHÂN VẬT (→ `sheet.ref`) và pill BỐ CỤC của thẻ Background
       (→ `sheet.layoutRef`). Câu Background KHÔNG còn node ảnh rời từ 09/2026. */
    const takes =
      node.type === NODE.imagePill ||
      (node.type === NODE.optionPill && (node.attrs?.["kind"] === "mascot" || node.attrs?.["kind"] === "layout"));
    if (takes) {
      done = true;
      return { ...node, attrs: { ...node.attrs, refName, path: `refs/${refName}` } };
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
          { id: "b1", kind: "background", mode: "free", doc: backgroundDoc(), note: "" },
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

  /**
   * ╔══ THẺ NHÂN VẬT ĐỜI TRƯỚC: MỘT CÂU, MỘT DÁNG ═════════════════════════════╗
   * ║ Bản nháp cũ lưu thẻ Nhân vật như một `DocBlock`: câu mad-lib «Tạo nhân    ║
   * ║ vật [ảnh] với dáng [⌄] (hoặc ảnh dáng [ảnh]), biểu cảm [⌄], trang phục    ║
   * ║ [⌄].» + `poseView` + bảng `poseRefs`. Hình dạng ấy KHÔNG dựng lại được    ║
   * ║ từ mã hiện tại nữa, nên nó được gõ tay ở đây — đúng vai của một ca        ║
   * ║ migrate: dữ liệu cũ là DỮ LIỆU, không phải thứ sinh ra từ template mới.    ║
   * ╚═══════════════════════════════════════════════════════════════════════════╝
   */
  const legacyMascotDraft = () => ({
    docVersion: COMPOSER_DOC_VERSION,
    updatedAt: "2026-08-30T09:00:00.000Z",
    composer: {
      ...state(),
      blocks: [
        {
          id: "m-cu",
          kind: "mascot",
          mode: "template",
          poseView: "side-right",
          poseRefs: { "wave|side-right": "refs/pose-wave-side-right.png", "idle|front": "refs/thua.png" },
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Tạo nhân vật " },
                  { type: NODE.imagePill, attrs: { refName: "lan.png", path: "refs/lan.png" } },
                  { type: "text", text: " với dáng " },
                  { type: NODE.optionPill, attrs: { kind: "pose", value: "wave" } },
                  { type: "text", text: " (hoặc ảnh dáng " },
                  { type: NODE.imagePill, attrs: { refName: "manocanh.png", path: "refs/manocanh.png" } },
                  { type: "text", text: "), biểu cảm " },
                  { type: NODE.optionPill, attrs: { kind: "expression", value: EXPRESSIONS[1]!.value } },
                  { type: "text", text: ", trang phục " },
                  { type: NODE.optionPill, attrs: { kind: "outfit", value: OUTFIT_THEMES[1]!.value } },
                  { type: "text", text: "." },
                ],
              },
            ],
          },
        },
      ],
    },
  });

  it("thẻ Nhân vật MỘT DÁNG đời trước ⇒ thẻ nhiều dáng, không mất mảnh nào", () => {
    const block = migrateComposerDoc(legacyMascotDraft(), PRESETS).composer.blocks[0] as MascotBlock;
    expect(block.kind).toBe("mascot");
    expect(block.id).toBe("m-cu");

    /* Dáng + góc + nét mặt xuống ĐÚNG MỘT dòng, và ảnh manơcanh cũ của đúng cặp
       (dáng|góc) ấy được nhận lại — không phải chụp lại từ đầu. */
    expect(block.poses).toHaveLength(1);
    expect(block.poses[0]).toMatchObject({
      pose: "wave",
      view: "side-right",
      expression: EXPRESSIONS[1]!.value,
      refPath: "refs/pose-wave-side-right.png",
    });

    /* Câu đầu giữ ẢNH NHÂN VẬT và TRANG PHỤC — hai thứ đúng cho cả tấm. */
    const head = JSON.stringify(block.doc);
    expect(head).toContain("refs/lan.png");
    expect(head).toContain(OUTFIT_THEMES[1]!.value);
    /* Ảnh manơcanh cũ KHÔNG được bê vào câu: nó là ảnh chụp rời, sai bố cục so
       với tấm ghép mà `ensurePoseRefs` dựng theo lưới. */
    expect(head).not.toContain("refs/manocanh.png");
    /* Dáng và nét mặt KHÔNG còn ở câu đầu — chúng đã xuống dòng. */
    expect(head).not.toContain('"pose"');
    expect(head).not.toContain('"expression"');
  });

  it("thẻ Nhân vật đời mới đọc lại nguyên vẹn, kể cả tấm ảnh dáng đã ghép", () => {
    const row = { ...newMascotPose("wave"), refPath: "refs/pose-wave.png", note: "tay phải giơ cao" };
    const doc: ComposerDoc = {
      docVersion: COMPOSER_DOC_VERSION,
      updatedAt: "2026-09-01T00:00:00.000Z",
      composer: state({
        blocks: [{ ...mascotBlock("m1", mascotDoc(), [row]), poseSheet: { key: "k1", paths: ["refs/tam-dang.png"] } }],
      }),
    };
    const back = migrateComposerDoc(JSON.parse(JSON.stringify(doc)), PRESETS).composer.blocks[0] as MascotBlock;
    expect(back.poses).toEqual([row]);
    expect(back.poseSheet).toEqual({ key: "k1", paths: ["refs/tam-dang.png"] });
  });
});

describe("composerToContract — kết quả phải QUA ĐƯỢC schema contract", () => {
  const full = (): ComposerState =>
    state({
      brandColors: ["#ff5533", "#112233"],
      blocks: [
        { id: "b1", kind: "background", mode: "template", doc: withImage(backgroundDoc(), "inspo-1.png"), note: "" },
        {
          id: "u1",
          kind: "uikit",
          mode: "template",
          cells: [
            { id: "c1", elementId: "button", styleId: "", decor: "4", glazeId: "glass", sizeId: "", note: "bo góc to" },
            { id: "c2", elementId: "coin", styleId: "match3", decor: "2", glazeId: "", sizeId: "xl", note: "" },
          ],
        },
        mascotBlock("m1", withImage(mascotDoc(), "char-lan.png")),
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

  it("câu theme tổng đi vào variant.style, KHÔNG lặp ở từng ô", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    const style = contract.variants![0]!.style;
    expect(style).toContain(PRESETS.styles[0]!.en);
    /* Cụm CỦA BỘ KIT (mô-típ, màu, biểu tượng), KHÔNG phải cụm trang phục: chuỗi
       này được `gen.sh` in vào `## Art style` của MỌI tấm, mà 15/16 tấm không có
       người nào mặc gì cả. Xem `ThemeOption.kitEN`. */
    expect(style).toContain(OUTFIT_THEMES[0]!.kitEN);
    expect(style).not.toContain("outfit");
    expect(contract.variants![0]!.brand?.primary).toBe("#ff5533");
    expect(contract.variants![0]!.brand?.secondary).toBe("#112233");
    for (const sheet of contract.sheets) {
      for (const c of sheet.components) expect(c.spec).not.toContain("#ff5533");
    }
  });

  /**
   * BẢNG MÀU NÓI MỘT LẦN, VÀ CHỖ ẤY LÀ `brand` — không phải `style`.
   *
   * Chủ sản phẩm đọc prompt thật: *"khá dài dòng và không chuẩn"*. Đo được: cùng
   * một bảng màu xuất hiện ba lần trong một prompt — câu tả màu bằng chữ nối vào
   * `variant.style`, dòng "Brand palette:", rồi khối COLOUR AUTHORITY. Nay chỉ còn
   * section `## Palette` dựng từ hex ở `brand`. Ca này canh chiều DỄ HỎNG LẠI: ai
   * đó nối `describeBrandColors` về `style` cho "đầy đủ" là ba lần nói lại ngay.
   */
  it("mã màu KHÔNG còn nối vào variant.style — palette chỉ nói ở một chỗ", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    const style = contract.variants![0]!.style;
    expect(style).not.toContain("#ff5533");
    expect(style).not.toContain("dominant brand colour");
    /* Nhưng hex vẫn PHẢI tới máy vẽ — qua `brand`, nguyên vẹn. */
    expect(contract.variants![0]!.brand?.primary).toBe("#ff5533");
  });

  /**
   * TRỤC Ở NẤC GIỮA = người dùng chưa kéo gì. Tám mệnh đề trung tính ("balanced in
   * age", "timeless", "medium outline") đứng cạnh một câu phong cách thật thì
   * chúng thắng bằng số đông, và prompt dài gấp đôi mà không nói thêm điều gì.
   */
  it("trục phong cách ở nấc giữa KHÔNG lọt vào variant.style", () => {
    const style = composerToContract(full(), { presets: PRESETS }).variants![0]!.style;
    for (const phrase of ["balanced in age", "balanced energy", "timeless", "medium outline", "gender-neutral"]) {
      expect(style, phrase).not.toContain(phrase);
    }
  });

  /**
   * Ba trục TẢ NGƯỜI chỉ được in ở tấm nhân vật. Chúng vào `variant.style` là dán
   * "clearly feminine" lên mọi cái nút của bộ kit.
   */
  it("trục tuổi/giới/năng lượng: vào ô dáng, KHÔNG vào variant.style", () => {
    const axes = { age: 4, energy: 4, lux: 4, era: 4, gender: 7, detail: 4, outline: 4, ornament: 4 } as const;
    const contract = composerToContract(full(), { presets: PRESETS, styleAxes: { ...axes } });
    const soft = "soft feminine character";
    expect(contract.variants![0]!.style).not.toContain(soft);
    expect(contract.sheets.find((s) => s.id === "nhan-vat")!.components[0]!.spec).toContain(soft);
    expect(contract.sheets.find((s) => s.id === "ui")!.components[0]!.spec).not.toContain(soft);
  });

  it("ảnh của pill → sheet.ref, đường dẫn TƯƠNG ĐỐI refs/…", () => {
    const contract = composerToContract(full(), { presets: PRESETS });
    /* Ảnh của pill BỐ CỤC đi ra `layoutRef` chứ KHÔNG ra `ref`: `ref` của tấm nền
       nghĩa là "vẽ ra cảnh này", còn bản phác bố cục chỉ nói chỗ đặt. Lẫn hai
       trường là máy vẽ chép luôn nét nguệch ngoạc của bản phác. */
    expect(contract.sheets.find((s) => s.id === "nen")?.layoutRef).toBe("refs/inspo-1.png");
    expect(contract.sheets.find((s) => s.id === "nen")?.ref).toBeUndefined();
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
      state({ blocks: [{ id: "b1", kind: "background", mode: "free", doc, note: "" }] }),
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
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc, note: "" }] }),
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
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc: backgroundDoc(), note: "" }] }),
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
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc, note: "" }] }),
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
      { id: "b1", kind: "background", mode: "template", doc: backgroundDoc(), note: "" },
      { id: "b2", kind: "background", mode: "template", doc: backgroundDoc(), note: "" },
      mascotBlock("m1", mascotDoc()),
      mascotBlock("m2", mascotDoc()),
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
        { id: "b1", kind: "background", mode: "template", doc: withImage(backgroundDoc(), "inspo-1.png"), note: "" },
        mascotBlock("m1", mascotDoc()),
      ],
    });
    const out = serializeComposer(s, PRESETS);
    expect(out).toContain("[ảnh tham chiếu 1]");
    /* Pill NHÂN VẬT chưa chọn ảnh ⇒ KHÔNG móc nào cả. Bản trước để lại một móc
       không số cho pill ảnh rỗng; nay pill rỗng nghĩa là chưa có nguồn nào, và
       hứa một tấm đính kèm không tồn tại là nói dối người sắp dán prompt đi. */
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
    /* Pill THEME ra cụm của BỘ KIT, không ra cụm trang phục — xem `ThemeOption.kitEN`. */
    expect(style).toContain(OUTFIT_THEMES[0]!.kitEN);
    /* `brandPill` là node RỖNG — chữ phải đến từ `SerializeContext.brandColors`,
       nên nếu ai đó quên nối dây ấy thì mã màu biến mất khỏi câu.
       Ở ĐÂY hex vẫn đúng chỗ dù bản ghép tự động đã bỏ nó: người dùng TỰ ĐẶT node
       màu vào câu của họ, và chữ họ viết ra thì không ai được cắt. */
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
      saved({ blocks: [{ id: "b1", kind: "background", mode: "free", doc: nullPills(2), note: "" }] }),
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

/* ══════════════════════════════════════════════════════════════════════════
   ④ BA NGẢ CỦA PILL · THƯƠNG HIỆU · ẢNH CẤP BỘ KIT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ba đường mới mở ra ba cách hỏng IM LẶNG, và đó là lý do chúng có ca riêng:
 *  · chữ tự gõ (`custom`) — quên một nhánh là chữ người dùng viết rụng khỏi
 *    prompt SAU KHI họ đã đọc thấy nó trên pill;
 *  · `contextRefs` — một tấm ảnh đính vào câu mà không tới `inspo`/`brand.refs`
 *    thì nó nằm trên màn, chiếm chỗ, và không bao giờ tới máy vẽ;
 *  · di trú — bản nháp lưu trước lượt này KHÔNG có bốn trường mới, và một giá
 *    trị đoán ở đó là đổ màu của một thương hiệu người dùng chưa từng chọn.
 */
describe("chữ tự gõ thắng preset, và đi NGUYÊN VĂN", () => {
  const CUSTOM = "kiểu tranh khắc gỗ Đông Hồ, nét thô, giấy điệp";

  it("`themeCustom` thay cụm EN của preset trong `variant.style`", () => {
    const line = composerStyleLine(state({ themeCustom: CUSTOM }), { presets: PRESETS });
    expect(line).toContain(CUSTOM);
    /* Nguyên văn: không dấu nháy bọc ngoài, không nhãn "custom:" nào được thêm. */
    expect(line).not.toContain(`"${CUSTOM}"`);
    expect(line.toLowerCase()).not.toContain("custom:");
    expect(line).not.toContain(phraseOf("theme", OUTFIT_THEMES[0]!.value, PRESETS));
  });

  it("`styleCustom` cũng vậy, và hai chữ tự gõ đứng cạnh nhau được", () => {
    const line = composerStyleLine(state({ themeCustom: "mùa hè biển", styleCustom: CUSTOM }), { presets: PRESETS });
    expect(line).toContain("mùa hè biển");
    expect(line).toContain(CUSTOM);
  });

  it("chữ tự gõ RỖNG ⇒ preset vẫn nói, không rơi về câu trống", () => {
    const line = composerStyleLine(state({ themeCustom: "   " }), { presets: PRESETS });
    expect(line).toContain(phraseOf("theme", OUTFIT_THEMES[0]!.value, PRESETS));
  });

  it("pill TRONG CÂU của một thẻ: `custom` thắng cả luật kế thừa của `outfit`", () => {
    const doc = mascotDoc();
    const para = doc.content![0]!;
    /* Pill `outfit` để trống + có chữ tự gõ: rỗng vốn nghĩa là "theo theme chung",
       nhưng người dùng vừa trả lời câu hỏi ấy bằng chữ của họ. */
    para.content = para.content!.map((node) =>
      node.type === NODE.optionPill && node.attrs!["kind"] === "outfit"
        ? { ...node, attrs: { ...node.attrs, custom: "áo dài gấm đỏ" } }
        : node,
    );
    const contract = composerToContract(state({ blocks: [mascotBlock("m1", doc)] }), { presets: PRESETS });
    const spec = contract.sheets[0]!.components[0]!.spec;
    expect(spec).toContain("áo dài gấm đỏ");
    expect(spec).not.toContain(phraseOf("theme", OUTFIT_THEMES[0]!.value, PRESETS));
  });
});

/**
 * DANH TÍNH NHÂN VẬT — ba nguồn, một chủ ngữ.
 *
 * Đây là chỗ hỏng IM LẶNG nhất của cả lượt này: chủ ngữ sai không làm contract
 * đỏ, không làm test schema đỏ — nó chỉ làm máy vẽ ra một con khác với con người
 * dùng vừa chọn, sau khi đã tiêu một lượt tiền.
 */
describe("pill nhân vật: ba nguồn đều tới được chủ ngữ của mọi ô", () => {
  /** Đặt nguồn cho pill nhân vật của câu đầu thẻ. */
  const withMascot = (attrs: Record<string, unknown>): JSONContent => {
    const doc = mascotDoc();
    const para = doc.content![0]!;
    para.content = para.content!.map((node) =>
      node.type === NODE.optionPill && node.attrs!["kind"] === "mascot"
        ? { ...node, attrs: { ...node.attrs, ...attrs } }
        : node,
    );
    return doc;
  };

  const specOf = (doc: JSONContent) =>
    composerToContract(state({ blocks: [mascotBlock("m1", doc)] }), { presets: PRESETS })
      .sheets[0]!.components[0]!.spec;

  it("GÕ RIÊNG ⇒ chữ người dùng đi NGUYÊN VĂN vào chủ ngữ", () => {
    const spec = specOf(withMascot({ custom: "một chú mèo mướp đội nón lá" }));
    expect(spec).toContain("một chú mèo mướp đội nón lá");
    /* Câu sàn "the same original mascot character" chỉ dành cho ca KHÔNG có
       nguồn nào — còn để lại là hai chủ ngữ đá nhau trong một câu. */
    expect(spec).not.toContain("the same original mascot character");
  });

  it("ĐÍNH ẢNH ⇒ `sheet.ref` + chủ ngữ trỏ vào tấm ảnh, chữ đi KÈM chứ không mất", () => {
    const contract = composerToContract(
      state({
        blocks: [
          mascotBlock(
            "m1",
            withMascot({ custom: "linh vật gấu trúc", path: "refs/lan.png", refName: "lan.png" }),
          ),
        ],
      }),
      { presets: PRESETS },
    );
    const sheet = contract.sheets[0]!;
    expect(sheet.ref).toBe("refs/lan.png");
    const spec = sheet.components[0]!.spec;
    expect(spec).toContain("the SAME character from the reference photo");
    expect(spec).toContain("linh vật gấu trúc");
  });

  /**
   * Bản nháp của lượt trước có thể mang `value` trỏ vào một preset thư viện —
   * danh mục ấy đã bị bỏ (linh vật đi theo thương hiệu, không phải một bảng tra
   * dùng chung). Ca này khoá điều DUY NHẤT được phép xảy ra: nó không đóng góp
   * chữ nào. Đóng góp một cụm EN của một lựa chọn không còn tồn tại là gửi cho
   * máy vẽ một chỉ thị mà màn hình không còn hiện ra ở đâu cả.
   */
  it("`value` sót lại từ danh mục preset đã bỏ ⇒ KHÔNG lọt vào chủ ngữ", () => {
    const preset = PRESETS.mascots[0]!;
    const spec = specOf(withMascot({ value: preset.id }));
    expect(spec).not.toContain(preset.en);
    expect(spec).toContain("the same original mascot character");
  });

  it("KHÔNG nguồn nào ⇒ vẫn có chủ ngữ sàn, tấm không có `ref`", () => {
    const contract = composerToContract(state({ blocks: [mascotBlock("m1", mascotDoc())] }), { presets: PRESETS });
    expect(contract.sheets[0]!.ref).toBeUndefined();
    expect(contract.sheets[0]!.components[0]!.spec).toContain("the same original mascot character");
  });
});

describe("ảnh cấp BỘ KIT đi tới đúng hai cửa của contract", () => {
  it("vai `theme`/`style` → `inspo`, vai `logo` → `brand.refs`", () => {
    const contract = composerToContract(
      state({
        contextRefs: [
          { path: "refs/tet.png", role: "theme" },
          { path: "refs/net-ve.png", role: "style" },
          { path: "refs/logo.png", role: "logo", assetId: "a1" },
        ],
      }),
      { presets: PRESETS },
    );
    const variant = contract.variants![0]!;
    expect(variant.inspo).toEqual(["refs/tet.png", "refs/net-ve.png"]);
    expect(variant.brand!.refs).toEqual(["refs/logo.png"]);
    /* `mode` PHẢI ở lại `colors` kể cả khi đã có logo — bản engine cũ bỏ dòng
       palette khi mode là "image", tức là tải logo lên là mất màu thương hiệu. */
    expect(variant.brand!.mode).toBe("colors");
  });

  it("cùng một tấm khai hai lần ⇒ chỉ đính MỘT lần (một `-i` là một lần tính tiền)", () => {
    const contract = composerToContract(
      state({
        contextRefs: [
          { path: "refs/tet.png", role: "theme" },
          { path: "refs/tet.png", role: "style" },
        ],
      }),
      { presets: PRESETS },
    );
    expect(contract.variants![0]!.inspo).toEqual(["refs/tet.png"]);
  });

  it("tên thương hiệu KHÔNG lọt vào prompt — chỉ màu và logo mới nói lên nó", () => {
    const line = composerStyleLine(state({ brandId: "brand-vinamilk", brandColors: ["#ff5533"] }), { presets: PRESETS });
    expect(line).not.toContain("brand-vinamilk");
  });
});

describe("di trú: bản nháp đời trước không có bốn trường mới", () => {
  const saved = (composer: unknown) => ({ docVersion: COMPOSER_DOC_VERSION, updatedAt: "", composer });

  it("mở được, và mọi trường mới về MẶC ĐỊNH RỖNG — không đoán một thương hiệu nào", () => {
    const doc = migrateComposerDoc(saved({ themeValue: "x", styleId: "y", brandColors: ["#000000"], blocks: [] }), PRESETS);
    expect(doc.composer.themeCustom).toBe("");
    expect(doc.composer.styleCustom).toBe("");
    expect(doc.composer.brandId).toBe("");
    expect(doc.composer.contextRefs).toEqual([]);
    expect(doc.composer.brandAssets).toEqual({});
    /* Thứ CŨ không được đụng vào: một lượt di trú làm mất màu là mất dữ liệu. */
    expect(doc.composer.brandColors).toEqual(["#000000"]);
  });

  it("`contextRefs` rác bị BỎ TỪNG MỤC, không làm hỏng cả tài liệu", () => {
    const doc = migrateComposerDoc(
      saved({
        blocks: [],
        contextRefs: [
          { path: "refs/ok.png", role: "theme" },
          { path: "refs/khong-vai-tro.png" },
          { path: "refs/vai-tro-la.png", role: "mascot" },
          { role: "logo" },
          "rác",
        ],
      }),
      PRESETS,
    );
    expect(doc.composer.contextRefs).toEqual([{ path: "refs/ok.png", role: "theme" }]);
  });

  it("dòng element có `sizeId` rỗng ⇒ VÁ NGAY LÚC ĐỌC thành một con số", () => {
    /* Rỗng là di sản trước 07/09/2026 («theo hệ thống»): nó không phải một cỡ mà
       là 0,8×0,6 của Ô, nên nó ĐỔI khi lưới đổi — thêm một món vào thẻ là mọi
       dòng cũ tự co lại, không ai bấm gì. Vá lúc đọc là chỗ duy nhất vá được một
       lần cho tất cả; vá ở lúc dựng contract thì bản nháp trên đĩa vẫn rỗng và
       màn hình vẫn không nói ra được cỡ nào. */
    const doc = migrateComposerDoc(
      saved({
        blocks: [{
          id: "u1", kind: "uikit", mode: "template",
          cells: [
            { id: "c1", elementId: "button", styleId: "", decor: "4", glazeId: "", sizeId: "", note: "" },
            { id: "c2", elementId: "coin", styleId: "", decor: "2", glazeId: "", sizeId: "xl", note: "" },
          ],
        }],
      }),
      PRESETS,
    );
    const cells = (doc.composer.blocks[0] as { cells: { sizeId: string }[] }).cells;
    expect(cells[0]!.sizeId).toBe(SYSTEM_SIZE_VALUE);
    /* Cỡ người dùng ĐÃ chọn thì không được đụng tới. */
    expect(cells[1]!.sizeId).toBe("xl");
  });

  it("`brandAssets` chỉ nhận cặp chuỗi-chuỗi", () => {
    const doc = migrateComposerDoc(saved({ blocks: [], brandAssets: { a1: "refs/logo.png", a2: 7, a3: "" } }), PRESETS);
    expect(doc.composer.brandAssets).toEqual({ a1: "refs/logo.png" });
  });

  it("pill ảnh RỜI của thẻ Nhân vật đời trước ⇒ gấp vào pill nhân vật, ảnh còn nguyên", () => {
    /* Hình dạng THẬT của câu đầu thẻ ở hai lượt trước (52bf64a · 42cb8ce): một
       `imagePill` vai `character` đứng đúng chỗ mà pill nhân vật nay đứng. */
    const legacy: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Tạo nhân vật " },
            { type: NODE.imagePill, attrs: { refName: "lan.png", path: "refs/lan.png", role: "character" } },
            { type: "text", text: ", trang phục " },
            { type: NODE.optionPill, attrs: { kind: "outfit", value: OUTFIT_THEMES[1]!.value, custom: "" } },
            { type: "text", text: " và đội nón lá." },
          ],
        },
      ],
    };
    const doc = migrateComposerDoc(
      saved({ blocks: [{ id: "m1", kind: "mascot", mode: "free", doc: legacy, poses: [] }] }),
      PRESETS,
    );
    const nodes = (doc.composer.blocks[0] as { doc: JSONContent }).doc.content![0]!.content!;

    /* Không còn node ảnh rời nào — một pill là một nguồn. */
    expect(nodes.some((node) => node.type === NODE.imagePill)).toBe(false);
    const mascot = nodes.find((node) => node.type === NODE.optionPill && node.attrs!["kind"] === "mascot")!;
    expect(mascot.attrs!["path"]).toBe("refs/lan.png");

    /* Chữ NGƯỜI DÙNG viết thêm ở chế độ tự do phải sống sót: câu này là câu họ
       được phép viết, nên di trú không được dựng lại nó từ khuôn. */
    expect(JSON.stringify(nodes)).toContain("và đội nón lá");
    /* Trang phục cũ không bị đụng tới. */
    expect(nodes.find((node) => node.attrs?.["kind"] === "outfit")!.attrs!["value"]).toBe(OUTFIT_THEMES[1]!.value);
  });

  it("ảnh RỜI trong câu Ngữ cảnh chung ⇒ về đúng pill nó minh hoạ", () => {
    const legacy: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bộ kit theme " },
            { type: NODE.optionPill, attrs: { kind: "theme", value: OUTFIT_THEMES[0]!.value, custom: "" } },
            { type: NODE.imagePill, attrs: { refName: "tet.png", path: "refs/tet.png", role: "theme" } },
            { type: "text", text: " phong cách " },
            { type: NODE.optionPill, attrs: { kind: "style", value: "", custom: "" } },
          ],
        },
      ],
    };
    const doc = migrateComposerDoc(saved({ blocks: [], contextDoc: legacy }), PRESETS);
    const nodes = doc.composer.contextDoc!.content![0]!.content!;
    expect(nodes.some((node) => node.type === NODE.imagePill)).toBe(false);
    expect(nodes.find((node) => node.attrs?.["kind"] === "theme")!.attrs!["path"]).toBe("refs/tet.png");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THẺ BACKGROUND — ô thứ ba đổi từ ẢNH sang BỐ CỤC (09/2026)
   ══════════════════════════════════════════════════════════════════════════ */

describe("thẻ Background: khung cảnh · không khí · bố cục", () => {
  const saved = (composer: unknown) => ({ docVersion: COMPOSER_DOC_VERSION, updatedAt: "", composer });

  const pillsOf = (doc: JSONContent): { kind: string; value: string; path: string }[] => {
    const out: { kind: string; value: string; path: string }[] = [];
    const walk = (node: JSONContent) => {
      if (node.type === NODE.optionPill) {
        out.push({
          kind: String(node.attrs?.["kind"] ?? ""),
          value: String(node.attrs?.["value"] ?? ""),
          path: String(node.attrs?.["path"] ?? ""),
        });
      }
      for (const child of node.content ?? []) walk(child);
    };
    walk(doc);
    return out;
  };

  it("câu khởi điểm có ĐÚNG ba pill, và không còn node ảnh rời nào", () => {
    const doc = backgroundDoc();
    expect(pillsOf(doc).map((p) => p.kind)).toEqual(["scene", "mood", "layout"]);
    expect(JSON.stringify(doc)).not.toContain(NODE.imagePill);
  });

  it("cụm bố cục đi vào `spec` của tấm, SAU không khí", () => {
    const contract = composerToContract(
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc: backgroundDoc(), note: "" }] }),
      { presets: PRESETS },
    );
    const spec = contract.sheets[0]!.components[0]!.spec;
    const layout = phraseOf("layout", "center-clear", PRESETS);
    expect(spec).toContain(layout);
    expect(spec.indexOf(phraseOf("mood", "festive", PRESETS))).toBeLessThan(spec.indexOf(layout));
  });

  /**
   * ẢNH BỐ CỤC KHÔNG BAO GIỜ ĐƯỢC LÀ `sheet.ref`.
   *
   * `gen.sh` tả hai trường ấy bằng hai câu ngược nhau: `ref` = "vẽ ra cái này",
   * `layoutRef` = "chỉ chép chỗ đặt, đừng lấy nét, màu hay độ hoàn thiện". Một
   * bản phác nằm ở `ref` là lệnh "vẽ lại chính bản phác này cho đẹp" — đúng con
   * bọ mà lượt này sinh ra để dọn.
   */
  it("ảnh trên pill bố cục → `layoutRef`, KHÔNG BAO GIỜ → `ref`", () => {
    const doc = backgroundDoc();
    const withLayoutShot = JSON.parse(JSON.stringify(doc)) as JSONContent;
    const paragraph = withLayoutShot.content![0]!;
    paragraph.content = paragraph.content!.map((node) =>
      node.attrs?.["kind"] === "layout"
        ? { ...node, attrs: { ...node.attrs, path: "refs/phac-bo-cuc.png", refName: "phac-bo-cuc.png" } }
        : node,
    );
    const sheet = composerToContract(
      state({ blocks: [{ id: "b1", kind: "background", mode: "template", doc: withLayoutShot, note: "" }] }),
      { presets: PRESETS },
    ).sheets[0]!;
    expect(sheet.layoutRef).toBe("refs/phac-bo-cuc.png");
    expect(sheet.ref).toBeUndefined();
  });

  it("`layoutRef` phải là đường dẫn trong project — schema chặn `../`", () => {
    const bad = { id: "nen", orient: "portrait", grid: { cols: 1, rows: 1 }, layoutRef: "../../etc/passwd",
      components: [{ file: "01-nen", vi: "Background", spec: "x", skel: { shape: "full", w: 1, h: 1 } }] };
    expect(() => contractSchema.parse({ schemaVersion: 4, sheets: [bad], variants: [], characterPoses: [], slice: { threshold: 120 } })).toThrow();
  });

  /**
   * Ô GHI CHÚ của thẻ → `sheet.directive`, và nó SỐNG QUA cả hai chế độ.
   *
   * Ở chế độ tự do câu chữ thành `promptOverride` (thay trọn prompt của tấm), nên
   * nếu ghi chú cũng đi vào đó thì nó biến mất. Nó là một ô KHÁC của contract, và
   * `gen.sh` in nó dưới `## Direction` kể cả ở nhánh override.
   */
  it("ghi chú của thẻ → `directive`, ở CẢ hai chế độ", () => {
    for (const mode of ["template", "free"] as const) {
      const contract = composerToContract(
        state({ blocks: [{ id: "b1", kind: "background", mode, doc: backgroundDoc(), note: "màn chính của game" }] }),
        { presets: PRESETS },
      );
      expect(contract.sheets[0]!.directive, mode).toContain("màn chính của game");
    }
  });

  /**
   * DI TRÚ bản nháp đời trước: «tham chiếu [🖼]» → «bố cục [⌄ mang ảnh]».
   *
   * Ảnh người dùng đã tải lên đĩa phải Ở LẠI trong câu; mất nó là mất một tệp họ
   * không tải lại được từ đâu (kho ảnh gốc nằm trên máy họ, không nằm trong dự án).
   */
  it("bản nháp cũ: pill ảnh «tham chiếu» thành pill bố cục mang đúng ảnh ấy", () => {
    const legacy: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Vẽ cảnh nền " },
            { type: NODE.optionPill, attrs: { kind: "scene", value: "shop", custom: "", path: "", refName: "" } },
            { type: "text", text: ", không khí " },
            { type: NODE.optionPill, attrs: { kind: "mood", value: "cozy", custom: "", path: "", refName: "" } },
            { type: "text", text: ", tham chiếu " },
            { type: NODE.imagePill, attrs: { refName: "phac.png", path: "refs/phac.png", role: "" } },
            { type: "text", text: "." },
          ],
        },
      ],
    };
    const doc = migrateComposerDoc(
      saved({ blocks: [{ id: "b1", kind: "background", mode: "template", doc: legacy }] }),
      PRESETS,
    );
    const block = doc.composer.blocks[0] as { doc: JSONContent; note: string };
    expect(pillsOf(block.doc)).toEqual([
      { kind: "scene", value: "shop", path: "" },
      { kind: "mood", value: "cozy", path: "" },
      { kind: "layout", value: "center-clear", path: "refs/phac.png" },
    ]);
    expect(JSON.stringify(block.doc)).not.toContain("tham chiếu");
    expect(JSON.stringify(block.doc)).toContain("bố cục");
    /* Thẻ cũ chưa có ô ghi chú ⇒ rỗng, đúng thứ nó đang là. */
    expect(block.note).toBe("");
  });

  it("di trú CHẠY ĐÚNG MỘT LẦN — mở lại lần hai không sinh pill thứ tư", () => {
    const once = migrateComposerDoc(
      saved({ blocks: [{ id: "b1", kind: "background", mode: "template", doc: backgroundDoc() }] }),
      PRESETS,
    );
    const twice = migrateComposerDoc(saved(once.composer), PRESETS);
    expect(pillsOf((twice.composer.blocks[0] as { doc: JSONContent }).doc).map((p) => p.kind)).toEqual([
      "scene",
      "mood",
      "layout",
    ]);
  });
});

describe("câu Ngữ cảnh chung dựng lại được TỪ trạng thái, kể cả ảnh và chữ tự gõ", () => {
  it("`contextDoc` mang `custom` VÀ ảnh xuống chính pill nó minh hoạ", () => {
    const doc = contextDoc(
      state({
        themeCustom: "chợ hoa ngày Tết",
        contextRefs: [
          { path: "refs/tet.png", role: "theme" },
          { path: "refs/logo.png", role: "logo", assetId: "a1" },
        ],
      }),
    );
    const nodes = doc.content![0]!.content!;
    const themeAt = nodes.findIndex((n) => n.type === NODE.optionPill && n.attrs!["kind"] === "theme");
    expect(nodes[themeAt]!.attrs!["custom"]).toBe("chợ hoa ngày Tết");
    /* Ảnh nằm TRONG pill, không phải một node đứng cạnh — một pill là một nguồn. */
    expect(nodes[themeAt]!.attrs!["path"]).toBe("refs/tet.png");
    expect(nodes.some((n) => n.type === NODE.imagePill)).toBe(false);
    /* Ảnh vai `logo` KHÔNG có mặt trong câu — nó là tài sản của thương hiệu, và
       pill thương hiệu đã nói ra điều đó. */
    expect(JSON.stringify(doc)).not.toContain("refs/logo.png");
  });

  it("câu có pill thương hiệu, và pill ấy KHÔNG thêm chữ nào vào prompt", () => {
    const withBrand = state({ brandId: "b1", brandColors: ["#ff5533"] });
    const line = composerStyleLine(
      { ...withBrand, contextMode: "free", contextDoc: contextDoc(withBrand) },
      { presets: PRESETS },
    );
    expect(JSON.stringify(contextDoc(withBrand))).toContain(NODE.brandProfilePill);
    expect(line).not.toContain("b1");
    /* Bộ màu vẫn nói — nó là thứ THẬT SỰ mang thương hiệu vào prompt. */
    expect(line).toContain("#ff5533");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ ĐẾM LƯỢT CHO NÚT «VẼ TẤT CẢ» · ĐỔI THƯƠNG HIỆU
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Con số trên nút «Vẽ tất cả» LÀ toàn bộ lời cảnh báo trước một hành động tiêu
 * tiền — không có hộp xác nhận nào phía sau nó. Nên nó phải đếm đúng thứ sẽ
 * chạy, và mấy ca dưới đây khoá đúng chỗ nó dễ nói dối nhất: thẻ rỗng và thẻ
 * sinh nhiều hơn một tấm.
 */
describe("đếm lượt: một tấm = một lượt gọi máy vẽ = tiền", () => {
  const uiBlock = (id: string, cells: number): Block => ({
    id,
    kind: "uikit",
    mode: "template",
    cells: Array.from({ length: cells }, (_, at) => ({
      id: `${id}-c${at}`,
      elementId: "button",
      styleId: "",
      decor: "4",
      glazeId: "",
      sizeId: "",
      note: "",
    })),
  });
  const opts = { presets: PRESETS, limits: { small: 4 } };

  it("cộng đúng bằng số tấm `composerBlockSheets` sinh ra, không bằng số thẻ", () => {
    const sheets = composerBlockSheets(state({ blocks: [uiBlock("u1", 6), mascotBlock("m1", mascotDoc())] }), opts);
    expect(lotsOf(sheets)).toBe(sheets.reduce((n, b) => n + b.sheets.length, 0));
    /* Một thẻ Bộ UI quá trần ô KHÔNG phải một lượt: nó tràn sang tấm thứ hai,
       và tấm thứ hai là một lần gọi máy vẽ nữa. */
    expect(sheets.find((b) => b.blockId === "u1")!.sheets.length).toBe(2);
    expect(lotsOf(sheets)).toBe(3);
  });

  it("thẻ RỖNG không tính lượt nào, và không vào hàng đợi", () => {
    const sheets = composerBlockSheets(state({ blocks: [uiBlock("trong", 0)] }), opts);
    expect(lotsOf(sheets)).toBe(0);
    expect(drawableBlockIds(sheets)).toEqual([]);
  });

  it("`only` thu hẹp phép đếm về đúng mấy thẻ của một lượt bấm", () => {
    const sheets = composerBlockSheets(state({ blocks: [uiBlock("u1", 6), mascotBlock("m1", mascotDoc())] }), opts);
    expect(lotsOf(sheets, ["m1"])).toBe(1);
    expect(lotsOf(sheets, [])).toBe(0);
  });

  it("`drawableBlockIds` giữ THỨ TỰ trên màn — hàng đợi chạy đúng thứ tự ấy", () => {
    const sheets = composerBlockSheets(
      state({ blocks: [mascotBlock("m1", mascotDoc()), uiBlock("trong", 0), uiBlock("u2", 2)] }),
      opts,
    );
    expect(drawableBlockIds(sheets)).toEqual(["m1", "u2"]);
  });
});

/**
 * KHOÁ CACHE CỦA TAB PROMPT — con bọ "đổi phong cách chung mà prompt vẫn cũ".
 *
 * ╔══ VÌ SAO CA NÀY ĐÁNG MỘT CHỖ RIÊNG ══════════════════════════════════════╗
 * ║ Nó hỏng theo kiểu KHÔNG AI THẤY: người dùng đổi phong cách của cả bộ,     ║
 * ║ mở tab Prompt, và đọc một prompt của đời trước — không có hộp đỏ nào, chữ ║
 * ║ vẫn đầy đủ, chỉ là chữ sai. Rồi họ copy nó đi vẽ.                         ║
 * ║ Gốc: câu phong cách · chủ đề · màu thương hiệu · 8 trục ngữ nghĩa KHÔNG   ║
 * ║ nằm trong tấm nào — chúng tả CẢ BỘ KIT. Khoá chỉ băm mấy tấm là khoá mù   ║
 * ║ với đúng thứ người dùng vừa đổi. Ca đầu dưới đây chứng minh cái mù ấy có  ║
 * ║ thật trước, rồi mới đo phép vá — nếu không thì test chỉ đang khen chính   ║
 * ║ nó, và ngày ai đó bỏ tham số thứ hai đi nó vẫn xanh.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
describe("khoá cache tab Prompt — đổi phần mô tả cả bộ kit phải làm bản đang xem hết hạn", () => {
  const opts = { presets: PRESETS, limits: { small: 4 } };
  const before = state({ blocks: [mascotBlock("m1", mascotDoc())], brandColors: ["#112233"] });
  const after = { ...before, brandColors: ["#ff5533"] };

  const sheetsOf = (s: ComposerState) => composerBlockSheets(s, opts).flatMap((b) => b.sheets);
  const kitKey = (s: ComposerState) => JSON.stringify(composerToContract(s, opts).variants);

  it("mấy tấm y NGUYÊN mà phần mô tả cả bộ kit đã đổi ⇒ khoá phải đổi theo", () => {
    /* Bước 1 — dựng lại đúng ca hỏng: tấm không nhúc nhích một ký tự nào. */
    expect(sheetsOf(after)).toEqual(sheetsOf(before));
    /* Bước 2 — nên khoá chỉ-băm-tấm hoàn toàn mù trước phép đổi này. */
    expect(sheetsHash(sheetsOf(after))).toBe(sheetsHash(sheetsOf(before)));
    /* Bước 3 — phần mô tả cả bộ kit thì có đổi thật, và khoá đủ phải thấy nó. */
    expect(kitKey(after)).not.toBe(kitKey(before));
    expect(sheetsHash(sheetsOf(after), kitKey(after))).not.toBe(
      sheetsHash(sheetsOf(before), kitKey(before)),
    );
  });

  it("không đổi gì thì khoá ĐỨNG YÊN — lời cảnh báo nào cũng kêu thì không ai đọc nữa", () => {
    expect(sheetsHash(sheetsOf(before), kitKey(before))).toBe(
      sheetsHash(sheetsOf(before), kitKey(before)),
    );
  });

  it("hai nửa của khoá không lẫn vào nhau được", () => {
    /* Nối chuỗi trần thì hai tổ hợp khác nhau ra cùng một khoá — và cái đụng độ ấy
       im lặng đúng như con bọ ở trên. Bọc bằng mảng nên không có chuyện đó. */
    const a = sheetsHash([{ id: "x" } as never], "yz");
    const b = sheetsHash([{ id: "xy" } as never], "z");
    expect(a).not.toBe(b);
  });
});

describe("đổi thương hiệu: chỉ ảnh CỦA THƯƠNG HIỆU bị thay, ảnh người dùng ở lại", () => {
  it("`sameColors` so theo thứ tự và không phân biệt hoa/thường của mã màu", () => {
    expect(sameColors(["#FF5533", "#112233"], ["#ff5533", "#112233"])).toBe(true);
    /* Thứ tự LÀ vai trò (chủ đạo/nhấn) — đảo hai màu là một bộ nhận diện khác. */
    expect(sameColors(["#ff5533", "#112233"], ["#112233", "#ff5533"])).toBe(false);
    expect(sameColors([], [])).toBe(true);
    expect(sameColors(["#ff5533"], [])).toBe(false);
  });

  it("`swapBrandRefs` giữ ảnh người dùng tự đính, thay hết ảnh mang `assetId`", () => {
    const before = [
      { path: "refs/toi-tu-chup.png", role: "theme" as const },
      { path: "refs/logo-cu.png", role: "logo" as const, assetId: "a1" },
      { path: "refs/net-ve-cu.png", role: "style" as const, assetId: "a2" },
    ];
    const after = swapBrandRefs(before, [{ path: "refs/logo-moi.png", role: "logo", assetId: "b1" }]);
    expect(after).toEqual([
      { path: "refs/toi-tu-chup.png", role: "theme" },
      { path: "refs/logo-moi.png", role: "logo", assetId: "b1" },
    ]);
  });

  it("bỏ thương hiệu ⇒ ảnh của nó rời câu, ảnh người dùng vẫn nguyên", () => {
    const before = [
      { path: "refs/toi-tu-chup.png", role: "style" as const },
      { path: "refs/logo.png", role: "logo" as const, assetId: "a1" },
    ];
    expect(swapBrandRefs(before, [])).toEqual([{ path: "refs/toi-tu-chup.png", role: "style" }]);
  });
});
