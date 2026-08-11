/** S1 — nhãn màn đã rời đường chính (FE3-PLAN §0-N8: đánh dấu, KHÔNG xoá). */
import { describe, expect, it } from "vitest";
import { DEPRECATED_SCREENS, deprecatedScreenNotice, deprecatedTag } from "../lib/deprecate";

describe("deprecatedScreenNotice", () => {
  it("đủ 5 màn rời đường chính", () => {
    expect(DEPRECATED_SCREENS).toEqual(["overview", "design", "runs", "kit-library", "subfiles"]);
  });

  it("mỗi màn có tiêu đề + thân + đường về", () => {
    for (const s of DEPRECATED_SCREENS) {
      const n = deprecatedScreenNotice(s)!;
      expect(n.title, s).toBeTruthy();
      expect(n.body, s).toBeTruthy();
      expect(n.back, s).toBeTruthy();
    }
  });

  it("mã lạ ⇒ null, màn KHÔNG vỡ", () => {
    expect(deprecatedScreenNotice("không-có-màn-này")).toBeNull();
  });

  it("chữ hiện ra UI không chứa thuật ngữ kỹ thuật (devNote thì được)", () => {
    for (const s of DEPRECATED_SCREENS) {
      const n = deprecatedScreenNotice(s)!;
      const shown = `${n.title} ${n.body} ${n.back}`.toLowerCase();
      for (const w of ["project", "contract", "sheet", "variant", "canvas", "workflow", "doc"]) {
        expect(shown, `${s}: «${shown}» chứa «${w}»`).not.toContain(w);
      }
    }
  });

  it("deprecatedTag sinh chú thích JSDoc có trỏ nguồn chỉ đạo", () => {
    const tag = deprecatedTag("design");
    expect(tag).toContain("@deprecated");
    expect(tag).toContain("FLOW-V3 §4");
    expect(tag).toContain("Không xoá");
  });
});
