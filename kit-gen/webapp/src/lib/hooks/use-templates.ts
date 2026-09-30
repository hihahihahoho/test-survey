/**
 * webapp/src/lib/hooks/use-templates.ts — TEMPLATE NGƯỜI DÙNG (agent/routes/templates.mjs).
 *
 * Template là dữ liệu cấp WORKSPACE: đổi workspace thì `useActivateWorkspace` đã
 * `qc.clear()` cả cache, nên không cần móc gì thêm ở đây.
 *
 * KHÔNG optimistic cho LƯU: agent sinh id và đếm thẻ/ảnh — bịa trước một dòng rồi thay
 * là để caption «N thẻ · M ảnh» nhảy số ngay dưới mắt người dùng. XOÁ thì có: dòng biến
 * mất ngay khi xác nhận, lỗi thì trả lại đúng chỗ.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { qk } from "./keys";
import type { PatchTemplateInput, SaveTemplateInput, Template, TemplateList } from "../types/api";

/** Danh sách template, mới lưu trước. Agent đời cũ (404) ⇒ rỗng — xem `templatesApi.list`. */
export function useTemplates(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.templates.list(),
    queryFn: () => api.templates.list(),
    enabled: opts.enabled ?? true,
    staleTime: 10_000,
  });
}

/** Chụp một dự án thành template. */
export function useSaveTemplate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveTemplateInput) => api.templates.saveFromProject(projectId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.templates.all() }),
  });
}

/** Đổi tên / mô tả. */
export function usePatchTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: PatchTemplateInput & { id: string }) => api.templates.patch(id, input),
    onSuccess: (template: Template) => {
      qc.setQueryData<TemplateList>(qk.templates.list(), (prev) =>
        prev ? { ...prev, items: prev.items.map((t) => (t.id === template.id ? template : t)) } : prev);
      void qc.invalidateQueries({ queryKey: qk.templates.all() });
    },
  });
}

/** Xoá (mềm, phía agent) — OPTIMISTIC + ROLLBACK. */
export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.templates.remove(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.templates.list() });
      const prev = qc.getQueryData<TemplateList>(qk.templates.list());
      if (prev) qc.setQueryData<TemplateList>(qk.templates.list(), { ...prev, items: prev.items.filter((t) => t.id !== id) });
      return { prev };
    },
    onError: (_error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.templates.list(), ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.templates.all() }),
  });
}
