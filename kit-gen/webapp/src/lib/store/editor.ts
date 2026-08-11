/**
 * webapp/src/lib/store/editor.ts — CLIENT STATE của trình soạn S3: selection + undo/redo.
 *
 * KHÔNG PERSIST (chốt X5 tầng 1): "Undo/Redo trong editor ⌘Z/⇧⌘Z, ≥50 bước, **sống trong
 * phiên tab**". Ba tầng hoàn tác khác nhiệm vụ:
 *   1. undo/redo trong phiên tab   ← FILE NÀY
 *   2. nháp tự lưu IDB mỗi 2s      ← tầng khác (IndexedDB), khôi phục sau khi đóng tab
 *   3. lịch sử bản lưu phía agent  ← #24/#25/#26
 * Vì contract có thể 55 KB+, đưa 50 bước undo vào localStorage là chắc chắn vỡ quota —
 * đó là lý do kỹ thuật, ngoài lý do đúng-spec.
 */
import { create } from "zustand";
import type { Contract } from "../types/contract";

export type EditorTab = "sheets" | "styles" | "advanced";

/** Thứ đang chọn ở vùng ① → quyết định panel ③ vẽ dạng nào (S3.4: 4 dạng panel). */
export type Selection =
  | { kind: "none" }
  | { kind: "sheet"; sheetId: string }
  | { kind: "component"; sheetId: string; index: number }
  | { kind: "character"; characterId: string }
  | { kind: "variant"; variantId: string };

interface UndoEntry {
  contract: Contract;
  /** nhãn hiện khi hover nút Hoàn tác: "Bỏ 1 element khỏi sheet main". */
  label: string;
}

/** ≥50 bước là yêu cầu của X5; để 100 cho thoải mái, vẫn nằm gọn trong RAM. */
const UNDO_LIMIT = 100;

export interface EditorState {
  projectId: string | null;
  tab: EditorTab;
  selection: Selection;
  /** phong cách đang xem ở canvas ② (không phải phong cách đang sửa ở tab styles). */
  previewVariantId: string | null;
  /** tab xem của canvas: khung xương / ảnh đã sinh / đã cắt. */
  canvasLayer: "skeleton" | "raw" | "kit";
  /** ô đang bôi chọn (⇧click chọn nhiều) — index trong `components`. */
  markedCells: number[];

  /** Bản đang sửa. `null` = chưa nạp. */
  draft: Contract | null;
  /** version của bản trên đĩa lúc nạp — dùng làm `If-Match` khi lưu (#23). */
  baseVersion: number;
  dirty: boolean;
  /** số thao tác kể từ lần lưu cuối — nút hiện "Lưu (3)" (§3.7). */
  dirtyCount: number;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];

  init: (projectId: string, contract: Contract, version: number) => void;
  setTab: (t: EditorTab) => void;
  select: (s: Selection) => void;
  setPreviewVariant: (id: string | null) => void;
  setCanvasLayer: (l: "skeleton" | "raw" | "kit") => void;
  toggleMarkedCell: (i: number) => void;
  clearMarked: () => void;

  /** Thay contract kèm nhãn cho undo. Đây là ĐƯỜNG DUY NHẤT sửa `draft`. */
  apply: (next: Contract, label: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Sau khi PUT thành công: nhận version mới, xoá dấu bẩn, GIỮ undo stack. */
  markSaved: (version: number) => void;
  /** Sau khi tải lại từ đĩa (CONTRACT_CONFLICT → [Tải lại]): reset sạch. */
  reset: () => void;
}

const emptySelection: Selection = { kind: "none" };

export const useEditorStore = create<EditorState>((set, get) => ({
  projectId: null,
  tab: "sheets",
  selection: emptySelection,
  previewVariantId: null,
  canvasLayer: "skeleton",
  markedCells: [],
  draft: null,
  baseVersion: 0,
  dirty: false,
  dirtyCount: 0,
  undoStack: [],
  redoStack: [],

  init: (projectId, contract, version) =>
    set({
      projectId,
      draft: contract,
      baseVersion: version,
      dirty: false,
      dirtyCount: 0,
      undoStack: [],
      redoStack: [],
      selection: emptySelection,
      markedCells: [],
    }),

  setTab: (tab) => set({ tab }),
  select: (selection) => set({ selection, markedCells: [] }),
  setPreviewVariant: (previewVariantId) => set({ previewVariantId }),
  setCanvasLayer: (canvasLayer) => set({ canvasLayer }),
  toggleMarkedCell: (i) =>
    set((s) => ({
      markedCells: s.markedCells.includes(i) ? s.markedCells.filter((x) => x !== i) : [...s.markedCells, i],
    })),
  clearMarked: () => set({ markedCells: [] }),

  apply: (next, label) => {
    const cur = get().draft;
    if (cur === null) {
      set({ draft: next, dirty: true, dirtyCount: 1 });
      return;
    }
    set((s) => ({
      draft: next,
      dirty: true,
      dirtyCount: s.dirtyCount + 1,
      undoStack: [...s.undoStack, { contract: cur, label }].slice(-UNDO_LIMIT),
      // Làm việc mới sau khi undo ⇒ nhánh redo cũ không còn ý nghĩa.
      redoStack: [],
    }));
  },

  undo: () => {
    const { undoStack, draft } = get();
    const prev = undoStack[undoStack.length - 1];
    if (!prev || draft === null) return;
    set((s) => ({
      draft: prev.contract,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, { contract: draft, label: prev.label }].slice(-UNDO_LIMIT),
      dirty: true,
      dirtyCount: Math.max(0, s.dirtyCount - 1),
    }));
  },

  redo: () => {
    const { redoStack, draft } = get();
    const nextEntry = redoStack[redoStack.length - 1];
    if (!nextEntry || draft === null) return;
    set((s) => ({
      draft: nextEntry.contract,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, { contract: draft, label: nextEntry.label }].slice(-UNDO_LIMIT),
      dirty: true,
      dirtyCount: s.dirtyCount + 1,
    }));
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  markSaved: (version) => set({ baseVersion: version, dirty: false, dirtyCount: 0 }),

  reset: () =>
    set({
      projectId: null, draft: null, baseVersion: 0, dirty: false, dirtyCount: 0,
      undoStack: [], redoStack: [], selection: emptySelection, markedCells: [],
    }),
}));

/** Nhãn của bước sẽ được hoàn tác — hiện ở tooltip nút [↺ Hoàn tác] (§3.7). */
export function undoLabel(s: Pick<EditorState, "undoStack">): string | null {
  return s.undoStack[s.undoStack.length - 1]?.label ?? null;
}
export function redoLabel(s: Pick<EditorState, "redoStack">): string | null {
  return s.redoStack[s.redoStack.length - 1]?.label ?? null;
}
