/**
 * S1 — hình thái bộ kit (⚙️/🎨). Tiêu chí FE3-PLAN §3-S1:
 * "test khẳng định `stripSystemTags` không để lọt `kg-*`" + mặc định workflow khi thiếu tag.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_KIT_MODE, KG_TAG_CANVAS, KG_TAG_WORKFLOW, KIT_MODES,
  isKitMode, isSystemTag, modeFilterTag, modeIsExplicit, modeTags, readMode, stripSystemTags, tagsWithMode,
} from "../lib/kit-mode";

describe("readMode — đọc hình thái từ tag", () => {
  it("có kg-canvas ⇒ canvas", () => {
    expect(readMode({ tags: ["tet", KG_TAG_CANVAS] })).toBe("canvas");
  });
  it("có kg-workflow ⇒ workflow", () => {
    expect(readMode({ tags: [KG_TAG_WORKFLOW] })).toBe("workflow");
  });
  it("KHÔNG có tag hình thái ⇒ mặc định workflow (BA-V3 §1.4)", () => {
    expect(readMode({ tags: ["tet", "vcb"] })).toBe(DEFAULT_KIT_MODE);
    expect(DEFAULT_KIT_MODE).toBe("workflow");
  });
  it("có CẢ HAI tag (user sửa tay) ⇒ mặc định workflow, không đoán, không ném", () => {
    expect(readMode({ tags: [KG_TAG_CANVAS, KG_TAG_WORKFLOW] })).toBe("workflow");
    expect(modeIsExplicit({ tags: [KG_TAG_CANVAS, KG_TAG_WORKFLOW] })).toBe(false);
  });
  it("phân biệt hoa/thường không làm lệch hình thái", () => {
    expect(readMode({ tags: ["KG-Canvas"] })).toBe("canvas");
  });
  it("dữ liệu rác không làm ném lỗi", () => {
    for (const bad of [null, undefined, {}, { tags: null }, { tags: "kg-canvas" }, { tags: [1, null, "  "] }]) {
      expect(() => readMode(bad as never)).not.toThrow();
      expect(readMode(bad as never)).toBe("workflow");
    }
  });
  it("modeIsExplicit=true chỉ khi có đúng một tag hình thái", () => {
    expect(modeIsExplicit({ tags: [KG_TAG_CANVAS] })).toBe(true);
    expect(modeIsExplicit({ tags: ["tet"] })).toBe(false);
  });
});

describe("stripSystemTags — kg-* KHÔNG BAO GIỜ lọt ra UI", () => {
  it("lọc cả hai tag hình thái", () => {
    expect(stripSystemTags(["tet", KG_TAG_CANVAS, "vcb", KG_TAG_WORKFLOW])).toEqual(["tet", "vcb"]);
  });
  it("lọc MỌI tiền tố kg-, kể cả tag hệ thống chưa tồn tại hôm nay", () => {
    expect(stripSystemTags(["kg-tuong-lai", "kg-", "KG-HOA", "thường"])).toEqual(["thường"]);
  });
  it("bất biến: kết quả không còn phần tử nào bắt đầu bằng kg-", () => {
    const messy = ["a", KG_TAG_CANVAS, "kg-x", "KG-Y", " kg-z ", "b", "", "  ", null, 7];
    for (const t of stripSystemTags(messy)) {
      expect(isSystemTag(t)).toBe(false);
      expect(t.toLowerCase().startsWith("kg-")).toBe(false);
    }
  });
  it("giữ nguyên thứ tự và chữ hoa/thường của tag người dùng", () => {
    expect(stripSystemTags(["Tết", KG_TAG_WORKFLOW, "VCB"])).toEqual(["Tết", "VCB"]);
  });
  it("dữ liệu rác ⇒ mảng rỗng, không ném", () => {
    for (const bad of [null, undefined, "kg-canvas", 5, {}]) expect(stripSystemTags(bad)).toEqual([]);
  });
});

describe("modeTags / tagsWithMode — payload cho #8 và #10", () => {
  it("modeTags trả đúng một tag hệ thống", () => {
    expect(modeTags("canvas")).toEqual([KG_TAG_CANVAS]);
    expect(modeTags("workflow")).toEqual([KG_TAG_WORKFLOW]);
  });
  it("đổi hình thái: giữ tag người dùng, thay sạch tag hình thái cũ", () => {
    expect(tagsWithMode(["tet", KG_TAG_WORKFLOW, "vcb"], "canvas")).toEqual(["tet", "vcb", KG_TAG_CANVAS]);
  });
  it("dọn được ca hỏng có cả hai tag", () => {
    const out = tagsWithMode([KG_TAG_CANVAS, KG_TAG_WORKFLOW, "x"], "workflow");
    expect(out.filter((t) => t.startsWith("kg-"))).toEqual([KG_TAG_WORKFLOW]);
  });
  it("đi vòng: tagsWithMode rồi readMode ra đúng hình thái đã đặt", () => {
    for (const m of KIT_MODES) expect(readMode({ tags: tagsWithMode(["a"], m) })).toBe(m);
  });
  it("modeFilterTag dùng cho GET /api/projects?tag=", () => {
    expect(modeFilterTag("canvas")).toBe(KG_TAG_CANVAS);
  });
});

describe("isKitMode", () => {
  it("nhận đúng 2 giá trị", () => {
    expect(isKitMode("workflow")).toBe(true);
    expect(isKitMode("canvas")).toBe(true);
    expect(isKitMode("freestyle")).toBe(false);
    expect(isKitMode(null)).toBe(false);
  });
});
