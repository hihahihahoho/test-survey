/**
 * features/docs/hooks/use-doc-mutations.ts — GHI dữ liệu file con, qua ĐÚNG MỘT CỬA `docsRepo()`.
 *
 * Không component nào của C2 được gọi `docsRepo()` thẳng: mọi thao tác ghi đi qua đây để
 * (a) invalidate đúng một chỗ, (b) không màn nào quên bật lại danh sách sau khi ghi,
 * (c) đổi adapter `local → http` sau #43–#49 chỉ phải sửa `docs-repo.ts`.
 *
 * HAI LUẬT VỀ LỖI (FE2-PLAN §0-N5 + ràng buộc cứng của brief):
 *  · KHÔNG retry thao tác GHI. Retry `create` có thể tạo hai file; retry `remove` thì vô
 *    nghĩa vì lỗi kho lưu là vĩnh viễn trong phiên. Thà báo ngay còn hơn im lặng thử lại.
 *  · Câu cho người dùng lấy từ `DocsRepoError.message` (bảng tĩnh `docs-errors.ts`);
 *    mã lỗi kỹ thuật chỉ đi qua `docErrorDetail()` để đổ vào «Chi tiết cho lập trình viên».
 *
 * KHÔNG có mutation `purge`/`deleteForever`: UI của C2 cố ý không cấp đường xoá vĩnh viễn.
 * Chỉ có `usePurgeExpiredDocs` — dọn thứ đã quá 30 ngày, chạy khi mở thùng rác.
 */
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { docsKeys, useDocsList } from "./use-docs";
import {
  docsRepo,
  isDocsRepoError,
  type CreateDocInput,
  type Doc,
  type DocColor,
} from "../lib";

/** Chuỗi cho panel «Chi tiết cho lập trình viên» — chỗ DUY NHẤT được chứa từ kỹ thuật. */
export function docErrorDetail(err: unknown): string {
  if (isDocsRepoError(err)) return `${err.code}${err.detail ? `: ${err.detail}` : ""}`;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/** Câu đời thường cho thân UI. KHÔNG BAO GIỜ trả `error.message` của lỗi lạ. */
export function docErrorTitle(err: unknown): string {
  if (isDocsRepoError(err)) return err.message;
  return "Chưa lưu được thay đổi cho file này. Ảnh và bản thiết kế của dự án không bị ảnh hưởng.";
}

function useInvalidateDocs(projectId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: docsKeys.ofProject(projectId) });
  };
}

export function useCreateDoc(projectId: string): UseMutationResult<Doc, Error, CreateDocInput> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: (input: CreateDocInput) => docsRepo().create(projectId, input),
    retry: false,
    onSuccess: invalidate,
  });
}

export function useRenameDoc(
  projectId: string,
): UseMutationResult<Doc, Error, { docId: string; name: string }> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: ({ docId, name }: { docId: string; name: string }) =>
      docsRepo().rename(projectId, docId, name),
    retry: false,
    onSuccess: invalidate,
  });
}

export function useDuplicateDoc(projectId: string): UseMutationResult<Doc, Error, string> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: (docId: string) => docsRepo().duplicate(projectId, docId),
    retry: false,
    onSuccess: invalidate,
  });
}

export function useSetDocColor(
  projectId: string,
): UseMutationResult<Doc, Error, { docId: string; color: DocColor }> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: ({ docId, color }: { docId: string; color: DocColor }) =>
      docsRepo().setColor(projectId, docId, color),
    retry: false,
    onSuccess: invalidate,
  });
}

/**
 * XOÁ MỀM. `remove` của repo chỉ đặt `trashedAt` — nó không có, và không được có,
 * đường nào chạm tới contract/sheet/ảnh/kit hay huỷ run (C-01). Kiểm bằng grep ở report.
 */
export function useRemoveDoc(
  projectId: string,
): UseMutationResult<{ trashedAt: string }, Error, string> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: (docId: string) => docsRepo().remove(projectId, docId),
    retry: false,
    onSuccess: invalidate,
  });
}

/** Đường lùi của «Hoàn tác 10s» VÀ của nút Phục hồi trong thùng rác — cùng một hàm repo. */
export function useRestoreDoc(projectId: string): UseMutationResult<Doc, Error, string> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: (docId: string) => docsRepo().restore(projectId, docId),
    retry: false,
    onSuccess: invalidate,
  });
}

/** Dọn thứ đã quá 30 ngày. Trả số bản ghi đã dọn để UI nói thật thay vì im lặng. */
export function usePurgeExpiredDocs(projectId: string): UseMutationResult<number, Error, void> {
  const invalidate = useInvalidateDocs(projectId);
  return useMutation({
    mutationFn: () => docsRepo().purgeExpired(projectId),
    retry: false,
    onSuccess: invalidate,
  });
}

/** Danh sách CÓ CẢ thùng rác — chỉ popover Thùng rác cần, nên tách khỏi `useDocsList`. */
export function useTrashedDocs(projectId: string | undefined | null, enabled = true) {
  const q = useDocsList(enabled ? projectId : null, { includeTrashed: true });
  return q;
}
