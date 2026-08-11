/**
 * S1 — từ điển copy. Tiêu chí FE3-PLAN §3-S1: "ba câu §5.5 khớp TỪNG KÝ TỰ".
 * Chuỗi kỳ vọng dưới đây được chép trực tiếp từ `simplify/UX-V3.md` §5.5 — nếu ai sửa
 * `copy.ts` cho "mượt hơn", test này đỏ ngay, đó là mục đích.
 */
import { describe, expect, it } from "vitest";
import {
  BANNED_WORDS, BTN, EMPTY, MODE_CARD, MSG, SUBTITLE, TITLE, TITLE_FLAT, TITLE_N_TAIL, TRUTH,
  briefFilled, btnRedrawAll, btnRedrawSheet, estimateRange, wholeSheetOnly,
} from "../lib/copy";

describe("§5.5 — ba câu chống nói dối, khớp TỪNG KÝ TỰ", () => {
  it("câu 1 — vẽ cả tấm", () => {
    expect(TRUTH.WHOLE_SHEET_ONLY).toBe(
      "Máy vẽ cả tấm một lần, không vẽ lẻ từng món. Sửa món này thì phải vẽ lại cả tấm 16 món."
    );
  });
  it("câu 2 — chưa có bản cũ để so", () => {
    expect(TRUTH.NO_OLD_VERSION).toBe("Chưa có bản cũ để so — từ lần vẽ sau máy mới giữ bản cũ.");
  });
  it("câu 3 — ước lượng lượt hỏi", () => {
    expect(TRUTH.ESTIMATE_RANGE).toBe("Khoảng 15–25 lượt hỏi (ước lượng, có thể lệch).");
  });

  it("câu 2 dùng EM DASH «—», câu 3 dùng EN DASH «–» đúng như tài liệu", () => {
    expect(TRUTH.NO_OLD_VERSION).toContain("\u2014");
    expect(TRUTH.ESTIMATE_RANGE).toContain("\u2013");
  });

  it("hàm dựng câu 1 với số món thật khớp hằng số khi n = 16", () => {
    expect(wholeSheetOnly(16)).toBe(TRUTH.WHOLE_SHEET_ONLY);
  });
  it("hàm dựng câu 3 với khoảng thật khớp hằng số khi 15–25", () => {
    expect(estimateRange(15, 25)).toBe(TRUTH.ESTIMATE_RANGE);
  });
  it("hàm dựng vẫn giữ đủ chữ «khoảng» và «ước lượng» với số khác", () => {
    const s = estimateRange(3, 7);
    expect(s).toBe("Khoảng 3–7 lượt hỏi (ước lượng, có thể lệch).");
    expect(s.toLowerCase()).toContain("khoảng");
    expect(s).toContain("ước lượng");
  });
  it("số vô lý ⇒ quay về mặc định, không sinh câu vô nghĩa", () => {
    expect(wholeSheetOnly(0)).toBe(TRUTH.WHOLE_SHEET_ONLY);
    expect(wholeSheetOnly(Number.NaN)).toBe(TRUTH.WHOLE_SHEET_ONLY);
    expect(estimateRange(-1, -5)).toBe(TRUTH.ESTIMATE_RANGE);
    expect(estimateRange(9, 2)).toBe("Khoảng 9–9 lượt hỏi (ước lượng, có thể lệch).");
  });
});

describe("§5.1 — nút «Vẽ lại cả tấm», TUYỆT ĐỐI không phải «Sinh lại ô này»", () => {
  it("có số món và giá ~1 lượt", () => {
    expect(btnRedrawSheet(16)).toBe("Vẽ lại cả tấm (16 món) · ~1 lượt");
    expect(btnRedrawSheet(4)).toBe("Vẽ lại cả tấm (4 món) · ~1 lượt");
  });
  it("không chứa chữ «ô này» ở bất kỳ số nào", () => {
    for (const n of [1, 4, 9, 16, 0, -2]) expect(btnRedrawSheet(n)).not.toContain("ô này");
  });
  it("vẽ lại toàn bộ nói số lượt", () => {
    expect(btnRedrawAll(5)).toBe("Vẽ lại toàn bộ · ~5 lượt");
  });
});

describe("§5.2 — tiêu đề nhấn serif ĐÚNG MỘT TỪ", () => {
  it("ghép lại đúng tiêu đề phẳng", () => {
    // Home mới cố ý dùng một tiêu đề nhỏ, không còn công thức serif của màn cũ.
    expect(TITLE_FLAT.H).toBe("Dự án");
    expect(`${TITLE.W2.lead} ${TITLE.W2.accent}`).toBe(TITLE_FLAT.W2);
    expect(`${TITLE.N.lead} ${TITLE.N.accent} ${TITLE_N_TAIL}`).toBe(TITLE_FLAT.N);
  });
  it("phần nhấn của màn N và W2 đúng MỘT từ (công thức FLORA)", () => {
    expect(TITLE.N.accent.trim().split(/\s+/)).toHaveLength(1);
    expect(TITLE.W2.accent.trim().split(/\s+/)).toHaveLength(1);
    expect(TITLE.C1_EMPTY.accent.trim().split(/\s+/)).toHaveLength(1);
  });
  it("W1 có đúng 4 tiêu đề trang", () => {
    expect(TITLE_FLAT.W1).toHaveLength(4);
    expect(TITLE_FLAT.W1[0]).toBe("Bộ kit này cho việc gì?");
    expect(TITLE_FLAT.W1[3]).toBe("Xem lại rồi bắt đầu nhé");
  });
});

