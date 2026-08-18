/**
 * `features/home/lib/cover-title.ts` — PHÉP BÙ `object-cover` cho vùng tiêu đề ảnh bìa.
 *
 * ══ VÌ SAO HÀM NÀY ĐÁNG MỘT FILE TEST RIÊNG ══════════════════════════════════
 * Nó là chỗ DUY NHẤT chuyển toạ độ từ hệ "ảnh bìa 16:9 mà agent dặn model chừa trống"
 * sang hệ "ô ảnh 16:10 của thẻ". Sai ở đây KHÔNG làm gãy gì cả: app vẫn chạy, thẻ vẫn
 * vẽ, chỉ có tên dự án lặng lẽ nằm đè lên mặt mascot. Không test nào khác đọc nó —
 * `suite-cover.mjs` của agent chỉ đối chiếu HẰNG SỐ `TITLE_ZONE` giữa hai file, không
 * hề chạy phép bù.
 *
 * Ba nhóm ca, theo đúng ba lời hứa mà chú thích của hàm viết ra:
 *  ① đúng số ở tỉ lệ THẬT đang dùng (ô 16:10) và ở ca đồng tỉ lệ (không bù gì cả);
 *  ② BẤT BIẾN: kết quả luôn nằm trong ô — "chữ có thể mất bề rộng, KHÔNG BAO GIỜ tràn";
 *  ③ đầu vào rác không làm vỡ hình, mà rơi về tỉ lệ ảnh bìa.
 */
import { describe, expect, it } from "vitest";
import {
  AUTO_COVER_PATH, COVER_ASPECT, TITLE_ZONE, isAutoCover, shouldOverlayTitle, titleZoneStyle,
} from "../lib/cover-title";

/** Tỉ lệ ô ảnh của thẻ — PHẢI khớp `aspect-[16/10]` trong `KitCover.tsx`. */
const BOX_ASPECT = 16 / 10;

const num = (v: string) => Number.parseFloat(v.replace("%", ""));

describe("TITLE_ZONE — hằng số dùng chung với agent", () => {
  it("là dải trái, rộng 56%, cao 40%, canh giữa dọc", () => {
    expect(TITLE_ZONE).toEqual({ x: 0.06, y: 0.3, w: 0.56, h: 0.4 });
    // Canh giữa dọc: mép trên và mép dưới cách hai biên bằng nhau.
    expect(TITLE_ZONE.y).toBeCloseTo(1 - (TITLE_ZONE.y + TITLE_ZONE.h), 10);
    expect(COVER_ASPECT).toBeCloseTo(16 / 9, 10);
  });
});

describe("titleZoneStyle — ô 16:10 của thẻ (ca thật)", () => {
  /**
   * Con số này là LỜI HỨA VIẾT TRONG CHÚ THÍCH của hàm: "16:10 cắt 5% mỗi bên ⇒ dải
   * trái 6%–62% của ẢNH thành ~1.1%–63.3% của Ô". Tính tay lại để test không chỉ chép
   * kết quả của mã: visX = (16/10)/(16/9) = 0.9 ⇒ mất 10% bề ngang, 5% mỗi mép.
   *   left  = (0.06 − 0.05) / 0.9 = 0.01111…
   *   width = 0.56 / 0.9        = 0.62222…
   */
  const s = titleZoneStyle(BOX_ASPECT);

  it("bù đúng phần bị object-cover cắt hai bên", () => {
    expect(s.left).toBe("1.111%");
    expect(s.width).toBe("62.222%");
    expect(num(s.left) + num(s.width)).toBeCloseTo(63.333, 2);
  });

  it("KHÔNG đụng vào trục dọc: 16:10 cao hơn 16:9 nên không cắt trên/dưới", () => {
    expect(s.top).toBe("30%");
    expect(s.height).toBe("40%");
  });

  it("vùng vẫn nằm ở NỬA TRÁI của ô — chỗ mascot không bao giờ ngồi", () => {
    expect(num(s.left) + num(s.width)).toBeLessThan(70);
  });
});

