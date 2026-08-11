import { describe, expect, it } from "vitest";
import { readBrief } from "@/features/docs/lib/brief-read";
import { DEFAULT_VALUES, briefToForm } from "../lib/form-model";
import { buildStylePrompt, sliderValueText, STYLE_AXES } from "../lib/style-phrases";

describe("bảng câu phong cách tĩnh", () => {
  it("đủ 7 thang x 7 nấc", () => {
    expect(STYLE_AXES).toHaveLength(7);
    for (const axis of STYLE_AXES) expect(axis.phrases).toHaveLength(7);
    expect(buildStylePrompt(DEFAULT_VALUES.style).split(", ")).toHaveLength(7);
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
