/**
 * ĐỢT 08/2026 — BỐN Ý KIẾN CỦA TEAM, ĐO Ở TẦNG HỢP ĐỒNG.
 *
 * Bốn thứ dưới đây có chung một cách hỏng: người dùng chọn xong, UI hiện đúng, và
 * `spec` gửi cho máy vẽ **không đổi một chữ**. Đó là cái bẫy mà `resolveKitset()` đã
 * dính một lần rồi (bản cũ chỉ chép `w`/`h` — xem §P1-4), nên mọi trường mới đều phải
 * có một ca đi TRỌN đường tới `components[].spec` của contract, chứ không dừng ở store.
 *
 *  ① mô tả sửa tay      — ý kiến 1 ("chỗ sửa prompt background");
 *  ② chất liệu + mức kính — ý kiến 4 ("đục nền theo material");
 *  ③ biểu cảm theo dáng  — ý kiến 2c;
 *  ④ chủ đề trang phục   — ý kiến 5.
 *
 * Ràng buộc xuyên suốt, và là ca quan trọng nhất file: **dự án cũ không đổi một chữ**.
 * Không chọn gì mới ⇒ `spec` phải BẰNG ĐÚNG chuỗi của bản trước.
 */
import { describe, expect, it } from "vitest";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import {
  createWorkflowStore, hydrateWorkflowStore, resetWorkflowStores, workflowDraftOf, type WorkflowState,
} from "../model";
import { MATERIAL_PRESETS, materialPhrase, materialPreset } from "../materials";
import { EXPRESSIONS, OUTFIT_THEMES, isPresetPhrase, phraseLabel } from "../poses";
import { itemPromptFor } from "../item-prompt";
import {
  GLASS_LEVEL_SPEC,
  POSE_SPEC,
  buildKitsetContract,
  looksLikeGlass,
  pickContractInput,
  poseSpecFor,
  resolveElementSpec,
  resolveKitset,
} from "../kitset-to-contract";

const LIB: LibElement[] = loadBundledV2().elements;

function defaultState(): WorkflowState {
  resetWorkflowStores();
  return createWorkflowStore("kit-spec-override").getState();
}

const build = (patch: Partial<WorkflowState> = {}) =>
  buildKitsetContract({ ...defaultState(), ...patch }, { lib: LIB });

/** Đặt lớp đè lên MỘT món và bật chọn nó — cùng khuôn với §P1-4. */
const withSkel = (file: string, skel: WorkflowState["elements"][number]["skel"]): Partial<WorkflowState> => {
  const s = defaultState();
  return { elements: s.elements.map((e) => (e.file === file ? { ...e, selected: true, skel } : e)) };
};

const cellOf = (contract: ReturnType<typeof build>, file: string) =>
  contract.sheets.flatMap((sh) => sh.components).find((cp) => cp.file === file);

/** Ô ngang thường, thư viện KHÔNG khai `matte` — chiều "bật lên" đo được sạch nhất. */
const PLAIN = LIB.find((e) => e.skel.matte === undefined && e.skel.shape !== "full" && e.cell !== "portrait")!;
const BG = "25-bg-home";

/* ══════════════════════════════════════════════════════════════════════════
   ① MÔ TẢ SỬA TAY — kể cả mô tả CẢNH NỀN (ý kiến 1)
   ══════════════════════════════════════════════════════════════════════════ */

