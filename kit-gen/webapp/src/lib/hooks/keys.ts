/**
 * webapp/src/lib/hooks/keys.ts — QUERY KEY FACTORY.
 *
 * Một chỗ duy nhất sinh key ⇒ `invalidateQueries` không bao giờ trượt vì gõ sai chuỗi.
 * Cấu trúc phân cấp cho phép huỷ hiệu lực theo TẦNG:
 *
 *   qk.projects.all()            → mọi thứ thuộc project (list + detail + con)
 *   qk.projects.lists()          → chỉ các danh sách (mọi bộ lọc)
 *   qk.projects.detail(id)       → một project
 *   qk.contract.all(id)          → contract + lịch sử của project đó
 *   qk.runs.ofProject(id)        → danh sách lượt chạy của project
 *
 * Quy ước: mảng key luôn bắt đầu bằng namespace, rồi tới scope, rồi tham số.
 * KHÔNG bao giờ nhét object tham số vào giữa — nó phá tiền tố của `invalidateQueries`.
 */
import type { ProjectListParams } from "../api/endpoints";

export const qk = {
  /** #1 — endpoint duy nhất được gọi định kỳ. */
  health: () => ["health"] as const,
  /** #2 — CẤM poll; staleTime 60s ở hook. */
  doctor: () => ["doctor"] as const,
  update: () => ["update"] as const,
  workspaces: () => ["workspaces"] as const,

  projects: {
    all: () => ["projects"] as const,
    lists: () => ["projects", "list"] as const,
    list: (params: ProjectListParams = {}) =>
      ["projects", "list", { q: params.q ?? "", tag: params.tag ?? "", sort: params.sort ?? "" }] as const,
    details: () => ["projects", "detail"] as const,
    detail: (id: string) => ["projects", "detail", id] as const,
  },

  trash: {
    all: () => ["trash"] as const,
    list: () => ["trash", "list"] as const,
  },

  contract: {
    all: (projectId: string) => ["contract", projectId] as const,
    current: (projectId: string) => ["contract", projectId, "current"] as const,
    history: (projectId: string) => ["contract", projectId, "history"] as const,
    snapshot: (projectId: string, snapshot: string) => ["contract", projectId, "history", snapshot] as const,
  },

  elementLib: () => ["element-lib"] as const,

  refs: {
    all: (projectId: string) => ["refs", projectId] as const,
    list: (projectId: string) => ["refs", projectId, "list"] as const,
  },

  runs: {
    all: () => ["runs"] as const,
    ofProject: (projectId: string) => ["runs", "project", projectId] as const,
    detail: (runId: string) => ["runs", "detail", runId] as const,
    jobLog: (runId: string, job: string) => ["runs", "detail", runId, "log", job] as const,
    jobPrompt: (runId: string, job: string) => ["runs", "detail", runId, "prompt", job] as const,
    rawHistory: (projectId: string, job: string) => ["runs", "raw-history", projectId, job] as const,
  },

  kit: {
    all: (projectId: string) => ["kit", projectId] as const,
    variant: (projectId: string, variant?: string) => ["kit", projectId, variant ?? "__all__"] as const,
  },

  /**
   * FE-3·S0 đóng nợ EVIDENCE-FE2 §7-#7 (xin bởi NEEDS-fe2-c N1 · -e N4 · -b B2-2).
   *
   * ⚠️ KHÁC MỌI NAMESPACE TRÊN: `docs` KHÔNG phải endpoint của agent. 42 route thật
   * không có route nào chứa `/docs` (BA-V3 §5.1) — đây là kho nội dung bàn làm việc
   * chạy trên IndexedDB của trình duyệt (`features/docs/lib/docs-repo.ts`, cửa mock
   * hợp lệ theo FE3-PLAN §4). Key nằm ở đây để `invalidateQueries` có MỘT cửa, không
   * phải để ngụ ý backend đã tồn tại.
   *
   * Hình dạng chép NGUYÊN VĂN `docsKeys` mà `features/docs/hooks/use-docs.ts` đang
   * dùng, để đổi import là việc một dòng và không phải sửa component nào. Có test
   * canh hai bên bằng nhau từng phần tử (`keys-docs.test.ts`) — nếu ai đổi một bên
   * mà quên bên kia thì test đỏ, chứ không âm thầm lệch cache.
   *
   * Khi `#43–#49` lên thật (PROPOSED P3), chủ `features/docs` đổi sang `qk.docs` và
   * xoá `docsKeys` cục bộ. S0 KHÔNG tự đổi import vì `features/docs/**` ngoài glob S0.
   */
  docs: {
    all: () => ["docs"] as const,
    ofProject: (projectId: string) => ["docs", projectId] as const,
    list: (projectId: string, includeTrashed = false) =>
      ["docs", projectId, "list", includeTrashed ? "with-trash" : "active"] as const,
    storage: () => ["docs", "storage"] as const,
  },
} as const;

/**
 * Sau khi một lượt chạy kết thúc, những thứ này CHẮC CHẮN cũ:
 * project (state.jobs + stats đổi), danh sách run, và thư viện kit (nếu có pha cắt).
 * Gom vào một hàm để không nơi nào quên một cái.
 */
export function keysAfterRun(projectId: string) {
  return [
    qk.projects.detail(projectId),
    qk.projects.lists(),
    qk.runs.ofProject(projectId),
    qk.kit.all(projectId),
  ] as const;
}

/** Sau khi lưu contract: contract + lịch sử + project (version/stats/stale đổi). */
export function keysAfterContractSave(projectId: string) {
  return [
    qk.contract.all(projectId),
    qk.projects.detail(projectId),
    qk.projects.lists(),
  ] as const;
}
