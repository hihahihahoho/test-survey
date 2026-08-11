/**
 * features/docs/hooks/use-subfile-actions.ts — BỘ ĐIỀU KHIỂN của CRUD file con.
 *
 * Một chỗ duy nhất giữ: dialog nào đang mở, tab nào đang đổi tên, mục nào vừa xoá
 * (để Hoàn tác), và mọi mutation. Component chỉ nhận `ctl` rồi vẽ — nhờ vậy
 * `FileTabsBar` của C1 **không phải sửa một dòng nào**: C2 chỉ cắm vào 4 điểm mà
 * C1 đã chừa (`onCreate`, `onContextMenu`, `allFilesFooter`, `renderTabLabel`).
 *
 * ROUTER-AGNOSTIC như C1: nhận `activeId` + `onActivate`, không biết URL (E1 nối).
 *
 * BỐN QUYẾT ĐỊNH:
 *
 * ① **Không optimistic update cho xoá.** `DeleteProjectDialog` của S1 xoá lạc quan
 *    được vì hook R0 có rollback và server thật. Ở đây kho lưu là IndexedDB trên máy:
 *    `remove` xong trong vài ms, còn xoá lạc quan lại mở ra đúng khe hở của C-01
 *    (UI tin là đã xoá trong khi tầng dưới chưa xong). Chờ `await` rồi mới đổi tab.
 *
 * ② **Hoàn tác đo bằng MỐC THỜI GIAN, không bằng việc toast còn hiển thị.**
 *    Toast tự tắt sau 10s, nhưng nếu người dùng bấm [Hoàn tác] đúng lúc giao nhau thì
 *    `undoStillOpen()` là trọng tài. Hết hạn ⇒ không im lặng: chỉ sang Thùng rác.
 *
 * ③ **Hoàn tác CÓ THỂ THẤT BẠI và ta nói thật** (bài học C-01, `DeleteProjectDialog` §5):
 *    ví dụ trong 10 giây đó người dùng đã tạo file mới trùng tên ⇒ repo trả
 *    `DOC_NAME_TAKEN`. Khi đó báo "chưa phục hồi được" + nút [Xem thùng rác] —
 *    file vẫn còn nguyên trong đó, không mất.
 *
 * ④ **F2 / Mod+D / Delete bắt ở tầng cửa sổ nhưng CHỈ khi focus đang ở một tab.**
 *    Bắt rộng hơn sẽ nuốt phím của trình soạn thảo bên dưới; bắt hẹp hơn (trên chính
 *    nút tab) thì phải sửa `FileTab.tsx` — file C1 đã bàn giao, không đụng.
 */
import * as React from "react";
import { toast, KG_TOAST_DURATION } from "@/components/ui/sonner";
import {
  useCreateDoc, useDuplicateDoc, useRemoveDoc, useRenameDoc, useRestoreDoc, useSetDocColor,
  docErrorDetail, docErrorTitle,
} from "./use-doc-mutations";
import { useDocsList } from "./use-docs";
import {
  UNDO_WINDOW_MS, checkDocName, isEditableDoc, safeIdAfterDelete, undoStillOpen,
  type UndoEntry,
} from "../lib/subfile-actions";
import { ALL_SHEETS_DOC_ID, type CreateDocInput, type Doc, type DocColor } from "../lib";

/** Vị trí mở menu ngữ cảnh. `null` = menu đóng. */
export interface MenuAt {
  docId: string;
  x: number;
  y: number;
}

export interface RenameState {
  docId: string;
  value: string;
  error: string | null;
  pending: boolean;
}

export interface SubfileActions {
  docs: Doc[];
  /** id sheet của contract — dialog tạo file workflow chọn từ đây. */
  sheetIds: readonly string[];
  createOpen: boolean;
  openCreate: () => void;
  closeCreate: () => void;
  submitCreate: (input: CreateDocInput) => Promise<void>;
  createPending: boolean;
  createError: unknown;

  menu: MenuAt | null;
  openMenu: (docId: string, at: { x: number; y: number }) => void;
  closeMenu: () => void;

  rename: RenameState | null;
  beginRename: (docId: string) => void;
  changeRename: (value: string) => void;
  commitRename: () => Promise<void>;
  cancelRename: () => void;

  duplicate: (docId: string) => Promise<void>;
  setColor: (docId: string, color: DocColor) => Promise<void>;

