/**
 * webapp/src/features/design/library/lib/useLibrary.ts
 * ────────────────────────────────────────────────────────────────────────────
 * TOÀN BỘ trạng thái của drawer thư viện, gom vào một hook để component chỉ còn
 * việc vẽ (và để logic test được ở môi trường "node", không cần DOM).
 *
 * Dữ liệu vào qua `useElementLib()` của R0 (#28) — KHÔNG fetch trực tiếp (§6.5-1).
 */
import * as React from "react";
import { useElementLib } from "@/lib/hooks";
import { suggestedSheetId } from "./contract";
import {
  buildViews, filterViews, fromAgentLib, groupOptions, loadBundledV2, sourceAvailability, usedByFileMap,
  type NormalizedLib,
} from "./source";
import type { LibElementView, LibSourceId } from "./types";

export interface UseLibraryOptions {
  /** Sheet đích (do R2-P1 truyền xuống) — dùng để đánh dấu "● đã có trong sheet". */
  targetSheetId: string | null;
  existingFiles: readonly string[];
  /** drawer đang mở? Query chỉ chạy khi mở — thư viện 42 món không cần nạp sớm. */
  open: boolean;
}

export interface UseLibraryResult {
  source: LibSourceId;
  setSource: (s: LibSourceId) => void;
  sourceAvailable: Record<LibSourceId, boolean>;

  /* 4 trạng thái */
  isLoading: boolean;
  /** lỗi #28. Bản v2 đóng gói vẫn dùng được ⇒ KHÔNG phải ngõ cụt. */
  error: unknown;
  refetch: () => void;
  /** element bị bỏ vì dữ liệu hỏng — hiện cảnh báo thay vì nuốt im lặng */
  skipped: NormalizedLib["skipped"];

  /* lọc + tìm */
  query: string;
  setQuery: (q: string) => void;
  group: string;
  setGroup: (g: string) => void;
  groups: ReturnType<typeof groupOptions>;
  visible: LibElementView[];
  total: number;

  /* chọn */
  picked: ReadonlySet<string>;
  toggle: (file: string, on: boolean) => void;
  clearPicked: () => void;
  pickAllVisible: () => void;
  pickedElements: LibElementView[];

  /* đích thêm */
  toNewSheet: boolean;
  setToNewSheet: (v: boolean) => void;
  /** tên sheet mới gợi ý theo `sheetHint` — chỉ để hiện chữ. */
  suggestedNewSheetId: string | undefined;
}

export function useLibrary({ targetSheetId, existingFiles, open }: UseLibraryOptions): UseLibraryResult {
  const q = useElementLib();

  const [source, setSource] = React.useState<LibSourceId>("agent");
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState("all");
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(() => new Set());
  /** Không có sheet nào đang mở ⇒ chỉ còn đường tạo sheet mới. */
  const [toNewSheet, setToNewSheet] = React.useState(targetSheetId === null);

  const agentLib = React.useMemo(() => fromAgentLib(q.data), [q.data]);
  const v2Lib = React.useMemo(() => loadBundledV2(), []);
  const sourceAvailable = React.useMemo(() => sourceAvailability(agentLib), [agentLib]);

  /* Agent chưa chạy / #28 lỗi ⇒ tự chuyển sang bản đóng gói thay vì đưa ra ngõ cụt.
     Chỉ tự đổi MỘT LẦN, sau đó không giành quyền chọn của user nữa. */
  const autoSwitched = React.useRef(false);
  React.useEffect(() => {
    if (autoSwitched.current || q.isLoading) return;
    if (source === "agent" && agentLib.elements.length === 0 && v2Lib.elements.length > 0) {
      autoSwitched.current = true;
      setSource("v2");
    }
  }, [q.isLoading, agentLib.elements.length, v2Lib.elements.length, source]);

  /* Drawer đóng: quên lựa chọn cũ. Mở lần sau mà còn tick 3 món từ lần trước là bẫy —
     user bấm "Thêm" tưởng thêm 1 hoá ra 4. */
  React.useEffect(() => {
    if (!open) {
      setPicked(new Set());
      setQuery("");
    }
  }, [open]);

  React.useEffect(() => {
    if (targetSheetId === null) setToNewSheet(true);
  }, [targetSheetId]);

  const active: NormalizedLib = source === "v2" ? v2Lib : agentLib;
  const usedBy = React.useMemo(
    () => usedByFileMap(targetSheetId === null ? [] : [{ id: targetSheetId, files: existingFiles }]),
    [targetSheetId, existingFiles],
  );
  const views = React.useMemo(() => buildViews(active.elements, { usedByFile: usedBy }), [active.elements, usedBy]);
  const groups = React.useMemo(() => groupOptions(views), [views]);
  const visible = React.useMemo(() => filterViews(views, { query, group }), [views, query, group]);

  /* Nhóm đang lọc không còn ở nguồn mới ⇒ về "tất cả", không để danh sách rỗng bí ẩn. */
  React.useEffect(() => {
    if (group !== "all" && !groups.some((g) => g.key === group)) setGroup("all");
  }, [groups, group]);

  const pickedElements = React.useMemo(() => views.filter((v) => picked.has(v.file)), [views, picked]);
  const suggestedNewSheetId = React.useMemo(() => suggestedSheetId(pickedElements), [pickedElements]);

  const toggle = React.useCallback((file: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(file);
      else next.delete(file);
      return next;
    });
  }, []);

  const pickAllVisible = React.useCallback(() => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const v of visible) next.add(v.file);
      return next;
    });
  }, [visible]);

  const clearPicked = React.useCallback(() => setPicked(new Set()), []);

  return {
    source, setSource, sourceAvailable,
    isLoading: q.isLoading,
    error: q.error,
    refetch: () => void q.refetch(),
    skipped: active.skipped,
    query, setQuery, group, setGroup, groups, visible, total: views.length,
    picked, toggle, clearPicked, pickAllVisible, pickedElements,
    toNewSheet, setToNewSheet, suggestedNewSheetId,
  };
}