describe("titleZoneStyle — ô cùng tỉ lệ ảnh bìa thì không bù gì", () => {
  it("16:9 trả về đúng TITLE_ZONE", () => {
    expect(titleZoneStyle(COVER_ASPECT)).toEqual({
      left: "6%", top: "30%", width: "56%", height: "40%",
    });
  });
});

describe("titleZoneStyle — ô hẹp / ô rộng: cắt bề nào thì bù bề đó", () => {
  it("ô VUÔNG (hẹp hơn): cắt hai bên rất nhiều ⇒ vùng bị đẩy sát mép trái, trục dọc giữ nguyên", () => {
    const sq = titleZoneStyle(1);
    // visX = 1/(16/9) = 0.5625 ⇒ mất 43.75% bề ngang, 21.875% mỗi mép.
    // left danh nghĩa = (0.06 − 0.21875)/0.5625 < 0 ⇒ KẸP về 0, không được âm.
    expect(sq.left).toBe("0%");
    expect(num(sq.width)).toBeCloseTo(99.556, 2);
    expect(sq.top).toBe("30%");
    expect(sq.height).toBe("40%");
  });

  it("ô RẤT RỘNG (21:9-ish): đổi sang cắt trên/dưới ⇒ trục dọc mới là bên bị bù", () => {
    const wide = titleZoneStyle(4);
    expect(wide.left).toBe("6%");
    expect(wide.width).toBe("56%");
    // visY = (16/9)/4 = 0.4444 ⇒ top = (0.3 − 0.27778)/0.4444 = 0.05 ; height = 0.4/0.4444 = 0.9
    expect(wide.top).toBe("5%");
    expect(wide.height).toBe("90%");
  });
});

describe("titleZoneStyle — BẤT BIẾN: không bao giờ tràn ra ngoài ô", () => {
  /* Tràn ra ngoài ô nghĩa là chip tên dự án đè lên phần khác của thẻ (tên, badge,
     nút ⋯) — hỏng THẤY ĐƯỢC nhưng không màn hình nào báo lỗi. Quét rộng thay vì
     đoán vài tỉ lệ: mọi ô từ rất dẹt tới rất cao đều phải nằm gọn trong [0,100]. */
  const aspects = [0.2, 0.5, 0.75, 1, 1.2, 1.5, 16 / 10, 16 / 9, 2, 3, 5, 12];

  it.each(aspects)("tỉ lệ ô %f: mọi mép nằm trong [0%%, 100%%]", (a) => {
    const z = titleZoneStyle(a);
    for (const v of [z.left, z.top, z.width, z.height]) {
      expect(num(v)).toBeGreaterThanOrEqual(0);
      expect(num(v)).toBeLessThanOrEqual(100);
    }
    expect(num(z.left) + num(z.width)).toBeLessThanOrEqual(100.001);
    expect(num(z.top) + num(z.height)).toBeLessThanOrEqual(100.001);
  });

  it("luôn trả chuỗi CSS có đơn %, không phải số trần", () => {
    const z = titleZoneStyle(BOX_ASPECT);
    for (const v of [z.left, z.top, z.width, z.height]) expect(v).toMatch(/^\d+(\.\d+)?%$/);
  });
});

describe("titleZoneStyle — đầu vào rác rơi về tỉ lệ ảnh bìa, không vỡ hình", () => {
  const same = titleZoneStyle(COVER_ASPECT);
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "boxAspect = %p",
    (bad) => { expect(titleZoneStyle(bad)).toEqual(same); },
  );
});

