import { describe, expect, it } from "vitest";
import { diffContracts, diffSentence, summarize, summaryText } from "../diff";
import { formatWhen } from "../format-time";
import type { Contract } from "@/lib/types";

const sheet = (id: string, files: string[]) => ({
  id,
  grid: { cols: files.length, rows: 1 },
  components: files.map((f) => ({ file: f, vi: f, spec: "", skel: { shape: "rect", w: 0.8, h: 0.6 } })),
});

const mk = (o: Partial<Contract> = {}): Contract =>
  ({ schemaVersion: 4, sheets: [], variants: [], characterPoses: [], ...o }) as unknown as Contract;

describe("tóm tắt hai cột của modal so sánh", () => {
  it("đếm đúng sheet / element / phong cách", () => {
    const c = mk({
      sheets: [sheet("main", ["01-a", "02-b"]), sheet("tall", ["03-c"])] as never,
      variants: [{ id: "tet", vi: "Tết đỏ", style: "", bg: "" }] as never,
    });
    expect(summarize(c)).toEqual({ sheets: 2, components: 3, variants: 1 });
    expect(summaryText(c)).toBe("2 sheet · 3 element · 1 phong cách");
  });

  it("contract null ⇒ toàn 0, không ném (ca 'chưa nạp xong')", () => {
    expect(summarize(null)).toEqual({ sheets: 0, components: 0, variants: 0 });
  });
});

describe("so sánh khác biệt tối thiểu — nguyên liệu để user chọn đúng ở modal 409", () => {
  it("hai bản giống hệt ⇒ identical, không có dòng nào", () => {
    const a = mk({ sheets: [sheet("main", ["01-a"])] as never });
    const b = mk({ sheets: [sheet("main", ["01-a"])] as never });
    const d = diffContracts(a, b);
    expect(d.identical).toBe(true);
    expect(d.rows).toHaveLength(0);
  });

  it("sheet CHỈ CÓ ở bản của tôi ⇒ 'thêm'", () => {
    const mine = mk({ sheets: [sheet("main", ["01-a"]), sheet("tall", ["02-b"])] as never });
    const theirs = mk({ sheets: [sheet("main", ["01-a"])] as never });
    const d = diffContracts(mine, theirs);
    expect(d.added).toBe(1);
    expect(d.rows[0]).toMatchObject({ kind: "added", what: "Sheet", label: "tall" });
  });

  it("sheet CHỈ CÓ trên đĩa ⇒ 'bớt' — ĐÂY LÀ THỨ USER CẦN BIẾT trước khi ghi đè", () => {
    const mine = mk({ sheets: [sheet("main", ["01-a"])] as never });
    const theirs = mk({ sheets: [sheet("main", ["01-a"]), sheet("pose-lan", ["02-b"])] as never });
    const d = diffContracts(mine, theirs);
    expect(d.removed).toBe(1);
    expect(d.rows.find((r) => r.kind === "removed")?.label).toBe("pose-lan");
  });

  it("đổi SỐ Ô trong sheet ⇒ 'sửa', kèm chi tiết cũ → mới", () => {
    const mine = mk({ sheets: [sheet("main", ["01-a", "02-b"])] as never });
    const theirs = mk({ sheets: [sheet("main", ["01-a"])] as never });
    const d = diffContracts(mine, theirs);
    expect(d.changed).toBe(1);
    expect(d.rows[0]!.detail).toBe("1 → 2 element");
  });

  it("đổi NỘI DUNG element (cùng số ô) vẫn bị bắt", () => {
    const mine = mk({ sheets: [sheet("main", ["01-a"])] as never });
    const theirs = mk({ sheets: [sheet("main", ["01-z"])] as never });
    const d = diffContracts(mine, theirs);
    expect(d.changed).toBe(1);
    expect(d.rows[0]!.detail).toBe("nội dung element đã đổi");
  });

  it("phong cách thêm / bớt / sửa đều được nêu", () => {
    const mine = mk({ variants: [{ id: "tet", vi: "Tết đỏ", style: "đỏ", bg: "" }] as never });
    const theirs = mk({ variants: [{ id: "vang", vi: "Vàng kim", style: "", bg: "" }] as never });
    const d = diffContracts(mine, theirs);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.rows.some((r) => r.what === "Phong cách")).toBe(true);
  });

  it("đọc được contract dùng tên cũ `styles[]` trên đĩa (arch §2.4)", () => {
    // Dữ liệu THẬT trên đĩa (styles.json) không có khoá `variants` — nên fixture
    // phải bỏ hẳn khoá đó, chứ không phải để `variants: []`. `contractVariants`
    // của R0 dùng `c.variants ?? c.styles`, mà `[] ?? x` cho `[]`.
    const onDisk = {
      schemaVersion: 4, sheets: [], characterPoses: [],
      styles: [{ id: "tet", vi: "Tết", style: "", bg: "" }],
    } as unknown as Contract;
    const inApp = mk({ variants: [{ id: "tet", vi: "Tết", style: "", bg: "" }] as never });
    expect(diffContracts(onDisk, inApp).identical).toBe(true);
  });

  it("null ở một bên ⇒ mọi thứ bên kia là 'thêm', không ném", () => {
    const mine = mk({ sheets: [sheet("main", ["01-a"])] as never });
    expect(diffContracts(mine, null).added).toBe(1);
    expect(diffContracts(null, mine).removed).toBe(1);
    expect(diffContracts(null, null).identical).toBe(true);
  });

  it("giới hạn 40 dòng để modal không dài vô tận", () => {
    const many = mk({ sheets: Array.from({ length: 60 }, (_, i) => sheet(`s${i}`, ["01-a"])) as never });
    const d = diffContracts(many, mk());
    expect(d.rows.length).toBe(40);
    expect(d.added).toBe(60); // số ĐẾM vẫn đúng dù chỉ hiện 40 dòng
  });
});

