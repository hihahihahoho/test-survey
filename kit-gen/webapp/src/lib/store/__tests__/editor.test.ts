/**
 * Store editor: undo/redo ≥50 bước (chốt X5 tầng 1), dấu bẩn, và selection.
 * KHÔNG persist — kiểm luôn điều đó, vì đưa 50 bản contract 55 KB vào localStorage
 * là cách chắc chắn làm vỡ quota.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { redoLabel, undoLabel, useEditorStore } from "../editor";
import { LS_KEYS, _setBackend, memoryBackend } from "../persist";
import { contractSchema, type Contract } from "../../types/contract";

/**
 * Contract mẫu có `n` element trong lưới 4×4 (16 ô), phần còn lại là ô trống.
 * Lưới cố định vì schema chặn cols/rows ở 8 — đúng giới hạn của `gen.sh`. Bản đầu của
 * helper này lấy `cols: n` và bị chính schema bắt lỗi khi n vượt 8; đó là bằng chứng
 * ràng buộc grid đang hoạt động, nên helper được sửa chứ không nới schema.
 */
const mk = (n: number): Contract =>
  contractSchema.parse({
    schemaVersion: 4,
    characterPoses: [],
    variants: [{ id: "tet", vi: "Tết", style: "", bg: "magenta" }],
    sheets: [
      {
        id: "main",
        grid: { cols: 4, rows: 4 },
        components: Array.from({ length: 16 }, (_, i) =>
          i < n
            ? { file: `${String(i + 1).padStart(2, "0")}-btn-x${i}`, vi: "", spec: "", skel: { shape: "pill", w: 0.8, h: 0.4 } }
            : { file: `_empty-${i}`, vi: "", spec: "", skel: { shape: "empty", w: 0.7, h: 0.7 } },
        ),
      },
    ],
  });

/** Đếm element THẬT (không tính ô trống) — dùng để khẳng định undo/redo về đúng bản nào. */
const realCells = (c: Contract) => c.sheets[0]!.components.filter((x) => x.skel.shape !== "empty").length;

let mem: ReturnType<typeof memoryBackend>;
beforeEach(() => {
  mem = memoryBackend();
  _setBackend(mem);
  useEditorStore.getState().reset();
});

describe("nạp & dấu bẩn", () => {
  it("init đặt version nền để lưu bằng If-Match, và bắt đầu SẠCH", () => {
    useEditorStore.getState().init("p1", mk(1), 37);
    const s = useEditorStore.getState();
    expect(s.projectId).toBe("p1");
    expect(s.baseVersion).toBe(37);
    expect(s.dirty).toBe(false);
    expect(s.dirtyCount).toBe(0);
  });

  it("apply làm bẩn và đếm số thay đổi (nút hiện 'Lưu (3)' §3.7)", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 37);
    st.apply(mk(2), "Thêm 1 element vào sheet main");
    st.apply(mk(3), "Thêm 1 element vào sheet main");
    st.apply(mk(4), "Thêm 1 element vào sheet main");
    const s = useEditorStore.getState();
    expect(s.dirty).toBe(true);
    expect(s.dirtyCount).toBe(3);
  });

  it("markSaved xoá dấu bẩn, nhận version mới, GIỮ undo stack", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 37);
    st.apply(mk(2), "x");
    useEditorStore.getState().markSaved(38);
    const s = useEditorStore.getState();
    expect(s.dirty).toBe(false);
    expect(s.baseVersion).toBe(38);
    expect(s.undoStack).toHaveLength(1); // lưu rồi vẫn hoàn tác được
  });
});

describe("undo / redo (≥50 bước, chốt X5)", () => {
  it("hoàn tác đưa về đúng bản trước", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    st.apply(mk(2), "bước 1");
    st.apply(mk(3), "bước 2");
    expect(realCells(useEditorStore.getState().draft!)).toBe(3);
    useEditorStore.getState().undo();
    expect(realCells(useEditorStore.getState().draft!)).toBe(2);
    useEditorStore.getState().undo();
    expect(realCells(useEditorStore.getState().draft!)).toBe(1);
  });

  it("làm lại khôi phục đúng bản đã hoàn tác", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    st.apply(mk(2), "bước 1");
    useEditorStore.getState().undo();
    useEditorStore.getState().redo();
    expect(realCells(useEditorStore.getState().draft!)).toBe(2);
  });

  it("làm việc MỚI sau khi hoàn tác thì nhánh redo bị bỏ (đúng ngữ nghĩa undo chuẩn)", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    st.apply(mk(2), "a");
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().canRedo()).toBe(true);
    useEditorStore.getState().apply(mk(5), "b");
    expect(useEditorStore.getState().canRedo()).toBe(false);
  });

  it("giữ được ÍT NHẤT 50 bước", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    // 60 thao tác, luân phiên số element trong lưới 4×4 để mỗi bước là một bản khác nhau.
    for (let i = 2; i <= 60; i += 1) useEditorStore.getState().apply(mk((i % 15) + 1), `bước ${i}`);
    expect(useEditorStore.getState().undoStack.length).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < 50; i += 1) useEditorStore.getState().undo();
    expect(useEditorStore.getState().canUndo()).toBe(true);
  });

  it("undo/redo khi stack rỗng không ném, không đổi gì", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    expect(() => {
      useEditorStore.getState().undo();
      useEditorStore.getState().redo();
    }).not.toThrow();
    expect(realCells(useEditorStore.getState().draft!)).toBe(1);
  });

  it("nhãn bước hiện được ở tooltip nút Hoàn tác/Làm lại", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    st.apply(mk(2), "Bỏ 1 element khỏi sheet main");
    expect(undoLabel(useEditorStore.getState())).toBe("Bỏ 1 element khỏi sheet main");
    useEditorStore.getState().undo();
    expect(redoLabel(useEditorStore.getState())).toBe("Bỏ 1 element khỏi sheet main");
  });
});

describe("selection & canvas", () => {
  it("đổi thứ đang chọn thì bỏ luôn tập ô đang bôi (tránh thao tác nhầm phạm vi)", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(4), 1);
    st.toggleMarkedCell(1);
    st.toggleMarkedCell(2);
    expect(useEditorStore.getState().markedCells).toEqual([1, 2]);
    useEditorStore.getState().select({ kind: "sheet", sheetId: "main" });
    expect(useEditorStore.getState().markedCells).toEqual([]);
  });

  it("bôi chọn bật/tắt được", () => {
    const st = useEditorStore.getState();
    st.toggleMarkedCell(3);
    st.toggleMarkedCell(3);
    expect(useEditorStore.getState().markedCells).toEqual([]);
  });
});

describe("KHÔNG persist (chốt X5: undo sống trong phiên tab)", () => {
  it("không ghi bất cứ khoá nào ra localStorage", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    for (let i = 2; i <= 10; i += 1) useEditorStore.getState().apply(mk(i), `b${i}`);
    expect(Object.keys(mem.dump())).toHaveLength(0);
    expect(mem.dump()[LS_KEYS.ui]).toBeUndefined();
  });

  it("reset dọn sạch để mở project khác không lẫn undo của project cũ", () => {
    const st = useEditorStore.getState();
    st.init("p1", mk(1), 1);
    st.apply(mk(2), "x");
    useEditorStore.getState().reset();
    const s = useEditorStore.getState();
    expect(s.draft).toBeNull();
    expect(s.undoStack).toHaveLength(0);
    expect(s.projectId).toBeNull();
  });
});
