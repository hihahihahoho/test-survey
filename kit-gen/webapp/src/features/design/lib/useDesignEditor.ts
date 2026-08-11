/**
 * features/design/lib/useDesignEditor.ts — BỘ NÃO của S3: nối store ↔ hook dữ liệu ↔ UI.
 *
 * Tách khỏi `DesignScreen.tsx` để màn chỉ còn lo bố cục (luật ~400 dòng), và để
 * `DesignApi` — thứ R2-P2/R2-P3 phụ thuộc vào — có một chỗ duy nhất sinh ra.
 *
 * BỐN ĐIỂM CẨN THẬN:
 *  1. Contract nạp MỘT LẦN vào store; đổi tab KHÔNG nạp lại (§3-S3 "loading": *"contract
 *     chỉ nạp 1 lần, đổi tab không loading lại"*). Vì vậy `init()` chỉ chạy khi
 *     `projectId` hoặc version trên đĩa đổi, KHÔNG chạy mỗi lần render.
 *  2. Khi user đang sửa dở (dirty) mà query refetch xong, TUYỆT ĐỐI không đè lên
 *     `draft` — đó là mất việc của user. Chỉ nhận bản mới khi đang sạch.
 *  3. `save()` chặn khi còn lỗi (§3.4) và khi read-only. Lỗi lưu KHÔNG xoá state.
 *  4. `beforeunload` gắn ĐÚNG MỘT LẦN ở đây (§3.7 / audit B5); R2-P2 đừng gắn thêm.
 */
import * as React from "react";
import { useContract, useElementLib, useProject, useRefs, useSaveContract } from "@/lib/hooks";
import { useEditorStore, type EditorTab, type Selection } from "@/lib/store";
import type { ConnectionStatus } from "@/lib/api";
import { contractVariants, type Contract } from "@/lib/types/contract";
import { useNarrowViewport } from "@/features/projects/lib/gate";
import type { DesignApi } from "../contracts";
import type { Op } from "./ops";
import { validateDesign, type Target, type ValidationResult } from "./validate";

/** Lý do chỉ-đọc theo ĐÚNG ca kết nối — nói sai nguyên nhân thì user đi sửa nhầm chỗ. */
const READ_ONLY_REASON: Record<string, string> = {
  "agent-not-running": "Cần công cụ local đang chạy để sửa bản thiết kế",
  "blocked-by-browser": "Trình duyệt đang chặn kết nối tới máy bạn",
  "agent-http-error": "Công cụ local từ chối trang này",
  "unreachable-ambiguous": "Chưa gọi được công cụ local",
  "protocol-mismatch": "Công cụ local khác phiên bản",
  checking: "Đang kiểm tra công cụ local…",
};

export interface UseDesignEditorResult {
  api: DesignApi;
  /** trạng thái nạp — màn chọn giữa loading / error / empty / success. */
  phase: "loading" | "error" | "ready";
  loadError: unknown;
  refetch: () => void;
  /** dữ liệu phụ trợ cho panel & canvas */
  refNames: string[];
  extraShapes: string[];
  libIndex: Map<string, { spec?: string; skel?: Record<string, unknown> }>;
  projectState: { jobs: Record<string, string>; stale: boolean };
  /** để R2-P2 dựng modal xung đột */
  conflict: ReturnType<typeof useSaveContract>["conflict"];
  resolveConflict: ReturnType<typeof useSaveContract>["resolveConflict"];
  dismissConflict: () => void;
  savedAt: Date | null;
  /** cờ cho slot nháp của R2-P2 — bắn mỗi khi contract đổi (đã debounce 2s). */
  draftTick: number;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undo: () => void;
  redo: () => void;
}

