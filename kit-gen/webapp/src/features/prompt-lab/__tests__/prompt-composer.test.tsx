import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";

import { GLAZE_AUTO, GLAZE_PRESETS, glazePhrase } from "@/features/kit-core/lib/glaze";
import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { GENRE_PRESETS } from "@/features/prompt-lab/lib/genre-presets";
import { EXPRESSIONS, OUTFIT_THEMES, POSES } from "@/features/kit-core/lib/poses";

import { serializeComposer, countComposerImages } from "../lib/serialize-composer";
import { freeText, serializeDoc, makeContext, type PromptDocNode } from "../lib/serialize";
import { backgroundDoc, mascotDoc, mascotPoseDoc, SCAFFOLD_BACKGROUND } from "../lib/doc-templates";
import { slashItems, SLASH_ITEMS } from "../lib/slash-items";
import { hasBlankChoice, labelOf, nounOf, phraseOf, pillOptions, INHERIT } from "../lib/pill-registry";
import { DECOR_LEVELS, DECOR_PLACES, hasDecorPlacement, seedPresets } from "../lib/presets-store";
import { defaultSizeOf, sizePx } from "../lib/cell-size";
import { gridFor, newCell, newMascotPose, type ComposerState, type UiCell } from "../lib/composer-model";
import { brandColorName, describeBrandColors } from "../lib/brand-colors";
import { NODE } from "../lib/schema";

/**
 * Bộ SERIALIZE của khu soạn prompt — màn → prompt.
 *
 * 07/09/2026: hai màn demo (`PromptComposerScreen`, `PresetsScreen`) và ba route
 * `/lab/*` đã bị xoá, nên describe cuối ("dây nối route + hai màn render được")
 * đi theo — nó chỉ tồn tại để khoá những thứ đó. Phần Ở LẠI đúng là phần mà
 * `features/prompt-canvas` (`/k/:id`) gọi thật.
 *
 * Thứ được khoá: bộ serialize và các dây nối dễ đứt CÂM (danh mục lấy từ
 * kit-core, luật "để trống = kế thừa"). Đó cũng là phần hỏng KHÔNG BÁO — gõ lệch
 * một tên node thì prompt chỉ thiếu một mảnh, không ai thấy.
 *
 * Thứ KHÔNG được khoá: gõ phím trong ProseMirror, menu `/` mở đúng chỗ, dropdown
 * pill, công tắc chế độ. Chúng cần DOM thật (`*.dom.test.tsx`, config riêng).
 */

const PRESETS = seedPresets();
/* `outfitEN` TÁCH khỏi `themeEN` từ 09/2026: chủ đề nói với bộ kit bằng mô-típ, nói
   với nhân vật bằng quần áo — cùng một lựa chọn, hai cụm chữ (`ThemeOption.kitEN`).
   Hai chuỗi giả khác nhau ở đây để ca test bắt được nếu ai đó nối lại làm một. */
const ctx = () =>
  makeContext({ presets: PRESETS, styleEN: "STYLE_CHUNG", themeEN: "THEME_CHUNG", outfitEN: "OUTFIT_CHUNG" });

