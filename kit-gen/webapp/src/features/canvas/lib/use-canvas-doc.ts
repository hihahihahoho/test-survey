/**
 * features/canvas/lib/use-canvas-doc.ts — ĐỌC/GHI bàn làm việc qua `docsRepo` (FE2-PLAN §4).
 *
 * MỘT CỬA DUY NHẤT: `docsRepo().load/save`. Không `fetch()`, không localStorage,
 * không Zustand, không adapter thứ hai. Khi #48/#49 lên thì đổi adapter trong
 * `features/docs/lib/docs-repo.ts`, file này và component KHÔNG phải sửa.
 *
 * DÙNG LẠI, KHÔNG VIẾT LẠI: `useLoadingTimeout` + `useDraftBadge` là hàng công khai của
 * nhánh C (`@/features/docs/hooks`). Viết bản thứ hai chỉ để "khỏi phụ thuộc" là đúng
 * kiểu trùng lặp mà FE2-PLAN §0-N2 cấm.
 *
 * PHẠM VI FE-2: hook này KHÔNG tự lưu định kỳ và không có trình soạn node — `save` chỉ
 * được gọi khi màn thật sự có thay đổi để ghi, việc đó thuộc FE-3. Ở FE-2 nó tồn tại để
 * chứng minh đường ghi chạy đúng luật `expectedVersion` (chống đè bản mới hơn).
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { docsRepo, isDocsRepoError, type CanvasDoc, type LoadedCanvas } from "@/features/docs/lib";
import { useLoadingTimeout } from "@/features/docs/hooks";
import { canvasErrorCopy, canvasPhase, type CanvasPhase, type CanvasSaveState } from "./canvas-state";

/** Namespace key riêng của canvas — không giẫm `["docs", …]` của C hay `qk` của R0. */
export const canvasKeys = {
  all: () => ["canvas"] as const,
  doc: (projectId: string, docId: string) => ["canvas", projectId, docId] as const,
};

/** Mã lỗi mà thử lại chắc chắn vẫn hỏng ⇒ hỏng ngay, đừng để người dùng chờ backoff. */
const NO_RETRY = new Set([
  "STORAGE_UNAVAILABLE",
  "NOT_IMPLEMENTED",
  "DOC_NOT_FOUND",
  "DOC_BROKEN",
  "DOC_READONLY",
]);

function retryFinite(failureCount: number, error: Error): boolean {
  if (isDocsRepoError(error) && NO_RETRY.has(error.code)) return false;
  return failureCount < 1;
}

export function useCanvasQuery(
  projectId: string | undefined | null,
  docId: string | undefined | null,
): UseQueryResult<LoadedCanvas, Error> {
  return useQuery({
    queryKey: canvasKeys.doc(projectId ?? "", docId ?? ""),
    queryFn: () => docsRepo().load(projectId!, docId!),
    enabled: Boolean(projectId && docId),
    retry: retryFinite,
    staleTime: 5_000,
    gcTime: 10 * 60_000,
  });
}

export interface CanvasDocModel {
  phase: CanvasPhase;
  canvas: CanvasDoc | null;
  /** = ETag của #48; truyền lại khi ghi (If-Match). */
  version: number;
  errorTitle: string;
  errorDetail?: string;
  refetch: () => void;
  saveState: CanvasSaveState;
  /** Ghi bản canvas mới. Trả `true` nếu ghi được. Không ném ra UI. */
  save: (next: CanvasDoc) => Promise<boolean>;
}

export function useCanvasDoc(
  projectId: string | undefined | null,
  docId: string | undefined | null,
): CanvasDocModel {
  const q = useCanvasQuery(projectId, docId);
  const queryClient = useQueryClient();
  const timedOut = useLoadingTimeout(q.isLoading);
  const [saveState, setSaveState] = useState<CanvasSaveState>("idle");

  /**
   * Version của bản đang giữ (= `ETag` #48, sẽ thành `If-Match` của #49).
   *
   * ⚠️ CHỖ NÀY TỪNG SAI VÀ CÓ TEST CANH: bản đầu viết `if (q.data) ref = q.data.version`.
   * Sau một lần ghi thành công, `saveState` đổi ⇒ render lại ⇒ cache Query VẪN là bản cũ
   * (ta không invalidate vì nội dung trong tay đã là mới nhất) ⇒ dòng đó **kéo version về
   * số cũ**, và lần ghi kế tiếp bị `DOC_CONFLICT` giả. Người dùng sẽ thấy "bản trên máy mới
   * hơn" trong khi chính họ vừa ghi. Test `version tăng theo đúng luật If-Match` bắt đúng ca này.
   *
   * Luật đúng: chỉ nhận số từ query khi nó KHÔNG CŨ HƠN số ta đang giữ; đổi file thì reset.
   */
  const versionRef = useRef(0);
  const keyRef = useRef<string>("");
  const key = `${projectId ?? ""}/${docId ?? ""}`;
  if (keyRef.current !== key) {
    keyRef.current = key;
    versionRef.current = 0;
  }
  if (q.data && q.data.version > versionRef.current) versionRef.current = q.data.version;

  // Con số này chỉ để hiện/kiểm; ghi vẫn đọc `versionRef` (giá trị mới nhất, không trễ render).
  const [, forceVersionRender] = useState(0);

  const copy = canvasErrorCopy(q.error);

  const save = useCallback(
    async (next: CanvasDoc): Promise<boolean> => {
      if (!projectId || !docId) return false;
      setSaveState("saving");
      try {
        const res = await docsRepo().save(projectId, docId, next, versionRef.current);
        versionRef.current = res.version;
        queryClient.setQueryData(canvasKeys.doc(projectId, docId), { canvas: next, version: res.version });
        forceVersionRender(res.version);
        setSaveState("saved");
        return true;
      } catch (err) {
        // Xung đột không phải "lỗi hệ thống": tab khác vừa ghi. Người dùng cần câu khác
        // và hành động khác (mở lại), nên nó có state riêng.
        setSaveState(isDocsRepoError(err) && err.code === "DOC_CONFLICT" ? "conflict" : "error");
        return false;
      }
    },
    [projectId, docId, queryClient],
  );

  return {
    phase: canvasPhase({
      isLoading: q.isLoading,
      timedOut,
      isError: q.isError,
      nodeCount: q.data?.canvas.nodes.length ?? 0,
    }),
    canvas: q.data?.canvas ?? null,
    version: versionRef.current,
    errorTitle: copy.title,
    errorDetail: copy.detail,
    refetch: () => void q.refetch(),
    saveState,
    save,
  };
}
