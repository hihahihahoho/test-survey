import { describe, expect, it } from "vitest";
import { canvasDocSchema, type CanvasDoc } from "@/features/docs/lib";
import {
  PACK_NOTE_LOCKED,
  PACK_WHILE_RUNNING,
  isPackable,
  kindOfNode,
  packItems,
  packSummary,
  selectAllPackable,
  toggleSelection,
} from "../lib/pack-model";

function doc(nodes: Array<Record<string, unknown>>): CanvasDoc {
  return canvasDocSchema.parse({
    nodes: nodes.map((n, i) => ({ id: `n${i}`, type: "frame", x: 0, y: 0, w: 10, h: 10, ...n })),
  });
}

const BOARD = doc([
  { id: "mock-bg-1" },
  { id: "mock-pose-1" },
  { id: "note-1", type: "note", text: "nhớ đổi màu" },
  { id: "mock-element-1", bind: { kind: "sheet", id: "s1" } },
]);

describe("ghi chú KHÔNG vào bộ kit được (UX-V3 §4.2)", () => {
  it("`isPackable` chặn đúng node kiểu ghi chú", () => {
    expect(isPackable(BOARD.nodes[2]!)).toBe(false);
    expect(isPackable(BOARD.nodes[0]!)).toBe(true);
  });

  it("hàng ghi chú bị khoá VÀ mang đúng lý do nguyên văn", () => {
    const items = packItems(BOARD);
    const note = items.find((i) => i.id === "note-1")!;
    expect(note.selectable).toBe(false);
    expect(note.lockedReason).toBe(PACK_NOTE_LOCKED);
    expect(note.label).toBe("ghi chú");
  });

  it("chọn-tất-cả không bao giờ chọn ghi chú", () => {
    const all = selectAllPackable(packItems(BOARD));
    expect(all.has("note-1")).toBe(false);
    expect(all.size).toBe(3);
  });

  it("tick ghi chú bằng tay cũng không được tính vào tổng", () => {
    const items = packItems(BOARD);
    const sum = packSummary(items, new Set(["note-1"]));
    expect(sum.groups).toBe(0);
    expect(sum.canPack).toBe(false);
  });
});

describe("suy lệnh gen từ id object", () => {
  it("đọc đúng 4 lệnh", () => {
    expect(kindOfNode(BOARD.nodes[0]!)).toBe("bg");
    expect(kindOfNode(BOARD.nodes[1]!)).toBe("pose");
    expect(kindOfNode(BOARD.nodes[3]!)).toBe("element");
  });

  it("id lạ (user tự kéo vào) ⇒ null, KHÔNG đoán bừa", () => {
    expect(kindOfNode(BOARD.nodes[2]!)).toBeNull();
    expect(kindOfNode(doc([{ id: "mock-khong-co-lenh-nay-1" }]).nodes[0]!)).toBeNull();
  });
});

describe("dòng tổng «Đã chọn N nhóm · M món» (§4.2)", () => {
  it("chưa chọn gì ⇒ dòng rỗng và không bấm đóng gói được", () => {
    const sum = packSummary(packItems(BOARD), new Set());
    expect(sum.line).toBe("");
    expect(sum.canPack).toBe(false);
  });

  it("chọn 3 thứ ⇒ đúng câu chốt", () => {
    const items = packItems(BOARD);
    const sum = packSummary(items, selectAllPackable(items));
    expect(sum.line).toBe("Đã chọn 3 nhóm · 3 món");
    expect(sum.canPack).toBe(true);
  });

  it("thứ CHƯA vẽ được đếm riêng và có câu cảnh báo kèm giá", () => {
    const items = packItems(BOARD);
    const sum = packSummary(items, selectAllPackable(items));
    // `mock-element-1` đã `bind` ⇒ coi như đã vẽ; hai cái kia thì chưa.
    expect(sum.undrawn).toBe(2);
    expect(sum.undrawnNote).toBe("2 thứ đang chọn chưa được vẽ. Đóng gói sẽ vẽ trước · ~2 lượt.");
  });

  it("mọi thứ đã vẽ ⇒ không có câu cảnh báo thừa", () => {
    const d = doc([{ id: "mock-bg-1", bind: { kind: "sheet", id: "s1" } }]);
    const items = packItems(d);
    expect(packSummary(items, selectAllPackable(items)).undrawnNote).toBe("");
  });

  it("id lạ trong tập đã chọn (node vừa bị xoá) bị bỏ qua im lặng, không ném", () => {
    const items = packItems(BOARD);
    expect(() => packSummary(items, new Set(["khong-ton-tai"]))).not.toThrow();
    expect(packSummary(items, new Set(["khong-ton-tai"])).groups).toBe(0);
  });

  it("bàn trống ⇒ 0 thứ, không ném", () => {
    expect(packItems(null)).toEqual([]);
    expect(packSummary([], new Set()).canPack).toBe(false);
  });
});

describe("toggle — trả Set MỚI để React thấy thay đổi", () => {
  it("bật rồi tắt, và không sửa Set cũ tại chỗ", () => {
    const a = new Set<string>();
    const b = toggleSelection(a, "x");
    expect(a.size).toBe(0);
    expect(b.has("x")).toBe(true);
    expect(toggleSelection(b, "x").has("x")).toBe(false);
  });
});

describe("C-01 — câu cảnh báo khi đang vẽ nói đúng việc, và KHÔNG hứa huỷ", () => {
  it("câu nguyên văn của BA-V3 §3.4", () => {
    expect(PACK_WHILE_RUNNING).toBe(
      "Có 1 tấm đang vẽ. Tấm đó vẫn chạy tiếp; sửa lúc này sẽ khiến kết quả bị đánh dấu «cần vẽ lại».",
    );
  });

  it("không chứa chữ hứa dừng/huỷ", () => {
    expect(PACK_WHILE_RUNNING).not.toMatch(/huỷ|dừng|hủy/i);
  });
});