const state = (partial: Partial<ComposerState> = {}): ComposerState => ({
  themeValue: OUTFIT_THEMES[0]!.value,
  styleId: PRESETS.styles[0]!.id,
  /* Mặc định KHÔNG màu, để những ca không nói về màu đọc ra đúng thứ chúng
     kiểm. Ca nào về màu thì tự truyền vào. */
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

describe("serialize — pill đổi thành cụm TIẾNG ANH, không phải nhãn tiếng Việt", () => {
  it("câu Background mặc định: mọi pill ra chữ EN, nhãn VI không lọt vào prompt", () => {
    const out = serializeDoc(backgroundDoc() as PromptDocNode, ctx());
    expect(out).toContain(phraseOf("scene", "main-menu", PRESETS));
    expect(out).toContain(phraseOf("mood", "festive", PRESETS));
    /* Ô thứ ba nay là pill BỐ CỤC, không còn là pill ảnh trần — nên câu mặc định
       KHÔNG mang móc "[ảnh tham chiếu]" nữa: không hứa đính kèm một tấm ảnh mà
       người dùng chưa chọn. Ảnh vẫn đính được, vào chính pill ấy. */
    expect(out).toContain(phraseOf("layout", "center-clear", PRESETS));
    expect(out).not.toContain("[ảnh tham chiếu]");
    expect(out).not.toContain("Màn hình chính");
    expect(out).not.toContain("Rộn ràng");
    expect(out).not.toContain("thoáng giữa");
  });

  it("câu Nhân vật CHỈ còn thứ chung cho cả tấm: nhân vật + trang phục, không dáng/nét mặt", () => {
    const out = serializeDoc(mascotDoc() as PromptDocNode, ctx());
    /* Đây là luật quan trọng nhất của cả model: ô để trống KHÔNG phải là ô rỗng,
       nó là "theo cái chung". Hỏng luật này thì mọi block âm thầm mất theme. */
    expect(out).toContain("OUTFIT_CHUNG");
    /* Pill trang phục để trống kế thừa cụm TRANG PHỤC, không kế thừa cụm mô-típ
       của cả bộ kit — "wearing Vietnamese Tết theme: red and gold, lanterns" là
       một câu không ai mặc được. */
    expect(out).not.toContain("THEME_CHUNG");
    /* Dáng và nét mặt XUỐNG TỪNG DÒNG kể từ khi thẻ ra sprite sheet — mỗi ô một
       dáng một góc riêng. Còn sót ở câu đầu là cả tấm bị ép về một dáng. */
    expect(out).not.toContain(phraseOf("pose", "idle", PRESETS));
    expect(out).not.toContain(EXPRESSIONS[0]!.value);
    /* Pill NHÂN VẬT chưa chọn gì ⇒ KHÔNG một cái móc ảnh nào. Đây là chỗ đổi so
       với bản trước: câu từng luôn có sẵn một pill ảnh rỗng, nên prompt luôn mang
       chữ "[ảnh tham chiếu]" — một lời hứa đính kèm cho tấm ảnh không tồn tại. */
    expect(out).not.toContain("[ảnh tham chiếu");
  });

  it("pill nhân vật CÓ ẢNH ⇒ móc ảnh có số, ngay sau chữ của chính pill ấy", () => {
    const doc = mascotDoc();
    const para = doc.content![0]!;
    para.content = para.content!.map((node) =>
      node.type === NODE.optionPill && node.attrs!["kind"] === "mascot"
        ? { ...node, attrs: { ...node.attrs, path: "refs/lan.png", refName: "lan.png" } }
        : node,
    );
    const out = serializeDoc(doc as PromptDocNode, ctx());
    expect(out).toContain("[ảnh tham chiếu 1]");
  });

  it("một dòng dáng ra một câu riêng: dáng · góc máy · nét mặt", () => {
    const row = newMascotPose();
    const out = serializeDoc(mascotPoseDoc({ ...row, note: "" }) as PromptDocNode, ctx());
    expect(out).toContain(phraseOf("pose", row.pose, PRESETS));
    expect(out).toContain(phraseOf("view", row.view, PRESETS));
    expect(out).toContain(EXPRESSIONS[0]!.value);
  });

  it("pill phong cách để trống ⇒ kế thừa phong cách chung", () => {
    const doc: PromptDocNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: NODE.optionPill, attrs: { kind: "style", value: INHERIT } }] }],
    };
    expect(serializeDoc(doc, ctx())).toBe("STYLE_CHUNG");
  });

  it("giá trị lạ của kind tra-theo-id ⇒ KHÔNG bịa chữ vào prompt", () => {
    const doc: PromptDocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "chất liệu " },
            { type: NODE.optionPill, attrs: { kind: "material", value: "khong-ton-tai" } },
          ],
        },
      ],
    };
    expect(serializeDoc(doc, ctx())).toBe("chất liệu");
  });

  it("giá trị lạ của kind lưu-thẳng-cụm-chữ ⇒ ĐI NGUYÊN VĂN (đó là chữ người dùng tự gõ)", () => {
    const doc: PromptDocNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: NODE.optionPill, attrs: { kind: "expression", value: "đang ngáp" } }] },
      ],
    };
    expect(serializeDoc(doc, ctx())).toBe("đang ngáp");
  });

  it("dọn khoảng trắng: pill bỏ trống giữa câu không để lại dấu cách thừa trước dấu câu", () => {
    const doc: PromptDocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "không khí " },
            { type: NODE.optionPill, attrs: { kind: "mood", value: "" } },
            { type: "text", text: "." },
          ],
        },
      ],
    };
    expect(serializeDoc(doc, ctx())).toBe("không khí.");
  });
});