describe("§5.3 — empty-state đủ 8 màn, mỗi cái có tiêu đề + thân", () => {
  it("không cái nào rỗng", () => {
    for (const [k, e] of Object.entries(EMPTY)) {
      expect(e.title, k).toBeTruthy();
      expect(e.body, k).toBeTruthy();
    }
  });
  it("C1 CỐ Ý không có nút riêng (nút nằm ở thanh nổi — UX-V3 §5.3)", () => {
    expect(EMPTY.c1.action).toBeNull();
    expect(EMPTY.c1.body).toContain("Nhờ máy vẽ");
  });
  it("Home có nút tạo bộ kit đầu tiên", () => {
    expect(EMPTY.home.action).toBe(BTN.CREATE_FIRST_KIT);
  });
});

describe("§2 — hai thẻ hình thái dùng chữ mới, KHÔNG dùng chữ cũ bị cấm", () => {
  it("tiêu đề đúng chỉ đạo FLOW-V3", () => {
    expect(MODE_CARD.workflow.title).toBe("Điền form, máy làm");
    expect(MODE_CARD.canvas.title).toBe("Tự tay xếp trên bàn");
  });
  it("không còn «Quy trình chuẩn» / «free-style» / «canvas»", () => {
    const all = Object.values(MODE_CARD)
      .map((m) => `${m.title} ${m.body} ${m.fit} ${m.cta} ${m.cardLabel}`)
      .join(" ")
      .toLowerCase();
    for (const w of ["quy trình chuẩn", "free-style", "canvas", "workflow", "mode", "template"]) {
      expect(all, w).not.toContain(w);
    }
  });
  /* P-SWEEP·11 — hình đi kèm nhãn ĐỔI MEDIUM: emoji ⚙️/🎨 → icon lucide (`MODE_ICON`
     trong `KitCard.tsx`), để thẻ Home nói cùng thứ tiếng với dialog tạo mới và với
     bộ icon line 1.5px của cả app. Bất biến a11y §5.8-A3 mà ca này canh KHÔNG đổi —
     "hình luôn đi kèm CHỮ, không bao giờ đứng một mình" — nên phần `cardLabel` giữ
     nguyên; chỉ vế `emoji` bỏ đi cùng trường đã xoá khỏi `ModeCardCopy`. */
  it("nhãn thẻ Home luôn có CHỮ, không bao giờ chỉ là một cái hình", () => {
    for (const m of Object.values(MODE_CARD)) {
      expect(m.cardLabel.replace(/\s/g, "").length).toBeGreaterThan(0);
    }
  });
});

describe("chữ trên nút và câu dùng chung không chứa từ cấm §5.4", () => {
  /** Từ tiếng Anh trong danh sách cấm — kiểm theo ranh giới từ để «form»/«Figma» không bị bắt oan. */
  const enWords = BANNED_WORDS.filter((w) => /^[a-z-]+$/.test(w));
  const viPhrases = BANNED_WORDS.filter((w) => !/^[a-z-]+$/.test(w));

  const surfaces: [string, string][] = [
    ...Object.entries(BTN),
    ...Object.entries(MSG).filter(([k]) => k !== "DEV_DETAILS" && k !== "AGENT_OFF_CMD"),
    ...Object.entries(SUBTITLE),
    ...Object.entries(EMPTY).flatMap(([k, v]) => [
      [`${k}.title`, v.title],
      [`${k}.body`, v.body],
    ] as [string, string][]),
    ...Object.entries(TRUTH),
  ];

  for (const [key, text] of surfaces) {
    it(`«${key}» sạch`, () => {
      const low = text.toLowerCase();
      for (const w of enWords) {
        expect(new RegExp(`(^|[^a-z-])${w}([^a-z-]|$)`).test(low), `${key}: "${text}" chứa «${w}»`).toBe(false);
      }
      for (const p of viPhrases) expect(low, `${key}: "${text}"`).not.toContain(p);
    });
  }
});

describe("nhãn bắt buộc của mock GEN (FE3-PLAN §4)", () => {
  it("nói rõ chưa gọi máy vẽ", () => {
    expect(MSG.GEN_MOCK_BADGE).toBe("bản xem trước — chưa gọi máy vẽ");
  });
});

describe("briefFilled", () => {
  it("dựng đúng câu §3.1", () => {
    expect(briefFilled(9, 4)).toBe(
      "Đã điền hộ 9 chỗ. 4 chỗ máy không chắc đã để trống — bạn xem lại các ô có dấu ⚠."
    );
  });
});
