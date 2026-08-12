/**
 * webapp/src/lib/hooks/use-projects.ts — hook cho CRUD project (#7–#18) + thùng rác (#12–#15).
 *
 * OPTIMISTIC UPDATE có ROLLBACK cho những thao tác mà độ trễ làm hỏng cảm giác dùng:
 * đổi tên (§4.2 nói rõ "Optimistic UI: đổi ngay trên màn, có lỗi thì rollback + toast đỏ")
 * và xoá mềm (thẻ biến mất ngay, toast [Hoàn tác 10s]).
 *
 * KHÔNG optimistic cho TẠO và NHÂN BẢN: agent mới là nơi sinh `id` (slug + 4 hex ngẫu
 * nhiên). Bịa một id tạm rồi thay bằng id thật sẽ làm route `/p/:id` nhảy và làm hỏng
 * mọi thứ trỏ vào nó. Thà chờ 200ms.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { api, type ProjectListParams } from "../api/endpoints";
import { qk } from "./keys";
import { GC, STALE } from "./query-client";
import type {
  CleanTarget, CreateProjectInput, DuplicateInput, PatchProjectInput, Project, ProjectList,
} from "../types/api";
/* Bản nháp workflow nằm ở `localStorage`, ngoài tầm với của TanStack Query — nên vòng đời
   của nó phải bám vào đúng hai mutation này (UPGRADE-PLAN §W1-1). Module được nhập là
   file THUẦN, không kéo theo zustand/React vào chunk dùng chung. */
import { dropWorkflowDraft, restoreWorkflowDraft } from "@/features/workflow-v4/lib/draft-storage";

/* ═════════ Đọc ═════════ */

/** #7 — danh sách project. */
export function useProjects(params: ProjectListParams = {}): UseQueryResult<ProjectList> {
  return useQuery({
    queryKey: qk.projects.list(params),
    queryFn: async () => {
      const r = await api.projects.list(params);
      if (r.notModified) throw new Error("unreachable: notModified không có etag cũ");
      return r as ProjectList;
    },
    staleTime: STALE.projects,
    gcTime: GC.projects,
  });
}

/** #9 — chi tiết project. `enabled` để route chưa có id không tự gọi. */
export function useProject(id: string | undefined | null): UseQueryResult<Project> {
  return useQuery({
    queryKey: qk.projects.detail(id ?? ""),
    queryFn: () => api.projects.get(id!),
    enabled: Boolean(id),
    staleTime: STALE.projectDetail,
    gcTime: GC.projects,
  });
}

export function useWorkflowDraft(id: string | undefined | null) {
  return useQuery({ queryKey: qk.projects.workflowDraft(id ?? ""), queryFn: () => api.projects.workflowDraft(id!), enabled: Boolean(id), staleTime: 1_000 });
}

export function useSaveWorkflowDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { completed: boolean; draft: Record<string, unknown> }) => api.projects.saveWorkflowDraft(id, input), onSuccess: data => { qc.setQueryData(qk.projects.workflowDraft(id), data); void qc.invalidateQueries({ queryKey: qk.projects.detail(id) }); } });
}

/** #12 — thùng rác 30 ngày. */
export function useTrash() {
  return useQuery({
    queryKey: qk.trash.list(),
    queryFn: () => api.trash.list(),
    staleTime: STALE.trash,
  });
}

/* ═════════ Ghi ═════════ */

/** #8 — tạo project. Không optimistic (agent sinh id). */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => api.projects.create(input),
    onSuccess: (res) => {
      // Nhét sẵn detail để màn S2/S3 mở ra là có dữ liệu, không chớp skeleton.
      qc.setQueryData(qk.projects.detail(res.project.id), res.project);
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
    },
  });
}

/**
 * #10 — PATCH: OPTIMISTIC + ROLLBACK.
 * Ghi đè cả `detail` và mọi `list` đang cache (thẻ ở S1 phải đổi tên ngay lập tức).
 * `onError` khôi phục nguyên trạng snapshot; `onSettled` invalidate để lấy sự thật.
 */