describe("titleZoneStyle — nhận zone khác (dùng toạ độ agent gửi kèm #43)", () => {
  it("không khoá cứng TITLE_ZONE: zone truyền vào cũng được bù đúng", () => {
    const z = titleZoneStyle(COVER_ASPECT, { x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
    expect(z).toEqual({ left: "10%", top: "10%", width: "30%", height: "20%" });
  });

  it("zone tràn sẵn ở phía nguồn vẫn bị kẹp lại, không đẩy lỗi ra DOM", () => {
    const z = titleZoneStyle(COVER_ASPECT, { x: 0.8, y: 0.9, w: 0.9, h: 0.9 });
    expect(num(z.left) + num(z.width)).toBeCloseTo(100, 3);
    expect(num(z.top) + num(z.height)).toBeCloseTo(100, 3);
  });
});

describe("isAutoCover — chỉ ảnh bìa TỰ SINH mới được overlay chữ", () => {
  it("đúng với ảnh bìa tự sinh", () => {
    expect(isAutoCover(AUTO_COVER_PATH)).toBe(true);
    expect(AUTO_COVER_PATH).toBe("cover/cover.png");
  });

  it("sai với ảnh user tự chọn từ kit, và với ca chưa có bìa", () => {
    expect(isAutoCover("kits/chinh/01-btn-pill-red.png")).toBe(false);
    expect(isAutoCover("cover/cover-2.png")).toBe(false);
    expect(isAutoCover(null)).toBe(false);
    expect(isAutoCover(undefined)).toBe(false);
    expect(isAutoCover("")).toBe(false);
  });
});

/**
 * ══ CHỮ ĐÚP LÀ LỖI ĐẮT NHẤT Ở ĐÂY ═══════════════════════════════════════════
 * Từ bản vá 18/08, agent kẻ TÊN DỰ ÁN thẳng vào tấm bìa (`agent/lib/cover.mjs` ③).
 * Dán thêm chip tên lên đó = hai lần cùng một cái tên chồng lên nhau, ngay trên màn
 * hình đầu tiên của app. Chiều ngược lại cũng có giá: tắt overlay nhầm trên một tấm
 * bìa CŨ (trong ảnh không có chữ) là tên dự án biến mất khỏi tấm bìa.
 * Nên hàm này bị khoá theo cả hai chiều, cộng ca "chưa biết".
 */
describe("shouldOverlayTitle — dán tên đè lên bìa hay không", () => {
  const AUTO = AUTO_COVER_PATH;

  it("bìa tự sinh CŨ (agent chưa gửi cờ) → vẫn dán, đúng hành vi trước bản vá", () => {
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: {}, metaPending: false })).toBe(true);
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: undefined, metaPending: false })).toBe(true);
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: null, metaPending: false })).toBe(true);
  });

  it("agent BÁO đã kẻ chữ vào tranh → KHÔNG dán nữa (không chữ đúp)", () => {
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: { titleEmbedded: true }, metaPending: false })).toBe(false);
  });

  it("agent báo CHƯA kẻ (dự án không có tên dùng được) → dán như cũ", () => {
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: { titleEmbedded: false }, metaPending: false })).toBe(true);
  });

  it("cờ không phải boolean `true` đều là 'chưa kẻ' — không suy diễn từ giá trị rác", () => {
    for (const junk of ["true", 1, {}, [], "yes"]) {
      const cover = { titleEmbedded: junk } as unknown as { titleEmbedded?: boolean };
      expect(shouldOverlayTitle({ coverPath: AUTO, cover, metaPending: false })).toBe(true);
    }
  });

  it("CHƯA BIẾT (query #43 còn đang bay) → chưa dán, để chip tên không nháy lên rồi biến mất", () => {
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: undefined, metaPending: true })).toBe(false);
    // …và ngay khi câu trả lời về, ca bìa cũ dán lại như thường.
    expect(shouldOverlayTitle({ coverPath: AUTO, cover: {}, metaPending: false })).toBe(true);
  });

  it("ảnh bìa user tự chọn / chưa có bìa: KHÔNG bao giờ dán, bất kể cờ nói gì", () => {
    for (const p of ["kits/chinh/01-btn-pill-red.png", null, undefined, ""]) {
      expect(shouldOverlayTitle({ coverPath: p, cover: { titleEmbedded: false }, metaPending: false })).toBe(false);
      expect(shouldOverlayTitle({ coverPath: p, cover: undefined, metaPending: true })).toBe(false);
    }
  });
});