describe("màu thương hiệu — hex phải thành CHỮ, không phải một dòng cấu hình", () => {
  it("gọi tên được bốn nhóm màu hay gặp nhất của một bộ nhận diện", () => {
    expect(brandColorName("#ff5533")).toBe("vivid orange-red");
    expect(brandColorName("#112233")).toBe("deep navy blue");
    expect(brandColorName("#ffd700")).toBe("vivid golden yellow");
    expect(brandColorName("#888888")).toBe("mid grey");
  });

  it("màu vô sắc KHÔNG bị gọi theo hue — hue của xám là số rác", () => {
    /* #808080 có h=0 y như màu đỏ thuần. Nhánh vô sắc phải chặn trước, nếu
       không thì mọi màu trung tính đều được tả là "đỏ". */
    expect(brandColorName("#0a0a0a")).toBe("near-black");
    expect(brandColorName("#fbfbfb")).toBe("near-white");
    expect(brandColorName("#1c1c1e")).toBe("charcoal grey");
    expect(brandColorName("#d5d5d5")).toBe("light grey");
  });

  it("nhận mọi dạng hex dán được, và chuẩn hoá y như ô nhập", () => {
    expect(brandColorName("#F53")).toBe(brandColorName("#ff5533"));
    expect(brandColorName("FF5533")).toBe("vivid orange-red");
    expect(brandColorName("xanh lá")).toBe("");
  });

  it("gán VAI TRÒ theo thứ tự: chủ đạo → nhấn → phụ", () => {
    expect(describeBrandColors(["#ff5533", "#112233"])).toBe(
      "a palette built around vivid orange-red (#ff5533) as the dominant brand colour, " +
        "accented with deep navy blue (#112233)",
    );

    const four = describeBrandColors(["#ff5533", "#112233", "#ffd700", "#b8e8d0"]);
    expect(four).toContain("as the dominant brand colour");
    expect(four).toContain("accented with deep navy blue (#112233)");
    /* Ba màu phụ gộp một mệnh đề, không phải mỗi màu một mệnh đề. */
    expect(four).toContain("supported by vivid golden yellow (#ffd700) and soft pastel mint green (#b8e8d0)");
    expect(four.match(/supported by/g)).toHaveLength(1);
  });

  it("không màu ⇒ không mệnh đề; màu hỏng bị LOẠI chứ không đẩy rác vào prompt", () => {
    expect(describeBrandColors([])).toBe("");
    expect(describeBrandColors(["", "không phải màu"])).toBe("");
    expect(describeBrandColors(["nhảm", "#112233"])).toBe(
      "a palette built around deep navy blue (#112233) as the dominant brand colour",
    );
  });

  it("hoà vào dòng theme tổng thành MỘT câu liền mạch, không phải dòng liệt kê", () => {
    const out = serializeComposer(state({ brandColors: ["#ff5533", "#112233"] }), PRESETS);
    const first = out.split("\n")[0]!;

    /* Một câu: theme, phong cách và màu nối nhau bằng dấu phẩy, kết bằng MỘT
       dấu chấm — không xuống dòng, không có nhãn kiểu "brand palette:". */
    expect(first).toContain(OUTFIT_THEMES[0]!.kitEN);
    expect(first).toContain(PRESETS.styles[0]!.en);
    expect(first).toContain("a palette built around vivid orange-red (#ff5533) as the dominant brand colour");
    expect(first).toContain("accented with deep navy blue (#112233)");
    expect(first).not.toMatch(/brand palette:/i);
    expect(first.endsWith(".")).toBe(true);
  });

  it("KHÔNG nhắc lại palette ở từng dòng cell — một bộ nhận diện, không phải mỗi ô một bảng màu", () => {
    const cells: UiCell[] = [
      { id: "c1", elementId: "button", styleId: INHERIT, decor: "medium", decorPlace: "balanced", glazeId: "", sizeId: "", note: "" },
      { id: "c2", elementId: "coin", styleId: INHERIT, decor: "light", decorPlace: "balanced", glazeId: "", sizeId: "", note: "" },
    ];
    const out = serializeComposer(
      state({ brandColors: ["#ff5533", "#112233"], blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }),
      PRESETS,
    );
    expect(out.match(/a palette built around/g)).toHaveLength(1);
    expect(out.match(/#ff5533/g)).toHaveLength(1);
  });
});

/**
 * HAI TRỤC TRANG TRÍ — LƯỢNG và CHỖ, mỗi trục một câu hỏi.
 *
 * Cách hoàn thiện (vát khối, chuyển màu, đổ bóng) vẫn là việc của PHONG CÁCH —
 * đã nói một lần ở `## Art style` cho cả tấm. Nhắc lại ở từng ô là hai giọng
 * cùng chỉ huy một chuyện: chọn "flat vector" rồi kéo trang trí lên «Nhiều» là
 * prompt tự mâu thuẫn ngay trong chính nó.
 */
describe("hai trục trang trí — lượng và chỗ", () => {
  it("bốn nấc lượng, bốn nấc chỗ, không nấc nào mang chữ về cách hoàn thiện", () => {
    expect(DECOR_LEVELS.map((level) => level.value)).toEqual(["none", "light", "medium", "rich"]);
    expect(DECOR_PLACES.map((place) => place.value)).toEqual(["balanced", "left", "right", "random"]);
    for (const option of [...DECOR_LEVELS, ...DECOR_PLACES]) {
      expect(option.en.toLowerCase(), option.vi).not.toMatch(/bevel|gradient|shadow|glow|gloss|sheen/);
    }
  });

  /* ══ NẤC «KHÔNG» PHẢI THẮNG ĐƯỢC THEME ═══════════════════════════════════
     Chủ sản phẩm nhìn khung Tết vẽ ra: *"lần nào nó cũng ra viền decor"*. Câu
     "plain edge, no rim" đời trước chỉ nói về VIỀN, nên hoa mai và đèn lồng của
     theme vẫn bám quanh ô một cách hợp lệ. Câu mới phải gọi tên thẳng thứ bị
     cấm — và ca này khoá đúng điều đó, không khoá câu chữ cho đẹp. */
  it("nấc «Không» cấm CẢ hoa văn treo vào, không chỉ cấm viền", () => {
    const none = DECOR_LEVELS[0]!.en.toLowerCase();
    expect(none).toContain("no rim ornament");
    for (const thing of ["flowers", "lanterns", "ribbons", "gems", "trinkets"]) {
      expect(none, thing).toContain(thing);
    }
    expect(DECOR_LEVELS[3]!.en).toContain("ornate rim");
  });

  it("bốn nấc chỗ nói ra CHỖ, và hai nấc lệch thì đối nhau", () => {
    expect(DECOR_PLACES[0]!.en).toContain("mirrored symmetrically");
    expect(DECOR_PLACES[1]!.en).toContain("LEFT");
    expect(DECOR_PLACES[2]!.en).toContain("RIGHT");
    expect(DECOR_PLACES[3]!.en).toContain("asymmetric");
  });

  /* Ô «Không trang trí» thì câu hỏi "xếp hoa văn ở đâu" không còn nghĩa — và một
     dòng nói cả "no decorative objects" lẫn "ornaments mirrored symmetrically" là
     mời máy vẽ hoà giải hai câu ngược nhau bằng cách vẽ vài bông hoa. */
  it("pill «Bố trí» chỉ có nghĩa khi ô CÓ trang trí", () => {
    expect(hasDecorPlacement("none")).toBe(false);
    for (const level of ["light", "medium", "rich"]) expect(hasDecorPlacement(level)).toBe(true);
    /* Số đời cũ đi qua cùng một cửa: "1" là «Không», nên nó cũng tắt pill. */
    expect(hasDecorPlacement("1")).toBe(false);
    expect(hasDecorPlacement("4")).toBe(true);
  });
});

describe("dòng element in đủ hai câu trang trí — và im đúng chỗ", () => {
  const uikit = (cells: UiCell[]) => state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] });

  it("ô có trang trí ⇒ câu LƯỢNG rồi tới câu CHỖ, đúng thứ tự ấy", () => {
    const cell: UiCell = { ...newCell("button", PRESETS), decor: "medium", decorPlace: "left" };
    const out = serializeComposer(uikit([cell]), PRESETS);
    const amount = phraseOf("decor", "medium", PRESETS);
    const place = phraseOf("decorPlace", "left", PRESETS);
    expect(out).toContain(amount);
    expect(out).toContain(place);
    expect(out.indexOf(amount)).toBeLessThan(out.indexOf(place));
  });

  it("ô «Không trang trí» ⇒ có câu cấm, KHÔNG có câu bố trí", () => {
    const cell: UiCell = { ...newCell("button", PRESETS), decor: "none", decorPlace: "balanced" };
    const out = serializeComposer(uikit([cell]), PRESETS);
    expect(out).toContain(phraseOf("decor", "none", PRESETS));
    expect(out).not.toContain(phraseOf("decorPlace", "balanced", PRESETS));
  });
});