  deleteTarget: Doc | null;
  requestDelete: (docId: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  deletePending: boolean;
  deleteError: unknown;

  trashOpen: boolean;
  setTrashOpen: (open: boolean) => void;
  restore: (docId: string) => Promise<void>;
  restorePending: boolean;

  /** Thứ hiện trong «Chi tiết cho lập trình viên» — KHÔNG bao giờ ra thân UI. */
  detailOf: (err: unknown) => string;
  titleOf: (err: unknown) => string;
}

export interface UseSubfileActionsInput {
  projectId: string;
  contractSheetIds: readonly string[];
  activeId: string;
  onActivate: (id: string) => void;
}

export function useSubfileActions(input: UseSubfileActionsInput): SubfileActions {
  const { projectId, contractSheetIds, activeId, onActivate } = input;

  const list = useDocsList(projectId);
  const docs = React.useMemo(() => list.data ?? [], [list.data]);

  const create = useCreateDoc(projectId);
  const renameM = useRenameDoc(projectId);
  const dup = useDuplicateDoc(projectId);
  const color = useSetDocColor(projectId);
  const remove = useRemoveDoc(projectId);
  const restoreM = useRestoreDoc(projectId);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [menu, setMenu] = React.useState<MenuAt | null>(null);
  const [rename, setRename] = React.useState<RenameState | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [trashOpen, setTrashOpen] = React.useState(false);
  const undoRef = React.useRef<UndoEntry | null>(null);

  const docById = React.useCallback((id: string) => docs.find((d) => d.id === id) ?? null, [docs]);

  /* ── Hoàn tác ─────────────────────────────────────────────────────────── */

  const doRestore = React.useCallback(
    async (docId: string) => {
      try {
        const d = await restoreM.mutateAsync(docId);
        onActivate(d.id);
        toast.success(`Đã phục hồi «${d.name}»`, { duration: KG_TOAST_DURATION.success });
      } catch (err) {
        // C-01: KHÔNG hứa suông. Nói thật là chưa phục hồi được và chỉ đúng chỗ file đang nằm.
        toast.error(docErrorTitle(err), {
          description: "File vẫn nằm trong Thùng rác của dự án — bạn mở lại từ đó được.",
          duration: KG_TOAST_DURATION.error,
          action: { label: "Xem thùng rác", onClick: () => setTrashOpen(true) },
        });
      }
    },
    [restoreM, onActivate],
  );

  const undoDelete = React.useCallback(() => {
    const entry = undoRef.current;
    if (!undoStillOpen(entry, Date.now())) {
      toast.info("Hết thời gian hoàn tác", {
        description: "File vẫn nằm trong Thùng rác 30 ngày — phục hồi được từ đó.",
        duration: KG_TOAST_DURATION.info,
      });
      setTrashOpen(true);
      return;
    }
    void doRestore(entry!.docId);
  }, [doRestore]);

  /* ── Tạo ──────────────────────────────────────────────────────────────── */

  const submitCreate = React.useCallback(
    async (payload: CreateDocInput) => {
      try {
        const d = await create.mutateAsync(payload);
        setCreateOpen(false);
        onActivate(d.id);
        toast.success(`Đã tạo file «${d.name}»`, {
          description: "File này đang được lưu trên máy bạn.",
          duration: KG_TOAST_DURATION.success,
        });
      } catch {
        /* GIỮ dialog mở và hiện lỗi INLINE qua `createError` (§5.5). KHÔNG để lời hứa
           vỡ ra ngoài: một unhandled rejection ở đây từng làm bộ test in "Unhandled
           Error" và trong app thật thì nó nổi lên `window.onunhandledrejection`. */
      }
    },
    [create, onActivate],
  );

  /* ── Đổi tên tại chỗ ──────────────────────────────────────────────────── */

  const beginRename = React.useCallback(
    (docId: string) => {
      const d = docById(docId);
      if (!d || !isEditableDoc(docId)) return;
      setMenu(null);
      setRename({ docId, value: d.name, error: null, pending: false });
    },
    [docById],
  );

  const changeRename = React.useCallback(
    (value: string) => {
      setRename((r) => {
        if (!r) return r;
        const check = checkDocName(value, docs, r.docId);
        return { ...r, value, error: value.trim() === "" ? null : check.error };
      });
    },
    [docs],
  );

  const commitRename = React.useCallback(async () => {
    const r = rename;
    if (!r) return;
    const check = checkDocName(r.value, docs, r.docId);
    if (!check.ok) {
      setRename({ ...r, error: check.error });
      return;
    }
    if (check.value === docById(r.docId)?.name) {
      setRename(null);
      return;
    }
    setRename({ ...r, pending: true });
    try {
      await renameM.mutateAsync({ docId: r.docId, name: check.value });
      setRename(null);
    } catch (err) {
      setRename({ ...r, pending: false, error: docErrorTitle(err) });
    }
  }, [rename, docs, docById, renameM]);

  const cancelRename = React.useCallback(() => setRename(null), []);

  /* ── Nhân bản / màu nhãn ──────────────────────────────────────────────── */

  const duplicate = React.useCallback(
    async (docId: string) => {
      setMenu(null);
      try {
        const d = await dup.mutateAsync(docId);
        onActivate(d.id);
        toast.success(`Đã nhân bản thành «${d.name}»`, {
          description: "Chỉ danh sách sheet và ghi chú được sao — ảnh và bản thiết kế vẫn dùng chung.",
          duration: KG_TOAST_DURATION.success,
        });
      } catch (err) {
        toast.error(docErrorTitle(err), { duration: KG_TOAST_DURATION.error });
      }
    },
    [dup, onActivate],
  );

  const setColor = React.useCallback(
    async (docId: string, c: DocColor) => {
      setMenu(null);
      try {
        await color.mutateAsync({ docId, color: c });
      } catch (err) {
        toast.error(docErrorTitle(err), { duration: KG_TOAST_DURATION.error });
      }
    },
    [color],
  );

  /* ── Xoá mềm + toast Hoàn tác 10s ─────────────────────────────────────── */

  const requestDelete = React.useCallback((docId: string) => {
    if (!isEditableDoc(docId)) return;
    setMenu(null);
    setDeleteId(docId);
  }, []);

  const confirmDelete = React.useCallback(async () => {
    if (!deleteId) return;
    const target = docById(deleteId);
    if (!target) return;
    try {
      await remove.mutateAsync(deleteId);
      undoRef.current = { docId: deleteId, name: target.name, at: Date.now() };
      setDeleteId(null);
      // Không trắng trang: nếu vừa xoá đúng file đang mở thì chuyển sang file an toàn.
      onActivate(safeIdAfterDelete(deleteId, activeId, docs, ALL_SHEETS_DOC_ID));
      toast.success(`Đã xoá file «${target.name}»`, {
        description: "Sheet, ảnh và kit không bị đụng tới. File nằm trong Thùng rác 30 ngày.",
        duration: KG_TOAST_DURATION.successWithUndo, // = UNDO_WINDOW_MS, có test khoá
        action: { label: "Hoàn tác", onClick: undoDelete },
      });
    } catch {
      /* giữ dialog mở; lỗi hiện INLINE trong dialog qua `deleteError` (§5.5) */
    }
  }, [deleteId, docById, remove, onActivate, activeId, docs, undoDelete]);

  /* ── Phím tắt: chỉ khi focus đang đứng trên một tab ────────────────────── */

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const id = el?.id ?? "";
      if (!id.startsWith("kg-tab-")) return;
      const docId = id.slice("kg-tab-".length);
      if (!isEditableDoc(docId)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "F2" && !mod) {
        e.preventDefault();
        beginRename(docId);
      } else if (mod && (e.key === "d" || e.key === "D") && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        void duplicate(docId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
        e.preventDefault();
        requestDelete(docId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [beginRename, duplicate, requestDelete]);

  return {
    docs,
    sheetIds: contractSheetIds,
    createOpen,
    openCreate: () => setCreateOpen(true),
    closeCreate: () => setCreateOpen(false),
    submitCreate,
    createPending: create.isPending,
    createError: create.error,

    menu,
    openMenu: (docId, at) => setMenu({ docId, ...at }),
    closeMenu: () => setMenu(null),

    rename,
    beginRename,
    changeRename,
    commitRename,
    cancelRename,

    duplicate,
    setColor,

    deleteTarget: deleteId ? docById(deleteId) : null,
    requestDelete,
    cancelDelete: () => setDeleteId(null),
    confirmDelete,
    deletePending: remove.isPending,
    deleteError: remove.error,

    trashOpen,
    setTrashOpen,
    restore: doRestore,
    restorePending: restoreM.isPending,

    detailOf: docErrorDetail,
    titleOf: docErrorTitle,
  };
}

export { UNDO_WINDOW_MS };