export function useDesignEditor(
  projectId: string,
  status: ConnectionStatus,
  tab: EditorTab,
  setTab: (t: EditorTab) => void,
): UseDesignEditorResult {
  const contractQ = useContract(projectId);
  const projectQ = useProject(projectId);
  const refsQ = useRefs(projectId);
  const libQ = useElementLib();
  const saver = useSaveContract(projectId);

  const store = useEditorStore();
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [draftTick, setDraftTick] = React.useState(0);

  /* ── 1. Nạp contract MỘT LẦN ────────────────────────────────────────────── */
  const initedRef = React.useRef<string>("");
  React.useEffect(() => {
    const data = contractQ.data;
    if (!data) return;
    const key = `${projectId}:${data.version}`;
    if (initedRef.current === key) return;
    // Đang sửa dở ⇒ KHÔNG đè. Bản mới trên đĩa là việc của modal "file đổi bên ngoài"
    // (R2-P2), không phải của một lần refetch âm thầm.
    if (store.dirty && store.projectId === projectId) return;
    initedRef.current = key;
    store.init(projectId, data.contract, data.version);
  }, [contractQ.data, projectId, store]);

  /* ── 2. Nháp: bắn nhịp 2s cho R2-P2 (màn KHÔNG tự ghi IDB) ──────────────── */
  React.useEffect(() => {
    if (!store.dirty) return;
    const t = setTimeout(() => setDraftTick((n) => n + 1), 2000);
    return () => clearTimeout(t);
  }, [store.draft, store.dirty]);

  /* ── 3. beforeunload khi bẩn (đóng audit B5) — MỘT chỗ duy nhất ─────────── */
  React.useEffect(() => {
    if (!store.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [store.dirty]);

  /* ── 4. Dữ liệu phụ trợ ─────────────────────────────────────────────────── */
  const refNames = React.useMemo(() => (refsQ.data?.items ?? []).map((r) => r.name), [refsQ.data]);
  const libElements = libQ.data?.elements ?? [];
  const extraShapes = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of libElements) {
      const s = (e.skel as { shape?: unknown } | undefined)?.shape;
      if (typeof s === "string" && s !== "") set.add(s);
    }
    return [...set];
  }, [libElements]);
  const libIndex = React.useMemo(() => {
    const m = new Map<string, { spec?: string; skel?: Record<string, unknown> }>();
    for (const e of libElements) {
      m.set(e.file, { spec: e.spec, skel: (e.skel ?? {}) as Record<string, unknown> });
    }
    return m;
  }, [libElements]);

  const projectState = React.useMemo(
    () => ({
      jobs: (projectQ.data?.state?.jobs ?? {}) as Record<string, string>,
      stale: Boolean(projectQ.data?.state?.stale),
    }),
    [projectQ.data],
  );

  /* ── 5. Validate — chạy lại khi contract hoặc danh sách ref đổi ─────────── */
  const validation: ValidationResult = React.useMemo(
    () =>
      validateDesign(store.draft, {
        // Chỉ đưa refNames vào khi ĐÃ tải xong: thiếu dữ liệu mà báo "ảnh không còn"
        // là vu oan (V-08 chặn lưu, hậu quả nặng).
        refNames: refsQ.isSuccess ? refNames : null,
        extraShapes,
      }),
    [store.draft, refNames, refsQ.isSuccess, extraShapes],
  );

  /* ── 6. Chỉ-đọc ─────────────────────────────────────────────────────────── */
  /* Màn hẹp (<768px) là CHỈ-ĐỌC THẬT — audit M5. Bố cục 3 vùng của S3 không dùng được
     ở bề rộng đó; cho bấm nút ghi là mời user làm hỏng dữ liệu trên một bố cục vỡ. */
  const narrow = useNarrowViewport();
  const readOnly = narrow || !status.connected || status.readOnly || status.pill === "checking";
  const readOnlyReason = !readOnly
    ? ""
    : narrow
      ? "Màn hình nhỏ: chỉ xem, không sửa"
      : (READ_ONLY_REASON[status.case] ?? "Chưa gọi được công cụ local");

  /* ── 7. Hành động ───────────────────────────────────────────────────────── */
  const apply = React.useCallback(
    (op: Op) => {
      if (op.label === "") return; // không có gì đổi ⇒ không đẩy bước undo rỗng
      store.apply(op.contract, op.label);
      if (op.focus) store.select(op.focus);
    },
    [store],
  );

  const replaceContract = React.useCallback(
    (contract: Contract, opts: { label?: string; markDirty?: boolean; version?: number } = {}) => {
      if (opts.markDirty === false) {
        store.init(projectId, contract, opts.version ?? store.baseVersion);
        initedRef.current = `${projectId}:${opts.version ?? store.baseVersion}`;
        return;
      }
      store.apply(contract, opts.label ?? "Khôi phục bản thiết kế");
    },
    [projectId, store],
  );

  const activeSheetId = React.useMemo(() => {
    const sel = store.selection;
    if (sel.kind === "sheet" || sel.kind === "component") return sel.sheetId;
    return store.draft?.sheets[0]?.id ?? null;
  }, [store.selection, store.draft]);

  const setActiveSheet = React.useCallback(
    (sheetId: string) => store.select({ kind: "sheet", sheetId }),
    [store],
  );

  const goToTarget = React.useCallback(
    (t: Target) => {
      if (t.kind === "element") {
        setTab("sheets");
        store.select({ kind: "component", sheetId: t.sheetId, index: t.index });
        return;
      }
      if (t.kind === "sheet") {
        setTab("sheets");
        store.select({ kind: "sheet", sheetId: t.sheetId });
        return;
      }
      if (t.kind === "variant") {
        setTab("styles");
        store.select({ kind: "variant", variantId: t.variantId });
        return;
      }
      if (t.kind === "character") {
        setTab("sheets");
        store.select({ kind: "character", characterId: t.characterId });
      }
    },
    [setTab, store],
  );

  const blockedReason = readOnly
    ? readOnlyReason
    : validation.errors.length > 0
      ? validation.errors.length === 1
        ? "Còn 1 lỗi phải sửa trước khi lưu."
        : `Còn ${validation.errors.length} lỗi phải sửa trước khi lưu.`
      : null;

  const save = React.useCallback(async (): Promise<boolean> => {
    const draft = useEditorStore.getState().draft;
    if (!draft || blockedReason !== null || !useEditorStore.getState().dirty) return false;
    const version = useEditorStore.getState().baseVersion;
    const res = await saver.mutateAsync({ version, contract: draft });
    useEditorStore.getState().markSaved(res.version);
    initedRef.current = `${projectId}:${res.version}`;
    setSavedAt(new Date());
    return true;
  }, [blockedReason, projectId, saver]);

  const api: DesignApi = {
    projectId,
    contract: store.draft,
    baseVersion: store.baseVersion,
    dirty: store.dirty,
    dirtyCount: store.dirtyCount,
    readOnly,
    readOnlyReason,
    apply,
    replaceContract,
    selection: store.selection,
    select: store.select as (s: Selection) => void,
    activeSheetId,
    setActiveSheet,
    validation,
    goToTarget,
    save,
    saving: saver.isPending,
    tab,
    setTab,
  };

  const phase: "loading" | "error" | "ready" =
    contractQ.isLoading && !store.draft ? "loading" : contractQ.isError && !store.draft ? "error" : "ready";

  return {
    api,
    phase,
    loadError: contractQ.error,
    refetch: () => void contractQ.refetch(),
    refNames,
    extraShapes,
    libIndex,
    projectState,
    conflict: saver.conflict,
    resolveConflict: saver.resolveConflict,
    dismissConflict: saver.dismissConflict,
    savedAt,
    draftTick,
    canUndo: store.undoStack.length > 0,
    canRedo: store.redoStack.length > 0,
    undoLabel: store.undoStack[store.undoStack.length - 1]?.label ?? null,
    redoLabel: store.redoStack[store.redoStack.length - 1]?.label ?? null,
    undo: store.undo,
    redo: store.redo,
  };
}

/** Phong cách mặc định để xem ở canvas (§3-S3.3 selector). */
export function defaultPreviewVariant(contract: Contract | null): string | null {
  return contractVariants(contract ?? { sheets: [], characterPoses: [] })[0]?.id ?? null;
}

/** Export cho test đọc bảng lý do chỉ-đọc mà không phải nhân bản chuỗi. */
export const __internals = { READ_ONLY_REASON };