describe("serialize cả màn — mỗi block một đoạn, ảnh đánh số liên tục", () => {
  it("dòng đầu là NGỮ CẢNH CHUNG, mọi block kế thừa nó", () => {
    const out = serializeComposer(state(), PRESETS);
    expect(out.split("\n")[0]).toContain(OUTFIT_THEMES[0]!.kitEN);
    expect(out.split("\n")[0]).toContain(PRESETS.styles[0]!.en);
  });

  it("block rỗng bị BỎ HẲN — prompt không có dòng 'Bộ UI:' trống", () => {
    const out = serializeComposer(
      state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells: [] }] }),
      PRESETS,
    );
    expect(out).not.toContain("Bộ UI");
  });

  it("block UI kit liệt kê element, KHÔNG có toạ độ — lưới là việc của hệ thống", () => {
    const cells: UiCell[] = [
      { id: "c1", elementId: "button", styleId: INHERIT, decor: "medium", decorPlace: "balanced", glazeId: "glass", sizeId: "", note: "" },
      { id: "c2", elementId: "coin", styleId: "match3", decor: "light", decorPlace: "balanced", glazeId: "", sizeId: "", note: "xoay 15 độ" },
    ];
    const out = serializeComposer(state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }), PRESETS);

    expect(out).toContain("hệ thống tự xếp lưới");
    expect(out).toContain("cell 1 (Nút bấm)");
    expect(out).toContain("cell 2 (Icon tiền)");
    /* Ô 1 để trống phong cách ⇒ ăn phong cách chung; ô 2 tự chọn ⇒ phong cách riêng. */
    expect(out).toContain(PRESETS.styles[0]!.en);
    expect(out).toContain(PRESETS.styles.find((s) => s.id === "match3")!.en);
    expect(out).toContain(glazePhrase("glass"));
    expect(out).toContain("xoay 15 độ");
    /* Không được lọt bất kỳ dấu vết toạ độ nào vào prompt. */
    expect(out).not.toMatch(/hàng \d+ cột \d+/i);
  });

  it("ô để nấc «Tự động» ⇒ dòng của nó KHÔNG mọc chữ đục nền nào", () => {
    /* Bản copy-dán và bản gửi engine là hai cửa nhìn vào CÙNG một ô, nên chúng phải
       im lặng ở cùng một chỗ: nấc `auto` không nối chữ vào dòng nào cả, luật của nó
       do `gen.sh` nói một lần cho cả tấm (section `## Transparency`). Và tuyệt đối
       không được rò `hint` — dòng chữ VIỆT bày trong menu — ra prompt. */
    const cells: UiCell[] = [newCell("coin", PRESETS)];
    expect(cells[0]!.glazeId).toBe(GLAZE_AUTO);
    const out = serializeComposer(state({ blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }), PRESETS);
    expect(out).toContain("cell 1 (Icon tiền)");
    expect(out).not.toContain("alpha");
    expect(out).not.toContain("see-through");
    expect(out).not.toContain("tự quyết theo vật liệu");
  });

  /**
   * MỘT ẢNH MỖI PILL (08/2026) — trước đây một pill giữ MẢNG `refs` với `url`
   * là `blob:`. Nay pill giữ `{ refName, path }` của một tấm đã nằm trên đĩa
   * project, vì đó là thứ duy nhất `sheet.ref` của contract nhận được. Số thứ tự
   * vẫn phải chạy LIÊN TỤC qua các block: người dùng kéo đúng ngần ấy tấm vào
   * khung chat theo đúng thứ tự đó.
   */
  it("ảnh đánh số LIÊN TỤC qua nhiều block", () => {
    const imagePill = (name: string): JSONContent => ({
      type: NODE.imagePill,
      attrs: { refName: `${name}.png`, path: `refs/${name}.png` },
    });
    const withImages = (names: string[]): JSONContent => ({
      type: "doc",
      content: [{ type: "paragraph", content: names.map(imagePill) }],
    });
    const s = state({
      blocks: [
        { id: "b1", kind: "background", mode: "template", doc: withImages(["a", "b"]), note: "" },
        { id: "b2", kind: "mascot", mode: "template", doc: withImages(["c"]), poses: [newMascotPose()] },
      ],
    });

    const out = serializeComposer(s, PRESETS);
    expect(out).toContain("[ảnh tham chiếu 1][ảnh tham chiếu 2]");
    expect(out).toContain("[ảnh tham chiếu 3]");
    expect(countComposerImages(s)).toBe(3);
  });

  it("màn trống vẫn ra một prompt đọc được, không nổ", () => {
    expect(serializeComposer(state({ themeValue: "", styleId: "" }), PRESETS)).toBe("");
    expect(countComposerImages(state())).toBe(0);
  });
});