export function usePatchProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: PatchProjectInput) => api.projects.patch(id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.projects.detail(id) });
      await qc.cancelQueries({ queryKey: qk.projects.lists() });

      const prevDetail = qc.getQueryData<Project>(qk.projects.detail(id));
      const prevLists = qc.getQueriesData<ProjectList>({ queryKey: qk.projects.lists() });

      if (prevDetail) {
        qc.setQueryData<Project>(qk.projects.detail(id), { ...prevDetail, ...stripUndefined(patch) });
      }
      for (const [key, data] of prevLists) {
        if (!data) continue;
        qc.setQueryData<ProjectList>(key, {
          ...data,
          items: data.items.map((p) => (p.id === id ? { ...p, ...stripUndefined(patch) } : p)),
        });
      }
      return { prevDetail, prevLists };
    },
    onError: (_err, _patch, ctx) => {
      // Rollback đúng nguyên trạng — KHÔNG refetch ở đây, vì agent có thể đang tắt và
      // refetch sẽ xoá sạch dữ liệu cache mà §2.5 cần để vẽ chế độ chỉ-đọc.
      if (ctx?.prevDetail) qc.setQueryData(qk.projects.detail(id), ctx.prevDetail);
      for (const [key, data] of ctx?.prevLists ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.projects.detail(id) });
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
    },
  });
}

/**
 * #11 — xoá MỀM: OPTIMISTIC (thẻ biến mất ngay) + ROLLBACK.
 * Trả `trashId` để UI dựng toast [Hoàn tác 10s] gọi `useRestoreProject`.
 */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.projects.lists() });
      const prevLists = qc.getQueriesData<ProjectList>({ queryKey: qk.projects.lists() });
      for (const [key, data] of prevLists) {
        if (!data) continue;
        qc.setQueryData<ProjectList>(key, { ...data, items: data.items.filter((p) => p.id !== id) });
      }
      return { prevLists, id };
    },
    onError: (_e, _id, ctx) => {
      for (const [key, data] of ctx?.prevLists ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (_res, id) => {
      qc.removeQueries({ queryKey: qk.projects.detail(id) });
      // §W1-1: dọn nhánh persist của bộ kit vừa xoá (bản nháp được giữ ở "bia mộ"
      // để nút [Hoàn tác 10s] trả lại được — xem `draft-storage.ts`).
      dropWorkflowDraft(id);
      void qc.invalidateQueries({ queryKey: qk.trash.all() });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
    },
  });
}

/** #13 — Hoàn tác trong 10s, hoặc phục hồi từ S6?tab=trash. */
export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trashId: string) => api.trash.restore(trashId),
    onSuccess: (project) => {
      qc.setQueryData(qk.projects.detail(project.id), project);
      // Hoàn tác xoá thì bản nháp workflow cũng phải quay lại — nếu không, "Hoàn tác"
      // chỉ hoàn tác một nửa và người dùng mất brief đang gõ dở.
      restoreWorkflowDraft(project.id);
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
      void qc.invalidateQueries({ queryKey: qk.trash.all() });
    },
  });
}

/** #14 — xoá VĨNH VIỄN. Không optimistic; agent đối chiếu trashId với projectId. */
export function usePurgeTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ trashId, projectId, confirm }: { trashId: string; projectId: string; confirm: string }) => api.trash.purge(trashId, projectId, confirm),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.trash.all() }),
  });
}

/** #16 — nhân bản. Không optimistic (agent sinh id mới). */
export function useDuplicateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DuplicateInput) => api.projects.duplicate(id, input),
    onSuccess: (res) => {
      qc.setQueryData(qk.projects.detail(res.project.id), res.project);
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
    },
  });
}

/** #17 — dọn cache dẫn xuất (nhóm "tái tạo rẻ" §1.2). */
export function useCleanProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targets: CleanTarget[]) => api.projects.clean(id, targets),
    onSuccess: () => {
      // Dung lượng + state.jobs đổi (kits bị xoá ⇒ nhiều job thành `uncut`).
      void qc.invalidateQueries({ queryKey: qk.projects.detail(id) });
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
      void qc.invalidateQueries({ queryKey: qk.kit.all(id) });
    },
  });
}

/** #21 — mở thư mục trên máy. */
export function useRevealProject(id: string) {
  return useMutation({ mutationFn: (path?: string) => api.projects.reveal(id, path) });
}

/** Bỏ field `undefined` để merge optimistic không xoá mất giá trị đang có. */
function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
