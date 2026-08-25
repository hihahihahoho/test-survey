/**
 * webapp/src/lib/hooks/use-contract.ts — hook cho bản thiết kế (#22–#28) + ảnh ref (#29–#31).
 *
 * ĐIỂM QUAN TRỌNG NHẤT: xử lý 409 `CONTRACT_CONFLICT` thành **trạng thái dùng được cho UI**
 * chứ không phải một cục lỗi. §3.4 đòi modal so sánh 2 cột với 3 nút:
 * [Ghi đè bằng bản của tôi] · [Tải lại bản trên đĩa] · [Lưu thành bản sao].
 * Hook `useSaveContract` trả về `conflict` đã gồm đủ dữ liệu để dựng modal đó, và
 * `resolveConflict` thực hiện đúng 3 lựa chọn. Bản nháp của user KHÔNG BAO GIỜ bị xoá
 * khi lưu thất bại (§3.4 "error (lưu thất bại khác)": *"thay đổi của bạn vẫn còn trên máy này"*).
 */
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { AgentError } from "../api/client";
import { qk, keysAfterContractSave } from "./keys";
import { GC, STALE } from "./query-client";
import { contractConflictDetailsSchema, type ContractConflictDetails, type RefKind } from "../types/api";
import type { Contract } from "../types/contract";

/** #22 */
export function useContract(projectId: string | undefined | null) {
  return useQuery({
    queryKey: qk.contract.current(projectId ?? ""),
    queryFn: () => api.contract.get(projectId!),
    enabled: Boolean(projectId),
    staleTime: STALE.contract,
    gcTime: GC.contract,
  });
}

/** #24 — 50 bản lưu, cho drawer "Lịch sử bản thiết kế". */
export function useContractHistory(projectId: string | undefined | null, limit = 50) {
  return useQuery({
    queryKey: qk.contract.history(projectId ?? ""),
    queryFn: () => api.contract.history(projectId!, limit),
    enabled: Boolean(projectId),
    staleTime: STALE.history,
  });
}

/** #25 — một bản lịch sử cụ thể (để [Xem diff]). */
export function useContractSnapshot(projectId: string | undefined | null, snapshot: string | null) {
  return useQuery({
    queryKey: qk.contract.snapshot(projectId ?? "", snapshot ?? ""),
    queryFn: () => api.contract.snapshot(projectId!, snapshot!),
    enabled: Boolean(projectId && snapshot),
    staleTime: Infinity, // bản lịch sử là bất biến
  });
}

/** Trạng thái xung đột — đủ dữ liệu để dựng modal so sánh 2 cột của §3.4. */
export interface ConflictState {
  /** version của bản trên đĩa (lớn hơn version ta cầm). */
  serverVersion: number;
  serverHash: string | null;
  /** tóm tắt khác biệt để hiện "bản trên đĩa có thêm 2 sheet, bớt 1". */
  diffSummary: { added: number; removed: number };
  /** bản của user — KHÔNG bị mất, để nút [Ghi đè bằng bản của tôi] còn thứ mà ghi. */
  mine: Contract;
  /** version mà user đã cầm khi bắt đầu sửa. */
  myBaseVersion: number;
}

export type ConflictResolution = "overwrite" | "reload" | "fork";

/**
 * #23 — lưu contract. `If-Match` luôn được gửi (ép ở endpoints.ts).
 *
 * Trả thêm:
 *  · `conflict`        — `null` hoặc `ConflictState` dùng để mở modal
 *  · `resolveConflict` — thực hiện 1 trong 3 lựa chọn của §3.4
 *  · `dismissConflict` — đóng modal mà không làm gì (bản nháp vẫn còn)
 */