describe("lưới hiển thị suy ra từ SỐ Ô, không phải một trường được lưu", () => {
  it.each([
    [0, 3, 3],
    [9, 3, 3],
    [10, 4, 3],
    [17, 4, 5],
  ])("%i ô ⇒ lưới %i×%i", (count, cols, rows) => {
    expect(gridFor(count)).toEqual({ cols, rows });
  });
});

describe("danh mục — lab đi bằng dữ liệu THẬT của kit-core, không chép", () => {
  it("hạt giống phong cách lấy đủ 7 genre preset, nguyên văn cụm EN", () => {
    expect(PRESETS.styles).toHaveLength(GENRE_PRESETS.length);
    for (const preset of GENRE_PRESETS) {
      expect(PRESETS.styles.find((s) => s.id === preset.id)?.en).toBe(preset.stylePrompt);
    }
  });

  it("pill theme/đục nền/dáng/biểu cảm đọc thẳng danh mục gốc", () => {
    expect(pillOptions("theme", PRESETS)).toHaveLength(OUTFIT_THEMES.length);
    expect(pillOptions("glaze", PRESETS)).toHaveLength(GLAZE_PRESETS.length);
    /* `material` CÒN ĐỌC ĐƯỢC (câu tự do đời cũ mang nó) nhưng không còn cửa chèn. */
    expect(pillOptions("material", PRESETS)).toHaveLength(MATERIAL_PRESETS.length);
    expect(SLASH_ITEMS.some((item) => item.id === "pill-material")).toBe(false);
    expect(pillOptions("pose", PRESETS)).toHaveLength(POSES.length);
    expect(pillOptions("expression", PRESETS)).toHaveLength(EXPRESSIONS.length);
  });

  it("hai trục trang trí có mặt đủ trong bảng tra: danh mục, nhãn, câu Anh, menu `/`", () => {
    expect(pillOptions("decor", PRESETS)).toHaveLength(DECOR_LEVELS.length);
    expect(pillOptions("decorPlace", PRESETS)).toHaveLength(DECOR_PLACES.length);
    /* Nhãn VI tra ngược được — pill hiện chữ này, không hiện id. */
    expect(labelOf("decor", "none", PRESETS)).toBe("Không");
    expect(labelOf("decorPlace", "left", PRESETS)).toBe("Lệch trái");
    expect(nounOf("decor")).toBe("trang trí");
    expect(nounOf("decorPlace")).toBe("bố trí");
    /* Câu Anh đi vào prompt là câu của danh mục, không phải id. */
    expect(phraseOf("decorPlace", "right", PRESETS)).toBe(DECOR_PLACES[2]!.en);
    /* Cả hai chèn được vào giữa câu tự do bằng `/`. */
    for (const id of ["pill-decor", "pill-decorPlace"]) {
      expect(SLASH_ITEMS.some((item) => item.id === id), id).toBe(true);
    }
  });

  /* Mục «— để trống —» bị bỏ khỏi CẢ HAI trục, cùng lý do với `glaze`: để trống
     nghĩa là không nói gì, mà "không nói gì" ở trục này CHÍNH LÀ cái bệnh đang
     chữa — theme tự bơm hoa vào ô. Nấc «Không» nói mạnh hơn, và nó có tên. */
  it("hai trục trang trí KHÔNG có mục để trống — luôn phải nói ra một nấc", () => {
    expect(hasBlankChoice("decor")).toBe(false);
    expect(hasBlankChoice("decorPlace")).toBe(false);
  });

  it("pill Đục nền: «Tự động» đứng ĐẦU, «Đục hoàn toàn» có mặt, KHÔNG có mục để trống", () => {
    /* 08/09/2026 — chủ sản phẩm chốt thêm nấc mặc định «tự động theo vật liệu», và
       cùng lượt ấy nấc «đặc» phải có tên riêng: trước đó "đặc" chỉ là hệ quả của
       việc `gen.sh` mặc định vẽ đục, mà mặc định ấy nay là "theo vật liệu". */
    const options = pillOptions("glaze", PRESETS);
    expect(options[0]!.value).toBe(GLAZE_AUTO);
    expect(options.map((o) => o.value)).toContain("solid");

    /* `auto` KHÔNG có cụm tiếng Anh — nó không nối chữ vào dòng element. Dòng phụ
       của nó trong menu là `hint` (chữ Việt), thứ KHÔNG bao giờ đi vào prompt. */
    expect(options[0]!.en).toBe("");
    expect(options[0]!.hint).toBeTruthy();
    expect(phraseOf("glaze", GLAZE_AUTO, PRESETS)).toBe("");

    /* Mục «— để trống —» bị bỏ khỏi trục này: `""` và `auto` ra CÙNG một prompt, nên
       bày cả hai là hai mục cho một nghĩa mà không ai phân biệt được. */
    expect(hasBlankChoice("glaze")).toBe(false);

    /* Nấc CỤ THỂ thì ngược lại: có câu, và câu ấy đi vào prompt. */
    expect(phraseOf("glaze", "solid", PRESETS)).toContain("fully opaque");
    expect(phraseOf("glaze", "glass", PRESETS)).toContain("about 64 of 255");
  });

  it("ô mới kế thừa phong cách chung và ăn mặc định của element preset", () => {
    const cell = newCell("coin", PRESETS);
    expect(cell.styleId).toBe(INHERIT);
    /* Đục nền KHÔNG còn được áp sẵn theo loại element (nó là hiệu ứng, không phải
       bản chất của "icon tiền"); CỠ thì có, vì cỡ là hình học — và nó đo từ `skel`
       của chính loại: một đồng xu là hộp VUÔNG.
       "Không áp sẵn" nay ĐỌC RA là `auto`, không phải rỗng: rỗng từng gánh hai
       nghĩa ("chưa chọn" + "nền đặc") và nghĩa thứ hai đã có id riêng (`solid`). */
    expect(cell.glazeId).toBe(GLAZE_AUTO);
    expect(cell.sizeId).toBe(defaultSizeOf(PRESETS.elements.find((e) => e.id === "coin")));
    const coin = PRESETS.elements.find((e) => e.id === "coin");
    expect(sizePx(cell.sizeId, coin?.skel)?.w).toBe(sizePx(cell.sizeId, coin?.skel)?.h);
    /* Hạt giống của «Icon tiền» là «Ít» — một đồng xu không cần vành hoa văn. Và
       cách bố trí thì KHÔNG đến từ danh mục element: nó là «Cân đối» cho mọi ô mới,
       vì đối xứng là thứ một bộ UI muốn ở gần như mọi món. */
    expect(cell.decor).toBe("light");
    expect(cell.decorPlace).toBe("balanced");
  });

  it("thực đơn `/` CHỈ chèn pill — cấu trúc đi qua nút '+ Thêm block'", () => {
    for (const item of SLASH_ITEMS) {
      const inserted = item.content();
      expect([NODE.optionPill, NODE.imagePill]).toContain(inserted.type);
    }
  });

  it("lọc menu bỏ dấu tiếng Việt — gõ 'duc' phải ra 'Đục nền'", () => {
    /* Đổi ca từ 'chat'/Chất liệu sang 'duc'/Đục nền cùng lượt bỏ pill chất liệu.
       Vẫn là ca cho phép GẤP DẤU — và nay còn khoẻ hơn: 'duc' đòi cả `đ`→`d`, thứ
       NFD không tách ra được (xem `fold`). */
    expect(slashItems("duc").map((i) => i.id)).toContain("pill-glaze");
    expect(slashItems("bieu").map((i) => i.id)).toContain("pill-expression");
    expect(slashItems("")).toHaveLength(SLASH_ITEMS.length);
    /* Không khớp ⇒ RỖNG, không phải "trả về cả danh sách". */
    expect(slashItems("khong-co-muc-nao-ten-the-nay")).toHaveLength(0);
  });
});

describe("hai chế độ — phát hiện 'đã chế' để hỏi trước khi bỏ", () => {
  it("template chưa đụng ⇒ không có chữ tự do ⇒ quay về không cần hỏi", () => {
    expect(freeText(backgroundDoc() as PromptDocNode, SCAFFOLD_BACKGROUND)).toBe("");
  });

  it("viết thêm một mệnh đề ⇒ đếm được, nên sẽ hỏi trước khi reset", () => {
    const doc = backgroundDoc() as PromptDocNode;
    const paragraph = doc.content![0]!;
    paragraph.content!.push({ type: "text", text: " nhìn từ trên cao lúc hoàng hôn" });
    expect(freeText(doc, SCAFFOLD_BACKGROUND)).toBe("nhìn từ trên cao lúc hoàng hôn");
  });
});
