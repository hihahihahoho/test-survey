import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { RouterContextProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";

import { routeTree } from "@/routeTree";
import { GLAZE_PRESETS, glazePhrase } from "@/features/kit-core/lib/glaze";
import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { GENRE_PRESETS } from "@/features/kit-core/lib/genre-presets";
import { EXPRESSIONS, OUTFIT_THEMES, POSES } from "@/features/kit-core/lib/poses";

import { PromptComposerScreen } from "../PromptComposerScreen";
import { PresetsScreen } from "../PresetsScreen";
import { serializeComposer, countComposerImages } from "../lib/serialize-composer";
import { freeText, serializeDoc, makeContext, type PromptDocNode } from "../lib/serialize";
import { backgroundDoc, mascotDoc, SCAFFOLD_BACKGROUND } from "../lib/doc-templates";
import { slashItems, SLASH_ITEMS } from "../lib/slash-items";
import { phraseOf, pillOptions, INHERIT } from "../lib/pill-registry";
import { seedPresets } from "../lib/presets-store";
import { gridFor, newCell, type ComposerState, type UiCell } from "../lib/composer-model";
import { brandColorName, describeBrandColors } from "../lib/brand-colors";
import { NODE } from "../lib/schema";

/**
 * Test của một PROTOTYPE — phạm vi cố ý hẹp, và nói rõ hẹp ở đâu.
 *
 * Thứ được khoá: bộ SERIALIZE (màn → prompt) và các dây nối dễ đứt CÂM (route,
 * danh mục lấy từ kit-core, luật "để trống = kế thừa"). Đó là phần sẽ sống
 * tiếp nếu ý tưởng được chốt, và cũng là phần hỏng KHÔNG BÁO — gõ lệch một tên
 * node thì prompt chỉ thiếu một mảnh, không ai thấy.
 *
 * Thứ KHÔNG được khoá: gõ phím trong ProseMirror, menu `/` mở đúng chỗ, dropdown
 * pill, công tắc chế độ. Chúng cần DOM thật (`*.dom.test.tsx`, config riêng) và
 * với một lab thì cái giá đó chưa đáng — người thật sẽ sờ trực tiếp, đó là mục
 * đích của cả màn này. Chúng ĐÃ được kiểm bằng tay trên trình duyệt.
 */

const PRESETS = seedPresets();
const ctx = () => makeContext({ presets: PRESETS, styleEN: "STYLE_CHUNG", themeEN: "THEME_CHUNG" });

const state = (partial: Partial<ComposerState> = {}): ComposerState => ({
  themeValue: OUTFIT_THEMES[0]!.value,
  styleId: PRESETS.styles[0]!.id,
  /* Mặc định KHÔNG màu, để những ca không nói về màu đọc ra đúng thứ chúng
     kiểm. Ca nào về màu thì tự truyền vào. */
  brandColors: [],
  contextMode: "template",
  blocks: [],
  ...partial,
});

describe("serialize — pill đổi thành cụm TIẾNG ANH, không phải nhãn tiếng Việt", () => {
  it("câu Cảnh nền mặc định: mọi pill ra chữ EN, nhãn VI không lọt vào prompt", () => {
    const out = serializeDoc(backgroundDoc() as PromptDocNode, ctx());
    expect(out).toContain(phraseOf("scene", "main-menu", PRESETS));
    expect(out).toContain(phraseOf("mood", "festive", PRESETS));
    expect(out).toContain("[ảnh tham chiếu]");
    expect(out).not.toContain("Màn hình chính");
    expect(out).not.toContain("Rộn ràng");
  });

  it("câu Nhân vật: pill trang phục để TRỐNG ⇒ kế thừa theme chung", () => {
    const out = serializeDoc(mascotDoc() as PromptDocNode, ctx());
    expect(out).toContain(phraseOf("pose", "idle", PRESETS));
    expect(out).toContain(EXPRESSIONS[0]!.value);
    /* Đây là luật quan trọng nhất của cả model: ô để trống KHÔNG phải là ô rỗng,
       nó là "theo cái chung". Hỏng luật này thì mọi block âm thầm mất theme. */
    expect(out).toContain("THEME_CHUNG");
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
    expect(first).toContain(OUTFIT_THEMES[0]!.value);
    expect(first).toContain(PRESETS.styles[0]!.en);
    expect(first).toContain("a palette built around vivid orange-red (#ff5533) as the dominant brand colour");
    expect(first).toContain("accented with deep navy blue (#112233)");
    expect(first).not.toMatch(/brand palette:/i);
    expect(first.endsWith(".")).toBe(true);
  });

  it("KHÔNG nhắc lại palette ở từng dòng cell — một bộ nhận diện, không phải mỗi ô một bảng màu", () => {
    const cells: UiCell[] = [
      { id: "c1", elementId: "button", styleId: INHERIT, decor: "4", glazeId: "", sizeId: "", note: "" },
      { id: "c2", elementId: "coin", styleId: INHERIT, decor: "2", glazeId: "", sizeId: "", note: "" },
    ];
    const out = serializeComposer(
      state({ brandColors: ["#ff5533", "#112233"], blocks: [{ id: "u1", kind: "uikit", mode: "template", cells }] }),
      PRESETS,
    );
    expect(out.match(/a palette built around/g)).toHaveLength(1);
    expect(out.match(/#ff5533/g)).toHaveLength(1);
  });
});

describe("serialize cả màn — mỗi block một đoạn, ảnh đánh số liên tục", () => {
  it("dòng đầu là NGỮ CẢNH CHUNG, mọi block kế thừa nó", () => {
    const out = serializeComposer(state(), PRESETS);
    expect(out.split("\n")[0]).toContain(OUTFIT_THEMES[0]!.value);
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
      { id: "c1", elementId: "button", styleId: INHERIT, decor: "4", glazeId: "glass", sizeId: "", note: "" },
      { id: "c2", elementId: "coin", styleId: "match3", decor: "2", glazeId: "", sizeId: "", note: "xoay 15 độ" },
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
        { id: "b1", kind: "background", mode: "template", doc: withImages(["a", "b"]) },
        { id: "b2", kind: "mascot", mode: "template", doc: withImages(["c"]) },
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

  it("ô mới kế thừa phong cách chung và ăn mặc định của element preset", () => {
    const cell = newCell("coin", PRESETS);
    expect(cell.styleId).toBe(INHERIT);
    /* Đục nền KHÔNG còn được áp sẵn theo loại element (nó là hiệu ứng, không phải
       bản chất của "icon tiền"); CỠ thì có, vì cỡ là hình học. */
    expect(cell.glazeId).toBe("");
    expect(cell.sizeId).toBe("s");
    expect(cell.decor).toBe("2");
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

describe("dây nối route + hai màn render được", () => {
  it.each(["/lab/prompt-composer", "/lab/prompt-composer/presets"])("`%s` có trong cây route", (path) => {
    expect(JSON.stringify(routeTree).replaceAll("\\/", "/")).toContain(path);
  });

  /**
   * Hai màn có `<Link>` giữa chúng, mà `<Link>` đọc router qua context — render
   * trần sẽ ném "Cannot read properties of null (reading 'isServer')". Nên bọc
   * bằng `RouterContextProvider` với ĐÚNG router thật của app (cùng `routeTree`,
   * cùng `notFoundMode` như App.tsx). Bọc bằng một router bịa ra thì test xanh
   * trong khi link thật có thể trỏ vào một path không tồn tại.
   */
  const withRouter = (node: React.ReactNode) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/lab/prompt-composer"] }),
      notFoundMode: "root",
      context: { queryClient },
    });
    /* `QueryClientProvider` là dây MỚI từ Wave 4·A: danh mục preset đã rời
       localStorage sang `GET /api/library`, nên `usePresets()` gọi `useQueryClient()`.
       Router context có sẵn một `queryClient` nhưng đó là context của ROUTER —
       react-query đọc context RIÊNG của nó, hai thứ khác nhau. */
    return renderToString(
      <QueryClientProvider client={queryClient}>
        <RouterContextProvider router={router}>{node}</RouterContextProvider>
      </QueryClientProvider>,
    );
  };

  it("smoke: Composer render không ném, và nói rõ mình là lab", () => {
    /* `immediatelyRender: false` trong `useEditor` là thứ làm cho lần render đầu
       KHÔNG chạm DOM — nên `renderToString` chạy được ở môi trường `node` mà
       không cần jsdom. Test này chính là cái canh tuỳ chọn đó không bị ai gỡ. */
    const html = withRouter(<PromptComposerScreen />);
    expect(html).toContain("Lab demo");
    expect(html).toContain("Prompt xem trước");
    expect(html).toContain("Thêm block");
  });

  it("smoke: trang preset render và nói ĐÚNG nơi danh mục được lưu", () => {
    const html = withRouter(<PresetsScreen />);
    expect(html).toContain("Preset của lab");
    /* Wave 4·A: kho đã rời localStorage. Câu trên màn phải đổi theo — một màn nói
       "lưu trong trình duyệt này" trong khi dữ liệu nằm ở workspace là một lời
       nói dối, và người dùng sẽ dựa vào nó để quyết định có sao lưu hay không. */
    expect(html).toContain("workspace KitGen");
    expect(html).not.toContain("trình duyệt này");
  });
});
