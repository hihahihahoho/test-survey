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
import * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { keysOfProject, qk } from "./keys";
import type {
  PatchTemplateInput, Project, SaveTemplateInput, Template, TemplateEditInfo, TemplateEditSession, TemplateList,
} from "../types/api";

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

/* ══════════════════════════════════════════════════════════════════════════
   SỬA NỘI DUNG TEMPLATE — một phiên = một dự án làm việc ẩn
   ══════════════════════════════════════════════════════════════════════════ */

/** Thay đúng một dòng trong danh sách đang cache — không có danh sách thì thôi. */
function patchTemplateInList(qc: QueryClient, id: string, patch: (t: Template) => Template) {
  qc.setQueryData<TemplateList>(qk.templates.list(), (prev) =>
    prev ? { ...prev, items: prev.items.map((t) => (t.id === id ? patch(t) : t)) } : prev);
}

/**
 * QUÊN cache của một dự án làm việc đã hết phiên (agent vừa xoá nó).
 *
 * MẶC ĐỊNH CHỈ QUÊN QUERY KHÔNG CÒN AI NGHE (`type: "inactive"`). Lý do: lượt lưu/bỏ bắn
 * từ CHÍNH màn soạn đang mở dự án ấy. Gỡ một query mà màn còn đang nghe thì lượt vẽ lại
 * kế tiếp của màn (chính cái `isPending → false` của mutation) dựng lại query và GỌI LẠI
 * agent — một loạt 404 vào một dự án vừa bị xoá, ngay trước khi màn rời đi. Phần còn
 * sống thì màn tự quên lúc gỡ (`activeToo: true`), khi không còn lượt vẽ nào nữa.
 */
export function forgetTemplateEditProject(qc: QueryClient, projectId: string, opts: { activeToo?: boolean } = {}) {
  for (const queryKey of keysOfProject(projectId)) {
    qc.removeQueries(opts.activeToo ? { queryKey } : { queryKey, type: "inactive" });
  }
}

/**
 * MỞ (hoặc nối lại) phiên sửa. `resumed: true` là câu trả lời của agent, không phải lỗi —
 * nơi gọi phải hỏi người dùng có tiếp tục bản dở không.
 *
 * Gieo sẵn `projects.detail` bằng dự án agent vừa trả: màn soạn đọc `templateEdit` từ đó
 * để vào chế độ sửa template NGAY khung hình đầu, không nháy qua giao diện dự án thường
 * (nút Vẽ, «Lưu làm template») trong lúc chờ một lượt GET.
 */
export function useStartTemplateEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) => api.templates.startEdit(templateId),
    onSuccess: (session: TemplateEditSession) => {
      const pid = session.project.id;
      /* Phiên MỚI dựng ⇒ mọi thứ còn cache dưới id này là của một phiên đã chết. */
      if (!session.resumed) forgetTemplateEditProject(qc, pid);
      qc.setQueryData(qk.projects.detail(pid), session.project);
      patchTemplateInList(qc, session.template.id, () => session.template);
      void qc.invalidateQueries({ queryKey: qk.templates.all() });
    },
  });
}

/** LƯU phiên vào template (agent chép bản soạn TRÊN ĐĨA — nơi gọi phải `persist()` trước). */
export function useCommitTemplateEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId }: { templateId: string; projectId: string }) => api.templates.commitEdit(templateId),
    onSuccess: (template: Template, { projectId }) => {
      patchTemplateInList(qc, template.id, () => ({ ...template, editing: null }));
      forgetTemplateEditProject(qc, projectId);
    },
    /* Cả khi hỏng: 404 «không còn phiên» nghĩa là nhãn «Đang sửa dở» trên thẻ đã sai. */
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.templates.all() }),
  });
}

/** BỎ phiên (xoá dự án làm việc) — template giữ nguyên. `projectId` vắng khi chưa biết. */
export function useDiscardTemplateEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId }: { templateId: string; projectId?: string | null }) => api.templates.discardEdit(templateId),
    onSuccess: (_ok, { templateId, projectId }) => {
      patchTemplateInList(qc, templateId, (t) => ({ ...t, editing: null }));
      if (projectId) forgetTemplateEditProject(qc, projectId);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.templates.all() }),
  });
}

/**
 * «DỰ ÁN NÀY CÓ PHẢI DỰ ÁN LÀM VIỆC CỦA MỘT PHIÊN SỬA TEMPLATE KHÔNG» — và NHỚ câu trả lời.
 *
 * ╔══ VÌ SAO PHẢI NHỚ, KHÔNG ĐỌC THẲNG `project.templateEdit` ═══════════════╗
 * ║ Dự án làm việc BIẾN MẤT đúng lúc màn còn đang đứng trên nó: lưu/bỏ xong  ║
 * ║ (agent xoá nó ngay), hoặc một tab khác vừa bỏ phiên. Lượt GET kế tiếp ra ║
 * ║ 404, `data` rỗng, và đọc thẳng thì màn tụt về giao diện DỰ ÁN THƯỜNG —   ║
 * ║ nút Vẽ, «Lưu làm template», nút quay về «Dự án» — trên một dự án không   ║
 * ║ còn tồn tại, đúng lúc người dùng cần được chỉ đường về «Template dự án». ║
 * ║ Đã thấy một lần cho id này ⇒ giữ tới khi đổi sang id khác.               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function useTemplateEditOf(projectId: string | null | undefined, project: Project | undefined): TemplateEditInfo | null {
  const live = projectId && project?.id === projectId ? project.templateEdit ?? null : null;
  const [seen, setSeen] = React.useState<{ pid: string; info: TemplateEditInfo } | null>(null);
  /* Chỉnh state NGAY trong lượt vẽ (mẫu React khuyên cho "nhớ một giá trị đã thấy"):
     không có khung hình nào hiện chế độ sai trong lúc đợi một effect. */
  if (live && projectId && (seen?.pid !== projectId || seen.info !== live)) setSeen({ pid: projectId, info: live });
  if (live) return live;
  return projectId && seen?.pid === projectId ? seen.info : null;
}