describe("ý kiến 1 — mô tả của một ô sửa được, và bản sửa đi tới contract", () => {
  it("KHÔNG đè ⇒ contract giữ NGUYÊN VĂN `spec` của thư viện", () => {
    expect(cellOf(build(), PLAIN.file)?.spec).toBe(PLAIN.spec);
    expect(cellOf(build(), BG)?.spec).toBe(LIB.find((e) => e.file === BG)!.spec);
  });

  it("đè ⇒ contract nhận ĐÚNG chữ người dùng gõ, không phải chữ thư viện", () => {
    const c = build(withSkel(PLAIN.file, { spec: "a chunky wooden button with rope trim" }));
    expect(cellOf(c, PLAIN.file)?.spec).toBe("a chunky wooden button with rope trim");
  });

  /**
   * CA TRẢ LỜI THẲNG Ý KIẾN 1. Nền trước đây là ô DUY NHẤT không có đường sửa mô tả —
   * `25-bg-home`/`26-bg-play` lấy `spec` từ thư viện chung và người dùng không chạm được.
   * Nay nền đi CHUNG một đường với mọi ô khác, nên ca này chỉ cần đo rằng nó thật sự
   * chung đường (không có nhánh riêng nào bỏ sót nền).
   */
  it("CẢNH NỀN cũng sửa được — nó là element như mọi element khác", () => {
    const c = build(withSkel(BG, { spec: "một sân đình ngày Tết, mái ngói cong, đèn lồng đỏ" }));
    expect(cellOf(c, BG)?.spec).toBe("một sân đình ngày Tết, mái ngói cong, đèn lồng đỏ");
    // …và nó vẫn là tấm nền 1×1 dọc, không bị lôi sang nhóm khác vì đã sửa chữ.
    const sheet = c.sheets.find((sh) => sh.components.some((cp) => cp.file === BG))!;
    expect(sheet.orient).toBe("portrait");
  });

  it("bản đè chảy THẲNG vào preview `Prompt sẽ gửi đi` (cùng một contract, không dựng lại)", () => {
    const c = build(withSkel(PLAIN.file, { spec: "a glossy jade token" }));
    const prompt = itemPromptFor(c, PLAIN.file)!;
    expect(prompt.line).toContain("a glossy jade token");
    expect(prompt.line).not.toContain(PLAIN.spec);
  });

  it("xoá hết chữ = trả về mặc định, KHÔNG phải gửi đi một mô tả rỗng", () => {
    resetWorkflowStores();
    const store = createWorkflowStore("kit-spec-clear");
    store.getState().setElementSkel(PLAIN.file, { spec: "tạm" });
    expect(store.getState().elements.find((e) => e.file === PLAIN.file)?.skel?.spec).toBe("tạm");
    store.getState().setElementSkel(PLAIN.file, { spec: "   " });
    expect(store.getState().elements.find((e) => e.file === PLAIN.file)?.skel).toBeUndefined();
    expect(cellOf(buildKitsetContract(store.getState(), { lib: LIB }), PLAIN.file)?.spec).toBe(PLAIN.spec);
  });

  it("lớp đè KHÔNG chạm vào thư viện chung (bộ nhớ dùng lại giữa các dự án)", () => {
    build(withSkel(PLAIN.file, { spec: "đã đổi" }));
    expect(LIB.find((e) => e.file === PLAIN.file)!.spec).toBe(PLAIN.spec);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② CHẤT LIỆU + MỨC KÍNH (ý kiến 4)
   ══════════════════════════════════════════════════════════════════════════ */

describe("ý kiến 4 — chất liệu nối vào mô tả, mức kính chỉ nói khi ô thật sự là kính", () => {
  it("mỗi preset khai đủ id · nhãn VI · cụm EN · cách tách gợi ý", () => {
    expect(MATERIAL_PRESETS.length).toBeGreaterThanOrEqual(10);
    for (const preset of MATERIAL_PRESETS) {
      expect(preset.id, preset.id).toMatch(/^[a-z][a-z-]*$/);
      expect(preset.vi.length, preset.id).toBeGreaterThan(0);
      expect(preset.en.length, preset.id).toBeGreaterThan(10);
      expect(["glow", "glass", "none"], preset.id).toContain(preset.suggestedMatte);
    }
    expect(new Set(MATERIAL_PRESETS.map((m) => m.id)).size).toBe(MATERIAL_PRESETS.length);
  });

  /* Bảng chất liệu CÒN NGUYÊN (di sản: bản nháp cũ mang id của nó, và
     `glazeFromMaterial` tra ngược qua đây), nên hai ca hình dạng vẫn phải xanh. */
  it("chất liệu trong suốt gợi ý `glass`, chất liệu phát sáng gợi ý `glow`, chất liệu đục gợi ý `none`", () => {
    expect(materialPreset("glass")!.suggestedMatte).toBe("glass");
    expect(materialPreset("ice")!.suggestedMatte).toBe("glass");
    expect(materialPreset("fire")!.suggestedMatte).toBe("glow");
    expect(materialPreset("glow")!.suggestedMatte).toBe("glow");
    expect(materialPreset("wood")!.suggestedMatte).toBe("none");
    expect(materialPreset("gold-metal")!.suggestedMatte).toBe("none");
  });

  /**
   * ══ 08/2026 — CHẤT LIỆU ĐÃ RỜI `spec`, ĐỤC NỀN THAY CHỖ ═══════════════════
   * Chủ sản phẩm: *«Chất liệu → bỏ, nó ăn theo style mà. Chỉ có option ĐỤC NỀN»*.
   * Nên ba ca dưới đổi kỳ vọng chứ không bị xoá: chúng vẫn đi TRỌN đường tới
   * `components[].spec` (đúng tinh thần đầu file), chỉ khác ở chỗ thứ đi vào đó
   * nay là câu về ĐỘ XUYÊN THẤU, không phải câu tả bề mặt.
   */
  it("chất liệu ĐỤC (gỗ · đá · kim loại) KHÔNG còn nói gì trong `spec`", () => {
    const c = build(withSkel(PLAIN.file, { material: "gold-metal" }));
    /* Thẩm mỹ nay do prompt tổng phong cách lo — nhắc lại ở từng ô là dạy máy vẽ
       rằng mỗi element có chất liệu riêng, ngược hẳn ý "một bộ nhận diện". */
    expect(cellOf(c, PLAIN.file)?.spec).toBe(PLAIN.spec);
  });

  it("chất liệu TỰ GÕ cũng không còn đi vào `spec` — không có đục nền nào tra ra từ nó", () => {
    const c = build(withSkel(PLAIN.file, { material: "brushed copper with soft patina" }));
    expect(cellOf(c, PLAIN.file)?.spec).toBe(PLAIN.spec);
    /* `materialPhrase` vẫn còn (di sản, có nơi khác đọc) nhưng KHÔNG còn ai nối
       kết quả của nó vào contract. Ca này khoá đúng điều đó. */
    expect(materialPhrase("brushed copper with soft patina")).toBe("brushed copper with soft patina");
    expect(materialPhrase("")).toBe("");
  });

  it("chất liệu TRONG SUỐT đời cũ ⇒ dịch sang đục nền, bám theo MÔ TẢ ĐÃ SỬA", () => {
    const c = build(withSkel(PLAIN.file, { spec: "a hexagon token", material: "ice" }));
    const spec = cellOf(c, PLAIN.file)!.spec;
    expect(spec.startsWith("a hexagon token,")).toBe(true);
    /* Câu về độ xuyên thấu — KHÔNG phải câu tả bề mặt băng của bảng chất liệu cũ. */
    expect(spec).toContain(GLASS_LEVEL_SPEC.tinted);
    expect(spec).not.toContain("glacial");
  });

  it("đục nền tự kéo theo `matte`, kể cả khi lớp đè chỉ khai mỗi nó", () => {
    const c = build(withSkel(PLAIN.file, { glaze: "glow" }));
    const cell = cellOf(c, PLAIN.file)!;
    /* Nửa PROMPT… */
    expect(cell.spec).toContain("emits its own light");
    /* …và nửa SLICER. Thiếu nửa này là bệnh `research-glow-extraction` gọi tên. */
    expect((cell.skel as Record<string, unknown>).matte).toBe("glow");
  });

  it("`matte` khai TAY thắng `matte` của đục nền — người bấm nút thắng preset", () => {
    const c = build(withSkel(PLAIN.file, { glaze: "ice", matte: "none" }));
    const cell = cellOf(c, PLAIN.file)!;
    expect((cell.skel as Record<string, unknown>).matte).toBeUndefined();
    /* Ô đã về nền đặc ⇒ KHÔNG nói câu alpha nữa (cùng luật với mức kính bị giữ). */
    expect(cell.spec).not.toContain("alpha about");
  });

  it("ba mức kính có câu riêng, và câu ấy vào contract khi ô đang là kính", () => {
    for (const level of ["clear", "frosted", "tinted"] as const) {
      const c = build(withSkel(PLAIN.file, { matte: "glass", glassLevel: level }));
      expect(cellOf(c, PLAIN.file)?.spec, level).toBe(`${PLAIN.spec}, ${GLASS_LEVEL_SPEC[level]}`);
    }
    expect(GLASS_LEVEL_SPEC.clear).toContain("a clear pane");
    expect(GLASS_LEVEL_SPEC.frosted).toContain("strongly frosted");
    expect(GLASS_LEVEL_SPEC.tinted).toContain("strongly tinted glass");
  });

  /**
   * Ô KHÔNG PHẢI KÍNH THÌ KHÔNG NÓI GÌ VỀ ALPHA.
   *
   * Giá trị vẫn được GIỮ trong bản nháp (đổi ý lần nữa là có lại), nhưng nói ra lúc
   * `matte` không phải `glass` là dặn máy vẽ hạ alpha xuống 128 trong khi `slice.py`
   * đang cắt ô như một mảng đặc — ảnh ra mờ và không ai tìm được nguyên nhân.
   */
  it("mức kính bị GIỮ nhưng KHÔNG nói ra khi ô không còn là kính", () => {
    const c = build(withSkel(PLAIN.file, { glassLevel: "tinted" }));
    expect(cellOf(c, PLAIN.file)?.spec).toBe(PLAIN.spec);
    const off = build(withSkel("03-btn-pill-outline", { matte: "none", glassLevel: "tinted" }));
    expect(cellOf(off, "03-btn-pill-outline")?.spec).not.toContain("alpha about");
  });

  it("đục nền + mức kính khai tay ⇒ mô tả · câu đục nền · mức kính KHAI TAY", () => {
    const c = build(withSkel(PLAIN.file, { glaze: "glass-gradient", matte: "glass", glassLevel: "frosted" }));
    expect(cellOf(c, PLAIN.file)?.spec).toBe(
      `${PLAIN.spec}, its transparency fades from top to bottom, ${GLASS_LEVEL_SPEC.frosted}`,
    );
  });

  it("chữ đục nền/mức kính KHÔNG rò vào `skel` của contract (đó là chỗ của slicer)", () => {
    const c = build(withSkel(PLAIN.file, { glaze: "ice", matte: "glass", glassLevel: "clear" }));
    const skel = cellOf(c, PLAIN.file)!.skel as Record<string, unknown>;
    expect(skel.matte).toBe("glass");
    expect(skel.glaze).toBeUndefined();
    expect(skel.material).toBeUndefined();
    expect(skel.glassLevel).toBeUndefined();
    expect(skel.spec).toBeUndefined();
  });

  it("preview của ô nhận cả đục nền lẫn mức kính (không phải một bản dựng lại)", () => {
    const c = build(withSkel(PLAIN.file, { glaze: "glow" }));
    const prompt = itemPromptFor(c, PLAIN.file)!;
    expect(prompt.line).toContain("emits its own light");
    expect(prompt.line).toContain("LIGHT EFFECT"); // câu glow của gen.sh vẫn nối sau cùng
  });

  it("`looksLikeGlass` bắt cả tiếng Việt có dấu lẫn tiếng Anh, và không bắt bừa", () => {
    for (const text of ["khay kính mờ", "kinh cuong luc", "a crystal orb", "see-through panel", "pha lê"]) {
      expect(looksLikeGlass(text), text).toBe(true);
    }
    for (const text of ["", "a glossy red pill button", "kim loại vàng"]) {
      expect(looksLikeGlass(text), text).toBe(false);
    }
  });

  it("`resolveElementSpec` không đè gì ⇒ trả về đúng `spec` thư viện", () => {
    expect(resolveElementSpec(PLAIN, undefined)).toBe(PLAIN.spec);
    expect(resolveElementSpec(PLAIN, {})).toBe(PLAIN.spec);
  });

  it("`resolveKitset` giữ NGUYÊN object thư viện khi không có gì để đè (không sinh rác)", () => {
    const s = defaultState();
    const { drawable } = resolveKitset(s.elements, LIB);
    const hit = drawable.find((e) => e.file === PLAIN.file)!;
    expect(hit).toBe(LIB.find((e) => e.file === PLAIN.file));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ BIỂU CẢM THEO DÁNG (ý kiến 2c)
   ══════════════════════════════════════════════════════════════════════════ */

describe("ý kiến 2c — nét mặt theo dáng, và dự án cũ không đổi một chữ", () => {
  it("KHÔNG chọn biểu cảm ⇒ câu dáng bằng ĐÚNG chuỗi cũ của `POSE_SPEC`", () => {
    for (const pose of Object.keys(POSE_SPEC)) {
      expect(poseSpecFor(pose), pose).toBe(POSE_SPEC[pose]);
      expect(poseSpecFor(pose, ""), pose).toBe(POSE_SPEC[pose]);
      expect(poseSpecFor(pose, "   "), pose).toBe(POSE_SPEC[pose]);
    }
  });

  it("dáng ĐÃ tự khai nét mặt ⇒ THAY mệnh đề ấy, không cộng thêm câu thứ hai", () => {
    expect(POSE_SPEC.sad).toContain("sad expression");
    const out = poseSpecFor("sad", "a big bright smile");
    expect(out).toBe("looking down with slumped shoulders, a big bright smile");
    expect(out).not.toContain("sad expression");
  });

  it("dáng chưa nói gì về mặt ⇒ NỐI THÊM vào cuối", () => {
    expect(poseSpecFor("wave", "winking one eye with a playful grin"))
      .toBe("waving one hand high in greeting, winking one eye with a playful grin");
  });

  it("dáng lạ (dữ liệu cũ) vẫn chạy, rơi về chính id", () => {
    expect(poseSpecFor("khong-co-that")).toBe("khong-co-that");
    expect(poseSpecFor("khong-co-that", "a big bright smile")).toBe("khong-co-that, a big bright smile");
  });

  it("biểu cảm của MỘT nhân vật đi vào ĐÚNG ô dáng của con đó trong contract", () => {
    const c = build({
      mascotPoses: ["idle", "sad"],
      mascots: [{
        id: "m1", name: "Mèo", description: "mèo xanh", ref: null,
        poseExpressions: { sad: "a big bright smile" },
      }],
    });
    const cells = c.sheets.flatMap((sh) => sh.components).filter((cp) => cp.skel.shape === "pose");
    const sad = cells.find((cp) => cp.skel.pose === "sad")!;
    const idle = cells.find((cp) => cp.skel.pose === "idle")!;
    expect(sad.spec).toContain("a big bright smile");
    // Dáng KHÔNG được chọn biểu cảm giữ nguyên văn — hai dáng không lây nhau.
    expect(idle.spec).toContain(POSE_SPEC.idle);
    expect(idle.spec).not.toContain("a big bright smile");
  });

  it("hai nhân vật, hai bộ mặt — nét mặt gắn vào NHÂN VẬT, không vào danh sách dáng", () => {
    const c = build({
      mascotPoses: ["idle"],
      mascots: [
        { id: "m1", name: "Mèo", description: "mèo xanh", ref: null, poseExpressions: { idle: "a big bright smile" } },
        { id: "m2", name: "Sóc", description: "sóc nâu", ref: null, poseExpressions: { idle: "a sad downcast expression" } },
      ],
    });
    const cells = c.sheets.flatMap((sh) => sh.components).filter((cp) => cp.skel.shape === "pose");
    expect(cells.find((cp) => cp.file.includes("nhan-vat-2"))!.spec).toContain("a sad downcast expression");
    expect(cells.find((cp) => !cp.file.includes("nhan-vat-2"))!.spec).toContain("a big bright smile");
  });

  it("7 biểu cảm dựng sẵn có nhãn VI riêng và giá trị là cụm TIẾNG ANH", () => {
    expect(EXPRESSIONS).toHaveLength(7);
    expect(EXPRESSIONS.map((e) => e.label)).toEqual([
      "Cười tươi", "Phấn khích", "Băn khoăn", "Buồn", "Ngạc nhiên", "Quyết tâm", "Nháy mắt",
    ]);
    for (const option of EXPRESSIONS) expect(option.value, option.label).toMatch(/^[\x20-\x7e]+$/);
    expect(phraseLabel(EXPRESSIONS, "a big bright smile")).toBe("Cười tươi");
    // Cụm TỰ GÕ không có nhãn VI ⇒ hiện nguyên văn, không biến mất.
    expect(phraseLabel(EXPRESSIONS, "a sleepy look")).toBe("a sleepy look");
    expect(isPresetPhrase(EXPRESSIONS, "a sleepy look")).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ CHỦ ĐỀ TRANG PHỤC (ý kiến 5)
   ══════════════════════════════════════════════════════════════════════════ */

describe("ý kiến 5 — chủ đề trang phục vào SUBJECT của ô dáng", () => {
  const poseSpecs = (c: ReturnType<typeof build>) =>
    c.sheets.flatMap((sh) => sh.components).filter((cp) => cp.skel.shape === "pose").map((cp) => cp.spec);

  it("6 chủ đề dựng sẵn có nhãn VI và cụm tiếng Anh đọc xuôi sau chữ `wearing`", () => {
    expect(OUTFIT_THEMES.map((o) => o.label)).toEqual(["Tết", "Giáng sinh", "Hè", "Đông", "Bóng đá", "Halloween"]);
    for (const option of OUTFIT_THEMES) expect(option.value, option.label).toMatch(/^an? /);
    expect(phraseLabel(OUTFIT_THEMES, "a Vietnamese Tết festive outfit with red and gold")).toBe("Tết");
  });

  it("KHÔNG đặt chủ đề ⇒ subject KHÔNG có mệnh đề `wearing` nào (dự án cũ không đổi)", () => {
    for (const spec of poseSpecs(build({ mascots: [{ id: "m1", name: "Mèo", description: "mèo xanh", ref: null }] }))) {
      expect(spec).not.toContain("wearing");
    }
  });

  it("chủ đề CẢ BỘ áp cho mọi nhân vật chưa tự chọn", () => {
    const c = build({
      outfitTheme: "a football kit with a team jersey, shorts and long socks",
      mascotPoses: ["idle"],
      mascots: [
        { id: "m1", name: "Mèo", description: "mèo xanh", ref: null },
        { id: "m2", name: "Sóc", description: "sóc nâu", ref: null },
      ],
    });
    const specs = poseSpecs(c);
    expect(specs).toHaveLength(2);
    for (const spec of specs) expect(spec).toContain("wearing a football kit with a team jersey, shorts and long socks");
  });

  it("con nào tự khai trang phục riêng thì BẢN CỦA NÓ THẮNG chủ đề chung", () => {
    const c = build({
      outfitTheme: "a football kit with a team jersey, shorts and long socks",
      mascotPoses: ["idle"],
      mascots: [
        { id: "m1", name: "Mèo", description: "mèo xanh", ref: null, outfitTheme: "a Halloween costume with a pumpkin motif and a dark cape" },
        { id: "m2", name: "Sóc", description: "sóc nâu", ref: null },
      ],
    });
    const cells = c.sheets.flatMap((sh) => sh.components).filter((cp) => cp.skel.shape === "pose");
    expect(cells.find((cp) => !cp.file.includes("nhan-vat-2"))!.spec).toContain("a Halloween costume");
    expect(cells.find((cp) => cp.file.includes("nhan-vat-2"))!.spec).toContain("a football kit");
  });

  it("trang phục nằm ở SUBJECT (đầu câu), không lẫn vào mệnh đề dáng", () => {
    const spec = poseSpecs(build({
      outfitTheme: "a warm winter outfit with a thick knitted scarf and coat",
      mascotPoses: ["run"],
      mascots: [{ id: "m1", name: "Mèo", description: "mèo xanh", ref: null }],
    }))[0]!;
    expect(spec.indexOf("wearing")).toBeLessThan(spec.indexOf(POSE_SPEC.run!));
  });

  it("có ẢNH MẪU ⇒ vẫn là 'the SAME character from the reference photo', chỉ cộng trang phục", () => {
    const spec = poseSpecs(build({
      outfitTheme: "a Vietnamese Tết festive outfit with red and gold",
      mascotPoses: ["idle"],
      mascots: [{ id: "m1", name: "Mèo", description: "mèo xanh", ref: { name: "char-meo.png" } }],
    }))[0]!;
    expect(spec.startsWith("the SAME character from the reference photo wearing a Vietnamese Tết")).toBe(true);
  });

  it("`pickContractInput` MANG THEO `outfitTheme` — thiếu là memo contract không đổi khi user đổi chủ đề", () => {
    const s = { ...defaultState(), outfitTheme: "a football kit with a team jersey, shorts and long socks" };
    expect(pickContractInput(s).outfitTheme).toBe("a football kit with a team jersey, shorts and long socks");
    expect(JSON.stringify(pickContractInput(s))).not.toBe(JSON.stringify(pickContractInput(defaultState())));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ BẢN NHÁP CŨ — thiếu trường mới thì NHẬN MẶC ĐỊNH, không vỡ
   ══════════════════════════════════════════════════════════════════════════ */

describe("bản nháp đời trước không có trường mới nào", () => {
  /** Đúng hình dạng một bản nháp ghi từ build TRƯỚC đợt này: không outfit, không expression. */
  const legacyDraft = () => ({
    step: 3, unlocked: 3, kitName: "Kit cũ", campaign: "", brief: "",
    stylePrompt: "vui tươi", styleMode: "prompt", brandProfileId: null, styleRefs: [],
    primaryColor: "#005BAA", secondaryColor: "#00B0F0", styleAvoid: "",
    kitsetSummary: "Bộ khung UI đã chọn", sliceThreshold: 120,
    brandRefs: [], mascotEnabled: true, mascotName: "Mèo", mascotDescription: "mèo xanh", mascotRef: null,
    mascots: [{ id: "m1", name: "Mèo", description: "mèo xanh", ref: null }],
    mascotPoses: ["idle", "sad"],
    elements: [{ file: "25-bg-home", label: "Nền màn HOME", role: "", cell: "tràn nền", selected: true }],
    kitsetTouched: true, versions: [], activeVersion: "",
  });

  it("nạp bản nháp cũ ⇒ `outfitTheme` về mặc định rỗng, không phải `undefined`", () => {
    resetWorkflowStores();
    const store = createWorkflowStore("kit-nhap-cu");
    hydrateWorkflowStore(store, legacyDraft());
    expect(store.getState().outfitTheme).toBe("");
    expect(store.getState().mascots[0]?.outfitTheme).toBeUndefined();
  });

  it("dựng contract từ bản nháp cũ KHÔNG ném, và không có chữ `undefined` nào trong prompt", () => {
    resetWorkflowStores();
    const store = createWorkflowStore("kit-nhap-cu-2");
    hydrateWorkflowStore(store, legacyDraft());
    const c = buildKitsetContract(store.getState(), { lib: LIB });
    const specs = c.sheets.flatMap((sh) => sh.components).map((cp) => cp.spec);
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) expect(spec).not.toContain("undefined");
    // Câu dáng bằng ĐÚNG chuỗi cũ — đây là lời hứa "dự án cũ không đổi".
    const sad = c.sheets.flatMap((sh) => sh.components).find((cp) => cp.skel.pose === "sad")!;
    expect(sad.spec).toBe(`mèo xanh, ${POSE_SPEC.sad}, full body`);
  });

  it("lớp đè `skel` đời cũ (chỉ có `w`/`h`) vẫn trộn đúng, không bị trường mới làm rơi", () => {
    const c = build(withSkel(PLAIN.file, { w: 0.42, h: 0.5 }));
    expect(cellOf(c, PLAIN.file)?.skel).toMatchObject({ w: 0.42, h: 0.5 });
    expect(cellOf(c, PLAIN.file)?.spec).toBe(PLAIN.spec);
  });

  /**
   * VÒNG ĐỜI ĐẦY ĐỦ: state → `workflowDraftOf` (thứ ghi ra đĩa) → `hydrateWorkflowStore`
   * (thứ đọc lại). Trường mới nào quên khai trong `workflowDraftOf` sẽ sống đúng tới lúc
   * F5 rồi biến mất — im lặng, và người dùng chỉ phát hiện khi ảnh gen ra sai.
   */
  it("trường mới sống sót qua một vòng lưu bản nháp rồi nạp lại", () => {
    resetWorkflowStores();
    const source = createWorkflowStore("kit-vong-doi");
    source.getState().set({
      outfitTheme: "a Vietnamese Tết festive outfit with red and gold",
      mascotPoses: ["idle"],
    });
    source.getState().addMascot({
      name: "Mèo", description: "mèo xanh", ref: null,
      outfitTheme: "a Halloween costume with a pumpkin motif and a dark cape",
      poseExpressions: { idle: "a big bright smile" },
    });
    source.getState().setElementSkel(PLAIN.file, { spec: "chữ của tôi", material: "ice", glassLevel: "clear" });

    const onDisk = JSON.parse(JSON.stringify(workflowDraftOf(source.getState()))) as Record<string, unknown>;
    resetWorkflowStores();
    const reloaded = createWorkflowStore("kit-vong-doi-2");
    hydrateWorkflowStore(reloaded, onDisk);

    const after = reloaded.getState();
    expect(after.outfitTheme).toBe("a Vietnamese Tết festive outfit with red and gold");
    expect(after.mascots[0]?.outfitTheme).toBe("a Halloween costume with a pumpkin motif and a dark cape");
    expect(after.mascots[0]?.poseExpressions).toEqual({ idle: "a big bright smile" });
    expect(after.elements.find((e) => e.file === PLAIN.file)?.skel)
      .toEqual({ spec: "chữ của tôi", material: "ice", glassLevel: "clear" });
  });
});
