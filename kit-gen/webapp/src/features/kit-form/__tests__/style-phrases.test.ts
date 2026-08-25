import { describe, expect, it } from "vitest";
import { readBrief } from "@/features/docs/lib/brief-read";
import { DEFAULT_VALUES, STYLE_AXIS_IDS, briefToForm } from "../lib/form-model";
import { buildStylePrompt, sliderValueText, STYLE_AXES } from "../lib/style-phrases";

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
