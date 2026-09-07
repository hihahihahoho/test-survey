import { describe, expect, it } from "vitest";
import { readBrief } from "@/features/docs/lib/brief-read";
import { DEFAULT_VALUES, STYLE_AXIS_IDS, briefToForm } from "../lib/form-model";
import {
  AXIS_GROUP,
  AXIS_MID,
  buildStylePrompt,
  sliderValueText,
  STYLE_AXES,
  styleAxisPhrases,
  subjectAxisLine,
} from "../lib/style-phrases";

describe("bảng câu phong cách tĩnh", () => {
  /* 8 thang từ 24/08: `ornament` (trang trí) là trục thứ 8 — feedback team §3 "mức
     chi tiết/hoa văn trên khung UI phải điều chỉnh được". Ba con số 8 ở đây phải đi
     cùng nhau: bảng câu, danh sách id của form, và số mệnh đề trong prompt gửi máy vẽ.
     Lệch một cái là có trục người dùng kéo được nhưng không tới được `gen.sh`. */
  it("đủ 8 thang x 7 nấc, và mọi trục đều ra câu", () => {
    expect(STYLE_AXES).toHaveLength(STYLE_AXIS_IDS.length);
    expect(STYLE_AXES.map((a) => a.id)).toEqual([...STYLE_AXIS_IDS]);
    for (const axis of STYLE_AXES) expect(axis.phrases).toHaveLength(7);
    expect(buildStylePrompt(DEFAULT_VALUES.style).split(", ")).toHaveLength(STYLE_AXIS_IDS.length);
  });

  /* Không cụm nào được mang dấu phẩy: `buildStylePrompt` ghép bằng `", "`, nên một dấu
     phẩy trong cụm là một trục tự tách làm đôi ở đầu ra. Ca này canh cả bảng, không
     riêng trục mới — đây đúng là chỗ trục `ornament` suýt sai lúc mới viết. */
  it("không cụm nào chứa dấu phẩy — một trục là MỘT mệnh đề", () => {
    for (const axis of STYLE_AXES) {
      for (const phrase of axis.phrases) expect(phrase, `${axis.id}: ${phrase}`).not.toContain(",");
    }
  });

  it("trục trang trí đi từ «không trang trí» tới «filigree khắp khung»", () => {
    const ornament = STYLE_AXES.find((a) => a.id === "ornament")!;
    expect([ornament.left, ornament.right]).toEqual(["Tối giản", "Cầu kỳ"]);
    expect(ornament.phrases[0]).toBe("clean minimal surfaces with no decoration");
    expect(ornament.phrases[6]).toContain("filigree");
    // Nấc 1 và nấc 7 phải ĐỐI NHAU chứ không chỉ khác chữ — nếu không, kéo hết thanh
    // sang phải mà máy vẽ vẫn hiểu là "sạch trơn".
    expect(ornament.phrases[6]).not.toContain("minimal");
  });

  it("prompt của một trục CHÍNH LÀ câu ở nấc đó — kéo trang trí lên 7 thì prompt đổi", () => {
    const mid = buildStylePrompt(DEFAULT_VALUES.style);
    const ornate = buildStylePrompt({ ...DEFAULT_VALUES.style, ornament: 7 });
    expect(mid).not.toBe(ornate);
    expect(ornate.endsWith("highly ornate with elaborate decorative flourishes and filigree on every frame")).toBe(true);
  });
  it("aria-valuetext nói bằng chữ", () => {
    expect(sliderValueText(STYLE_AXES[0]!, 6)).toBe("nấc 6 trên 7 — nghiêng về Trẻ trung");
    expect(sliderValueText(STYLE_AXES[0]!, 4)).toContain("ở giữa");
  });
});

/**
 * ══ TRỤC NÀO ĐƯỢC IN, VÀ Ở TẤM NÀO ═════════════════════════════════════════
 * Chủ sản phẩm đọc prompt thật và nói: *"khá dài dòng và không chuẩn"*. Hai
 * nguồn dài dòng đo được ở đây: (1) tám mệnh đề trung tính của tám thanh trượt
 * chưa ai kéo, (2) ba mệnh đề tả một CON NGƯỜI dán lên tấm 16 cái nút.
 */
describe("chọn trục để in — nấc giữa im lặng, trục tả người chỉ ở tấm nhân vật", () => {
  it("mỗi trục thuộc đúng một cụm, và đủ cả tám", () => {
    expect(STYLE_AXES.map((a) => AXIS_GROUP[a.id]).filter((g) => g === "subject")).toHaveLength(3);
    expect(STYLE_AXES.every((a) => AXIS_GROUP[a.id] !== undefined)).toBe(true);
  });

  it("mọi trục ở nấc giữa ⇒ KHÔNG một mệnh đề nào", () => {
    expect(styleAxisPhrases(DEFAULT_VALUES.style)).toEqual([]);
    expect(subjectAxisLine(DEFAULT_VALUES.style)).toBe("");
  });

  it("chỉ trục ĐÃ KÉO mới được in, và in đúng câu của nấc đó", () => {
    const axes = { ...DEFAULT_VALUES.style, ornament: 7, age: 1 };
    expect(styleAxisPhrases(axes)).toEqual([
      STYLE_AXES.find((a) => a.id === "age")!.phrases[0],
      STYLE_AXES.find((a) => a.id === "ornament")!.phrases[6],
    ]);
  });

  it("lọc theo cụm: câu cho CẢ BỘ KIT không mang trục tả người", () => {
    const axes = { ...DEFAULT_VALUES.style, gender: 7, ornament: 7 };
    const kit = styleAxisPhrases(axes, ["feel", "render"]);
    expect(kit).toEqual([STYLE_AXES.find((a) => a.id === "ornament")!.phrases[6]]);
    expect(subjectAxisLine(axes)).toBe(STYLE_AXES.find((a) => a.id === "gender")!.phrases[6]);
  });

  /* Ô SOẠN của form kit đời cũ vẫn cần đủ 8 mệnh đề: ở đó đầu ra là GỢI Ý điền
     sẵn cho người dùng sửa, không phải prompt gửi đi — một ô trống trơn không
     gợi được gì. Hai hàm, hai việc; ca này khoá chúng KHÔNG bị gộp lại. */
  it("`buildStylePrompt` (ô soạn của form) vẫn in cả tám, kể cả nấc giữa", () => {
    expect(buildStylePrompt(DEFAULT_VALUES.style).split(", ")).toHaveLength(STYLE_AXES.length);
    expect(AXIS_MID).toBe(4);
  });
});

describe("prefill brief", () => {
  const result = readBrief({ formId: "x", conflicts: [], sections: { sec_meta: {
    project_name: { question: "Tên", value: "Tết VCB", source: "khách", confidence: "cao" },
  }, sec_style: {
    sc_age: { question: "Tuổi", value: 6, source: "khách", confidence: "tb" },
    sc_era: { question: "Thời", value: 7, source: "suy đoán", confidence: "thap" },
    color_primary: { question: "Màu", value: "#123456", source: "khách", confidence: "tb" },
  } } });
  it("cao/tb điền được, thap luôn bị chặn", () => {
    const out = briefToForm(result);
    expect(out.name).toBe("Tết VCB");
    expect(out.style?.age).toBe(6);
    expect(out.style?.era).toBe(4);
    expect(out.primary).toBe("#123456");
  });
});