export function useSaveContract(projectId: string) {
  const qc = useQueryClient();
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const mutation = useMutation({
    mutationFn: ({ version, contract }: { version: number; contract: Contract }) =>
      api.contract.save(projectId, version, contract),
    onMutate: () => {
      setConflict(null);
    },
    onSuccess: () => {
      for (const key of keysAfterContractSave(projectId)) void qc.invalidateQueries({ queryKey: key });
    },
    onError: (err, vars) => {
      // 409 KHÔNG phải "lỗi" theo nghĩa hỏng — nó là một TÌNH HUỐNG có 3 lối ra.
      if (err instanceof AgentError && err.code === "CONTRACT_CONFLICT") {
        const parsed = contractConflictDetailsSchema.safeParse(err.details);
        const d: ContractConflictDetails | null = parsed.success ? parsed.data : null;
        setConflict({
          serverVersion: d?.serverVersion ?? vars.version + 1,
          serverHash: d?.serverHash ?? null,
          diffSummary: { added: d?.diffSummary?.added ?? 0, removed: d?.diffSummary?.removed ?? 0 },
          mine: vars.contract,
          myBaseVersion: vars.version,
        });
      }
      // Mọi lỗi khác: KHÔNG đụng vào state của editor. Bản nháp của user còn nguyên.
    },
  });

  /**
   * Ba lối ra của modal §3.4:
   *  · overwrite — PUT lại với `If-Match = serverVersion`: giữ bản của tôi, đè bản trên đĩa.
   *                Bản cũ vẫn nằm trong `.history/contract/` phía agent nên không mất gì.
   *  · reload    — bỏ bản của tôi, lấy bản trên đĩa. Gọi hàm này xong màn phải `init()` lại editor.
   *  · fork      — "Lưu thành bản sao": tầng này chỉ trả bản của tôi + version server;
   *                việc tạo project mới do màn gọi `useDuplicateProject` quyết định,
   *                vì nó cần tên do user đặt (§4.3).
   */
  const resolveConflict = useCallback(
    async (choice: ConflictResolution) => {
      const c = conflict;
      if (!c) return null;
      if (choice === "overwrite") {
        const r = await mutation.mutateAsync({ version: c.serverVersion, contract: c.mine });
        setConflict(null);
        return r;
      }
      if (choice === "reload") {
        setConflict(null);
        const fresh = await qc.fetchQuery({
          queryKey: qk.contract.current(projectId),
          queryFn: () => api.contract.get(projectId),
        });
        return fresh;
      }
      // fork: trả nguyên liệu cho màn xử lý, không tự ý tạo gì.
      setConflict(null);
      return { fork: true as const, contract: c.mine, serverVersion: c.serverVersion };
    },
    [conflict, mutation, projectId, qc],
  );

  return {
    ...mutation,
    conflict,
    resolveConflict,
    dismissConflict: useCallback(() => setConflict(null), []),
  };
}

/** #26 — khôi phục từ lịch sử: tạo bản MỚI, không ghi đè lịch sử. */
export function useRestoreContract(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshot: string) => api.contract.restore(projectId, snapshot),
    onSuccess: () => {
      for (const key of keysAfterContractSave(projectId)) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** #27 — dry-run validate ở agent (đóng K5). Client cũng validate bằng zod trước đó. */
export function useValidateContract(projectId: string) {
  return useMutation({ mutationFn: (contract: Contract) => api.contract.validate(projectId, contract) });
}

/**
 * #29 — PROMPT STUDIO: xem nguyên văn prompt engine sẽ gửi.
 *
 * `useMutation` chứ KHÔNG phải `useQuery`, và đó là lựa chọn về hành vi chứ không về
 * gõ code: mỗi lần xem là agent chạy engine thật (vài giây) và **ghi đè `prompts/` của
 * project**. Query thì tự chạy lại khi component mount lại / cửa sổ lấy lại focus —
 * tức là một tác dụng phụ trên đĩa xảy ra sau lưng người dùng. Ở đây chỉ chạy khi có
 * người bấm nút.
 *
 * KHÔNG `invalidate` gì cả: bản xem trước không đổi contract, không đổi run, không
 * đổi kit. Lỗi (409 RUN_ACTIVE, 422 CONTRACT_INVALID / PROMPT_PREVIEW_FAILED) để
 * nguyên `AgentError` cho màn dịch — xem `features/workflow-v4/lib/prompt-studio.ts`.
 */
export function usePromptPreview(projectId: string) {
  return useMutation({ mutationFn: (contract: Contract) => api.contract.promptPreview(projectId, contract) });
}

/** #28 — catalogue chỉ đọc, cache 1 giờ. */
export function useElementLib() {
  return useQuery({
    queryKey: qk.elementLib(),
    queryFn: () => api.elementLib.get(),
    staleTime: STALE.elementLib,
    gcTime: GC.default,
  });
}

/* ═════════ Ảnh tham khảo (#29–#31) ═════════ */

export function useRefs(projectId: string | undefined | null) {
  return useQuery({
    queryKey: qk.refs.list(projectId ?? ""),
    queryFn: () => api.refs.list(projectId!),
    enabled: Boolean(projectId),
    staleTime: STALE.refs,
  });
}

/** #30 — multipart, agent tự đặt tên (đóng A4, G1, G5). */
export function useAddRef(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, kind, hintName }: { file: File; kind: RefKind; hintName?: string }) =>
      api.refs.add(projectId, file, kind, hintName),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.refs.all(projectId) }),
  });
}

/** #31 — 409 REF_IN_USE ⇒ UI hiện [Xem chỗ dùng] [Vẫn xoá] (`force: true`). */
export function useRemoveRef(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, force }: { name: string; force?: boolean }) =>
      api.refs.remove(projectId, name, { force: force ?? false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.refs.all(projectId) });
      void qc.invalidateQueries({ queryKey: qk.contract.all(projectId) });
    },
  });
}
