import { describe, expect, it } from "vitest";
import {
  GEN_MINUTES_PER_JOB,
  genCost,
  genCostLine,
  genMinutes,
  genUnits,
  minutesPhrase,
  wholeKitNote,
} from "../lib/gen-cost";
import { GEN_GROUP_NOTE } from "../lib/gen-kinds";

/**
 * FE3-PLAN §3-C2 đòi test `gen-cost` **phủ 1 món / 9 món / N tấm**. Ba ca đó nằm ở
 * describe đầu tiên; phần còn lại canh những chỗ mô hình chi phí dễ nói dối nhất.
 */
describe("BA-V3 §3.2 — ba ca bắt buộc", () => {
  it("1 món ⇒ ~1 lượt", () => {
    expect(genUnits({ kind: "element", componentCount: 1 })).toBe(1);
  });

  it("9 món ⇒ VẪN ~1 lượt (máy vẽ cả nhóm một lần)", () => {
    expect(genUnits({ kind: "element", componentCount: 9 })).toBe(1);
  });

  it("cả bộ kit với N thứ trên bàn ⇒ ~N lượt", () => {
    for (const n of [1, 2, 5, 17]) {
      expect(genUnits({ kind: "kit", boardItemCount: n })).toBe(n);
    }
  });
});

describe("genUnits — các ca còn lại", () => {
  it("ảnh nền và tư thế nhân vật luôn là 1 lượt", () => {
    expect(genUnits({ kind: "bg" })).toBe(1);
    expect(genUnits({ kind: "pose" })).toBe(1);
  });

  it("chưa chọn món nào ⇒ 0 lượt (KHÔNG phải «miễn phí», nút Vẽ phải khoá)", () => {
    expect(genUnits({ kind: "element", componentCount: 0 })).toBe(0);
    expect(genUnits({ kind: "element" })).toBe(0);
  });

  it("bàn trống ⇒ cả bộ kit là 0 lượt", () => {
    expect(genUnits({ kind: "kit", boardItemCount: 0 })).toBe(0);
  });

  it("số hỏng (NaN, âm, thập phân) không bao giờ sinh ra số lượt hỏng", () => {
    expect(genUnits({ kind: "kit", boardItemCount: Number.NaN })).toBe(0);
    expect(genUnits({ kind: "kit", boardItemCount: -3 })).toBe(0);
    expect(genUnits({ kind: "kit", boardItemCount: 4.9 })).toBe(4);
    expect(genUnits({ kind: "element", componentCount: Number.POSITIVE_INFINITY })).toBe(0);
  });
});

describe("thời gian và dòng chi phí — luôn có chữ «~» và «khoảng» (luật N5)", () => {
  it("1 lượt ⇒ đúng câu của UX-V3 §4.1", () => {
    expect(genCostLine(1)).toBe("Tốn ~1 lượt hỏi · khoảng 1–2 phút");
  });

  it("nhiều lượt thì phút nhân lên theo hệ số đã khai", () => {
    expect(genMinutes(3)).toEqual([3 * GEN_MINUTES_PER_JOB[0], 3 * GEN_MINUTES_PER_JOB[1]]);
    expect(minutesPhrase(3)).toBe("khoảng 3–6 phút");
  });

  it("0 lượt ⇒ nói thẳng là chưa có gì để vẽ, KHÔNG hiện «~0 lượt»", () => {
    expect(genCostLine(0)).toBe("Chưa có gì để vẽ.");
    expect(minutesPhrase(0)).toBe("");
  });

  it("mọi dòng chi phí khác rỗng đều mang dấu «~» và chữ «khoảng»", () => {
    for (const n of [1, 2, 7, 30]) {
      const line = genCostLine(n);
      expect(line).toContain("~");
      expect(line).toContain("khoảng");
    }
  });
});

describe("câu nói thật kèm theo", () => {
  it("lệnh «Món giao diện» LUÔN mang câu «vẽ cả nhóm một lần» nguyên văn", () => {
    expect(genCost({ kind: "element", componentCount: 4 }).note).toBe(GEN_GROUP_NOTE);
  });

  it("lệnh «Cả bộ kit» dựng câu theo SỐ THẬT, không hardcode N", () => {
    expect(wholeKitNote(5)).toBe("Sẽ vẽ 5 thứ đang có trên bàn · ~5 lượt.");
    expect(genCost({ kind: "kit", boardItemCount: 2 }).note).toBe(
      "Sẽ vẽ 2 thứ đang có trên bàn · ~2 lượt.",
    );
  });

  it("bàn trống ⇒ câu nói rõ là chưa có gì, không hứa vẽ", () => {
    expect(wholeKitNote(0)).toBe("Bàn chưa có gì để vẽ lại.");
  });

  it("ảnh nền / tư thế không có câu bắt buộc nào", () => {
    expect(genCost({ kind: "bg" }).note).toBe("");
    expect(genCost({ kind: "pose" }).note).toBe("");
  });
});