describe("câu tóm tắt khác biệt", () => {
  it("giống nhau ⇒ nói rõ là giống, không để trống", () => {
    expect(diffSentence(diffContracts(mk(), mk()))).toContain("giống nhau");
  });

  it("gộp đủ thêm/bớt/sửa vào một câu", () => {
    const mine = mk({ sheets: [sheet("a", ["01-a"]), sheet("b", ["02-b"])] as never });
    const theirs = mk({ sheets: [sheet("a", ["01-z"]), sheet("c", ["03-c"])] as never });
    const s = diffSentence(diffContracts(mine, theirs));
    expect(s).toContain("thêm 1");
    expect(s).toContain("bớt 1");
    expect(s).toContain("sửa 1");
  });
});

describe("formatWhen — không bao giờ in ISO thô ra UI", () => {
  const now = Date.parse("2026-08-06T20:00:00.000Z");

  it("hôm nay ⇒ 'hh:mm hôm nay'", () => {
    const iso = new Date(now - 3 * 3600_000).toISOString();
    expect(formatWhen(iso, now)).toMatch(/^\d{2}:\d{2} hôm nay$/);
  });

  it("hôm qua ⇒ 'hôm qua hh:mm'", () => {
    const iso = new Date(now - 26 * 3600_000).toISOString();
    expect(formatWhen(iso, now)).toMatch(/^hôm qua \d{2}:\d{2}$/);
  });

  it("cũ hơn ⇒ 'dd/MM hh:mm'", () => {
    const iso = new Date(now - 5 * 864e5).toISOString();
    expect(formatWhen(iso, now)).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("chuỗi rác ⇒ 'lần trước', KHÔNG phải 'Invalid Date'", () => {
    expect(formatWhen("không phải ngày", now)).toBe("lần trước");
    expect(formatWhen("", now)).toBe("lần trước");
  });
});
